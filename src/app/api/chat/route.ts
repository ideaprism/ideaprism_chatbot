import { NextResponse } from "next/server";

import {
  CHAT_EFFORT,
  MAX_AI_CALLS_PER_SESSION,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ROUNDS,
} from "@/lib/ai/config";
import { resolveProvider } from "@/lib/ai/provider";
import { AiError, type AiMessage, type AiToolResult } from "@/lib/ai/types";
import { castAt, normalizeCast } from "@/lib/cast";
import { isCharacterId, normalizeEmotion } from "@/lib/characters";
import { handoffEnterText, operatingRulesTemplate, stageMission } from "@/lib/flow";
import { saveNote } from "@/lib/notes/repository";
import { loadCast } from "@/lib/prompts/cast";
import { loadPersona } from "@/lib/prompts/persona";
import {
  buildSystemPrompt,
  compactHistory,
  createEmotionParser,
  handoffTurn,
  normalizeHistory,
  OFF_TOPIC_LIMIT,
  openingTurn,
  revisitTurn,
  userTurnWithBriefing,
  type ParsedChunk,
  type TurnContext,
} from "@/lib/prompt";
import { trackOf } from "@/lib/quest";
import { stageAt } from "@/lib/track";
import { isSessionState, noteDigest } from "@/lib/session";
import { executeTool } from "@/lib/tool-handlers";
import { isToolName, toolsForStage } from "@/lib/tools";
import { mergeStageUsage } from "@/lib/usage";
import type { ChatEvent, ChatRequest, SessionState } from "@/types/chat";

// personas/*.txt 를 파일로 읽으므로 Node 런타임이 필요하다 (Edge 불가)
export const runtime = "nodejs";
export const maxDuration = 60;

/** 최근 몇 턴을 그대로 보낼지 (PRD F-7 대화 압축) */
const MAX_HISTORY_TURNS = 24;

function sse(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return fail("요청 형식이 올바르지 않습니다.");
  }

  if (!isSessionState(body.session)) return fail("세션 정보가 올바르지 않습니다.");

  let session: SessionState = body.session;

  // 이번 대화에 쓸 모델 회사를 정한다. 세션이 정한 곳을 그대로 쓰되,
  // 키가 없으면 키가 있는 곳으로 넘어간다. (PRD 7장: 대화 도중 교체 금지)
  const resolved = resolveProvider(session.provider);
  if (!resolved) {
    return fail(
      "AI 키가 하나도 설정되지 않았습니다. .env.local 에 ANTHROPIC_API_KEY, " +
        "OPENAI_API_KEY, GEMINI_API_KEY 중 하나 이상을 넣고 개발 서버를 다시 시작해 주세요.",
      500,
    );
  }

  const { adapter } = resolved;
  if (session.provider !== adapter.id) {
    session = { ...session, provider: adapter.id };
  }

  // 비용 가드 (PRD 8장). Anthropic 콘솔 등의 월 한도와 이중으로 건다.
  if (session.aiCalls >= MAX_AI_CALLS_PER_SESSION) {
    return fail(
      `이번 대화에서 쓸 수 있는 횟수(${MAX_AI_CALLS_PER_SESSION}번)를 다 썼어요. ` +
        "지금까지 적은 발명노트는 그대로 있으니, 노트를 확인하거나 새로 시작해 주세요.",
      429,
    );
  }

  // 대화구조(단계 → 담당)는 세션이 붙들고 간다. 오래된 세션에는 없으므로 지금 설정으로 채운다.
  // 대화 도중 대표님이 관리자에서 배치를 바꿔도, 이 대화는 원래 만나던 사람과 끝까지 간다.
  session = {
    ...session,
    cast: session.cast ? normalizeCast(session.cast) : await loadCast(),
  };

  // 이 대화가 밟고 있는 학습 프로그램. 단계 이름·대본·도구가 전부 여기서 나온다
  const track = trackOf(session.quest);
  const stage = stageAt(track, session.quest.currentStage);
  // 지금 이 자리에 있는 목소리들 — 짝지어 준 친구들 + 불려 온 전문가(손님).
  // 첫 번째가 이 단계를 이끈다.
  const crew = castAt(session.cast, session.quest.currentStage);
  const guest = session.guest && !crew.includes(session.guest) ? session.guest : null;
  const voices = guest ? [...crew, guest] : crew;
  const characterId = voices[0];

  let personas: string[];
  try {
    personas = await Promise.all(voices.map((id) => loadPersona(id)));
  } catch (error) {
    console.error("[chat] 페르소나 로딩 실패", error);
    return fail(`페르소나 파일을 읽지 못했습니다 (${voices.join(", ")}).`, 500);
  }

  // 대화 흐름 지침은 flow/*.md 에서 읽는다 (대표님이 직접 고치는 파일).
  // 파일이 없거나 잘못돼도 코드에 든 기본 문구로 조용히 되돌아간다.
  const [rulesTemplate, mission] = await Promise.all([
    operatingRulesTemplate(),
    stageMission(session.quest.currentStage, track),
  ]);

  const ctx: TurnContext = {
    quest: session.quest,
    character: characterId,
    nickname: session.nickname,
    offTopicCount: session.offTopicCount,
    noteDigest: noteDigest(session.notes, track),
    search: session.search,
    patent: session.patent,
    mission,
  };

  // 이번 턴 대본에 "발명 이야기로 되돌리기" 안내가 들어갔는가.
  // 들어갔다면 안내를 했다는 뜻이므로, 이탈 횟수는 0에서 다시 센다. (PRD F-8)
  const redirected = session.offTopicCount >= OFF_TOPIC_LIMIT;

  const history = normalizeHistory(
    compactHistory(
      (body.history ?? [])
        .filter((turn) => turn.text.trim().length > 0)
        .map<AiMessage>((turn) =>
          turn.role === "user"
            ? { role: "user", content: turn.text }
            : { role: "assistant", content: turn.text },
        ),
      MAX_HISTORY_TURNS,
    ),
  );

  const opener =
    body.intent === "handoff"
      ? handoffTurn(
          ctx,
          await handoffEnterText(
            body.handoffFrom ?? null,
            characterId,
            session.quest.currentStage,
            track,
          ),
        )
      : body.intent === "revisit"
        ? revisitTurn(ctx, body.revisitFrom ?? session.quest.currentStage)
        : openingTurn(ctx);

  const messages: AiMessage[] = [
    ...history,
    body.message && body.message.trim()
      ? userTurnWithBriefing(body.message.trim(), ctx)
      : opener,
  ];

  const system = buildSystemPrompt(
    characterId,
    personas[0],
    rulesTemplate,
    voices.slice(1).map((id, index) => ({ id, personaText: personas[index + 1] })),
  );
  const tools = toolsForStage(session.quest.currentStage, track);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emotionParser = createEmotionParser();
      /**
       * 지금 이 턴에 말할 수 있는 사람들.
       * 턴 도중에 call_expert 로 손님이 오면 늘어난다 — 안 그러면 부른 그 턴에
       * 손님이 남의 얼굴로 말하게 된다. (대본은 다음 턴부터 들어온다)
       */
      let liveVoices = [...voices];
      /** 지금 말하고 있는 사람. 여럿이면 [말:id] 로 바뀐다 */
      let speaker = characterId;
      /** 방금 내보낸 감정. 같은 감정이 잇달아 나오면 화면을 쪼갤 이유가 없다 */
      let lastEmotion: string | null = null;
      /** 학생 화면에 실제로 글자가 나갔는가 */
      let textSent = false;
      /** 이번 턴에 AI가 표시한 주제 이탈 횟수 (PRD F-8) */
      let offTopicSeen = 0;

      const send = (event: ChatEvent) => {
        if (event.type === "text" && event.delta) textSent = true;
        controller.enqueue(encoder.encode(sse(event)));
      };

      /**
       * 파서가 돌려준 조각을 **나온 순서 그대로** 흘려보낸다.
       * 순서가 곧 "어느 문단에 어느 그림을 붙일지"라서, 감정을 몰아 보내면 안 된다.
       */
      const relay = (parsed: ParsedChunk) => {
        offTopicSeen += parsed.offTopic;
        for (const part of parsed.parts) {
          if (part.kind === "text") {
            if (part.text) send({ type: "text", delta: part.text });
            continue;
          }

          if (part.kind === "speaker") {
            // 이 단계에 없는 사람 이름을 적어 냈으면 버린다 (아키텍처 원칙 4)
            if (!isCharacterId(part.speaker) || !liveVoices.includes(part.speaker)) continue;
            if (part.speaker === speaker) continue;
            speaker = part.speaker;
            lastEmotion = null; // 감정 이름은 사람마다 다르다 — 새로 시작한다
            send({ type: "speaker", character: speaker });
            continue;
          }

          const emotion = normalizeEmotion(speaker, part.emotion);
          if (emotion === lastEmotion) continue;
          lastEmotion = emotion;
          send({ type: "emotion", emotion, character: speaker });
        }
      };

      const usage = { input: 0, output: 0, cacheRead: 0 };
      /** 이번 턴에 노트나 단계가 바뀌었는가 — 바뀐 턴에만 저장한다 */
      let noteDirty = false;
      /** 도구를 계속 부르다 상한에 걸려 끝났는가 (= 마무리 말이 없는 상태) */
      let ranOutOfRounds = false;

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          // 도구 루프 안에서도 세션 상한을 지킨다 (한 턴에 여러 번 부르므로)
          if (session.aiCalls >= MAX_AI_CALLS_PER_SESSION) {
            ranOutOfRounds = true;
            break;
          }
          session = { ...session, aiCalls: session.aiCalls + 1 };

          const result = await adapter.streamTurn(
            {
              system,
              messages,
              tools,
              maxTokens: MAX_OUTPUT_TOKENS,
              effort: CHAT_EFFORT,
            },
            (event) => {
              if (event.type !== "text") return;
              relay(emotionParser.push(event.delta));
            },
          );

          usage.input += result.usage.input;
          usage.output += result.usage.output;
          usage.cacheRead += result.usage.cacheRead;

          // raw 에는 어댑터가 다음 턴에 되쓸 원본이 들어 있다
          // (Claude의 생각 블록처럼 그대로 돌려줘야 하는 것들)
          messages.push({
            role: "assistant",
            content: result.text,
            toolCalls: result.toolCalls,
            raw: result.raw,
          });

          if (result.stopReason !== "tool_use") break;

          const results: AiToolResult[] = [];

          for (const call of result.toolCalls) {
            if (call.name === "update_note" || call.name === "complete_stage") {
              noteDirty = true;
            }
            const toolName = isToolName(call.name) ? call.name : null;
            if (toolName) send({ type: "tool", name: toolName, status: "start" });

            const outcome = await executeTool(call.name, call.input, session);
            session = outcome.session;
            for (const extra of outcome.events) send(extra);

            // 손님이 오갔으면 이 턴부터 바로 말할 수 있게 해 준다
            liveVoices = session.guest ? [...crew, session.guest] : [...crew];
            if (!liveVoices.includes(speaker)) {
              speaker = characterId;
              lastEmotion = null;
            }

            if (toolName) {
              send({
                type: "tool",
                name: toolName,
                status: "done",
                note: outcome.isError ? outcome.result : undefined,
              });
            }

            results.push({
              id: call.id,
              name: call.name,
              content: outcome.result,
              isError: outcome.isError,
            });
          }

          messages.push({ role: "tool", results });

          if (round === MAX_TOOL_ROUNDS - 1) ranOutOfRounds = true;
        }

        relay(emotionParser.flush());

        // 도구만 계속 부르다 끝나면 학생 화면에 아무 말도 남지 않는다.
        // 빈 말풍선 대신 상황을 알려 준다.
        if (ranOutOfRounds && !textSent) {
          send({
            type: "text",
            delta:
              "음… 자료를 찾다가 시간이 좀 걸렸어. 방금 한 이야기를 한 번만 더 말해 줄래?",
          });
        }

        if (!lastEmotion) {
          send({
            type: "emotion",
            emotion: normalizeEmotion(speaker, null),
            character: speaker,
          });
        }

        // 주제 이탈 카운터 갱신. 환기를 이미 안내한 턴이었다면 0에서 다시 센다.
        session = {
          ...session,
          offTopicCount: (redirected ? 0 : session.offTopicCount) + offTopicSeen,
          stageUsage: mergeStageUsage(session.stageUsage, stage.id, usage),
        };

        // 발명노트 저장은 뒷일이다. 실패해도 대화를 끊지 않고 서버 로그에만 남긴다.
        if (noteDirty) {
          const saved = await saveNote(session);
          if (!saved.ok) console.warn("[chat] 발명노트 저장 실패:", saved.detail);
        }

        send({ type: "state", session });
        send({ type: "done", usage, provider: adapter.id, model: adapter.model });
      } catch (error) {
        console.error(`[chat] ${adapter.id} 응답 실패`, error);
        const message =
          error instanceof AiError
            ? error.message
            : `${adapter.label} 응답에 실패했습니다. 잠시 후 다시 시도해 주세요. ` +
              (error instanceof Error ? `(${error.message})` : "");
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

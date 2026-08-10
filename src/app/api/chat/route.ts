import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import {
  CHAT_EFFORT,
  CHAT_MODEL,
  MAX_AI_CALLS_PER_SESSION,
  MAX_OUTPUT_TOKENS,
  MAX_TOOL_ROUNDS,
} from "@/lib/ai/config";
import { normalizeEmotion } from "@/lib/characters";
import { saveNote } from "@/lib/notes/repository";
import { loadPersona } from "@/lib/personas";
import {
  buildSystemBlocks,
  compactHistory,
  createEmotionParser,
  handoffTurn,
  normalizeHistory,
  OFF_TOPIC_LIMIT,
  openingTurn,
  userTurnWithBriefing,
  type TurnContext,
} from "@/lib/prompt";
import { STAGES } from "@/lib/quest";
import { isSessionState, noteDigest } from "@/lib/session";
import { executeTool } from "@/lib/tool-handlers";
import { isToolName, toolsForStage } from "@/lib/tools";
import { mergeStageUsage } from "@/lib/usage";
import type { ChatEvent, ChatRequest, SessionState } from "@/types/chat";

// personas/*.txt 를 파일로 읽으므로 Node 런타임이 필요하다 (Edge 불가)
export const runtime = "nodejs";
export const maxDuration = 60;

/** 최근 몇 턴을 그대로 보낼지 (PRD F-7 대화 압축의 1차 방어선) */
const MAX_HISTORY_TURNS = 24;

function sse(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(
      "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일에 키를 넣고 개발 서버를 다시 시작해 주세요.",
      500,
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return fail("요청 형식이 올바르지 않습니다.");
  }

  if (!isSessionState(body.session)) return fail("세션 정보가 올바르지 않습니다.");

  let session: SessionState = body.session;

  // 비용 가드 (PRD 8장). Anthropic 콘솔의 월 한도와 이중으로 건다.
  if (session.aiCalls >= MAX_AI_CALLS_PER_SESSION) {
    return fail(
      `이번 대화에서 쓸 수 있는 횟수(${MAX_AI_CALLS_PER_SESSION}번)를 다 썼어요. ` +
        "지금까지 적은 발명노트는 그대로 있으니, 노트를 확인하거나 새로 시작해 주세요.",
      429,
    );
  }

  const stage = STAGES[session.quest.currentStage];
  const characterId = stage.character;

  let persona: string;
  try {
    persona = await loadPersona(characterId);
  } catch (error) {
    console.error("[chat] 페르소나 로딩 실패", error);
    return fail(`페르소나 파일을 읽지 못했습니다 (${characterId}).`, 500);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const ctx: TurnContext = {
    quest: session.quest,
    nickname: session.nickname,
    offTopicCount: session.offTopicCount,
    noteDigest: noteDigest(session.notes),
    search: session.search,
    patent: session.patent,
  };

  // 이번 턴 대본에 "발명 이야기로 되돌리기" 안내가 들어갔는가.
  // 들어갔다면 안내를 했다는 뜻이므로, 이탈 횟수는 0에서 다시 센다. (PRD F-8)
  const redirected = session.offTopicCount >= OFF_TOPIC_LIMIT;

  // 첫 인사는 학생 발화 없이 캐릭터가 먼저 말을 걸기 때문에, 이력이 assistant로
  // 시작할 수 있다. Messages API는 첫 메시지가 user여야 하므로 시동 문구를 복원한다.
  const history = normalizeHistory(
    compactHistory(
      (body.history ?? [])
        .filter((turn) => turn.text.trim().length > 0)
        .map((turn) => ({ role: turn.role, content: turn.text })),
      MAX_HISTORY_TURNS,
    ),
  );

  const opener =
    body.intent === "handoff"
      ? handoffTurn(ctx, body.handoffFrom ?? null)
      : openingTurn(ctx);

  const messages: Anthropic.MessageParam[] = [
    ...history,
    body.message && body.message.trim()
      ? userTurnWithBriefing(body.message.trim(), ctx)
      : opener,
  ];

  const system = buildSystemBlocks(characterId, persona);
  const tools = toolsForStage(session.quest.currentStage);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emotionParser = createEmotionParser();
      let emotionSent = false;
      /** 학생 화면에 실제로 글자가 나갔는가 */
      let textSent = false;

      const send = (event: ChatEvent) => {
        if (event.type === "text" && event.delta) textSent = true;
        controller.enqueue(encoder.encode(sse(event)));
      };
      /** 이번 턴에 AI가 표시한 주제 이탈 횟수 (PRD F-8) */
      let offTopicSeen = 0;

      const consume = (parsed: { emotions: string[]; offTopic: number }) => {
        offTopicSeen += parsed.offTopic;
        for (const raw of parsed.emotions) {
          if (emotionSent) continue;
          emotionSent = true;
          send({
            type: "emotion",
            emotion: normalizeEmotion(characterId, raw),
            character: characterId,
          });
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

          const turn = client.messages.stream({
            model: CHAT_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages,
            ...(tools.length > 0 ? { tools } : {}),
            thinking: { type: "adaptive" },
            output_config: { effort: CHAT_EFFORT },
          });

          for await (const event of turn) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const parsed = emotionParser.push(event.delta.text);
              consume(parsed);
              if (parsed.text) send({ type: "text", delta: parsed.text });
            }
          }

          const final = await turn.finalMessage();
          usage.input += final.usage.input_tokens ?? 0;
          usage.output += final.usage.output_tokens ?? 0;
          usage.cacheRead += final.usage.cache_read_input_tokens ?? 0;

          // 생각 블록까지 그대로 되돌려 줘야 다음 라운드가 이어진다
          messages.push({ role: "assistant", content: final.content });

          if (final.stop_reason !== "tool_use") break;

          const toolUses = final.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );

          const results: Anthropic.ToolResultBlockParam[] = [];

          for (const call of toolUses) {
            if (call.name === "update_note" || call.name === "complete_stage") {
              noteDirty = true;
            }
            const toolName = isToolName(call.name) ? call.name : null;
            if (toolName) send({ type: "tool", name: toolName, status: "start" });

            const outcome = await executeTool(call.name, call.input, session);
            session = outcome.session;
            for (const extra of outcome.events) send(extra);

            if (toolName) {
              send({
                type: "tool",
                name: toolName,
                status: "done",
                note: outcome.isError ? outcome.result : undefined,
              });
            }

            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: outcome.result,
              ...(outcome.isError ? { is_error: true } : {}),
            });
          }

          // 병렬 호출도 결과는 반드시 한 개의 사용자 메시지에 모아 돌려준다
          messages.push({ role: "user", content: results });

          if (round === MAX_TOOL_ROUNDS - 1) ranOutOfRounds = true;
        }

        const tail = emotionParser.flush();
        consume(tail);
        if (tail.text) send({ type: "text", delta: tail.text });

        // 도구만 계속 부르다 끝나면 학생 화면에 아무 말도 남지 않는다.
        // 빈 말풍선 대신 상황을 알려 준다.
        if (ranOutOfRounds && !textSent) {
          send({
            type: "text",
            delta:
              "음… 자료를 찾다가 시간이 좀 걸렸어. 방금 한 이야기를 한 번만 더 말해 줄래?",
          });
        }

        if (!emotionSent) {
          send({
            type: "emotion",
            emotion: normalizeEmotion(characterId, null),
            character: characterId,
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
        send({ type: "done", usage });
      } catch (error) {
        console.error("[chat] 스트리밍 실패", error);
        const message =
          error instanceof Anthropic.APIError
            ? `AI 응답에 실패했습니다 (${error.status}). ${error.message}`
            : "AI 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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

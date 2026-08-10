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
import { loadPersona } from "@/lib/personas";
import {
  buildSystemBlocks,
  createEmotionParser,
  openingTurn,
  userTurnWithBriefing,
  type TurnContext,
} from "@/lib/prompt";
import { STAGES } from "@/lib/quest";
import { isSessionState, noteDigest } from "@/lib/session";
import { executeTool } from "@/lib/tool-handlers";
import { isToolName, toolsForStage } from "@/lib/tools";
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

  if (session.aiCalls >= MAX_AI_CALLS_PER_SESSION) {
    return fail(
      `이번 세션의 대화 한도(${MAX_AI_CALLS_PER_SESSION}회)에 도달했습니다. ` +
        "새로 시작하면 계속할 수 있어요.",
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
  };

  const history: Anthropic.MessageParam[] = (body.history ?? [])
    .slice(-MAX_HISTORY_TURNS)
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn) => ({ role: turn.role, content: turn.text }));

  const messages: Anthropic.MessageParam[] = [
    ...history,
    body.message && body.message.trim()
      ? userTurnWithBriefing(body.message.trim(), ctx)
      : openingTurn(ctx),
  ];

  const system = buildSystemBlocks(characterId, persona);
  const tools = toolsForStage(session.quest.currentStage);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(sse(event)));
      const emotionParser = createEmotionParser();
      let emotionSent = false;

      const emitEmotions = (emotions: string[]) => {
        for (const raw of emotions) {
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

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
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
              const { emotions, text } = emotionParser.push(event.delta.text);
              emitEmotions(emotions);
              if (text) send({ type: "text", delta: text });
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
            const toolName = isToolName(call.name) ? call.name : null;
            if (toolName) send({ type: "tool", name: toolName, status: "start" });

            const outcome = executeTool(call.name, call.input, session);
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
        }

        const tail = emotionParser.flush();
        emitEmotions(tail.emotions);
        if (tail.text) send({ type: "text", delta: tail.text });

        if (!emotionSent) {
          send({
            type: "emotion",
            emotion: normalizeEmotion(characterId, null),
            character: characterId,
          });
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

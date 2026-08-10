/**
 * OpenAI 어댑터 (Responses API).
 *
 * 처음에는 Chat Completions 로 만들었다가 실제 호출에서 막혔다:
 *   "Function tools with reasoning_effort are not supported for gpt-5.4-mini
 *    in /v1/chat/completions. To use function tools, use /v1/responses"
 * 우리는 도구 호출과 추론을 둘 다 써야 하므로 Responses API 를 쓴다.
 *
 * Claude와 다른 점:
 * - 시스템 프롬프트가 instructions 라는 별도 칸에 들어간다
 * - 도구 명세가 납작하다 ({type:'function', name, description, parameters})
 * - 도구 결과는 function_call_output 항목으로 돌려준다
 * - 추론 항목(reasoning)을 다음 턴에 되돌려 줘야 사고가 이어진다.
 *   store:false 로 두어 OpenAI 서버에 대화를 남기지 않는 대신,
 *   직전 응답의 output 을 통째로 raw 에 담아 다음 턴 입력에 다시 넣는다.
 * - 캐싱은 자동이라 우리가 어디를 캐싱할지 지정할 수 없다
 */

import "server-only";

import OpenAI from "openai";

import { CHAT_MODELS } from "../config";
import {
  AiError,
  type AiAdapter,
  type AiStreamEvent,
  type AiToolCall,
  type AiTurnRequest,
  type AiTurnResult,
} from "../types";

type InputItem = OpenAI.Responses.ResponseInputItem;

function toTools(request: AiTurnRequest): OpenAI.Responses.Tool[] {
  return request.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
    strict: false,
  }));
}

function toInput(request: AiTurnRequest): InputItem[] {
  const input: InputItem[] = [];

  for (const message of request.messages) {
    if (message.role === "user") {
      input.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      // 직전 응답 원본(추론 항목 포함)을 그대로 되돌려 준다
      if (Array.isArray(message.raw)) {
        input.push(...(message.raw as InputItem[]));
        continue;
      }
      if (message.content) input.push({ role: "assistant", content: message.content });
      for (const call of message.toolCalls ?? []) {
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.input ?? {}),
        });
      }
      continue;
    }

    for (const result of message.results) {
      input.push({
        type: "function_call_output",
        call_id: result.id,
        output: result.content,
      });
    }
  }

  return input;
}

function parseArgs(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // 인자가 깨져도 대화를 끊지 않는다. 도구 실행기가 "값이 이상하다"고 되돌려 준다.
    return {};
  }
}

export function createOpenAiAdapter(): AiAdapter {
  return {
    id: "openai",
    label: "OpenAI",
    model: CHAT_MODELS.openai,

    isConfigured: () => Boolean(readKey()),

    async streamTurn(
      request: AiTurnRequest,
      onEvent: (event: AiStreamEvent) => void,
    ): Promise<AiTurnResult> {
      const apiKey = readKey();
      if (!apiKey) {
        throw new AiError(
          "OPENAI_API_KEY 가 없습니다. .env.local 에 OpenAI 키를 넣고 서버를 다시 시작해 주세요.",
        );
      }

      const client = new OpenAI({ apiKey });
      const tools = toTools(request);

      const stream = await client.responses.create({
        model: CHAT_MODELS.openai,
        instructions: request.system.join("\n\n"),
        input: toInput(request),
        ...(tools.length > 0 ? { tools } : {}),
        reasoning: { effort: request.effort },
        max_output_tokens: request.maxTokens,
        // 학생 대화를 OpenAI 서버에 남기지 않는다 (익명 프로토타입)
        store: false,
        stream: true,
      });

      let text = "";
      let final: OpenAI.Responses.Response | null = null;

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          text += event.delta;
          onEvent({ type: "text", delta: event.delta });
          continue;
        }
        if (event.type === "response.completed") final = event.response;
        if (event.type === "response.incomplete") final = event.response;
        if (event.type === "response.failed") {
          const message = event.response.error?.message ?? "알 수 없는 오류";
          throw new AiError(`OpenAI 응답이 실패했습니다: ${message}`);
        }
      }

      if (!final) {
        throw new AiError("OpenAI 응답이 끝까지 오지 않았습니다. 다시 시도해 주세요.");
      }

      const toolCalls: AiToolCall[] = final.output
        .filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
            item.type === "function_call",
        )
        .map((item) => ({
          id: item.call_id,
          name: item.name,
          input: parseArgs(item.arguments),
        }));

      return {
        stopReason: toolCalls.length > 0 ? "tool_use" : "end",
        text,
        toolCalls,
        usage: {
          input: final.usage?.input_tokens ?? 0,
          output: final.usage?.output_tokens ?? 0,
          cacheRead: final.usage?.input_tokens_details?.cached_tokens ?? 0,
        },
        // 추론 항목까지 통째로 보관 — 다음 턴 입력에 그대로 다시 넣는다
        raw: final.output,
      };
    },
  };
}

/**
 * 키를 읽는다.
 * 대표님이 OPENAPI_API_KEY 로 적어 두신 적이 있어, 표준 이름이 없으면 그쪽도 본다.
 */
function readKey(): string | undefined {
  return process.env.OPENAI_API_KEY || process.env.OPENAPI_API_KEY || undefined;
}

/**
 * Claude(Anthropic) 어댑터.
 *
 * 특징:
 * - 시스템 프롬프트 마지막 조각에 cache_control 을 찍어 도구+대본을 통째로 캐싱한다
 *   (반복분 약 1/10 가격 — 세 회사 중 유일하게 "어디를 캐싱할지" 직접 지정할 수 있다)
 * - adaptive thinking 을 쓰면 생각 블록을 다음 턴에 그대로 되돌려 줘야 한다.
 *   그래서 응답 원본을 raw 에 담아 두고, 다음 턴에 그대로 다시 넣는다.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { CHAT_MODELS } from "../config";
import {
  AiError,
  type AiAdapter,
  type AiStreamEvent,
  type AiToolCall,
  type AiTurnRequest,
  type AiTurnResult,
} from "../types";

const EFFORT_MAP = { low: "low", medium: "medium", high: "high" } as const;

function toTools(request: AiTurnRequest): Anthropic.Tool[] {
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));
}

function toSystem(system: string[]): Anthropic.TextBlockParam[] {
  return system.map((text, index) => ({
    type: "text",
    text,
    // 마지막 조각에 캐시 기준점 — 도구 + 앞선 시스템 조각까지 함께 캐싱된다
    ...(index === system.length - 1
      ? { cache_control: { type: "ephemeral" as const } }
      : {}),
  }));
}

function toMessages(request: AiTurnRequest): Anthropic.MessageParam[] {
  return request.messages.map((message) => {
    if (message.role === "user") {
      return { role: "user", content: message.content };
    }

    if (message.role === "assistant") {
      // 지난 턴의 원본(생각 블록 포함)을 그대로 되돌려 준다
      if (Array.isArray(message.raw)) {
        return { role: "assistant", content: message.raw as Anthropic.ContentBlockParam[] };
      }
      return { role: "assistant", content: message.content };
    }

    // 도구 결과는 반드시 하나의 user 메시지에 모아 돌려준다
    return {
      role: "user",
      content: message.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      })),
    };
  });
}

export function createClaudeAdapter(): AiAdapter {
  return {
    id: "claude",
    label: "Claude",
    model: CHAT_MODELS.claude,

    isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),

    async streamTurn(
      request: AiTurnRequest,
      onEvent: (event: AiStreamEvent) => void,
    ): Promise<AiTurnResult> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new AiError(
          "ANTHROPIC_API_KEY 가 없습니다. .env.local 에 Claude 키를 넣고 서버를 다시 시작해 주세요.",
        );
      }

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const tools = toTools(request);

      const stream = client.messages.stream({
        model: CHAT_MODELS.claude,
        max_tokens: request.maxTokens,
        system: toSystem(request.system),
        messages: toMessages(request),
        ...(tools.length > 0 ? { tools } : {}),
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT_MAP[request.effort] },
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onEvent({ type: "text", delta: event.delta.text });
        }
      }

      const final = await stream.finalMessage();

      const text = final.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const toolCalls: AiToolCall[] = final.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({ id: block.id, name: block.name, input: block.input }));

      return {
        stopReason: final.stop_reason === "tool_use" ? "tool_use" : "end",
        text,
        toolCalls,
        usage: {
          input: final.usage.input_tokens ?? 0,
          output: final.usage.output_tokens ?? 0,
          cacheRead: final.usage.cache_read_input_tokens ?? 0,
        },
        // 생각 블록까지 통째로 보관 — 다음 턴에 그대로 되돌려 준다
        raw: final.content,
      };
    },
  };
}

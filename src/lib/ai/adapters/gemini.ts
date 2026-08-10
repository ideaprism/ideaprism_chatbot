/**
 * Gemini(Google) 어댑터.
 *
 * Claude·OpenAI와 다른 점:
 * - 시스템 프롬프트가 systemInstruction 이라는 별도 칸에 들어간다
 * - 대화가 user/model 두 역할뿐이고, 도구 결과도 user 쪽 functionResponse 로 돌아간다
 * - 도구 호출에 id 가 없어, 우리가 순서대로 번호를 붙여 짝을 맞춘다
 * - 도구 명세는 parametersJsonSchema 로 JSON Schema 를 그대로 넘길 수 있다
 *   (Gemini 고유 Schema 형식으로 변환할 필요가 없다)
 * - 캐싱은 자동(암시적)이라 우리가 지정하지 않는다
 * - 도구를 호출한 턴을 되돌려 줄 때는 조각(part)에 붙은 thoughtSignature 를
 *   그대로 살려야 한다. 없으면 400:
 *     "Function call is missing a thought_signature in functionCall parts"
 *   그래서 모델이 낸 조각을 통째로 raw 에 담아 두고 다음 턴에 그대로 다시 넣는다.
 *   (Claude의 생각 블록, OpenAI의 추론 항목과 같은 이유)
 */

import "server-only";

import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";

import { CHAT_MODELS } from "../config";
import {
  AiError,
  type AiAdapter,
  type AiStreamEvent,
  type AiToolCall,
  type AiTurnRequest,
  type AiTurnResult,
} from "../types";

/** 생각 예산 — 중립 강도를 Gemini의 토큰 예산으로 옮긴다 */
const THINKING_BUDGET: Record<string, number> = {
  low: 0, // 0 = 생각 끄기
  medium: 2048,
  high: 8192,
};

function toDeclarations(request: AiTurnRequest): FunctionDeclaration[] {
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }));
}

function toContents(request: AiTurnRequest): Content[] {
  const contents: Content[] = [];

  for (const message of request.messages) {
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }

    if (message.role === "assistant") {
      // 모델이 냈던 조각을 그대로 되돌려 준다 (thoughtSignature 포함)
      if (Array.isArray(message.raw) && message.raw.length > 0) {
        contents.push({ role: "model", parts: message.raw as Part[] });
        continue;
      }

      const parts: Part[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: (call.input ?? {}) as Record<string, unknown> },
        });
      }
      // 빈 파트는 API가 거절하므로 최소 한 조각은 넣는다
      if (parts.length === 0) parts.push({ text: " " });
      contents.push({ role: "model", parts });
      continue;
    }

    contents.push({
      role: "user",
      parts: message.results.map((result) => ({
        functionResponse: {
          name: result.name,
          response: result.isError
            ? { error: result.content }
            : { result: result.content },
        },
      })),
    });
  }

  return contents;
}

export function createGeminiAdapter(): AiAdapter {
  return {
    id: "gemini",
    label: "Gemini",
    model: CHAT_MODELS.gemini,

    isConfigured: () => Boolean(readKey()),

    async streamTurn(
      request: AiTurnRequest,
      onEvent: (event: AiStreamEvent) => void,
    ): Promise<AiTurnResult> {
      const apiKey = readKey();
      if (!apiKey) {
        throw new AiError(
          "GEMINI_API_KEY 가 없습니다. .env.local 에 Gemini 키를 넣고 서버를 다시 시작해 주세요.",
        );
      }

      const client = new GoogleGenAI({ apiKey });
      const declarations = toDeclarations(request);

      const stream = await client.models.generateContentStream({
        model: CHAT_MODELS.gemini,
        contents: toContents(request),
        config: {
          systemInstruction: request.system.join("\n\n"),
          maxOutputTokens: request.maxTokens,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET[request.effort] ?? 2048 },
          ...(declarations.length > 0
            ? { tools: [{ functionDeclarations: declarations }] }
            : {}),
        },
      });

      let text = "";
      /** 모델이 낸 조각 전부 — thoughtSignature 를 잃지 않도록 그대로 모은다 */
      const modelParts: Part[] = [];
      const usage = { input: 0, output: 0, cacheRead: 0 };

      for await (const chunk of stream) {
        const piece = chunk.text;
        if (piece) {
          text += piece;
          onEvent({ type: "text", delta: piece });
        }

        modelParts.push(...(chunk.candidates?.[0]?.content?.parts ?? []));

        const meta = chunk.usageMetadata;
        if (meta) {
          usage.input = meta.promptTokenCount ?? usage.input;
          usage.output =
            (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) || usage.output;
          usage.cacheRead = meta.cachedContentTokenCount ?? usage.cacheRead;
        }
      }

      // 도구 호출은 모아 둔 조각에서 뽑는다 (되돌려 줄 조각과 짝이 어긋나지 않게)
      const toolCalls: AiToolCall[] = [];
      for (const part of modelParts) {
        const call = part.functionCall;
        if (!call?.name) continue;
        toolCalls.push({
          // Gemini는 호출 식별자를 주지 않아 우리가 번호를 붙인다
          id: call.id ?? `gem_${toolCalls.length}`,
          name: call.name,
          input: call.args ?? {},
        });
      }

      return {
        stopReason: toolCalls.length > 0 ? "tool_use" : "end",
        text,
        toolCalls,
        usage,
        raw: modelParts,
      };
    },
  };
}

function readKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

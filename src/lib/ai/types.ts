/**
 * 모델 제공사 중립 타입 — "통역사"가 오가는 말의 규격.
 *
 * PRD 7장: "도구 호출 계층을 추상화해 모델 교체 비교가 쉽게 되도록 구현".
 * 퀘스트·도구·발명노트 로직은 이 규격만 알면 되고, 어느 회사 모델인지는 모른다.
 * 회사별 차이(스트리밍 형식, 도구 명세 모양, 캐싱 방식)는 어댑터가 흡수한다.
 */

export type ProviderId = "claude" | "openai" | "gemini";

export const PROVIDER_IDS: ProviderId[] = ["claude", "openai", "gemini"];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as string[]).includes(value);
}

/**
 * 중립 도구 명세.
 * 셋 다 JSON Schema 를 받으므로 그것을 공통분모로 삼는다.
 */
export interface AiTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface AiToolCall {
  /** 회사마다 형식이 다른 호출 식별자 — 결과를 돌려줄 때 그대로 되쓴다 */
  id: string;
  name: string;
  input: unknown;
}

export interface AiToolResult {
  id: string;
  name: string;
  content: string;
  isError?: boolean;
}

export type AiMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: AiToolCall[];
      /**
       * 어댑터가 자기 형식 그대로 보관해 두는 자리.
       * Claude는 생각(thinking) 블록을 그대로 되돌려 줘야 대화가 이어지므로 꼭 필요하다.
       * 제공사가 다르면 의미가 없으므로, 한 세션은 한 제공사로 고정한다.
       */
      raw?: unknown;
    }
  | { role: "tool"; results: AiToolResult[] };

/** 사고 강도 — 회사마다 이름이 달라 중립 단계로 받고 어댑터가 번역한다 */
export type AiEffort = "low" | "medium" | "high";

export interface AiTurnRequest {
  /**
   * 시스템 프롬프트를 순서대로 나눠 담는다.
   * 앞쪽일수록 고정된 내용이며, 캐싱 기준점은 마지막 조각에 찍는다.
   */
  system: string[];
  messages: AiMessage[];
  tools: AiTool[];
  maxTokens: number;
  effort: AiEffort;
}

export interface AiUsage {
  input: number;
  output: number;
  /** 캐시에서 읽어 싸게 처리된 토큰 (회사마다 계산 방식이 다름) */
  cacheRead: number;
}

export const ZERO_USAGE: AiUsage = { input: 0, output: 0, cacheRead: 0 };

/** 스트리밍 도중 흘러나오는 것 */
export type AiStreamEvent = { type: "text"; delta: string };

export interface AiTurnResult {
  /** end = 할 말을 마쳤다 · tool_use = 도구를 눌러 달라 */
  stopReason: "end" | "tool_use";
  text: string;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  /** 어댑터가 다음 턴에 되쓸 자기 형식 데이터 */
  raw?: unknown;
}

export interface AiAdapter {
  id: ProviderId;
  /** 화면에 보여 줄 이름 */
  label: string;
  /** 실제로 부르는 모델 이름 */
  model: string;
  /** 이 회사 키가 .env.local 에 들어 있는가 */
  isConfigured(): boolean;
  /** 한 턴을 스트리밍으로 진행한다 */
  streamTurn(
    request: AiTurnRequest,
    onEvent: (event: AiStreamEvent) => void,
  ): Promise<AiTurnResult>;
}

/** 키가 없거나 호출이 실패했을 때 — 화면에 한국어로 그대로 보여 줄 오류 */
export class AiError extends Error {}

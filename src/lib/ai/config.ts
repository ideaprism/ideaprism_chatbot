/**
 * 모델 전략 설정 — PRD 7장 "모델 전략 고려사항".
 *
 * 세 회사 모델을 같은 조건으로 비교해 보기 위해, 모델 이름과 강도를 여기 한 곳에 모았다.
 * 정식판에서 모델을 확정할 때도 여기만 고치면 된다.
 *
 * 주의: 대화 도중 제공사를 바꾸지 않는다. 프롬프트 캐시는 회사·모델별이라
 * 중간에 바꾸면 이력 전체를 정가로 재처리하게 되고 캐릭터 말투도 흔들린다.
 * 그래서 선택기는 대화가 시작되면 잠긴다.
 */

import { isProviderId, type AiEffort, type ProviderId } from "./types";

/**
 * 환경변수를 읽되, 비어 있으면 없는 것으로 친다.
 * .env.local 에 `NAME=` 처럼 값 없이 적어 두면 빈 문자열이 오는데,
 * ?? 는 빈 문자열을 "값이 있다"고 보기 때문에 기본값이 적용되지 않는다.
 * (실제로 DEFAULT_AI_PROVIDER= 빈 줄 때문에 대화가 500으로 죽은 적이 있다)
 */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** 키가 여러 개 있을 때 기본으로 고를 제공사 */
const requestedDefault = env("DEFAULT_AI_PROVIDER");
export const DEFAULT_PROVIDER: ProviderId = isProviderId(requestedDefault)
  ? requestedDefault
  : "claude";

/**
 * 제공사별 대화 모델.
 * 환경변수로 덮어쓸 수 있어, 대표님이 코드를 고치지 않고도 다른 모델을 시험할 수 있다.
 */
export const CHAT_MODELS: Record<ProviderId, string> = {
  claude: env("CLAUDE_MODEL") ?? "claude-sonnet-5",
  openai: env("OPENAI_MODEL") ?? "gpt-5.4-mini",
  gemini: env("GEMINI_MODEL") ?? "gemini-3.6-flash",
};

/** 화면에 보여 줄 이름 */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

/**
 * 곁일용 모델 — 발명노트 요약처럼 대화 밖에서 도는 독립 호출.
 * 대화 캐시와 충돌하지 않으므로 저가 모델을 쓴다. (아직 사용 전)
 */
export const SIDE_TASK_MODEL = "claude-haiku-4-5";

/**
 * 사고 강도. 회사마다 이름이 다르지만 뜻은 비슷해 중립 단계로 통일했다.
 * - low   : 응답은 빠르지만 도구를 덜 집는다
 * - medium: 도구 호출과 응답 속도의 균형 (프로토타입 기본값)
 * - high  : 더 깊게 생각하지만 느리고 비싸다
 */
export const CHAT_EFFORT: AiEffort = "medium";

/**
 * 한 턴의 출력 상한. 생각(thinking) 토큰도 여기에 함께 포함되므로
 * 넉넉히 잡고, 실제 답변 길이는 프롬프트("3~5문장")로 조인다.
 */
export const MAX_OUTPUT_TOKENS = 4000;

/** 한 턴 안에서 도구를 연달아 호출할 수 있는 최대 횟수 (무한 루프 방지) */
export const MAX_TOOL_ROUNDS = 6;

/** 세션당 AI 호출 상한 (PRD 8장 비용 가드). 콘솔의 월 한도와 이중으로 건다. */
export const MAX_AI_CALLS_PER_SESSION = Number(
  process.env.MAX_AI_CALLS_PER_SESSION ?? 120,
);

/** 대화 압축 임계치 (PRD F-7). 이 턴 수를 넘으면 오래된 턴을 접는다. */
export const COMPACT_AFTER_TURNS = 24;

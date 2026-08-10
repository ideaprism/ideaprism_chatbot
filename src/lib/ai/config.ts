/**
 * 모델 전략 설정 — PRD 7장 "모델 전략 고려사항".
 *
 * 모델·강도(effort)·상한을 이 파일 한 곳에 모아 둔다.
 * 정식판에서 모델을 비교·교체할 때 여기만 고치면 되도록 한 것이다.
 *
 * 주의: 대화 도중 모델을 바꾸지 않는다. 프롬프트 캐시는 모델별이라
 * 중간에 바꾸면 이력 전체를 정가로 재처리하게 되고 말투도 흔들린다.
 */

/** 대화용 모델 — 캐릭터가 말하는 모든 턴 */
export const CHAT_MODEL = "claude-sonnet-5";

/**
 * 곁일용 모델 — 발명노트 요약처럼 대화 밖에서 도는 독립 호출.
 * 대화 캐시와 충돌하지 않으므로 저가 모델을 쓴다.
 */
export const SIDE_TASK_MODEL = "claude-haiku-4-5";

/**
 * 사고 강도. Sonnet 5는 effort를 엄격히 지킨다.
 * - low  : 응답은 빠르지만 도구를 덜 집는다
 * - medium: 도구 호출과 응답 속도의 균형 (프로토타입 기본값)
 * - high : 기본값이지만 학생 대화에는 과하다
 * 단계별 사용량을 계측한 뒤 정식판에서 다시 정한다.
 */
export const CHAT_EFFORT = "medium" as const;

/**
 * 한 턴의 출력 상한. adaptive thinking의 생각 토큰도 여기에 함께 포함되므로
 * 넉넉히 잡고, 실제 답변 길이는 프롬프트("3~5문장")로 조인다.
 */
export const MAX_OUTPUT_TOKENS = 4000;

/** 한 턴 안에서 도구를 연달아 호출할 수 있는 최대 횟수 (무한 루프 방지) */
export const MAX_TOOL_ROUNDS = 6;

/** 세션당 AI 호출 상한 (PRD 8장 비용 가드). 콘솔의 월 한도와 이중으로 건다. */
export const MAX_AI_CALLS_PER_SESSION = Number(
  process.env.MAX_AI_CALLS_PER_SESSION ?? 120,
);

/** 대화 압축 임계치 (PRD F-7). 이 턴 수를 넘으면 오래된 턴을 요약해 접는다. */
export const COMPACT_AFTER_TURNS = 24;

/**
 * 대화구조 — 어느 단계에 누가 함께 있는가 (순수 함수).
 *
 * 지금까지는 `quest.ts` 의 STAGES 안에 담당 캐릭터가 하나씩 박혀 있었다.
 * 그걸 여기로 꺼내 **한 단계에 한두 명**을 둘 수 있게 하고,
 * 관리자 페이지에서 바꿀 수 있게 한다.
 *
 * **바꿀 수 있는 것과 없는 것을 분명히 한다.**
 *   바꿀 수 있다 — 누가 함께 있는가 (배턴터치는 사람이 바뀌는 자리에서 저절로 일어난다)
 *   바꿀 수 없다 — 언제 통과인가 (`quest.ts` 의 validate. 아키텍처 원칙 2)
 *
 * 세션은 시작할 때 이 배치를 **붙든다**(`session.cast`). 대화 도중에 대표님이
 * 관리자에서 배치를 바꿔도, 이미 이야기 중인 학생은 원래 만나던 사람과 끝까지 간다.
 * 0단계에서 선생님이 친구를 짝지어 주면 그때만 1~4단계 배치가 갈린다.
 *
 * 서버 전용 코드를 들이지 않는다 — 브라우저도 이 값을 읽어 말풍선을 그린다.
 */

import { isCharacterId, type CharacterId } from "./characters";
import { STAGE_IDS, STAGES, type StageId } from "./quest";

/** 한 단계에 함께 있는 사람들. 첫 번째가 그 단계를 이끈다 */
export type StageCast = CharacterId[];
/** 단계 번호 → 함께 있는 사람들 */
export type Cast = Record<StageId, StageCast>;

/** 한 단계에 둘까지만. 셋이 넘으면 대화가 산만해지고 프롬프트도 길어진다 */
export const MAX_PER_STAGE = 2;

/** 공장 초기값 — 지금까지 코드에 박혀 있던 배치 그대로 (단계마다 한 명) */
export const DEFAULT_CAST: Cast = Object.fromEntries(
  STAGE_IDS.map((id) => [id, [STAGES[id].character]]),
) as Cast;

/**
 * 짝지어 준 친구가 함께 가는 단계 — 0단계(선생님)를 뺀 전부.
 *
 * 5단계도 친구들이 맡는다. 특허 탐정은 그 자리에서 **친구가 불러오는 손님**이다
 * (`call_expert` 도구). 선배가 "이건 탐정님이 잘 아셔" 하고 부르는 그림이
 * 배턴터치로 선배가 사라지는 것보다 자연스럽다.
 */
export const FRIEND_STAGES: StageId[] = [1, 2, 3, 4, 5];

/** 불러올 수 있는 전문가 — 교사·선배는 손님이 아니다 */
export const EXPERT_IDS: CharacterId[] = ["detective", "coach", "jiwon"];

export function isExpertId(value: unknown): value is CharacterId {
  return typeof value === "string" && EXPERT_IDS.includes(value as CharacterId);
}

/** 값 하나를 사람 목록으로 정리한다. 비면 null */
function tidyMembers(value: unknown): StageCast | null {
  const list = Array.isArray(value) ? value : [value];
  const kept: CharacterId[] = [];

  for (const item of list) {
    // 같은 사람을 두 번 넣으면 혼자 두 명인 척하게 된다
    if (isCharacterId(item) && !kept.includes(item)) kept.push(item);
    if (kept.length === MAX_PER_STAGE) break;
  }

  return kept.length > 0 ? kept : null;
}

/**
 * 저장된 값(JSON)이나 브라우저가 보낸 값을 안전한 배치로 만든다.
 * 빠졌거나 모르는 이름만 있으면 그 단계만 공장 초기값으로 되돌린다 —
 * 관리자에서 잘못 저장해도 대화가 멈추지 않게 하기 위해서다.
 *
 * 옛 형태(사람 하나가 문자열로 들어 있던 것)도 그대로 읽는다.
 */
export function normalizeCast(value: unknown): Cast {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    STAGE_IDS.map((id) => [id, tidyMembers(source[String(id)]) ?? DEFAULT_CAST[id]]),
  ) as Cast;
}

/** 관리자에서 저장한 JSON 글을 배치로 (깨져 있으면 공장 초기값) */
export function parseCast(text: string | null | undefined): Cast {
  if (!text) return DEFAULT_CAST;
  try {
    return normalizeCast(JSON.parse(text));
  } catch {
    return DEFAULT_CAST;
  }
}

/** 배치를 저장용 글로 (사람이 읽을 수 있게 들여쓴다) */
export function serializeCast(cast: Cast): string {
  return JSON.stringify(cast, null, 2);
}

/** 이 단계에 함께 있는 사람들 */
export function castAt(cast: Cast | null | undefined, stage: StageId): StageCast {
  return tidyMembers(cast?.[stage]) ?? DEFAULT_CAST[stage];
}

/** 이 단계를 이끄는 사람 (말풍선 기본값·배턴터치 판정에 쓴다) */
export function hostAt(cast: Cast | null | undefined, stage: StageId): CharacterId {
  return castAt(cast, stage)[0];
}

/** 두 배치가 같은 사람들인가 (배턴터치를 띄울지 판정) */
export function sameCast(a: StageCast, b: StageCast): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * 0단계에서 선생님이 짝지어 준 친구들을 1~4단계에 앉힌다.
 * 짝이 하나도 없으면 원래 배치를 그대로 둔다.
 */
export function withFriends(cast: Cast, friends: unknown): Cast {
  const matched = tidyMembers(friends);
  if (!matched) return cast;

  const next = { ...cast };
  for (const stage of FRIEND_STAGES) next[stage] = matched;
  return next;
}

/** 공장 초기값과 다른가 (관리자 화면에 "고쳐짐" 표시용) */
export function isCastChanged(cast: Cast): boolean {
  return STAGE_IDS.some((id) => !sameCast(cast[id], DEFAULT_CAST[id]));
}

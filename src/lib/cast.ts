/**
 * 대화구조 — 어느 단계를 누가 맡는가 (순수 함수).
 *
 * 지금까지는 `quest.ts` 의 STAGES 안에 담당 캐릭터가 박혀 있었다.
 * 그걸 여기로 꺼내 관리자 페이지에서 바꿀 수 있게 한다.
 *
 * **바꿀 수 있는 것과 없는 것을 분명히 한다.**
 *   바꿀 수 있다 — 누가 맡는가 (배턴터치는 담당이 바뀌는 자리에서 저절로 일어난다)
 *   바꿀 수 없다 — 언제 통과인가 (`quest.ts` 의 validate. 아키텍처 원칙 2)
 *
 * 세션은 시작할 때 이 배치를 **붙든다**(`session.cast`). 대화 도중에 대표님이
 * 관리자에서 배치를 바꿔도, 이미 이야기 중인 학생은 원래 만나던 사람과 끝까지 간다.
 *
 * 서버 전용 코드를 들이지 않는다 — 브라우저도 이 값을 읽어 말풍선을 그린다.
 */

import { isCharacterId, type CharacterId } from "./characters";
import { STAGE_IDS, STAGES, type StageId } from "./quest";

/** 단계 번호 → 담당 캐릭터 */
export type Cast = Record<StageId, CharacterId>;

/** 공장 초기값 — 지금까지 코드에 박혀 있던 배치 그대로 */
export const DEFAULT_CAST: Cast = Object.fromEntries(
  STAGE_IDS.map((id) => [id, STAGES[id].character]),
) as Cast;

/**
 * 저장된 값(JSON)이나 브라우저가 보낸 값을 안전한 배치로 만든다.
 * 빠졌거나 모르는 이름이 섞여 있으면 그 단계만 공장 초기값으로 되돌린다 —
 * 관리자에서 잘못 저장해도 대화가 멈추지 않게 하기 위해서다.
 */
export function normalizeCast(value: unknown): Cast {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    STAGE_IDS.map((id) => {
      const picked = source[String(id)];
      return [id, isCharacterId(picked) ? picked : DEFAULT_CAST[id]];
    }),
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

/** 이 단계를 맡은 사람 */
export function castAt(cast: Cast | null | undefined, stage: StageId): CharacterId {
  return cast?.[stage] ?? DEFAULT_CAST[stage];
}

/** 공장 초기값과 다른가 (관리자 화면에 "고쳐짐" 표시용) */
export function isCastChanged(cast: Cast): boolean {
  return STAGE_IDS.some((id) => cast[id] !== DEFAULT_CAST[id]);
}

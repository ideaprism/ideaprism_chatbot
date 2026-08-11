/**
 * 입장코드의 규칙 (순수 함수).
 *
 * 문을 지키는 규칙이라 테스트로 못박아 둘 값어치가 있다.
 * `auth.ts` 는 서버 전용(`server-only`)이라 회귀 테스트가 불러 쓸 수 없으므로,
 * 판정할 수 있는 부분만 여기로 꺼냈다. (`personas.ts` 와 같은 이유·같은 방식)
 */

/** 코드로 쓸 수 있는 길이 — 너무 짧으면 찍어서 맞히고, 너무 길면 학생이 못 넣는다 */
export const ENTRY_CODE_MIN = 4;
export const ENTRY_CODE_MAX = 32;

/**
 * 새 코드로 쓸 수 있는 값인가.
 * 쓸 수 있으면 다듬은 코드를, 안 되면 무엇이 잘못됐는지 돌려준다.
 */
export function validateEntryCode(
  input: unknown,
): { ok: true; code: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "코드를 적어 주세요." };
  }

  const code = input.trim();

  if (code.length < ENTRY_CODE_MIN || code.length > ENTRY_CODE_MAX) {
    return {
      ok: false,
      error: `코드는 ${ENTRY_CODE_MIN}~${ENTRY_CODE_MAX}자여야 합니다.`,
    };
  }

  if (/\s/.test(code)) {
    return {
      ok: false,
      error: "코드에 빈칸을 넣을 수 없습니다. 학생이 그대로 옮겨 적기 어렵습니다.",
    };
  }

  return { ok: true, code };
}

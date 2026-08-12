/**
 * 교실의 규칙 (순수 함수).
 *
 * 교실 코드는 곧 학생이 넣는 입장코드다 — 대표님 결정.
 * 그래서 코드 규칙은 `entry/rules.ts` 의 것을 그대로 쓴다. 두 벌로 나뉘면
 * 관리자에서 저장은 됐는데 학생이 못 들어가는 일이 생긴다.
 *
 * `store.ts` 는 서버 전용(`server-only`)이라 회귀 테스트가 못 부른다.
 * 판정할 수 있는 부분만 여기로 꺼냈다.
 */

import { validateEntryCode } from "@/lib/entry/rules";

/** 한 교실 */
export interface Classroom {
  id: string;
  /** 학생이 첫 화면에서 넣는 코드 */
  code: string;
  /** 선생님이 알아볼 이름 */
  name: string;
  /** 이 교실을 맡은 선생님 (아직 없으면 null) */
  teacherId: string | null;
  /** 꺼 두면 그 코드로는 못 들어온다 */
  active: boolean;
}

/** 교실 이름이 없으면 선생님이 목록에서 어느 반인지 구분하지 못한다 */
export const CLASSROOM_NAME_MIN = 2;
export const CLASSROOM_NAME_MAX = 40;

export function validateClassroomName(
  input: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "교실 이름을 적어 주세요." };
  }

  const name = input.trim().replace(/\s+/g, " ");

  if (name.length < CLASSROOM_NAME_MIN || name.length > CLASSROOM_NAME_MAX) {
    return {
      ok: false,
      error: `교실 이름은 ${CLASSROOM_NAME_MIN}~${CLASSROOM_NAME_MAX}자여야 합니다.`,
    };
  }

  return { ok: true, name };
}

/**
 * 교실 하나를 저장하기 전에 확인한다.
 * 코드와 이름을 함께 봐야 "코드는 맞는데 이름이 비어 저장됐다"가 안 생긴다.
 */
export function validateClassroom(
  input: { code?: unknown; name?: unknown },
): { ok: true; code: string; name: string } | { ok: false; error: string } {
  const code = validateEntryCode(input.code);
  if (!code.ok) return { ok: false, error: code.error };

  const name = validateClassroomName(input.name);
  if (!name.ok) return { ok: false, error: name.error };

  return { ok: true, code: code.code, name: name.name };
}

/**
 * 같은 코드를 두 교실에 쓰면 학생이 어느 반으로 갈지 정해지지 않는다.
 * 표에도 unique 를 걸어 두었지만, 화면에서 먼저 걸러 주면 안내가 친절해진다.
 */
export function findDuplicateCode(
  classrooms: Classroom[],
  code: string,
  /** 지금 고치고 있는 교실 (자기 자신과는 안 부딪힌다) */
  exceptId?: string,
): Classroom | null {
  return (
    classrooms.find((room) => room.code === code && room.id !== exceptId) ?? null
  );
}

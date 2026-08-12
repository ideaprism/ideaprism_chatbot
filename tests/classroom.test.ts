/**
 * 교실 규칙 회귀 테스트.
 *
 * **교실 코드가 곧 학생 입장코드다.** 두 규칙이 갈라지면 관리자에서 저장은 됐는데
 * 학생이 못 들어가는 일이 생긴다 — 그 어긋남을 여기서 못박는다.
 *
 * 표를 읽고 쓰는 부분(`store.ts`)은 서버 전용이라 여기서 못 부른다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLASSROOM_NAME_MAX,
  CLASSROOM_NAME_MIN,
  findDuplicateCode,
  validateClassroom,
  validateClassroomName,
  type Classroom,
} from "../src/lib/classroom/rules";
import { validateEntryCode } from "../src/lib/entry/rules";

const room = (id: string, code: string, name = "반"): Classroom => ({
  id,
  code,
  name,
  teacherId: null,
  active: true,
});

test("교실 코드는 학생 입장코드와 똑같은 규칙을 쓴다", () => {
  // 갈라지면 "관리자에서는 저장됐는데 학생이 못 들어간다"가 된다
  for (const candidate of ["7117", "발명교실2026", "711", "", "발명 교실", "a".repeat(33)]) {
    assert.equal(
      validateClassroom({ code: candidate, name: "성수중 3학년 발명반" }).ok,
      validateEntryCode(candidate).ok,
      `코드 "${candidate}" 의 판정이 입장코드와 다르다`,
    );
  }
});

test("교실 이름이 없으면 선생님이 어느 반인지 못 알아본다", () => {
  assert.deepEqual(validateClassroomName("성수중 3학년 발명반"), {
    ok: true,
    name: "성수중 3학년 발명반",
  });
  assert.deepEqual(validateClassroomName("  성수중   3학년  "), {
    ok: true,
    name: "성수중 3학년",
  });

  assert.equal(validateClassroomName("").ok, false);
  assert.equal(validateClassroomName("   ").ok, false);
  assert.equal(validateClassroomName("a".repeat(CLASSROOM_NAME_MIN - 1)).ok, false);
  assert.equal(validateClassroomName("a".repeat(CLASSROOM_NAME_MAX + 1)).ok, false);
  assert.equal(validateClassroomName(null).ok, false);
});

test("코드와 이름을 함께 본다 — 하나만 맞으면 저장하지 않는다", () => {
  assert.equal(validateClassroom({ code: "7117", name: "발명반" }).ok, true);
  assert.equal(validateClassroom({ code: "7117", name: "" }).ok, false, "이름이 비었다");
  assert.equal(validateClassroom({ code: "1", name: "발명반" }).ok, false, "코드가 짧다");

  const both = validateClassroom({ code: "7117", name: "  발명반  " });
  assert.equal(both.ok && both.name, "발명반", "앞뒤 공백은 다듬는다");
});

test("같은 코드를 두 교실에 쓸 수 없다", () => {
  const rooms = [room("a", "7117", "1반"), room("b", "8228", "2반")];

  assert.equal(findDuplicateCode(rooms, "7117")?.name, "1반");
  assert.equal(findDuplicateCode(rooms, "9999"), null);
  // 자기 자신과는 부딪히지 않는다 (이름만 고칠 때 막히면 안 된다)
  assert.equal(findDuplicateCode(rooms, "7117", "a"), null);
  assert.equal(findDuplicateCode(rooms, "7117", "b")?.name, "1반");
});

/**
 * 입장코드 규칙 회귀 테스트.
 *
 * 이 문이 하는 일은 **대표님 계정에서 AI 비용이 새어 나가는 것을 막는 것**이다.
 * 문지기 자체(쿠키 서명·관리자 통과)는 서버 전용 코드라 여기서 못 부르고,
 * 실제 화면과 API로 확인했다. 여기서는 "어떤 코드를 쓸 수 있는가"만 못박는다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ENTRY_CODE_MAX,
  ENTRY_CODE_MIN,
  validateEntryCode,
} from "../src/lib/entry/rules";

test("쓸 만한 코드는 통과시키고 앞뒤 공백은 다듬는다", () => {
  assert.deepEqual(validateEntryCode("7117"), { ok: true, code: "7117" });
  assert.deepEqual(validateEntryCode("  7117  "), { ok: true, code: "7117" });
  assert.deepEqual(validateEntryCode("발명교실2026"), { ok: true, code: "발명교실2026" });
});

test("너무 짧거나 긴 코드는 막는다", () => {
  // 짧으면 찍어서 맞힐 수 있다
  assert.equal(validateEntryCode("711").ok, false);
  assert.equal(validateEntryCode("").ok, false);
  assert.equal(validateEntryCode("   ").ok, false, "공백만 있으면 빈 것이다");

  assert.equal(validateEntryCode("a".repeat(ENTRY_CODE_MIN)).ok, true);
  assert.equal(validateEntryCode("a".repeat(ENTRY_CODE_MAX)).ok, true);
  assert.equal(validateEntryCode("a".repeat(ENTRY_CODE_MAX + 1)).ok, false);
});

test("빈칸이 든 코드는 막는다", () => {
  // 학생이 칠판에 적힌 코드를 그대로 옮겨 적어야 하는데 빈칸은 옮기기 어렵다
  const result = validateEntryCode("발명 교실");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.error.includes("빈칸"));
});

test("글이 아닌 값은 막는다", () => {
  for (const bad of [7117, null, undefined, {}, ["7117"]]) {
    assert.equal(validateEntryCode(bad).ok, false, `통과하면 안 된다: ${JSON.stringify(bad)}`);
  }
});

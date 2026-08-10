/**
 * 발명노트에 담기는 내용 테스트.
 *
 * 특히 "막힘 신호"(단계 체류 시간·승급 재시도 횟수)는 정식판에서
 * 어느 단계가 어려운지 판단할 근거라서, 조용히 빠지면 안 된다. (PRD F-6)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStagePayload } from "../src/lib/notes/payload";
import { initialQuestState } from "../src/lib/quest";
import { createSession } from "../src/lib/session";
import type { SessionState } from "../src/types/chat";

function sessionWith(over: Partial<SessionState> = {}): SessionState {
  return { ...createSession(), quest: initialQuestState(0), ...over };
}

test("아직 시작도 안 한 단계는 노트에 넣지 않는다", () => {
  const payload = buildStagePayload(sessionWith());
  // 0단계만 진입 상태
  assert.deepEqual(Object.keys(payload), ["0"]);
});

test("단계 요약과 산출물이 함께 담긴다", () => {
  const session = sessionWith({
    notes: [{ stage: 1, summary: "우산 이야기를 나눴다", at: 0 }],
    quest: {
      currentStage: 2,
      completed: {
        0: { nickname: "민준" },
        1: { problemArea: "우산", observations: ["바닥이 젖는다"] },
      },
      enteredAt: { 0: 1000, 1: 5000, 2: 9000 },
      retries: {},
    },
  });

  const payload = buildStagePayload(session);

  assert.equal(payload["1"].label, "문제 발견");
  assert.equal(payload["1"].summary, "우산 이야기를 나눴다");
  assert.deepEqual(payload["1"].artifact, {
    problemArea: "우산",
    observations: ["바닥이 젖는다"],
  });
});

test("막힘 신호: 체류 시간과 반려 횟수가 남는다", () => {
  const session = sessionWith({
    quest: {
      currentStage: 2,
      completed: { 0: { nickname: "민준" }, 1: { problemArea: "우산" } },
      enteredAt: { 0: 1_000, 1: 5_000, 2: 20_000 },
      retries: { 1: 3 },
    },
  });

  const payload = buildStagePayload(session);

  assert.equal(payload["0"].dwellMs, 4_000, "0단계에 4초 머물렀다");
  assert.equal(payload["1"].dwellMs, 15_000, "1단계에 15초 머물렀다");
  assert.equal(payload["1"].retries, 3, "1단계에서 완료 신청이 3번 반려됐다");
  assert.equal(payload["0"].retries, 0);
});

test("아직 진행 중인 단계는 체류 시간을 확정하지 않는다", () => {
  const session = sessionWith({
    quest: {
      currentStage: 1,
      completed: { 0: { nickname: "민준" } },
      enteredAt: { 0: 1_000, 1: 5_000 },
      retries: {},
    },
  });

  const payload = buildStagePayload(session);
  assert.equal(payload["1"].dwellMs, null, "다음 단계로 넘어가야 확정된다");
});

/**
 * 이용내역 요약 회귀 테스트.
 *
 * 관리자 화면에 뜨는 "막힘 신호"는 프로그램이 잰 값으로만 판정해야 한다
 * (아키텍처 원칙 4). 3.0 교사 대시보드가 그대로 쓸 값이라 여기서 못박아 둔다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DWELL_THRESHOLD_MS,
  IDLE_THRESHOLD_MS,
  RETRY_THRESHOLD,
  detail,
  statsOf,
  stageViews,
  summarize,
  totalTokens,
  type NoteRow,
} from "../src/lib/notes/summary";

const NOW = Date.parse("2026-08-12T12:00:00Z");

function row(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    session_id: "sess-1",
    nickname: "코코",
    matched_character: "daon",
    current_stage: 2,
    completed: false,
    stages: {
      "0": { label: "시작", summary: "별명을 정했다", artifact: { nickname: "코코" }, dwellMs: 60_000, retries: 0 },
      "1": { label: "소재 발견", summary: null, artifact: null, dwellMs: 120_000, retries: 1 },
    },
    final_idea: null,
    kipris_query: null,
    ai_calls: 7,
    token_usage: {
      "0": { input: 100, output: 50, cacheRead: 10, calls: 2 },
      "1": { input: 200, output: 80, cacheRead: 20, calls: 3 },
    },
    started_at: "2026-08-12T11:00:00Z",
    updated_at: "2026-08-12T11:50:00Z",
    ...overrides,
  };
}

test("단계별 토큰을 하나로 합친다", () => {
  assert.deepEqual(totalTokens(row().token_usage), {
    input: 300,
    output: 130,
    cacheRead: 30,
    calls: 5,
  });
  // 표가 비어 있거나 깨져 있어도 0으로 돌려준다 (화면이 죽지 않게)
  assert.deepEqual(totalTokens(null), { input: 0, output: 0, cacheRead: 0, calls: 0 });
  assert.deepEqual(totalTokens("이상한 값"), { input: 0, output: 0, cacheRead: 0, calls: 0 });
});

test("시작도 안 한 단계는 목록에 넣지 않는다", () => {
  const views = stageViews(row().stages);
  assert.deepEqual(views.map((view) => view.stage), [0, 1]);
  assert.equal(views[1].retries, 1);
  assert.equal(views[1].dwellMs, 120_000);
});

test("요약에 반려 합계와 가장 오래 머문 시간이 담긴다", () => {
  const note = summarize(row(), NOW);

  assert.equal(note.nickname, "코코");
  assert.equal(note.currentStage, 2);
  assert.equal(note.stageLabel, "문제 정의");
  assert.equal(note.completed, false);
  assert.equal(note.aiCalls, 7);
  assert.equal(note.retriesTotal, 1);
  assert.equal(note.longestDwellMs, 120_000);
  assert.deepEqual(note.flags, [], "아직 막힘 신호는 없다");
});

test("막힘 신호는 잰 값으로만 판정한다", () => {
  // ① 완료 신청이 거듭 반려됐다
  const retried = summarize(
    row({ stages: { "1": { label: "소재 발견", retries: RETRY_THRESHOLD } } }),
    NOW,
  );
  assert.deepEqual(retried.flags, ["retried"]);

  // ② 한 단계에 오래 머물렀다
  const lingering = summarize(
    row({ stages: { "1": { label: "소재 발견", dwellMs: DWELL_THRESHOLD_MS } } }),
    NOW,
  );
  assert.deepEqual(lingering.flags, ["lingering"]);

  // ③ 한동안 활동이 없다
  const idle = summarize(
    row({ updated_at: new Date(NOW - IDLE_THRESHOLD_MS).toISOString() }),
    NOW,
  );
  assert.deepEqual(idle.flags, ["idle"]);

  // 완주한 학생은 오래 손을 놓아도 "막힘"이 아니다
  const done = summarize(
    row({ completed: true, updated_at: new Date(NOW - IDLE_THRESHOLD_MS * 5).toISOString() }),
    NOW,
  );
  assert.ok(!done.flags.includes("idle"));
});

test("깨진 기록이 섞여 있어도 화면이 죽지 않는다", () => {
  const broken = summarize(
    row({
      nickname: null,
      current_stage: 99, // 있을 수 없는 단계
      completed: null,
      stages: "이건 JSON 객체가 아니다",
      ai_calls: null,
      token_usage: undefined,
    }),
    NOW,
  );

  assert.equal(broken.currentStage, 0, "모르는 단계는 0으로");
  assert.equal(broken.completed, false);
  assert.equal(broken.aiCalls, 0);
  assert.equal(broken.longestDwellMs, null);
  assert.deepEqual(broken.flags, []);
});

test("상세에는 단계별 기록과 최종안이 함께 담긴다", () => {
  const one = detail(
    row({ final_idea: { title: "빗물 받는 우산" }, kipris_query: "우산*빗물" }),
    NOW,
  );

  assert.equal(one.stages.length, 2);
  assert.deepEqual(one.finalIdea, { title: "빗물 받는 우산" });
  assert.equal(one.kiprisQuery, "우산*빗물");
});

test("한눈 요약: 완주·진행 중·막힘을 센다", () => {
  const rows = [
    summarize(row({ session_id: "a", completed: true, current_stage: 5 }), NOW),
    summarize(row({ session_id: "b", current_stage: 2 }), NOW),
    summarize(
      row({
        session_id: "c",
        current_stage: 3,
        stages: { "3": { label: "문제해결(SCAMPER)", retries: RETRY_THRESHOLD } },
      }),
      NOW,
    ),
  ];

  const stats = statsOf(rows);
  assert.equal(stats.total, 3);
  assert.equal(stats.completed, 1);
  assert.equal(stats.inProgress, 2);
  assert.equal(stats.stuck, 1, "막힌 학생은 진행 중인 사람 중에서만 센다");

  assert.equal(stats.byStage.length, 6, "0~5단계 칸이 모두 있다");
  assert.equal(stats.byStage.find((bar) => bar.stage === 2)?.count, 1);
  assert.equal(stats.byStage.find((bar) => bar.stage === 5)?.count, 1);
});

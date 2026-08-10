/**
 * 발명노트에 담을 내용을 만드는 순수 계산 (PRD F-6).
 *
 * DB에 쓰는 일(repository.ts)과 분리해 둔 이유:
 * 여기 담기는 "막힘 신호"(단계 체류 시간·승급 재시도 횟수)는 정식판에서
 * 어느 단계가 어려운지 판단할 근거라, 테스트로 못박아 둘 값어치가 있다.
 */

import { STAGES, STAGE_IDS, type StageId } from "@/lib/quest";
import type { SessionState } from "@/types/chat";

/** 저장할 한 단계의 기록 */
export interface StageRecord {
  label: string;
  summary: string | null;
  artifact: unknown;
  /** 이 단계에 머문 시간(ms). 다음 단계로 넘어가야 확정된다. */
  dwellMs: number | null;
  /** 완료 신청이 반려된 횟수 */
  retries: number;
}

/** 단계 체류 시간 — 다음 단계 진입 시각에서 이 단계 진입 시각을 뺀다 */
function dwellOf(session: SessionState, stage: StageId, now: number): number | null {
  const enteredAt = session.quest.enteredAt[stage];
  if (!enteredAt) return null;

  const next = stage < 5 ? session.quest.enteredAt[(stage + 1) as StageId] : undefined;
  if (next) return next - enteredAt;

  // 마지막 단계는 완료된 시점에만 확정한다
  return session.quest.completed[stage] !== undefined ? now - enteredAt : null;
}

export function buildStagePayload(
  session: SessionState,
  now: number = Date.now(),
): Record<string, StageRecord> {
  const { quest, notes } = session;
  const payload: Record<string, StageRecord> = {};

  for (const stage of STAGE_IDS) {
    const note = notes.find((entry) => entry.stage === stage);
    const artifact = quest.completed[stage];
    const enteredAt = quest.enteredAt[stage];

    // 아직 시작도 안 한 단계는 굳이 남기지 않는다
    if (!note && artifact === undefined && enteredAt === undefined) continue;

    payload[String(stage)] = {
      label: STAGES[stage].label,
      summary: note?.summary ?? null,
      artifact: artifact ?? note?.details ?? null,
      dwellMs: dwellOf(session, stage, now),
      retries: quest.retries[stage] ?? 0,
    };
  }

  return payload;
}

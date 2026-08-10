/**
 * 단계별 사용량 누적 (PRD 7장 "단계별 사용량 계측").
 *
 * 어느 단계에서 토큰이 많이 드는지 데이터로 남겨,
 * 정식판에서 "단계마다 다른 모델을 쓸까?"를 감이 아니라 근거로 정하기 위한 기록이다.
 * 발명노트와 함께 Supabase에 저장된다.
 */

import type { StageId } from "./quest";
import type { StageUsage } from "@/types/chat";

export const EMPTY_USAGE: StageUsage = { input: 0, output: 0, cacheRead: 0, calls: 0 };

export function mergeStageUsage(
  current: Record<string, StageUsage> | undefined,
  stage: StageId,
  turn: { input: number; output: number; cacheRead: number },
): Record<string, StageUsage> {
  const key = String(stage);
  const previous = current?.[key] ?? EMPTY_USAGE;

  return {
    ...current,
    [key]: {
      input: previous.input + turn.input,
      output: previous.output + turn.output,
      cacheRead: previous.cacheRead + turn.cacheRead,
      calls: previous.calls + 1,
    },
  };
}

/** 세션 전체 합계 — 비용을 눈으로 볼 때 쓴다 */
export function totalUsage(usage: Record<string, StageUsage> | undefined): StageUsage {
  return Object.values(usage ?? {}).reduce<StageUsage>(
    (sum, entry) => ({
      input: sum.input + entry.input,
      output: sum.output + entry.output,
      cacheRead: sum.cacheRead + entry.cacheRead,
      calls: sum.calls + entry.calls,
    }),
    { ...EMPTY_USAGE },
  );
}

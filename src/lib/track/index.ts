/**
 * 트랙 보관함 — 어떤 학습 프로그램들이 있고, 그중 무엇으로 대화하는가.
 *
 * 지금은 「발명 5단계」 하나뿐이다. 그릇은 셋을 담게 만들어 두었고
 * (`types.ts` 의 주석 참조), 새 트랙은 이 목록에 한 줄 더하면 붙는다.
 *
 * 모르는 트랙 이름이 들어오면 조용히 기본 트랙으로 되돌아간다 —
 * 오래된 세션(트랙 이름이 없던 시절의 것)도 대화가 이어져야 하기 때문이다.
 */

import { INVENTION_FIVE } from "./tracks/invention5";
import type { Track, TrackStage } from "./types";

export type { Track, TrackStage, TrackInput } from "./types";

export const TRACKS: Track[] = [INVENTION_FIVE];

export const DEFAULT_TRACK_ID = INVENTION_FIVE.id;

/** 이름으로 트랙을 찾는다. 모르면 기본 트랙 */
export function getTrack(id?: string | null): Track {
  return TRACKS.find((track) => track.id === id) ?? INVENTION_FIVE;
}

/** 이 트랙의 단계 번호들 (진행 순서) */
export function stageIdsOf(track: Track): number[] {
  return track.stages.map((stage) => stage.id);
}

/**
 * 단계 하나. 모르는 번호면 첫 단계로 되돌린다 —
 * 저장된 세션에 없는 번호가 섞여 들어와도 화면이 깨지지 않게.
 */
export function stageAt(track: Track, id: number): TrackStage {
  return track.stages.find((stage) => stage.id === id) ?? track.stages[0];
}

/** 번호 → 단계. 매 턴 훑지 않도록 한 번 만들어 둔다 */
export function stageMapOf(track: Track): Record<number, TrackStage> {
  return Object.fromEntries(track.stages.map((stage) => [stage.id, stage]));
}

/** 마지막 단계 번호 — 여기를 끝내면 발명노트가 완성된다 */
export function finalStageOf(track: Track): number {
  return track.stages[track.stages.length - 1].id;
}

/** 이 트랙에 있는 단계 번호인가 */
export function hasStage(track: Track, id: number): boolean {
  return track.stages.some((stage) => stage.id === id);
}

/**
 * 퀘스트 상태기계 — 지금 몇 단계인가, 넘어가도 되는가.
 *
 * 아키텍처 원칙 2: 단계 관리는 "코드"가 한다. AI는 현 단계의 대본만 받아 연기하고,
 * 승급은 complete_stage 도구 호출 + 검증을 통과해야만 일어난다.
 * (PRD F-1 / 리스크 대응 "AI가 단계를 건너뛰거나 늘어짐")
 *
 * **단계의 내용은 여기 없다.** 단계 이름·대본·도구·완료 조건은 전부
 * `track/` 에 데이터로 있고(`track/tracks/invention5.ts`), 이 파일은 그 데이터를
 * 읽어 "넘어갈 수 있는가"만 판정한다. 그래야 학습 프로그램을 새로 만들 때
 * 이 파일을 고치지 않아도 된다.
 *
 * 모듈 맨 위의 STAGES·STAGE_IDS·FINAL_STAGE 는 **기본 트랙(발명 5단계)** 의 값이다.
 * 세션이 어떤 트랙인지는 `QuestState.trackId` 가 들고 있고, 판정 함수들은
 * 그 트랙을 보고 움직인다.
 */

import type { CharacterId } from "./characters";
import {
  DEFAULT_TRACK_ID,
  finalStageOf,
  getTrack,
  stageAt,
  stageIdsOf,
  stageMapOf,
  type Track,
  type TrackStage,
} from "./track";
import { evaluateRules, NO_EVIDENCE, type StageEvidence } from "./track/rules";

/**
 * 단계 번호.
 * 트랙마다 단계 수가 다르므로 0~5로 못박지 않는다 — 어떤 번호가 있는지는
 * 그 트랙의 `stageIdsOf()` 만이 안다.
 */
export type StageId = number;

/** 단계 하나의 정의 (트랙 데이터가 그대로 이 모양이다) */
export type StageDefinition = TrackStage;

export { FRIEND_IDS, NO_EVIDENCE } from "./track/rules";
export type { StageEvidence, ValidationResult } from "./track/rules";

/** 기본 트랙 — 트랙을 고르는 화면이 생기기 전까지는 모두가 이것으로 대화한다 */
const DEFAULT_TRACK = getTrack(DEFAULT_TRACK_ID);

export const STAGE_IDS: StageId[] = stageIdsOf(DEFAULT_TRACK);
export const STAGES: Record<StageId, StageDefinition> = stageMapOf(DEFAULT_TRACK);
export const FINAL_STAGE: StageId = finalStageOf(DEFAULT_TRACK);

// ── 세션 상태 ────────────────────────────────────────────────

export interface QuestState {
  /**
   * 어떤 학습 프로그램(트랙)으로 하고 있는가.
   * 세션이 시작할 때 정해지고 끝까지 바뀌지 않는다.
   *
   * 없어도 된다 — 트랙이라는 개념이 생기기 전에 브라우저에 저장된 대화가 있고,
   * 그런 세션은 기본 트랙(발명 5단계)으로 이어진다. 모르는 이름도 마찬가지다.
   */
  trackId?: string;
  currentStage: StageId;
  /** 완료한 단계별 산출물 (최종본) */
  completed: Partial<Record<StageId, unknown>>;
  /**
   * 지금까지 도달한 가장 먼 단계.
   * 앞 단계로 돌아가 다시 이야기해도 여기는 내려가지 않으므로,
   * 진행판에서 원래 자리로 언제든 되돌아올 수 있다.
   */
  furthestStage: StageId;
  /**
   * 같은 단계를 다시 정리했을 때 밀려난 이전 산출물들 (오래된 것부터).
   * 시행착오도 발명 과정의 일부라 버리지 않고 발명노트에 참고로 남긴다.
   */
  history: Partial<Record<StageId, unknown[]>>;
  /** 막힘 신호 (PRD F-6): 단계별 진입 시각과 승급 재시도 횟수 */
  enteredAt: Partial<Record<StageId, number>>;
  retries: Partial<Record<StageId, number>>;
}

export function initialQuestState(
  now: number = Date.now(),
  trackId: string = DEFAULT_TRACK_ID,
): QuestState {
  const track = getTrack(trackId);
  const first = stageIdsOf(track)[0];

  return {
    trackId: track.id,
    currentStage: first,
    completed: {},
    furthestStage: first,
    history: {},
    enteredAt: { [first]: now },
    retries: {},
  };
}

/**
 * 이 대화가 밟고 있는 학습 프로그램.
 * 트랙 이름이 없던 시절에 저장된 세션도 있으므로 기본 트랙으로 메운다.
 */
export function trackOf(state: QuestState): Track {
  return getTrack(state.trackId);
}

/**
 * 도달한 가장 먼 단계.
 * 이 값이 생기기 전에 저장된 세션(sessionStorage)도 있으므로 현재 단계로 메운다.
 */
export function furthestOf(state: QuestState): StageId {
  return state.furthestStage ?? state.currentStage;
}

/** 이미 지나온 단계인가 — 진행판에서 눌러 되돌아갈 수 있는가 */
export function canRevisit(state: QuestState, stage: StageId): boolean {
  const ids = stageIdsOf(trackOf(state));
  const at = ids.indexOf(stage);
  return at >= 0 && at <= ids.indexOf(furthestOf(state)) && stage !== state.currentStage;
}

/**
 * 앞 단계로 되돌아간다 (학생이 진행판을 눌렀을 때).
 *
 * 아직 가 보지 않은 단계로는 갈 수 없다 — 건너뛰기는 여전히 막는다(원칙 2).
 * 기록은 아무것도 지우지 않는다. 다시 정리하면 그때 갱신된다.
 */
export function revisitStage(
  state: QuestState,
  stage: StageId,
  now: number = Date.now(),
): QuestState {
  if (!canRevisit(state, stage)) return state;
  return {
    ...state,
    currentStage: stage,
    furthestStage: furthestOf(state),
    enteredAt: { ...state.enteredAt, [stage]: now },
  };
}

export function stageOf(state: QuestState): StageDefinition {
  return stageAt(trackOf(state), state.currentStage);
}

/**
 * 이 단계를 맡은 사람.
 * 배치를 안 주면 트랙에 적힌 공장 초기값을 쓴다 (`cast.ts` 참조).
 */
export function characterOf(
  state: QuestState,
  cast?: Partial<Record<StageId, CharacterId[]>>,
): CharacterId {
  return cast?.[state.currentStage]?.[0] ?? stageOf(state).character;
}

export function isComplete(state: QuestState): boolean {
  return state.completed[finalStageOf(trackOf(state))] !== undefined;
}

// ── 승급 ────────────────────────────────────────────────────

export interface AdvanceResult {
  ok: boolean;
  state: QuestState;
  /** AI에게 돌려줄 안내 (다음 단계 대본 또는 부족한 항목) */
  message: string;
  /** 캐릭터가 바뀌었는가 — 배턴터치 연출 트리거 */
  characterChanged: boolean;
  nextStage: StageId;
  nextCharacter: CharacterId;
}

/**
 * complete_stage 처리. 검증을 통과해야만 실제로 단계가 오른다.
 * 실패해도 상태를 망가뜨리지 않고 재시도 횟수만 올린다.
 */
export function advanceStage(
  state: QuestState,
  stage: StageId,
  artifact: unknown,
  now: number = Date.now(),
  /** 프로그램이 실제로 관측한 사실. 안 주면 "아무것도 안 해 봤다"로 본다. */
  evidence: StageEvidence = NO_EVIDENCE,
  /** 이번 대화의 담당 배치. 안 주면 트랙의 공장 초기값 (`cast.ts` 참조) */
  cast?: Partial<Record<StageId, CharacterId[]>>,
  /**
   * 자유 문장 조건의 판정 결과 (규칙 id → 참/거짓).
   * 부품을 전부 통과한 뒤에만 쓰인다. 안 주면 자유 문장은 통과하지 않는다.
   */
  judgments?: Record<string, boolean>,
): AdvanceResult {
  const track = trackOf(state);
  const ids = stageIdsOf(track);
  const finalStage = finalStageOf(track);
  const def = (id: StageId): StageDefinition => stageAt(track, id);

  /** 이 단계에 함께 있는 사람들 */
  const crew = (id: StageId): CharacterId[] => {
    const members = cast?.[id];
    return members && members.length > 0 ? members : [def(id).character];
  };
  /** 이 단계를 이끄는 사람 */
  const who = (id: StageId): CharacterId => crew(id)[0];
  /** 사람 구성이 바뀌었는가 — 배턴터치를 띄울지 판정 */
  const sameCrew = (a: CharacterId[], b: CharacterId[]) =>
    a.length === b.length && a.every((id, index) => id === b[index]);
  /** 둘 중 더 멀리 간 단계 (번호가 아니라 진행 순서로 잰다) */
  const further = (a: StageId, b: StageId): StageId =>
    ids.indexOf(a) >= ids.indexOf(b) ? a : b;

  const stay = (message: string): AdvanceResult => ({
    ok: false,
    state,
    message,
    characterChanged: false,
    nextStage: state.currentStage,
    nextCharacter: who(state.currentStage),
  });

  if (stage !== state.currentStage) {
    return stay(
      `지금은 ${state.currentStage}단계(${def(state.currentStage).label}) 진행 중입니다. ` +
        `${stage}단계는 완료 처리할 수 없습니다. 현재 단계에 집중하세요.`,
    );
  }

  const current = def(stage);
  const result = evaluateRules(
    current.rules,
    artifact,
    evidence,
    current.hint,
    judgments,
  );

  if (!result.ok) {
    const retried = { ...state.retries, [stage]: (state.retries[stage] ?? 0) + 1 };
    return {
      ...stay(
        `아직 완료 조건을 채우지 못했습니다. 부족한 항목: ${result.missing.join(", ")}. ` +
          `${result.hint} 학생과 대화를 이어가며 이 부분을 채운 뒤 다시 호출하세요.`,
      ),
      state: { ...state, retries: retried },
    };
  }

  const nextStage =
    stage === finalStage ? finalStage : (ids[ids.indexOf(stage) + 1] ?? finalStage);

  // 같은 단계를 다시 정리했다면 앞서 적었던 것을 참고로 남긴다 (시행착오도 기록)
  const previous = state.completed[stage];
  const history =
    previous === undefined
      ? state.history
      : { ...state.history, [stage]: [...(state.history?.[stage] ?? []), previous] };

  const nextState: QuestState = {
    ...state,
    currentStage: nextStage,
    completed: { ...state.completed, [stage]: artifact },
    history,
    // 되돌아가 다시 완료한 경우, 원래 가 있던 자리는 그대로 기억한다
    furthestStage: further(furthestOf(state), nextStage),
    enteredAt: { ...state.enteredAt, [nextStage]: now },
  };

  if (stage === finalStage) {
    return {
      ok: true,
      state: nextState,
      message:
        "모든 단계를 완주했습니다! 발명노트가 완성되었습니다. " +
        "학생에게 축하 인사를 건네고, 노트를 출력해 선생님께 보여드리라고 안내하세요.",
      characterChanged: false,
      nextStage: finalStage,
      nextCharacter: who(finalStage),
    };
  }

  const nextDef = def(nextStage);
  const nextCharacter = who(nextStage);
  const changed = !sameCrew(crew(stage), crew(nextStage));

  return {
    ok: true,
    state: nextState,
    message: changed
      ? `${stage}단계 완료! 다음은 ${nextStage}단계 "${nextDef.label}"이고, ` +
        `담당은 ${nextCharacter}입니다. 지금 맡은 역할로 따뜻하게 퇴장 인사를 건네고 ` +
        `다음 캐릭터를 소개하며 마무리하세요. 다음 캐릭터의 대사는 당신이 쓰지 않습니다.`
      : `${stage}단계 완료! 이어서 ${nextStage}단계 "${nextDef.label}"을 진행하세요.\n${nextDef.mission}`,
    characterChanged: changed,
    nextStage,
    nextCharacter,
  };
}

/** 진행판(S-5)에 넘길 요약 */
export function progressView(state: QuestState) {
  const track = trackOf(state);

  return stageIdsOf(track).map((id) => ({
    id,
    label: stageAt(track, id).label,
    doneWhen: stageAt(track, id).doneWhen,
    status:
      state.completed[id] !== undefined
        ? ("done" as const)
        : id === state.currentStage
          ? ("current" as const)
          : ("todo" as const),
    /** 눌러서 되돌아갈 수 있는 단계인가 */
    revisitable: canRevisit(state, id),
  }));
}

/**
 * 퀘스트 상태기계 (발명 5단계 + 0단계 만남).
 *
 * 아키텍처 원칙 2: 단계 관리는 "코드"가 한다. AI는 현 단계의 대본만 받아 연기하고,
 * 승급은 complete_stage 도구 호출 + 여기 있는 검증 함수를 통과해야만 일어난다.
 * (PRD F-1 / 리스크 대응 "AI가 단계를 건너뛰거나 늘어짐")
 */

import { CHARACTERS, type CharacterId } from "./characters";

export type StageId = 0 | 1 | 2 | 3 | 4 | 5;
export const STAGE_IDS: StageId[] = [0, 1, 2, 3, 4, 5];
export const FINAL_STAGE: StageId = 5;

/** 단계별 산출물 — 발명노트에 그대로 쌓인다 */
export interface StageArtifacts {
  0: { nickname: string; interests: string[]; matchedFriends: CharacterId[] };
  1: { problemArea: string; observations: string[] };
  2: { problemStatement: string; target: string; pain: string };
  3: { techniquesTried: string[]; candidates: string[] };
  4: { title: string; summary: string; howItWorks: string; differentiator: string };
  5: { kiprisQuery: string; similarPatents: string[]; differentiation: string };
}

export type AnyArtifact = StageArtifacts[StageId];

export interface StageDefinition {
  id: StageId;
  /** 진행판에 표시할 짧은 이름 */
  label: string;
  /** 이 단계를 맡는 캐릭터 */
  character: CharacterId;
  /** AI에게 주입할 "이번 단계에 할 일" 대본 */
  mission: string;
  /** 학생에게 보여줄 완료 조건 (진행판 툴팁) */
  doneWhen: string;
  /** complete_stage 산출물 검증 — 통과하지 못하면 승급하지 않는다 */
  validate: (artifact: unknown, evidence: StageEvidence) => ValidationResult;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; missing: string[]; hint: string };

/**
 * 프로그램이 실제로 관측한 사실 — AI의 주장이 아니다.
 *
 * 산출물만 보고 판정하면, AI가 특허를 한 번도 조회하지 않고도 그럴듯한 검색식과
 * 특허 이름을 적어 내 단계를 끝낼 수 있다(실제로 그렇게 넘어가는 것을 확인했다).
 * 그래서 5단계는 "정말 찾아봤는가"를 여기 담긴 사실로 판정한다. (아키텍처 원칙 2·4)
 */
export interface StageEvidence {
  /** 실제로 조회를 마친 KIPRIS 검색식 (조회 전이면 null) */
  kiprisQuery: string | null;
  /** 그 조회로 프로그램이 센 전체 건수 (조회 전이면 -1) */
  kiprisTotal: number;
}

export const NO_EVIDENCE: StageEvidence = { kiprisQuery: null, kiprisTotal: -1 };

// ── 검증 헬퍼 ────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, minLength: number): boolean {
  return typeof value === "string" && value.trim().length >= minLength;
}

function list(value: unknown, minItems: number, minLength = 1): boolean {
  return (
    Array.isArray(value) &&
    value.filter((item) => text(item, minLength)).length >= minItems
  );
}

function check(
  artifact: unknown,
  rules: Array<[field: string, pass: boolean]>,
  hint: string,
): ValidationResult {
  const missing = rules.filter(([, pass]) => !pass).map(([field]) => field);
  return missing.length === 0 ? { ok: true } : { ok: false, missing, hint };
}

/** 학생과 짝지어 줄 수 있는 사람 — 발명반 친구(선배)만. 교사·전문가는 짝이 아니다 */
export const FRIEND_IDS: CharacterId[] = (
  Object.keys(CHARACTERS) as CharacterId[]
).filter((id) => CHARACTERS[id].group === "senior");

/**
 * 0단계 산출물의 "발명반 친구 두 명"이 쓸 만한 값인가.
 *
 * AI가 아무 이름이나 적어 내면 대화가 없는 사람에게 넘어간다.
 * 그래서 **선배 목록에 있는 서로 다른 두 명**일 때만 통과시킨다 (아키텍처 원칙 2).
 */
function isFriendPair(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [first, second] = value;
  if (first === second) return false;
  return [first, second].every(
    (id) => typeof id === "string" && FRIEND_IDS.includes(id as CharacterId),
  );
}

// ── 단계 정의 ────────────────────────────────────────────────

export const STAGES: Record<StageId, StageDefinition> = {
  0: {
    id: 0,
    label: "시작",
    character: "teacher",
    doneWhen: "별명과 관심사를 나누고, 함께할 발명반 친구 두 명을 소개받으면 완료",
    mission: `학생과 처음 만나는 단계다.
- 따뜻하게 인사하고, 편하게 부를 별명을 물어본다. (실명·연락처는 절대 묻지 않는다)
- 학년, 요즘 관심사, 발명 경험을 가볍게 2~3가지만 물어본다. 취조하듯 몰아붙이지 않는다.
- 앞으로 어떻게 흘러가는지 짧게 알려 준다: 다섯 단계를 하나씩 따라가면 발명이 완성된다.
- 나눈 이야기를 바탕으로 **발명반 친구 두 명**을 골라 왜 그 둘인지와 함께 소개한다.
- 별명·관심사·친구 두 명이 정해졌으면 complete_stage 를 호출한다.
  (matchedFriends 에 고른 두 명의 id를 넣는다)`,
    validate: (artifact) => {
      const a = asRecord(artifact);
      return check(
        artifact,
        [
          ["nickname", text(a.nickname, 1)],
          ["interests", list(a.interests, 1)],
          ["matchedFriends(발명반 친구 2명)", isFriendPair(a.matchedFriends)],
        ],
        "별명과 관심사를 확인하고, 발명반 친구 두 명을 골라 소개한 뒤에 넘어갈 수 있어요. " +
          "고를 수 있는 친구: " +
          FRIEND_IDS.join(", "),
      );
    },
  },

  1: {
    id: 1,
    label: "소재 발견",
    character: "jiyou",
    doneWhen: "생활 속에서 불편했던 장면을 찾아내면 완료",
    mission: `학생이 "무엇이 불편했는지"를 찾아내게 돕는 단계다.
- "요즘 뭐가 불편했어?" 처럼 생활 경험에서 출발한다.
- 학생이 주제를 꺼내면 search_inventions 도구로 선배들의 발명을 함께 본다.
  숫자와 통계는 도구가 돌려주는 값만 말한다. 절대 지어내지 않는다.
- 필터를 바꿔 보자고 제안할 때는 apply_filters 도구를 쓴다.
- 불편했던 장면(관찰)이 1가지 이상 구체적으로 나오면 complete_stage를 호출한다.`,
    validate: (artifact) => {
      const a = asRecord(artifact);
      return check(
        artifact,
        [
          ["problemArea", text(a.problemArea, 2)],
          ["observations", list(a.observations, 1, 5)],
        ],
        "어떤 분야에서 무엇이 불편했는지, 구체적인 장면이 1가지는 있어야 해요.",
      );
    },
  },

  2: {
    id: 2,
    label: "문제 정의",
    character: "jiyou",
    doneWhen: "누가·무엇이 불편한지 한 문장으로 정리되면 완료",
    mission: `막연한 불편함을 "진짜 문제"로 좁히는 단계다.
- "진짜 문제가 뭘까?"를 파고든다. 겉으로 보이는 증상과 원인을 구분하게 돕는다.
- 누가(target) 어떤 상황에서 무엇 때문에(pain) 불편한지를 학생 입으로 말하게 한다.
- 한 문장짜리 문제 정의문(problemStatement)이 만들어지면 update_note로 기록하고
  complete_stage를 호출한다.`,
    validate: (artifact) => {
      const a = asRecord(artifact);
      return check(
        artifact,
        [
          ["problemStatement", text(a.problemStatement, 10)],
          ["target", text(a.target, 2)],
          ["pain", text(a.pain, 2)],
        ],
        "누가(target), 무엇 때문에(pain) 불편한지가 한 문장(problemStatement)으로 정리돼야 해요.",
      );
    },
  },

  3: {
    id: 3,
    label: "문제해결(SCAMPER)",
    character: "jiyou",
    doneWhen: "SCAMPER 기법을 2가지 이상 써서 아이디어 후보를 모으면 완료",
    mission: `SCAMPER로 아이디어를 넓히는 단계다.
- 기법 이름을 먼저 말하지 않는다. 사고방식으로 먼저 유도한 뒤
  "이게 SCAMPER에서 ○○이라는 기법이야" 하고 알려준다.
- 기법에 맞는 선배 발명을 보고 싶으면 apply_filters(scamper) 도구를 쓴다.
- 서로 다른 기법을 2가지 이상 시도하고, 아이디어 후보가 2개 이상 나오면
  complete_stage를 호출한다.`,
    validate: (artifact) => {
      const a = asRecord(artifact);
      return check(
        artifact,
        [
          ["techniquesTried(2개 이상)", list(a.techniquesTried, 2)],
          ["candidates(2개 이상)", list(a.candidates, 2, 4)],
        ],
        "서로 다른 SCAMPER 기법 2가지와 아이디어 후보 2개가 모여야 다음으로 갈 수 있어요.",
      );
    },
  },

  4: {
    id: 4,
    label: "아이디어 도출",
    character: "jiyou",
    doneWhen: "발명의 이름·작동 방식·차별점이 정리되면 완료",
    mission: `후보 중 하나를 골라 아이디어를 또렷하게 만드는 단계다.
- 학생이 스스로 고르게 하되, 고르는 기준(문제를 얼마나 푸는가)을 짚어 준다.
- 발명 이름(title), 한 줄 요약(summary), 어떻게 작동하는지(howItWorks),
  기존 것과 뭐가 다른지(differentiator)를 채워 간다.
- 다 채워지면 update_note로 기록하고 complete_stage를 호출한 뒤,
  "이제 특허 탐정님을 모실게!" 하고 배턴을 넘긴다.`,
    validate: (artifact) => {
      const a = asRecord(artifact);
      return check(
        artifact,
        [
          ["title", text(a.title, 2)],
          ["summary", text(a.summary, 10)],
          ["howItWorks", text(a.howItWorks, 10)],
          ["differentiator", text(a.differentiator, 5)],
        ],
        "발명 이름·요약·작동 방식·차별점 네 가지가 모두 채워져야 해요.",
      );
    },
  },

  5: {
    id: 5,
    label: "발명 / 특허검색",
    character: "detective",
    doneWhen: "KIPRIS로 비슷한 특허를 찾아보고 차별점을 정리하면 완료",
    mission: `아이디어가 얼마나 새로운지 확인하는 마지막 단계다.
- 아이디어 요지로 generate_kipris_query 도구를 호출해 검색식을 만든다.
- search_kipris 도구로 실제 조회하고, 결과에 나온 특허만 근거로 삼는다.
  검색 결과에 없는 특허를 지어내지 않는다.
- "무조건 등록됩니다" 같은 확답은 하지 않는다. "가능성이 있습니다"처럼 표현한다.
- 유사 특허와 우리 아이디어의 차별점(differentiation)이 정리되면 complete_stage를 호출한다.`,
    validate: (artifact, evidence) => {
      const a = asRecord(artifact);

      // 조회한 적이 없으면 무엇을 적어 내든 통과시키지 않는다.
      // AI가 대화에서 본 적 있는 검색식을 기억해 적어 내는 일이 실제로 있었다.
      if (!evidence.kiprisQuery) {
        return {
          ok: false,
          missing: ["실제 특허 조회"],
          hint:
            "아직 특허를 한 번도 조회하지 않았습니다. 비슷한 선배 발명을 골라 " +
            "generate_kipris_query 로 검색식을 만들고, search_kipris 로 실제 조회한 뒤에 " +
            "완료를 신청하세요. 조회하지 않은 특허를 지어내면 안 됩니다.",
        };
      }

      const claimed = typeof a.kiprisQuery === "string" ? a.kiprisQuery.trim() : "";
      if (claimed !== evidence.kiprisQuery) {
        return {
          ok: false,
          missing: ["kiprisQuery"],
          hint:
            "kiprisQuery 는 실제로 조회한 검색식과 똑같아야 합니다: " +
            `${evidence.kiprisQuery}`,
        };
      }

      const similar = Array.isArray(a.similarPatents)
        ? a.similarPatents.filter((item) => text(item, 1))
        : [];

      if (evidence.kiprisTotal === 0 && similar.length > 0) {
        return {
          ok: false,
          missing: ["similarPatents"],
          hint:
            "조회 결과가 0건이었습니다. 나오지 않은 특허를 적을 수 없습니다. " +
            "빈 목록으로 두거나, 검색식을 넓혀 다시 조회하세요.",
        };
      }
      if (evidence.kiprisTotal > 0 && similar.length === 0) {
        return {
          ok: false,
          missing: ["similarPatents"],
          hint:
            "조회 결과에 특허가 있었습니다. 그중 우리 아이디어와 비슷한 것을 " +
            "최소 1건 적어 주세요 (조회 목록에 나온 제목만).",
        };
      }

      return check(
        artifact,
        [["differentiation", text(a.differentiation, 10)]],
        "'기존 특허와 무엇이 다른지'가 있어야 발명노트를 완성할 수 있어요.",
      );
    },
  },
};

// ── 세션 상태 ────────────────────────────────────────────────

export interface QuestState {
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

export function initialQuestState(now: number = Date.now()): QuestState {
  return {
    currentStage: 0,
    completed: {},
    furthestStage: 0,
    history: {},
    enteredAt: { 0: now },
    retries: {},
  };
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
  return stage <= furthestOf(state) && stage !== state.currentStage;
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
  return STAGES[state.currentStage];
}

/**
 * 이 단계를 맡은 사람.
 * 배치를 안 주면 STAGES 에 적힌 공장 초기값을 쓴다 (`cast.ts` 참조).
 */
export function characterOf(
  state: QuestState,
  cast?: Partial<Record<StageId, CharacterId[]>>,
): CharacterId {
  return cast?.[state.currentStage]?.[0] ?? STAGES[state.currentStage].character;
}

export function isComplete(state: QuestState): boolean {
  return state.completed[FINAL_STAGE] !== undefined;
}

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
  /** 이번 대화의 담당 배치. 안 주면 STAGES 의 공장 초기값 (`cast.ts` 참조) */
  cast?: Partial<Record<StageId, CharacterId[]>>,
): AdvanceResult {
  /** 이 단계에 함께 있는 사람들 */
  const crew = (id: StageId): CharacterId[] => {
    const members = cast?.[id];
    return members && members.length > 0 ? members : [STAGES[id].character];
  };
  /** 이 단계를 이끄는 사람 */
  const who = (id: StageId): CharacterId => crew(id)[0];
  /** 사람 구성이 바뀌었는가 — 배턴터치를 띄울지 판정 */
  const sameCrew = (a: CharacterId[], b: CharacterId[]) =>
    a.length === b.length && a.every((id, index) => id === b[index]);

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
      `지금은 ${state.currentStage}단계(${STAGES[state.currentStage].label}) 진행 중입니다. ` +
        `${stage}단계는 완료 처리할 수 없습니다. 현재 단계에 집중하세요.`,
    );
  }

  const result = STAGES[stage].validate(artifact, evidence);
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

  const nextStage = (stage === FINAL_STAGE ? FINAL_STAGE : ((stage + 1) as StageId));

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
    furthestStage: Math.max(furthestOf(state), nextStage) as StageId,
    enteredAt: { ...state.enteredAt, [nextStage]: now },
  };

  if (stage === FINAL_STAGE) {
    return {
      ok: true,
      state: nextState,
      message:
        "모든 단계를 완주했습니다! 발명노트가 완성되었습니다. " +
        "학생에게 축하 인사를 건네고, 노트를 출력해 선생님께 보여드리라고 안내하세요.",
      characterChanged: false,
      nextStage: FINAL_STAGE,
      nextCharacter: who(FINAL_STAGE),
    };
  }

  const nextDef = STAGES[nextStage];
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
  return STAGE_IDS.map((id) => ({
    id,
    label: STAGES[id].label,
    doneWhen: STAGES[id].doneWhen,
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

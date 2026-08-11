/**
 * 저장된 발명노트 한 줄을 관리자 화면이 읽을 수 있는 요약으로 바꾼다 (순수 함수).
 *
 * 여기서 계산하는 "막힘 신호"는 3.0 교사 대시보드가 그대로 쓸 값이다
 * (ECOSYSTEM.md 3.3 참조). 그래서 화면이 아니라 이 파일에 두고 테스트로 못박는다.
 *
 * 원칙 4를 지킨다 — **숫자는 프로그램이 센다.** AI가 "잘 되고 있다"고 적어 낸 말이 아니라
 * 실제로 잰 체류 시간과 반려 횟수로 판정한다.
 */

import { STAGE_IDS, STAGES, type StageId } from "@/lib/quest";

/** invention_notes 표에서 그대로 읽은 한 줄 */
export interface NoteRow {
  session_id: string;
  nickname: string | null;
  matched_character: string | null;
  current_stage: number | null;
  completed: boolean | null;
  stages: unknown;
  final_idea: unknown;
  kipris_query: string | null;
  ai_calls: number | null;
  token_usage: unknown;
  started_at: string;
  updated_at: string;
}

/** 한 단계에 남은 기록 */
export interface StageView {
  stage: StageId;
  label: string;
  summary: string | null;
  artifact: unknown;
  earlierAttempts: unknown[];
  /** 이 단계에 머문 시간(ms). 아직 진행 중이면 null */
  dwellMs: number | null;
  /** 완료 신청이 반려된 횟수 */
  retries: number;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  calls: number;
}

/** 목록 한 줄 */
export interface NoteSummary {
  sessionId: string;
  nickname: string | null;
  currentStage: StageId;
  stageLabel: string;
  completed: boolean;
  aiCalls: number;
  tokens: TokenTotals;
  startedAt: string;
  updatedAt: string;
  /** 완료 신청이 반려된 총 횟수 */
  retriesTotal: number;
  /** 가장 오래 머문 단계에 쓴 시간(ms) */
  longestDwellMs: number | null;
  /** 프로그램이 본 막힘 신호 (없으면 빈 배열) */
  flags: StuckFlag[];
}

export interface NoteDetail extends NoteSummary {
  stages: StageView[];
  finalIdea: unknown;
  kiprisQuery: string | null;
}

export type StuckFlag = "retried" | "lingering" | "idle";

/** 이 정도 반려되면 조건을 못 채우고 헤매는 중이다 */
export const RETRY_THRESHOLD = 3;
/** 한 단계에 이만큼 머물렀으면 오래 붙들려 있는 것이다 (30분) */
export const DWELL_THRESHOLD_MS = 30 * 60 * 1000;
/** 마지막 활동이 이만큼 지났는데 안 끝났으면 손을 놓은 것이다 (2일) */
export const IDLE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

export const FLAG_LABEL: Record<StuckFlag, string> = {
  retried: "완료 조건 반복 반려",
  lingering: "한 단계에 오래 머묾",
  idle: "한동안 활동 없음",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toStageId(value: unknown): StageId {
  const n = Number(value);
  return (STAGE_IDS as number[]).includes(n) ? (n as StageId) : 0;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 단계별 토큰 사용량을 하나로 합친다 */
export function totalTokens(tokenUsage: unknown): TokenTotals {
  const total: TokenTotals = { input: 0, output: 0, cacheRead: 0, calls: 0 };
  for (const entry of Object.values(asRecord(tokenUsage))) {
    const one = asRecord(entry);
    total.input += count(one.input);
    total.output += count(one.output);
    total.cacheRead += count(one.cacheRead);
    total.calls += count(one.calls);
  }
  return total;
}

/** 저장된 stages JSON 을 단계 순서대로 편다 */
export function stageViews(stages: unknown): StageView[] {
  const source = asRecord(stages);

  return STAGE_IDS.flatMap((stage) => {
    const entry = source[String(stage)];
    if (entry === undefined) return [];
    const one = asRecord(entry);

    return [
      {
        stage,
        label: typeof one.label === "string" ? one.label : STAGES[stage].label,
        summary: typeof one.summary === "string" ? one.summary : null,
        artifact: one.artifact ?? null,
        earlierAttempts: Array.isArray(one.earlierAttempts) ? one.earlierAttempts : [],
        dwellMs: typeof one.dwellMs === "number" ? one.dwellMs : null,
        retries: count(one.retries),
      },
    ];
  });
}

/**
 * 막힘 신호를 판정한다.
 * AI의 해석이 아니라 프로그램이 잰 값만 본다 (아키텍처 원칙 4).
 */
export function stuckFlags(
  views: StageView[],
  row: { completed: boolean; updatedAt: string },
  now: number,
): StuckFlag[] {
  const flags: StuckFlag[] = [];

  if (views.some((view) => view.retries >= RETRY_THRESHOLD)) flags.push("retried");
  if (views.some((view) => (view.dwellMs ?? 0) >= DWELL_THRESHOLD_MS)) flags.push("lingering");

  if (!row.completed) {
    const last = Date.parse(row.updatedAt);
    if (Number.isFinite(last) && now - last >= IDLE_THRESHOLD_MS) flags.push("idle");
  }

  return flags;
}

export function summarize(row: NoteRow, now: number = Date.now()): NoteSummary {
  const views = stageViews(row.stages);
  const currentStage = toStageId(row.current_stage);
  const completed = row.completed === true;

  const dwells = views.map((view) => view.dwellMs).filter((ms): ms is number => ms !== null);

  return {
    sessionId: row.session_id,
    nickname: row.nickname,
    currentStage,
    stageLabel: STAGES[currentStage].label,
    completed,
    aiCalls: count(row.ai_calls),
    tokens: totalTokens(row.token_usage),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    retriesTotal: views.reduce((sum, view) => sum + view.retries, 0),
    longestDwellMs: dwells.length > 0 ? Math.max(...dwells) : null,
    flags: stuckFlags(views, { completed, updatedAt: row.updated_at }, now),
  };
}

export function detail(row: NoteRow, now: number = Date.now()): NoteDetail {
  return {
    ...summarize(row, now),
    stages: stageViews(row.stages),
    finalIdea: row.final_idea ?? null,
    kiprisQuery: row.kipris_query,
  };
}

/** 목록 위에 띄울 한눈 요약 */
export interface NoteStats {
  total: number;
  completed: number;
  inProgress: number;
  stuck: number;
  /** 지금 어느 단계에 몇 명이 있는가 */
  byStage: Array<{ stage: StageId; label: string; count: number }>;
}

export function statsOf(rows: NoteSummary[]): NoteStats {
  const completed = rows.filter((row) => row.completed).length;
  return {
    total: rows.length,
    completed,
    inProgress: rows.length - completed,
    stuck: rows.filter((row) => !row.completed && row.flags.length > 0).length,
    byStage: STAGE_IDS.map((stage) => ({
      stage,
      label: STAGES[stage].label,
      count: rows.filter((row) => row.currentStage === stage).length,
    })),
  };
}

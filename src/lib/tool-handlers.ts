/**
 * 도구 실행기 — AI가 누른 버튼을 서버가 실제로 동작시킨다.
 *
 * 동작하는 것: search_inventions, apply_filters, get_statistics, show_invention,
 *              update_note, complete_stage
 * 아직인 것: generate_kipris_query, search_kipris (P4)
 *
 * 원칙: 숫자는 전부 여기(또는 facets.ts)에서 세어 AI에게 넘긴다.
 *       AI는 받은 숫자를 해석만 하고 스스로 세지 않는다.
 */

import "server-only";

import { buildKiprisQuery, describeFormula } from "./kipris/formula";
import { KiprisError, searchKipris } from "./kipris/service";
import { advanceStage, STAGES, STAGE_IDS, type StageId } from "./quest";
import {
  availableValues,
  describeStats,
  filterRows,
  gradeNameMap,
  sanitizeFilterValues,
  splitTags,
} from "./search/facets";
import { MAX_LOADED, SearchError, searchInventions } from "./search/service";
import { getSearch, putSearch } from "./search/store";
import { upsertNote } from "./session";
import { isToolName, type ToolName } from "./tools";
import type { ChatEvent, NoteEntry, SessionState } from "@/types/chat";
import type { Patent, PatentSnapshot } from "@/types/kipris";
import type {
  InventionRow,
  LookupItem,
  SearchFilters,
  SearchSnapshot,
} from "@/types/search";

export interface ToolOutcome {
  /** AI에게 돌려줄 문자열 (tool_result) */
  result: string;
  session: SessionState;
  /** 브라우저로 밀어 줄 부수 이벤트 (검색 결과·배턴터치 등) */
  events: ChatEvent[];
  isError: boolean;
}

function asStage(value: unknown): StageId | null {
  const n = typeof value === "number" ? value : Number(value);
  return STAGE_IDS.includes(n as StageId) ? (n as StageId) : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item));
}

// ── 검색 결과 확보 ───────────────────────────────────────────

interface LoadedSearch {
  rows: InventionRow[];
  grades: LookupItem[];
  categories: LookupItem[];
}

/**
 * 서버 캐시에서 결과셋을 꺼낸다.
 * 캐시가 비었으면(서버 재시작 등) 같은 검색어로 조용히 다시 가져온다 —
 * 학생 입장에서는 아무 일도 없었던 것처럼 대화가 이어진다.
 */
async function loadSearch(session: SessionState): Promise<LoadedSearch | null> {
  const snapshot = session.search;
  if (!snapshot) return null;

  const cached = getSearch(session.sessionId, snapshot.keyword);
  if (cached) return cached;

  try {
    const fresh = await searchInventions(snapshot.keyword);
    putSearch(session.sessionId, {
      keyword: snapshot.keyword,
      rows: fresh.rows,
      grades: fresh.grades,
      categories: fresh.categories,
    });
    return fresh;
  } catch {
    return null;
  }
}

/** 현재 필터를 적용한 결과 + AI에게 줄 통계 문장 */
function statsFor(
  snapshot: SearchSnapshot,
  loaded: LoadedSearch,
): { filtered: InventionRow[]; text: string } {
  const grades = gradeNameMap(loaded.grades);
  const filtered = filterRows(loaded.rows, snapshot.filters, grades);
  return {
    filtered,
    text: describeStats(
      snapshot.keyword,
      snapshot.totalCount,
      snapshot.loadedCount,
      filtered,
      snapshot.filters,
      grades,
    ),
  };
}

function describeChoices(snapshot: SearchSnapshot): string {
  const line = (label: string, values: string[]) =>
    values.length ? `${label}: ${values.slice(0, 12).join(", ")}` : `${label}: 없음`;

  return [
    "필터로 고를 수 있는 값 (이 목록에 있는 값만 사용할 것):",
    line("- 학년", snapshot.availableGrades),
    line("- 문제유형", snapshot.availableProblemTags),
    line("- SCAMPER", snapshot.availableScamper),
  ].join("\n");
}

/** 특허 조회 결과를 AI에게 넘길 형태로 정리 — 목록에 없는 특허는 존재하지 않는다 */
function describePatents(query: string, totalCount: number, patents: Patent[]): string {
  if (patents.length === 0) {
    return [
      `검색식 "${query}" 로는 특허가 한 건도 나오지 않았습니다.`,
      "0건이라고 해서 곧바로 '새로운 발명'이라고 단정하지 마세요.",
      "검색식이 너무 좁을 수 있으니, 갈래를 하나 빼고 다시 만들어 보자고 학생에게 제안하세요.",
    ].join("\n");
  }

  const lines = [
    `검색식: ${query}`,
    `전체 ${totalCount}건 중 ${patents.length}건을 가져왔습니다. 아래 목록에 있는 특허만 근거로 삼으세요.`,
    "",
    ...patents.map((patent, index) =>
      [
        `${index + 1}. ${patent.inventionTitle}`,
        `   출원번호 ${patent.applicationNumber || "미상"} · ${patent.applicationDate || "일자 미상"} · ${patent.registerStatus}`,
        patent.applicantName ? `   출원인: ${patent.applicantName}` : null,
        patent.abstract ? `   요약: ${patent.abstract.slice(0, 200)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];

  return lines.join("\n");
}

function summarizeInvention(row: InventionRow, grades: LookupItem[]): string {
  const gradeName =
    row.grade_id != null
      ? (grades.find((g) => g.id === row.grade_id)?.name ?? "학년 미상")
      : "학년 미상";

  return [
    `제목: ${row.simple_title ?? row.original_title ?? "(제목 없음)"}`,
    `학년: ${gradeName}`,
    row.simple_summary ? `요약: ${row.simple_summary}` : null,
    row.problem ? `문제: ${row.problem}` : null,
    row.solution ? `해결: ${row.solution}` : null,
    splitTags(row.problem_tag).length
      ? `문제유형: ${splitTags(row.problem_tag).join(", ")}`
      : null,
    splitTags(row.scamper).length ? `SCAMPER: ${splitTags(row.scamper).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── 도구별 실행 ──────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: unknown,
  session: SessionState,
): Promise<ToolOutcome> {
  const keep = (result: string, isError = false): ToolOutcome => ({
    result,
    session,
    events: [],
    isError,
  });

  if (!isToolName(name)) return keep(`알 수 없는 도구입니다: ${name}`, true);

  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (name as ToolName) {
    // ── 검색 ────────────────────────────────────────────────
    case "search_inventions": {
      const keyword = typeof args.keyword === "string" ? args.keyword.trim() : "";
      if (keyword.length < 2) {
        return keep("검색어는 2글자 이상이어야 합니다. 학생에게 조금 더 구체적으로 물어보세요.", true);
      }

      let found;
      try {
        found = await searchInventions(keyword);
      } catch (error) {
        const message =
          error instanceof SearchError
            ? error.message
            : "검색 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
        return keep(message, true);
      }

      if (found.rows.length === 0) {
        return keep(
          `"${keyword}"으로는 선배들의 발명을 찾지 못했습니다. ` +
            "학생에게 다른 낱말로 바꿔 보자고 제안하세요. (예: 더 넓은 낱말, 비슷한 말)",
          true,
        );
      }

      putSearch(session.sessionId, {
        keyword,
        rows: found.rows,
        grades: found.grades,
        categories: found.categories,
      });

      const grades = gradeNameMap(found.grades);
      const choices = availableValues(found.rows, grades);
      const snapshot: SearchSnapshot = {
        keyword,
        totalCount: found.totalCount,
        loadedCount: Math.min(found.rows.length, MAX_LOADED),
        filters: { grades: [], problemTags: [], scamper: [] },
        availableGrades: choices.grades,
        availableProblemTags: choices.problemTags,
        availableScamper: choices.scamper,
        focusedId: null,
      };

      const next: SessionState = { ...session, search: snapshot };
      const { text } = statsFor(snapshot, found);

      return {
        result: `${text}\n\n${describeChoices(snapshot)}`,
        session: next,
        events: [
          {
            type: "results",
            rows: found.rows,
            grades: found.grades,
            categories: found.categories,
          },
          { type: "state", session: next },
        ],
        isError: false,
      };
    }

    case "apply_filters": {
      const snapshot = session.search;
      if (!snapshot) {
        return keep(
          "아직 검색한 결과가 없습니다. 먼저 search_inventions로 검색부터 하세요.",
          true,
        );
      }

      const loaded = await loadSearch(session);
      if (!loaded) {
        return keep(
          "검색 결과를 다시 불러오지 못했습니다. search_inventions로 한 번 더 검색해 주세요.",
          true,
        );
      }

      const requested = {
        grades: asStringArray(args.grades),
        problemTags: asStringArray(args.problemTags),
        scamper: asStringArray(args.scamper),
      };

      const gradeCheck = sanitizeFilterValues(requested.grades, snapshot.availableGrades);
      const problemCheck = sanitizeFilterValues(
        requested.problemTags,
        snapshot.availableProblemTags,
      );
      const scamperCheck = sanitizeFilterValues(requested.scamper, snapshot.availableScamper);

      // 생략한 항목은 지금 상태를 유지한다
      const filters: SearchFilters = {
        grades: requested.grades === undefined ? snapshot.filters.grades : gradeCheck.kept,
        problemTags:
          requested.problemTags === undefined
            ? snapshot.filters.problemTags
            : problemCheck.kept,
        scamper:
          requested.scamper === undefined ? snapshot.filters.scamper : scamperCheck.kept,
      };

      const nextSnapshot: SearchSnapshot = { ...snapshot, filters };
      const next: SessionState = { ...session, search: nextSnapshot };
      const { filtered, text } = statsFor(nextSnapshot, loaded);

      const dropped = [
        ...gradeCheck.dropped,
        ...problemCheck.dropped,
        ...scamperCheck.dropped,
      ];
      const notes: string[] = [];
      if (dropped.length) {
        notes.push(
          `※ 목록에 없어 무시한 값: ${dropped.join(", ")}. ` +
            "학생에게는 없는 조건이라고 솔직히 말하고, 고를 수 있는 값 중에서 안내하세요.",
        );
      }
      if (filtered.length === 0) {
        notes.push(
          "※ 조건에 맞는 발명이 하나도 없습니다. 필터를 하나 풀어 보자고 제안하세요.",
        );
      }

      return {
        result: [text, describeChoices(nextSnapshot), ...notes].join("\n\n"),
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "get_statistics": {
      const snapshot = session.search;
      if (!snapshot) {
        return keep("아직 검색한 결과가 없습니다. 먼저 search_inventions로 검색하세요.", true);
      }
      const loaded = await loadSearch(session);
      if (!loaded) {
        return keep(
          "검색 결과를 다시 불러오지 못했습니다. search_inventions로 한 번 더 검색해 주세요.",
          true,
        );
      }
      return keep(statsFor(snapshot, loaded).text);
    }

    case "show_invention": {
      const snapshot = session.search;
      const inventionId = typeof args.inventionId === "string" ? args.inventionId.trim() : "";

      if (!snapshot) {
        return keep("아직 검색한 결과가 없습니다. 먼저 search_inventions로 검색하세요.", true);
      }
      const loaded = await loadSearch(session);
      if (!loaded) {
        return keep(
          "검색 결과를 다시 불러오지 못했습니다. search_inventions로 한 번 더 검색해 주세요.",
          true,
        );
      }

      const row = loaded.rows.find((item) => item.id === inventionId);
      if (!row) {
        const samples = loaded.rows.slice(0, 5).map((item) => item.id).join(", ");
        return keep(
          `그 id(${inventionId || "빈 값"})는 지금 결과 목록에 없습니다. ` +
            `목록에 있는 id 예시: ${samples}. 없는 id를 지어내지 마세요.`,
          true,
        );
      }

      const nextSnapshot: SearchSnapshot = { ...snapshot, focusedId: row.id };
      const next: SessionState = { ...session, search: nextSnapshot };

      return {
        result: `상세 카드를 띄웠습니다.\n${summarizeInvention(row, loaded.grades)}`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    // ── 특허 ────────────────────────────────────────────────
    case "generate_kipris_query": {
      const built = buildKiprisQuery({
        object: asStringArray(args.object) ?? [],
        problem: asStringArray(args.problem),
        solution: asStringArray(args.solution),
        method: asStringArray(args.method),
        effect: asStringArray(args.effect),
      });

      if (!built.query) {
        return keep(
          built.advice ??
            "검색식을 만들지 못했습니다. 최소한 '발명 대상' 낱말은 넣어야 합니다.",
          true,
        );
      }

      // 검색식만 만든 단계 — 아직 조회 전이라 건수는 알 수 없다
      const nextSnapshot: PatentSnapshot = { query: built.query, totalCount: -1, loadedCount: 0 };
      const next: SessionState = { ...session, patent: nextSnapshot };

      return {
        result: `${describeFormula(built)}\n\n이 검색식으로 조회하려면 search_kipris를 호출하세요.`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "search_kipris": {
      const query =
        typeof args.query === "string" && args.query.trim()
          ? args.query.trim()
          : (session.patent?.query ?? "");

      if (!query) {
        return keep(
          "검색식이 없습니다. 먼저 generate_kipris_query로 검색식을 만드세요.",
          true,
        );
      }

      let found;
      try {
        found = await searchKipris(query);
      } catch (error) {
        const message =
          error instanceof KiprisError
            ? error.message
            : "특허 조회 중 문제가 생겼습니다.";
        return keep(
          `${message} 학생에게 상황을 솔직히 말하고, 잠시 뒤 다시 해 보자고 안내하세요.`,
          true,
        );
      }

      const nextSnapshot: PatentSnapshot = {
        query,
        totalCount: found.totalCount,
        loadedCount: found.patents.length,
      };
      const next: SessionState = { ...session, patent: nextSnapshot };

      return {
        result: describePatents(query, found.totalCount, found.patents),
        session: next,
        events: [
          {
            type: "patents",
            query,
            patents: found.patents,
            totalCount: found.totalCount,
          },
          { type: "state", session: next },
        ],
        isError: false,
      };
    }

    // ── 노트·퀘스트 ─────────────────────────────────────────
    case "update_note": {
      const stage = asStage(args.stage);
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";

      if (stage === null) return keep("stage는 0~5 사이의 숫자여야 합니다.", true);
      if (summary.length < 5) {
        return keep("summary가 너무 짧습니다. 무엇을 나눴는지 2~4문장으로 적어 주세요.", true);
      }

      const entry: NoteEntry = {
        stage,
        summary,
        details:
          args.details && typeof args.details === "object"
            ? (args.details as Record<string, unknown>)
            : undefined,
        at: Date.now(),
      };

      const next: SessionState = { ...session, notes: upsertNote(session.notes, entry) };
      return {
        result: `${stage}단계 기록을 발명노트에 저장했습니다.`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "complete_stage": {
      const stage = asStage(args.stage);
      if (stage === null) return keep("stage는 0~5 사이의 숫자여야 합니다.", true);

      // 승급 전 담당 캐릭터 — 배턴터치 연출에서 "누가 떠나는지" 표시에 쓴다
      const from = STAGES[session.quest.currentStage].character;
      const outcome = advanceStage(session.quest, stage, args.artifact);

      if (!outcome.ok) {
        // 실패해도 재시도 횟수는 올라간다 (막힘 신호 기록)
        const next: SessionState = { ...session, quest: outcome.state };
        return { result: outcome.message, session: next, events: [], isError: true };
      }

      // 0단계 산출물에서 별명을 받아 세션에 고정한다
      const artifact = (args.artifact ?? {}) as Record<string, unknown>;
      const nickname =
        stage === 0 && typeof artifact.nickname === "string" && artifact.nickname.trim()
          ? artifact.nickname.trim()
          : session.nickname;

      const next: SessionState = { ...session, quest: outcome.state, nickname };
      const events: ChatEvent[] = [];

      if (outcome.characterChanged) {
        events.push({
          type: "handoff",
          from,
          to: outcome.nextCharacter,
          stage: outcome.nextStage,
        });
      }
      events.push({ type: "state", session: next });

      return { result: outcome.message, session: next, events, isError: false };
    }

    default:
      return keep(
        `${name} 도구는 아직 준비 중입니다. 학생에게 "그 기능은 아직 준비 중"이라고 ` +
          "솔직히 말하고 대화를 이어가세요.",
        true,
      );
  }
}

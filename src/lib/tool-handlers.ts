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

import { castAt, EXPERT_IDS, hostAt, isExpertId, withFriends } from "./cast";
import { getCharacter } from "./characters";
import { handoffExitText, stageMission } from "./flow";
import {
  buildKiprisQuery,
  describeFormula,
  DEFAULT_GROUPS,
  filledGroups,
  GROUP_KEYS,
  overlayGroups,
  pickGroups,
  type GroupKey,
} from "./kipris/formula";
import { lookupIpc } from "./kipris/ipc";
import { fetchInventionKeywords } from "./kipris/keywords";
import { KiprisError, searchKipris } from "./kipris/service";
import {
  advanceStage,
  NO_EVIDENCE,
  trackOf,
  type StageEvidence,
  type StageId,
} from "./quest";
import { stageAt, stageIdsOf } from "./track";
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
import type { Patent, PatentSnapshot, QueryParts } from "@/types/kipris";
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

/** 이 대화의 트랙에 실제로 있는 단계 번호인가 (트랙마다 단계 수가 다르다) */
function asStage(value: unknown, ids: StageId[]): StageId | null {
  const n = typeof value === "number" ? value : Number(value);
  return ids.includes(n) ? n : null;
}

/** "stage는 0~5 사이의 숫자여야 합니다." — 트랙의 단계 범위로 만든다 */
function stageRangeNote(ids: StageId[]): string {
  return `stage는 ${ids[0]}~${ids[ids.length - 1]} 사이의 숫자여야 합니다.`;
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

/** 화면 맨 앞에 보이는 발명 몇 건 — AI가 id로 가리킬 수 있게 목록으로 준다 */
const LISTED_ROWS = 12;

/**
 * AI에게 주는 발명 목록.
 *
 * 이걸 안 주면 AI는 화면에 무엇이 떠 있는지 모른 채 통계만 읊게 되고,
 * show_invention·generate_kipris_query 처럼 id가 필요한 도구를 쓸 수가 없다
 * (실제로 학생에게 "id를 알려 줘"라고 되묻는 일이 있었다).
 */
function describeRows(rows: InventionRow[], grades: LookupItem[]): string {
  if (rows.length === 0) return "";

  const name = (row: InventionRow) =>
    row.grade_id != null
      ? (grades.find((g) => g.id === row.grade_id)?.name ?? "학년 미상")
      : "학년 미상";

  const lines = rows.slice(0, LISTED_ROWS).map((row) => {
    const title = row.simple_title ?? row.original_title ?? "(제목 없음)";
    const summary = row.simple_summary?.replace(/\s+/g, " ").slice(0, 60) ?? "";
    return `- id=${row.id} | ${title} | ${name(row)}${summary ? ` | ${summary}` : ""}`;
  });

  return [
    `지금 화면 맨 앞에 보이는 발명 ${lines.length}건 ` +
      `(id가 필요한 도구는 반드시 이 목록의 id를 쓴다):`,
    ...lines,
    rows.length > lines.length
      ? `…그 밖에 ${rows.length - lines.length}건이 더 있습니다. ` +
        "다른 것이 필요하면 필터를 걸거나 검색어를 바꾸세요."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
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

const GROUP_LABELS: Record<GroupKey, string> = {
  object: "발명 대상",
  problem: "문제",
  solution: "해결 수단",
  method: "방법·원리",
  effect: "효과",
};

/**
 * 검색식에 넣지 않고 남겨 둔 낱말을 AI에게 알려 준다.
 * 안 알려 주면 AI는 자기가 고른 낱말이 통째로 사라진 줄 알고 다시 만들려 든다.
 */
function describeReserved(parts: QueryParts, activeGroups: GroupKey[]): string | null {
  const reserved = GROUP_KEYS.filter(
    (key) => !activeGroups.includes(key) && (parts[key]?.length ?? 0) > 0,
  );
  if (reserved.length === 0) return null;

  return [
    "남겨 둔 낱말 (검색식에는 아직 넣지 않았습니다):",
    ...reserved.map((key) => `- ${GROUP_LABELS[key]}: ${(parts[key] ?? []).join(", ")}`),
    "다섯 갈래를 모두 곱하면 0건이 되는 일이 잦아, 처음에는 대상과 해결 수단만 넣습니다.",
    "결과가 너무 많으면 학생에게 우측 패널에서 갈래를 하나 더 켜 보자고 안내하세요.",
  ].join("\n");
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

  // 이 대화가 밟고 있는 학습 프로그램 — 단계 번호·이름·대본이 전부 여기서 나온다
  const track = trackOf(session.quest);
  const stageIds = stageIdsOf(track);

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
      const { filtered, text } = statsFor(snapshot, found);

      return {
        result: [
          text,
          describeRows(filtered, found.grades),
          describeChoices(snapshot),
        ]
          .filter(Boolean)
          .join("\n\n"),
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
        result: [
          text,
          describeRows(filtered, loaded.grades),
          describeChoices(nextSnapshot),
          ...notes,
        ]
          .filter(Boolean)
          .join("\n\n"),
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
      const stats = statsFor(snapshot, loaded);
      return keep(
        [stats.text, describeRows(stats.filtered, loaded.grades)].filter(Boolean).join("\n\n"),
      );
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
      const basedOnId =
        typeof args.basedOnInventionId === "string" ? args.basedOnInventionId.trim() : "";

      // ── 기초 검색식: 학생이 고른 선배 발명에서 빌려 온다 ──────────────
      // 학생은 IPC 분류를 고를 줄 모른다. 비슷한 발명에 이미 붙어 있는 분류와
      // 정리된 키워드를 밑바탕으로 깔아 주는 것이 IdeaPrism이 하는 일이다.
      // 이 절차는 지침이 아니라 여기서 막는다 — 분류 없이 낱말로만 찾으면
      // 엉뚱한 분야의 특허가 잔뜩 섞인다.
      if (!basedOnId) {
        return keep(
          "기초로 삼을 선배 발명을 먼저 골라야 검색식을 만들 수 있습니다.\n" +
            "학생은 특허 분류(IPC)를 고를 줄 모릅니다. 그래서 IdeaPrism은 비슷한 선배 발명에 " +
            "이미 붙어 있는 분류와 키워드를 빌려 씁니다.\n" +
            "1) search_inventions 로 학생 아이디어와 비슷한 발명을 찾고\n" +
            "2) 학생에게 '어느 게 네 아이디어와 가장 비슷해?'라고 물어 하나를 고른 뒤\n" +
            "3) 그 발명의 id를 basedOnInventionId 로 넣어 다시 부르세요.",
          true,
        );
      }

      const loaded = await loadSearch(session);
      const row = loaded?.rows.find((item) => item.id === basedOnId);

      if (!row) {
        const samples = loaded?.rows.slice(0, 5).map((item) => item.id).join(", ");
        return keep(
          `그 id(${basedOnId})는 지금 검색 결과 목록에 없습니다. ` +
            (samples
              ? `목록에 있는 id 예시: ${samples}. 없는 id를 지어내지 마세요.`
              : "먼저 search_inventions 로 비슷한 발명을 찾은 뒤 그중에서 고르세요."),
          true,
        );
      }

      const keywords = await fetchInventionKeywords(row.id);
      const base: QueryParts = keywords ? { ...keywords.simple } : { object: [] };

      // IPC는 발명 자료에 적힌 코드를 쓴다 (뜻은 분류표에서 확인)
      const code = row.ipc?.trim().toUpperCase() ?? "";
      const meaning = code ? await lookupIpc(code) : null;
      if (code) base.ipc = code;

      const basedOn: PatentSnapshot["basedOn"] = {
        id: row.id,
        title: row.simple_title || row.original_title || "(제목 없음)",
        ipc: code || null,
        drawingUrl: row.drawing_url,
      };

      const baseNote = [
        `기초로 삼은 선배 발명: ${basedOn.title}`,
        code
          ? `- IPC 분류: ${code}${meaning ? ` (${meaning})` : ""}`
          : "- IPC 분류: 이 발명 자료에는 없습니다. 분류 없이 낱말로만 찾게 되니, " +
            "결과가 엉뚱하면 IPC가 적힌 다른 비슷한 발명으로 바꿔 보자고 제안하세요.",
        keywords
          ? "- 이 발명에 정리된 키워드를 밑바탕으로 깔았습니다."
          : "- 이 발명에는 정리된 키워드가 없어 네가 준 낱말만 썼습니다.",
      ].join("\n");

      // AI가 낱말을 준 갈래만 학생 아이디어 것으로 갈아 끼운다
      const parts = overlayGroups(base, {
        object: asStringArray(args.object) ?? [],
        problem: asStringArray(args.problem),
        solution: asStringArray(args.solution),
        method: asStringArray(args.method),
        effect: asStringArray(args.effect),
      });

      // 1.0과 같은 기준 — 처음에는 대상·해결수단만 넣는다.
      // 다섯 갈래를 다 곱하면 0건이 되는 일이 잦다 (formula.ts 의 DEFAULT_GROUPS).
      const activeGroups = filledGroups(parts, DEFAULT_GROUPS);
      const built = buildKiprisQuery(pickGroups(parts, activeGroups));

      if (!built.query) {
        return keep(
          "검색식을 만들지 못했습니다. 고른 발명에 정리된 키워드가 없으니 " +
            "학생 아이디어에서 '발명 대상(object)' 낱말이라도 뽑아 함께 넣어 주세요.",
          true,
        );
      }

      // 검색식만 만든 단계 — 아직 조회 전이라 건수는 알 수 없다.
      // 꺼 둔 갈래의 낱말까지 실어야 학생이 패널에서 하나씩 켜 볼 수 있다.
      const nextSnapshot: PatentSnapshot = {
        query: built.query,
        totalCount: -1,
        loadedCount: 0,
        parts,
        activeGroups,
        basedOn,
      };
      const next: SessionState = { ...session, patent: nextSnapshot };

      return {
        result: [
          describeFormula(built),
          baseNote,
          describeReserved(parts, activeGroups),
          "이 검색식으로 조회하려면 search_kipris를 호출하세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "search_kipris": {
      // 검색식은 프로그램이 들고 있는 것만 쓴다 (아키텍처 원칙 1).
      // AI가 문자열을 건네게 두면, 갈래를 다 이어 붙인 검색식을 스스로 지어내
      // 화면에 보이는 검색식과 실제 조회가 어긋난다.
      const query = session.patent?.query ?? "";

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
        // 검색식이 세션의 것 그대로이므로 갈래 낱말·기초 발명도 그대로 이어 간다
        parts: session.patent?.parts,
        activeGroups: session.patent?.activeGroups,
        basedOn: session.patent?.basedOn,
        page: found.page,
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
      const stage = asStage(args.stage, stageIds);
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";

      if (stage === null) return keep(stageRangeNote(stageIds), true);
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

    case "call_expert": {
      // 목록에 없는 사람은 부르지 못한다 — 교사·선배는 손님이 아니다 (아키텍처 원칙 1)
      if (!isExpertId(args.expert)) {
        return keep(
          `부를 수 있는 전문가는 ${EXPERT_IDS.join(", ")} 뿐입니다. ` +
            "선배나 선생님은 이 도구로 부를 수 없습니다.",
          true,
        );
      }

      if (session.guest === args.expert) {
        return keep(
          `${getCharacter(args.expert).name}은(는) 이미 와 있습니다. ` +
            "다시 부르지 말고 [말:" +
            args.expert +
            "] 표식으로 바로 말을 건네세요.",
          true,
        );
      }

      const next: SessionState = { ...session, guest: args.expert };
      const who = getCharacter(args.expert);
      return {
        result:
          `${who.name}이(가) 대화에 들어왔습니다. 이제 [말:${args.expert}] 표식으로 ` +
          `직접 말하게 할 수 있습니다. 먼저 짧게 등장 인사를 시키고, ` +
          `무엇 때문에 불렀는지 학생에게 한 문장으로 짚어 주세요.`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "send_off_expert": {
      if (!session.guest) {
        return keep("지금 와 있는 전문가가 없습니다.", true);
      }
      const who = getCharacter(session.guest);
      const next: SessionState = { ...session, guest: null };
      return {
        result: `${who.name}이(가) 돌아갔습니다. 이제 원래 사람들끼리 대화를 이어가세요.`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "complete_stage": {
      const stage = asStage(args.stage, stageIds);
      if (stage === null) return keep(stageRangeNote(stageIds), true);

      // 승급 전 담당 캐릭터 — 배턴터치 연출에서 "누가 떠나는지" 표시에 쓴다
      const from = hostAt(session.cast, session.quest.currentStage);

      // AI의 주장이 아니라 프로그램이 실제로 한 일을 넘긴다 (아키텍처 원칙 4).
      // 5단계는 이걸로 "특허를 정말 조회했는가"를 판정한다.
      const evidence: StageEvidence =
        session.patent && session.patent.totalCount >= 0
          ? {
              kiprisQuery: session.patent.query,
              kiprisTotal: session.patent.totalCount,
              basedOnInventionId: session.patent.basedOn?.id ?? null,
            }
          : NO_EVIDENCE;

      // 0단계에서 선생님이 짝지어 준 친구 두 명을 1~4단계에 앉힌다.
      // 승급을 판정하기 "전"에 바꿔야 배턴터치가 그 두 명에게 걸린다.
      const artifactRecord = (args.artifact ?? {}) as Record<string, unknown>;
      const cast =
        stage === 0
          ? withFriends(session.cast, artifactRecord.matchedFriends)
          : session.cast;

      const outcome = advanceStage(
        session.quest,
        stage,
        args.artifact,
        Date.now(),
        evidence,
        cast,
      );

      if (!outcome.ok) {
        // 실패해도 재시도 횟수는 올라간다 (막힘 신호 기록)
        const next: SessionState = { ...session, quest: outcome.state };
        return { result: outcome.message, session: next, events: [], isError: true };
      }

      // 0단계 산출물에서 별명을 받아 세션에 고정한다
      const nickname =
        stage === 0 &&
        typeof artifactRecord.nickname === "string" &&
        artifactRecord.nickname.trim()
          ? artifactRecord.nickname.trim()
          : session.nickname;

      // 단계가 바뀌면 불려 와 있던 전문가는 돌아간다 —
      // 앞 단계 이야기 하러 온 사람이 다음 단계까지 따라다니면 대화가 무거워진다
      const next: SessionState = {
        ...session,
        quest: outcome.state,
        nickname,
        cast,
        guest: stage === outcome.nextStage ? session.guest : null,
      };
      const events: ChatEvent[] = [];

      // 승급 후 AI에게 줄 안내는 flow/*.md 에서 가져온다 (대표님이 고치는 파일).
      // 담당이 바뀌면 "퇴장 인사" 지침을, 그대로면 다음 단계에서 할 일을 준다.
      let guidance = outcome.message;
      if (outcome.characterChanged) {
        // 다음 단계에 둘이 있으면 둘 다 소개하게 한다
        guidance = await handoffExitText(
          from,
          castAt(cast, outcome.nextStage),
          outcome.nextStage,
          track,
        );
        events.push({
          type: "handoff",
          from,
          to: outcome.nextCharacter,
          stage: outcome.nextStage,
        });
      } else if (stage !== outcome.nextStage) {
        guidance =
          `${stage}단계 완료! 이어서 ${outcome.nextStage}단계 ` +
          `「${stageAt(track, outcome.nextStage).label}」을 진행하세요.\n\n` +
          (await stageMission(outcome.nextStage, track));
      }

      events.push({ type: "state", session: next });

      return { result: guidance, session: next, events, isError: false };
    }

    default:
      return keep(
        `${name} 도구는 아직 준비 중입니다. 학생에게 "그 기능은 아직 준비 중"이라고 ` +
          "솔직히 말하고 대화를 이어가세요.",
        true,
      );
  }
}

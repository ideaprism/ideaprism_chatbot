"use client";

import { Check, Copy, Loader2, Search, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PatentCard } from "./PatentCard";
import { buildKiprisQuery } from "@/lib/kipris/formula";
import { cn } from "@/lib/utils";
import type { Patent, PatentSnapshot, QueryParts } from "@/types/kipris";

/** 특허 패널을 처음 세울 재료 — 발명 상세에서 넘어왔을 때 함께 온다 */
export interface PatentSeed {
  inventionId: string;
  title: string;
  ipc: string | null;
}

/** 한 쪽에 보여 주는 특허 수 — 서버(KIPRIS_ROWS)와 같은 값 */
const PAGE_SIZE = 10;

type CategoryKey = "O" | "P" | "S" | "M" | "E";
type FieldKey = "object" | "problem" | "solution" | "method" | "effect";
type TemplateFields = Record<FieldKey | "ipc", string>;

/**
 * OPSME 5갈래 — 1.0의 `OPSME_CATEGORIES` 와 같은 이름·같은 색.
 * 색 클래스는 Tailwind가 소스에서 글자 그대로 찾아 쓰므로 조합해 만들지 않고 통째로 적는다.
 */
const CATEGORIES: Array<{
  key: CategoryKey;
  field: FieldKey;
  name: string;
  placeholder: string;
  dotOn: string;
  chipOn: string;
  inputOn: string;
}> = [
  {
    key: "O",
    field: "object",
    name: "발명대상",
    placeholder: "이불장",
    dotOn: "bg-blue-500 text-white",
    chipOn: "border-blue-300 bg-blue-100 text-blue-700",
    inputOn: "border-blue-200 bg-white focus:ring-blue-500",
  },
  {
    key: "P",
    field: "problem",
    name: "문제점",
    placeholder: "수납어려움",
    dotOn: "bg-red-600 text-white",
    chipOn: "border-red-300 bg-red-100 text-red-700",
    inputOn: "border-red-200 bg-white focus:ring-red-500",
  },
  {
    key: "S",
    field: "solution",
    name: "해결수단",
    placeholder: "이동식 봉",
    dotOn: "bg-green-600 text-white",
    chipOn: "border-green-300 bg-green-100 text-green-700",
    inputOn: "border-green-200 bg-white focus:ring-green-500",
  },
  {
    key: "M",
    field: "method",
    name: "방법/원리",
    placeholder: "봉에 끼움",
    dotOn: "bg-purple-600 text-white",
    chipOn: "border-purple-300 bg-purple-100 text-purple-700",
    inputOn: "border-purple-200 bg-white focus:ring-purple-500",
  },
  {
    key: "E",
    field: "effect",
    name: "효과",
    placeholder: "수납효율",
    dotOn: "bg-amber-500 text-white",
    chipOn: "border-amber-300 bg-amber-100 text-amber-700",
    inputOn: "border-amber-200 bg-white focus:ring-amber-500",
  },
];

const FIELD_OF: Record<CategoryKey, FieldKey> = {
  O: "object",
  P: "problem",
  S: "solution",
  M: "method",
  E: "effect",
};

const EMPTY_FIELDS: TemplateFields = {
  ipc: "",
  object: "",
  problem: "",
  solution: "",
  method: "",
  effect: "",
};

function fieldsFrom(parts: QueryParts | null | undefined): TemplateFields {
  if (!parts) return EMPTY_FIELDS;
  const join = (values: string[] | undefined) => (values ?? []).join(", ");
  return {
    ipc: parts.ipc ?? "",
    object: join(parts.object),
    problem: join(parts.problem),
    solution: join(parts.solution),
    method: join(parts.method),
    effect: join(parts.effect),
  };
}

/**
 * 1.0의 기본값 — 대상(O)과 해결수단(S)만 켠다.
 * 다섯 갈래를 모두 켜면 조건이 너무 많이 겹쳐 결과가 몇 건으로 줄어든다.
 */
const DEFAULT_ACTIVE: Record<CategoryKey, boolean> = {
  O: true,
  P: false,
  S: true,
  M: false,
  E: false,
};

/**
 * AI가 5단계에서 직접 고른 갈래는 그대로 켠다.
 *
 * 1.0의 자료는 다섯 갈래가 미리 다 채워져 있어 "무엇을 쓸지"를 화면이 골라야 하지만,
 * 여기서는 AI가 이미 골라서 넘긴 것이라 임의로 꺼 버리면 AI가 학생에게 말한 검색식과
 * 화면의 검색식이 달라진다.
 */
function activeFrom(fields: TemplateFields): Record<CategoryKey, boolean> {
  const filled = (value: string) => value.trim().length > 0;
  const active = {
    O: filled(fields.object),
    P: filled(fields.problem),
    S: filled(fields.solution),
    M: filled(fields.method),
    E: filled(fields.effect),
  };
  return Object.values(active).some(Boolean) ? active : DEFAULT_ACTIVE;
}

function splitKeywords(value: string): string[] {
  return value
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

/** 5칸 + 켜진 갈래 → 검색식 재료. 꺼 둔 갈래는 빠진다. */
function partsOf(
  fields: TemplateFields,
  active: Record<CategoryKey, boolean>,
): QueryParts {
  return {
    object: active.O ? splitKeywords(fields.object) : [],
    problem: active.P ? splitKeywords(fields.problem) : [],
    solution: active.S ? splitKeywords(fields.solution) : [],
    method: active.M ? splitKeywords(fields.method) : [],
    effect: active.E ? splitKeywords(fields.effect) : [],
    ipc: fields.ipc.trim() || undefined,
  };
}

function formulaOf(fields: TemplateFields, active: Record<CategoryKey, boolean>): string {
  return buildKiprisQuery(partsOf(fields, active)).query;
}

/**
 * 선행기술조사 패널 — 1.0의 `PatentSearchView` 를 이식.
 *
 * 검색식은 OPSME 5칸에서 자동으로 조립된다. 문법(+, *, 괄호)은 프로그램이 만들고
 * (아키텍처 원칙 1) 학생은 낱말만 고친다. 여기서 몇 번을 다시 찾아도 AI를 거치지
 * 않으므로 비용이 들지 않는다.
 *
 * 부모가 "새 재료가 왔을 때만" key 를 바꿔 주므로, 학생이 스스로 조회하는 동안에는
 * 고쳐 둔 낱말과 켜 둔 갈래가 그대로 남는다.
 */
export function PatentPanel({
  snapshot,
  seed,
  patents,
  onResult,
}: {
  snapshot: PatentSnapshot | null;
  seed: PatentSeed | null;
  patents: Patent[];
  onResult: (
    query: string,
    patents: Patent[],
    totalCount: number,
    page: number,
    parts: QueryParts,
  ) => void;
}) {
  // ── 검색식 재료 ────────────────────────────────────────────
  // 부모가 새 재료가 왔을 때만 key 를 바꾸므로, 여기 초기값은 "이번 재료"를 뜻한다
  const initial = seed
    ? { ...EMPTY_FIELDS, ipc: seed.ipc ?? "" }
    : fieldsFrom(snapshot?.parts);

  const [fields, setFields] = useState<TemplateFields>(initial);
  const [active, setActive] = useState<Record<CategoryKey, boolean>>(() =>
    seed ? DEFAULT_ACTIVE : activeFrom(initial),
  );

  /** 1.0 자료에 정리돼 있는 두 벌(쉬운 쪽/자세한 쪽) — 선배 발명에서 넘어왔을 때만 생긴다 */
  const [keywordSets, setKeywordSets] = useState<{ simple: QueryParts; expert: QueryParts } | null>(
    null,
  );
  const [mode, setMode] = useState<"simple" | "expert">("simple");
  const [seeding, setSeeding] = useState(Boolean(seed));
  const [ipcDescription, setIpcDescription] = useState<string | null>(null);

  // ── 조회 상태 ──────────────────────────────────────────────
  const [query, setQuery] = useState(() => snapshot?.query ?? formulaOf(initial, activeFrom(initial)));
  const [results, setResults] = useState<Patent[]>(patents);
  const [totalCount, setTotalCount] = useState(snapshot?.totalCount ?? -1);
  const [page, setPage] = useState(snapshot?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0;
  const parts = useMemo(() => partsOf(fields, active), [fields, active]);

  /** 조회 한 번. 검색식을 인자로 받는 것은, 낱말을 고친 직후 화면 상태를 기다리지 않고 바로 찾기 위해서다. */
  const running = useRef(false);
  const search = useCallback(
    async (text: string, wanted: number, used: QueryParts) => {
      const formula = text.trim();
      if (!formula || running.current) return;

      running.current = true;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/kipris", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: formula, page: wanted }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "조회에 실패했습니다.");

        setResults(data.patents);
        setTotalCount(data.totalCount);
        setPage(data.page ?? wanted);
        // 바뀐 결과를 세션에 실어 둔다 — 다음 턴에 특허 탐정도 같은 화면을 본다
        onResult(data.query, data.patents, data.totalCount, data.page ?? wanted, used);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
        setResults([]);
        setTotalCount(0);
      } finally {
        running.current = false;
        setLoading(false);
      }
    },
    [onResult],
  );

  /**
   * 5칸을 고치면 검색식도 함께 다시 만든다 (1.0과 같은 동작).
   * 한 곳에서 같이 바꾸므로, 화면이 두 번 그려지거나 검색식이 한 박자 늦는 일이 없다.
   */
  const applyTemplate = (
    nextFields: TemplateFields,
    nextActive: Record<CategoryKey, boolean>,
  ) => {
    setFields(nextFields);
    setActive(nextActive);
    const formula = formulaOf(nextFields, nextActive);
    if (formula) setQuery(formula);
  };

  const toggleCategory = (key: CategoryKey) =>
    applyTemplate(fields, { ...active, [key]: !active[key] });

  const updateField = (field: keyof TemplateFields, value: string) =>
    applyTemplate({ ...fields, [field]: value }, active);

  // 낱말만 바꾸고 켜 둔 갈래는 건드리지 않는다 (1.0과 같은 동작)
  const switchMode = (next: "simple" | "expert") => {
    setMode(next);
    if (!keywordSets) return;
    applyTemplate({ ...fieldsFrom(keywordSets[next]), ipc: fields.ipc }, active);
  };

  // 선배 발명에서 넘어왔으면, 1.0이 쓰는 것과 같은 정리된 키워드를 가져와 5칸을 채우고
  // 1.0처럼 한 번 자동으로 찾아 준다.
  useEffect(() => {
    if (!seed) return;
    let cancelled = false;

    (async () => {
      // 정리된 키워드가 없는 발명도 많다 — 그때는 제목을 발명대상으로 놓고 시작한다
      let next: TemplateFields = { ...EMPTY_FIELDS, ipc: seed.ipc ?? "", object: seed.title };
      try {
        const response = await fetch(
          `/api/invention-keywords?id=${encodeURIComponent(seed.inventionId)}`,
        );
        const data = await response.json();
        if (data?.found && data.simple && data.expert) {
          if (!cancelled) setKeywordSets({ simple: data.simple, expert: data.expert });
          next = { ...fieldsFrom(data.simple), ipc: seed.ipc ?? "" };
        }
      } catch {
        /* 키워드를 못 받아도 학생이 직접 채워 넣을 수 있다 */
      }
      if (cancelled) return;

      // 1.0과 같이 대상·해결수단만 켠 채로 시작한다 — 나머지는 학생이 필요할 때 켠다
      setFields(next);
      setActive(DEFAULT_ACTIVE);
      setSeeding(false);

      const formula = formulaOf(next, DEFAULT_ACTIVE);
      if (formula) {
        setQuery(formula);
        void search(formula, 1, partsOf(next, DEFAULT_ACTIVE));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seed, search]);

  // IPC 코드의 뜻 — 타자를 멈춘 뒤에 한 번만 조회한다
  useEffect(() => {
    const code = fields.ipc.trim();
    let cancelled = false;

    const timer = setTimeout(() => {
      if (!code) {
        setIpcDescription(null);
        return;
      }
      fetch(`/api/ipc?code=${encodeURIComponent(code)}`)
        .then((response) => response.json())
        .then((data) => {
          if (!cancelled) setIpcDescription(data?.description ?? null);
        })
        .catch(() => {
          if (!cancelled) setIpcDescription(null);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fields.ipc]);

  const copy = async () => {
    if (!query.trim()) return;
    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 브라우저가 복사를 막으면 조용히 넘어간다 — 검색식은 화면에 그대로 보인다 */
    }
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto">
        {/* 검색식 만들기 */}
        <div className="space-y-4 border-b border-line bg-neutral-50 px-5 py-4">
          {seeding ? (
            <div className="flex items-center justify-center py-8 text-sm text-neutral-500">
              <Loader2 className="mr-2 size-5 animate-spin" />
              검색 키워드를 불러오는 중…
            </div>
          ) : (
            <>
              {/* 검색식 입력줄 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      void search(query, 1, parts);
                    }
                  }}
                  placeholder="검색식 입력"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-neutral-400"
                />
                <button
                  type="button"
                  onClick={copy}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium text-white transition-colors",
                    copied ? "bg-emerald-500" : "bg-neutral-500 hover:bg-neutral-600",
                  )}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "완료" : "복사"}
                </button>
                <button
                  type="button"
                  onClick={() => void search(query, 1, parts)}
                  disabled={loading || !query.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-300"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  검색
                </button>
              </div>

              {/* OPSME 구조화 템플릿 */}
              <div className="space-y-4 rounded-xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-600">
                      <span>📝</span> 검색식 구성
                    </h4>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTip(!showTip)}
                        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
                      >
                        <span className="flex size-4 items-center justify-center rounded-full border border-neutral-400 text-[10px] font-bold">
                          ?
                        </span>
                        검색도움말
                      </button>
                      {showTip && (
                        <div className="absolute left-0 top-7 z-30 w-72 rounded-lg border border-line bg-white p-3 shadow-lg">
                          <div className="space-y-1 text-[11px] leading-relaxed text-neutral-600">
                            <p>50건 정도가 나오게 검색식을 고쳐 보세요.</p>
                            <p>결과가 너무 많으면 갈래나 낱말을 더하고,</p>
                            <p>너무 적으면 낱말을 줄여 보세요.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowTip(false)}
                            aria-label="도움말 닫기"
                            className="absolute right-1 top-1 p-1 text-neutral-400 hover:text-neutral-700"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 쉬운 쪽 / 자세한 쪽 — 1.0에 정리된 키워드가 있을 때만 나온다 */}
                  {keywordSets && (
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "text-xs transition-colors",
                          mode === "simple" ? "font-bold text-neutral-900" : "text-neutral-400",
                        )}
                      >
                        Simple
                      </span>
                      <button
                        type="button"
                        onClick={() => switchMode(mode === "simple" ? "expert" : "simple")}
                        aria-label="키워드 자세히 보기 전환"
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          mode === "expert" ? "bg-neutral-900" : "bg-neutral-300",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block size-3.5 transform rounded-full bg-white shadow transition-transform",
                            mode === "expert" ? "translate-x-4.5" : "translate-x-1",
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          "text-xs transition-colors",
                          mode === "expert" ? "font-bold text-neutral-900" : "text-neutral-400",
                        )}
                      >
                        Expert
                      </span>
                    </div>
                  )}
                </div>

                {/* IPC 코드 + 뜻 */}
                <div className="space-y-1.5">
                  <label htmlFor="ipc-code" className="text-xs font-medium text-neutral-500">
                    IPC 코드
                  </label>
                  <div className="flex items-center rounded-lg border border-line bg-white focus-within:border-neutral-400">
                    <input
                      id="ipc-code"
                      type="text"
                      value={fields.ipc}
                      onChange={(event) => updateField("ipc", event.target.value)}
                      placeholder="A47B"
                      className="w-24 shrink-0 bg-transparent px-3 py-2 font-mono text-sm outline-none"
                    />
                    {fields.ipc.trim() && ipcDescription && (
                      <>
                        <span className="text-neutral-200">|</span>
                        <span className="truncate px-3 py-2 text-xs text-neutral-500">
                          {ipcDescription}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* 5갈래 */}
                <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @2xl:grid-cols-5">
                  {CATEGORIES.map((category) => {
                    const on = active[category.key];
                    return (
                      <div key={category.key} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => toggleCategory(category.key)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors",
                            on ? category.chipOn : "border-neutral-200 bg-neutral-100 text-neutral-400",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
                              on ? category.dotOn : "bg-neutral-300 text-neutral-500",
                            )}
                          >
                            {category.key}
                          </span>
                          {category.name}
                        </button>
                        <input
                          type="text"
                          value={fields[FIELD_OF[category.key]]}
                          onChange={(event) =>
                            updateField(FIELD_OF[category.key], event.target.value)
                          }
                          placeholder={category.placeholder}
                          disabled={!on}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1",
                            on
                              ? category.inputOn
                              : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400",
                          )}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-0.5 text-[11px] leading-relaxed text-neutral-400">
                  <p>💡 적정 검색결과를 위해 발명대상과 해결수단이 기본으로 켜져 있습니다.</p>
                  <p className="pl-5">
                    쉼표(,)로 여러 낱말을 넣을 수 있어요. 같은 칸의 낱말은 &lsquo;또는(+)&rsquo;으로,
                    칸과 칸은 &lsquo;그리고(*)&rsquo;로 묶입니다.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 조회 결과 */}
        <div className="px-5 py-4">
          {error && (
            <p className="mb-4 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <TriangleAlert className="mt-px size-4 shrink-0" />
              {error}
            </p>
          )}

          {!error && totalCount > 0 && (
            <p className="mb-3 text-xs text-neutral-500">
              총 <span className="font-bold text-neutral-900">{totalCount.toLocaleString()}</span>건
              {totalPages > 1 ? ` (${page}/${totalPages} 쪽)` : ""}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              <Loader2 className="mr-2 size-6 animate-spin" />
              찾는 중…
            </div>
          ) : totalCount < 0 && results.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              아직 찾아보지 않았어요.
              <br />
              위 검색식으로 &lsquo;검색&rsquo;을 눌러 보세요.
            </p>
          ) : results.length === 0 ? (
            !error && (
              <div className="py-12 text-center text-sm text-neutral-400">
                <div className="mb-3 text-3xl">🔍</div>
                비슷한 특허가 나오지 않았어요.
                <br />
                검색식이 너무 좁을 수 있으니 갈래를 하나 꺼 볼까요?
              </div>
            )
          ) : (
            <div className="space-y-3">
              {results.map((patent, index) => (
                <PatentCard
                  key={`${patent.applicationNumber || "no"}-${index}`}
                  patent={patent}
                  index={(page - 1) * PAGE_SIZE + index + 1}
                />
              ))}
            </div>
          )}

          {!loading && totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(next) => void search(query, next, parts)}
            />
          )}
        </div>
      </div>

      <p className="shrink-0 border-t border-line bg-neutral-50 px-5 py-2.5 text-center text-[11px] text-neutral-400">
        KIPRIS Plus를 통해 특허청과 같은 특허 정보를 실시간으로 보여 줍니다.
      </p>
    </div>
  );
}

/** 쪽 넘기기 — 1.0과 같이 최대 7개 번호를 보여 준다 */
function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const maxVisible = 7;
  const pages: number[] = [];

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, page - half);
    let end = Math.min(totalPages, page + half);
    if (page <= half) end = maxVisible;
    else if (page >= totalPages - half) start = totalPages - maxVisible + 1;
    for (let i = start; i <= end; i++) pages.push(i);
  }

  const arrow =
    "rounded border border-line px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:bg-neutral-100";

  return (
    <div className="mt-5 flex items-center justify-center gap-1">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} className={arrow}>
        &lt;
      </button>
      {pages.map((number) => (
        <button
          key={number}
          type="button"
          onClick={() => onChange(number)}
          className={cn(
            "min-w-8 rounded border px-2 py-1 text-xs tabular-nums",
            number === page
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-line hover:bg-neutral-100",
          )}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={arrow}
      >
        &gt;
      </button>
    </div>
  );
}

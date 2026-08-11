"use client";

import { LayoutGrid, List, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import { InventionCard } from "./InventionCard";
import { InventionDetailModal } from "./InventionDetailModal";
import {
  countFacets,
  filterRows,
  gradeNameMap,
  gradeNameOf,
  nameMap,
} from "@/lib/search/facets";
import { cn } from "@/lib/utils";
import type { SearchResults, FilterKind } from "@/hooks/useChat";
import type { InventionRow, SearchSnapshot } from "@/types/search";

/** 한 번에 그리는 카드 수 — 500장을 한꺼번에 그리면 브라우저가 버벅인다 */
const PAGE_SIZE = 30;

type ViewMode = "grid" | "list";

/**
 * 열 수는 "화면"이 아니라 "패널" 폭을 따라간다.
 *
 * 1.0은 검색 화면이 전체 폭이라 `md:` `lg:` 같은 화면 기준 단계로 충분했지만,
 * 여기서는 채팅이 36%를 쓰고 남은 64%가 패널이다. 화면 기준으로 열을 잡으면
 * 넓은 모니터에서도 카드가 짓눌린다. `@container` 는 "이 상자가 몇 rem인가"로
 * 따지므로 패널이 좁아지든 넓어지든 카드 폭이 일정하게 유지된다.
 */
const GRID_COLUMNS = "grid grid-cols-2 gap-4 @xl:grid-cols-3 @xl:gap-5 @3xl:grid-cols-4";

export function SearchPanel({
  snapshot,
  results,
  onToggleFilter,
  onClearFilters,
  onFocus,
  onSearch,
}: {
  snapshot: SearchSnapshot;
  results: SearchResults;
  onToggleFilter: (kind: FilterKind, value: string) => void;
  onClearFilters: () => void;
  onFocus: (id: string | null) => void;
  /** 학생이 직접 검색 — 오류 문구를 돌려주고, 잘되면 null */
  onSearch: (keyword: string) => Promise<string | null>;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [view, setView] = useState<ViewMode>("grid");

  const grades = useMemo(() => gradeNameMap(results.grades), [results.grades]);
  const categories = useMemo(() => nameMap(results.categories), [results.categories]);

  // 필터·통계는 메모리에서 즉시 계산한다 — 서버 왕복 없음
  const filtered = useMemo(
    () => filterRows(results.rows, snapshot.filters, grades),
    [results.rows, snapshot.filters, grades],
  );
  const counts = useMemo(() => countFacets(results.rows, grades), [results.rows, grades]);

  const focused = snapshot.focusedId
    ? (results.rows.find((row) => row.id === snapshot.focusedId) ?? null)
    : null;

  const activeCount =
    snapshot.filters.grades.length +
    snapshot.filters.problemTags.length +
    snapshot.filters.scamper.length;

  const categoryNameOf = (row: InventionRow) =>
    row.category_id != null ? (categories[row.category_id] ?? null) : null;

  // relative — 상세 모달이 이 상자 안에만 얹히도록. 화면 전체를 덮으면 대화창이 가려진다.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 학생이 직접 찾아보는 검색창 — 0~4단계는 학생이 주도한다 */}
      <SearchBox keyword={snapshot.keyword} onSearch={onSearch} />

      {/* 통계 머리말 + 보기 전환 */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 truncate text-sm font-bold">
            “{snapshot.keyword}” 선배들의 발명
          </h2>
          <span className="shrink-0 text-xs text-neutral-500">
            {filtered.length.toLocaleString()}건 보는 중
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="min-w-0 text-[11px] text-neutral-400">
            {snapshot.totalCount > snapshot.loadedCount
              ? `전체 ${snapshot.totalCount.toLocaleString()}건 중 ${snapshot.loadedCount.toLocaleString()}건 기준`
              : `전체 ${snapshot.totalCount.toLocaleString()}건 전부`}
          </p>

          <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-white p-0.5">
            <ViewButton active={view === "grid"} onClick={() => setView("grid")} label="카드보기">
              <LayoutGrid className="size-3.5" />
            </ViewButton>
            <ViewButton active={view === "list"} onClick={() => setView("list")} label="리스트보기">
              <List className="size-3.5" />
            </ViewButton>
          </div>
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="border-b border-line px-5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-500">
            필터
            <span className="ml-1.5 font-normal text-neutral-400">
              눌러서 직접 좁혀 보세요
            </span>
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-0.5 text-[11px] text-neutral-500 hover:text-neutral-800"
            >
              <X className="size-3" /> 모두 해제
            </button>
          )}
        </div>

        <div className="space-y-2">
          <ChipRow
            label="학년"
            values={snapshot.availableGrades}
            counts={counts.grades}
            selected={snapshot.filters.grades}
            onToggle={(value) => onToggleFilter("grades", value)}
            tone="neutral"
          />
          <ChipRow
            label="문제유형"
            values={snapshot.availableProblemTags}
            counts={counts.problemTags}
            selected={snapshot.filters.problemTags}
            onToggle={(value) => onToggleFilter("problemTags", value)}
            tone="sky"
          />
          <ChipRow
            label="SCAMPER"
            values={snapshot.availableScamper}
            counts={counts.scamper}
            selected={snapshot.filters.scamper}
            onToggle={(value) => onToggleFilter("scamper", value)}
            tone="violet"
          />
        </div>
      </div>

      {/* 갤러리 */}
      <div className="scroll-soft @container min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">
            조건에 맞는 발명이 없어요. 필터를 하나 풀어 볼까요?
          </p>
        ) : (
          <>
            <div className={view === "list" ? "flex flex-col gap-3" : GRID_COLUMNS}>
              {filtered.slice(0, visible).map((row) => (
                <InventionCard
                  key={row.id}
                  row={row}
                  view={view}
                  gradeName={gradeNameOf(row, grades)}
                  categoryName={categoryNameOf(row)}
                  focused={row.id === snapshot.focusedId}
                  onClick={() => onFocus(row.id)}
                />
              ))}
            </div>

            {visible < filtered.length && (
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="mt-4 w-full rounded-xl border border-line bg-white py-2.5 text-xs text-neutral-600 hover:border-neutral-300"
              >
                {filtered.length - visible}건 더 보기
              </button>
            )}
          </>
        )}
      </div>

      {focused && (
        <InventionDetailModal
          row={focused}
          gradeName={gradeNameOf(focused, grades)}
          categoryName={categoryNameOf(focused)}
          onClose={() => onFocus(null)}
        />
      )}
    </div>
  );
}

/**
 * 학생이 직접 검색어를 바꿔 보는 칸.
 *
 * 0~4단계에서는 선배가 대신 검색해 주지 않는다. 방법만 알려 주고 학생이 눌러 본다.
 * 여기서 찾은 결과도 세션에 실리므로 다음 턴에 선배가 같은 화면을 본다.
 */
function SearchBox({
  keyword,
  onSearch,
}: {
  keyword: string;
  onSearch: (keyword: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(keyword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const text = draft.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(await onSearch(text));
    setLoading(false);
  };

  return (
    <div className="border-b border-line bg-neutral-50 px-5 py-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void run();
          }}
          placeholder="찾고 싶은 낱말 (예: 우산 보관)"
          aria-label="선배들의 발명 검색"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || !draft.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          찾기
        </button>
      </div>

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-neutral-400">
          낱말을 바꿔 직접 찾아볼 수 있어요. 막히면 선배에게 물어보세요.
        </p>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-full p-1.5 transition-colors",
        active ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-700",
      )}
    >
      {children}
    </button>
  );
}

const TONES = {
  neutral: "border-neutral-800 bg-neutral-900 text-white",
  sky: "border-sky-600 bg-sky-600 text-white",
  violet: "border-violet-600 bg-violet-600 text-white",
} as const;

function ChipRow({
  label,
  values,
  counts,
  selected,
  onToggle,
  tone,
}: {
  label: string;
  values: string[];
  counts: Record<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  tone: keyof typeof TONES;
}) {
  if (values.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-14 shrink-0 text-[11px] text-neutral-400">{label}</span>
      {values.slice(0, 10).map((value) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              active ? TONES[tone] : "border-line bg-white text-neutral-600 hover:border-neutral-300",
            )}
          >
            {value}
            <span className={cn("ml-1 tabular-nums", active ? "opacity-70" : "text-neutral-400")}>
              {counts[value] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

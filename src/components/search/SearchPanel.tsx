"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { InventionCard } from "./InventionCard";
import {
  countFacets,
  filterRows,
  gradeNameMap,
  gradeNameOf,
  splitTags,
} from "@/lib/search/facets";
import { cn } from "@/lib/utils";
import type { SearchResults, FilterKind } from "@/hooks/useChat";
import type { SearchSnapshot } from "@/types/search";

/** 한 번에 그리는 카드 수 — 500장을 한꺼번에 그리면 브라우저가 버벅인다 */
const PAGE_SIZE = 30;

export function SearchPanel({
  snapshot,
  results,
  onToggleFilter,
  onClearFilters,
  onFocus,
}: {
  snapshot: SearchSnapshot;
  results: SearchResults;
  onToggleFilter: (kind: FilterKind, value: string) => void;
  onClearFilters: () => void;
  onFocus: (id: string | null) => void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const grades = useMemo(() => gradeNameMap(results.grades), [results.grades]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 통계 머리말 */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold">
            “{snapshot.keyword}” 선배들의 발명
          </h2>
          <span className="shrink-0 text-xs text-neutral-500">
            {filtered.length.toLocaleString()}건 보는 중
          </span>
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">
          {snapshot.totalCount > snapshot.loadedCount
            ? `전체 ${snapshot.totalCount.toLocaleString()}건 중 ${snapshot.loadedCount.toLocaleString()}건 기준`
            : `전체 ${snapshot.totalCount.toLocaleString()}건 전부`}
        </p>
      </div>

      {/* 필터 칩 */}
      <div className="border-b border-line px-5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-neutral-500">필터</span>
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

      {/* 상세 카드 */}
      {focused && (
        <div className="border-b border-line bg-amber-50/50 px-5 py-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold">
              {focused.simple_title ?? focused.original_title ?? "(제목 없음)"}
            </h3>
            <button
              type="button"
              onClick={() => onFocus(null)}
              aria-label="상세 닫기"
              className="shrink-0 text-neutral-400 hover:text-neutral-700"
            >
              <X className="size-4" />
            </button>
          </div>
          <dl className="space-y-1.5 text-xs leading-relaxed">
            <Field label="학년" value={gradeNameOf(focused, grades)} />
            <Field label="요약" value={focused.simple_summary} />
            <Field label="문제" value={focused.problem} />
            <Field label="해결" value={focused.solution} />
            <Field label="문제유형" value={splitTags(focused.problem_tag).join(", ")} />
            <Field label="SCAMPER" value={splitTags(focused.scamper).join(", ")} />
          </dl>
        </div>
      )}

      {/* 결과 목록 */}
      <div className="scroll-soft min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">
            조건에 맞는 발명이 없어요. 필터를 하나 풀어 볼까요?
          </p>
        ) : (
          <>
            {filtered.slice(0, visible).map((row) => (
              <InventionCard
                key={row.id}
                row={row}
                gradeName={gradeNameOf(row, grades)}
                focused={row.id === snapshot.focusedId}
                onClick={() => onFocus(row.id === snapshot.focusedId ? null : row.id)}
              />
            ))}
            {visible < filtered.length && (
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="w-full rounded-xl border border-line bg-white py-2.5 text-xs text-neutral-600 hover:border-neutral-300"
              >
                {filtered.length - visible}건 더 보기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-neutral-400">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
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

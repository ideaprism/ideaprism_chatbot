"use client";

import { Loader2, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { Patent, PatentSnapshot } from "@/types/kipris";

/**
 * 특허 패널 (PRD S-7) — 검색식은 편집 가능하고, 조회 결과가 아래에 뜬다.
 * 여기서 다시 조회하면 AI를 거치지 않으므로 비용이 들지 않는다.
 *
 * 부모가 key={snapshot.query} 로 렌더하므로, AI가 검색식을 새로 만들면
 * 이 컴포넌트가 통째로 다시 마운트되며 입력창도 새 검색식으로 초기화된다.
 */
export function PatentPanel({
  snapshot,
  patents,
  onResult,
}: {
  snapshot: PatentSnapshot;
  patents: Patent[];
  onResult: (query: string, patents: Patent[], totalCount: number) => void;
}) {
  const [draft, setDraft] = useState(snapshot.query);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const query = draft.trim();
    if (!query || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/kipris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "조회에 실패했습니다.");
      onResult(data.query, data.patents, data.totalCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-bold">선행기술조사</h2>
        <p className="mt-0.5 text-[11px] text-neutral-400">
          + 는 &lsquo;또는&rsquo;, * 는 &lsquo;그리고&rsquo;. 검색식을 직접 고쳐 다시 찾아볼 수 있어요.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) run();
            }}
            placeholder="예: (우산+양산)*(빗물+물방울)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-400"
          />
          <button
            type="button"
            onClick={run}
            disabled={loading || !draft.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white disabled:bg-neutral-300"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            찾기
          </button>
        </div>

        {error && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        {snapshot.totalCount >= 0 && !error && (
          <p className="mt-2 text-[11px] text-neutral-500">
            전체 {snapshot.totalCount.toLocaleString()}건 중 {snapshot.loadedCount}건 표시
          </p>
        )}
      </div>

      <div className="scroll-soft min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {snapshot.totalCount < 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">
            아직 찾아보지 않았어요.
            <br />
            위 검색식으로 &lsquo;찾기&rsquo;를 눌러 보세요.
          </p>
        ) : patents.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-400">
            비슷한 특허가 나오지 않았어요.
            <br />
            검색식이 너무 좁을 수 있으니 낱말을 하나 빼 볼까요?
          </p>
        ) : (
          patents.map((patent) => <PatentCard key={patent.applicationNumber || patent.indexNo} patent={patent} />)
        )}
      </div>
    </div>
  );
}

function PatentCard({ patent }: { patent: Patent }) {
  const registered = patent.registerStatus?.includes("등록");

  return (
    <article className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">{patent.inventionTitle}</h3>
        <span
          className={
            registered
              ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"
              : "shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500"
          }
        >
          {patent.registerStatus}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-neutral-400">
        {patent.applicationNumber || "출원번호 미상"}
        {patent.applicationDate ? ` · ${patent.applicationDate}` : ""}
        {patent.applicantName ? ` · ${patent.applicantName}` : ""}
      </p>

      {patent.abstract && (
        <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-neutral-600">
          {patent.abstract}
        </p>
      )}
    </article>
  );
}

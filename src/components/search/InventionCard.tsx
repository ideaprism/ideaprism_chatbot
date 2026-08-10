"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { InventionRow } from "@/types/search";

/**
 * 발명 카드 — 1.0의 `InventionCard` 를 이식.
 *
 * 카드보기(세로, 4:3 도면 + 제목 + 요약 + 분야)와 리스트보기(가로)를 한 부품에서 낸다.
 * 학생이 1.0에서 보던 카드와 같은 모양이어야 "같은 자료"로 읽힌다.
 */
export function InventionCard({
  row,
  categoryName,
  gradeName,
  view,
  focused,
  onClick,
}: {
  row: InventionRow;
  categoryName: string | null;
  gradeName: string | null;
  view: "grid" | "list";
  focused: boolean;
  onClick: () => void;
}) {
  const title = row.simple_title || row.original_title || "(제목 없음)";
  const summary =
    row.simple_summary || row.detailed_summary || row.invention_motive || "발명 설명이 없습니다.";

  const frame = cn(
    "group flex h-full w-full overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200",
    focused
      ? "border-neutral-800 ring-2 ring-neutral-200"
      : "border-line hover:border-neutral-300 hover:shadow-md",
    view === "grid" ? "flex-col" : "items-stretch gap-0",
  );

  if (view === "list") {
    return (
      <button type="button" onClick={onClick} className={frame}>
        <div className="w-32 shrink-0 sm:w-40">
          <Drawing row={row} title={title} className="h-full min-h-24" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <h3 className="line-clamp-1 text-sm font-bold leading-snug transition-colors group-hover:text-neutral-600">
            {title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">{summary}</p>
          <Footer categoryName={categoryName} gradeName={gradeName} />
        </div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} className={frame}>
      <Drawing row={row} title={title} className="aspect-[4/3] w-full" zoomOnHover />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug transition-colors group-hover:text-neutral-600">
          {title}
        </h3>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-neutral-500">{summary}</p>
        <Footer categoryName={categoryName} gradeName={gradeName} />
      </div>
    </button>
  );
}

function Footer({
  categoryName,
  gradeName,
}: {
  categoryName: string | null;
  gradeName: string | null;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
      <span className="truncate text-[10px] font-black uppercase tracking-widest text-neutral-400">
        {[categoryName || "기타", gradeName].filter(Boolean).join(" · ")}
      </span>
      <span className="shrink-0 text-[10px] font-black text-neutral-700 group-hover:underline">
        자세히 보기 →
      </span>
    </div>
  );
}

/** 발명 도면 — 주소가 제각각이라 next/image 최적화 없이 그대로 띄운다 */
function Drawing({
  row,
  title,
  className,
  zoomOnHover = false,
}: {
  row: InventionRow;
  title: string;
  className?: string;
  zoomOnHover?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-neutral-100",
        className,
      )}
    >
      {row.drawing_url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.drawing_url}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-cover transition-transform duration-500",
            zoomOnHover && "group-hover:scale-105",
          )}
        />
      ) : (
        <ImageIcon className="size-10 text-neutral-300" />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

import { splitTags } from "@/lib/search/facets";
import { cn } from "@/lib/utils";
import type { InventionRow } from "@/types/search";

export function InventionCard({
  row,
  gradeName,
  focused,
  onClick,
}: {
  row: InventionRow;
  gradeName: string | null;
  focused: boolean;
  onClick: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = row.simple_title ?? row.original_title ?? "(제목 없음)";
  const problemTags = splitTags(row.problem_tag);
  const scamperTags = splitTags(row.scamper);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 rounded-xl border bg-white p-3 text-left transition-colors",
        focused
          ? "border-neutral-800 ring-2 ring-neutral-200"
          : "border-line hover:border-neutral-300",
      )}
    >
      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
        {row.drawing_url && !imageFailed ? (
          // 외부 이미지 주소가 제각각이라 next/image 최적화 없이 그대로 띄운다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.drawing_url}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
            그림 없음
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
        {row.simple_summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
            {row.simple_summary}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          {gradeName && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
              {gradeName}
            </span>
          )}
          {problemTags.slice(0, 2).map((tag) => (
            <span
              key={`p-${tag}`}
              className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700"
            >
              {tag}
            </span>
          ))}
          {scamperTags.slice(0, 2).map((tag) => (
            <span
              key={`s-${tag}`}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Patent } from "@/types/kipris";

/** 20240131 → 2024-01-31 */
function formatDate(value: string): string {
  if (!value || value.length < 8) return value || "-";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * 특허 카드 — 1.0의 `PatentCard` 를 이식.
 * 머리줄에 번호·제목·등록 여부, 본문에 도면과 네 가지 정보, 아래에 접이식 상세.
 */
export function PatentCard({ patent, index }: { patent: Patent; index: number }) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const registered = Boolean(patent.registerNumber) || patent.registerStatus?.includes("등록");

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-neutral-900 to-neutral-700 px-4 py-2.5 text-white">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold tabular-nums">
            {index}
          </span>
          <span className="truncate text-sm font-semibold">{patent.inventionTitle}</span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-[11px] font-medium",
            registered ? "bg-emerald-500" : "bg-white/25",
          )}
        >
          {patent.registerStatus || (registered ? "등록" : "공개")}
        </span>
      </div>

      <div className="flex gap-4 p-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
          {patent.drawing && !imageFailed ? (
            // 특허청이 주는 도면 주소라 next/image 최적화 없이 그대로 띄운다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={patent.drawing}
              alt="도면"
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[11px] text-neutral-400">도면 없음</span>
          )}
        </div>

        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Cell label="출원번호" value={patent.applicationNumber || "-"} strong />
          <Cell label="출원일" value={formatDate(patent.applicationDate)} />
          <Cell label="등록번호" value={patent.registerNumber || "-"} />
          <Cell label="출원인" value={patent.applicantName || "-"} strong />
        </dl>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full border-t border-line bg-neutral-50 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
      >
        상세 정보 {open ? "▲" : "▼"}
      </button>

      {open && (
        <table className="w-full border-t border-line bg-neutral-50 text-xs">
          <tbody>
            <tr className="border-b border-line">
              <td className="w-20 px-4 py-2 align-top text-neutral-500">발명명칭</td>
              <td className="px-4 py-2">{patent.inventionTitle}</td>
            </tr>
            <tr className={patent.abstract ? "border-b border-line" : undefined}>
              <td className="px-4 py-2 align-top text-neutral-500">IPC</td>
              <td className="px-4 py-2 font-mono">{patent.ipcNumber || "-"}</td>
            </tr>
            {patent.abstract && (
              <tr>
                <td className="px-4 py-2 align-top text-neutral-500">요약</td>
                <td className="px-4 py-2 leading-relaxed">{patent.abstract}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </article>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-neutral-400">{label}</dt>
      <dd className={cn("truncate", strong ? "font-medium text-neutral-900" : "text-neutral-700")}>
        {value}
      </dd>
    </div>
  );
}

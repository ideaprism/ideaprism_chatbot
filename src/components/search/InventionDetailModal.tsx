"use client";

import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { splitTags } from "@/lib/search/facets";
import {
  categoryColorClass,
  categoryIcon,
  isValidProblemTag,
  problemColorClass,
  problemIcon,
  scamperColorClass,
  scamperIcon,
  sdgIconUrl,
} from "@/lib/tag-styles";
import { cn } from "@/lib/utils";
import type { InventionRow } from "@/types/search";

/**
 * 발명 상세 — 1.0의 `InventionDetailModal` 을 이식.
 *
 * 좌측 도면 45% + 우측 탭(기본 정보 / 상세 설명) 구조, 표 형식 메타, 태그 칩,
 * `//` 로 나뉜 접이식 섹션까지 1.0과 같다.
 *
 * 여는 열쇠는 세션의 `focusedId` 다. 학생이 카드를 눌러도, AI가 show_invention 으로
 * "이거 봐 봐" 해도 같은 모달이 열린다 (PRD S-4 양방향 동기화).
 */
export function InventionDetailModal({
  row,
  gradeName,
  categoryName,
  onClose,
  onPatentSearch,
}: {
  row: InventionRow;
  gradeName: string | null;
  categoryName: string | null;
  onClose: () => void;
  onPatentSearch?: (row: InventionRow) => void;
}) {
  const [tab, setTab] = useState<"basic" | "detail">("basic");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 모달은 화면 맨 위에 얹혀야 해서 body에 직접 그린다 — 서버에서는 그릴 곳이 없다
  if (typeof document === "undefined") return null;

  const title = row.simple_title || row.original_title || "(제목 없음)";
  const sdgNumber = row.sdg ? Number.parseInt(row.sdg, 10) : Number.NaN;
  const sdgUrl = Number.isNaN(sdgNumber) ? "" : sdgIconUrl(sdgNumber);

  const problemTags = splitTags(row.problem_tag).filter(isValidProblemTag);
  const scamperTags = splitTags(row.scamper);

  const hasDetail = Boolean(
    row.invention_motive || row.detailed_summary || row.problem || row.solution || row.next_step,
  );

  return createPortal(
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* 머리말 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="min-w-0 truncate text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* 왼쪽: 도면 */}
          <div className="flex shrink-0 items-center justify-center border-b border-line bg-neutral-50 p-6 lg:w-[45%] lg:border-b-0 lg:border-r lg:p-8">
            <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
              {row.drawing_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.drawing_url}
                  alt={row.original_title ?? title}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-neutral-300">
                  <ImageIcon className="size-14" />
                  <span className="text-sm">이미지가 없습니다</span>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 정보 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 border-b border-line px-6 pt-3">
              <Tab active={tab === "basic"} onClick={() => setTab("basic")}>
                기본 정보
              </Tab>
              <Tab active={tab === "detail"} onClick={() => setTab("detail")}>
                상세 설명
              </Tab>
            </div>

            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-6">
              {tab === "basic" ? (
                <div className="space-y-6">
                  <table className="w-full text-left text-sm">
                    <tbody className="align-top">
                      <Row label="원본 제목">
                        <span className="font-medium">{row.original_title || "-"}</span>
                      </Row>
                      <Row label="학교 구분">{gradeName || "-"}</Row>
                      <Row label="분야">
                        {categoryName ? (
                          <Chip
                            className={cn("border", categoryColorClass(categoryName))}
                            icon={categoryIcon(categoryName)}
                          >
                            {categoryName}
                          </Chip>
                        ) : (
                          "-"
                        )}
                      </Row>
                      <Row label="관련 교과">{row.curriculum || "-"}</Row>
                      <Row label="ESG 과제">
                        {row.sdg ? (
                          <span className="flex items-center gap-2">
                            {sdgUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sdgUrl} alt="" className="size-5 rounded-sm" />
                            )}
                            {row.sdg}
                          </span>
                        ) : (
                          "-"
                        )}
                      </Row>
                      <Row label="문제유형">
                        {problemTags.length ? (
                          <span className="flex flex-wrap gap-2">
                            {problemTags.map((tag) => (
                              <Chip
                                key={tag}
                                className={cn("border", problemColorClass(tag))}
                                icon={problemIcon(tag)}
                              >
                                {tag}
                              </Chip>
                            ))}
                          </span>
                        ) : (
                          "-"
                        )}
                      </Row>
                      <Row label="SCAMPER" last>
                        {scamperTags.length ? (
                          <span className="flex flex-wrap gap-2">
                            {scamperTags.map((tag) => (
                              <Chip
                                key={tag}
                                className={scamperColorClass(tag)}
                                icon={scamperIcon(tag)}
                              >
                                {tag}
                              </Chip>
                            ))}
                          </span>
                        ) : (
                          "-"
                        )}
                      </Row>
                    </tbody>
                  </table>

                  {onPatentSearch && (
                    <button
                      type="button"
                      onClick={() => onPatentSearch(row)}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 text-sm font-semibold transition-colors hover:bg-neutral-50"
                    >
                      <ExternalLink className="size-4" />
                      이 발명으로 특허 검색
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <Section title="발명 동기" content={row.invention_motive} defaultOpen />
                  <Section title="발명 요약" content={row.detailed_summary} defaultOpen />
                  <Section title="해결하려는 문제" content={row.problem} />
                  <Section title="해결방법 및 효과" content={row.solution} />
                  <Section title="어떻게 더 개선해 볼 수 있을까?" content={row.next_step} />

                  {!hasDetail && (
                    <div className="flex flex-col items-center justify-center py-20 font-medium text-neutral-400">
                      <BadgeCheck className="mb-4 size-12 opacity-30" />
                      <p>상세 설명이 등록되지 않은 발명품입니다.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-5 py-3 text-sm font-semibold transition-colors",
        active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-400 hover:text-neutral-700",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <tr className={last ? undefined : "border-b border-dashed border-line"}>
      <th className="w-24 py-3 font-semibold text-neutral-500">{label}</th>
      <td className="py-3 pl-4">{children}</td>
    </tr>
  );
}

function Chip({
  className,
  icon: Icon,
  children,
}: {
  className: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex w-fit items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  );
}

/**
 * 접이식 설명 — 1.0과 같이 `//` 로 나뉜 문장을 글머리표로 편다.
 * 자료가 원래 그 형식으로 들어 있어, 안 나누면 한 문단으로 뭉쳐 읽기 어렵다.
 */
function Section({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string | null | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  const lines = content
    .split("//")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-neutral-50 p-4 text-left transition-colors hover:bg-neutral-100"
      >
        <h3 className="text-sm font-bold">{title}</h3>
        {open ? (
          <ChevronUp className="size-5 text-neutral-400" />
        ) : (
          <ChevronDown className="size-5 text-neutral-400" />
        )}
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line bg-white p-4 text-sm">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-neutral-900" />
              <span className="leading-relaxed text-neutral-700">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

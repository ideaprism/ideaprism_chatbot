"use client";

import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageIcon,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { PatentPanel } from "@/components/patent/PatentPanel";
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
 * 다만 1.0처럼 화면 전체를 덮지 않는다. 여기서는 왼쪽이 대화창이라, 모달이 화면을
 * 덮으면 학생이 읽던 말풍선이 가려진다. 그래서 우측 패널 안에만 얹힌다
 * (부모의 `relative` 상자 기준 `absolute inset-0`).
 *
 * 여는 열쇠는 세션의 `focusedId` 다. 학생이 카드를 눌러도, AI가 show_invention 으로
 * "이거 봐 봐" 해도 같은 모달이 열린다 (PRD S-4 양방향 동기화).
 *
 * 특허 검색도 1.0처럼 이 모달 "안에서" 열린다. 다른 화면으로 보내 버리면 보던
 * 발명으로 되돌아올 길이 없다. 특허 화면의 좌측 위에는 그 발명이 작게 남아 있고,
 * 누르면 상세로 돌아온다.
 */
export function InventionDetailModal({
  row,
  gradeName,
  categoryName,
  onClose,
}: {
  row: InventionRow;
  gradeName: string | null;
  categoryName: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "detail">("basic");
  const [view, setView] = useState<"invention" | "patent">("invention");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = row.simple_title || row.original_title || "(제목 없음)";
  const sdgNumber = row.sdg ? Number.parseInt(row.sdg, 10) : Number.NaN;
  const sdgUrl = Number.isNaN(sdgNumber) ? "" : sdgIconUrl(sdgNumber);

  const problemTags = splitTags(row.problem_tag).filter(isValidProblemTag);
  const scamperTags = splitTags(row.scamper);

  const hasDetail = Boolean(
    row.invention_motive || row.detailed_summary || row.problem || row.solution || row.next_step,
  );

  return (
    <div
      className="no-print absolute inset-0 z-30 flex items-stretch justify-center bg-black/40 p-3 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="@container flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* 머리말 — 특허 화면에서는 보던 발명이 왼쪽에 작게 남아 되돌아갈 길이 된다 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          {view === "patent" ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <InventionThumbnail
                row={row}
                title={title}
                onClick={() => setView("invention")}
              />
              <div className="h-9 w-px shrink-0 bg-line" />
              <h2 className="flex shrink-0 items-center gap-1.5 text-base font-bold">
                <Search className="size-4" />
                특허 검색
              </h2>
            </div>
          ) : (
            <h2 className="min-w-0 truncate px-2 text-lg font-bold">{title}</h2>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <X className="size-5" />
          </button>
        </div>

        {view === "patent" ? (
          /* 이 발명을 재료로 한 특허 검색 — 선행기술조사(5단계) 기록은 건드리지 않는다 */
          <PatentPanel
            snapshot={null}
            seed={{ inventionId: row.id, title, ipc: row.ipc }}
            patents={[]}
          />
        ) : (
          /* 좁은 패널에서는 도면을 위로 올려 쌓는다 — 폭 기준은 화면이 아니라 이 상자다 */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden @3xl:flex-row">
          {/* 왼쪽: 도면 */}
          <div className="flex shrink-0 items-center justify-center border-b border-line bg-neutral-50 p-5 @3xl:w-[45%] @3xl:border-b-0 @3xl:border-r @3xl:p-8">
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

                  <button
                    type="button"
                    onClick={() => setView("patent")}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 text-sm font-semibold transition-colors hover:bg-neutral-50"
                  >
                    <ExternalLink className="size-4" />
                    특허 검색
                  </button>
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
        )}
      </div>
    </div>
  );
}

/**
 * 특허 화면 좌측 위에 남는 발명 — 1.0의 `InventionThumbnail`.
 * 누르면 보던 상세로 돌아온다. 이게 없으면 특허 화면이 막다른 길이 된다.
 */
function InventionThumbnail({
  row,
  title,
  onClick,
}: {
  row: InventionRow;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-white p-2 text-left transition-all hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
        {row.drawing_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.drawing_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-4 text-neutral-300" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold transition-colors group-hover:text-neutral-600">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400">눌러서 발명으로 돌아가기</p>
      </div>
      <ChevronDown className="size-4 shrink-0 rotate-90 text-neutral-300 transition-colors group-hover:text-neutral-600" />
    </button>
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

"use client";

import { Check, NotebookPen, ScrollText, Search, Undo2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "./Wordmark";
import { castAt, type Cast } from "@/lib/cast";
import { getCharacter } from "@/lib/characters";
import { progressView, type QuestState, type StageId } from "@/lib/quest";
import { cn } from "@/lib/utils";
import type { PanelKind } from "@/hooks/useChat";

const PANEL_TABS: Array<{
  kind: PanelKind;
  label: string;
  icon: typeof Search;
}> = [
  { kind: "search", label: "검색", icon: Search },
  { kind: "note", label: "노트", icon: NotebookPen },
  { kind: "patent", label: "특허", icon: ScrollText },
];

/** 상단 고정 진행판 (PRD S-5) — 0→5단계, 현재 단계 강조 + 우측 패널 전환 */
export function ProgressRail({
  quest,
  cast,
  activePanel,
  onSelectPanel,
  available,
  providerPicker,
  onGoToStage,
  canGoBack,
}: {
  quest: QuestState;
  /** 이번 대화의 담당 배치 (단계 → 캐릭터) */
  cast: Cast;
  activePanel: PanelKind | null;
  onSelectPanel: (kind: PanelKind | null) => void;
  available: Record<PanelKind, boolean>;
  /** 모델 비교용 선택기 (PRD 7장) */
  providerPicker?: ReactNode;
  /** 지나온 단계를 눌러 되돌아가기 */
  onGoToStage: (stage: StageId) => void;
  /** 말하는 중에는 되돌아갈 수 없다 */
  canGoBack: boolean;
}) {
  const steps = progressView(quest);
  // 한 단계에 둘이 함께 있을 수 있다 (0단계에서 선생님이 친구 둘을 짝지어 준다)
  const crew = castAt(cast, quest.currentStage).map(getCharacter);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
      {/* 윗줄 — 로고 · 지금 함께하는 사람 · 모델 · 패널 탭 */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-2.5 pb-2">
        <Link href="/" className="flex items-center gap-2" title="첫 화면으로">
          <Wordmark size="sm" />
          <span className="text-[11px] text-neutral-400">2.0 프로토타입</span>
        </Link>

        <p className="ml-auto text-xs text-neutral-500">
          지금 함께하는 사람 ·{" "}
          {crew.map((member, index) => (
            <span key={member.id}>
              {index > 0 && ", "}
              <span className={cn("font-medium", member.theme.accent)}>{member.name}</span>
            </span>
          ))}
        </p>

        {providerPicker}

        <nav className="flex items-center gap-1">
          {PANEL_TABS.map(({ kind, label, icon: Icon }) => {
            const enabled = available[kind];
            const active = activePanel === kind;
            return (
              <button
                key={kind}
                type="button"
                disabled={!enabled}
                title={enabled ? `${label} 패널 열기` : `${label}은 아직 열 수 없어요`}
                onClick={() => onSelectPanel(active ? null : kind)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  !enabled && "cursor-not-allowed border-line bg-white text-neutral-300",
                  enabled && active && "border-neutral-800 bg-neutral-900 text-white",
                  enabled &&
                    !active &&
                    "border-line bg-white text-neutral-600 hover:border-neutral-300",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 아랫줄 — 단계. 줄바꿈 없이 한 줄로 흐르고, 좁으면 옆으로 밀린다 */}
      <div className="border-t border-line/60">
        <ol className="scroll-soft mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-5 py-1.5">
          {steps.map((step) => {
            // 지나온 단계는 눌러서 되돌아갈 수 있다. 아직 안 가 본 단계는 못 누른다.
            const clickable = step.revisitable && canGoBack;
            return (
            <li key={step.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onGoToStage(step.id)}
                title={
                  clickable
                    ? `${step.id}단계로 돌아가서 다시 이야기하기 — ${step.doneWhen}`
                    : step.doneWhen
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
                  step.status === "done" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  step.status === "current" &&
                    "border-neutral-800 bg-neutral-900 font-semibold text-white",
                  step.status === "todo" &&
                    "border-line bg-white text-neutral-400",
                  clickable
                    ? "cursor-pointer hover:brightness-95"
                    : "cursor-default",
                )}
              >
                {step.status === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <span className="tabular-nums">{step.id}</span>
                )}
                <span>{step.label}</span>
                {clickable && <Undo2 className="size-3 opacity-50" />}
              </button>
              {step.id < 5 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-3 shrink-0",
                    step.status === "done" ? "bg-emerald-300" : "bg-line",
                  )}
                />
              )}
            </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}

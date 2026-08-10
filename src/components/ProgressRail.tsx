"use client";

import { Check, NotebookPen, ScrollText, Search } from "lucide-react";
import type { ReactNode } from "react";

import { getCharacter } from "@/lib/characters";
import { progressView, STAGES, type QuestState } from "@/lib/quest";
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
  activePanel,
  onSelectPanel,
  available,
  providerPicker,
}: {
  quest: QuestState;
  activePanel: PanelKind | null;
  onSelectPanel: (kind: PanelKind | null) => void;
  available: Record<PanelKind, boolean>;
  /** 모델 비교용 선택기 (PRD 7장) */
  providerPicker?: ReactNode;
}) {
  const steps = progressView(quest);
  const character = getCharacter(STAGES[quest.currentStage].character);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold tracking-tight">IdeaPrism</span>
          <span className="text-[11px] text-neutral-400">2.0 프로토타입</span>
        </div>

        <ol className="flex flex-1 flex-wrap items-center gap-1">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-1">
              <div
                title={step.doneWhen}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  step.status === "done" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  step.status === "current" &&
                    "border-neutral-800 bg-neutral-900 font-semibold text-white",
                  step.status === "todo" &&
                    "border-line bg-white text-neutral-400",
                )}
              >
                {step.status === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <span className="tabular-nums">{step.id}</span>
                )}
                <span>{step.label}</span>
              </div>
              {step.id < 5 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-3",
                    step.status === "done" ? "bg-emerald-300" : "bg-line",
                  )}
                />
              )}
            </li>
          ))}
        </ol>

        <p className="text-xs text-neutral-500">
          지금 함께하는 사람 · <span className="font-medium">{character.name}</span>
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
    </header>
  );
}

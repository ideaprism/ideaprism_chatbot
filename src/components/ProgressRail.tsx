"use client";

import { Check } from "lucide-react";

import { getCharacter } from "@/lib/characters";
import { progressView, STAGES, type QuestState } from "@/lib/quest";
import { cn } from "@/lib/utils";

/** 상단 고정 진행판 (PRD S-5) — 0→5단계, 현재 단계 강조 */
export function ProgressRail({ quest }: { quest: QuestState }) {
  const steps = progressView(quest);
  const character = getCharacter(STAGES[quest.currentStage].character);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
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
      </div>
    </header>
  );
}

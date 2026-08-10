"use client";

import { Cpu } from "lucide-react";

import type { ProviderOption } from "@/hooks/useChat";
import type { ProviderId } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/**
 * 모델 비교용 선택기 (PRD 7장 "모델 교체 비교가 쉽게").
 *
 * 대화 도중에는 바꿀 수 없다 — 바꾸면 새 대화로 다시 시작한다.
 * 프롬프트 캐시가 회사·모델별이라 중간에 갈아타면 이력 전체를 정가로 다시 처리하고,
 * 캐릭터 말투도 흔들리기 때문이다.
 */
export function ProviderPicker({
  providers,
  current,
  lastModel,
  conversationStarted,
  onSelect,
}: {
  providers: ProviderOption[];
  current: ProviderId | null;
  lastModel: string | null;
  conversationStarted: boolean;
  onSelect: (id: ProviderId) => void;
}) {
  if (providers.length === 0) return null;

  const handleSelect = (option: ProviderOption) => {
    if (!option.configured || option.id === current) return;
    if (
      conversationStarted &&
      !window.confirm(
        `${option.label} 로 바꾸면 지금 대화는 처음부터 다시 시작합니다.\n` +
          "(대화 도중에는 모델을 바꿀 수 없어요) 계속할까요?",
      )
    ) {
      return;
    }
    onSelect(option.id);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Cpu className="size-3.5 text-neutral-300" />
      <div className="flex items-center gap-1">
        {providers.map((option) => {
          const active = option.id === current;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!option.configured}
              title={
                option.configured
                  ? `${option.label} · ${option.model}${active && lastModel ? ` (지금 ${lastModel})` : ""}`
                  : `${option.label} 키가 없어 고를 수 없어요`
              }
              onClick={() => handleSelect(option)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                !option.configured && "cursor-not-allowed border-line bg-white text-neutral-300",
                option.configured && active && "border-neutral-800 bg-neutral-900 text-white",
                option.configured &&
                  !active &&
                  "border-line bg-white text-neutral-600 hover:border-neutral-300",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

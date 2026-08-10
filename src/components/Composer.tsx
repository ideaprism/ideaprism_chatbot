"use client";

import { SendHorizontal } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  disabled,
  placeholder = "여기에 답을 적어 봐요",
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  return (
    <div className="border-t border-line bg-panel px-5 py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
            const el = event.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-40 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-neutral-400 disabled:bg-neutral-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="보내기"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            disabled || !value.trim()
              ? "bg-neutral-200 text-neutral-400"
              : "bg-neutral-900 text-white hover:bg-neutral-700",
          )}
        >
          <SendHorizontal className="size-5" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-[11px] text-neutral-400">
        Enter로 보내기 · Shift+Enter로 줄바꿈 · 실명이나 연락처는 적지 않아요
      </p>
    </div>
  );
}

"use client";

import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 점검 — 무엇이 준비됐고 무엇이 빠졌는지 한 화면에.
 *
 * `/api/health` 가 이미 다 알고 있는데 볼 곳이 없었다. 키 값은 보이지 않고
 * "있다/없다"만 나온다.
 */

interface Check {
  ok: boolean;
  detail: string;
}

interface Health {
  ready: boolean;
  summary: string;
  checks: Record<string, Check>;
}

/** 항목 이름을 대표님이 읽을 수 있는 말로 */
const LABEL: Record<string, string> = {
  supabaseRead: "발명 자료 읽기",
  supabaseWriteKey: "발명노트 저장",
  promptOverrides: "고친 프롬프트 저장소",
  personas: "캐릭터 대본",
  flow: "대화 흐름 지침",
  kiprisKey: "특허 조회(KIPRIS)",
  adminPage: "관리자 잠금",
  aiProviders: "쓸 수 있는 모델",
  ai_claude: "Claude 키",
  ai_openai: "OpenAI 키",
  ai_gemini: "Gemini 키",
};

export function HealthTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(true);

  // 상태를 바꾸는 곳은 전부 비동기 콜백 안이다 (HANDOFF 함정 — effect 안 setState)
  const load = useCallback(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setBusy(false));
  }, []);

  useEffect(load, [load]);

  const reload = () => {
    setBusy(true);
    load();
  };

  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={reload}
          disabled={busy}
          className="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-300 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          다시 점검
        </button>
        <p className="text-[11px] text-neutral-400">
          키 값은 보이지 않습니다. 들어 있는지 여부만 확인합니다.
        </p>
      </div>

      {health === null ? (
        <p className="py-10 text-center text-sm text-neutral-400">점검하는 중…</p>
      ) : (
        <>
          <p
            className={cn(
              "mb-4 rounded-2xl px-4 py-3 text-sm",
              health.ready
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-900",
            )}
          >
            {health.summary}
          </p>

          <ul className="space-y-1.5">
            {Object.entries(health.checks).map(([key, check]) => (
              <li
                key={key}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-panel px-4 py-2.5"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    check.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                  )}
                >
                  {check.ok ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <X className="size-3" strokeWidth={3} />
                  )}
                </span>
                <span className="min-w-[9rem] text-sm font-medium">{LABEL[key] ?? key}</span>
                <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-neutral-500">
                  {check.detail}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

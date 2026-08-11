"use client";

import { ChevronLeft, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  FLAG_LABEL,
  type NoteDetail,
  type NoteStats,
  type NoteSummary,
} from "@/lib/notes/summary";
import { cn } from "@/lib/utils";

/**
 * 이용내역 — 학생들이 남긴 발명노트를 들여다본다.
 *
 * 여기 보이는 "막힘 신호"는 프로그램이 실제로 잰 값이다(체류 시간·반려 횟수).
 * AI가 "잘 되고 있어요"라고 적어 낸 말이 아니다 — 아키텍처 원칙 4.
 *
 * 3.0 교사 대시보드가 볼 화면의 첫 판이기도 하다 (ECOSYSTEM.md 3.3).
 */

function minutes(ms: number | null): string {
  if (ms === null) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "1분 미만";
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function number(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function UsageTab() {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [stats, setStats] = useState<NoteStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [picked, setPicked] = useState<NoteDetail | null>(null);
  const [onlyStuck, setOnlyStuck] = useState(false);

  // 상태를 바꾸는 곳은 전부 비동기 콜백 안이다 —
  // effect 안에서 곧바로 setState 하면 lint 가 막는다 (HANDOFF 함정 참조)
  const load = useCallback(() => {
    fetch("/api/admin/notes")
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data?.error ?? "이용내역을 읽지 못했습니다.");
          return;
        }
        setError(null);
        setNotes(data.notes ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => setError("이용내역을 읽지 못했습니다."))
      .finally(() => setBusy(false));
  }, []);

  useEffect(load, [load]);

  const reload = () => {
    setBusy(true);
    load();
  };

  const open = async (sessionId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/notes?session=${encodeURIComponent(sessionId)}`);
      const data = await response.json();
      if (response.ok) setPicked(data.note);
      else setError(data?.error ?? "기록을 열지 못했습니다.");
    } catch {
      setError("기록을 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (picked) {
    return <Detail note={picked} onBack={() => setPicked(null)} />;
  }

  const shown = onlyStuck ? (notes ?? []).filter((note) => note.flags.length > 0) : (notes ?? []);

  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reload}
          disabled={busy}
          className="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-300 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          새로 읽기
        </button>

        <button
          type="button"
          onClick={() => setOnlyStuck(!onlyStuck)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
            onlyStuck
              ? "border-rose-300 bg-rose-500 text-white"
              : "border-line bg-white text-neutral-600 hover:border-neutral-300",
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", onlyStuck ? "bg-white" : "bg-rose-500")}
          />
          막힌 학생만 보기
        </button>

        <p className="ml-auto text-[11px] text-neutral-400">
          별명 말고는 학생을 알아볼 수 있는 값이 없습니다 (익명 기록)
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="전체 대화" value={stats.total} suffix="건" />
          <Kpi label="완주" value={stats.completed} suffix="건" tone="emerald" />
          <Kpi label="진행 중" value={stats.inProgress} suffix="건" />
          <Kpi label="막힘 신호" value={stats.stuck} suffix="건" tone="rose" />
        </div>
      )}

      {stats && stats.total > 0 && (
        <div className="mb-5 rounded-2xl border border-line bg-panel p-3">
          <p className="mb-2 px-1 text-[11px] font-bold text-neutral-400">지금 어느 단계에</p>
          <ul className="flex flex-wrap gap-1.5">
            {stats.byStage.map((bar) => (
              <li
                key={bar.stage}
                className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs"
              >
                <span className="font-bold text-neutral-900 tabular-nums">{bar.stage}</span>
                <span className="text-neutral-500">{bar.label}</span>
                <span className="font-bold tabular-nums">{bar.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes === null ? (
        <p className="py-10 text-center text-sm text-neutral-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {onlyStuck ? "막힌 학생이 없습니다." : "아직 쌓인 기록이 없습니다."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((note) => (
            <li key={note.sessionId}>
              <button
                type="button"
                onClick={() => void open(note.sessionId)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-neutral-300"
              >
                <span className="min-w-[6rem] text-sm font-bold">
                  {note.nickname ?? <span className="text-neutral-400">별명 없음</span>}
                </span>

                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
                    note.completed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-line bg-white text-neutral-600",
                  )}
                >
                  <span className="tabular-nums">{note.currentStage}</span>
                  {note.completed ? "완주" : note.stageLabel}
                </span>

                {note.flags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                  >
                    {FLAG_LABEL[flag]}
                  </span>
                ))}

                <span className="ml-auto flex items-center gap-4 text-[11px] text-neutral-400">
                  <span>AI {number(note.aiCalls)}회</span>
                  <span>반려 {number(note.retriesTotal)}회</span>
                  <span>최장 {minutes(note.longestDwellMs)}</span>
                  <span>{when(note.updatedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone?: "emerald" | "rose";
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <p className="text-[11px] font-bold text-neutral-400">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-extrabold tabular-nums",
          tone === "emerald" && "text-emerald-600",
          tone === "rose" && "text-rose-600",
        )}
      >
        {number(value)}
        <span className="ml-1 text-xs font-medium text-neutral-400">{suffix}</span>
      </p>
    </div>
  );
}

function Detail({ note, onBack }: { note: NoteDetail; onBack: () => void }) {
  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-neutral-600 hover:border-neutral-300"
      >
        <ChevronLeft className="size-3.5" /> 목록으로
      </button>

      <div className="mb-4 rounded-2xl border border-line bg-panel px-4 py-3">
        <h3 className="text-base font-bold">
          {note.nickname ?? "별명 없음"}
          <span className="ml-2 text-xs font-medium text-neutral-400">
            {note.completed ? "완주" : `${note.currentStage}단계 「${note.stageLabel}」 진행 중`}
          </span>
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-neutral-500 lg:grid-cols-4">
          <Fact label="시작" value={when(note.startedAt)} />
          <Fact label="마지막 활동" value={when(note.updatedAt)} />
          <Fact label="AI 호출" value={`${number(note.aiCalls)}회`} />
          <Fact label="완료 반려" value={`${number(note.retriesTotal)}회`} />
          <Fact label="들어간 글자(입력)" value={number(note.tokens.input)} />
          <Fact label="나온 글자(출력)" value={number(note.tokens.output)} />
          <Fact label="아껴 읽은 것(캐시)" value={number(note.tokens.cacheRead)} />
          <Fact label="가장 오래 머문 단계" value={minutes(note.longestDwellMs)} />
        </dl>

        {note.flags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {note.flags.map((flag) => (
              <li
                key={flag}
                className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700"
              >
                {FLAG_LABEL[flag]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ol className="space-y-2">
        {note.stages.map((stage) => (
          <li key={stage.stage} className="rounded-2xl border border-line bg-panel px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white tabular-nums">
                {stage.stage}
              </span>
              <span className="text-sm font-bold">{stage.label}</span>
              <span className="ml-auto flex gap-3 text-[11px] text-neutral-400">
                <span>머문 시간 {minutes(stage.dwellMs)}</span>
                <span className={cn(stage.retries > 0 && "font-bold text-rose-600")}>
                  반려 {stage.retries}회
                </span>
              </span>
            </div>

            {stage.summary && (
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-700">{stage.summary}</p>
            )}

            {stage.artifact !== null && (
              <pre className="scroll-soft mt-2 overflow-x-auto rounded-xl border border-line bg-white p-3 text-[12px] leading-relaxed">
                {JSON.stringify(stage.artifact, null, 2)}
              </pre>
            )}

            {stage.earlierAttempts.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-neutral-400">
                  고치기 전 기록 {stage.earlierAttempts.length}개
                </summary>
                <pre className="scroll-soft mt-1 overflow-x-auto rounded-xl border border-line bg-white p-3 text-[12px] text-neutral-500">
                  {JSON.stringify(stage.earlierAttempts, null, 2)}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ol>

      {note.kiprisQuery && (
        <p className="mt-3 rounded-xl border border-line bg-panel px-4 py-2 font-mono text-[12px] break-all">
          <span className="mr-2 font-sans text-[11px] text-neutral-400">특허 검색식</span>
          {note.kiprisQuery}
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-neutral-400">{label} </dt>
      <dd className="inline font-medium text-neutral-700">{value}</dd>
    </div>
  );
}

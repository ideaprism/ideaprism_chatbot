"use client";

import { Check, History, Printer } from "lucide-react";
import { useState } from "react";

import { getCharacter } from "@/lib/characters";
import { isComplete, STAGES, STAGE_IDS, type StageId } from "@/lib/quest";
import { cn } from "@/lib/utils";
import type { SessionState } from "@/types/chat";

/** 산출물 항목의 한글 이름 — 학생과 선생님이 읽는 화면이라 영어 키를 그대로 보이지 않는다 */
const FIELD_LABELS: Record<string, string> = {
  nickname: "별명",
  interests: "관심사",
  matchedCharacter: "함께한 선배",
  problemArea: "관심 분야",
  observations: "발견한 불편함",
  problemStatement: "문제 정의문",
  target: "누가 불편한가",
  pain: "무엇이 불편한가",
  techniquesTried: "써 본 SCAMPER 기법",
  candidates: "아이디어 후보",
  title: "발명 이름",
  summary: "한 줄 요약",
  howItWorks: "작동 방식",
  differentiator: "기존과 다른 점",
  kiprisQuery: "특허 검색식",
  similarPatents: "비슷한 특허",
  differentiation: "차별점",
};

const CHARACTER_LABELS: Record<string, string> = {
  teacher: "발명 마스터 선생님",
  jiyou: "지유 선배",
  detective: "특허 탐정",
};

function formatValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (key === "matchedCharacter") return CHARACTER_LABELS[String(value)] ?? String(value);
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function NotePanel({ session }: { session: SessionState }) {
  const done = isComplete(session.quest);
  const filled = STAGE_IDS.filter(
    (stage) =>
      session.quest.completed[stage] !== undefined ||
      session.notes.some((note) => note.stage === stage),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-bold">발명노트</h2>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {session.nickname ? `${session.nickname}의 발명 기록` : "대화하면서 자동으로 쌓여요"}
          </p>
        </div>
        {done && (
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
          >
            <Printer className="size-3.5" /> 인쇄하기
          </button>
        )}
      </div>

      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="print-area space-y-3">
          {done && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                <Check className="size-4" strokeWidth={3} /> 발명노트 완성!
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                0단계부터 5단계까지 모두 마쳤어요. 출력해서 선생님께 보여드리세요.
              </p>
            </div>
          )}

          {filled.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              아직 적힌 내용이 없어요.
              <br />
              선배와 이야기를 나누면 여기에 하나씩 쌓입니다.
            </p>
          ) : (
            STAGE_IDS.map((stage) => (
              <StageEntry key={stage} stage={stage} session={session} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StageEntry({ stage, session }: { stage: StageId; session: SessionState }) {
  const definition = STAGES[stage];
  const artifact = session.quest.completed[stage] as Record<string, unknown> | undefined;
  const note = session.notes.find((entry) => entry.stage === stage);
  const isCurrent = session.quest.currentStage === stage;

  if (!artifact && !note && !isCurrent) return null;

  const character = getCharacter(definition.character);
  const fields = artifact ? Object.entries(artifact) : [];
  // 앞서 적었다가 고쳐 쓴 것들 — 시행착오도 발명 과정이라 본문 아래에 남긴다
  const earlier = (session.quest.history?.[stage] ?? []) as Array<Record<string, unknown>>;

  return (
    <section
      className={cn(
        "rounded-xl border bg-white px-4 py-3",
        artifact ? "border-line" : "border-dashed border-neutral-200",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            artifact ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400",
          )}
        >
          {artifact ? <Check className="size-3" strokeWidth={3} /> : stage}
        </span>
        <h3 className="text-sm font-semibold">{definition.label}</h3>
        <span className="text-[11px] text-neutral-400">{character.name}</span>
      </div>

      {note?.summary && (
        <p className="mb-2 text-xs leading-relaxed text-neutral-600">{note.summary}</p>
      )}

      {fields.length > 0 ? (
        <FieldList fields={fields} />
      ) : (
        !note && (
          <p className="text-xs text-neutral-400">{definition.doneWhen}</p>
        )
      )}

      {earlier.length > 0 && <EarlierAttempts attempts={earlier} />}
    </section>
  );
}

function FieldList({ fields }: { fields: Array<[string, unknown]> }) {
  return (
    <dl className="space-y-1 text-xs leading-relaxed">
      {fields.map(([key, value]) => {
        const text = formatValue(key, value);
        if (!text) return null;
        return (
          <div key={key} className="flex gap-2">
            <dt className="w-24 shrink-0 text-neutral-400">{FIELD_LABELS[key] ?? key}</dt>
            <dd className="min-w-0 flex-1">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * 고쳐 쓰기 전에 적었던 것들.
 *
 * 앞 단계로 돌아가 다시 정리하면 본문은 최종본으로 바뀌지만, 처음에 어떻게
 * 생각했는지도 발명 과정의 일부다. 접어 두었다가 펼쳐 볼 수 있게 남긴다.
 */
function EarlierAttempts({ attempts }: { attempts: Array<Record<string, unknown>> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-dashed border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700"
      >
        <History className="size-3" />
        고치기 전 기록 {attempts.length}개 {open ? "접기" : "펼치기"}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {attempts.map((attempt, index) => (
            <div key={index} className="rounded-lg bg-neutral-50 px-3 py-2">
              <p className="mb-1 text-[10px] text-neutral-400">{index + 1}번째로 적었던 내용</p>
              <FieldList fields={Object.entries(attempt)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

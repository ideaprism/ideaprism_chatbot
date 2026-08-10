import { initialQuestState, STAGES, type StageId } from "./quest";
import type { NoteEntry, SessionState } from "@/types/chat";

/** 새 세션 (익명 — 별명만 받는다) */
export function createSession(): SessionState {
  return {
    sessionId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    nickname: null,
    quest: initialQuestState(),
    notes: [],
    offTopicCount: 0,
    aiCalls: 0,
  };
}

/**
 * 브라우저가 보낸 세션 값의 형태만 확인한다.
 * (프로토타입은 익명이라 인증이 없다. 단계 승급은 어차피 서버의 검증 함수를 거친다.)
 */
export function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SessionState>;
  return (
    typeof s.sessionId === "string" &&
    Array.isArray(s.notes) &&
    typeof s.aiCalls === "number" &&
    !!s.quest &&
    typeof s.quest === "object" &&
    typeof (s.quest as { currentStage?: unknown }).currentStage === "number"
  );
}

/** 발명노트를 AI에게 다시 넣어 줄 짧은 요지로 만든다 (PRD F-7: 노트 요지는 항상 유지) */
export function noteDigest(notes: NoteEntry[]): string | null {
  if (notes.length === 0) return null;

  // 단계별로 가장 최근 기록만 남긴다
  const latest = new Map<StageId, NoteEntry>();
  for (const note of notes) latest.set(note.stage, note);

  return [...latest.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stage, note]) => `- ${stage}단계(${STAGES[stage].label}): ${note.summary}`)
    .join("\n");
}

/** 노트 추가 — 같은 단계를 다시 적으면 덧붙이지 않고 갱신한다 */
export function upsertNote(notes: NoteEntry[], entry: NoteEntry): NoteEntry[] {
  const index = notes.findIndex((n) => n.stage === entry.stage);
  if (index === -1) return [...notes, entry];
  const next = [...notes];
  next[index] = { ...next[index], ...entry };
  return next;
}

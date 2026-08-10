"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCharacter, normalizeEmotion, type CharacterId } from "@/lib/characters";
import { STAGES } from "@/lib/quest";
import { createSession } from "@/lib/session";
import type { ToolName } from "@/lib/tools";
import type { ChatEvent, ChatMessage, SessionState } from "@/types/chat";
import type { InventionRow, LookupItem } from "@/types/search";

/** 검색 결과 원본 — 브라우저 메모리에만 둔다(최대 500건, 저장소에 넣기엔 크다) */
export interface SearchResults {
  rows: InventionRow[];
  grades: LookupItem[];
  categories: LookupItem[];
}

export type FilterKind = "grades" | "problemTags" | "scamper";

/** 우측 패널에 무엇을 띄울지 */
export type PanelKind = "search" | "note" | "patent";

interface RunOptions {
  intent?: "opening" | "handoff";
  handoffFrom?: CharacterId | null;
  /** 배턴터치 자동 이어달리기 깊이 — 무한 연쇄 방지 */
  depth?: number;
}

/** run 은 배턴터치 때 자기 자신을 다시 부르므로 타입을 미리 못박아 둔다 */
type RunFn = (
  userText: string | null,
  baseSession: SessionState,
  options?: RunOptions,
) => Promise<void>;

const STORAGE_KEY = "ideaprism:session";
/** 서버로 되돌려 보낼 최근 대화 턴 수 */
const HISTORY_TURNS = 24;

export interface Handoff {
  from: CharacterId;
  to: CharacterId;
}

function newId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useChat() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [activePanel, setActivePanel] = useState<PanelKind | null>(null);

  /** 스트리밍 도중에도 최신 값을 읽어야 해서 ref로 함께 들고 간다 */
  const sessionRef = useRef<SessionState | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const booted = useRef(false);

  const syncMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const syncSession = useCallback((next: SessionState) => {
    sessionRef.current = next;
    setSession(next);
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ session: next, messages: messagesRef.current }),
      );
    } catch {
      /* 저장 실패는 조용히 무시 — 대화 자체에는 영향이 없다 */
    }
  }, []);

  const run: RunFn = useCallback(
    async (userText, baseSession, options = {}) => {
      const depth = options.depth ?? 0;
      setError(null);
      setStreaming(true);

      const character = STAGES[baseSession.quest.currentStage].character;
      const assistantId = newId();

      // 서버로 보낼 이력은 이번 턴 말풍선을 붙이기 "전" 상태로 만든다
      const history = messagesRef.current
        .filter((m) => !m.pending && m.text.trim())
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text }));

      let working = [...messagesRef.current];
      if (userText) working.push({ id: newId(), role: "user", text: userText });
      working.push({
        id: assistantId,
        role: "assistant",
        character,
        emotion: getCharacter(character).defaultEmotion,
        text: "",
        tools: [],
        pending: true,
      });
      syncMessages(working);

      const patch = (update: Partial<ChatMessage>) => {
        working = working.map((m) => (m.id === assistantId ? { ...m, ...update } : m));
        syncMessages(working);
      };

      /** 이번 턴에 담당이 바뀌었으면, 새 캐릭터가 이어서 등장하도록 자동으로 한 턴 더 돈다 */
      let handoffFrom: CharacterId | null = null;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: baseSession,
            message: userText,
            intent: options.intent,
            handoffFrom: options.handoffFrom ?? null,
            history,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? `요청이 실패했습니다 (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        const tools: ToolName[] = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;

            let event: ChatEvent;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            switch (event.type) {
              case "emotion":
                patch({
                  emotion: normalizeEmotion(event.character, event.emotion),
                  character: event.character,
                });
                break;
              case "text":
                text += event.delta;
                patch({ text });
                break;
              case "tool":
                if (event.status === "start" && !tools.includes(event.name)) {
                  tools.push(event.name);
                  patch({ tools: [...tools] });
                }
                break;
              case "handoff":
                setHandoff({ from: event.from, to: event.to });
                handoffFrom = event.from;
                break;
              case "results":
                setResults({
                  rows: event.rows,
                  grades: event.grades,
                  categories: event.categories,
                });
                // 새로 검색했으면 우측을 검색 결과로 돌린다(PRD S-3)
                setActivePanel("search");
                break;
              case "state":
                syncSession(event.session);
                break;
              case "error":
                setError(event.message);
                break;
              case "done":
                break;
            }
          }
        }

        patch({ pending: false });
      } catch (cause) {
        patch({ pending: false });
        handoffFrom = null;
        setError(cause instanceof Error ? cause.message : "알 수 없는 오류가 발생했습니다.");
      } finally {
        // 이어달리기를 할 거면 입력창을 계속 잠가 둔다(깜빡임 방지)
        if (!handoffFrom) setStreaming(false);
      }

      // 배턴터치: 앞 캐릭터의 퇴장 인사가 끝났으니 새 캐릭터가 등장 인사를 한다.
      // 학생이 뭔가 입력할 때까지 기다리지 않는다 (PRD F-2 배턴터치 연출).
      const nextSession = sessionRef.current;
      if (handoffFrom && nextSession && depth < 2) {
        await run(null, nextSession, {
          intent: "handoff",
          handoffFrom,
          depth: depth + 1,
        });
      } else if (handoffFrom) {
        setStreaming(false);
      }
    },
    [syncMessages, syncSession],
  );

  /** 첫 마운트: 저장된 세션을 되살리거나, 새 세션을 만들고 캐릭터가 먼저 말을 걸게 한다 */
  const bootstrap = useCallback(() => {
    let restored: { session: SessionState; messages: ChatMessage[] } | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch {
      restored = null;
    }

    if (restored?.session) {
      sessionRef.current = restored.session;
      setSession(restored.session);
      syncMessages(restored.messages ?? []);
      return;
    }

    const fresh = createSession();
    sessionRef.current = fresh;
    setSession(fresh);
    void run(null, fresh);
  }, [run, syncMessages]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    bootstrap();
  }, [bootstrap]);

  const send = useCallback(
    (text: string) => {
      const current = sessionRef.current;
      if (!current || streaming || !text.trim()) return;
      void run(text.trim(), current);
    },
    [run, streaming],
  );

  const restart = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
    const fresh = createSession();
    sessionRef.current = fresh;
    setSession(fresh);
    syncMessages([]);
    setHandoff(null);
    setError(null);
    setResults(null);
    setActivePanel(null);
    void run(null, fresh);
  }, [run, syncMessages]);

  const dismissHandoff = useCallback(() => setHandoff(null), []);

  /**
   * 필터 칩 클릭 — 서버 왕복 없이 즉시 반영한다(PRD 8장: 체감 0.1초).
   * 바뀐 필터는 세션에 담기므로, 다음 대화 요청 때 AI도 같은 상태를 보게 된다
   * (PRD S-4: 클릭과 채팅 명령이 양쪽으로 동기화).
   */
  const toggleFilter = useCallback(
    (kind: FilterKind, value: string) => {
      const current = sessionRef.current;
      if (!current?.search) return;

      const selected = current.search.filters[kind];
      const nextValues = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];

      syncSession({
        ...current,
        search: {
          ...current.search,
          filters: { ...current.search.filters, [kind]: nextValues },
        },
      });
    },
    [syncSession],
  );

  const clearFilters = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.search) return;
    syncSession({
      ...current,
      search: {
        ...current.search,
        filters: { grades: [], problemTags: [], scamper: [] },
      },
    });
  }, [syncSession]);

  const focusInvention = useCallback(
    (id: string | null) => {
      const current = sessionRef.current;
      if (!current?.search) return;
      syncSession({ ...current, search: { ...current.search, focusedId: id } });
    },
    [syncSession],
  );

  return {
    session,
    messages,
    streaming,
    error,
    handoff,
    results,
    activePanel,
    setActivePanel,
    send,
    restart,
    dismissHandoff,
    toggleFilter,
    clearFilters,
    focusInvention,
  };
}

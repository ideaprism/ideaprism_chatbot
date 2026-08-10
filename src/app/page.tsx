"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Composer } from "@/components/Composer";
import { HandoffOverlay } from "@/components/HandoffOverlay";
import { MessageList } from "@/components/MessageList";
import { NotePanel } from "@/components/note/NotePanel";
import { ProgressRail } from "@/components/ProgressRail";
import { SearchPanel } from "@/components/search/SearchPanel";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { useChat } from "@/hooks/useChat";

export default function Home() {
  const {
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
  } = useChat();

  if (!session) {
    return (
      <main className="flex h-dvh items-center justify-center text-sm text-neutral-400">
        준비하는 중…
      </main>
    );
  }

  const canSearch = Boolean(session.search && results);
  const hasNote =
    session.notes.length > 0 || Object.keys(session.quest.completed).length > 0;

  const panel =
    activePanel === "search" && canSearch && session.search && results ? (
      <SearchPanel
        snapshot={session.search}
        results={results}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        onFocus={focusInvention}
      />
    ) : activePanel === "note" ? (
      <NotePanel session={session} />
    ) : undefined;

  return (
    <main className="flex h-dvh flex-col">
      <ProgressRail
        quest={session.quest}
        activePanel={activePanel}
        onSelectPanel={setActivePanel}
        available={{ search: canSearch, note: hasNote, patent: false }}
      />

      <WorkspaceShell
        chat={
          <div className="no-print flex min-h-0 flex-1 flex-col">
            <MessageList messages={messages} streaming={streaming} />

            {error && (
              <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={restart}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                  >
                    <RotateCcw className="size-3" /> 처음부터 다시 시작
                  </button>
                </div>
              </div>
            )}

            <Composer onSend={send} disabled={streaming} />
          </div>
        }
        panel={panel}
      />

      <HandoffOverlay handoff={handoff} onDone={dismissHandoff} />
    </main>
  );
}

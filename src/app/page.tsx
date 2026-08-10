"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Composer } from "@/components/Composer";
import { HandoffOverlay } from "@/components/HandoffOverlay";
import { MessageList } from "@/components/MessageList";
import { NotePanel } from "@/components/note/NotePanel";
import { PatentPanel } from "@/components/patent/PatentPanel";
import { ProgressRail } from "@/components/ProgressRail";
import { ProviderPicker } from "@/components/ProviderPicker";
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
    patents,
    patentEpoch,
    patentSeed,
    activePanel,
    setActivePanel,
    providers,
    lastModel,
    switchProvider,
    send,
    restart,
    dismissHandoff,
    toggleFilter,
    clearFilters,
    focusInvention,
    applyPatentResult,
    seedPatentSearch,
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
  // 5단계에서 AI가 만든 검색식이 있거나, 선배 발명에서 특허 검색으로 넘어왔을 때 열 수 있다
  const canPatent = Boolean(session.patent || patentSeed);

  const panel =
    activePanel === "search" && canSearch && session.search && results ? (
      <SearchPanel
        snapshot={session.search}
        results={results}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        onFocus={focusInvention}
        onPatentSearch={seedPatentSearch}
      />
    ) : activePanel === "note" ? (
      <NotePanel session={session} />
    ) : activePanel === "patent" && canPatent ? (
      <PatentPanel
        key={patentEpoch}
        snapshot={session.patent}
        seed={patentSeed}
        patents={patents}
        onResult={applyPatentResult}
      />
    ) : undefined;

  return (
    <main className="flex h-dvh flex-col">
      <ProgressRail
        quest={session.quest}
        activePanel={activePanel}
        onSelectPanel={setActivePanel}
        available={{ search: canSearch, note: hasNote, patent: canPatent }}
        providerPicker={
          <ProviderPicker
            providers={providers}
            current={session.provider}
            lastModel={lastModel}
            conversationStarted={messages.length > 1}
            onSelect={switchProvider}
          />
        }
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
                    onClick={() => restart()}
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

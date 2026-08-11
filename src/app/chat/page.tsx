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

export default function ChatPage() {
  const {
    session,
    messages,
    streaming,
    error,
    handoff,
    results,
    patents,
    patentEpoch,
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
    goToStage,
    searchByStudent,
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
  // 특허 패널은 5단계 선행기술조사용 — AI가 검색식을 만들어야 열린다.
  // (선배 발명을 구경하다 하는 특허 검색은 그 발명의 상세 모달 안에서 열린다)
  const canPatent = Boolean(session.patent);

  const panel =
    activePanel === "search" && canSearch && session.search && results ? (
      <SearchPanel
        snapshot={session.search}
        results={results}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        onFocus={focusInvention}
        onSearch={searchByStudent}
      />
    ) : activePanel === "note" ? (
      <NotePanel session={session} />
    ) : activePanel === "patent" && canPatent ? (
      <PatentPanel
        key={patentEpoch}
        snapshot={session.patent}
        seed={null}
        patents={patents}
        onResult={applyPatentResult}
        // 기초로 삼은 발명을 다시 열어 준다 (결과가 메모리에 남아 있을 때만)
        onOpenInvention={
          canSearch
            ? (id) => {
                focusInvention(id);
                setActivePanel("search");
              }
            : undefined
        }
      />
    ) : undefined;

  return (
    <main className="flex h-dvh flex-col">
      <ProgressRail
        quest={session.quest}
        cast={session.cast}
        guest={session.guest}
        activePanel={activePanel}
        onSelectPanel={setActivePanel}
        available={{ search: canSearch, note: hasNote, patent: canPatent }}
        onGoToStage={goToStage}
        canGoBack={!streaming}
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

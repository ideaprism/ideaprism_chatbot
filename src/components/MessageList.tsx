"use client";

import { useEffect, useRef } from "react";

import { CharacterAvatar } from "./CharacterAvatar";
import { getCharacter } from "@/lib/characters";
import type { ToolName } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";

const TOOL_LABEL: Record<ToolName, string> = {
  search_inventions: "선배 발명 찾아보는 중",
  apply_filters: "조건에 맞게 추리는 중",
  get_statistics: "통계 살펴보는 중",
  show_invention: "발명 하나 자세히 보는 중",
  generate_kipris_query: "특허 검색식 만드는 중",
  search_kipris: "특허 찾아보는 중",
  update_note: "발명노트에 적는 중",
  complete_stage: "단계 완료 확인 중",
};

export function MessageList({
  messages,
  streaming,
}: {
  messages: ChatMessage[];
  streaming: boolean;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  return (
    <div className="scroll-soft flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.map((message) =>
          message.role === "user" ? (
            <UserBubble key={message.id} message={message} />
          ) : (
            <CharacterBubble key={message.id} message={message} />
          ),
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-[15px] leading-relaxed text-white">
        {message.text}
      </p>
    </div>
  );
}

function CharacterBubble({ message }: { message: ChatMessage }) {
  const characterId = message.character ?? "teacher";
  const meta = getCharacter(characterId);
  const tools = message.tools ?? [];
  const empty = message.text.trim().length === 0;

  return (
    <div className="flex items-start gap-3">
      <CharacterAvatar character={characterId} emotion={message.emotion} />

      <div className="min-w-0 flex-1">
        <p className={cn("mb-1 text-xs font-semibold", meta.theme.accent)}>{meta.name}</p>

        {tools.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <li
                key={tool}
                className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] text-neutral-500"
              >
                {TOOL_LABEL[tool] ?? tool}
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn(
            "inline-block max-w-full rounded-2xl rounded-tl-sm border px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap",
            meta.theme.bubble,
          )}
        >
          {empty && message.pending ? (
            <span className="text-neutral-400">생각하는 중…</span>
          ) : (
            <span className={cn(message.pending && "caret")}>{message.text}</span>
          )}
        </div>
      </div>
    </div>
  );
}

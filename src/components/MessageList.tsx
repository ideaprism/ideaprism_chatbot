"use client";

import { useEffect, useRef } from "react";

import { CharacterAvatar } from "./CharacterAvatar";
import { getCharacter } from "@/lib/characters";
import { splitSpeech } from "@/lib/emotion";
import type { ToolName } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";

/**
 * 감정 그림 한 변의 길이(px). 원본이 정사각형이라 가로=세로다.
 *
 * 200으로 뒀더니 우측 패널이 열렸을 때(채팅이 36%로 줄어든다) 말풍선이
 * 그림과 같은 199px까지 눌려 한 줄에 열 글자밖에 안 들어갔다.
 */
const AVATAR_SIZE = 120;

const TOOL_LABEL: Record<ToolName, string> = {
  search_inventions: "선배 발명 찾아보는 중",
  apply_filters: "조건에 맞게 추리는 중",
  get_statistics: "통계 살펴보는 중",
  show_invention: "발명 하나 자세히 보는 중",
  generate_kipris_query: "특허 검색식 만드는 중",
  search_kipris: "특허 찾아보는 중",
  update_note: "발명노트에 적는 중",
  complete_stage: "단계 완료 확인 중",
  call_expert: "전문가 부르는 중",
  send_off_expert: "전문가 배웅하는 중",
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

  // 사람이 바뀐 자리와 감정이 바뀐 자리에서 글을 토막 내고,
  // 토막마다 그 사람의 얼굴과 말풍선 색을 붙인다.
  // 혼자 말하고 감정도 한 번뿐이면 토막도 하나 — 지금까지와 똑같이 보인다.
  const segments = splitSpeech(message.text, {
    emotions: message.emotionMarks,
    speakers: message.speakerMarks,
    character: characterId,
  });

  return (
    <div className="flex flex-col gap-2">
      {tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
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

      {/* 아직 한 글자도 안 나왔으면 말풍선만. 얼굴은 대사와 함께 나온다 */}
      {segments.length === 0 ? (
        <>
          <p className={cn("text-xs font-semibold", meta.theme.accent)}>{meta.name}</p>
          {message.pending && (
            <div
              className={cn(
                "self-start rounded-2xl rounded-tl-sm border px-4 py-2.5 text-[15px] leading-relaxed",
                meta.theme.bubble,
              )}
            >
              <span className="text-neutral-400">생각하는 중…</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {segments.map((segment, index) => {
            const who = getCharacter(segment.character);
            // 이름표는 말하는 사람이 바뀔 때만 — 같은 사람이 이어 말하면 군더더기다
            const showName = index === 0 || segments[index - 1].character !== segment.character;

            return (
              <div key={index} className="flex items-start gap-3">
                <CharacterAvatar
                  character={segment.character}
                  emotion={segment.emotion}
                  size={AVATAR_SIZE}
                />

                <div className="min-w-0 flex-1">
                  {showName && (
                    <p className={cn("mb-1 text-xs font-semibold", who.theme.accent)}>
                      {who.name}
                    </p>
                  )}
                  <div
                    className={cn(
                      "inline-block max-w-full rounded-2xl rounded-tl-sm border px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap",
                      who.theme.bubble,
                    )}
                  >
                    <span
                      className={cn(
                        // 깜빡이는 커서는 지금 쓰이고 있는 마지막 토막에만
                        message.pending && index === segments.length - 1 && "caret",
                      )}
                    >
                      {segment.text}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

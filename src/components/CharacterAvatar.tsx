"use client";

import Image from "next/image";
import { useState } from "react";

import { emotionImageUrl, getCharacter, type CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

/**
 * 감정 이미지 렌더러 (PRD F-3).
 * AI는 감정 "이름"만 골랐고, 주소 조립과 표시는 전적으로 이 컴포넌트가 한다.
 */
export function CharacterAvatar({
  character,
  emotion,
  size = 56,
  className,
}: {
  character: CharacterId;
  emotion?: string;
  size?: number;
  className?: string;
}) {
  const meta = getCharacter(character);
  const name = emotion ?? meta.defaultEmotion;
  const [broken, setBroken] = useState(false);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-white ring-2",
        meta.theme.ring,
        className,
      )}
      style={{ width: size, height: size }}
      title={`${meta.name} · ${name}`}
    >
      {broken ? (
        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-400">
          {meta.name.slice(0, 1)}
        </span>
      ) : (
        <Image
          src={emotionImageUrl(character, name)}
          alt={`${meta.name}의 ${name} 표정`}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
          unoptimized
        />
      )}
    </div>
  );
}

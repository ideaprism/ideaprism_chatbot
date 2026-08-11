"use client";

import Image from "next/image";
import { useState } from "react";

import { emotionImageUrl, getCharacter, type CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

/**
 * 감정 이미지 렌더러 (PRD F-3).
 * AI는 감정 "이름"만 골랐고, 주소 조립과 표시는 전적으로 이 컴포넌트가 한다.
 *
 * 원본이 1024×1024 정사각형이라 동그랗게 오리면 그림이 잘린다.
 * 그래서 둥근 네모(정사각형 + 둥근 모서리)로 두고 원본 비율을 그대로 쓴다.
 */
export function CharacterAvatar({
  character,
  emotion,
  size = 200,
  className,
}: {
  character: CharacterId;
  emotion?: string;
  /** 한 변의 길이(px). 원본이 정사각형이라 가로·세로가 같다 */
  size?: number;
  className?: string;
}) {
  const meta = getCharacter(character);
  const name = emotion ?? meta.defaultEmotion;
  const [broken, setBroken] = useState(false);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl bg-white ring-1",
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
          // 감정이 바뀌면 다른 그림이 되도록 key를 걸어 둔다
          // (같은 <img>를 재사용하면 이전 그림이 남아 보이는 브라우저가 있다)
          key={name}
          src={emotionImageUrl(character, name)}
          alt={`${meta.name}의 ${name} 표정`}
          width={size}
          height={size}
          sizes={`${size}px`}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

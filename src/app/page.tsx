"use client";

import { ArrowRight, Lightbulb } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { CHARACTERS, emotionImageUrl, type CharacterId } from "@/lib/characters";
import { STAGE_IDS, STAGES, type StageId } from "@/lib/quest";
import { SESSION_STORAGE_KEY } from "@/lib/session";

/**
 * 첫 화면.
 *
 * 1.0의 디자인 규칙을 따른다 — 무지개 워드마크, 프라이머리 블루(#0066FF),
 * 둥근 필 버튼, 흐릿한 그라데이션 덩어리. 색값은 globals.css 의 1.0 토큰을 쓴다.
 *
 * 스크롤로 내려 읽는 소개 페이지가 아니라 한 화면에 다 담는다.
 * 그래서 세로 여백은 화면 높이에 따라 줄어들고(py-*), 아주 낮은 창에서만
 * 잘리지 않도록 스크롤이 생긴다.
 */

/** 1.0 헤더의 무지개 워드마크 — 글자마다 색이 다르다 (프리즘) */
const WORDMARK: Array<[string, string]> = [
  ["I", "text-red-500"],
  ["d", "text-orange-500"],
  ["e", "text-yellow-500"],
  ["a", "text-green-500"],
  ["P", "text-teal-500"],
  ["r", "text-blue-500"],
  ["i", "text-indigo-500"],
  ["s", "text-violet-500"],
  ["m", "text-purple-600"],
];

const TRIO: CharacterId[] = ["teacher", "jiyou", "detective"];

/**
 * 하던 대화가 어디까지 왔는지 sessionStorage 에서 읽는다.
 *
 * 저장된 글은 대화 전체라 꽤 크다. useSyncExternalStore 는 그릴 때마다 이 함수를
 * 부르므로, 원문이 그대로면 지난번에 푼 값을 그대로 돌려준다.
 * (같은 값을 돌려줘야 React가 다시 그리지 않는다)
 */
let lastRead: { raw: string | null; stage: StageId | null } = { raw: "", stage: null };

function readResumeStage(): StageId | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === lastRead.raw) return lastRead.stage;

  let stage: StageId | null = null;
  try {
    const value = raw ? JSON.parse(raw)?.session?.quest?.currentStage : null;
    if (typeof value === "number" && value in STAGES) stage = value as StageId;
  } catch {
    /* 저장된 게 깨졌으면 새로 시작하면 된다 */
  }
  lastRead = { raw, stage };
  return stage;
}

/** 이 화면이 떠 있는 동안에는 값이 바뀌지 않으므로 구독할 곳이 없다 */
const noSubscription = () => () => {};
/** 서버에는 sessionStorage 가 없다 — 첫 그림은 항상 "하던 대화 없음" */
const noStageOnServer = () => null;

export default function Landing() {
  const router = useRouter();
  /** 이 창에서 하던 대화가 있으면 어디까지 왔는지 */
  const resumeAt = useSyncExternalStore(
    noSubscription,
    readResumeStage,
    noStageOnServer,
  );

  const startFresh = () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* 못 지워도 대화는 시작된다 */
    }
    router.push("/chat");
  };

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-prism-canvas text-on-surface">
      {/* 1.0 히어로의 흐릿한 그라데이션 덩어리 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        <div className="absolute top-[-15%] right-[-8%] size-[520px] rounded-full bg-gradient-to-br from-orange-200/40 to-yellow-200/40 opacity-50 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-12%] size-[620px] rounded-full bg-gradient-to-tr from-blue-100/60 to-indigo-100/50 opacity-80 blur-3xl" />
      </div>

      <header className="relative z-10 shrink-0 border-b border-outline-variant/20 bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-primary/5 p-2">
              <Lightbulb className="size-5 text-amber-500 sm:size-6" />
            </div>
            <span className="flex items-center text-xl font-black tracking-tight sm:text-2xl">
              {WORDMARK.map(([letter, color]) => (
                <span key={letter + color} className={color}>
                  {letter}
                </span>
              ))}
            </span>
          </div>

          <span className="rounded-full border border-outline-variant/60 bg-surface px-3 py-1 text-[11px] font-bold text-on-surface-variant">
            2.0 프로토타입
          </span>
        </div>
      </header>

      {/*
        세로 여백은 창 높이에 맞춰 줄인다 — 낮은 노트북에서도 스크롤이 안 생기게.
        그래도 모자랄 만큼 창이 낮으면 잘리는 대신 이 안쪽만 스크롤된다.
      */}
      <div className="scroll-soft relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-5 text-center [@media(min-height:760px)]:gap-8 [@media(min-height:760px)]:py-10">
        {/* 함께할 세 사람 */}
        <div className="flex items-start justify-center gap-3 sm:gap-6">
          {TRIO.map((id) => {
            const character = CHARACTERS[id];
            return (
              // 얼굴은 창이 넓고 높을 때만 크게 — 좁거나 낮으면 스크롤이 생긴다
              <div
                key={id}
                className="flex w-20 flex-col items-center gap-2 [@media(min-width:640px)_and_(min-height:760px)]:w-28"
              >
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-outline-variant/50">
                  <Image
                    src={emotionImageUrl(id, character.defaultEmotion)}
                    alt={character.name}
                    width={112}
                    height={112}
                    sizes="112px"
                    className="size-20 object-cover [@media(min-width:640px)_and_(min-height:760px)]:size-28"
                    priority
                  />
                </div>
                <p className="text-[11px] leading-tight font-bold sm:text-xs">
                  {character.name}
                </p>
                <p className="-mt-1 text-[10px] text-on-surface-variant sm:text-[11px]">
                  {character.role.split("·")[0].trim()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="max-w-2xl">
          <h1 className="text-[26px] leading-[1.3] font-black tracking-tight sm:text-4xl lg:text-[42px]">
            발명 선배들과 이야기하며
            <br />
            나만의 <span className="text-primary">발명노트</span>를 완성해요
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-on-surface-variant sm:text-base">
            채팅이 곧 조종석이에요. 말만 하면 선배가 자료를 찾아 주고,
            <br className="hidden sm:block" /> 다섯 단계를 함께 마치면 발명노트가 저절로
            완성됩니다.
          </p>
        </div>

        {/* 시작하기 */}
        <div className="flex flex-col items-center gap-3">
          {resumeAt === null ? (
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-bold text-on-primary shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
            >
              대화 시작하기
              <ArrowRight className="size-5" />
            </Link>
          ) : (
            <>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-bold text-on-primary shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
              >
                이어서 하기
                <ArrowRight className="size-5" />
              </Link>
              <p className="text-xs text-on-surface-variant">
                {resumeAt}단계 「{STAGES[resumeAt].label}」까지 왔어요 ·{" "}
                <button
                  type="button"
                  onClick={startFresh}
                  className="font-bold text-primary underline underline-offset-2"
                >
                  처음부터 새로
                </button>
              </p>
            </>
          )}
        </div>

        {/* 발명 5단계 */}
        <ol className="flex max-w-2xl flex-wrap items-center justify-center gap-1.5">
          {STAGE_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded-full border border-outline-variant/60 bg-surface px-3 py-1 text-[11px] text-on-surface-variant sm:text-xs"
            >
              <span className="font-black text-primary tabular-nums">{id}</span>
              {STAGES[id].label}
            </li>
          ))}
        </ol>
      </div>

      <footer className="relative z-10 shrink-0 border-t border-outline-variant/20 bg-surface/70 px-5 py-3 text-center backdrop-blur-md">
        <p className="text-[11px] text-on-surface-variant">
          프로토타입 · 별명만 받아요. 실명·학교·연락처 같은 개인정보는 모으지 않습니다.
        </p>
      </footer>
    </main>
  );
}

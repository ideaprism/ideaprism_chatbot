import { Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * IdeaPrism 로고 — 1.0과 같은 얼굴.
 *
 * 글자마다 색이 다른 무지개 워드마크(프리즘) + 호박색 전구.
 * 랜딩과 대화 화면이 같은 로고를 써야 같은 서비스로 보인다.
 * 색값은 1.0 `layout/Header.tsx` 에서 그대로 옮겼다 — 고치지 말 것.
 */
const LETTERS: Array<[string, string]> = [
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

export function Wordmark({
  size = "md",
  className,
}: {
  /** sm — 대화 화면 헤더 · md — 랜딩 */
  size?: "sm" | "md";
  className?: string;
}) {
  const small = size === "sm";

  return (
    <span className={cn("flex items-center", small ? "gap-1.5" : "gap-2", className)}>
      <span className={cn("rounded-xl bg-primary/5", small ? "p-1" : "p-2")}>
        <Lightbulb className={cn("text-amber-500", small ? "size-4" : "size-5 sm:size-6")} />
      </span>
      <span
        className={cn(
          "flex items-center font-black tracking-tight",
          small ? "text-base" : "text-xl sm:text-2xl",
        )}
      >
        {LETTERS.map(([letter, color]) => (
          <span key={letter + color} className={color}>
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

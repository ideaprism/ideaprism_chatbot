/**
 * 지금 쓰이는 대화구조를 읽어 온다.
 *
 * 공장 초기값은 코드(`cast.ts` 의 DEFAULT_CAST)에 있고,
 * 관리자 페이지에서 고친 값이 있으면 그쪽이 이긴다 (`prompt_overrides` 표).
 *
 * 순수 계산은 `lib/cast.ts` 에 있다 — 브라우저도 그걸 쓰기 때문에
 * server-only 를 들이는 곳은 여기 하나로 모아 둔다.
 */

import "server-only";

import { parseCast, type Cast } from "@/lib/cast";
import { readPrompt } from "./store";

export async function loadCast(): Promise<Cast> {
  return parseCast(await readPrompt("config", "대화구조"));
}

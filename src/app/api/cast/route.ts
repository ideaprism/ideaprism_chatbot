import { NextResponse } from "next/server";

import { DEFAULT_CAST } from "@/lib/cast";
import { loadCast } from "@/lib/prompts/cast";

/**
 * 지금 쓰이는 대화구조(단계 → 담당 캐릭터).
 *
 * 브라우저가 새 대화를 시작하기 직전에 한 번 받아 세션에 붙든다.
 * 읽지 못해도 대화는 시작돼야 하므로 공장 초기값으로 돌려준다.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ cast: await loadCast() });
  } catch (error) {
    console.error("[cast] 대화구조를 읽지 못했습니다", error);
    return NextResponse.json({ cast: DEFAULT_CAST });
  }
}

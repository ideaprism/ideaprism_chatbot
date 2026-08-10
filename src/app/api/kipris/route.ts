import { NextResponse } from "next/server";

import { KiprisError, searchKipris } from "@/lib/kipris/service";

/**
 * 특허 패널에서 검색식을 직접 고쳐 다시 조회할 때 쓰는 창구 (PRD S-7).
 * 채팅을 거치지 않으므로 AI 호출을 쓰지 않는다 — 학생이 검색식을 몇 번을 고쳐도 비용이 들지 않는다.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let query: string;
  try {
    const body = (await request.json()) as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "검색식을 입력해 주세요." }, { status: 400 });
  }

  try {
    const found = await searchKipris(query);
    return NextResponse.json({
      query,
      patents: found.patents,
      totalCount: found.totalCount,
    });
  } catch (error) {
    const message =
      error instanceof KiprisError
        ? error.message
        : "특허 조회 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

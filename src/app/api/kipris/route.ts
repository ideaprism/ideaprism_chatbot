import { NextResponse } from "next/server";

import { hasEntered } from "@/lib/entry/auth";
import { KIPRIS_ROWS, KiprisError, searchKipris } from "@/lib/kipris/service";

/**
 * 특허 패널에서 검색식을 직접 고쳐 다시 조회하거나 쪽을 넘길 때 쓰는 창구 (PRD S-7).
 * 채팅을 거치지 않으므로 AI 호출을 쓰지 않는다 — 학생이 검색식을 몇 번을 고쳐도 비용이 들지 않는다.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  // 입장코드 문 — AI 비용은 안 들지만 특허청 서비스키 할당량을 쓴다
  if (!(await hasEntered())) {
    return NextResponse.json({ error: "입장코드가 필요합니다." }, { status: 401 });
  }

  let query: string;
  let page: number;
  try {
    const body = (await request.json()) as { query?: unknown; page?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
    page = Number(body.page);
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "검색식을 입력해 주세요." }, { status: 400 });
  }

  try {
    const found = await searchKipris(query, Number.isFinite(page) ? page : 1);
    return NextResponse.json({
      query,
      patents: found.patents,
      totalCount: found.totalCount,
      page: found.page,
      pageSize: KIPRIS_ROWS,
    });
  } catch (error) {
    const message =
      error instanceof KiprisError
        ? error.message
        : "특허 조회 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

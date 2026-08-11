import { NextResponse } from "next/server";

import { lookupIpc } from "@/lib/kipris/ipc";

/**
 * IPC 분류 코드의 뜻 조회 — 1.0과 같은 `ipc_descriptions` 표를 읽는다.
 * (1.0은 브라우저에서 직접 Supabase를 부르지만, 2.0은 조회를 서버 라우트로 모아 둔다)
 *
 * 코드가 표에 없어도 오류가 아니다. 설명이 없을 뿐이라 200에 null을 돌려준다.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return NextResponse.json({ code: "", description: null });

  return NextResponse.json({ code, description: await lookupIpc(code) });
}

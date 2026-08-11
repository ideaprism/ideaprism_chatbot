import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE,
  TICKET_MAX_AGE_SECONDS,
  adminConfigured,
  checkPassword,
  isAdmin,
  issueTicket,
} from "@/lib/admin/auth";

/** 관리자 로그인·로그아웃·상태 확인 */
export const runtime = "nodejs";

/** 지금 로그인돼 있는가 (관리자 화면이 처음 뜰 때 물어본다) */
export async function GET() {
  return NextResponse.json({
    configured: adminConfigured(),
    authenticated: await isAdmin(),
  });
}

export async function POST(request: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      {
        error:
          "관리자 접근 코드가 설정되어 있지 않습니다. .env.local 에 ADMIN_PASSWORD 를 " +
          "넣고 개발 서버를 껐다 켜 주세요. (배포한 곳이라면 환경변수에 추가)",
      },
      { status: 503 },
    );
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "접근 코드가 맞지 않습니다." }, { status: 401 });
  }

  const ticket = issueTicket();
  if (!ticket) {
    return NextResponse.json({ error: "쪽지를 만들지 못했습니다." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, ticket, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TICKET_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** 로그아웃 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

import { NextResponse } from "next/server";

import {
  ENTRY_COOKIE,
  ENTRY_TICKET_MAX_AGE_SECONDS,
  checkEntryCode,
  hasEntered,
  issueEntryTicket,
} from "@/lib/entry/auth";

/**
 * 학생 입장 — 코드를 확인하고 문을 열어 준다.
 *
 * 코드가 맞으면 서명된 쪽지(쿠키)를 준다. 코드 자체는 쿠키에 담기지 않는다.
 * 대화를 시작하는 길목(`/chat` 과 돈이 나가는 API)이 이 쪽지를 확인한다.
 */
export const runtime = "nodejs";

/** 지금 들어와도 되는 상태인가 (랜딩페이지가 처음 뜰 때 물어본다) */
export async function GET() {
  return NextResponse.json({ entered: await hasEntered() });
}

export async function POST(request: Request) {
  let code: unknown;
  try {
    ({ code } = (await request.json()) as { code?: unknown });
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const checked = await checkEntryCode(code);
  if (!checked.ok) {
    return NextResponse.json(
      { error: "입장코드가 맞지 않아요. 선생님께 코드를 다시 여쭤보세요." },
      { status: 401 },
    );
  }

  // 쪽지에 "어느 교실인가"를 함께 담는다 — 나중에 노트에 남을 값이다
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ENTRY_COOKIE, await issueEntryTicket(checked.classroomId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ENTRY_TICKET_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** 나가기 — 같은 기기에서 다음 사람에게 넘길 때 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ENTRY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

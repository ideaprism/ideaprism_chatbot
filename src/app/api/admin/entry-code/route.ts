import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin/auth";
import {
  ENTRY_CODE_MAX,
  ENTRY_CODE_MIN,
  legacyEntryCode,
  isDefaultEntryCode,
  setEntryCode,
} from "@/lib/entry/auth";

/**
 * 학생 입장코드 관리 — 관리자만.
 *
 * 프롬프트 편집기(`/api/admin/prompts/...`)로는 이 값을 못 건드리게 해 두었다.
 * 그 편집기는 20자 미만을 거부하므로 네 자리 코드를 저장할 수 없고,
 * 코드를 긴 글처럼 다루면 실수로 지워지기 쉽다. 여기가 전용 창구다.
 */
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 401 });
  }

  return NextResponse.json({
    code: await legacyEntryCode(),
    isDefault: await isDefaultEntryCode(),
    min: ENTRY_CODE_MIN,
    max: ENTRY_CODE_MAX,
  });
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 고칠 수 있습니다." }, { status: 401 });
  }

  let code: unknown;
  try {
    ({ code } = (await request.json()) as { code?: unknown });
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  let failed: { error: string } | null;
  try {
    failed = await setEntryCode(code);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          `저장하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}. ` +
          "supabase/prompt_overrides.sql 을 Supabase에서 실행했는지 확인해 주세요. " +
          "저장이 안 되는 동안에도 기본 코드로는 들어갈 수 있습니다.",
      },
      { status: 502 },
    );
  }

  if (failed) return NextResponse.json(failed, { status: 400 });

  return NextResponse.json({
    ok: true,
    code: await legacyEntryCode(),
    isDefault: await isDefaultEntryCode(),
  });
}

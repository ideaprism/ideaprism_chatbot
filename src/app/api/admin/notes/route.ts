import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin/auth";
import {
  detail,
  statsOf,
  summarize,
  type NoteRow,
} from "@/lib/notes/summary";
import { supabaseWrite } from "@/lib/supabase";

/**
 * 이용내역 — 학생들이 남긴 발명노트를 관리자에게 보여 준다.
 *
 * `invention_notes` 는 RLS가 켜져 있고 정책이 없어서 브라우저 키로는 못 읽는다.
 * 서버 전용 키로만 읽으므로, 이 라우트가 유일한 창구다 (관리자 잠금 뒤).
 *
 * 익명 기록이다 — 별명 말고는 학생을 알아볼 수 있는 값이 없다.
 */
export const runtime = "nodejs";

/** 한 번에 가져올 최대 건수 — 프로토타입 규모에서는 이걸로 충분하다 */
const LIMIT = 200;

const COLUMNS =
  "session_id, nickname, matched_character, current_stage, completed, stages, " +
  "final_idea, kipris_query, ai_calls, token_usage, started_at, updated_at";

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 401 });
  }

  const wanted = new URL(request.url).searchParams.get("session");

  try {
    const query = supabaseWrite()
      .from("invention_notes")
      .select(COLUMNS)
      .order("updated_at", { ascending: false });

    const { data, error } = wanted
      ? await query.eq("session_id", wanted).limit(1)
      : await query.limit(LIMIT);

    if (error) throw error;

    const rows = (data ?? []) as unknown as NoteRow[];
    const now = Date.now();

    // 한 건만 달라고 하면 단계별 기록까지 펴서 준다
    if (wanted) {
      const one = rows[0];
      if (!one) return NextResponse.json({ error: "없는 기록입니다." }, { status: 404 });
      return NextResponse.json({ note: detail(one, now) });
    }

    const notes = rows.map((row) => summarize(row, now));
    return NextResponse.json({ notes, stats: statsOf(notes), limit: LIMIT });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "알 수 없는 오류";
    return NextResponse.json(
      {
        error:
          `이용내역을 읽지 못했습니다: ${message}. ` +
          "supabase/invention_notes.sql 을 Supabase에서 실행했는지, " +
          "SUPABASE_SECRET_KEY 가 들어 있는지 확인해 주세요.",
      },
      { status: 502 },
    );
  }
}

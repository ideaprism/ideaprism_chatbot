import { NextResponse } from "next/server";

import { hasKeywords, parseOpsmeKeywords } from "@/lib/kipris/opsme";
import { supabaseRead } from "@/lib/supabase";

/**
 * 선배 발명 1건에 미리 정리돼 있는 특허 검색 키워드(OPSME) 조회.
 *
 * 1.0이 발명 상세에서 "특허 검색"을 눌렀을 때 쓰는 것과 같은
 * `kipris_search_keywords` 표를 읽는다 — 같은 발명이면 1.0과 같은 검색식이 나온다.
 * 정리된 키워드가 없는 발명도 많으므로, 없으면 오류가 아니라 빈 결과다.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "발명 id가 필요합니다." }, { status: 400 });

  try {
    const { data } = await supabaseRead()
      .from("kipris_search_keywords")
      .select("kipris_search_keywords")
      .eq("invention_id", id)
      .maybeSingle();

    const raw = (data as { kipris_search_keywords?: string } | null)?.kipris_search_keywords;
    const parsed = parseOpsmeKeywords(raw);

    return NextResponse.json({
      found: hasKeywords(parsed.simple) || hasKeywords(parsed.expert),
      simple: parsed.simple,
      expert: parsed.expert,
      completeness: parsed.completeness ?? null,
    });
  } catch {
    // 표가 없거나 조회에 실패해도 특허 검색 자체는 계속할 수 있어야 한다
    return NextResponse.json({ found: false, simple: null, expert: null, completeness: null });
  }
}

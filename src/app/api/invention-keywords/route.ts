import { NextResponse } from "next/server";

import { fetchInventionKeywords } from "@/lib/kipris/keywords";

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

  const parsed = await fetchInventionKeywords(id);

  return NextResponse.json({
    found: Boolean(parsed),
    simple: parsed?.simple ?? null,
    expert: parsed?.expert ?? null,
    completeness: parsed?.completeness ?? null,
  });
}

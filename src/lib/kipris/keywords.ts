/**
 * 선배 발명에 미리 정리돼 있는 특허 검색 키워드 조회 (1.0의 `kipris_search_keywords` 표).
 *
 * 이게 IdeaPrism의 핵심 자산이다. 학생은 IPC 분류를 고를 줄도, 특허 검색어를 지을 줄도
 * 모른다. 그래서 자기 아이디어와 비슷한 선배 발명을 먼저 찾아, 그 발명에 붙어 있는
 * 분류와 키워드를 "기초 검색식"으로 빌려 쓴다. 학생은 거기서 낱말만 자기 것으로 바꾼다.
 */

import "server-only";

import { supabaseRead } from "@/lib/supabase";
import { hasKeywords, parseOpsmeKeywords, type OpsmeKeywordSets } from "./opsme";

/** 정리된 키워드가 없는 발명도 많다 — 그때는 null */
export async function fetchInventionKeywords(
  inventionId: string,
): Promise<OpsmeKeywordSets | null> {
  const id = inventionId.trim();
  if (!id) return null;

  try {
    const { data } = await supabaseRead()
      .from("kipris_search_keywords")
      .select("kipris_search_keywords")
      .eq("invention_id", id)
      .maybeSingle();

    const raw = (data as { kipris_search_keywords?: string } | null)?.kipris_search_keywords;
    const parsed = parseOpsmeKeywords(raw);

    if (!hasKeywords(parsed.simple) && !hasKeywords(parsed.expert)) return null;
    return parsed;
  } catch {
    // 표를 못 읽어도 특허 검색 자체는 계속할 수 있어야 한다
    return null;
  }
}

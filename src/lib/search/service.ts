/**
 * 발명 사례 검색 — 1.0의 /api/search 로직을 이식.
 *
 * 검색 1회로 최대 500건을 가져와 메모리에 적재하고(PRD F-4),
 * 조건에 맞는 "전체 건수"는 별도로 세어 "전체 N건 중 500건 기준"이라고 정직하게 표기한다.
 */

import "server-only";

import { supabaseRead } from "@/lib/supabase";
import type { InventionRow, LookupItem, SearchResult } from "@/types/search";
import { buildPostgrestFilter, parseSearchQuery } from "./query";

/** 한 번에 브라우저 메모리로 올리는 최대 건수 */
export const MAX_LOADED = 500;

/**
 * 1.0의 검색 API와 같은 컬럼 묶음.
 * 상세보기(1.0의 발명 상세 모달)가 쓰는 값까지 한 번에 실어 오므로,
 * 카드를 눌렀을 때 서버를 다시 부르지 않는다.
 */
const COLUMNS =
  "id, grade_id, category_id, original_title, simple_title, simple_summary, " +
  "detailed_summary, drawing_url, problem, solution, problem_tag, scamper, sdg, " +
  "invention_motive, next_step, curriculum, ipc";

const SEARCH_COLUMNS = [
  "original_title",
  "simple_title",
  "simple_summary",
  "detailed_summary",
];

export class SearchError extends Error {}

/** 검색어 → PostgREST or() 필터 문자열 */
function filterFor(keyword: string): string {
  const node = parseSearchQuery(keyword);
  if (node) return buildPostgrestFilter(node, SEARCH_COLUMNS);

  const safe = keyword.replace(/[,()]/g, " ").trim();
  return SEARCH_COLUMNS.map((col) => `${col}.ilike.%${safe}%`).join(",");
}

export async function searchInventions(rawKeyword: string): Promise<SearchResult> {
  const keyword = rawKeyword.trim();
  if (keyword.length < 2) {
    throw new SearchError("검색어는 2글자 이상이어야 합니다.");
  }

  const supabase = supabaseRead();
  const orFilter = filterFor(keyword);

  const [rowsResponse, countResponse, gradesResponse, categoriesResponse] =
    await Promise.all([
      supabase
        .from("inventions")
        .select(COLUMNS)
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(MAX_LOADED),
      // 전체 건수는 행을 받지 않고 개수만 센다(head: true)
      supabase.from("inventions").select("id", { count: "exact", head: true }).or(orFilter),
      supabase.from("grades").select("id, name").order("display_order", { ascending: true }),
      supabase.from("categories").select("id, name"),
    ]);

  if (rowsResponse.error) {
    if (rowsResponse.error.code === "57014") {
      throw new SearchError(
        "검색이 시간을 초과했습니다. 검색어를 조금 더 좁혀서 다시 시도해 주세요.",
      );
    }
    throw new SearchError(`검색에 실패했습니다: ${rowsResponse.error.message}`);
  }

  const rows = (rowsResponse.data ?? []) as unknown as InventionRow[];

  return {
    rows,
    // count 조회가 실패하면 적재 건수를 하한으로 쓴다(부풀리지 않는다)
    totalCount: countResponse.count ?? rows.length,
    grades: (gradesResponse.data ?? []) as LookupItem[],
    categories: (categoriesResponse.data ?? []) as LookupItem[],
  };
}

import { NextResponse } from "next/server";

import { availableValues, gradeNameMap } from "@/lib/search/facets";
import { MAX_LOADED, SearchError, searchInventions } from "@/lib/search/service";
import { putSearch } from "@/lib/search/store";

/**
 * 학생이 우측 패널에서 직접 검색할 때 쓰는 창구.
 *
 * 0~4단계에서는 선배가 대신 눌러 주지 않고 학생이 스스로 찾아보게 한다(대표님 방침).
 * 채팅을 거치지 않으므로 AI 호출을 쓰지 않는다 — 몇 번을 다시 찾아도 비용이 들지 않는다.
 *
 * 찾은 결과는 서버 캐시에도 넣어 둔다. 다음 턴에 AI가 통계를 물어봐도
 * 학생이 방금 본 것과 같은 결과셋으로 답하게 하기 위해서다.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  let keyword: string;
  let sessionId: string;
  try {
    const body = (await request.json()) as { keyword?: unknown; sessionId?: unknown };
    keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (keyword.length < 2) {
    return NextResponse.json(
      { error: "검색어는 2글자 이상 적어 주세요." },
      { status: 400 },
    );
  }

  try {
    const found = await searchInventions(keyword);

    if (found.rows.length === 0) {
      return NextResponse.json(
        { error: `“${keyword}”으로는 선배들의 발명을 찾지 못했어요. 다른 낱말로 바꿔 볼까요?` },
        { status: 404 },
      );
    }

    if (sessionId) {
      putSearch(sessionId, {
        keyword,
        rows: found.rows,
        grades: found.grades,
        categories: found.categories,
      });
    }

    const choices = availableValues(found.rows, gradeNameMap(found.grades));

    return NextResponse.json({
      keyword,
      rows: found.rows,
      grades: found.grades,
      categories: found.categories,
      totalCount: found.totalCount,
      loadedCount: Math.min(found.rows.length, MAX_LOADED),
      availableGrades: choices.grades,
      availableProblemTags: choices.problemTags,
      availableScamper: choices.scamper,
    });
  } catch (error) {
    const message =
      error instanceof SearchError
        ? error.message
        : "검색 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

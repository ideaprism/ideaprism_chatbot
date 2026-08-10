/**
 * OPSME 키워드 해석 — 1.0의 `src/utils/opsme-keywords.ts` 를 이식.
 *
 * 1.0은 선배들의 발명마다 특허 검색용 키워드를 미리 정리해 Supabase의
 * `kipris_search_keywords` 테이블에 한 줄짜리 문자열로 넣어 두었다.
 * 그 문자열을 5칸(O·P·S·M·E)으로 되돌리는 일을 여기서 한다.
 *
 * 형식 예시:
 *   [Simple]O:우산꽂이 @ P:공간부족 @ S:경첩
 *   ||
 *   [Expert]O:우산꽂이+"우산 거치대" @ P:공간부족 @ 완성도: '5점'
 */

import type { QueryParts } from "@/types/kipris";

/** 두 벌로 정리돼 있다 — 쉬운 쪽(Simple)과 자세한 쪽(Expert) */
export interface OpsmeKeywordSets {
  simple: QueryParts;
  expert: QueryParts;
  /** Expert 쪽에만 붙어 있는 완성도 표기 */
  completeness?: string;
}

const CATEGORY_KEYS: Record<string, keyof QueryParts> = {
  O: "object",
  P: "problem",
  S: "solution",
  M: "method",
  E: "effect",
};

function emptyParts(): QueryParts {
  return { object: [], problem: [], solution: [], method: [], effect: [] };
}

/**
 * `우산꽂이+"우산 거치대"+거치대` → ['우산꽂이', '우산 거치대', '거치대']
 * 따옴표로 묶인 낱말은 띄어쓰기가 있어도 한 낱말로 본다.
 */
function parseKeywordPart(part: string): string[] {
  const keywords: string[] = [];
  const regex = /"([^"]+)"|([^+]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(part)) !== null) {
    const keyword = (match[1] || match[2] || "").trim();
    if (keyword) keywords.push(keyword);
  }

  return keywords;
}

export function parseOpsmeKeywords(raw: string | null | undefined): OpsmeKeywordSets {
  const result: OpsmeKeywordSets = { simple: emptyParts(), expert: emptyParts() };
  if (!raw) return result;

  for (const chunk of raw.split("||").map((piece) => piece.trim())) {
    const isSimple = chunk.includes("[Simple]");
    const isExpert = chunk.includes("[Expert]");
    if (!isSimple && !isExpert) continue;

    const target = isSimple ? result.simple : result.expert;
    let body = chunk.replace(/\[Simple\]|\[Expert\]/g, "").trim();

    const completeness = body.match(/완성도:\s*'([^']+)'/);
    if (completeness) {
      result.completeness = completeness[1];
      body = body.replace(/\s*@?\s*완성도:\s*'[^']+'/g, "").trim();
    }

    for (const segment of body.split("@").map((piece) => piece.trim()).filter(Boolean)) {
      const match = segment.match(/^([OPSME]):(.+)$/);
      if (!match) continue;

      const key = CATEGORY_KEYS[match[1]];
      if (key && key !== "ipc") target[key] = parseKeywordPart(match[2]);
    }
  }

  return result;
}

/** 5칸에 실제로 낱말이 들어 있는지 (없으면 화면에 Simple/Expert 전환을 띄우지 않는다) */
export function hasKeywords(parts: QueryParts): boolean {
  return (
    (parts.object?.length ?? 0) +
      (parts.problem?.length ?? 0) +
      (parts.solution?.length ?? 0) +
      (parts.method?.length ?? 0) +
      (parts.effect?.length ?? 0) >
    0
  );
}

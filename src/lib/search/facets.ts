/**
 * 필터·통계 계산 — 순수 함수. 서버(AI 응답용)와 브라우저(화면용)가 같은 코드를 쓴다.
 *
 * 아키텍처 원칙 4·5: 숫자는 프로그램이 센다. AI는 여기서 나온 값을 해석만 한다.
 * 서버 왕복 없이 메모리에서 즉시 계산되므로 필터 클릭 반응이 즉각적이다(PRD 8장).
 */

import type {
  FacetCounts,
  InventionRow,
  LookupItem,
  SearchFilters,
} from "@/types/search";

/** 학년 id → 이름. 필터를 사람 말("초등부")로 다루기 위해 필요하다. */
export type GradeNames = Record<number, string>;

export function gradeNameMap(grades: LookupItem[]): GradeNames {
  const map: GradeNames = {};
  for (const grade of grades) map[grade.id] = grade.name;
  return map;
}

/** "정리,결합" → ["정리","결합"] (빈 값과 '-' 는 버린다) */
export function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag !== "-");
}

export function gradeNameOf(row: InventionRow, grades: GradeNames): string | null {
  return row.grade_id != null ? (grades[row.grade_id] ?? null) : null;
}

function matchesAny(rowTags: string[], selected: string[]): boolean {
  return selected.some((wanted) => rowTags.includes(wanted));
}

/** 선택된 필터를 모두 만족하는 행만 남긴다 (필터끼리는 AND, 같은 필터 안에서는 OR) */
export function filterRows(
  rows: InventionRow[],
  filters: SearchFilters,
  grades: GradeNames,
): InventionRow[] {
  const { grades: wantGrades, problemTags, scamper } = filters;
  if (!wantGrades.length && !problemTags.length && !scamper.length) return rows;

  return rows.filter((row) => {
    if (wantGrades.length) {
      const name = gradeNameOf(row, grades);
      if (!name || !wantGrades.includes(name)) return false;
    }
    if (problemTags.length && !matchesAny(splitTags(row.problem_tag), problemTags)) {
      return false;
    }
    if (scamper.length && !matchesAny(splitTags(row.scamper), scamper)) {
      return false;
    }
    return true;
  });
}

/** 학년·문제유형·SCAMPER 분포를 센다 */
export function countFacets(rows: InventionRow[], grades: GradeNames): FacetCounts {
  const counts: FacetCounts = { grades: {}, problemTags: {}, scamper: {} };

  for (const row of rows) {
    const grade = gradeNameOf(row, grades);
    if (grade) counts.grades[grade] = (counts.grades[grade] ?? 0) + 1;

    for (const tag of splitTags(row.problem_tag)) {
      counts.problemTags[tag] = (counts.problemTags[tag] ?? 0) + 1;
    }
    for (const tag of splitTags(row.scamper)) {
      counts.scamper[tag] = (counts.scamper[tag] ?? 0) + 1;
    }
  }

  return counts;
}

/** 이번 결과셋에 실제로 등장하는 값 목록 (많은 순) — AI는 이 목록의 값으로만 필터를 건다 */
export function availableValues(rows: InventionRow[], grades: GradeNames) {
  const counts = countFacets(rows, grades);
  const byCount = (record: Record<string, number>) =>
    Object.entries(record)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);

  return {
    grades: byCount(counts.grades),
    problemTags: byCount(counts.problemTags),
    scamper: byCount(counts.scamper),
  };
}

/** 사람이 고른 값만 남긴다 (AI가 없는 값을 지어내면 조용히 버린다) */
export function sanitizeFilterValues(
  requested: string[] | undefined,
  allowed: string[],
): { kept: string[]; dropped: string[] } {
  if (!requested) return { kept: [], dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const value of requested) {
    const name = String(value).trim();
    if (!name) continue;
    if (allowed.includes(name)) kept.push(name);
    else dropped.push(name);
  }
  return { kept: [...new Set(kept)], dropped };
}

/** AI에게 돌려줄 통계 요약 문장 (숫자는 전부 여기서 센 값) */
export function describeStats(
  keyword: string,
  totalCount: number,
  loadedCount: number,
  filtered: InventionRow[],
  filters: SearchFilters,
  grades: GradeNames,
): string {
  const counts = countFacets(filtered, grades);
  const top = (record: Record<string, number>, limit = 5) =>
    Object.entries(record)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([name, count]) => `${name} ${count}건`)
      .join(", ") || "없음";

  const active = [
    filters.grades.length ? `학년=${filters.grades.join("/")}` : null,
    filters.problemTags.length ? `문제유형=${filters.problemTags.join("/")}` : null,
    filters.scamper.length ? `SCAMPER=${filters.scamper.join("/")}` : null,
  ].filter(Boolean);

  const lines = [
    `검색어: ${keyword}`,
    totalCount > loadedCount
      ? `전체 ${totalCount}건 중 ${loadedCount}건을 불러왔습니다. 아래 통계는 이 ${loadedCount}건 기준입니다.`
      : `전체 ${totalCount}건을 모두 불러왔습니다.`,
    active.length ? `적용된 필터: ${active.join(", ")}` : "적용된 필터: 없음",
    `현재 보이는 건수: ${filtered.length}건`,
    `학년 분포: ${top(counts.grades)}`,
    `문제유형 분포: ${top(counts.problemTags)}`,
    `SCAMPER 분포: ${top(counts.scamper)}`,
  ];

  return lines.join("\n");
}

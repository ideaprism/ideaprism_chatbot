/**
 * 검색·필터·통계 회귀 테스트.
 *
 * 아키텍처 원칙 4·5("숫자는 프로그램이 세고 AI는 해석만 한다")를 지키는 코드라서,
 * 여기가 틀리면 AI가 학생에게 틀린 숫자를 말하게 된다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  availableValues,
  countFacets,
  describeStats,
  filterRows,
  gradeNameMap,
  sanitizeFilterValues,
  splitTags,
} from "../src/lib/search/facets";
import { buildPostgrestFilter, parseSearchQuery } from "../src/lib/search/query";
import type { InventionRow, LookupItem } from "../src/types/search";

const GRADES: LookupItem[] = [
  { id: 1, name: "초등부" },
  { id: 2, name: "중등부" },
  { id: 3, name: "고등부" },
];
const names = gradeNameMap(GRADES);

function row(over: Partial<InventionRow> & { id: string }): InventionRow {
  return {
    grade_id: null,
    category_id: null,
    original_title: null,
    simple_title: null,
    simple_summary: null,
    detailed_summary: null,
    drawing_url: null,
    problem: null,
    solution: null,
    problem_tag: null,
    scamper: null,
    sdg: null,
    ...over,
  };
}

const ROWS: InventionRow[] = [
  row({ id: "a", grade_id: 1, problem_tag: "불편함, 안전", scamper: "결합" }),
  row({ id: "b", grade_id: 1, problem_tag: "안전", scamper: "결합, 변형" }),
  row({ id: "c", grade_id: 2, problem_tag: "환경", scamper: "변형" }),
  row({ id: "d", grade_id: 3, problem_tag: "-", scamper: null }),
];

// ── 태그 파싱 ────────────────────────────────────────────────

test("쉼표로 붙은 태그를 나누고 빈 값과 '-' 는 버린다", () => {
  assert.deepEqual(splitTags("불편함, 안전"), ["불편함", "안전"]);
  assert.deepEqual(splitTags("-"), []);
  assert.deepEqual(splitTags(null), []);
  assert.deepEqual(splitTags("  "), []);
});

// ── 필터 ────────────────────────────────────────────────────

test("필터가 없으면 원본을 그대로 돌려준다", () => {
  const result = filterRows(ROWS, { grades: [], problemTags: [], scamper: [] }, names);
  assert.equal(result.length, 4);
});

test("학년 필터: 초등부만 남는다", () => {
  const result = filterRows(ROWS, { grades: ["초등부"], problemTags: [], scamper: [] }, names);
  assert.deepEqual(result.map((r) => r.id), ["a", "b"]);
});

test("같은 필터 안에서는 OR — 초등부 또는 고등부", () => {
  const result = filterRows(
    ROWS,
    { grades: ["초등부", "고등부"], problemTags: [], scamper: [] },
    names,
  );
  assert.deepEqual(result.map((r) => r.id), ["a", "b", "d"]);
});

test("서로 다른 필터끼리는 AND — 초등부이면서 '변형'", () => {
  const result = filterRows(
    ROWS,
    { grades: ["초등부"], problemTags: [], scamper: ["변형"] },
    names,
  );
  assert.deepEqual(result.map((r) => r.id), ["b"]);
});

test("조건에 맞는 게 없으면 빈 배열", () => {
  const result = filterRows(
    ROWS,
    { grades: ["고등부"], problemTags: ["환경"], scamper: [] },
    names,
  );
  assert.deepEqual(result, []);
});

// ── 통계 ────────────────────────────────────────────────────

test("분포를 정확히 센다 (태그 여러 개면 각각 센다)", () => {
  const counts = countFacets(ROWS, names);

  assert.deepEqual(counts.grades, { 초등부: 2, 중등부: 1, 고등부: 1 });
  assert.deepEqual(counts.problemTags, { 불편함: 1, 안전: 2, 환경: 1 });
  assert.deepEqual(counts.scamper, { 결합: 2, 변형: 2 });
  assert.ok(!("-" in counts.problemTags), "'-' 는 태그로 세지 않는다");
});

test("고를 수 있는 값은 많은 순으로 준다", () => {
  const choices = availableValues(ROWS, names);
  assert.equal(choices.grades[0], "초등부");
  assert.equal(choices.problemTags[0], "안전");
});

// ── AI가 지어낸 값 방어 ──────────────────────────────────────

test("목록에 없는 필터 값은 버리고 무엇을 버렸는지 알려 준다", () => {
  const { kept, dropped } = sanitizeFilterValues(
    ["초등부", "유치부", "초등부"],
    ["초등부", "중등부"],
  );
  assert.deepEqual(kept, ["초등부"], "중복도 정리한다");
  assert.deepEqual(dropped, ["유치부"]);
});

test("값을 아예 안 주면 빈 결과 (필터 해제로 취급)", () => {
  assert.deepEqual(sanitizeFilterValues(undefined, ["초등부"]), { kept: [], dropped: [] });
});

// ── 정직한 건수 표기 ────────────────────────────────────────

test("전체 건수가 적재 건수보다 많으면 '기준'을 명시한다", () => {
  const text = describeStats(
    "우산",
    1200,
    500,
    ROWS,
    { grades: [], problemTags: [], scamper: [] },
    names,
  );
  assert.ok(text.includes("전체 1200건 중 500건"), text);
  assert.ok(text.includes("현재 보이는 건수: 4건"), text);
});

test("전부 불러왔으면 '기준' 없이 말한다", () => {
  const text = describeStats(
    "우산",
    4,
    4,
    ROWS,
    { grades: [], problemTags: [], scamper: [] },
    names,
  );
  assert.ok(text.includes("전체 4건을 모두 불러왔습니다"), text);
});

// ── 검색어 문법 ─────────────────────────────────────────────

test("띄어쓰기는 AND로 본다", () => {
  const node = parseSearchQuery("우산 빗물");
  assert.equal(node?.type, "AND");
});

test("+ 는 OR, * 는 AND", () => {
  assert.equal(parseSearchQuery("우산+양산")?.type, "OR");
  assert.equal(parseSearchQuery("우산*빗물")?.type, "AND");
});

test("큰따옴표로 묶으면 한 낱말로 본다", () => {
  const node = parseSearchQuery('"접이식 우산"');
  assert.deepEqual(node, { type: "TERM", value: "접이식 우산" });
});

test("괄호로 우선순위를 준다", () => {
  const node = parseSearchQuery("(우산+양산)*빗물");
  assert.equal(node?.type, "AND");
  assert.equal(node?.type === "AND" ? node.left.type : null, "OR");
});

test("PostgREST 필터 문자열로 바꾼다", () => {
  const node = parseSearchQuery("우산");
  const filter = buildPostgrestFilter(node!, ["simple_title", "simple_summary"]);
  assert.equal(filter, "simple_title.ilike.%우산%,simple_summary.ilike.%우산%");
});

test("쉼표·괄호가 섞인 검색어가 필터 문법을 깨뜨리지 않는다", () => {
  const node = parseSearchQuery('"우산, 양산"');
  const filter = buildPostgrestFilter(node!, ["simple_title"]);
  assert.ok(!filter.includes("우산,"), "검색어 안의 쉼표는 제거돼야 한다");
  assert.equal(filter, "simple_title.ilike.%우산  양산%");
});

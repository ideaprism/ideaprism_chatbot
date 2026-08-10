/**
 * KIPRIS 검색식 생성 테스트.
 *
 * 검색식 문법(+, *, 괄호)은 프로그램이 만든다. AI는 낱말만 고른다.
 * 여기가 틀리면 특허 조회가 통째로 어긋나거나, 검색식이 깨져 0건이 나온다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildKiprisQuery,
  DEFAULT_GROUPS,
  describeFormula,
  filledGroups,
  pickGroups,
} from "../src/lib/kipris/formula";

test("갈래 안은 +(또는), 갈래끼리는 *(그리고)", () => {
  const { query } = buildKiprisQuery({
    object: ["우산", "양산"],
    problem: ["빗물", "물방울"],
  });
  assert.equal(query, "(우산+양산)*(빗물+물방울)");
});

test("낱말이 하나면 괄호를 붙이지 않는다", () => {
  const { query } = buildKiprisQuery({ object: ["우산"], problem: ["빗물"] });
  assert.equal(query, "우산*빗물");
});

test("IPC 코드는 맨 앞에 붙는다", () => {
  const { query } = buildKiprisQuery({ object: ["우산"], ipc: "A45B" });
  assert.equal(query, "IPC=[A45B]*우산");
});

test("빈 갈래는 건너뛴다", () => {
  const { query } = buildKiprisQuery({
    object: ["우산"],
    problem: [],
    solution: ["받이"],
  });
  assert.equal(query, "우산*받이");
});

test("중복 낱말은 한 번만 넣는다", () => {
  const { query } = buildKiprisQuery({ object: ["우산", "우산", "양산"] });
  assert.equal(query, "(우산+양산)");
});

test("낱말에 섞인 검색식 기호는 걷어낸다 (식이 깨지지 않도록)", () => {
  const { query } = buildKiprisQuery({ object: ["우산*양산", "빗(물)"] });
  assert.ok(!query.includes("(빗"), query);
  assert.equal(query, "(우산 양산+빗 물)");
});

test("대상이 없으면 검색식을 만들지 않고 이유를 알려 준다", () => {
  const result = buildKiprisQuery({ object: [] });
  assert.equal(result.query, "");
  assert.ok(result.advice?.includes("발명 대상"), result.advice ?? "");
});

test("갈래가 하나뿐이면 넓다고 알려 준다", () => {
  const result = buildKiprisQuery({ object: ["우산"] });
  assert.ok(result.advice?.includes("아주 많이"), result.advice ?? "");
});

test("갈래가 4개 이상이면 0건일 수 있다고 알려 준다", () => {
  const result = buildKiprisQuery({
    object: ["우산"],
    problem: ["빗물"],
    solution: ["받이"],
    effect: ["건조"],
  });
  assert.ok(result.advice?.includes("0건"), result.advice ?? "");
});

// ── 처음 넣는 갈래 (1.0과 같은 기준) ──────────────────────────
//
// 갈래끼리는 *(그리고)로 이어지므로 다섯을 다 넣으면 0건이 되는 일이 잦다.
// 그래서 처음에는 대상·해결수단만 넣고, 나머지 낱말은 화면에 남겨 둔다.

test("처음 넣는 갈래는 대상과 해결 수단 둘뿐이다", () => {
  assert.deepEqual([...DEFAULT_GROUPS], ["object", "solution"]);
});

test("다섯 갈래를 다 골라도 검색식은 대상*해결수단 으로만 만든다", () => {
  const parts = {
    object: ["우산"],
    problem: ["빗물"],
    solution: ["받이"],
    method: ["접이식"],
    effect: ["건조"],
  };
  const { query } = buildKiprisQuery(pickGroups(parts, DEFAULT_GROUPS));
  assert.equal(query, "우산*받이");
});

test("IPC는 갈래가 아니라 늘 따라붙는다", () => {
  const { query } = buildKiprisQuery(
    pickGroups({ object: ["우산"], problem: ["빗물"], ipc: "A45B" }, DEFAULT_GROUPS),
  );
  assert.equal(query, "IPC=[A45B]*우산");
});

test("꺼 둔 갈래의 낱말은 버리지 않는다 (화면에서 켤 수 있어야 한다)", () => {
  const parts = { object: ["우산"], problem: ["빗물"], solution: ["받이"] };
  const widened = buildKiprisQuery(pickGroups(parts, ["object", "problem", "solution"]));
  assert.equal(widened.query, "우산*빗물*받이");
});

test("낱말이 빈 갈래는 켜진 것으로 세지 않는다", () => {
  const parts = { object: ["우산"], solution: [] };
  assert.deepEqual(filledGroups(parts, DEFAULT_GROUPS), ["object"]);
});

test("설명에 검색식과 구성이 함께 들어간다", () => {
  const text = describeFormula(
    buildKiprisQuery({ object: ["우산", "양산"], problem: ["빗물"] }),
  );
  assert.ok(text.includes("검색식: (우산+양산)*빗물"), text);
  assert.ok(text.includes("발명 대상"), text);
  assert.ok(text.includes("+ 는 '또는'"), text);
});

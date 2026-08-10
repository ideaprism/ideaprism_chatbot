/**
 * OPSME 키워드 해석 테스트.
 *
 * 1.0이 선배 발명마다 미리 정리해 둔 특허 검색 키워드를 5칸으로 되돌리는 부분이다.
 * 여기가 어긋나면 "이 발명으로 특허 검색"이 1.0과 다른 검색식을 만든다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildKiprisQuery } from "../src/lib/kipris/formula";
import { hasKeywords, parseOpsmeKeywords } from "../src/lib/kipris/opsme";

const SAMPLE =
  `[Simple]O:우산꽂이 @ P:공간부족 @ S:경첩 @ M:접이식 @ E:공간절약 ` +
  `|| ` +
  `[Expert]O:우산꽂이+"우산 거치대"+거치대 @ P:공간부족+"공간 점유" @ S:경첩+힌지 ` +
  `@ M:접이식+폴딩 @ E:공간절약+다용도 @ 완성도: '5점'`;

test("쉬운 쪽과 자세한 쪽을 따로 읽는다", () => {
  const parsed = parseOpsmeKeywords(SAMPLE);
  assert.deepEqual(parsed.simple.object, ["우산꽂이"]);
  assert.deepEqual(parsed.expert.object, ["우산꽂이", "우산 거치대", "거치대"]);
});

test("따옴표로 묶인 낱말은 띄어쓰기가 있어도 한 낱말이다", () => {
  const parsed = parseOpsmeKeywords(SAMPLE);
  assert.deepEqual(parsed.expert.problem, ["공간부족", "공간 점유"]);
});

test("O·P·S·M·E 다섯 갈래가 제자리에 들어간다", () => {
  const { simple } = parseOpsmeKeywords(SAMPLE);
  assert.deepEqual(simple.problem, ["공간부족"]);
  assert.deepEqual(simple.solution, ["경첩"]);
  assert.deepEqual(simple.method, ["접이식"]);
  assert.deepEqual(simple.effect, ["공간절약"]);
});

test("완성도 표기는 낱말이 아니라 따로 뽑는다", () => {
  const parsed = parseOpsmeKeywords(SAMPLE);
  assert.equal(parsed.completeness, "5점");
  assert.ok(!JSON.stringify(parsed.expert).includes("완성도"), JSON.stringify(parsed.expert));
});

test("빈 값·엉뚱한 형식이면 빈 5칸을 돌려준다 (오류로 멈추지 않는다)", () => {
  for (const raw of [null, undefined, "", "아무 말이나"]) {
    const parsed = parseOpsmeKeywords(raw);
    assert.equal(hasKeywords(parsed.simple), false);
    assert.equal(hasKeywords(parsed.expert), false);
  }
});

test("읽어 온 낱말이 그대로 검색식이 된다", () => {
  const { simple } = parseOpsmeKeywords(SAMPLE);
  assert.equal(buildKiprisQuery(simple).query, "우산꽂이*공간부족*경첩*접이식*공간절약");
});

test("한쪽만 적혀 있어도 그쪽만 읽는다", () => {
  const parsed = parseOpsmeKeywords("[Simple]O:우산 @ S:손잡이");
  assert.deepEqual(parsed.simple.object, ["우산"]);
  assert.equal(hasKeywords(parsed.expert), false);
});

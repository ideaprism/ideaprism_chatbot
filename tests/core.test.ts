/**
 * 핵심 로직 회귀 테스트.
 *
 * "숫자와 단계는 코드가 판단한다"는 원칙이 깨지지 않도록,
 * AI가 관여하지 않는 두 지점만 못박아 둔다.
 *   1) 단계 승급 검증 (quest.ts)  — AI가 우겨도 조건 미달이면 안 올라간다
 *   2) 감정 태그 파서 (prompt.ts) — 태그가 화면에 새어 나오지 않는다
 *
 * 실행: npm test   (Node 24의 타입 스트리핑을 그대로 사용, 추가 의존성 없음)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { advanceStage, initialQuestState, STAGES } from "../src/lib/quest";
import { createEmotionParser } from "../src/lib/prompt";
import { normalizeEmotion } from "../src/lib/characters";
import { sanitizePersona } from "../src/lib/personas";

// ── 1. 단계 승급 검증 ────────────────────────────────────────

test("0단계: 별명·관심사가 없으면 승급하지 않는다", () => {
  const state = initialQuestState(0);
  const result = advanceStage(state, 0, { nickname: "", interests: [] }, 0);

  assert.equal(result.ok, false);
  assert.equal(result.state.currentStage, 0);
  assert.ok(result.message.includes("nickname"));
  assert.equal(result.state.retries[0], 1, "반려되면 재시도 횟수가 쌓인다");
});

test("0단계: 조건을 채우면 1단계로 오르고 캐릭터가 바뀐다", () => {
  const state = initialQuestState(0);
  const result = advanceStage(
    state,
    0,
    { nickname: "민준", interests: ["우산"], matchedCharacter: "jiyou" },
    0,
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.currentStage, 1);
  assert.equal(result.characterChanged, true);
  assert.equal(result.nextCharacter, "jiyou");
});

test("현재 단계가 아닌 단계는 완료 처리할 수 없다 (건너뛰기 차단)", () => {
  const state = initialQuestState(0);
  const result = advanceStage(state, 3, { techniquesTried: ["S", "C"], candidates: ["a", "b"] }, 0);

  assert.equal(result.ok, false);
  assert.equal(result.state.currentStage, 0);
});

test("3단계: SCAMPER 기법 1개만으로는 승급하지 않는다", () => {
  const state = { ...initialQuestState(0), currentStage: 3 as const };
  const fail = advanceStage(state, 3, { techniquesTried: ["C"], candidates: ["빗물받이", "접이식"] }, 0);
  assert.equal(fail.ok, false);

  const pass = advanceStage(
    state,
    3,
    { techniquesTried: ["C", "M"], candidates: ["빗물받이 우산", "접이식 커버"] },
    0,
  );
  assert.equal(pass.ok, true);
  assert.equal(pass.nextStage, 4);
});

test("5단계 완주 후에는 더 올라가지 않는다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    { kiprisQuery: "우산*빗물", similarPatents: [], differentiation: "기존과 달리 물받이가 접힌다" },
    0,
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.currentStage, 5);
  assert.equal(result.characterChanged, false);
  assert.ok(result.state.completed[5]);
});

test("모든 단계에 담당 캐릭터와 완료 조건이 정의돼 있다", () => {
  for (const stage of Object.values(STAGES)) {
    assert.ok(stage.character, `${stage.id}단계 담당 캐릭터 누락`);
    assert.ok(stage.mission.length > 20, `${stage.id}단계 대본 누락`);
    assert.ok(stage.doneWhen.length > 5, `${stage.id}단계 완료 조건 누락`);
  }
});

// ── 2. 감정 태그 파서 ────────────────────────────────────────

function feed(chunks: string[]) {
  const parser = createEmotionParser();
  const emotions: string[] = [];
  let text = "";

  for (const chunk of chunks) {
    const out = parser.push(chunk);
    emotions.push(...out.emotions);
    text += out.text;
  }
  const tail = parser.flush();
  emotions.push(...tail.emotions);
  text += tail.text;

  return { emotions, text };
}

test("맨 앞 감정 태그를 걷어낸다", () => {
  const { emotions, text } = feed(["[감정:welcome] 안녕! 반가워."]);
  assert.deepEqual(emotions, ["welcome"]);
  assert.equal(text, " 안녕! 반가워.");
});

test("태그가 스트림 조각 사이에서 잘려도 복원한다", () => {
  const { emotions, text } = feed(["[감", "정:cheer", "] 잘했", "어!"]);
  assert.deepEqual(emotions, ["cheer"]);
  assert.equal(text, " 잘했어!");
});

test("도구 호출 뒤에 태그가 다시 나와도 새어 나가지 않는다", () => {
  const { emotions, text } = feed(["[감정:listening] 찾아볼게. ", "[감정:proud] 342건 나왔어!"]);
  assert.deepEqual(emotions, ["listening", "proud"]);
  assert.ok(!text.includes("[감정"), "태그가 화면 텍스트에 남으면 안 된다");
  assert.equal(text, " 찾아볼게.  342건 나왔어!");
});

test("태그가 없으면 텍스트를 그대로 흘려보낸다", () => {
  const { emotions, text } = feed(["오늘은 ", "무슨 얘기 할까?"]);
  assert.deepEqual(emotions, []);
  assert.equal(text, "오늘은 무슨 얘기 할까?");
});

test("대괄호가 섞인 평범한 문장을 삼키지 않는다", () => {
  const { text } = feed(["예를 들면 [이런 것] 말이야."]);
  assert.equal(text, "예를 들면 [이런 것] 말이야.");
});

test("알 수 없는 감정 이름은 기본값으로 교정된다", () => {
  assert.equal(normalizeEmotion("jiyou", "없는감정"), "confident");
  assert.equal(normalizeEmotion("jiyou", "playful"), "playful");
  assert.equal(normalizeEmotion("teacher", null), "welcome");
});

// ── 3. 페르소나 정제 ─────────────────────────────────────────

test("페르소나에서 이미지 지시문과 감정 이미지 목록을 걷어낸다", () => {
  const raw = [
    "# 역할",
    "너는 발명반 선배야.",
    "",
    "## 행동 원칙",
    "1. 학생의 아이디어를 부정하지 않는다.",
    "2. 매 응답에 자신의 감정 상태에 맞는 감정 이미지를 1개 포함한다.",
    '   - 형식: <img src="https://raw.githubusercontent.com/x/y/[감정].png" width="80">',
    "",
    "## 감정 이미지 (10종)",
    "경로: https://raw.githubusercontent.com/x/y/",
    "1. a-1_confident.png - 자신감",
    "2. a-2_serious.png - 진지",
    "",
    "## 말투",
    "편한 반말을 쓴다.",
  ].join("\n");

  const clean = sanitizePersona(raw);

  assert.ok(!clean.includes("<img"), "img 태그가 남으면 안 된다");
  assert.ok(!clean.includes("raw.githubusercontent.com"), "이미지 주소가 남으면 안 된다");
  assert.ok(!clean.includes("a-1_confident.png"), "감정 이미지 목록이 남으면 안 된다");
  assert.ok(clean.includes("학생의 아이디어를 부정하지 않는다"), "캐릭터 규칙은 살아야 한다");
  assert.ok(clean.includes("편한 반말을 쓴다"), "이후 섹션이 잘리면 안 된다");
});

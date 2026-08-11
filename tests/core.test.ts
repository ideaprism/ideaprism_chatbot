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
import {
  buildSystemPrompt,
  COMPACTED_MARKER,
  compactHistory,
  createEmotionParser,
  fillPlaceholders,
  normalizeHistory,
  SESSION_OPENING_CUE,
} from "../src/lib/prompt";
import { mergeStageUsage, totalUsage } from "../src/lib/usage";
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

/** 프로그램이 실제로 조회를 마친 상태 */
const SEARCHED = { kiprisQuery: "우산*빗물", kiprisTotal: 12 };

test("5단계 완주 후에는 더 올라가지 않는다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    {
      kiprisQuery: "우산*빗물",
      similarPatents: ["우산 빗물 제거장치"],
      differentiation: "기존과 달리 물받이가 접힌다",
    },
    0,
    SEARCHED,
  );

  assert.equal(result.ok, true);
  assert.equal(result.state.currentStage, 5);
  assert.equal(result.characterChanged, false);
  assert.ok(result.state.completed[5]);
});

// ── 5단계: 지어낸 선행기술조사 차단 ──────────────────────────
//
// 산출물만 보고 판정하면, AI가 특허를 한 번도 조회하지 않고도 그럴듯한 검색식과
// 특허 이름을 적어 내 단계를 끝낼 수 있다. 실제로 그렇게 넘어가는 것을 확인했다.

test("특허를 한 번도 조회하지 않았으면 완료할 수 없다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    {
      kiprisQuery: "우산*빗물",
      similarPatents: ["그럴듯한 특허 이름"],
      differentiation: "기존과 달리 물받이가 접힌다",
    },
    0,
    // evidence 없음 = 프로그램이 조회한 적 없음
  );

  assert.equal(result.ok, false);
  assert.equal(result.state.currentStage, 5);
  assert.ok(result.message.includes("조회"), result.message);
});

test("실제로 조회한 검색식과 다른 검색식을 적어 내면 막는다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    {
      kiprisQuery: "IPC=[A45B]*우산*커버",
      similarPatents: ["우산 빗물 제거장치"],
      differentiation: "기존과 달리 물받이가 접힌다",
    },
    0,
    SEARCHED,
  );

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("우산*빗물"), result.message);
});

test("0건이 나왔는데 비슷한 특허를 적으면 막는다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    {
      kiprisQuery: "우산*빗물",
      similarPatents: ["어디선가 본 특허"],
      differentiation: "기존과 달리 물받이가 접힌다",
    },
    0,
    { kiprisQuery: "우산*빗물", kiprisTotal: 0 },
  );

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("0건"), result.message);
});

test("0건이면 비슷한 특허를 비워 두고 완료할 수 있다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    {
      kiprisQuery: "우산*빗물",
      similarPatents: [],
      differentiation: "기존과 달리 물받이가 접힌다",
    },
    0,
    { kiprisQuery: "우산*빗물", kiprisTotal: 0 },
  );

  assert.equal(result.ok, true, result.message);
});

test("특허가 나왔는데 한 건도 안 적으면 막는다", () => {
  const state = { ...initialQuestState(0), currentStage: 5 as const };
  const result = advanceStage(
    state,
    5,
    { kiprisQuery: "우산*빗물", similarPatents: [], differentiation: "기존과 달리 접힌다" },
    0,
    SEARCHED,
  );

  assert.equal(result.ok, false);
  assert.ok(result.message.includes("similarPatents"), result.message);
});

test("0단계부터 5단계까지 완주하면 캐릭터가 두 번 바뀐다", () => {
  const artifacts: Record<number, unknown> = {
    0: { nickname: "민준", interests: ["우산"], matchedCharacter: "jiyou" },
    1: { problemArea: "우산", observations: ["실내에 들어가면 바닥이 젖는다"] },
    2: {
      problemStatement: "비 오는 날 실내에서 우산의 빗물이 바닥을 적신다",
      target: "실내에 들어오는 사람",
      pain: "바닥이 젖어 미끄럽다",
    },
    3: { techniquesTried: ["C", "M"], candidates: ["빗물받이 우산", "접이식 커버"] },
    4: {
      title: "빗물 받는 우산",
      summary: "우산대 아래 물받이가 빗물을 모은다",
      howItWorks: "우산을 접는 힘으로 물받이가 펼쳐져 빗물을 담는다",
      differentiator: "기존 커버와 달리 따로 씌울 필요가 없다",
    },
    5: {
      kiprisQuery: "우산*빗물*받이",
      similarPatents: ["10-2020-0001234"],
      differentiation: "물받이가 우산을 접는 동작만으로 자동 전개된다",
    },
  };

  let state = initialQuestState(0);
  const handoffs: Array<{ at: number; to: string }> = [];

  for (const stage of [0, 1, 2, 3, 4, 5] as const) {
    // 5단계는 프로그램이 실제로 조회를 마쳤을 때만 통과한다
    const result = advanceStage(state, stage, artifacts[stage], 0, {
      kiprisQuery: "우산*빗물*받이",
      kiprisTotal: 7,
    });
    assert.equal(result.ok, true, `${stage}단계 승급 실패: ${result.message}`);
    if (result.characterChanged) handoffs.push({ at: stage, to: result.nextCharacter });
    state = result.state;
  }

  // 0→1 에서 지도교사 → 지유, 4→5 에서 지유 → 특허탐정
  assert.deepEqual(handoffs, [
    { at: 0, to: "jiyou" },
    { at: 4, to: "detective" },
  ]);
  assert.equal(state.currentStage, 5);
  assert.equal(Object.keys(state.completed).length, 6, "6단계 산출물이 모두 쌓인다");
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
  let offTopic = 0;
  let text = "";

  for (const chunk of chunks) {
    const out = parser.push(chunk);
    emotions.push(...out.emotions);
    offTopic += out.offTopic;
    text += out.text;
  }
  const tail = parser.flush();
  emotions.push(...tail.emotions);
  offTopic += tail.offTopic;
  text += tail.text;

  return { emotions, offTopic, text };
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

test("주제 이탈 표식은 화면에 새지 않고 횟수로만 센다", () => {
  const { emotions, offTopic, text } = feed([
    "[감정:playful] 게임 얘기 재밌지! ",
    "[이탈]",
    "근데 우산 얘기 마저 해볼까?",
  ]);

  assert.deepEqual(emotions, ["playful"]);
  assert.equal(offTopic, 1);
  assert.ok(!text.includes("[이탈]"), "표식이 학생 화면에 보이면 안 된다");
  assert.equal(text, " 게임 얘기 재밌지! 근데 우산 얘기 마저 해볼까?");
});

test("발명 이야기면 이탈로 세지 않는다", () => {
  const { offTopic } = feed(["[감정:coaching] 좋은 생각이야. 더 말해줄래?"]);
  assert.equal(offTopic, 0);
});

// ── 3. 대화 압축 ─────────────────────────────────────────────

test("대화가 짧으면 그대로 둔다", () => {
  const history = [
    { role: "user" as const, content: "안녕" },
    { role: "assistant" as const, content: "반가워" },
  ];
  assert.deepEqual(compactHistory(history, 10), history);
});

test("대화가 길어지면 오래된 턴을 잘라내고 표시를 남긴다", () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `${index}번째 말`,
  }));

  const compacted = compactHistory(history, 10);

  const textOf = (message: (typeof compacted)[number]) =>
    message.role === "tool" ? "" : message.content;

  assert.equal(compacted.length, 11, "표시 1줄 + 최근 10턴");
  assert.equal(textOf(compacted[0]), COMPACTED_MARKER);
  assert.equal(textOf(compacted[1]), "20번째 말", "최근 10턴만 남는다");
  assert.equal(textOf(compacted.at(-1)!), "29번째 말");
});

// ── 4. 단계별 사용량 ─────────────────────────────────────────

test("같은 단계에서 여러 번 부르면 사용량이 쌓인다", () => {
  let usage = mergeStageUsage({}, 1, { input: 100, output: 20, cacheRead: 0 });
  usage = mergeStageUsage(usage, 1, { input: 30, output: 10, cacheRead: 90 });

  assert.deepEqual(usage["1"], { input: 130, output: 30, cacheRead: 90, calls: 2 });
});

test("단계마다 따로 쌓이고 합계도 낼 수 있다", () => {
  let usage = mergeStageUsage({}, 0, { input: 10, output: 5, cacheRead: 0 });
  usage = mergeStageUsage(usage, 3, { input: 40, output: 15, cacheRead: 20 });

  assert.equal(Object.keys(usage).length, 2);
  assert.deepEqual(totalUsage(usage), {
    input: 50,
    output: 20,
    cacheRead: 20,
    calls: 2,
  });
});

// ── 5. 흐름 지침 자리표시자 ──────────────────────────────────

test("자리표시자를 실제 값으로 바꾼다", () => {
  const filled = fillPlaceholders(
    "너는 {{캐릭터이름}}이다. 고를 수 있는 감정: {{감정목록}}",
    { 캐릭터이름: "지유 선배", 감정목록: "confident, playful" },
  );
  assert.equal(filled, "너는 지유 선배이다. 고를 수 있는 감정: confident, playful");
});

test("공백이 섞인 자리표시자도 알아본다", () => {
  assert.equal(fillPlaceholders("{{ 이름 }}!", { 이름: "민준" }), "민준!");
});

test("모르는 자리표시자는 지우지 않고 그대로 둔다", () => {
  // 대표님이 오타를 내도 문장이 통째로 사라지지 않게 하기 위한 규칙
  const filled = fillPlaceholders("{{캐릭터이름}} / {{오타난이름}}", {
    캐릭터이름: "지유 선배",
  });
  assert.equal(filled, "지유 선배 / {{오타난이름}}");
});

test("flow 규칙이 있으면 그것을 쓰고, 없으면 기본 규칙으로 돌아간다", () => {
  const withFile = buildSystemPrompt("jiyou", "대본", "규칙: {{캐릭터이름}} 전용");
  assert.equal(withFile[0], "규칙: 지유 선배 전용");
  assert.ok(withFile[1].includes("대본"));

  const withoutFile = buildSystemPrompt("jiyou", "대본", null);
  assert.ok(withoutFile[0].includes("IdeaPrism 운영 규칙"), "기본 규칙으로 되돌아간다");
});

// ── 6. 대화 이력 정규화 ──────────────────────────────────────

test("이력이 assistant로 시작하면 시동 문구를 앞에 복원한다", () => {
  // 첫 인사는 학생 발화 없이 시작하므로 이런 이력이 실제로 만들어진다
  const history = normalizeHistory([
    { role: "assistant", content: "안녕! 반가워." },
    { role: "user", content: "안녕하세요" },
  ]);

  assert.equal(history.length, 3);
  assert.equal(history[0].role, "user", "Messages API는 첫 메시지가 user여야 한다");
  assert.equal(history[0].content, SESSION_OPENING_CUE);
});

test("이력이 user로 시작하면 그대로 둔다", () => {
  const original = [
    { role: "user" as const, content: "안녕하세요" },
    { role: "assistant" as const, content: "반가워!" },
  ];
  assert.deepEqual(normalizeHistory(original), original);
});

test("빈 이력은 그대로 둔다 (첫 요청)", () => {
  assert.deepEqual(normalizeHistory([]), []);
});

// ── 4. 페르소나 정제 ─────────────────────────────────────────

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

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

import {
  advanceStage,
  canRevisit,
  initialQuestState,
  revisitStage,
  STAGES,
} from "../src/lib/quest";
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
import {
  DEFAULT_CAST,
  EXPERT_IDS,
  isExpertId,
  normalizeCast,
  parseCast,
  serializeCast,
  withFriends,
} from "../src/lib/cast";
import {
  CHARACTER_IDS,
  CHARACTERS,
  charactersByGroup,
  emotionNames,
  normalizeEmotion,
  type CharacterId,
} from "../src/lib/characters";
import {
  splitSpeech,
  type EmotionMark,
  type SpeakerMark,
} from "../src/lib/emotion";
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
    { nickname: "민준", interests: ["우산"], matchedFriends: ["daon", "harin"] },
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

// ── 앞 단계로 되돌아가기 ─────────────────────────────────────
//
// 학생이 진행판을 눌러 지나온 단계로 돌아가 다시 이야기할 수 있다.
// 아직 안 가 본 단계로 건너뛰는 것은 여전히 막는다.

/** 0단계를 마치고 1단계에 있는 상태 */
function afterStageZero() {
  return advanceStage(
    initialQuestState(0),
    0,
    { nickname: "민준", interests: ["우산"], matchedFriends: ["daon", "harin"] },
    0,
  ).state;
}

test("지나온 단계로는 돌아갈 수 있다", () => {
  const state = afterStageZero();
  assert.equal(canRevisit(state, 0), true);

  const back = revisitStage(state, 0, 100);
  assert.equal(back.currentStage, 0);
  assert.equal(back.furthestStage, 1, "가 있던 자리는 그대로 기억한다");
  assert.ok(back.completed[0], "돌아가도 기록은 지우지 않는다");
});

test("아직 가 보지 않은 단계로는 건너뛸 수 없다", () => {
  const state = afterStageZero();
  assert.equal(canRevisit(state, 3), false);
  assert.equal(revisitStage(state, 3, 100).currentStage, 1, "그 자리에 그대로 있다");
});

test("지금 있는 단계는 되돌아갈 대상이 아니다", () => {
  assert.equal(canRevisit(afterStageZero(), 1), false);
});

test("되돌아가 다시 정리하면 최종본이 바뀌고 앞서 적은 것은 참고로 남는다", () => {
  const back = revisitStage(afterStageZero(), 0, 100);
  const again = advanceStage(
    back,
    0,
    { nickname: "초코", interests: ["우산", "환경"], matchedFriends: ["daon", "harin"] },
    200,
  );

  assert.equal(again.ok, true, again.message);
  assert.deepEqual(
    (again.state.completed[0] as { nickname: string }).nickname,
    "초코",
    "최종본이 본문이 된다",
  );
  assert.equal(again.state.history[0]?.length, 1, "앞서 적은 것이 참고로 남는다");
  assert.equal(
    (again.state.history[0]?.[0] as { nickname: string }).nickname,
    "민준",
  );
});

test("되돌아가 다시 완료해도 가 있던 자리는 내려가지 않는다", () => {
  // 0→1→2 까지 간 뒤 0단계로 돌아와 다시 완료
  let state = afterStageZero();
  state = advanceStage(
    state,
    1,
    { problemArea: "우산", observations: ["바닥이 젖는다"] },
    0,
  ).state;
  assert.equal(state.furthestStage, 2);

  const back = revisitStage(state, 0, 100);
  const again = advanceStage(
    back,
    0,
    { nickname: "초코", interests: ["우산"], matchedFriends: ["daon", "harin"] },
    200,
  );

  assert.equal(again.state.currentStage, 1, "다시 완료하면 그다음 단계로 간다");
  assert.equal(again.state.furthestStage, 2, "2단계까지 갔던 것은 그대로 기억한다");
  assert.equal(canRevisit(again.state, 2), true, "진행판에서 2단계로 되돌아올 수 있다");
});

test("0단계부터 5단계까지 완주하면 캐릭터가 두 번 바뀐다", () => {
  const artifacts: Record<number, unknown> = {
    0: { nickname: "민준", interests: ["우산"], matchedFriends: ["daon", "harin"] },
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

// ── 1-1. 캐릭터 열 명과 대화구조 ─────────────────────────────

test("캐릭터 열 명이 모두 등록돼 있고 세 갈래로 나뉜다", () => {
  assert.equal(CHARACTER_IDS.length, 10);

  const groups = charactersByGroup();
  assert.deepEqual(
    groups.map((g) => [g.group, g.members.length]),
    [
      ["teacher", 1],
      ["senior", 6],
      ["expert", 3],
    ],
  );

  // 목록에 빠진 사람이 없어야 한다 (CHARACTERS 에만 있고 CHARACTER_IDS 에 없으면 화면에서 사라진다)
  assert.equal(groups.reduce((n, g) => n + g.members.length, 0), CHARACTER_IDS.length);
  assert.deepEqual([...CHARACTER_IDS].sort(), Object.keys(CHARACTERS).sort());
});

test("열 명 모두 감정 열 개와 쓸 수 있는 기본 감정을 갖는다", () => {
  for (const id of CHARACTER_IDS) {
    const character = CHARACTERS[id];
    const names = emotionNames(id);

    assert.equal(names.length, 10, `${id}: 감정이 10개가 아니다 (${names.length}개)`);
    assert.ok(
      names.includes(character.defaultEmotion),
      `${id}: 기본 감정 "${character.defaultEmotion}" 이 목록에 없다`,
    );
    // 감정 이름은 [감정:이름] 표식에 들어가므로 파서가 읽을 수 있는 형태여야 한다
    for (const name of names) {
      assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/, `${id}: 감정 이름 "${name}" 은 못 읽는다`);
    }
    // 랜딩에 쓰는 소개가 비어 있으면 안 된다
    assert.ok(character.tagline.length > 5, `${id}: 한 줄 소개가 없다`);
    assert.ok(character.subtitle.length > 0, `${id}: 학년·직함이 없다`);
  }
});

test("대화구조: 모르는 이름이 섞이면 그 단계만 공장 초기값으로 되돌린다", () => {
  const messy = normalizeCast({
    0: "teacher", // 옛 형태(사람 하나가 문자열)도 읽는다
    1: "없는사람",
    2: ["daon", "없는사람"], // 섞여 있으면 아는 사람만 남긴다
    3: ["coach", "jiwon", "mia"], // 셋이 넘으면 둘까지만
    4: ["daon", "daon"], // 같은 사람을 두 번 넣으면 한 명
  });

  assert.deepEqual(messy[0], ["teacher"]);
  assert.deepEqual(messy[1], DEFAULT_CAST[1], "모르는 이름뿐이면 공장 초기값으로");
  assert.deepEqual(messy[2], ["daon"], "아는 사람만 남는다");
  assert.deepEqual(messy[3], ["coach", "jiwon"], "한 단계에 둘까지");
  assert.deepEqual(messy[4], ["daon"], "같은 사람을 두 번 앉히지 않는다");
  assert.deepEqual(messy[5], DEFAULT_CAST[5], "빠진 단계도 공장 초기값으로");
});

test("0단계에서 짝지어 준 친구 둘이 1~5단계를 함께 간다", () => {
  const seated = withFriends(DEFAULT_CAST, ["daon", "harin"]);

  assert.deepEqual(seated[0], ["teacher"], "0단계는 선생님 그대로");
  for (const stage of [1, 2, 3, 4, 5] as const) {
    assert.deepEqual(seated[stage], ["daon", "harin"], `${stage}단계에 둘이 앉는다`);
  }
  // 5단계의 특허 탐정은 자리를 차지하는 게 아니라 친구가 불러오는 손님이다
  assert.ok(!seated[5].includes("detective"), "탐정은 배치가 아니라 손님으로 온다");

  // 짝이 없거나 엉뚱하면 원래 배치를 건드리지 않는다
  assert.deepEqual(withFriends(DEFAULT_CAST, undefined), DEFAULT_CAST);
  assert.deepEqual(withFriends(DEFAULT_CAST, ["없는사람"]), DEFAULT_CAST);
});

test("손님으로 부를 수 있는 사람은 전문가 셋뿐이다", () => {
  assert.deepEqual(EXPERT_IDS, ["detective", "coach", "jiwon"]);

  assert.ok(isExpertId("detective"));
  assert.ok(isExpertId("coach"));
  assert.ok(isExpertId("jiwon"));
  // 선생님과 선배는 손님이 아니다 — 부르는 도구로 불러낼 수 없다
  assert.ok(!isExpertId("teacher"));
  assert.ok(!isExpertId("jiyou"));
  assert.ok(!isExpertId("없는사람"));
});

test("0단계: 친구를 한 명만 적거나 선배가 아니면 넘어가지 못한다", () => {
  const base = { nickname: "민준", interests: ["우산"] };
  const tries: unknown[] = [
    ["daon"], // 한 명
    ["daon", "daon"], // 같은 사람 둘
    ["teacher", "daon"], // 선생님은 친구가 아니다
    ["detective", "coach"], // 전문가도 친구가 아니다
    "daon", // 목록이 아님
  ];

  for (const matchedFriends of tries) {
    const result = advanceStage(initialQuestState(0), 0, { ...base, matchedFriends }, 0);
    assert.equal(result.ok, false, `통과하면 안 된다: ${JSON.stringify(matchedFriends)}`);
  }

  const ok = advanceStage(
    initialQuestState(0),
    0,
    { ...base, matchedFriends: ["harin", "mia"] },
    0,
  );
  assert.equal(ok.ok, true, "선배 두 명이면 통과한다");
});

test("대화구조: 깨진 글이 저장돼 있어도 대화가 멈추지 않는다", () => {
  assert.deepEqual(parseCast("{이건 JSON이 아니다"), DEFAULT_CAST);
  assert.deepEqual(parseCast(null), DEFAULT_CAST);
  assert.deepEqual(parseCast(serializeCast(DEFAULT_CAST)), DEFAULT_CAST);
});

test("대화구조를 바꾸면 배턴터치가 일어나는 자리도 바뀐다", () => {
  // 공장 초기값: 0단계 선생님 → 1단계 지유 이므로 담당이 바뀐다
  const asIs = advanceStage(initialQuestState(0), 0, {
    nickname: "민준",
    interests: ["자전거"],
    matchedFriends: ["daon", "harin"],
  });
  assert.equal(asIs.ok, true);
  assert.equal(asIs.characterChanged, true);
  assert.equal(asIs.nextCharacter, "jiyou");

  // 1단계도 선생님이 맡도록 바꾸면, 배턴터치 없이 그대로 이어진다
  const sameHand = normalizeCast({ ...DEFAULT_CAST, 1: "teacher" });
  const changed = advanceStage(
    initialQuestState(0),
    0,
    { nickname: "민준", interests: ["자전거"], matchedFriends: ["daon", "harin"] },
    Date.now(),
    undefined,
    sameHand,
  );
  assert.equal(changed.ok, true);
  assert.equal(changed.characterChanged, false, "같은 사람이 이어받으면 배턴터치가 없다");
  assert.equal(changed.nextCharacter, "teacher");
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

test("표식이 글 중간에 있으면 앞뒤 순서가 유지된다", () => {
  const parser = createEmotionParser();
  const first = parser.push("먼저 이 말. [감정:found] 그다음 이 말.");
  const rest = parser.flush();
  const parts = [...first.parts, ...rest.parts];

  assert.deepEqual(
    parts.map((part) =>
      part.kind === "emotion"
        ? `<${part.emotion}>`
        : part.kind === "speaker"
          ? `[${part.speaker}]`
          : part.text,
    ),
    ["먼저 이 말. ", "<found>", " 그다음 이 말."],
  );
});

test("[말:누구] 표식으로 화자가 바뀐다", () => {
  const parser = createEmotionParser();
  const out = parser.push("[말:daon] [감정:excited] 오 대박! [말:harin] [감정:caring] 천천히 해도 돼.");
  const tail = parser.flush();
  const parts = [...out.parts, ...tail.parts];

  assert.deepEqual(
    parts
      .filter((part) => part.kind !== "text")
      .map((part) => (part.kind === "speaker" ? `말:${part.speaker}` : `감정:${part.emotion}`)),
    ["말:daon", "감정:excited", "말:harin", "감정:caring"],
  );
  assert.ok(!parts.some((part) => part.kind === "text" && part.text.includes("[말")));
});

// ── 2-1. 한 답변 안에서 그림이 바뀐다 ────────────────────────
//
// 서버(route.ts)는 표식을 순서대로 흘려보내고, 브라우저(useChat.ts)는 감정이 온
// 시점의 글자 수를 그 감정이 시작되는 자리로 적어 둔다. 아래 relay 는 그 두 곳을
// 합쳐 흉내 낸 것이다 — 화면이 몇 토막으로 나뉘는지가 여기서 결정된다.

function relay(chunks: string[], crew: CharacterId[] = ["jiyou"]) {
  const parser = createEmotionParser();
  const emotions: EmotionMark[] = [];
  const speakers: SpeakerMark[] = [];
  let text = "";
  let speaker = crew[0];
  let last: string | null = null;

  const take = (parsed: ReturnType<typeof parser.flush>) => {
    for (const part of parsed.parts) {
      if (part.kind === "text") {
        text += part.text;
      } else if (part.kind === "speaker") {
        // 이 단계에 없는 사람은 버린다 (서버가 하는 일과 같다)
        if (!crew.includes(part.speaker as CharacterId) || part.speaker === speaker) continue;
        speaker = part.speaker as CharacterId;
        last = null;
        speakers.push({ at: text.length, character: speaker });
      } else if (part.emotion !== last) {
        last = part.emotion;
        emotions.push({ at: text.length, emotion: part.emotion });
      }
    }
  };

  for (const chunk of chunks) take(parser.push(chunk));
  take(parser.flush());
  return { text, emotions, speakers, character: crew[0] };
}

test("한 답변 안에서 감정이 바뀌면 그 자리에서 토막 난다", () => {
  const out = relay([
    "[감정:confident] 안녕! 나는 지유야.\n\n",
    "[감정:realizing] 음… 그 문제 나도 겪어 봤어.\n\n",
    "[감정:playful] 그럼 이렇게 해 볼까?",
  ]);

  const segments = splitSpeech(out.text, out);

  assert.deepEqual(
    segments.map((segment) => segment.emotion),
    ["confident", "realizing", "playful"],
  );
  assert.equal(segments[0].text, "안녕! 나는 지유야.");
  assert.equal(segments[1].text, "음… 그 문제 나도 겪어 봤어.");
  assert.equal(segments[2].text, "그럼 이렇게 해 볼까?");
  assert.ok(segments.every((segment) => segment.character === "jiyou"));
});

test("둘이 함께 있으면 화자가 바뀌는 자리에서 토막 나고 얼굴도 바뀐다", () => {
  const out = relay(
    [
      "[말:daon] [감정:excited] 오 대박! 그거 뜯어보면 어떨까?\n\n",
      "[말:harin] [감정:caring] 근데 누가 쓸지부터 생각해 보자.",
    ],
    ["daon", "harin"],
  );

  const segments = splitSpeech(out.text, out);

  assert.deepEqual(
    segments.map((segment) => [segment.character, segment.emotion]),
    [
      ["daon", "excited"],
      ["harin", "caring"],
    ],
  );
  assert.equal(segments[0].text, "오 대박! 그거 뜯어보면 어떨까?");
  assert.equal(segments[1].text, "근데 누가 쓸지부터 생각해 보자.");
});

test("이 단계에 없는 사람 이름은 버린다", () => {
  // AI가 아무 이름이나 적어 내도 대화가 엉뚱한 사람에게 넘어가면 안 된다
  const out = relay(["[말:mia] [감정:excited] 내가 말할게!"], ["daon", "harin"]);

  assert.equal(out.speakers.length, 0);
  assert.deepEqual(
    splitSpeech(out.text, out).map((segment) => segment.character),
    ["daon"],
  );
});

test("같은 감정이 잇달아 나오면 토막을 쪼개지 않는다", () => {
  const out = relay(["[감정:proud] 잘했어! ", "[감정:proud] 정말로!"]);

  assert.equal(out.emotions.length, 1);
  assert.equal(splitSpeech(out.text, out).length, 1);
});

test("감정 태그가 없으면 그림 한 장으로 그린다", () => {
  const out = relay(["오늘은 무슨 얘기 할까?"], ["teacher"]);

  assert.deepEqual(splitSpeech(out.text, out), [
    { character: "teacher", emotion: "welcome", text: "오늘은 무슨 얘기 할까?" },
  ]);
});

test("대사가 아직 안 왔으면 그림도 내보내지 않는다", () => {
  // 감정 표식은 문단 맨 앞에 오므로 "표식은 왔는데 대사는 아직"인 순간이 반드시 생긴다.
  // 이때 그림을 그리면 얼굴이 먼저 뜨고 말이 뒤늦게 따라붙는다.
  assert.deepEqual(
    splitSpeech("", { emotions: [{ at: 0, emotion: "thinking" }], character: "teacher" }),
    [],
  );
  assert.deepEqual(splitSpeech("", { character: "teacher" }), []);
});

test("마지막 감정의 대사가 아직 안 왔으면 그 그림만 미룬다", () => {
  // 앞 토막은 이미 대사가 있으니 그대로 보이고, 새로 온 감정만 기다린다
  const segments = splitSpeech("찾아볼게.", {
    character: "detective",
    emotions: [
      { at: 0, emotion: "search" },
      { at: 9, emotion: "found" },
    ],
  });

  assert.deepEqual(segments, [
    { character: "detective", emotion: "search", text: "찾아볼게." },
  ]);
});

test("본문 길이를 벗어난 자리 표시는 버린다", () => {
  // 저장된 대화를 되살릴 때 어긋난 값이 섞여 들어와도 화면이 깨지지 않아야 한다
  const segments = splitSpeech("짧은 말.", {
    character: "detective",
    emotions: [{ at: 999, emotion: "oops" }],
  });

  assert.deepEqual(segments, [
    { character: "detective", emotion: "analyzing", text: "짧은 말." },
  ]);
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

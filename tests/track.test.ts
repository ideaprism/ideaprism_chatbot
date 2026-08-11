/**
 * 학습 프로그램(트랙)과 검증 부품 서랍 회귀 테스트.
 *
 * 완료 조건이 "코드에 박힌 함수"에서 "골라 조립하는 부품"으로 바뀌었다.
 * 부품 하나하나가 무엇을 통과시키고 무엇을 막는지를 여기서 못박는다 —
 * 대표님이 관리자에서 조립하게 될 바로 그 부품들이다.
 *
 * 특히 **자유 문장(AI 판정)이 원칙 2를 무너뜨리지 않는가**를 집중해서 본다.
 *   · 부품을 하나라도 못 넘기면 자유 문장은 묻지도 않는다
 *   · 판정 결과가 없으면 통과시키지 않는다 (fail closed)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateRules,
  FRIEND_IDS,
  judgeQuestions,
  NO_EVIDENCE,
  RULE_PARTS,
  type StageEvidence,
  type StageRule,
} from "../src/lib/track/rules";
import {
  DEFAULT_TRACK_ID,
  finalStageOf,
  getTrack,
  stageAt,
  stageIdsOf,
  TRACKS,
} from "../src/lib/track";
import { initialQuestState, STAGES, STAGE_IDS, trackOf } from "../src/lib/quest";
import { toolsForStage } from "../src/lib/tools";

const HINT = "단계 안내";

/** 프로그램이 실제로 조회를 마친 상태 */
const SEARCHED: StageEvidence = {
  kiprisQuery: "우산*빗물",
  kiprisTotal: 12,
  basedOnInventionId: "inv-1",
};

function judge(rules: StageRule[], artifact: unknown, evidence = NO_EVIDENCE) {
  return evaluateRules(rules, artifact, evidence, HINT);
}

// ── 부품 하나하나 ────────────────────────────────────────────

test("부품: 글이 있다 — 글자 수가 모자라면 막는다", () => {
  const rules: StageRule[] = [
    { kind: "text", field: "title", minLength: 5, label: "title" },
  ];

  assert.equal(judge(rules, { title: "빗물 받는 우산" }).ok, true);
  assert.equal(judge(rules, { title: "우산" }).ok, false);
  assert.equal(judge(rules, { title: "      " }).ok, false, "공백만 있으면 빈 것이다");
  assert.equal(judge(rules, {}).ok, false);
  assert.equal(judge(rules, { title: 12345 }).ok, false, "숫자는 글이 아니다");
});

test("부품: 목록에 N개 이상 — 개수와 항목 길이를 함께 본다", () => {
  const rules: StageRule[] = [
    { kind: "list", field: "candidates", minItems: 2, minItemLength: 4, label: "candidates" },
  ];

  assert.equal(judge(rules, { candidates: ["빗물받이 우산", "접이식 커버"] }).ok, true);
  assert.equal(judge(rules, { candidates: ["빗물받이 우산"] }).ok, false, "하나로는 모자라다");
  assert.equal(
    judge(rules, { candidates: ["빗물받이 우산", "우산"] }).ok,
    false,
    "너무 짧은 항목은 세지 않는다",
  );
  assert.equal(judge(rules, { candidates: "빗물받이" }).ok, false, "목록이 아니다");
});

test("부품: 사람을 골랐다 — 발명반 친구 중 서로 다른 두 명만", () => {
  const rules: StageRule[] = [
    { kind: "pickPeople", field: "matchedFriends", from: "friends", count: 2, label: "friends" },
  ];

  assert.equal(judge(rules, { matchedFriends: ["daon", "harin"] }).ok, true);
  assert.equal(judge(rules, { matchedFriends: ["daon"] }).ok, false, "한 명");
  assert.equal(judge(rules, { matchedFriends: ["daon", "daon"] }).ok, false, "같은 사람 둘");
  assert.equal(judge(rules, { matchedFriends: ["teacher", "daon"] }).ok, false, "선생님은 친구가 아니다");
  assert.equal(judge(rules, { matchedFriends: ["detective", "coach"] }).ok, false, "전문가도 아니다");
  assert.equal(judge(rules, { matchedFriends: "daon" }).ok, false, "목록이 아니다");

  // 고를 수 있는 사람은 선배 여섯뿐이다
  assert.deepEqual(FRIEND_IDS, ["daon", "harin", "jiyou", "leo", "junhyuk", "mia"]);
});

test("부품: 실제로 조회했다 — AI의 주장이 아니라 프로그램이 관측한 사실로 본다", () => {
  const rules: StageRule[] = [{ kind: "searched", label: "실제 특허 조회" }];

  assert.equal(judge(rules, { kiprisQuery: "그럴듯한 검색식" }).ok, false, "안 해 봤으면 막는다");
  assert.equal(judge(rules, {}, SEARCHED).ok, true);
});

test("부품: 화면의 것과 같다 — 다른 검색식을 적어 내면 막는다", () => {
  const rules: StageRule[] = [
    { kind: "sameAsScreen", field: "kiprisQuery", screen: "kiprisQuery", label: "kiprisQuery" },
  ];

  assert.equal(judge(rules, { kiprisQuery: "우산*빗물" }, SEARCHED).ok, true);
  assert.equal(judge(rules, { kiprisQuery: "  우산*빗물  " }, SEARCHED).ok, true, "앞뒤 공백은 봐준다");
  assert.equal(judge(rules, { kiprisQuery: "IPC=[A45B]*우산" }, SEARCHED).ok, false);
  assert.equal(judge(rules, {}, SEARCHED).ok, false);
});

test("부품: 0건이면 비운다 · 나왔으면 적는다", () => {
  const empty: StageRule[] = [
    { kind: "emptyWhenNoResult", field: "similarPatents", label: "similarPatents" },
  ];
  const filled: StageRule[] = [
    { kind: "filledWhenResult", field: "similarPatents", minItems: 1, label: "similarPatents" },
  ];
  const zero: StageEvidence = { kiprisQuery: "우산*빗물", kiprisTotal: 0 };

  assert.equal(judge(empty, { similarPatents: ["어디선가 본 특허"] }, zero).ok, false);
  assert.equal(judge(empty, { similarPatents: [] }, zero).ok, true);
  assert.equal(judge(filled, { similarPatents: [] }, zero).ok, true, "0건이면 비어도 된다");

  assert.equal(judge(filled, { similarPatents: [] }, SEARCHED).ok, false, "나왔으면 적어야 한다");
  assert.equal(judge(filled, { similarPatents: ["우산 빗물 제거장치"] }, SEARCHED).ok, true);
});

test("부품: 선배 발명을 골랐다", () => {
  const rules: StageRule[] = [{ kind: "basedOnInvention", label: "기초 발명" }];

  assert.equal(judge(rules, {}, SEARCHED).ok, true);
  assert.equal(judge(rules, {}, { kiprisQuery: "우산", kiprisTotal: 3 }).ok, false);
});

// ── 조립 규칙 ────────────────────────────────────────────────

test("여러 부품이 걸리면 빠진 것을 모아 알려 준다", () => {
  const rules: StageRule[] = [
    { kind: "text", field: "target", label: "target" },
    { kind: "text", field: "pain", label: "pain" },
  ];

  const result = judge(rules, {});
  assert.equal(result.ok, false);
  assert.deepEqual(result.ok === false && result.missing, ["target", "pain"]);
  assert.equal(result.ok === false && result.hint, HINT);
});

test("stop 부품이 걸리면 거기서 멈추고 그 안내만 돌려준다", () => {
  // 조회를 안 했는데 "검색식이 다르다"고 말하면 AI가 엉뚱한 데를 고친다
  const rules: StageRule[] = [
    { kind: "searched", label: "실제 특허 조회", stop: true, hint: "먼저 조회하세요" },
    { kind: "text", field: "differentiation", minLength: 10, label: "differentiation" },
  ];

  const result = judge(rules, {});
  assert.equal(result.ok, false);
  assert.deepEqual(result.ok === false && result.missing, ["실제 특허 조회"]);
  assert.equal(result.ok === false && result.hint, "먼저 조회하세요");
});

test("안내문의 자리표시자에 프로그램이 관측한 값이 채워진다", () => {
  const rules: StageRule[] = [
    {
      kind: "sameAsScreen",
      field: "kiprisQuery",
      screen: "kiprisQuery",
      label: "kiprisQuery",
      hint: "실제로 조회한 검색식과 같아야 합니다: {{조회검색식}} (전체 {{조회건수}}건)",
    },
  ];

  const result = judge(rules, { kiprisQuery: "엉뚱한 검색식" }, SEARCHED);
  assert.equal(
    result.ok === false && result.hint,
    "실제로 조회한 검색식과 같아야 합니다: 우산*빗물 (전체 12건)",
  );
});

// ── 자유 문장 (AI 판정) ──────────────────────────────────────

const WITH_JUDGE: StageRule[] = [
  { kind: "text", field: "summary", minLength: 10, label: "summary" },
  {
    kind: "judge",
    id: "own-words",
    question: "학생이 자기 말로 설명했는가?",
    label: "자기 말로 설명",
    hint: "학생이 스스로 설명하게 도와 주세요.",
  },
];

test("자유 문장: 부품이 하나라도 걸리면 묻지도 않는다", () => {
  // 부품을 통과하지 못했는데 AI가 "좋다"고 해서 넘어가면 원칙 2가 무너진다
  const result = evaluateRules(WITH_JUDGE, { summary: "짧음" }, NO_EVIDENCE, HINT, {
    "own-words": true,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.ok === false && result.missing, ["summary"]);
});

test("자유 문장: 판정 결과가 없으면 통과시키지 않는다", () => {
  const artifact = { summary: "우산대 아래 물받이가 빗물을 모은다" };

  const result = evaluateRules(WITH_JUDGE, artifact, NO_EVIDENCE, HINT);
  assert.equal(result.ok, false, "안 물어봤으면 통과가 아니다");
  assert.ok(
    result.ok === false && result.hint.includes("학생이 자기 말로 설명했는가?"),
    "무엇을 못 물어봤는지 알려 준다",
  );
});

test("자유 문장: 아니라고 판정되면 그 안내가 나가고, 그렇다면 통과한다", () => {
  const artifact = { summary: "우산대 아래 물받이가 빗물을 모은다" };

  const no = evaluateRules(WITH_JUDGE, artifact, NO_EVIDENCE, HINT, { "own-words": false });
  assert.equal(no.ok, false);
  assert.equal(no.ok === false && no.hint, "학생이 스스로 설명하게 도와 주세요.");

  const yes = evaluateRules(WITH_JUDGE, artifact, NO_EVIDENCE, HINT, { "own-words": true });
  assert.equal(yes.ok, true);
});

test("이 단계에서 사람 말로 물어야 하는 조건을 꺼내 준다", () => {
  assert.deepEqual(judgeQuestions(WITH_JUDGE), [
    { id: "own-words", question: "학생이 자기 말로 설명했는가?" },
  ]);
  // 지금 「발명 5단계」는 자유 문장을 쓰지 않는다 (전부 코드가 판정)
  for (const stage of getTrack().stages) {
    assert.deepEqual(judgeQuestions(stage.rules), [], `${stage.id}단계에 자유 문장이 생겼다`);
  }
});

test("관리자 서랍에 늘어놓을 부품 이름이 모든 종류를 덮는다", () => {
  const kinds = new Set(RULE_PARTS.map((part) => part.kind));
  for (const stage of getTrack().stages) {
    for (const rule of stage.rules) {
      assert.ok(kinds.has(rule.kind), `서랍에 없는 부품이 쓰였다: ${rule.kind}`);
    }
  }
});

// ── 트랙 ────────────────────────────────────────────────────

test("모르는 트랙 이름은 기본 트랙으로 되돌린다", () => {
  assert.equal(getTrack("없는트랙").id, DEFAULT_TRACK_ID);
  assert.equal(getTrack(null).id, DEFAULT_TRACK_ID);
  assert.equal(getTrack().id, DEFAULT_TRACK_ID);
});

test("세션은 어떤 학습 프로그램인지 붙들고 간다", () => {
  const state = initialQuestState(0);
  assert.equal(state.trackId, DEFAULT_TRACK_ID);
  assert.equal(trackOf(state).id, DEFAULT_TRACK_ID);

  // 트랙 이름이 없던 시절에 저장된 대화도 기본 트랙으로 이어진다
  assert.equal(trackOf({ ...state, trackId: undefined }).id, DEFAULT_TRACK_ID);
});

test("옮긴 뒤에도 「발명 5단계」의 단계 구성이 그대로다", () => {
  // 이 목록이 바뀌면 3.0 교사 대시보드의 칸반 열도 함께 바뀐다 (ECOSYSTEM 5장)
  assert.deepEqual(STAGE_IDS, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(
    STAGE_IDS.map((id) => STAGES[id].label),
    ["시작", "소재 발견", "문제 정의", "문제해결(SCAMPER)", "아이디어 도출", "발명 / 특허검색"],
  );
  assert.deepEqual(
    STAGE_IDS.map((id) => STAGES[id].character),
    ["teacher", "jiyou", "jiyou", "jiyou", "jiyou", "detective"],
  );
  assert.equal(finalStageOf(getTrack()), 5);
});

test("모든 트랙의 모든 단계가 갖출 것을 갖췄다", () => {
  for (const track of TRACKS) {
    const ids = stageIdsOf(track);
    assert.ok(ids.length > 0, `${track.id}: 단계가 하나도 없다`);
    assert.deepEqual([...ids].sort((a, b) => a - b), ids, `${track.id}: 단계 번호가 뒤죽박죽이다`);
    assert.equal(new Set(ids).size, ids.length, `${track.id}: 단계 번호가 겹친다`);

    for (const stage of track.stages) {
      assert.ok(stage.label.length > 0, `${track.id} ${stage.id}단계: 이름 누락`);
      assert.ok(stage.character, `${track.id} ${stage.id}단계: 담당 캐릭터 누락`);
      assert.ok(stage.mission.length > 20, `${track.id} ${stage.id}단계: 대본 누락`);
      assert.ok(stage.doneWhen.length > 5, `${track.id} ${stage.id}단계: 완료 조건 누락`);
      assert.ok(stage.hint.length > 5, `${track.id} ${stage.id}단계: 반려 안내 누락`);
      assert.ok(stage.rules.length > 0, `${track.id} ${stage.id}단계: 완료 조건 부품이 없다`);
      // 단계를 올릴 수 없으면 학생이 갇힌다
      assert.ok(
        stage.tools.includes("complete_stage"),
        `${track.id} ${stage.id}단계: complete_stage 가 없다`,
      );
    }
  }
});

test("단계별 도구 목록이 트랙에서 나온다", () => {
  const track = getTrack();

  // 0단계는 선생님이 학생을 알아보는 자리 — 버튼이 하나뿐이다
  assert.deepEqual(
    toolsForStage(0, track).map((tool) => tool.name),
    ["complete_stage"],
  );
  // 5단계는 특허를 찾는 자리 — KIPRIS 도구가 들어온다
  const fifth = toolsForStage(5, track).map((tool) => tool.name);
  assert.ok(fifth.includes("generate_kipris_query"));
  assert.ok(fifth.includes("search_kipris"));

  // 도구 설명에 그 트랙의 단계 번호가 들어간다
  const complete = toolsForStage(0, track).find((tool) => tool.name === "complete_stage");
  assert.deepEqual(
    (complete?.parameters.properties.stage as { enum: number[] }).enum,
    stageIdsOf(track),
  );
  assert.ok(
    String((complete?.parameters.properties.artifact as { description: string }).description)
      .includes("0단계: { nickname"),
    "산출물 모양이 트랙에서 나온다",
  );
});

test("모르는 단계 번호를 물으면 첫 단계로 되돌린다", () => {
  // 저장된 세션에 없는 번호가 섞여 들어와도 화면이 깨지지 않아야 한다
  assert.equal(stageAt(getTrack(), 99).id, 0);
});

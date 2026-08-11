/**
 * 검증 부품 서랍 — 단계 완료 조건을 "코드에 박힌 함수"에서 "골라 조립하는 부품"으로.
 *
 * 지금까지 완료 조건은 `quest.ts` 안의 TypeScript 함수였다. 대표님이 관리자에서
 * 손댈 수 없었고, 새 학습 프로그램(트랙)을 만들 때마다 개발자가 필요했다.
 *
 * **부품 만들기는 개발, 조립은 대표님.**
 * 코드는 검사 종류를 미리 만들어 두고(아래 StageRule), 대표님은 관리자에서
 * 부품을 골라 숫자만 채운다. 판정은 여전히 프로그램이 한다 — 아키텍처 원칙 2.
 *
 * ## 자유 문장(judge)에 대하여
 *
 * 부품으로 표현 못 하는 조건은 대표님이 사람 말로 적고 AI가 판정한다.
 * 원칙 2와 부딪히는 부분이라 두 가지 안전장치를 걸었다.
 *   1) **부품을 전부 통과한 뒤에만 자유 문장을 묻는다.** 자유 문장 하나만으로는
 *      절대 단계를 넘길 수 없다.
 *   2) **판정 결과가 없으면 통과시키지 않는다(fail closed).** "물어보지 못했으니
 *      그냥 통과"는 AI가 하지 않은 일을 했다고 적어 내는 것과 같은 구멍이다.
 *
 * 자유 문장을 실제로 AI에게 물어보는 일은 관리자에서 문장을 적을 수 있게 되는
 * 3단계에서 붙인다. 지금 「발명 5단계」 트랙은 자유 문장을 쓰지 않는다.
 */

import { CHARACTERS, type CharacterId } from "../characters";

// ── 프로그램이 실제로 관측한 사실 ────────────────────────────

/**
 * 프로그램이 실제로 관측한 사실 — AI의 주장이 아니다.
 *
 * 산출물만 보고 판정하면, AI가 특허를 한 번도 조회하지 않고도 그럴듯한 검색식과
 * 특허 이름을 적어 내 단계를 끝낼 수 있다(실제로 그렇게 넘어가는 것을 확인했다).
 * 그래서 "정말 해 봤는가"는 여기 담긴 사실로 판정한다. (아키텍처 원칙 2·4)
 */
export interface StageEvidence {
  /** 실제로 조회를 마친 KIPRIS 검색식 (조회 전이면 null) */
  kiprisQuery: string | null;
  /** 그 조회로 프로그램이 센 전체 건수 (조회 전이면 -1) */
  kiprisTotal: number;
  /** 검색식의 기초로 삼은 선배 발명 (고른 적 없으면 null) */
  basedOnInventionId?: string | null;
}

export const NO_EVIDENCE: StageEvidence = {
  kiprisQuery: null,
  kiprisTotal: -1,
  basedOnInventionId: null,
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; missing: string[]; hint: string };

// ── 부품 목록 ────────────────────────────────────────────────

interface RuleCommon {
  /** 반려 안내에 적을 이름. AI가 무엇이 빠졌는지 알아볼 수 있게 */
  label: string;
  /** 이 부품만의 안내. 없으면 단계에 적힌 안내를 쓴다 */
  hint?: string;
  /**
   * 걸리면 여기서 멈추고 이 부품의 안내만 돌려준다.
   * 앞 조건이 무너진 상태에서 뒤 조건을 따져 봐야 엉뚱한 안내가 나가기 때문이다
   * (조회를 안 했는데 "검색식이 다르다"고 말하는 식).
   */
  stop?: boolean;
}

export type StageRule = RuleCommon &
  (
    /** 글이 있다 — minLength 글자 이상 */
    | { kind: "text"; field: string; minLength?: number }
    /** 목록에 minItems 개 이상 — 각 항목은 minItemLength 글자 이상 */
    | { kind: "list"; field: string; minItems?: number; minItemLength?: number }
    /** 정해진 사람 목록에서 서로 다른 count 명을 골랐다 */
    | { kind: "pickPeople"; field: string; from: PeopleSource; count: number }
    /** 프로그램이 실제로 특허를 조회했다 */
    | { kind: "searched" }
    /** 적어 낸 값이 화면에 떠 있는 것과 같다 */
    | { kind: "sameAsScreen"; field: string; screen: "kiprisQuery" }
    /** 조회가 0건이면 이 목록은 비어 있어야 한다 */
    | { kind: "emptyWhenNoResult"; field: string }
    /** 조회에 결과가 있으면 이 목록에 minItems 개 이상 있어야 한다 */
    | { kind: "filledWhenResult"; field: string; minItems?: number }
    /** 기초로 삼을 선배 발명을 골랐다 */
    | { kind: "basedOnInvention" }
    /** 자유 문장 — 사람 말로 적은 조건. 부품을 모두 통과한 뒤에만 묻는다 */
    | { kind: "judge"; id: string; question: string }
  );

export type RuleKind = StageRule["kind"];

/** 관리자 화면의 부품 서랍에 늘어놓을 이름 — 대표님이 고르는 목록이다 */
export const RULE_PARTS: Array<{ kind: RuleKind; name: string; note: string }> = [
  { kind: "text", name: "글이 있다", note: "그 칸에 몇 글자 이상 적혔는가" },
  { kind: "list", name: "목록에 N개 이상", note: "여러 개를 모으는 칸에 쓴다" },
  { kind: "pickPeople", name: "사람을 골랐다", note: "정해진 목록에서 서로 다른 N명" },
  { kind: "searched", name: "실제로 조회했다", note: "프로그램이 특허를 정말 찾아봤는가" },
  { kind: "sameAsScreen", name: "화면의 것과 같다", note: "적어 낸 값이 화면에 뜬 것과 같은가" },
  { kind: "emptyWhenNoResult", name: "0건이면 비운다", note: "안 나온 것을 적지 못하게" },
  { kind: "filledWhenResult", name: "나왔으면 적는다", note: "나온 것을 빠뜨리지 못하게" },
  { kind: "basedOnInvention", name: "선배 발명을 골랐다", note: "무엇을 기초로 삼았는가" },
  { kind: "judge", name: "자유 문장 (AI 판정)", note: "부품을 다 통과한 뒤에만 묻는다" },
];

// ── 고를 수 있는 사람 목록 ───────────────────────────────────

export type PeopleSource = "friends";

/** 학생과 짝지어 줄 수 있는 사람 — 발명반 친구(선배)만. 교사·전문가는 짝이 아니다 */
export const FRIEND_IDS: CharacterId[] = (
  Object.keys(CHARACTERS) as CharacterId[]
).filter((id) => CHARACTERS[id].group === "senior");

function peopleOf(source: PeopleSource): CharacterId[] {
  return source === "friends" ? FRIEND_IDS : [];
}

// ── 검사 ────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isText(value: unknown, minLength: number): boolean {
  return typeof value === "string" && value.trim().length >= minLength;
}

/** 쓸 만한 항목이 몇 개인가 (빈 문자열·숫자 따위는 세지 않는다) */
function countItems(value: unknown, minItemLength: number): number {
  return Array.isArray(value)
    ? value.filter((item) => isText(item, minItemLength)).length
    : 0;
}

/** 정해진 목록에서 서로 다른 count 명을 골랐는가 */
function isDistinctPick(value: unknown, from: CharacterId[], count: number): boolean {
  if (!Array.isArray(value) || value.length !== count) return false;
  const picked = new Set(value);
  if (picked.size !== count) return false;
  return value.every(
    (id) => typeof id === "string" && from.includes(id as CharacterId),
  );
}

function passes(
  rule: StageRule,
  artifact: Record<string, unknown>,
  evidence: StageEvidence,
): boolean {
  switch (rule.kind) {
    case "text":
      return isText(artifact[rule.field], rule.minLength ?? 1);

    case "list":
      return (
        countItems(artifact[rule.field], rule.minItemLength ?? 1) >= (rule.minItems ?? 1)
      );

    case "pickPeople":
      return isDistinctPick(artifact[rule.field], peopleOf(rule.from), rule.count);

    case "searched":
      return Boolean(evidence.kiprisQuery);

    case "sameAsScreen": {
      const claimed =
        typeof artifact[rule.field] === "string"
          ? (artifact[rule.field] as string).trim()
          : "";
      return claimed === evidence.kiprisQuery;
    }

    case "emptyWhenNoResult":
      return !(evidence.kiprisTotal === 0 && countItems(artifact[rule.field], 1) > 0);

    case "filledWhenResult":
      return !(
        evidence.kiprisTotal > 0 &&
        countItems(artifact[rule.field], 1) < (rule.minItems ?? 1)
      );

    case "basedOnInvention":
      return Boolean(evidence.basedOnInventionId);

    case "judge":
      // 여기서는 판정하지 않는다 — evaluateRules 가 부품을 다 통과시킨 뒤에 따로 묻는다
      return true;
  }
}

/** 안내문에 프로그램이 관측한 값을 채워 넣는다 */
function fillEvidence(hint: string, evidence: StageEvidence): string {
  return hint
    .replaceAll("{{조회검색식}}", evidence.kiprisQuery ?? "")
    .replaceAll("{{조회건수}}", String(evidence.kiprisTotal));
}

function deny(
  failed: StageRule[],
  fallbackHint: string,
  evidence: StageEvidence,
): ValidationResult {
  const own = failed.find((rule) => rule.hint);
  return {
    ok: false,
    missing: failed.map((rule) => rule.label),
    hint: fillEvidence(own?.hint ?? fallbackHint, evidence),
  };
}

/**
 * 조립된 부품으로 산출물을 판정한다.
 *
 * 순서가 중요하다 — **부품(코드 판정)을 전부 통과해야 자유 문장을 묻는다.**
 * 그래야 "AI가 좋다고 했으니 통과"가 절대 일어나지 않는다.
 *
 * @param judgments 자유 문장의 판정 결과 (규칙 id → 참/거짓). 없으면 통과시키지 않는다.
 */
export function evaluateRules(
  rules: StageRule[],
  artifact: unknown,
  evidence: StageEvidence,
  /** 부품이 제 나름의 안내를 안 달았을 때 쓰는 단계 안내 */
  fallbackHint: string,
  judgments?: Record<string, boolean>,
): ValidationResult {
  const values = asRecord(artifact);
  const failed: StageRule[] = [];

  for (const rule of rules) {
    if (rule.kind === "judge") continue;
    if (passes(rule, values, evidence)) continue;
    if (rule.stop) return deny([rule], fallbackHint, evidence);
    failed.push(rule);
  }

  if (failed.length > 0) return deny(failed, fallbackHint, evidence);

  // 부품을 다 통과한 뒤에만 사람 말로 적은 조건을 묻는다
  for (const rule of rules) {
    if (rule.kind !== "judge") continue;

    const verdict = judgments?.[rule.id];
    if (verdict === true) continue;

    return {
      ok: false,
      missing: [rule.label],
      hint:
        verdict === false
          ? fillEvidence(rule.hint ?? fallbackHint, evidence)
          : `이 조건을 아직 확인하지 못했습니다: ${rule.question}`,
    };
  }

  return { ok: true };
}

/** 이 단계에서 사람 말로 물어야 하는 조건들 (판정기를 붙일 곳이 쓴다) */
export function judgeQuestions(
  rules: StageRule[],
): Array<{ id: string; question: string }> {
  return rules.flatMap((rule) =>
    rule.kind === "judge" ? [{ id: rule.id, question: rule.question }] : [],
  );
}

/**
 * 프롬프트 조립.
 *
 * 캐싱 원칙: 렌더 순서는 tools → system → messages 다.
 * 앞쪽일수록 고정된 내용을 두고, 매 턴 바뀌는 내용은 캐시 기준점 뒤(=messages 끝)에 붙인다.
 * 그래서 system에는 "캐릭터 대본 + 고정 운영 규칙"만 넣고,
 * 단계·별명·막힘 신호 같은 가변 정보는 마지막 사용자 턴 뒤에 붙인다.
 *
 * (Sonnet 5는 대화 중간 system 메시지를 지원하지 않아, 가변 지시는
 *  사용자 턴에 <운영지침> 블록으로 붙이는 방식을 쓴다.)
 */

import type Anthropic from "@anthropic-ai/sdk";
import { emotionNames, getCharacter, type CharacterId } from "./characters";
import { STAGES, type QuestState } from "./quest";
import type { SearchSnapshot } from "@/types/search";

/** 캐릭터와 무관하게 항상 지켜야 하는 2.0 운영 규칙 */
function operatingRules(characterId: CharacterId): string {
  const character = getCharacter(characterId);
  const emotions = emotionNames(characterId).join(", ");

  return `# IdeaPrism 운영 규칙 (반드시 지킬 것)

너는 학생 발명교육 서비스 IdeaPrism의 캐릭터 "${character.name}"이다.
상대는 초·중·고 학생이다. 아래 규칙은 캐릭터 설정보다 우선한다.

## 1. 감정 표현
- 답변은 반드시 대괄호 감정 태그로 시작한다. 형식: [감정:이름]
- 고를 수 있는 이름: ${emotions}
- 태그 뒤에 곧바로 대사를 이어 쓴다. 태그는 화면이 캐릭터 그림으로 바꿔 준다.
- 이미지 주소(<img>, http 링크)를 직접 쓰지 않는다. 절대로.
- 예시: [감정:${character.defaultEmotion}] 안녕! 반가워.

## 2. 도구(리모컨) 사용
- 화면을 바꾸거나 자료를 찾을 때는 반드시 주어진 도구를 호출한다.
- 검색 건수·통계 같은 숫자는 도구가 돌려준 값만 말한다. 어림짐작하거나 지어내지 않는다.
- 도구가 없는 기능은 "아직 준비 중"이라고 솔직히 말한다. 있는 척하지 않는다.
- 단계를 올릴 때는 반드시 complete_stage 도구를 쓴다.
  스스로 "다음 단계로 가자"고 선언해도 실제로는 넘어가지 않는다.

## 3. 대화 태도
- 한 번에 질문은 하나씩. 학생이 답할 틈을 준다.
- 답변은 짧게. 보통 3~5문장, 길어도 8문장을 넘기지 않는다.
- 학생의 아이디어를 부정하지 않는다. "그건 안 돼" 대신 "이렇게 바꿔보면 어떨까?"
- 학생이 답하기 어려워하면 보기를 2~3개 제시해 부담을 낮춘다.

## 4. 안전장치
- 실명, 학교명, 연락처, 주소 등 개인정보를 묻지 않는다. 별명만 쓴다.
  학생이 먼저 말해도 노트에 적지 않고, 별명으로 부르자고 부드럽게 안내한다.
- 발명과 무관한 주제로 새면 한두 번은 가볍게 받아 주되, 자연스럽게 발명 이야기로 되돌린다.
- 폭력·혐오·성적 내용 등 부적절한 입력에는 휘말리지 않고, 차분히 화제를 돌린다.
- 의학·법률적 확답을 하지 않는다. "가능성이 있다" 수준으로 말한다.`;
}

/**
 * system 블록 조립. 마지막 블록에 캐시 기준점을 찍어
 * 도구 목록 + 운영 규칙 + 페르소나 대본을 통째로 캐싱한다.
 */
export function buildSystemBlocks(
  characterId: CharacterId,
  personaText: string,
): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: operatingRules(characterId) },
    {
      type: "text",
      text: `# 캐릭터 대본\n\n${personaText}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

export interface TurnContext {
  quest: QuestState;
  nickname: string | null;
  /** 발명 외 주제로 샌 횟수 (PRD F-8) */
  offTopicCount: number;
  /** 지금까지 노트에 쌓인 요지 — 대화가 길어져도 잃지 않도록 매 턴 다시 넣는다 */
  noteDigest: string | null;
  /** 우측 패널에 지금 떠 있는 검색 상태 */
  search: SearchSnapshot | null;
}

/**
 * 매 턴 바뀌는 지침. 캐시 기준점 "뒤"에 오도록 마지막 사용자 턴에 덧붙인다.
 * 이 블록이 앞쪽에 있으면 매 턴 캐시가 깨진다.
 */
export function buildTurnBriefing(ctx: TurnContext): string {
  const stage = STAGES[ctx.quest.currentStage];
  const lines: string[] = [];

  lines.push("<운영지침>");
  lines.push(`현재 단계: ${stage.id}단계 「${stage.label}」 (담당: ${stage.character})`);
  lines.push(`완료 조건: ${stage.doneWhen}`);
  lines.push("");
  lines.push("이번 단계에서 할 일:");
  lines.push(stage.mission);

  if (ctx.nickname) {
    lines.push("");
    lines.push(`학생 별명: ${ctx.nickname} (이 이름으로 부른다)`);
  }

  if (ctx.noteDigest) {
    lines.push("");
    lines.push("지금까지 발명노트에 적힌 내용:");
    lines.push(ctx.noteDigest);
  }

  if (ctx.search) {
    const { keyword, totalCount, loadedCount, filters, focusedId } = ctx.search;
    const active = [
      filters.grades.length ? `학년=${filters.grades.join("/")}` : null,
      filters.problemTags.length ? `문제유형=${filters.problemTags.join("/")}` : null,
      filters.scamper.length ? `SCAMPER=${filters.scamper.join("/")}` : null,
    ].filter(Boolean);

    lines.push("");
    lines.push("우측 화면에 지금 떠 있는 검색:");
    lines.push(
      `- 검색어 "${keyword}" · 전체 ${totalCount}건 중 ${loadedCount}건 적재` +
        (active.length ? ` · 필터: ${active.join(", ")}` : " · 필터 없음"),
    );
    if (focusedId) lines.push(`- 상세 카드로 띄운 발명 id: ${focusedId}`);
    lines.push(
      "  ※ 학생이 직접 필터를 눌렀을 수도 있다. 위 상태가 지금 화면 그대로다. " +
        "같은 검색어를 다시 검색하지 말고, 필터만 바꾸려면 apply_filters를 쓴다. " +
        "정확한 건수가 필요하면 get_statistics로 확인한다.",
    );
  }

  const retries = ctx.quest.retries[ctx.quest.currentStage] ?? 0;
  if (retries >= 2) {
    lines.push("");
    lines.push(
      `※ 이 단계에서 완료 신청이 ${retries}번 반려됐다. 조건을 다시 읽고, ` +
        "빠진 항목을 학생과의 대화로 채운 뒤에 complete_stage를 호출한다.",
    );
  }

  if (ctx.offTopicCount >= 3) {
    lines.push("");
    lines.push(
      "※ 학생이 발명과 먼 이야기를 3번 이상 했다. 지도교사 선생님을 부르듯 " +
        "부드럽게 환기하고, 원래 하던 발명 이야기로 자연스럽게 되돌린다.",
    );
  }

  lines.push("</운영지침>");
  return lines.join("\n");
}

/** 사용자 턴 + 운영지침을 하나의 메시지로 묶는다 */
export function userTurnWithBriefing(
  userText: string,
  ctx: TurnContext,
): Anthropic.MessageParam {
  return {
    role: "user",
    content: `${userText}\n\n${buildTurnBriefing(ctx)}`,
  };
}

/**
 * 세션 시동 문구.
 * 첫 인사는 학생 발화 없이 캐릭터가 먼저 말을 걸기 때문에, 이후 턴에서 대화 이력을
 * 되돌려 보낼 때도 이 문구를 첫 user 메시지로 복원해야 흐름이 맞는다.
 * (Messages API는 첫 메시지가 user여야 한다)
 */
export const SESSION_OPENING_CUE =
  "(학생이 방금 접속했다. 아직 아무 말도 하지 않았다. 먼저 인사를 건네고 대화를 시작하라.)";

/** 세션 첫 화면: 학생 입력 없이 캐릭터가 먼저 말을 걸도록 하는 시동 메시지 */
export function openingTurn(ctx: TurnContext): Anthropic.MessageParam {
  return {
    role: "user",
    content: `${SESSION_OPENING_CUE}\n\n${buildTurnBriefing(ctx)}`,
  };
}

/**
 * 배턴터치 직후: 앞 캐릭터가 소개하고 물러난 자리에 새 캐릭터가 등장한다.
 * 학생이 아직 아무 말도 하지 않은 상태이므로 등장 인사부터 시작해야 한다.
 */
export function handoffTurn(
  ctx: TurnContext,
  from: CharacterId | null,
): Anthropic.MessageParam {
  const who = from ? getCharacter(from).name : "앞 캐릭터";
  return {
    role: "user",
    content:
      `(${who}가 너를 소개하고 물러났다. 학생은 아직 아무 말도 하지 않았다. ` +
      "짧게 등장 인사를 건네고, 이번 단계에서 할 일을 자연스럽게 꺼내라. " +
      "앞 캐릭터가 이미 한 이야기를 되풀이하지 말 것.)\n\n" +
      buildTurnBriefing(ctx),
  };
}

/**
 * 대화 이력을 Messages API가 받아들이는 형태로 맞춘다.
 * 첫 인사 때문에 이력이 assistant로 시작할 수 있는데, 그대로 보내면 400이 난다.
 */
export function normalizeHistory(
  history: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (history[0]?.role !== "assistant") return history;
  return [{ role: "user", content: SESSION_OPENING_CUE }, ...history];
}

const EMOTION_TAG = /\[\s*감정\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\]/;
/** 태그가 스트림 조각 사이에서 잘릴 수 있으므로, 이만큼은 붙들고 기다린다 */
const TAG_LOOKAHEAD = 32;

/**
 * 스트림에서 [감정:이름] 태그를 걷어낸다.
 *
 * 태그는 보통 맨 앞에 오지만, 도구 호출을 사이에 두고 여러 번 나올 수 있어
 * 위치를 가리지 않고 제거한다. 조각 경계에서 태그가 잘리는 경우를 대비해
 * 여는 대괄호 이후는 잠시 붙들었다가 흘려보낸다.
 */
export function createEmotionParser() {
  let buffer = "";

  function drain(final: boolean): { emotions: string[]; text: string } {
    const emotions: string[] = [];

    for (;;) {
      const match = buffer.match(EMOTION_TAG);
      if (!match || match.index === undefined) break;
      emotions.push(match[1]);
      buffer = buffer.slice(0, match.index) + buffer.slice(match.index + match[0].length);
    }

    if (final) {
      const text = buffer;
      buffer = "";
      return { emotions, text };
    }

    // 아직 닫히지 않은 '[' 뒤쪽은 태그일 수 있으니 남겨 둔다
    const open = buffer.lastIndexOf("[");
    const hold =
      open !== -1 && buffer.length - open <= TAG_LOOKAHEAD ? open : buffer.length;

    const text = buffer.slice(0, hold);
    buffer = buffer.slice(hold);
    return { emotions, text };
  }

  return {
    push: (chunk: string) => {
      buffer += chunk;
      return drain(false);
    },
    flush: () => drain(true),
  };
}

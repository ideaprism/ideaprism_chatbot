/**
 * 프롬프트 조립.
 *
 * 캐싱 원칙: 렌더 순서는 tools → system → messages 다.
 * 앞쪽일수록 고정된 내용을 두고, 매 턴 바뀌는 내용은 캐시 기준점 뒤(=messages 끝)에 붙인다.
 * 그래서 system에는 "캐릭터 대본 + 고정 운영 규칙"만 넣고,
 * 단계·별명·막힘 신호 같은 가변 정보는 마지막 사용자 턴 뒤에 붙인다.
 *
 * 대화 중간에 시스템 메시지를 끼우는 기능은 회사·모델마다 지원 여부가 달라 쓰지 않는다.
 * 가변 지시는 사용자 턴에 <운영지침> 블록으로 붙이는 방식으로 통일했다 — 셋 다 동작한다.
 */

import type { AiMessage } from "./ai/types";
import { emotionNames, getCharacter, type CharacterId } from "./characters";
import { STAGES, type QuestState } from "./quest";
import type { PatentSnapshot } from "@/types/kipris";
import type { SearchSnapshot } from "@/types/search";

/**
 * {{이름}} 자리표시자를 실제 값으로 바꾼다.
 * 값이 없는 자리표시자는 그대로 둔다 — 대표님이 오타를 내도 문장이 사라지지 않도록.
 */
export function fillPlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

/**
 * flow/공통규칙.md 가 없을 때 쓰는 기본 운영 규칙.
 * 파일을 지우거나 잘못 고쳐도 서비스가 멈추지 않게 하는 안전망이다.
 */
function defaultOperatingRules(characterId: CharacterId): string {
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
  이때 답변 어딘가에 [이탈] 이라고 한 번 적는다. 화면에는 보이지 않고,
  몇 번 샜는지 세는 데만 쓰인다. (발명 이야기면 절대 적지 않는다)
- 폭력·혐오·성적 내용 등 부적절한 입력에는 휘말리지 않고, 차분히 화제를 돌린다.
- 의학·법률적 확답을 하지 않는다. "가능성이 있다" 수준으로 말한다.`;
}

/**
 * 시스템 프롬프트를 조각 순서대로 만든다.
 * 앞쪽일수록 고정된 내용이며, 캐싱 기준점은 어댑터가 마지막 조각에 찍는다
 * (Claude는 직접 지정, OpenAI·Gemini는 자동 캐싱이라 순서만 지켜 주면 된다).
 */
export function buildSystemPrompt(
  characterId: CharacterId,
  personaText: string,
  /** flow/공통규칙.md 원문. 없으면 코드에 든 기본 규칙을 쓴다 */
  rulesTemplate?: string | null,
): string[] {
  const character = getCharacter(characterId);
  const rules = rulesTemplate
    ? fillPlaceholders(rulesTemplate, {
        캐릭터이름: character.name,
        감정목록: emotionNames(characterId).join(", "),
        기본감정: character.defaultEmotion,
      })
    : defaultOperatingRules(characterId);

  return [rules, `# 캐릭터 대본\n\n${personaText}`];
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
  /** 특허 패널에 지금 떠 있는 검색식·결과 */
  patent: PatentSnapshot | null;
  /** flow/N-단계이름.md 의 "이번 단계에서 할 일". 없으면 quest.ts 의 기본 문구 */
  mission?: string;
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
  lines.push(ctx.mission ?? stage.mission);

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

  if (ctx.patent) {
    const { query, totalCount, loadedCount } = ctx.patent;
    lines.push("");
    lines.push("특허 패널에 지금 떠 있는 것:");
    lines.push(`- 검색식: ${query}`);
    lines.push(
      totalCount < 0
        ? "- 아직 조회하지 않았다. search_kipris로 실제 조회를 해야 결과를 말할 수 있다."
        : `- 조회 결과 전체 ${totalCount}건 중 ${loadedCount}건 표시 중`,
    );
    lines.push(
      "  ※ 학생이 패널에서 검색식을 직접 고쳐 다시 조회했을 수도 있다. 위가 지금 화면이다.",
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

  if (ctx.offTopicCount >= OFF_TOPIC_LIMIT) {
    lines.push("");
    lines.push(
      `※ 학생이 발명과 먼 이야기를 ${ctx.offTopicCount}번 했다. 지도교사 선생님을 부르듯 ` +
        "부드럽게 환기하고, 원래 하던 발명 이야기로 자연스럽게 되돌린다. " +
        "혼내지 말고, 지금까지 한 것을 짚어 주며 다시 흐름을 잡아 준다.",
    );
  }

  lines.push("</운영지침>");
  return lines.join("\n");
}

/** 사용자 턴 + 운영지침을 하나의 메시지로 묶는다 */
export function userTurnWithBriefing(
  userText: string,
  ctx: TurnContext,
): AiMessage {
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

/** 발명 이야기로 되돌리기를 안내할 이탈 횟수 (PRD F-8) */
export const OFF_TOPIC_LIMIT = 3;

/** 앞선 대화를 잘라낸 자리에 남기는 표시 */
export const COMPACTED_MARKER =
  "(여기까지의 대화는 발명노트 요지로 대신합니다. 노트 내용은 아래 운영지침에 있습니다.)";

/**
 * 대화 압축 (PRD F-7).
 *
 * 오래된 턴은 잘라내되, 잘렸다는 사실과 "노트를 보라"는 안내를 남긴다.
 * 진짜 기억은 매 턴 다시 넣어 주는 발명노트 요지가 담당하므로,
 * 여기서 따로 AI를 불러 요약하지 않는다(비용도, 지연도 늘리지 않는다).
 */
export function compactHistory(
  history: AiMessage[],
  keepTurns: number,
): AiMessage[] {
  if (history.length <= keepTurns) return history;

  const kept = history.slice(-keepTurns);
  // 잘라낸 뒤 첫 메시지가 assistant면 normalizeHistory가 앞에 user를 채워 준다
  return [{ role: "user", content: COMPACTED_MARKER }, ...kept];
}

/** 세션 첫 화면: 학생 입력 없이 캐릭터가 먼저 말을 걸도록 하는 시동 메시지 */
export function openingTurn(ctx: TurnContext): AiMessage {
  return {
    role: "user",
    content: `${SESSION_OPENING_CUE}\n\n${buildTurnBriefing(ctx)}`,
  };
}

/**
 * 배턴터치 직후: 앞 캐릭터가 소개하고 물러난 자리에 새 캐릭터가 등장한다.
 * 학생이 아직 아무 말도 하지 않은 상태이므로 등장 인사부터 시작해야 한다.
 */
export function handoffTurn(ctx: TurnContext, entranceCue: string): AiMessage {
  return {
    role: "user",
    content: `${entranceCue}\n\n${buildTurnBriefing(ctx)}`,
  };
}

/**
 * 대화 이력의 첫 메시지를 user로 맞춘다.
 * 첫 인사는 학생 발화 없이 시작하므로 이력이 assistant로 시작할 수 있는데,
 * 그대로 보내면 Claude는 400을 내고 다른 회사도 흐름이 어색해진다.
 */
export function normalizeHistory(
  history: AiMessage[],
): AiMessage[] {
  if (history[0]?.role !== "assistant") return history;
  return [{ role: "user", content: SESSION_OPENING_CUE }, ...history];
}

const EMOTION_TAG = /\[\s*감정\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\]/;
const OFFTOPIC_TAG = /\[\s*이탈\s*\]/;
/** 태그가 스트림 조각 사이에서 잘릴 수 있으므로, 이만큼은 붙들고 기다린다 */
const TAG_LOOKAHEAD = 32;

export interface ParsedChunk {
  emotions: string[];
  /** 학생이 발명과 먼 이야기를 했다고 AI가 표시한 횟수 */
  offTopic: number;
  text: string;
}

/**
 * 스트림에서 구조화 표식을 걷어낸다.
 *   [감정:이름] — 화면이 캐릭터 그림으로 바꾼다
 *   [이탈]      — 주제 이탈 카운터를 올린다 (PRD F-8)
 *
 * 표식은 보통 맨 앞에 오지만, 도구 호출을 사이에 두고 여러 번 나올 수 있어
 * 위치를 가리지 않고 제거한다. 조각 경계에서 잘리는 경우를 대비해
 * 여는 대괄호 이후는 잠시 붙들었다가 흘려보낸다.
 */
export function createEmotionParser() {
  let buffer = "";

  function drain(final: boolean): ParsedChunk {
    const emotions: string[] = [];
    let offTopic = 0;

    for (;;) {
      const emotion = buffer.match(EMOTION_TAG);
      if (emotion?.index !== undefined) {
        emotions.push(emotion[1]);
        buffer =
          buffer.slice(0, emotion.index) + buffer.slice(emotion.index + emotion[0].length);
        continue;
      }
      const drift = buffer.match(OFFTOPIC_TAG);
      if (drift?.index !== undefined) {
        offTopic++;
        buffer = buffer.slice(0, drift.index) + buffer.slice(drift.index + drift[0].length);
        continue;
      }
      break;
    }

    if (final) {
      const text = buffer;
      buffer = "";
      return { emotions, offTopic, text };
    }

    // 아직 닫히지 않은 '[' 뒤쪽은 표식일 수 있으니 남겨 둔다
    const open = buffer.lastIndexOf("[");
    const hold =
      open !== -1 && buffer.length - open <= TAG_LOOKAHEAD ? open : buffer.length;

    const text = buffer.slice(0, hold);
    buffer = buffer.slice(hold);
    return { emotions, offTopic, text };
  }

  return {
    push: (chunk: string): ParsedChunk => {
      buffer += chunk;
      return drain(false);
    },
    flush: (): ParsedChunk => drain(true),
  };
}

/**
 * flow/*.md 로더 — 대화 흐름 지침을 대표님이 직접 고칠 수 있게 파일로 뺀 것.
 *
 * personas/ 가 "캐릭터가 어떻게 말하는가"라면, flow/ 는 "대화가 어떻게 흘러가는가"다.
 *   flow/공통규칙.md        — 세 캐릭터 모두에게 적용되는 규칙
 *   flow/0-시작.md ~ 5-…    — 단계마다 무엇을 할지
 *   flow/배턴터치-퇴장.md   — 담당이 바뀔 때 떠나는 쪽
 *   flow/배턴터치-등장.md   — 담당이 바뀔 때 들어오는 쪽
 *
 * 파일이 없거나 읽지 못하면 코드에 들어 있는 기본 문구로 조용히 되돌아간다.
 * 대표님이 파일을 고치다 실수해도 서비스가 멈추지 않게 하기 위해서다.
 *
 * ※ 완료 조건 판정은 여기서 못 바꾼다. 그건 quest.ts 가 한다
 *   (아키텍처 원칙 2: 단계 승급은 코드가 판정).
 */

import "server-only";

import { getCharacter, type CharacterId } from "./characters";
import { fillPlaceholders } from "./prompt";
import { readPrompt } from "./prompts/store";
import { STAGES, type StageId } from "./quest";

/** 단계 번호 → 파일 이름 (대표님이 폴더에서 바로 알아볼 수 있게 한글로) */
const STAGE_FILES: Record<StageId, string> = {
  0: "0-시작",
  1: "1-소재발견",
  2: "2-문제정의",
  3: "3-문제해결",
  4: "4-아이디어도출",
  5: "5-발명특허검색",
};

export const FLOW_FILES = [
  "공통규칙",
  ...Object.values(STAGE_FILES),
  "배턴터치-퇴장",
  "배턴터치-등장",
];

/** 글 맨 위의 <!-- 설명 --> 주석은 대표님을 위한 안내라 AI에게 보내지 않는다 */
export function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/**
 * 흐름 지침 하나를 읽는다. 없으면 null (호출한 쪽이 코드에 든 기본 문구를 쓴다).
 * 관리자 페이지에서 고친 값이 있으면 그것을, 없으면 flow/ 파일을 쓴다.
 */
export async function loadFlow(name: string): Promise<string | null> {
  const raw = await readPrompt("flow", name);
  if (!raw) return null;
  const clean = stripComments(raw);
  return clean.length > 0 ? clean : null;
}

/** 공통 운영 규칙 원문. 자리표시자 채우기는 prompt.ts 가 한다(순수 함수라 테스트하기 좋다) */
export async function operatingRulesTemplate(): Promise<string | null> {
  return loadFlow("공통규칙");
}

/** 이번 단계에서 할 일. 파일이 없으면 quest.ts 의 기본 문구 */
export async function stageMission(stage: StageId): Promise<string> {
  return (await loadFlow(STAGE_FILES[stage])) ?? STAGES[stage].mission;
}

/** 배턴터치 — 떠나는 캐릭터에게 줄 지침 */
export async function handoffExitText(
  from: CharacterId,
  to: CharacterId,
  nextStage: StageId,
): Promise<string> {
  const values = {
    현재캐릭터: getCharacter(from).name,
    다음캐릭터: getCharacter(to).name,
    다음단계번호: String(nextStage),
    다음단계이름: STAGES[nextStage].label,
  };

  const template = await loadFlow("배턴터치-퇴장");
  if (template) return fillPlaceholders(template, values);

  return (
    `이번 단계를 마쳤다. 다음은 ${nextStage}단계 「${STAGES[nextStage].label}」이고 ` +
    `${values.다음캐릭터}이(가) 이어받는다. 지금 맡은 역할로 따뜻하게 퇴장 인사를 건네고 ` +
    `다음 캐릭터를 소개하며 마무리하세요. 다음 캐릭터의 대사는 당신이 쓰지 않습니다.`
  );
}

/** 배턴터치 — 새로 등장하는 캐릭터에게 줄 지침 */
export async function handoffEnterText(
  from: CharacterId | null,
  to: CharacterId,
  stage: StageId,
): Promise<string> {
  const values = {
    이전캐릭터: from ? getCharacter(from).name : "앞 캐릭터",
    현재캐릭터: getCharacter(to).name,
    단계이름: STAGES[stage].label,
  };

  const template = await loadFlow("배턴터치-등장");
  if (template) return fillPlaceholders(template, values);

  return (
    `${values.이전캐릭터}가 너를 소개하고 물러났다. 학생은 아직 아무 말도 하지 않았다. ` +
    "짧게 등장 인사를 건네고, 이번 단계에서 할 일을 자연스럽게 꺼내라. " +
    "앞 캐릭터가 이미 한 이야기를 되풀이하지 말 것."
  );
}

/** 점검용 — 어떤 파일이 실제로 읽히는지 */
export async function flowStatus(): Promise<Array<{ name: string; loaded: boolean }>> {
  return Promise.all(
    FLOW_FILES.map(async (name) => ({ name, loaded: (await loadFlow(name)) !== null })),
  );
}

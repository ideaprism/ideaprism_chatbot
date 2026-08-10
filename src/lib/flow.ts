/**
 * flow/*.md 로더 — 대화 흐름 지침을 대표님이 직접 고칠 수 있게 파일로 뺀 것.
 *
 * personas/ 가 "캐릭터가 어떻게 말하는가"라면, flow/ 는 "대화가 어떻게 흘러가는가"다.
 *   flow/공통규칙.md        — 세 캐릭터 모두에게 적용되는 규칙
 *   flow/0-만남.md ~ 5-…    — 단계마다 무엇을 할지
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

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getCharacter, type CharacterId } from "./characters";
import { fillPlaceholders } from "./prompt";
import { STAGES, type StageId } from "./quest";

const FLOW_DIR = path.join(process.cwd(), "flow");

/** 단계 번호 → 파일 이름 (대표님이 폴더에서 바로 알아볼 수 있게 한글로) */
const STAGE_FILES: Record<StageId, string> = {
  0: "0-만남",
  1: "1-문제발견",
  2: "2-문제정의",
  3: "3-아이디어탐색",
  4: "4-아이디어확정",
  5: "5-선행기술조사",
};

export const FLOW_FILES = [
  "공통규칙",
  ...Object.values(STAGE_FILES),
  "배턴터치-퇴장",
  "배턴터치-등장",
];

/** 파일은 고정 텍스트라 프로세스 수명 동안 캐시한다 */
const cache = new Map<string, string | null>();

/** 파일 맨 위의 <!-- 설명 --> 주석은 AI에게 보낼 필요가 없으므로 걷어낸다 */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** flow/<name>.md 를 읽는다. 없으면 null (호출한 쪽이 기본 문구를 쓴다) */
export async function loadFlow(name: string): Promise<string | null> {
  if (cache.has(name)) return cache.get(name) ?? null;

  try {
    const raw = await readFile(path.join(FLOW_DIR, `${name}.md`), "utf-8");
    const clean = stripComments(raw);
    const value = clean.length > 0 ? clean : null;
    cache.set(name, value);
    return value;
  } catch {
    cache.set(name, null);
    return null;
  }
}

/** 개발 중 flow 파일을 고쳤을 때 캐시를 비운다 */
export function clearFlowCache() {
  cache.clear();
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

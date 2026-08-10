/**
 * KIPRIS 검색식 생성 — 1.0의 OPSME 방식을 이식.
 *
 * 규칙: 같은 갈래의 낱말은 +(또는)로 묶고, 갈래끼리는 *(그리고)로 잇는다.
 *   (우산+양산)*(빗물+물방울)*(받이+수거)
 *
 * 아키텍처 원칙 1: 검색식 문법은 프로그램이 만든다. AI는 낱말만 고른다.
 */

import type { QueryParts } from "@/types/kipris";

/** KIPRIS 검색식에서 뜻이 있는 기호는 낱말에 그대로 두면 식이 깨진다 */
function cleanTerm(term: string): string {
  return term
    .replace(/[*+()[\]="']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupOf(terms: string[] | undefined): string | null {
  if (!terms?.length) return null;

  const cleaned = [...new Set(terms.map(cleanTerm).filter(Boolean))];
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];
  return `(${cleaned.join("+")})`;
}

export interface FormulaResult {
  query: string;
  /** 학생·AI에게 설명할 구성 (어떤 갈래가 들어갔는지) */
  parts: Array<{ label: string; group: string }>;
  /** 검색식이 너무 좁거나 넓을 때의 조언 */
  advice: string | null;
}

const LABELS: Array<[keyof QueryParts, string]> = [
  ["object", "발명 대상"],
  ["problem", "문제"],
  ["solution", "해결 수단"],
  ["method", "방법·원리"],
  ["effect", "효과"],
];

export function buildKiprisQuery(input: QueryParts): FormulaResult {
  const parts: Array<{ label: string; group: string }> = [];

  const ipc = input.ipc ? cleanTerm(input.ipc) : "";
  if (ipc) parts.push({ label: "IPC 분류", group: `IPC=[${ipc}]` });

  for (const [key, label] of LABELS) {
    const group = groupOf(input[key] as string[] | undefined);
    if (group) parts.push({ label, group });
  }

  const query = parts.map((part) => part.group).join("*");

  let advice: string | null = null;
  const keywordGroups = parts.filter((part) => part.label !== "IPC 분류").length;
  if (keywordGroups === 0) {
    advice = "낱말이 하나도 없습니다. 최소한 '발명 대상'은 넣어야 검색할 수 있습니다.";
  } else if (keywordGroups === 1) {
    advice =
      "갈래가 하나뿐이라 결과가 아주 많이 나올 수 있습니다. " +
      "문제나 해결 수단 낱말을 더하면 우리 아이디어에 가까운 특허가 나옵니다.";
  } else if (keywordGroups >= 4) {
    advice =
      "갈래가 많아 결과가 0건일 수 있습니다. 0건이면 갈래를 하나씩 빼 보세요.";
  }

  return { query, parts, advice };
}

/** AI에게 돌려줄 설명 (검색식이 어떻게 만들어졌는지) */
export function describeFormula(result: FormulaResult): string {
  if (!result.query) {
    return result.advice ?? "검색식을 만들지 못했습니다.";
  }

  const lines = [
    `검색식: ${result.query}`,
    "구성:",
    ...result.parts.map((part) => `- ${part.label}: ${part.group}`),
    "읽는 법: + 는 '또는', * 는 '그리고' 입니다.",
  ];
  if (result.advice) lines.push(`※ ${result.advice}`);
  return lines.join("\n");
}

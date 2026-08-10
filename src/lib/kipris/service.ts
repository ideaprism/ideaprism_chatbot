/**
 * KIPRIS(특허청) 조회 — 1.0의 /api/kipris/search 로직을 이식.
 *
 * 응답이 XML이라 태그를 뽑아 쓴다. KIPRIS는 필드명이 버전마다 조금씩 달라서
 * 1.0에서 검증된 대로 여러 이름을 순서대로 시도한다.
 */

import "server-only";

import type { KiprisResult, Patent } from "@/types/kipris";

const BASE_URL =
  "http://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getWordSearch";

/** 한 번에 가져올 특허 수 — 학생이 훑어볼 만한 양 */
export const KIPRIS_ROWS = 10;

export class KiprisError extends Error {}

function tagValue(xml: string, tag: string): string {
  try {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

/** 여러 후보 태그명 중 먼저 값이 있는 것 */
function firstValue(xml: string, tags: string[]): string {
  for (const tag of tags) {
    const value = tagValue(xml, tag);
    if (value) return value;
  }
  return "";
}

function parseItems(xml: string, pageOffset: number): Patent[] {
  const itemRegex =
    /<(?:PatentUtilityInfo|item)>([\s\S]*?)<\/(?:PatentUtilityInfo|item)>/gi;
  const patents: Patent[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const indexNo = firstValue(item, ["indexNo", "IndexNo"]);
    const registerNumber = firstValue(item, ["registerNumber", "RegisterNumber"]);

    patents.push({
      indexNo: indexNo ? Number.parseInt(indexNo, 10) : pageOffset + index + 1,
      inventionTitle:
        firstValue(item, ["inventionTitle", "InventionTitle", "inventionTitleEng"]) ||
        "(제목 없음)",
      applicationNumber: firstValue(item, ["applicationNumber", "ApplicationNumber"]),
      applicationDate: firstValue(item, ["applicationDate", "ApplicationDate"]),
      registerNumber: registerNumber || undefined,
      registerStatus:
        firstValue(item, ["registerStatus", "RegisterStatus"]) ||
        (registerNumber ? "등록" : "공개"),
      ipcNumber: firstValue(item, ["ipcNumber", "IpcNumber", "MainIpc"]),
      applicantName: firstValue(item, ["applicantName", "ApplicantName", "Applicant"]),
      abstract: firstValue(item, ["astrtCont", "AbstractCont", "abstract", "Abstract"]),
      drawing: firstValue(item, ["drawing", "Drawing", "bigDrawing", "BigDrawing"]) || undefined,
    });
    index++;
  }

  return patents;
}

export async function searchKipris(query: string): Promise<KiprisResult> {
  const word = query.trim();
  if (!word) throw new KiprisError("검색식이 비어 있습니다.");

  const serviceKey = process.env.KIPRIS_SERVICE_KEY;
  if (!serviceKey) {
    throw new KiprisError(
      "KIPRIS 키가 설정되지 않았습니다. .env.local 에 KIPRIS_SERVICE_KEY 를 넣어 주세요.",
    );
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("word", word);
  url.searchParams.set("year", "0"); // 0 = 전체 연도
  url.searchParams.set("numOfRows", String(KIPRIS_ROWS));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("ServiceKey", serviceKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/xml" },
      // KIPRIS가 느릴 때 학생을 하염없이 기다리게 두지 않는다
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new KiprisError(
      "특허청 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  }

  if (!response.ok) {
    throw new KiprisError(`특허청 서버가 응답하지 않습니다 (${response.status}).`);
  }

  const xml = await response.text();

  const resultCode = tagValue(xml, "resultCode");
  if (resultCode && resultCode !== "00") {
    const message = tagValue(xml, "resultMsg") || "알 수 없는 오류";
    throw new KiprisError(`특허청 조회 오류: ${message} (코드 ${resultCode})`);
  }

  const totalCount = Number.parseInt(
    firstValue(xml, ["TotalSearchCount", "totalCount", "totalCnt"]) || "0",
    10,
  );

  return { patents: parseItems(xml, 0), totalCount };
}

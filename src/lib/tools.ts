/**
 * AI 도구 명세 — PRD 6장 "리모컨 버튼 8종".
 *
 * 아키텍처 원칙 1: AI는 이 8개 버튼만 누른다. SQL·이미지 주소·화면 코드를 직접 쓰지 않는다.
 *
 * 여기서는 "스키마"만 정의한다. 실제 동작(핸들러)은 단계별로 붙인다.
 *   P0 — update_note, complete_stage
 *   P1 — search_inventions, apply_filters, get_statistics, show_invention
 *   P3 — update_note 실제 저장(Supabase)
 *   P4 — generate_kipris_query, search_kipris
 * 아직 구현되지 않은 도구는 AI에게 아예 건네지 않는다(없는 버튼을 누르지 않도록).
 */

import type Anthropic from "@anthropic-ai/sdk";
import { STAGE_IDS, type StageId } from "./quest";

export type ToolName =
  | "search_inventions"
  | "apply_filters"
  | "get_statistics"
  | "show_invention"
  | "generate_kipris_query"
  | "search_kipris"
  | "update_note"
  | "complete_stage";

/** 현재 실제로 동작하는 도구 (제작 단계가 올라가면 여기에 추가) */
export const IMPLEMENTED_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "update_note",
  "complete_stage",
]);

const SCAMPER_CODES = ["S", "C", "A", "M", "P", "E", "R"] as const;

export const TOOL_SCHEMAS: Record<ToolName, Anthropic.Tool> = {
  search_inventions: {
    name: "search_inventions",
    description:
      "선배들의 발명 사례를 키워드로 검색한다. 검색 결과는 우측 패널에 자동으로 표시되고, " +
      "최대 500건이 브라우저 메모리에 적재된다. 학생이 어떤 주제를 꺼냈을 때, 또는 " +
      "'비슷한 발명 있어?'라고 물었을 때 사용한다. 돌려받는 건수와 통계만 근거로 말하고, " +
      "숫자를 임의로 지어내지 않는다.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "검색어. 2글자 이상. 예: '우산', '분리수거', '시각장애인'",
        },
      },
      required: ["keyword"],
      additionalProperties: false,
    },
  },

  apply_filters: {
    name: "apply_filters",
    description:
      "이미 검색해 둔 결과에 필터를 건다. 서버를 다시 부르지 않고 즉시 반영된다. " +
      "'초등부만 볼까?', '결합 기법 쓴 것만 보자' 같은 대화에 사용한다. " +
      "비우면(빈 배열) 해당 필터가 해제된다.",
    input_schema: {
      type: "object",
      properties: {
        grades: {
          type: "array",
          items: { type: "string" },
          description: "학년 필터. 예: ['초등부'], ['중등부','고등부']",
        },
        problemTags: {
          type: "array",
          items: { type: "string" },
          description: "문제유형 태그 필터",
        },
        scamper: {
          type: "array",
          items: { type: "string", enum: [...SCAMPER_CODES] },
          description:
            "SCAMPER 기법 코드. S=대체, C=결합, A=응용, M=변형, P=용도변경, E=제거, R=재배열",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  get_statistics: {
    name: "get_statistics",
    description:
      "현재 화면에 보이는 결과셋의 통계(학년·문제유형·SCAMPER 분포)를 가져온다. " +
      "숫자는 프로그램이 세므로, 너는 받은 숫자를 해석해 학생에게 설명만 한다.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },

  show_invention: {
    name: "show_invention",
    description:
      "특정 발명 하나를 상세 카드로 크게 띄운다. '이거 자세히 볼래' 같은 요청이나, " +
      "네가 특정 사례를 예로 들 때 사용한다.",
    input_schema: {
      type: "object",
      properties: {
        inventionId: {
          type: "string",
          description: "검색 결과에 포함된 발명의 id. 목록에 없는 id를 지어내지 않는다.",
        },
      },
      required: ["inventionId"],
      additionalProperties: false,
    },
  },

  generate_kipris_query: {
    name: "generate_kipris_query",
    description:
      "아이디어 요지로 KIPRIS(특허청) 검색식을 만든다. 5단계 선행기술조사에서 사용한다. " +
      "검색식은 프로그램이 만들어 주므로, 너는 직접 검색식 문법을 작성하지 않는다.",
    input_schema: {
      type: "object",
      properties: {
        ideaSummary: {
          type: "string",
          description: "아이디어의 핵심 요지. 기술적 특징이 드러나게 2~3문장.",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "핵심 키워드 목록 (선택). 예: ['우산','빗물','배수']",
        },
      },
      required: ["ideaSummary"],
      additionalProperties: false,
    },
  },

  search_kipris: {
    name: "search_kipris",
    description:
      "만들어진 검색식으로 실제 특허를 조회하고 결과를 우측 특허 패널에 띄운다. " +
      "조회 결과에 나온 특허만 근거로 삼는다. 결과에 없는 특허를 지어내면 안 된다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "generate_kipris_query로 만든 검색식" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  update_note: {
    name: "update_note",
    description:
      "발명노트에 지금까지의 진행을 기록한다. 단계가 끝날 때뿐 아니라, 학생이 중요한 " +
      "이야기를 했을 때(문제 정의문, 아이디어 후보 등) 그때그때 적어 둔다. " +
      "학생의 말을 각색하지 말고 요지를 그대로 옮긴다.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "integer",
          enum: [...STAGE_IDS],
          description: "기록할 단계 번호 (0~5)",
        },
        summary: {
          type: "string",
          description: "이 단계에서 학생과 나눈 내용의 요지. 2~4문장.",
        },
        details: {
          type: "object",
          description: "구조화해 남길 값 (선택). 예: { problemStatement: '...' }",
          additionalProperties: true,
        },
      },
      required: ["stage", "summary"],
      additionalProperties: false,
    },
  },

  complete_stage: {
    name: "complete_stage",
    description:
      "현재 단계의 완료 조건을 모두 채웠을 때 호출한다. 프로그램이 산출물을 검증하고, " +
      "통과해야만 다음 단계로 넘어간다. 검증에 실패하면 부족한 항목을 알려 주므로 " +
      "대화를 더 이어간 뒤 다시 호출하면 된다. 스스로 '다음 단계로 가자'고 선언하지 말고 " +
      "반드시 이 도구를 통해서만 단계를 올린다.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "integer",
          enum: [...STAGE_IDS],
          description: "완료를 신청하는 단계 번호. 반드시 '현재' 단계여야 한다.",
        },
        artifact: {
          type: "object",
          description:
            "그 단계의 산출물. 단계마다 필요한 항목이 다르다.\n" +
            "0단계: { nickname, interests[], matchedCharacter:'jiyou' }\n" +
            "1단계: { problemArea, observations[] }\n" +
            "2단계: { problemStatement, target, pain }\n" +
            "3단계: { techniquesTried[](2개 이상), candidates[](2개 이상) }\n" +
            "4단계: { title, summary, howItWorks, differentiator }\n" +
            "5단계: { kiprisQuery, similarPatents[], differentiation }",
          additionalProperties: true,
        },
      },
      required: ["stage", "artifact"],
      additionalProperties: false,
    },
  },
};

/** 단계별로 노출할 도구 목록 (아직 구현 안 된 도구는 자동으로 걸러진다) */
const STAGE_TOOLS: Record<StageId, ToolName[]> = {
  0: ["complete_stage"],
  1: ["search_inventions", "apply_filters", "get_statistics", "show_invention", "update_note", "complete_stage"],
  2: ["search_inventions", "apply_filters", "get_statistics", "update_note", "complete_stage"],
  3: ["search_inventions", "apply_filters", "get_statistics", "show_invention", "update_note", "complete_stage"],
  4: ["update_note", "complete_stage"],
  5: ["generate_kipris_query", "search_kipris", "update_note", "complete_stage"],
};

/**
 * 이번 요청에서 AI에게 건넬 도구 목록.
 * 도구는 프롬프트 맨 앞에 렌더링되므로, 단계가 바뀔 때만 목록이 바뀌도록 설계했다
 * (= 캐시가 깨지는 지점이 배턴터치와 일치한다).
 */
export function toolsForStage(stage: StageId): Anthropic.Tool[] {
  return STAGE_TOOLS[stage]
    .filter((name) => IMPLEMENTED_TOOLS.has(name))
    .map((name) => TOOL_SCHEMAS[name]);
}

export function isToolName(value: string): value is ToolName {
  return value in TOOL_SCHEMAS;
}

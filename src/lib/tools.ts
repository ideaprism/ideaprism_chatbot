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

import type { AiTool } from "./ai/types";
import { STAGE_IDS, type StageId } from "./quest";

export type ToolName =
  | "search_inventions"
  | "apply_filters"
  | "get_statistics"
  | "show_invention"
  | "generate_kipris_query"
  | "search_kipris"
  | "update_note"
  | "complete_stage"
  | "call_expert"
  | "send_off_expert";

/** 현재 실제로 동작하는 도구 (제작 단계가 올라가면 여기에 추가) */
export const IMPLEMENTED_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "search_inventions",
  "apply_filters",
  "get_statistics",
  "show_invention",
  "generate_kipris_query",
  "search_kipris",
  "update_note",
  "complete_stage",
  "call_expert",
  "send_off_expert",
]);

export const TOOL_SCHEMAS: Record<ToolName, AiTool> = {
  search_inventions: {
    name: "search_inventions",
    description:
      "선배들의 발명 사례를 키워드로 검색한다. 검색 결과는 우측 패널에 자동으로 표시되고, " +
      "최대 500건이 브라우저 메모리에 적재된다. 학생이 어떤 주제를 꺼냈을 때, 또는 " +
      "'비슷한 발명 있어?'라고 물었을 때 사용한다. 돌려받는 건수와 통계만 근거로 말하고, " +
      "숫자를 임의로 지어내지 않는다. " +
      "결과에는 화면 앞쪽 발명들의 id와 제목이 함께 온다 — id가 필요한 도구는 " +
      "그 목록에서 고른다. 학생에게 id를 물어보지 않는다(학생 화면에는 id가 없다).",
    parameters: {
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
      "값은 반드시 search_inventions가 돌려준 '고를 수 있는 값' 목록에서만 쓴다. " +
      "목록에 없는 값은 무시되고, 어떤 값이 무시됐는지 알려 준다. " +
      "빈 배열을 주면 그 필터가 해제된다. 생략한 항목은 지금 상태를 유지한다.",
    parameters: {
      type: "object",
      properties: {
        grades: {
          type: "array",
          items: { type: "string" },
          description: "학년 필터. 검색 결과가 알려 준 학년 이름만 사용한다.",
        },
        problemTags: {
          type: "array",
          items: { type: "string" },
          description: "문제유형 태그 필터. 검색 결과가 알려 준 태그만 사용한다.",
        },
        scamper: {
          type: "array",
          items: { type: "string" },
          description: "SCAMPER 태그 필터. 검색 결과가 알려 준 값만 사용한다.",
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
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },

  show_invention: {
    name: "show_invention",
    description:
      "특정 발명 하나를 상세 카드로 크게 띄운다. '이거 자세히 볼래' 같은 요청이나, " +
      "네가 특정 사례를 예로 들 때 사용한다.",
    parameters: {
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
      "KIPRIS(특허청) 검색식을 만든다. 5단계 선행기술조사에서 사용한다.\n" +
      "학생은 특허 분류(IPC)를 고를 줄도, 특허 검색어를 지을 줄도 모른다. " +
      "그래서 맨땅에서 만들지 않는다: 먼저 search_inventions 로 학생 아이디어와 " +
      "비슷한 선배 발명을 찾아 학생과 함께 하나를 고르고, 그 발명의 id를 " +
      "basedOnInventionId 로 넘긴다. 그 발명에 붙어 있는 IPC 분류와 미리 정리된 " +
      "키워드가 '기초 검색식'이 되고, 학생 아이디어에 맞게 바꿀 갈래만 네가 적어 주면 " +
      "그 갈래만 갈아 끼워진다.\n" +
      "검색식 문법(+, *, 괄호)과 IPC 분류는 프로그램이 다룬다 — 직접 쓰지 않는다. " +
      "같은 갈래 안에는 비슷한 말(동의어)을 함께 넣는다. 예: object=['우산','양산'].\n" +
      "다섯 갈래를 다 채워도 좋다. 다만 처음 검색식에는 '발명 대상'과 '해결 수단'만 " +
      "들어가고, 나머지는 우측 패널에 남아 학생이 필요할 때 켤 수 있다 — " +
      "갈래를 다 곱하면 0건이 되는 일이 잦기 때문이다. " +
      "돌려받은 검색식을 그대로 학생에게 읽어 주고, 네가 임의로 갈래를 더하지 않는다.",
    parameters: {
      type: "object",
      properties: {
        basedOnInventionId: {
          type: "string",
          description:
            "기초로 삼을 선배 발명의 id — 학생 아이디어와 가장 비슷하다고 함께 고른 것. " +
            "search_inventions 결과에 함께 온 목록의 id를 그대로 쓴다(지어내지 않는다). " +
            "학생에게 id를 물어보지 않는다 — 학생 화면에는 id가 보이지 않는다. " +
            "학생은 제목으로 고르고, 그 제목에 해당하는 id를 네가 목록에서 찾아 넣는다. " +
            "이 발명의 IPC 분류와 정리된 키워드가 기초 검색식이 된다.",
        },
        object: {
          type: "array",
          items: { type: "string" },
          description:
            "발명 대상 — 학생 아이디어가 무엇에 관한 것인가. 예: ['우산','양산'] " +
            "(비우면 기초 발명의 낱말을 그대로 쓴다)",
        },
        problem: {
          type: "array",
          items: { type: "string" },
          description: "문제 — 무엇이 불편한가. 예: ['빗물','물방울']",
        },
        solution: {
          type: "array",
          items: { type: "string" },
          description: "해결 수단 — 어떤 장치·구조로 푸는가. 예: ['받이','수거']",
        },
        method: {
          type: "array",
          items: { type: "string" },
          description: "방법·원리 (선택)",
        },
        effect: {
          type: "array",
          items: { type: "string" },
          description: "효과 (선택)",
        },
      },
      // 기초 발명 없이는 검색식을 만들지 않는다 — 분류 없이 낱말로만 찾으면
      // 엉뚱한 분야의 특허가 잔뜩 섞인다 (실측: 분류 없이 1만 건 넘게 나왔다)
      required: ["basedOnInventionId"],
      additionalProperties: false,
    },
  },

  search_kipris: {
    name: "search_kipris",
    description:
      "지금 특허 패널에 있는 검색식으로 실제 특허를 조회하고 결과를 그 패널에 띄운다. " +
      "먼저 generate_kipris_query로 검색식을 만들어 두어야 한다. " +
      "검색식은 프로그램이 들고 있으므로 네가 넘기지 않는다 — 학생이 패널에서 직접 " +
      "고쳤을 수도 있고, 그 경우에도 화면에 보이는 그 검색식으로 조회된다. " +
      "조회 결과에 나온 특허만 근거로 삼는다. 결과에 없는 특허를 지어내면 안 된다.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },

  update_note: {
    name: "update_note",
    description:
      "발명노트에 지금까지의 진행을 기록한다. 단계가 끝날 때뿐 아니라, 학생이 중요한 " +
      "이야기를 했을 때(문제 정의문, 아이디어 후보 등) 그때그때 적어 둔다. " +
      "학생의 말을 각색하지 말고 요지를 그대로 옮긴다.",
    parameters: {
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
    parameters: {
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
            "0단계: { nickname, interests[], matchedFriends:[친구id, 친구id] } — 서로 다른 두 명\n" +
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

  call_expert: {
    name: "call_expert",
    description:
      "전문가를 대화에 불러온다. 부르면 그 사람의 대본이 들어와 [말:id] 표식으로 직접 말할 수 있다.\n" +
      "- detective (특허 탐정) — 비슷한 특허를 찾고 신규성을 가린다. **특허를 찾을 때는 반드시 먼저 부른다.**\n" +
      "- coach (사업 코치) — 시장성·실현 가능성. 학생이 '팔 수 있을까' 류를 물을 때\n" +
      "- jiwon (기업 연구원) — 기술 구조·구체화. 학생이 '어떻게 만들지'를 깊게 물을 때\n" +
      "coach 와 jiwon 은 **학생이 원하거나 정말 필요할 때만** 부른다. 아무 때나 부르면 대화가 산만해진다.\n" +
      "부르기 전에 학생에게 한 마디 예고한다: \"이건 ○○님이 잘 아셔, 불러올까?\"\n" +
      "한 번에 한 명만 와 있을 수 있다. 이미 와 있으면 그 사람이 돌아가고 새 사람이 온다.",
    parameters: {
      type: "object",
      properties: {
        expert: {
          type: "string",
          enum: ["detective", "coach", "jiwon"],
          description: "부를 전문가",
        },
        reason: {
          type: "string",
          description: "왜 부르는지 한 문장. 학생에게 그대로 보이지는 않는다.",
        },
      },
      required: ["expert"],
      additionalProperties: false,
    },
  },

  send_off_expert: {
    name: "send_off_expert",
    description:
      "불러온 전문가를 돌려보낸다. 할 일이 끝났는데도 계속 남아 있으면 대화가 무거워진다. " +
      "돌려보내기 전에 고맙다는 인사를 건넨다. 단계가 바뀌면 자동으로 돌아가므로 그때는 부를 필요가 없다.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

/** 단계별로 노출할 도구 목록 (아직 구현 안 된 도구는 자동으로 걸러진다) */
const STAGE_TOOLS: Record<StageId, ToolName[]> = {
  // 0단계는 선생님이 학생을 알아보는 자리다. 전문가를 부를 일이 없다.
  0: ["complete_stage"],
  1: ["search_inventions", "apply_filters", "get_statistics", "show_invention", "update_note", "complete_stage", "call_expert", "send_off_expert"],
  2: ["search_inventions", "apply_filters", "get_statistics", "update_note", "complete_stage", "call_expert", "send_off_expert"],
  3: ["search_inventions", "apply_filters", "get_statistics", "show_invention", "update_note", "complete_stage", "call_expert", "send_off_expert"],
  4: ["update_note", "complete_stage", "call_expert", "send_off_expert"],
  // 5단계도 발명 검색이 필요하다 — 기초 검색식으로 삼을 비슷한 선배 발명을 먼저 골라야 한다
  5: [
    "search_inventions",
    "apply_filters",
    "show_invention",
    "generate_kipris_query",
    "search_kipris",
    "update_note",
    "complete_stage",
    "call_expert",
    "send_off_expert",
  ],
};

/**
 * 이번 요청에서 AI에게 건넬 도구 목록.
 * 도구는 프롬프트 맨 앞에 렌더링되므로, 단계가 바뀔 때만 목록이 바뀌도록 설계했다
 * (= 캐시가 깨지는 지점이 배턴터치와 일치한다).
 */
export function toolsForStage(stage: StageId): AiTool[] {
  return STAGE_TOOLS[stage]
    .filter((name) => IMPLEMENTED_TOOLS.has(name))
    .map((name) => TOOL_SCHEMAS[name]);
}

export function isToolName(value: string): value is ToolName {
  return value in TOOL_SCHEMAS;
}

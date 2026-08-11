/**
 * 「발명 5단계」 — 지금까지 코드에 박혀 있던 그 흐름을, 손대지 않고 그대로 옮긴 것.
 *
 * 이 파일에 있는 이름·대본·완료 조건은 `quest.ts`·`tools.ts`·`flow.ts` 에
 * 흩어져 있던 것을 **한 글자도 바꾸지 않고** 데이터로 옮긴 것이다.
 * 화면과 대화가 하나도 달라지지 않는 것이 옮기기의 성공 기준이다.
 *
 * 완료 조건은 이제 부품 서랍(`../rules.ts`)에서 골라 조립한 목록이다.
 */

import { FRIEND_IDS } from "../rules";
import type { Track } from "../types";

/** 0단계 안내에 붙는 "고를 수 있는 친구" 목록 */
const FRIEND_LIST = FRIEND_IDS.join(", ");

export const INVENTION_FIVE: Track = {
  id: "invention5",
  name: "발명 5단계",
  summary: "생활 속 불편에서 출발해 자기 발명을 만들고, 특허까지 찾아본다",
  version: 1,
  // 맨손으로 시작한다 — 받아 올 재료가 없다
  stages: [
    {
      id: 0,
      label: "시작",
      character: "teacher",
      flowFile: "0-시작",
      doneWhen: "별명과 관심사를 나누고, 함께할 발명반 친구 두 명을 소개받으면 완료",
      mission: `학생과 처음 만나는 단계다.
- 따뜻하게 인사하고, 편하게 부를 별명을 물어본다. (실명·연락처는 절대 묻지 않는다)
- 학년, 요즘 관심사, 발명 경험을 가볍게 2~3가지만 물어본다. 취조하듯 몰아붙이지 않는다.
- 앞으로 어떻게 흘러가는지 짧게 알려 준다: 다섯 단계를 하나씩 따라가면 발명이 완성된다.
- 나눈 이야기를 바탕으로 **발명반 친구 두 명**을 골라 왜 그 둘인지와 함께 소개한다.
- 별명·관심사·친구 두 명이 정해졌으면 complete_stage 를 호출한다.
  (matchedFriends 에 고른 두 명의 id를 넣는다)`,
      // 0단계는 선생님이 학생을 알아보는 자리다. 전문가를 부를 일이 없다.
      tools: ["complete_stage"],
      artifactShape: "{ nickname, interests[], matchedFriends:[친구id, 친구id] } — 서로 다른 두 명",
      rules: [
        { kind: "text", field: "nickname", minLength: 1, label: "nickname" },
        { kind: "list", field: "interests", minItems: 1, label: "interests" },
        {
          kind: "pickPeople",
          field: "matchedFriends",
          from: "friends",
          count: 2,
          label: "matchedFriends(발명반 친구 2명)",
        },
      ],
      hint:
        "별명과 관심사를 확인하고, 발명반 친구 두 명을 골라 소개한 뒤에 넘어갈 수 있어요. " +
        `고를 수 있는 친구: ${FRIEND_LIST}`,
    },

    {
      id: 1,
      label: "소재 발견",
      character: "jiyou",
      flowFile: "1-소재발견",
      doneWhen: "생활 속에서 불편했던 장면을 찾아내면 완료",
      mission: `학생이 "무엇이 불편했는지"를 찾아내게 돕는 단계다.
- "요즘 뭐가 불편했어?" 처럼 생활 경험에서 출발한다.
- 학생이 주제를 꺼내면 search_inventions 도구로 선배들의 발명을 함께 본다.
  숫자와 통계는 도구가 돌려주는 값만 말한다. 절대 지어내지 않는다.
- 필터를 바꿔 보자고 제안할 때는 apply_filters 도구를 쓴다.
- 불편했던 장면(관찰)이 1가지 이상 구체적으로 나오면 complete_stage를 호출한다.`,
      tools: [
        "search_inventions",
        "apply_filters",
        "get_statistics",
        "show_invention",
        "update_note",
        "complete_stage",
        "call_expert",
        "send_off_expert",
      ],
      artifactShape: "{ problemArea, observations[] }",
      rules: [
        { kind: "text", field: "problemArea", minLength: 2, label: "problemArea" },
        {
          kind: "list",
          field: "observations",
          minItems: 1,
          minItemLength: 5,
          label: "observations",
        },
      ],
      hint: "어떤 분야에서 무엇이 불편했는지, 구체적인 장면이 1가지는 있어야 해요.",
    },

    {
      id: 2,
      label: "문제 정의",
      character: "jiyou",
      flowFile: "2-문제정의",
      doneWhen: "누가·무엇이 불편한지 한 문장으로 정리되면 완료",
      mission: `막연한 불편함을 "진짜 문제"로 좁히는 단계다.
- "진짜 문제가 뭘까?"를 파고든다. 겉으로 보이는 증상과 원인을 구분하게 돕는다.
- 누가(target) 어떤 상황에서 무엇 때문에(pain) 불편한지를 학생 입으로 말하게 한다.
- 한 문장짜리 문제 정의문(problemStatement)이 만들어지면 update_note로 기록하고
  complete_stage를 호출한다.`,
      tools: [
        "search_inventions",
        "apply_filters",
        "get_statistics",
        "update_note",
        "complete_stage",
        "call_expert",
        "send_off_expert",
      ],
      artifactShape: "{ problemStatement, target, pain }",
      rules: [
        {
          kind: "text",
          field: "problemStatement",
          minLength: 10,
          label: "problemStatement",
        },
        { kind: "text", field: "target", minLength: 2, label: "target" },
        { kind: "text", field: "pain", minLength: 2, label: "pain" },
      ],
      hint:
        "누가(target), 무엇 때문에(pain) 불편한지가 한 문장(problemStatement)으로 정리돼야 해요.",
    },

    {
      id: 3,
      label: "문제해결(SCAMPER)",
      character: "jiyou",
      flowFile: "3-문제해결",
      doneWhen: "SCAMPER 기법을 2가지 이상 써서 아이디어 후보를 모으면 완료",
      mission: `SCAMPER로 아이디어를 넓히는 단계다.
- 기법 이름을 먼저 말하지 않는다. 사고방식으로 먼저 유도한 뒤
  "이게 SCAMPER에서 ○○이라는 기법이야" 하고 알려준다.
- 기법에 맞는 선배 발명을 보고 싶으면 apply_filters(scamper) 도구를 쓴다.
- 서로 다른 기법을 2가지 이상 시도하고, 아이디어 후보가 2개 이상 나오면
  complete_stage를 호출한다.`,
      tools: [
        "search_inventions",
        "apply_filters",
        "get_statistics",
        "show_invention",
        "update_note",
        "complete_stage",
        "call_expert",
        "send_off_expert",
      ],
      artifactShape: "{ techniquesTried[](2개 이상), candidates[](2개 이상) }",
      rules: [
        {
          kind: "list",
          field: "techniquesTried",
          minItems: 2,
          label: "techniquesTried(2개 이상)",
        },
        {
          kind: "list",
          field: "candidates",
          minItems: 2,
          minItemLength: 4,
          label: "candidates(2개 이상)",
        },
      ],
      hint: "서로 다른 SCAMPER 기법 2가지와 아이디어 후보 2개가 모여야 다음으로 갈 수 있어요.",
    },

    {
      id: 4,
      label: "아이디어 도출",
      character: "jiyou",
      flowFile: "4-아이디어도출",
      doneWhen: "발명의 이름·작동 방식·차별점이 정리되면 완료",
      mission: `후보 중 하나를 골라 아이디어를 또렷하게 만드는 단계다.
- 학생이 스스로 고르게 하되, 고르는 기준(문제를 얼마나 푸는가)을 짚어 준다.
- 발명 이름(title), 한 줄 요약(summary), 어떻게 작동하는지(howItWorks),
  기존 것과 뭐가 다른지(differentiator)를 채워 간다.
- 다 채워지면 update_note로 기록하고 complete_stage를 호출한 뒤,
  "이제 특허 탐정님을 모실게!" 하고 배턴을 넘긴다.`,
      tools: ["update_note", "complete_stage", "call_expert", "send_off_expert"],
      artifactShape: "{ title, summary, howItWorks, differentiator }",
      rules: [
        { kind: "text", field: "title", minLength: 2, label: "title" },
        { kind: "text", field: "summary", minLength: 10, label: "summary" },
        { kind: "text", field: "howItWorks", minLength: 10, label: "howItWorks" },
        { kind: "text", field: "differentiator", minLength: 5, label: "differentiator" },
      ],
      hint: "발명 이름·요약·작동 방식·차별점 네 가지가 모두 채워져야 해요.",
    },

    {
      id: 5,
      label: "발명 / 특허검색",
      character: "detective",
      flowFile: "5-발명특허검색",
      doneWhen: "KIPRIS로 비슷한 특허를 찾아보고 차별점을 정리하면 완료",
      mission: `아이디어가 얼마나 새로운지 확인하는 마지막 단계다.
- 아이디어 요지로 generate_kipris_query 도구를 호출해 검색식을 만든다.
- search_kipris 도구로 실제 조회하고, 결과에 나온 특허만 근거로 삼는다.
  검색 결과에 없는 특허를 지어내지 않는다.
- "무조건 등록됩니다" 같은 확답은 하지 않는다. "가능성이 있습니다"처럼 표현한다.
- 유사 특허와 우리 아이디어의 차별점(differentiation)이 정리되면 complete_stage를 호출한다.`,
      // 5단계도 발명 검색이 필요하다 — 기초 검색식으로 삼을 비슷한 선배 발명을 먼저 골라야 한다
      tools: [
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
      artifactShape: "{ kiprisQuery, similarPatents[], differentiation }",
      // 순서가 곧 판정 순서다. 앞의 셋은 걸리면 거기서 멈춘다(stop) —
      // 조회를 안 했는데 "검색식이 다르다"고 말하면 AI가 엉뚱한 데를 고친다.
      rules: [
        {
          kind: "searched",
          label: "실제 특허 조회",
          stop: true,
          hint:
            "아직 특허를 한 번도 조회하지 않았습니다. 비슷한 선배 발명을 골라 " +
            "generate_kipris_query 로 검색식을 만들고, search_kipris 로 실제 조회한 뒤에 " +
            "완료를 신청하세요. 조회하지 않은 특허를 지어내면 안 됩니다.",
        },
        {
          kind: "sameAsScreen",
          field: "kiprisQuery",
          screen: "kiprisQuery",
          label: "kiprisQuery",
          stop: true,
          hint: "kiprisQuery 는 실제로 조회한 검색식과 똑같아야 합니다: {{조회검색식}}",
        },
        {
          kind: "emptyWhenNoResult",
          field: "similarPatents",
          label: "similarPatents",
          stop: true,
          hint:
            "조회 결과가 0건이었습니다. 나오지 않은 특허를 적을 수 없습니다. " +
            "빈 목록으로 두거나, 검색식을 넓혀 다시 조회하세요.",
        },
        {
          kind: "filledWhenResult",
          field: "similarPatents",
          minItems: 1,
          label: "similarPatents",
          stop: true,
          hint:
            "조회 결과에 특허가 있었습니다. 그중 우리 아이디어와 비슷한 것을 " +
            "최소 1건 적어 주세요 (조회 목록에 나온 제목만).",
        },
        { kind: "text", field: "differentiation", minLength: 10, label: "differentiation" },
      ],
      hint: "'기존 특허와 무엇이 다른지'가 있어야 발명노트를 완성할 수 있어요.",
    },
  ],
};

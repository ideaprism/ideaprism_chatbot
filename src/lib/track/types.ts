/**
 * 학습 프로그램(트랙)의 그릇.
 *
 * 지금까지 "발명 5단계"는 코드 네 곳에 흩어져 박혀 있었다 —
 * 단계 이름·완료 조건(quest.ts), 흐름 지침 파일 이름(flow.ts),
 * 단계별 도구(tools.ts), 그리고 담당 캐릭터(cast.ts).
 * 그 넷을 **한 덩어리의 데이터**로 모은 것이 트랙이다.
 *
 * 앞으로 담을 것 (대표님 계획):
 *   · 발명 5단계        — 맨손에서 시작해 자기 발명을 만든다 (지금 있는 것)
 *   · 발명 리팩터링     — 기존 발명 하나를 받아 그것을 개선한다
 *   · 대박특허 따라잡기 — 문제와 힌트 사다리를 받아 도전한다
 *
 * 세 콘텐츠는 **단계 수도 다르고 시작 재료도 다르다.** 그래서 단계 수를 고정하지
 * 않고(`stages` 배열의 길이가 곧 단계 수), 시작 재료를 `input` 으로 받아 둔다.
 *
 * ※ 서버 전용 코드를 들이지 않는다 — 브라우저(진행판·발명노트)도 이 값을 읽는다.
 */

import type { CharacterId } from "../characters";
import type { ToolName } from "../tools";
import type { StageRule } from "./rules";

/** 트랙 하나의 한 단계 */
export interface TrackStage {
  /** 단계 번호. 진행판·발명노트·3.0 칸반이 이 번호로 자리를 잡는다 */
  id: number;
  /** 진행판에 표시할 짧은 이름 */
  label: string;
  /** 이 단계의 공장 초기 담당 (관리자에서 `cast.ts` 로 덮어쓴다) */
  character: CharacterId;
  /** 학생에게 보여 줄 완료 조건 (진행판 툴팁) */
  doneWhen: string;
  /** AI에게 줄 "이번 단계에 할 일" — flow 파일이 없을 때의 기본 대본 */
  mission: string;
  /** flow/ 폴더의 지침 파일 이름. 있으면 mission 대신 그 파일을 쓴다 */
  flowFile?: string;
  /** 이 단계에서 AI에게 건넬 도구 (구현 안 된 것은 자동으로 걸러진다) */
  tools: ToolName[];
  /** 완료 조건 — 부품 서랍에서 골라 조립한 것 (`rules.ts`) */
  rules: StageRule[];
  /** 부품이 제 나름의 안내를 안 달았을 때 AI에게 돌려줄 안내 */
  hint: string;
  /** 산출물의 모양 한 줄 — complete_stage 도구 설명에 그대로 들어간다 */
  artifactShape?: string;
}

/**
 * 트랙을 시작하기 전에 학생에게 받아야 하는 재료.
 *
 * 「발명 5단계」는 맨손으로 시작하므로 없다.
 * 「리팩터링」은 기존 발명 하나를, 「따라잡기」는 문제와 힌트를 받아야 시작된다.
 */
export interface TrackInput {
  kind: "invention" | "challenge";
  /** 학생에게 보여 줄 이름 (예: "고쳐 볼 발명 고르기") */
  label: string;
  description: string;
}

/** 학습 프로그램 하나 */
export interface Track {
  id: string;
  /** 학생·대표님에게 보여 줄 이름 */
  name: string;
  summary: string;
  /**
   * 발행 번호. 발행본은 고치지 않고 새 번호를 붙인다 —
   * 대화 중인 학생이 쓰던 조건이 도중에 바뀌면 이미 통과한 단계가 소급해서 미달이 된다.
   */
  version: number;
  /** 시작 재료 (없으면 맨손으로 시작) */
  input?: TrackInput;
  /** 단계들. 배열 순서가 곧 진행 순서다 */
  stages: TrackStage[];
}

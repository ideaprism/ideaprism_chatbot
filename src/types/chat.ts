import type { ProviderId } from "@/lib/ai/types";
import type { CharacterId } from "@/lib/characters";
import type { QuestState, StageId } from "@/lib/quest";
import type { ToolName } from "@/lib/tools";
import type { Patent, PatentSnapshot } from "@/types/kipris";
import type { InventionRow, LookupItem, SearchSnapshot } from "@/types/search";

/** 한 단계에서 쓴 토큰과 호출 수 */
export interface StageUsage {
  input: number;
  output: number;
  cacheRead: number;
  calls: number;
}

/** 발명노트 한 줄 (PRD F-6) */
export interface NoteEntry {
  stage: StageId;
  summary: string;
  details?: Record<string, unknown>;
  at: number;
}

/** 브라우저가 들고 다니는 세션 상태. 서버는 이걸 받아 검증하고 갱신해 돌려준다. */
export interface SessionState {
  sessionId: string;
  /**
   * 이번 대화에 쓰는 모델 회사. 대화가 시작되면 바꾸지 않는다 (PRD 7장).
   * null 이면 서버가 키가 있는 곳으로 정해 준다.
   */
  provider: ProviderId | null;
  nickname: string | null;
  quest: QuestState;
  notes: NoteEntry[];
  offTopicCount: number;
  /** 지금까지 쓴 AI 호출 수 — 비용 가드 */
  aiCalls: number;
  /**
   * 단계별 토큰 사용량 (PRD 7장 "단계별 사용량 계측").
   * 정식판에서 단계마다 다른 모델을 쓸지 데이터로 판단하기 위한 기록.
   */
  stageUsage: Record<string, StageUsage>;
  /**
   * 검색 요약 (행 데이터는 여기 없다).
   * 500건 원본은 브라우저 메모리와 서버 캐시에 각각 있고, 이 요약만 매 요청 오간다.
   */
  search: SearchSnapshot | null;
  /** 특허 조회 요약 (특허 목록 원본은 브라우저 메모리에 둔다) */
  patent: PatentSnapshot | null;
}

/** 화면에 보이는 대화 한 줄 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** assistant일 때 말한 캐릭터 */
  character?: CharacterId;
  emotion?: string;
  text: string;
  /** 이 턴에 호출된 도구 이름들 (화면에 "검색 중…" 표시용) */
  tools?: ToolName[];
  pending?: boolean;
}

export interface ChatRequest {
  session: SessionState;
  /** 학생이 보낸 말. 캐릭터가 먼저 말 거는 턴(첫 인사·배턴터치)은 null. */
  message: string | null;
  /**
   * message가 null일 때 어떤 상황인지.
   * opening = 세션 시작, handoff = 배턴터치 직후 새 캐릭터 등장,
   * revisit = 학생이 진행판을 눌러 앞 단계로 되돌아옴
   */
  intent?: "opening" | "handoff" | "revisit";
  /** 배턴터치일 때 물러난 캐릭터 (등장 대사에 쓰인다) */
  handoffFrom?: CharacterId | null;
  /** 되돌아왔을 때 어느 단계에서 왔는지 (맞이하는 말에 쓰인다) */
  revisitFrom?: StageId | null;
  /** 최근 대화 이력 (오래된 턴은 클라이언트가 잘라 보낸다) */
  history: Array<{ role: "user" | "assistant"; text: string }>;
}

/** 서버 → 브라우저 SSE 이벤트 */
export type ChatEvent =
  | { type: "emotion"; emotion: string; character: CharacterId }
  | { type: "text"; delta: string }
  | { type: "tool"; name: ToolName; status: "start" | "done"; note?: string }
  | { type: "handoff"; from: CharacterId; to: CharacterId; stage: StageId }
  | { type: "state"; session: SessionState }
  /** 검색 결과 원본 — 검색을 새로 할 때만 한 번 내려온다(최대 500건) */
  | {
      type: "results";
      rows: InventionRow[];
      grades: LookupItem[];
      categories: LookupItem[];
    }
  /** 특허 조회 결과 */
  | { type: "patents"; query: string; patents: Patent[]; totalCount: number }
  | {
      type: "done";
      usage?: { input: number; output: number; cacheRead: number };
      /** 이번 턴을 실제로 처리한 회사·모델 — 비교 실험 때 화면에 보여 준다 */
      provider?: ProviderId;
      model?: string;
    }
  | { type: "error"; message: string };

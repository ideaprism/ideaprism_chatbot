import type { CharacterId } from "@/lib/characters";
import type { QuestState, StageId } from "@/lib/quest";
import type { ToolName } from "@/lib/tools";
import type { InventionRow, LookupItem, SearchSnapshot } from "@/types/search";

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
  nickname: string | null;
  quest: QuestState;
  notes: NoteEntry[];
  offTopicCount: number;
  /** 지금까지 쓴 AI 호출 수 — 비용 가드 */
  aiCalls: number;
  /**
   * 검색 요약 (행 데이터는 여기 없다).
   * 500건 원본은 브라우저 메모리와 서버 캐시에 각각 있고, 이 요약만 매 요청 오간다.
   */
  search: SearchSnapshot | null;
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
  /** 학생이 보낸 말. 첫 인사(캐릭터가 먼저 말 걸기)는 null. */
  message: string | null;
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
  | { type: "done"; usage?: { input: number; output: number; cacheRead: number } }
  | { type: "error"; message: string };

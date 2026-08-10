/**
 * 도구 실행기 — AI가 누른 버튼을 서버가 실제로 동작시킨다.
 *
 * 지금 동작하는 것: update_note, complete_stage (P0)
 * 나머지는 tools.ts의 IMPLEMENTED_TOOLS에서 빠져 있어 AI에게 전달조차 되지 않는다.
 * 그래도 방어적으로 "준비 중" 응답을 돌려주도록 해 둔다.
 */

import { advanceStage, STAGES, STAGE_IDS, type StageId } from "./quest";
import { upsertNote } from "./session";
import { isToolName, type ToolName } from "./tools";
import type { ChatEvent, NoteEntry, SessionState } from "@/types/chat";

export interface ToolOutcome {
  /** AI에게 돌려줄 문자열 (tool_result) */
  result: string;
  session: SessionState;
  /** 브라우저로 밀어 줄 부수 이벤트 (배턴터치 등) */
  events: ChatEvent[];
  isError: boolean;
}

function asStage(value: unknown): StageId | null {
  const n = typeof value === "number" ? value : Number(value);
  return STAGE_IDS.includes(n as StageId) ? (n as StageId) : null;
}

export function executeTool(
  name: string,
  input: unknown,
  session: SessionState,
): ToolOutcome {
  const keep = (result: string, isError = false): ToolOutcome => ({
    result,
    session,
    events: [],
    isError,
  });

  if (!isToolName(name)) return keep(`알 수 없는 도구입니다: ${name}`, true);

  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (name as ToolName) {
    case "update_note": {
      const stage = asStage(args.stage);
      const summary = typeof args.summary === "string" ? args.summary.trim() : "";

      if (stage === null) return keep("stage는 0~5 사이의 숫자여야 합니다.", true);
      if (summary.length < 5) {
        return keep("summary가 너무 짧습니다. 무엇을 나눴는지 2~4문장으로 적어 주세요.", true);
      }

      const entry: NoteEntry = {
        stage,
        summary,
        details:
          args.details && typeof args.details === "object"
            ? (args.details as Record<string, unknown>)
            : undefined,
        at: Date.now(),
      };

      const next: SessionState = { ...session, notes: upsertNote(session.notes, entry) };
      return {
        result: `${stage}단계 기록을 발명노트에 저장했습니다.`,
        session: next,
        events: [{ type: "state", session: next }],
        isError: false,
      };
    }

    case "complete_stage": {
      const stage = asStage(args.stage);
      if (stage === null) return keep("stage는 0~5 사이의 숫자여야 합니다.", true);

      // 승급 전 담당 캐릭터 — 배턴터치 연출에서 "누가 떠나는지" 표시에 쓴다
      const from = STAGES[session.quest.currentStage].character;
      const outcome = advanceStage(session.quest, stage, args.artifact);

      if (!outcome.ok) {
        // 실패해도 재시도 횟수는 올라간다 (막힘 신호 기록)
        const next: SessionState = { ...session, quest: outcome.state };
        return { result: outcome.message, session: next, events: [], isError: true };
      }

      // 0단계 산출물에서 별명을 받아 세션에 고정한다
      const artifact = (args.artifact ?? {}) as Record<string, unknown>;
      const nickname =
        stage === 0 && typeof artifact.nickname === "string" && artifact.nickname.trim()
          ? artifact.nickname.trim()
          : session.nickname;

      const next: SessionState = { ...session, quest: outcome.state, nickname };
      const events: ChatEvent[] = [];

      if (outcome.characterChanged) {
        events.push({
          type: "handoff",
          from,
          to: outcome.nextCharacter,
          stage: outcome.nextStage,
        });
      }
      events.push({ type: "state", session: next });

      return { result: outcome.message, session: next, events, isError: false };
    }

    default:
      return keep(
        `${name} 도구는 아직 준비 중입니다. 학생에게 "그 기능은 아직 준비 중"이라고 ` +
          "솔직히 말하고 대화를 이어가세요.",
        true,
      );
  }
}

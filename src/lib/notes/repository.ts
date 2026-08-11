/**
 * 발명노트 저장 (PRD F-6).
 *
 * 익명 세션ID를 기준으로 invention_notes 테이블에 통째로 덮어쓴다(upsert).
 * 담을 내용을 만드는 계산은 payload.ts 에 있고, 여기는 쓰기만 맡는다.
 *
 * 저장 실패는 대화를 끊지 않는다. 학생 입장에서 노트 저장은 뒷일이라,
 * 실패하면 서버 로그에만 남기고 대화는 그대로 이어간다.
 */

import "server-only";

import { hostAt } from "@/lib/cast";
import { supabaseWrite } from "@/lib/supabase";
import type { SessionState } from "@/types/chat";
import { buildStagePayload } from "./payload";

export interface SaveResult {
  ok: boolean;
  detail: string;
}

export async function saveNote(session: SessionState): Promise<SaveResult> {
  if (!process.env.SUPABASE_SECRET_KEY) {
    return { ok: false, detail: "SUPABASE_SECRET_KEY 미설정 — 저장 건너뜀" };
  }

  const finalIdea = session.quest.completed[4] ?? null;
  const patent = session.quest.completed[5] as
    | { kiprisQuery?: string; similarPatents?: unknown; differentiation?: string }
    | undefined;

  try {
    const { error } = await supabaseWrite()
      .from("invention_notes")
      .upsert(
        {
          session_id: session.sessionId,
          nickname: session.nickname,
          matched_character: hostAt(session.cast, session.quest.currentStage),
          current_stage: session.quest.currentStage,
          completed: session.quest.completed[5] !== undefined,
          stages: buildStagePayload(session),
          final_idea: finalIdea,
          kipris_query: patent?.kiprisQuery ?? null,
          kipris_summary: patent
            ? {
                similarPatents: patent.similarPatents ?? [],
                differentiation: patent.differentiation ?? null,
              }
            : null,
          ai_calls: session.aiCalls,
          // 단계별 토큰 사용량 (PRD 7장) — 정식판 모델 전략의 근거 자료
          token_usage: session.stageUsage ?? {},
        },
        { onConflict: "session_id" },
      );

    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "저장됨" };
  } catch (cause) {
    return {
      ok: false,
      detail: cause instanceof Error ? cause.message : "알 수 없는 오류",
    };
  }
}

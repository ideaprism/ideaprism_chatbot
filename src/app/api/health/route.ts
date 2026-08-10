import { NextResponse } from "next/server";

import { CHAT_MODEL } from "@/lib/ai/config";
import { CHARACTERS } from "@/lib/characters";
import { loadPersona } from "@/lib/personas";
import { supabaseRead } from "@/lib/supabase";

/**
 * 연결 점검용 라우트. 브라우저에서 /api/health 로 열면
 * 무엇이 준비됐고 무엇이 비었는지 한눈에 보인다.
 * 키 "값"은 절대 응답에 담지 않는다 — 채워졌는지 여부만 알려 준다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

export async function GET() {
  const checks: Record<string, Check> = {};

  checks.anthropicKey = process.env.ANTHROPIC_API_KEY
    ? { ok: true, detail: `설정됨 · 모델 ${CHAT_MODEL}` }
    : { ok: false, detail: ".env.local 에 ANTHROPIC_API_KEY 를 넣어 주세요" };

  checks.kiprisKey = process.env.KIPRIS_SERVICE_KEY
    ? { ok: true, detail: "설정됨 (P4에서 사용)" }
    : { ok: false, detail: "아직 없음 — P4 특허 연결 전까지는 없어도 됩니다" };

  // 페르소나 3종이 모두 읽히는지 + 이미지 지시문이 제대로 걷혔는지
  // (아키텍처 원칙 3: AI는 이미지 주소를 직접 쓰지 않는다)
  const personaResults = await Promise.all(
    Object.values(CHARACTERS).map(async (character) => {
      try {
        const text = await loadPersona(character.id);
        const leftover = /<img\b|raw\.githubusercontent\.com/i.test(text);
        return {
          line: `${character.name}(${text.length}자${leftover ? ", 이미지 지시문 남음" : ""})`,
          ok: !leftover,
        };
      } catch {
        return { line: `${character.name}: 읽기 실패(${character.personaFile})`, ok: false };
      }
    }),
  );
  checks.personas = {
    ok: personaResults.every((r) => r.ok),
    detail: personaResults.map((r) => r.line).join(", "),
  };

  // Supabase 읽기 연결 — 1.0의 inventions 테이블에 실제로 닿는지
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    checks.supabaseRead = {
      ok: false,
      detail: "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY 를 넣어 주세요",
    };
  } else {
    try {
      const { count, error } = await supabaseRead()
        .from("inventions")
        .select("id", { count: "exact", head: true });
      checks.supabaseRead = error
        ? { ok: false, detail: `연결 실패: ${error.message}` }
        : { ok: true, detail: `inventions 테이블 ${count ?? 0}건 확인` };
    } catch (cause) {
      checks.supabaseRead = {
        ok: false,
        detail: cause instanceof Error ? cause.message : "알 수 없는 오류",
      };
    }
  }

  checks.supabaseWriteKey = process.env.SUPABASE_SECRET_KEY
    ? { ok: true, detail: "설정됨 (발명노트 저장용, 서버 전용)" }
    : { ok: false, detail: "아직 없음 — P3 발명노트 저장 전까지는 없어도 됩니다" };

  const required = ["anthropicKey", "personas"];
  const ready = required.every((key) => checks[key].ok);

  return NextResponse.json(
    {
      ready,
      summary: ready
        ? "P0 실행 준비 완료 — 첫 화면에서 지도교사가 인사를 건넵니다."
        : "아직 준비되지 않은 항목이 있습니다. 아래 checks 를 확인해 주세요.",
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}

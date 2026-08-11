import { NextResponse } from "next/server";

import { adminConfigured } from "@/lib/admin/auth";
import { availableProviders } from "@/lib/ai/provider";
import { CHARACTERS } from "@/lib/characters";
import { flowStatus } from "@/lib/flow";
import { loadPersona } from "@/lib/prompts/persona";
import { supabaseRead, supabaseWrite } from "@/lib/supabase";

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

  // 세 회사 중 하나라도 키가 있으면 대화는 가능하다
  const providers = availableProviders();
  const ready = providers.filter((provider) => provider.configured);

  checks.aiProviders =
    ready.length > 0
      ? {
          ok: true,
          detail: `쓸 수 있는 모델 ${ready.length}종 — ${ready
            .map((provider) => `${provider.label}(${provider.model})`)
            .join(", ")}`,
        }
      : {
          ok: false,
          detail:
            ".env.local 에 ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 " +
            "하나 이상을 넣어 주세요",
        };

  for (const provider of providers) {
    checks[`ai_${provider.id}`] = provider.configured
      ? { ok: true, detail: `키 있음 · 모델 ${provider.model}` }
      : { ok: false, detail: `키 없음 — ${provider.label} 비교는 할 수 없습니다` };
  }

  checks.kiprisKey = process.env.KIPRIS_SERVICE_KEY
    ? { ok: true, detail: "설정됨 — 5단계 특허 조회 가능" }
    : { ok: false, detail: "없음 — 5단계 선행기술조사에서 특허를 찾을 수 없습니다" };

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

  // 관리자 페이지 — 코드가 없으면 잠긴 상태다(고장이 아니라 기본값)
  checks.adminPage = adminConfigured()
    ? { ok: true, detail: "접근 코드 설정됨 — /admin 에서 대본·흐름을 고칠 수 있습니다" }
    : {
        ok: false,
        detail:
          "ADMIN_PASSWORD 가 없어 /admin 이 잠겨 있습니다 (프롬프트 보호를 위한 기본값)",
      };

  // 관리자 페이지에서 고친 글을 담아 두는 표
  //
  // ※ head:true 로 개수만 세는 조회는 표가 아예 없어도 오류를 돌려주지 않는다(실측).
  //   그러면 표가 없는데도 점검이 초록으로 나온다. 그래서 행을 실제로 받아 본다.
  //   (많아야 12줄짜리 표라 부담이 없다)
  try {
    const { data, error } = await supabaseWrite().from("prompt_overrides").select("kind, name");
    const count = data?.length ?? 0;
    checks.promptOverrides = error
      ? {
          ok: false,
          detail:
            "prompt_overrides 표가 없습니다 — supabase/prompt_overrides.sql 을 " +
            "Supabase에서 실행하면 관리자 페이지의 저장이 켜집니다 (지금은 파일 원본으로 동작)",
        }
      : {
          ok: true,
          detail:
            count > 0
              ? `고쳐 둔 글 ${count}개 — 파일 대신 이 값이 쓰입니다`
              : "표 준비됨 — 아직 고친 글은 없고 파일 원본으로 동작 중",
        };
  } catch {
    checks.promptOverrides = {
      ok: false,
      detail: "확인하지 못했습니다 (SUPABASE_SECRET_KEY 를 확인해 주세요)",
    };
  }

  // 흐름 지침 파일 — 없으면 코드에 든 기본 문구로 도는 것이지 고장은 아니다
  const flow = await flowStatus();
  const missingFlow = flow.filter((file) => !file.loaded).map((file) => file.name);
  checks.flow = {
    ok: missingFlow.length === 0,
    detail:
      missingFlow.length === 0
        ? `flow/ 파일 ${flow.length}개 모두 읽힘 — 여기를 고치면 대화 흐름이 바뀝니다`
        : `기본 문구로 대체 중: ${missingFlow.join(", ")} (파일이 없거나 비어 있음)`,
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
      // count 가 null 이면 표에 닿지 못한 것이다 — head 조회는 그때도 오류를 안 준다
      checks.supabaseRead =
        error || count === null
          ? { ok: false, detail: `연결 실패: ${error?.message ?? "inventions 표를 찾지 못했습니다"}` }
          : { ok: true, detail: `inventions 테이블 ${count}건 확인` };
    } catch (cause) {
      checks.supabaseRead = {
        ok: false,
        detail: cause instanceof Error ? cause.message : "알 수 없는 오류",
      };
    }
  }

  checks.supabaseWriteKey = process.env.SUPABASE_SECRET_KEY
    ? { ok: true, detail: "설정됨 — 발명노트가 저장됩니다 (서버 전용 키)" }
    : { ok: false, detail: "없음 — 노트가 브라우저에만 남고 저장되지 않습니다" };

  // 이것만 있으면 대화는 시작된다 (flow 파일은 없어도 기본 문구로 돈다)
  const canChat = checks.aiProviders.ok && checks.personas.ok;
  const allReady = Object.values(checks).every((check) => check.ok);

  const missing = Object.entries(checks)
    .filter(([, check]) => !check.ok)
    .map(([name]) => name);

  return NextResponse.json(
    {
      ready: canChat,
      summary: !canChat
        ? "아직 대화를 시작할 수 없습니다. 아래 checks 를 확인해 주세요."
        : allReady
          ? "모두 준비됐습니다 — 0단계부터 5단계까지 완주할 수 있습니다."
          : `대화는 가능하지만 일부 기능이 빠집니다: ${missing.join(", ")}`,
      checks,
    },
    { status: canChat ? 200 : 503 },
  );
}

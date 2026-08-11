/**
 * IPC 분류 코드 조회 — 1.0과 같은 `ipc_descriptions` 표를 읽는다.
 *
 * 아키텍처 원칙 4의 연장선: AI가 IPC 코드를 지어내면 검색식이 통째로 빗나간다.
 * 표에 없는 코드는 조용히 버리고, 무엇을 버렸는지 AI에게 알려 준다.
 */

import "server-only";

import { supabaseRead } from "@/lib/supabase";

/** 표에 있으면 뜻을, 없으면 null */
export async function lookupIpc(rawCode: string): Promise<string | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  try {
    const { data } = await supabaseRead()
      .from("ipc_descriptions")
      .select("description")
      .eq("ipc_code", code)
      .maybeSingle();

    return (data as { description?: string } | null)?.description ?? null;
  } catch {
    // 표를 못 읽어도 특허 조회 자체는 계속돼야 한다
    return null;
  }
}

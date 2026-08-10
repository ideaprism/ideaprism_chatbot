import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 연결.
 * 1.0과 "같은 프로젝트"를 공유한다 — inventions 등은 읽기 전용으로 쓰고,
 * 신규 invention_notes 테이블에만 쓴다. (PRD 7장)
 *
 * - anon 키  : 읽기용. 브라우저에 노출돼도 되는 키.
 * - secret 키: 발명노트 저장용. 서버에서만 쓴다. 건물 마스터키라 절대 노출 금지.
 */

let readClient: SupabaseClient | null = null;
let writeClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} 환경변수가 없습니다. .env.local 파일을 확인해 주세요 (.env.local.example 참고).`,
    );
  }
  return value;
}

/** 읽기 전용 클라이언트 (inventions, grades, categories …) */
export function supabaseRead(): SupabaseClient {
  if (!readClient) {
    readClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return readClient;
}

/** 쓰기 클라이언트 (invention_notes) — 서버 라우트에서만 호출할 것 */
export function supabaseWrite(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseWrite()는 서버에서만 사용할 수 있습니다.");
  }
  if (!writeClient) {
    writeClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false } },
    );
  }
  return writeClient;
}

/** 환경변수가 채워졌는지 (키 값 자체는 절대 반환하지 않는다) */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

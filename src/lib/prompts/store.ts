/**
 * 프롬프트 저장소 — 페르소나·대화 흐름 글을 한곳에서 읽고 쓴다.
 *
 * 두 겹으로 되어 있다.
 *   1) personas/ · flow/ 파일 = **공장 초기값**. git에 있으므로 절대 사라지지 않는다.
 *   2) Supabase `prompt_overrides` 표 = 관리자 페이지에서 고친 값. 있으면 이쪽이 이긴다.
 *
 * 파일에 바로 쓰지 않는 이유:
 *   - Vercel 같은 곳에 올리면 서버의 파일이 읽기 전용이라 저장 자체가 안 된다.
 *   - 파일을 덮어쓰면 원본이 사라져 "되돌리기"가 불가능해진다.
 * 그래서 "기본값으로 되돌리기"는 표에서 한 줄을 지우는 일이 된다.
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CAST, serializeCast } from "@/lib/cast";
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from "@/lib/characters";
import { supabaseWrite } from "@/lib/supabase";

/**
 * 관리할 수 있는 글의 갈래.
 *   persona — 캐릭터가 어떻게 말하는가
 *   flow    — 대화가 어떻게 흘러가는가
 *   config  — 대화구조 같은 설정값 (JSON). 파일이 아니라 코드가 기본값을 준다
 */
export type PromptKind = "persona" | "flow" | "config";

/** config 갈래에서 다루는 설정 이름 */
export const CONFIG_NAMES = ["대화구조"] as const;

/** 관리자 화면에 보여 줄 문서 한 건 */
export interface PromptDoc {
  kind: PromptKind;
  name: string;
  /** 화면에 보일 이름 */
  label: string;
  /** 이 글이 무엇을 바꾸는지 (대표님이 고르기 쉽게) */
  hint: string;
}

const PERSONA_DIR = path.join(process.cwd(), "personas");
const FLOW_DIR = path.join(process.cwd(), "flow");

/**
 * 관리할 수 있는 문서 목록.
 *
 * 페르소나는 personas/ 폴더에 있는 파일 전부가 아니라 **실제로 쓰이는 세 캐릭터**만
 * 보여 준다. 안 쓰이는 파일까지 늘어놓으면 어느 것을 고쳐야 할지 헷갈린다.
 */
export const PERSONA_DOCS: PromptDoc[] = CHARACTER_IDS.map((id) => ({
  kind: "persona" as const,
  name: id,
  label: `${CHARACTERS[id].name} · ${CHARACTERS[id].subtitle}`,
  hint: "이 캐릭터가 어떻게 말하는가 (성격·말투·자기소개)",
}));

export const CONFIG_DOCS: PromptDoc[] = [
  {
    kind: "config",
    name: "대화구조",
    label: "대화구조",
    hint: "어느 단계를 누가 맡는가 (완료 조건은 여기서 못 바꾼다 — 프로그램이 판정)",
  },
];

const FLOW_HINTS: Record<string, string> = {
  공통규칙: "세 캐릭터 모두에게 적용되는 규칙 (감정 표현, 도구 사용, 안전장치)",
  "0-만남": "0단계 — 별명을 묻고 함께할 선배를 소개한다",
  "1-문제발견": "1단계 — 생활 속 불편함을 찾아낸다",
  "2-문제정의": "2단계 — 진짜 문제를 한 문장으로 좁힌다",
  "3-아이디어탐색": "3단계 — SCAMPER로 아이디어를 넓힌다",
  "4-아이디어확정": "4단계 — 후보 하나를 골라 또렷하게 만든다",
  "5-선행기술조사": "5단계 — 비슷한 특허를 찾아 차별점을 정리한다",
  "배턴터치-퇴장": "담당이 바뀔 때 — 떠나는 캐릭터가 할 말",
  "배턴터치-등장": "담당이 바뀔 때 — 들어오는 캐릭터가 할 말",
};

export function flowDocs(names: readonly string[]): PromptDoc[] {
  return names.map((name) => ({
    kind: "flow" as const,
    name,
    label: name,
    hint: FLOW_HINTS[name] ?? "대화 흐름 지침",
  }));
}

/** 문서가 실제로 있는 것인지 (주소로 아무 이름이나 넣지 못하게) */
export function isKnownDoc(kind: string, name: string, flowNames: readonly string[]): boolean {
  if (kind === "persona") return PERSONA_DOCS.some((doc) => doc.name === name);
  if (kind === "flow") return flowNames.includes(name);
  if (kind === "config") return CONFIG_DOCS.some((doc) => doc.name === name);
  return false;
}

// ── 공장 초기값 (파일) ───────────────────────────────────────

/** 파일은 실행 중에 바뀌지 않으므로 한 번 읽어 들고 있는다 */
const fileCache = new Map<string, string | null>();

export async function readDefault(kind: PromptKind, name: string): Promise<string | null> {
  const key = keyOf(kind, name);
  if (fileCache.has(key)) return fileCache.get(key) ?? null;

  let value: string | null = null;
  try {
    if (kind === "config") {
      // 설정값은 파일이 아니라 코드가 공장 초기값을 준다
      value = name === "대화구조" ? serializeCast(DEFAULT_CAST) : null;
    } else if (kind === "persona") {
      const file = CHARACTERS[name as CharacterId]?.personaFile;
      if (file) value = await readFile(path.join(PERSONA_DIR, file), "utf-8");
    } else {
      value = await readFile(path.join(FLOW_DIR, `${name}.md`), "utf-8");
    }
  } catch {
    value = null;
  }

  fileCache.set(key, value);
  return value;
}

// ── 고친 값 (Supabase) ───────────────────────────────────────

interface OverrideRow {
  kind: PromptKind;
  name: string;
  content: string;
  updated_at: string;
}

/**
 * 고친 값 전체를 한 번에 읽어 잠깐 들고 있는다.
 *
 * 프롬프트는 매 대화 턴마다 필요하므로 그때마다 DB를 부르면 느려진다.
 * 그렇다고 영영 들고 있으면 관리자 페이지에서 고쳐도 반영되지 않는다.
 * 그래서 짧게(수십 초) 캐시하고, 저장·되돌리기 직후에는 즉시 비운다.
 * 배포 환경은 서버가 여러 대일 수 있어, 캐시를 비워도 다른 서버는
 * 최대 이 시간만큼 옛 값을 쓸 수 있다 — 그래서 짧게 잡는다.
 */
const CACHE_TTL_MS = 20_000;

let cache: { at: number; map: Map<string, string> } | null = null;
/** 표 자체가 아직 없을 때(DDL 미적용) 매 요청 오류를 내지 않도록 잠시 쉬어 간다 */
let unavailableUntil = 0;

function keyOf(kind: PromptKind, name: string) {
  return `${kind}:${name}`;
}

async function loadOverrides(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;
  if (now < unavailableUntil) return cache?.map ?? new Map();

  try {
    const { data, error } = await supabaseWrite()
      .from("prompt_overrides")
      .select("kind, name, content, updated_at");

    if (error) throw error;

    const map = new Map<string, string>();
    for (const row of (data ?? []) as OverrideRow[]) {
      map.set(keyOf(row.kind, row.name), row.content);
    }
    cache = { at: now, map };
    return map;
  } catch {
    // 표가 없거나 조회에 실패해도 대화는 멈추지 않는다 — 파일 기본값으로 간다
    unavailableUntil = now + 60_000;
    return cache?.map ?? new Map();
  }
}

export function clearPromptCache() {
  cache = null;
  unavailableUntil = 0;
  fileCache.clear();
}

/** 지금 실제로 쓰이는 원문 — 고친 값이 있으면 그것, 없으면 파일 */
export async function readPrompt(kind: PromptKind, name: string): Promise<string | null> {
  const overrides = await loadOverrides();
  return overrides.get(keyOf(kind, name)) ?? (await readDefault(kind, name));
}

/** 이 문서가 고쳐진 상태인가 */
export async function isOverridden(kind: PromptKind, name: string): Promise<boolean> {
  return (await loadOverrides()).has(keyOf(kind, name));
}

export async function savePrompt(
  kind: PromptKind,
  name: string,
  content: string,
): Promise<void> {
  const { error } = await supabaseWrite()
    .from("prompt_overrides")
    .upsert({ kind, name, content }, { onConflict: "kind,name" });

  if (error) throw new Error(error.message);
  clearPromptCache();
}

/** 고친 값을 지워 공장 초기값(파일)으로 되돌린다 */
export async function resetPrompt(kind: PromptKind, name: string): Promise<void> {
  const { error } = await supabaseWrite()
    .from("prompt_overrides")
    .delete()
    .eq("kind", kind)
    .eq("name", name);

  if (error) throw new Error(error.message);
  clearPromptCache();
}

/** 언제 고쳤는지 — 목록 화면에 표시 */
export async function overriddenAt(): Promise<Record<string, string>> {
  try {
    const { data } = await supabaseWrite()
      .from("prompt_overrides")
      .select("kind, name, updated_at");

    const result: Record<string, string> = {};
    for (const row of (data ?? []) as OverrideRow[]) {
      result[keyOf(row.kind, row.name)] = row.updated_at;
    }
    return result;
  } catch {
    return {};
  }
}

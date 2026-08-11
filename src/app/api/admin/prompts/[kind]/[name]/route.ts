import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin/auth";
import { normalizeCast, serializeCast } from "@/lib/cast";
import { FLOW_FILES, stripComments } from "@/lib/flow";
import { sanitizePersona } from "@/lib/personas";
import {
  isKnownDoc,
  readDefault,
  readPrompt,
  resetPrompt,
  savePrompt,
  type PromptKind,
} from "@/lib/prompts/store";

/**
 * 글 한 편 읽기·저장·되돌리기.
 *
 * 저장은 Supabase 표에만 한다. personas/ 와 flow/ 파일은 공장 초기값으로 남으므로
 * "기본값으로 되돌리기"(DELETE)가 언제든 가능하다.
 */
export const runtime = "nodejs";

/** 너무 짧은 글로 저장하면 캐릭터가 통째로 사라진다 — 최소한의 방어 */
const MIN_LENGTH = 20;

type Params = { params: Promise<{ kind: string; name: string }> };

async function resolve(params: Params["params"]) {
  const { kind, name: raw } = await params;
  const name = decodeURIComponent(raw);
  if (!isKnownDoc(kind, name, FLOW_FILES)) return null;
  return { kind: kind as PromptKind, name };
}

/** 저장하기 전에 AI가 실제로 받게 될 모습 — 페르소나는 이미지 지시문이 걷어내진다 */
function preview(kind: PromptKind, content: string): string {
  if (kind === "config") return content;
  return kind === "persona" ? sanitizePersona(content) : stripComments(content);
}

/**
 * 설정값은 글이 아니라 JSON이다. 깨진 값이 저장되면 대화가 엉뚱한 사람에게 넘어가므로,
 * 저장 전에 프로그램이 한 번 정리한다 — 모르는 이름은 공장 초기값으로 되돌아간다.
 */
function tidyConfig(name: string, content: string): string | null {
  if (name !== "대화구조") return content;
  try {
    return serializeCast(normalizeCast(JSON.parse(content)));
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: Params) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 401 });
  }

  const doc = await resolve(params);
  if (!doc) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });

  const [current, original] = await Promise.all([
    readPrompt(doc.kind, doc.name),
    readDefault(doc.kind, doc.name),
  ]);

  return NextResponse.json({
    kind: doc.kind,
    name: doc.name,
    content: current ?? "",
    /** 파일에 들어 있는 공장 초기값 (되돌리기 전에 비교해 볼 수 있게) */
    original: original ?? "",
    edited: (current ?? "") !== (original ?? ""),
    preview: preview(doc.kind, current ?? ""),
  });
}

export async function PUT(request: Request, { params }: Params) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 고칠 수 있습니다." }, { status: 401 });
  }

  const doc = await resolve(params);
  if (!doc) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });

  let content: unknown;
  try {
    ({ content } = (await request.json()) as { content?: unknown });
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (typeof content !== "string" || content.trim().length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `내용이 너무 짧습니다. ${MIN_LENGTH}자 이상 적어 주세요.` },
      { status: 400 },
    );
  }

  /** 실제로 저장할 글 — 설정값은 프로그램이 한 번 정리한 뒤 저장한다 */
  let text = content;

  if (doc.kind === "config") {
    const tidied = tidyConfig(doc.name, content);
    if (tidied === null) {
      return NextResponse.json(
        { error: "설정 형식이 올바르지 않습니다 (JSON이어야 합니다)." },
        { status: 400 },
      );
    }
    text = tidied;
  } else if (preview(doc.kind, content).trim().length < MIN_LENGTH) {
    // 저장해도 AI에게 갈 알맹이가 비면(주석·이미지 지시문뿐) 캐릭터가 사라진다
    return NextResponse.json(
      { error: "AI에게 전달될 내용이 비어 있습니다. 주석만 남기지 말고 본문을 적어 주세요." },
      { status: 400 },
    );
  }

  try {
    await savePrompt(doc.kind, doc.name, text);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          `저장하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}. ` +
          "supabase/prompt_overrides.sql 을 Supabase에서 실행했는지 확인해 주세요.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, content: text, preview: preview(doc.kind, text) });
}

/** 공장 초기값(파일)으로 되돌리기 */
export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 고칠 수 있습니다." }, { status: 401 });
  }

  const doc = await resolve(params);
  if (!doc) return NextResponse.json({ error: "없는 글입니다." }, { status: 404 });

  try {
    await resetPrompt(doc.kind, doc.name);
  } catch (error) {
    return NextResponse.json(
      { error: `되돌리지 못했습니다: ${error instanceof Error ? error.message : "오류"}` },
      { status: 502 },
    );
  }

  const original = (await readDefault(doc.kind, doc.name)) ?? "";
  return NextResponse.json({ ok: true, content: original });
}

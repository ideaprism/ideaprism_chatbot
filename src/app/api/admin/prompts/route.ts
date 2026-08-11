import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin/auth";
import { FLOW_FILES } from "@/lib/flow";
import {
  flowDocs,
  overriddenAt,
  PERSONA_DOCS,
  type PromptDoc,
} from "@/lib/prompts/store";

/** 관리할 수 있는 글 목록 (어느 것이 고쳐졌는지 함께) */
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 401 });
  }

  const edited = await overriddenAt();
  const decorate = (docs: PromptDoc[]) =>
    docs.map((doc) => ({ ...doc, editedAt: edited[`${doc.kind}:${doc.name}`] ?? null }));

  return NextResponse.json({
    personas: decorate(PERSONA_DOCS),
    flows: decorate(flowDocs(FLOW_FILES)),
  });
}

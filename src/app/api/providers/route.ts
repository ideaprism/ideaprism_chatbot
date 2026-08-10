import { NextResponse } from "next/server";

import { availableProviders } from "@/lib/ai/provider";

/**
 * 화면이 "어떤 모델을 고를 수 있는지" 물어보는 창구.
 * 키 값은 절대 내보내지 않고, 키가 있는지 여부와 모델 이름만 알려 준다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: availableProviders() });
}

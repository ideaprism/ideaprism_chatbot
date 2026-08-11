/**
 * 학생 입장코드 — 아무나 대화를 시작하지 못하게 하는 잠금.
 *
 * **왜 있는가.** 사이트가 인증 없이 열려 있으면 주소를 아는 사람은 누구나 대화할 수 있고,
 * **AI 비용이 대표님 계정에서 나간다.** 프로토타입을 정해진 분들에게만 보여 드리기 위한
 * 최소한의 문이다. (개인정보를 받지 않는다는 원칙은 그대로 — 코드 하나뿐이다)
 *
 * **어디까지 막는가.** 랜딩페이지의 소개는 누구나 본다(대표님 결정).
 * 막는 것은 **대화를 시작하는 것**이다 — `/chat` 화면과 돈이 나가는 API.
 *
 * 관리자 잠금(`admin/auth.ts`)과 같은 기계를 쓴다. 코드가 맞으면 서명된 쪽지(쿠키)를
 * 주고, 쿠키에는 코드 자체를 담지 않는다. 쿠키를 들여다봐도 코드를 알 수 없다.
 *
 * **코드는 관리자 페이지에서 바꾼다** (`prompt_overrides` 표의 config/입장코드).
 * 저장된 값이 없으면 코드에 든 기본값을 쓰므로, DB가 없어도 문이 작동한다.
 *
 * ⚠️ **코드를 바꾸면 지금 들어와 있는 사람도 다시 넣어야 한다.** 쪽지를 그 코드로
 * 서명하기 때문이다. 대화 내용은 브라우저에 남아 있으므로 다시 넣고 「이어서 하기」를
 * 누르면 그대로 이어진다.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { validateEntryCode } from "./rules";
import { isAdmin } from "@/lib/admin/auth";
import {
  DEFAULT_ENTRY_CODE,
  ENTRY_CODE_NAME,
  readPrompt,
  savePrompt,
} from "@/lib/prompts/store";

export { ENTRY_CODE_MAX, ENTRY_CODE_MIN } from "./rules";

export const ENTRY_COOKIE = "ideaprism_entry";

/** 쪽지 유효 기간 — 한 달. 시연 도중에 쫓겨나지 않을 만큼은 길게 */
const TICKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ENTRY_TICKET_MAX_AGE_SECONDS = TICKET_TTL_MS / 1000;

/**
 * 지금 쓰이는 입장코드.
 * 관리자에서 바꾼 값이 있으면 그것, 없으면 코드에 든 기본값.
 */
export async function entryCode(): Promise<string> {
  const stored = (await readPrompt("config", ENTRY_CODE_NAME))?.trim();
  return stored && stored.length > 0 ? stored : DEFAULT_ENTRY_CODE;
}

/** 기본값 그대로인가 — 관리자 화면에서 "아직 안 바꾸셨어요"를 알리는 데 쓴다 */
export async function isDefaultEntryCode(): Promise<boolean> {
  return (await entryCode()) === DEFAULT_ENTRY_CODE;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** 같은 길이가 아니어도 안전하게 비교한다 (한 글자씩 맞춰 보는 공격 방지) */
function sameSecret(candidate: string, expected: string): boolean {
  const a = createHmac("sha256", "compare").update(candidate).digest();
  const b = createHmac("sha256", "compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** 코드가 맞으면 줄 쪽지 — "언제까지 유효한가" + 그 서명 */
export async function issueEntryTicket(): Promise<string> {
  const expires = String(Date.now() + TICKET_TTL_MS);
  return `${expires}.${sign(expires, await entryCode())}`;
}

async function verifyEntryTicket(ticket: string | undefined): Promise<boolean> {
  if (!ticket) return false;

  const [expires, signature] = ticket.split(".");
  if (!expires || !signature) return false;

  const expected = sign(expires, await entryCode());
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  return Number(expires) > Date.now();
}

/** 학생이 넣은 코드가 맞는가 */
export async function checkEntryCode(input: unknown): Promise<boolean> {
  if (typeof input !== "string") return false;
  const candidate = input.trim();
  if (candidate.length === 0) return false;
  return sameSecret(candidate, await entryCode());
}

/**
 * 이 요청이 들어와도 되는 사람인가.
 * 관리자는 코드 없이 통과한다 — 관리자 페이지의 「학생 화면 보기」가 막히면 곤란하다.
 */
export async function hasEntered(): Promise<boolean> {
  const jar = await cookies();
  if (await verifyEntryTicket(jar.get(ENTRY_COOKIE)?.value)) return true;
  return isAdmin();
}

/** 새 코드로 바꾼다. 형식이 안 맞으면 무엇이 잘못됐는지 돌려준다 */
export async function setEntryCode(input: unknown): Promise<{ error: string } | null> {
  const checked = validateEntryCode(input);
  if (!checked.ok) return { error: checked.error };

  await savePrompt("config", ENTRY_CODE_NAME, checked.code);
  return null;
}

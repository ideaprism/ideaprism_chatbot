/**
 * 관리자 페이지 잠금.
 *
 * 프롬프트는 이 서비스의 두뇌다. 아무나 고치면 캐릭터가 딴 사람이 되거나
 * 안전장치가 풀릴 수 있으므로, 관리자 페이지는 접근 코드로 잠근다.
 *
 * 코드는 `ADMIN_PASSWORD` 환경변수에 둔다 (대표님이 직접 정해 넣는 값).
 * **환경변수가 없으면 관리자 페이지 자체가 열리지 않는다** — 실수로 잠금 없이
 * 배포되는 일을 막기 위해서다. 열어 두는 쪽이 아니라 잠그는 쪽이 기본값이다.
 *
 * 로그인하면 서명된 쪽지(쿠키)를 준다. 코드 자체를 쿠키에 담지 않으므로,
 * 쿠키를 들여다봐도 코드를 알 수 없고, 서명이 맞지 않으면 통과하지 못한다.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ideaprism_admin";

/** 쪽지 유효 기간 — 하루 지나면 다시 코드를 넣는다 */
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

/** 관리자 페이지를 쓸 수 있는 상태인가 (코드가 설정돼 있는가) */
export function adminConfigured(): boolean {
  return secret() !== null;
}

/** 같은 길이가 아니어도 안전하게 비교한다 (한 글자씩 맞춰 보는 공격 방지) */
function sameSecret(candidate: string, expected: string): boolean {
  const a = createHmac("sha256", "compare").update(candidate).digest();
  const b = createHmac("sha256", "compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** 로그인 성공 시 줄 쪽지 — "언제까지 유효한가" + 그 서명 */
export function issueTicket(): string | null {
  const key = secret();
  if (!key) return null;
  const expires = String(Date.now() + TICKET_TTL_MS);
  return `${expires}.${sign(expires, key)}`;
}

export function verifyTicket(ticket: string | undefined): boolean {
  const key = secret();
  if (!key || !ticket) return false;

  const [expires, signature] = ticket.split(".");
  if (!expires || !signature) return false;

  const expected = sign(expires, key);
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  return Number(expires) > Date.now();
}

/** 입력한 코드가 맞는가 */
export function checkPassword(input: unknown): boolean {
  const key = secret();
  if (!key || typeof input !== "string" || input.length === 0) return false;
  return sameSecret(input, key);
}

/** 지금 요청이 관리자인가 (쿠키를 본다) */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyTicket(jar.get(ADMIN_COOKIE)?.value);
}

export const TICKET_MAX_AGE_SECONDS = TICKET_TTL_MS / 1000;

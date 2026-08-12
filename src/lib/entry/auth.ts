/**
 * 학생 입장코드 — 아무나 대화를 시작하지 못하게 하는 문이자, **교실의 문패**.
 *
 * **왜 있는가.** 사이트가 인증 없이 열려 있으면 주소를 아는 사람은 누구나 대화할 수 있고,
 * **AI 비용이 대표님 계정에서 나간다.** 프로토타입을 정해진 분들에게만 보여 드리기 위한
 * 최소한의 문이다. (개인정보를 받지 않는다는 원칙은 그대로 — 코드 하나뿐이다)
 *
 * **코드 하나가 교실 하나다** (대표님 결정). 학생이 넣은 코드가 곧 어느 반인지를 정하고,
 * 그 반의 선생님이 3.0에서 그 학생들의 노트를 본다. 학생이 할 일은 늘지 않는다 —
 * 코드 하나 넣는 것은 그대로다.
 *
 * **어디까지 막는가.** 랜딩페이지의 소개는 누구나 본다.
 * 막는 것은 **대화를 시작하는 것**이다 — `/chat` 화면과 돈이 나가는 API.
 *
 * 관리자 잠금(`admin/auth.ts`)과 같은 기계를 쓴다. 코드가 맞으면 서명된 쪽지(쿠키)를
 * 주고, 쿠키에는 코드 자체를 담지 않는다.
 *
 * ⚠️ **교실 코드를 바꾸면 그 반 학생은 다시 넣어야 한다.** 쪽지를 그 교실의 코드로
 * 서명하기 때문이다. 대화 내용은 브라우저에 남아 있으므로 다시 넣고 「이어서 하기」를
 * 누르면 그대로 이어진다.
 *
 * ## 교실 표가 아직 없을 때
 *
 * `supabase/classrooms.sql` 을 실행하기 전에도 **문은 작동해야 한다.**
 * 그래서 교실을 못 읽으면 교실이 생기기 전의 방식(`config/입장코드` 한 개,
 * 없으면 코드에 든 기본값)으로 조용히 되돌아간다. 그때 노트에는 교실이 안 남는다.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { validateEntryCode } from "./rules";
import { isAdmin } from "@/lib/admin/auth";
import { classroomById, classroomByCode, listClassrooms } from "@/lib/classroom/store";
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
 * 교실이 생기기 전에 쓰던 코드 하나.
 * 교실 표를 못 읽을 때만 쓰인다.
 */
export async function legacyEntryCode(): Promise<string> {
  const stored = (await readPrompt("config", ENTRY_CODE_NAME))?.trim();
  return stored && stored.length > 0 ? stored : DEFAULT_ENTRY_CODE;
}

/** 기본값 그대로인가 — 관리자 화면에서 "아직 안 바꾸셨어요"를 알리는 데 쓴다 */
export async function isDefaultEntryCode(): Promise<boolean> {
  return (await legacyEntryCode()) === DEFAULT_ENTRY_CODE;
}

/** 새 코드로 바꾼다 (교실이 없던 시절의 코드). 형식이 안 맞으면 무엇이 잘못됐는지 돌려준다 */
export async function setEntryCode(input: unknown): Promise<{ error: string } | null> {
  const checked = validateEntryCode(input);
  if (!checked.ok) return { error: checked.error };

  await savePrompt("config", ENTRY_CODE_NAME, checked.code);
  return null;
}

// ── 쪽지 ────────────────────────────────────────────────────

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** 같은 길이가 아니어도 안전하게 비교한다 (한 글자씩 맞춰 보는 공격 방지) */
function sameSecret(candidate: string, expected: string): boolean {
  const a = createHmac("sha256", "compare").update(candidate).digest();
  const b = createHmac("sha256", "compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

function sameSignature(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/**
 * 학생이 넣은 코드를 확인한다.
 *
 * 맞으면 어느 교실인지 함께 돌려준다. 교실 표가 없던 시절 방식으로 통과한 경우
 * `classroomId` 는 null 이다 (노트에 교실이 안 남는다).
 */
export async function checkEntryCode(
  input: unknown,
): Promise<{ ok: false } | { ok: true; classroomId: string | null }> {
  if (typeof input !== "string") return { ok: false };
  const candidate = input.trim();
  if (candidate.length === 0) return { ok: false };

  const found = await classroomByCode(candidate);
  if (found.ready && found.value) return { ok: true, classroomId: found.value.id };

  /**
   * 옛 방식(코드 하나)으로 되돌아가도 되는 때는 둘뿐이다.
   *   · 교실 표를 못 읽었다 — 아직 안 만들었거나 조회에 실패했다
   *   · 표는 있는데 **쓸 수 있는 교실이 하나도 없다** — 다 지웠거나 다 꺼 두었다
   *
   * 둘 다 "교실이라는 개념이 아직 없는 상태"다. 이때까지 문을 잠가 버리면
   * **아무도 못 들어온다.** 교실이 하나라도 생기는 순간 이 길은 저절로 닫힌다.
   */
  const rooms = await listClassrooms();
  const noneYet = !rooms.ready || !rooms.value.some((room) => room.active);
  if (!noneYet) return { ok: false };

  return sameSecret(candidate, await legacyEntryCode())
    ? { ok: true, classroomId: null }
    : { ok: false };
}

/**
 * 쪽지를 만든다.
 *   교실이 있으면  `교실id.만료.서명`  (그 교실의 코드로 서명)
 *   없으면         `만료.서명`         (옛 코드로 서명)
 */
export async function issueEntryTicket(classroomId: string | null): Promise<string> {
  const expires = String(Date.now() + TICKET_TTL_MS);

  if (classroomId) {
    const room = await classroomById(classroomId);
    if (room.ready && room.value) {
      return `${classroomId}.${expires}.${sign(`${classroomId}.${expires}`, room.value.code)}`;
    }
  }

  return `${expires}.${sign(expires, await legacyEntryCode())}`;
}

/** 쪽지를 확인한다. 통과하면 어느 교실인지 돌려준다 */
async function readTicket(
  ticket: string | undefined,
): Promise<{ ok: false } | { ok: true; classroomId: string | null }> {
  if (!ticket) return { ok: false };

  const parts = ticket.split(".");

  // 교실 쪽지 — 그 교실의 코드로 서명을 확인한다
  if (parts.length === 3) {
    const [classroomId, expires, signature] = parts;
    if (Number(expires) <= Date.now()) return { ok: false };

    const room = await classroomById(classroomId);
    // 표를 못 읽으면 통과시키지 않는다 — 교실을 확인할 방법이 없다
    if (!room.ready || !room.value) return { ok: false };

    const expected = sign(`${classroomId}.${expires}`, room.value.code);
    return sameSignature(signature, expected) ? { ok: true, classroomId } : { ok: false };
  }

  // 옛 쪽지 (교실이 생기기 전에 받은 것) — 그대로 인정한다
  if (parts.length === 2) {
    const [expires, signature] = parts;
    if (Number(expires) <= Date.now()) return { ok: false };

    const expected = sign(expires, await legacyEntryCode());
    return sameSignature(signature, expected) ? { ok: true, classroomId: null } : { ok: false };
  }

  return { ok: false };
}

/**
 * 이 요청이 들어와도 되는 사람인가.
 * 관리자는 코드 없이 통과한다 — 관리자 페이지의 「학생 화면 보기」가 막히면 곤란하다.
 */
export async function hasEntered(): Promise<boolean> {
  const jar = await cookies();
  if ((await readTicket(jar.get(ENTRY_COOKIE)?.value)).ok) return true;
  return isAdmin();
}

/**
 * 지금 이 학생이 어느 교실인가 (노트에 남길 값).
 *
 * **쿠키에서 읽는다 — 브라우저가 보낸 세션 값을 믿지 않는다.**
 * 서버가 서명한 쪽지만이 "이 학생이 그 코드를 실제로 넣었다"는 증거다.
 * 관리자가 구경하는 중이거나 옛 쪽지면 null (교실 없는 노트가 된다).
 */
export async function enteredClassroomId(): Promise<string | null> {
  const jar = await cookies();
  const ticket = await readTicket(jar.get(ENTRY_COOKIE)?.value);
  return ticket.ok ? ticket.classroomId : null;
}

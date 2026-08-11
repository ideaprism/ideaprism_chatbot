/**
 * 캐릭터 대본 읽기.
 *
 * 원문은 두 곳에 있을 수 있다 — personas/ 파일(공장 초기값)과, 관리자 페이지에서
 * 고친 값(Supabase). 어느 쪽을 쓸지는 store 가 정한다.
 * 여기서는 읽어 온 글에서 이미지 지시문만 걷어내 넘긴다(아키텍처 원칙 3).
 */

import "server-only";

import { CHARACTERS, type CharacterId } from "@/lib/characters";
import { sanitizePersona } from "@/lib/personas";
import { readPrompt } from "./store";

export async function loadPersona(id: CharacterId): Promise<string> {
  const raw = await readPrompt("persona", id);
  if (!raw) {
    throw new Error(
      `${CHARACTERS[id].name}의 대본을 읽지 못했습니다 (personas/${CHARACTERS[id].personaFile}).`,
    );
  }
  return sanitizePersona(raw);
}

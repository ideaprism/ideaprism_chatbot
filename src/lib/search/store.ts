/**
 * 검색 결과 서버 캐시.
 *
 * 화면에 보이는 500건은 브라우저 메모리에 있지만, AI에게 답할 통계도 계산해야 하므로
 * 서버도 같은 결과셋을 잠시 들고 있는다. 프로토타입이라 프로세스 메모리면 충분하다.
 *
 * 캐시가 비어 있으면(서버 재시작·인스턴스 교체) 같은 검색어로 조용히 다시 가져온다.
 * 그래서 캐시가 날아가도 학생 대화는 끊기지 않는다.
 */

import "server-only";

import type { InventionRow, LookupItem } from "@/types/search";

interface CachedSearch {
  keyword: string;
  rows: InventionRow[];
  grades: LookupItem[];
  categories: LookupItem[];
  at: number;
}

const TTL_MS = 60 * 60 * 1000; // 1시간
const MAX_SESSIONS = 200;

const cache = new Map<string, CachedSearch>();

function evictStale(now: number) {
  for (const [key, value] of cache) {
    if (now - value.at > TTL_MS) cache.delete(key);
  }
  // 그래도 넘치면 가장 오래된 것부터 버린다
  while (cache.size > MAX_SESSIONS) {
    const oldest = [...cache.entries()].sort(([, a], [, b]) => a.at - b.at)[0];
    if (!oldest) break;
    cache.delete(oldest[0]);
  }
}

export function putSearch(sessionId: string, value: Omit<CachedSearch, "at">) {
  const now = Date.now();
  cache.set(sessionId, { ...value, at: now });
  evictStale(now);
}

export function getSearch(sessionId: string, keyword: string): CachedSearch | null {
  const hit = cache.get(sessionId);
  if (!hit) return null;
  if (hit.keyword !== keyword) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(sessionId);
    return null;
  }
  return hit;
}

export function dropSearch(sessionId: string) {
  cache.delete(sessionId);
}

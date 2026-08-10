/** KIPRIS(특허청) 조회 관련 타입 */

/** 특허 1건 */
export interface Patent {
  indexNo: number;
  inventionTitle: string;
  applicationNumber: string;
  applicationDate: string;
  registerNumber?: string;
  registerStatus: string;
  ipcNumber: string;
  applicantName: string;
  abstract: string;
  drawing?: string;
}

/**
 * 검색식을 만드는 재료 — 1.0의 OPSME 분류를 그대로 쓴다.
 * O(발명 대상) P(문제) S(해결 수단) M(방법·원리) E(효과)
 */
export interface QueryParts {
  object: string[];
  problem?: string[];
  solution?: string[];
  method?: string[];
  effect?: string[];
  /** IPC 분류 코드 (선택) */
  ipc?: string;
}

/** 세션에 실어 나르는 특허 조회 요약 (특허 목록 원본은 여기 넣지 않는다) */
export interface PatentSnapshot {
  query: string;
  totalCount: number;
  loadedCount: number;
}

export interface KiprisResult {
  patents: Patent[];
  totalCount: number;
}

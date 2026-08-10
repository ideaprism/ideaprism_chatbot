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
  /**
   * 검색식을 만든 재료 — 꺼 둔 갈래의 낱말까지 모두. 특허 패널의 OPSME 5칸을
   * 이 값으로 채운다. 검색식 문자열만 들고 있으면 학생이 "대상"과 "문제"를
   * 따로 고칠 수가 없다.
   */
  parts?: QueryParts;
  /**
   * 그중 실제로 검색식에 들어간 갈래. 나머지 낱말은 화면에 남아 있되 꺼져 있다 —
   * 다섯을 다 곱하면 0건이 되는 일이 잦아서다 (formula.ts 의 DEFAULT_GROUPS).
   */
  activeGroups?: string[];
  /** 지금 보고 있는 쪽 번호 (1부터) */
  page?: number;
}

export interface KiprisResult {
  patents: Patent[];
  totalCount: number;
  page: number;
}

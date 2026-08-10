/** 검색 관련 타입 — 1.0의 inventions 스키마를 그대로 따른다 */

/**
 * 발명 1건 (검색 결과 행).
 * 1.0의 검색 API가 싣는 컬럼과 같은 묶음이다 — 상세보기를 1.0과 똑같이 그리려면
 * 목록 단계에서 이 값들이 이미 손에 있어야 카드를 눌렀을 때 기다림이 없다.
 */
export interface InventionRow {
  id: string;
  grade_id: number | null;
  category_id: number | null;
  original_title: string | null;
  simple_title: string | null;
  simple_summary: string | null;
  detailed_summary: string | null;
  drawing_url: string | null;
  problem: string | null;
  solution: string | null;
  problem_tag: string | null;
  scamper: string | null;
  sdg: string | null;
  /** 발명 동기 — 상세보기 '상세 설명' 탭 */
  invention_motive: string | null;
  /** 어떻게 더 개선해 볼 수 있을까 — 상세보기 '상세 설명' 탭 */
  next_step: string | null;
  /** 관련 교과 */
  curriculum: string | null;
  /** IPC 분류 코드 — 특허 검색식의 재료 */
  ipc: string | null;
}

export interface LookupItem {
  id: number;
  name: string;
}

/** 필터는 "이름"으로 다룬다 — AI가 '초등부', '결합' 처럼 사람 말로 지시하기 때문 */
export interface SearchFilters {
  grades: string[];
  problemTags: string[];
  scamper: string[];
}

export const EMPTY_FILTERS: SearchFilters = { grades: [], problemTags: [], scamper: [] };

/** 분포 집계 (이름 → 건수) */
export interface FacetCounts {
  grades: Record<string, number>;
  problemTags: Record<string, number>;
  scamper: Record<string, number>;
}

/**
 * 세션에 실어 나르는 검색 요약 (행 데이터는 여기 넣지 않는다).
 * 500건 원본은 서버 캐시와 브라우저 메모리에 각각 있고,
 * 이 요약만 채팅 요청마다 오간다.
 */
export interface SearchSnapshot {
  keyword: string;
  /** 조건에 맞는 전체 건수 (별도 조회) */
  totalCount: number;
  /** 실제로 적재한 건수 (최대 500) */
  loadedCount: number;
  filters: SearchFilters;
  /** 이번 결과셋에 등장하는 값들 — AI는 여기 있는 값으로만 필터를 건다 */
  availableGrades: string[];
  availableProblemTags: string[];
  availableScamper: string[];
  /** 상세 카드로 크게 띄운 발명 */
  focusedId: string | null;
}

/** 검색 실행 결과 (서버 내부용) */
export interface SearchResult {
  rows: InventionRow[];
  totalCount: number;
  grades: LookupItem[];
  categories: LookupItem[];
}

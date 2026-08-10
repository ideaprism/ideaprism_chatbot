# 인수인계 — 다음 세션에서 이어서 할 일

**작성: 2026-08-11** · 이 문서는 새 대화창에서 작업을 이어받기 위한 것이다.
먼저 [CLAUDE.md](CLAUDE.md) → [PRD.md](PRD.md) → 이 문서 순으로 읽으면 된다.

---

## 다음 할 일 (대표님 요청)

> "우측 화면을 수정할거야. **최대한 ideaprism처럼** 수정해줘.
> 챗봇은 곧 ideaprism을 쉽게 이용하게 해주는 목적도 있는거야.
>
> 1. 발명 카드가 **리스트보기 / 카드보기 선택**이 되야하고 기본은 화면에 따라 **2~4열**
> 2. 발명을 클릭했을 때 **상세보기도 ideaprism 그대로**
> 3. **특허검색도 ideaprism 그대로**"

즉 **우측 패널을 1.0의 검색 화면에 최대한 가깝게** 다시 만드는 일이다.
챗봇이 "1.0을 쉽게 쓰게 해주는 입구"라는 관점이므로, 학생이 챗봇에서 본 화면과
1.0에서 보던 화면이 따로 놀면 안 된다.

### 1.0 참고 코드 (운영 중 — 읽기만, 절대 수정 금지)

기준 경로: `C:\Users\user\Documents\클맥_ideaprism`

| 무엇 | 파일 | 줄 수 |
|---|---|---|
| **갤러리 (그리드/리스트 전환)** | `src/components/features/SearchResultGallery.tsx` | 39 |
| **발명 카드** | `src/components/features/InventionCard.tsx` | — |
| **발명 상세 모달** | `src/components/features/InventionDetailModal.tsx` | 360 |
| **필터 패널** | `src/components/features/FacetFilterPanel.tsx`, `FilterPanel.tsx` | — |
| **검색 페이지 전체** | `src/components/features/ClientSearchPage.tsx` | 297 |
| **특허 검색 화면** | `src/components/patent/PatentSearchView.tsx` | 831 |
| **특허+발명 통합 모달** | `src/app/test/kipris-search/IntegratedInventionModal.tsx` | 846 |
| 상세 페이지(라우트) | `src/app/inventions/[id]/page.tsx` | 154 |

**이미 확인한 핵심 사실 — 다시 조사할 필요 없음:**

```tsx
// SearchResultGallery.tsx — 대표님이 말씀하신 "2~4열"이 여기 그대로 있다
viewMode === 'list'
  ? "flex flex-col gap-4"
  : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8"
```

카드를 누르면 `InventionDetailModal` 이 열린다. 2.0도 같은 구조로 가면 된다.

### 2.0에서 고칠 파일

| 파일 | 지금 상태 |
|---|---|
| `src/components/search/SearchPanel.tsx` | 자체 제작. 통계 머리말 + 필터 칩 + 세로 카드 목록 + 인라인 상세 |
| `src/components/search/InventionCard.tsx` | 자체 제작. 가로형 작은 카드 1종뿐 |
| `src/components/patent/PatentPanel.tsx` | 자체 제작. 검색식 입력 + 결과 카드 |

셋 다 1.0을 참고하지 않고 처음부터 만든 것이라, 이번에 1.0 쪽으로 맞춰야 한다.

### 작업할 때 지킬 것

- **우측 패널 폭이 화면의 약 64%** 다 (`WorkspaceShell.tsx`, 채팅이 36%).
  1.0은 전체 화면이라 그대로 옮기면 좁다. 2~4열은 **패널 폭 기준**으로 잡아야 한다
  (`@container` 쿼리를 쓰거나 열 수를 한 단계씩 낮추는 식).
- 필터 클릭은 **서버 왕복 없이** 즉시 반영돼야 한다 (PRD 8장, 체감 0.1초).
  지금 `facets.ts`의 순수 함수로 메모리에서 계산 중 — 이 구조는 유지할 것.
- 필터를 바꾸면 세션에 실려 **다음 턴에 AI도 같은 화면을 본다** (PRD S-4 양방향 동기화).
  `useChat.toggleFilter` 참고.
- 카드 500장을 한 번에 그리면 버벅인다. 지금 30장씩 "더 보기" 방식.
- 발명 이미지(`drawing_url`)는 주소가 제각각이라 `next/image` 최적화 없이 `<img>` 로 띄운다.

---

## 지금까지 만들어진 것

### 진행 상태

| 단계 | 내용 | 상태 |
|---|---|---|
| P0 | Next.js 골격, AI 스트리밍, 캐릭터 3명, 퀘스트 엔진 | ✅ |
| P1 | 2패널 UI, 검색 도구 4종, 500건 적재 + 즉시 필터 | ✅ |
| P2 | 배턴터치 자동 이어달리기 | ✅ |
| P3 | 발명노트 Supabase 저장, 노트 패널, 인쇄 | ✅ |
| P4 | KIPRIS 검색식 생성 + 조회, 특허 패널 | ✅ |
| P5 | 주제 이탈 환기, 대화 압축, 비용 가드, 단계별 사용량 | ✅ |
| 추가 | 모델 3사 비교 (Claude·OpenAI·Gemini) | ✅ |
| 추가 | 대화 흐름 지침을 `flow/` 폴더로 분리 | ✅ |

### 실제 API로 검증된 것 / 안 된 것

- ✅ **OpenAI(`gpt-5.4-mini`)로 전 구간** — 스트리밍, 감정 태그, 검색(216건),
  필터(초등학교 123건), KIPRIS(2,874건), 퀘스트 승급, 배턴터치, 노트 저장
- ✅ **Gemini(`gemini-3.6-flash`)** — 검색까지
- ⚠️ **Claude 미검증** — `ANTHROPIC_API_KEY` 가 아직 비어 있음 (`sk-ant-` 로 시작하는 키 필요)
- ⚠️ **브라우저에서 사람이 여러 턴 이어서 대화한 완주 테스트는 아직** (PRD 1장 성공 기준)

### 폴더 구조 요약

```
personas/     캐릭터 대본 — "어떻게 말하는가"    (대표님이 고침)
flow/         대화 흐름 지침 — "어떻게 흘러가는가" (대표님이 고침, 9개 파일)
supabase/     invention_notes DDL (이미 적용됨)
tests/        회귀 테스트 60개
src/lib/
  ai/         types·config·provider + adapters/{claude,openai,gemini}
  quest.ts    퀘스트 상태기계 + 승급 검증   ← 단계 판정은 여기만
  tools.ts    도구 8종 명세 (중립 형식)
  tool-handlers.ts  도구 실행기 (서버)
  prompt.ts   프롬프트 조립 + 표식 파서 + 대화 압축
  flow.ts     flow/*.md 로더 (없으면 코드 기본값)
  search/     검색어 파서 · Supabase 조회 · 필터/통계(순수 함수)
  kipris/     검색식 생성 · 특허청 조회
  notes/      발명노트 계산 · 저장
```

---

## 절대 깨뜨리면 안 되는 것 (PRD 아키텍처 원칙)

1. **AI는 도구 8종만 누른다.** 미구현 도구는 AI에게 전달조차 하지 않는다 (`tools.ts`).
2. **단계 판정은 코드가 한다.** `complete_stage` + `quest.ts` 검증을 통과해야만 승급.
   AI가 "다음 단계 가자"고 선언해도 안 올라간다. **이 판정을 `flow/` 파일로 빼지 말 것.**
3. **감정은 이름만.** AI는 `[감정:이름]` 표식만 쓰고 이미지 주소 조립은 `characters.ts`.
   페르소나 원본의 `<img>` 지시문은 로딩 시 자동 제거된다.
4. **숫자는 프로그램이 센다.** 검색 건수·통계·특허 건수는 코드가 세어 AI에게 넘긴다.
   AI가 목록에 없는 값을 지어내면 조용히 버리고 무엇을 버렸는지 알려 준다.
5. **대화 도중 모델 회사 교체 금지.** 바꾸면 새 대화로 시작한다.
6. **개인정보 미수집.** 별명만 받는다.

### 세 회사가 공통으로 요구하는 것 (놓치기 쉬움)

도구를 호출한 모델 턴을 되돌려 줄 때, **회사마다 이름만 다른 "생각 흔적"을 그대로
살려야 한다.** 안 그러면 다음 턴이 400으로 막힌다. 지금은 `AiMessage.raw` 에
원본을 담아 두는 방식으로 세 곳 모두 해결돼 있다.

| 회사 | 살려야 하는 것 |
|---|---|
| Claude | thinking 블록 |
| OpenAI | reasoning 항목 (그래서 Chat Completions 대신 **Responses API**) |
| Gemini | `thoughtSignature` |

---

## 개발 환경 메모

- **PowerShell 실행 정책 때문에 `npm run dev` 가 막힌다.** `npm.cmd run dev` 를 쓰거나
  대표님이 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 를 직접 실행해야 한다.
- 환경변수를 고치면 **개발 서버를 껐다 켜야** 반영된다.
- 한글이 든 요청을 `curl -d '...'` 로 인라인 전달하면 **인코딩이 깨진다.**
  파일로 쓴 뒤 `--data-binary @파일` 로 보낼 것.
- 점검: http://localhost:3000/api/health — 키 값은 안 보이고 준비 여부만 나온다.
- 명령: `npm run dev` / `npm test` (60개) / `npm run typecheck` / `npm run lint` / `npm run build`

## 대표님과 일하는 방식

- 호칭은 **"대표님"**. 비개발자이므로 기술은 비유로 설명한다.
- 각 단계 완료 시 브리핑 → 승인 후 다음 단계.
- **로컬 커밋은 자유, push·배포는 반드시 승인 후.** 지금까지 커밋 12개, push 이력 없음.
- 검증한 것과 못 한 것을 반드시 나눠서 정직하게 보고한다.
- 키 값은 AI가 다루지 않는다 (대표님이 직접 입력). 부득이하면 값을 화면에 출력하지 않는
  방식으로 처리하고 먼저 여쭙는다.

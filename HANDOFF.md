# 인수인계 — 다음 세션에서 이어서 할 일

**작성: 2026-08-11** · 이 문서는 새 대화창에서 작업을 이어받기 위한 것이다.
먼저 [CLAUDE.md](CLAUDE.md) → [PRD.md](PRD.md) → 이 문서 순으로 읽으면 된다.

---

## 다음 할 일

대표님 확인 대기 중. 아래 "방금 끝난 일"을 브라우저에서 직접 만져 보시고
어색한 곳을 알려 주시면 이어서 손본다.

미리 알아 둘 만한 것:

- **Claude 미검증** — `ANTHROPIC_API_KEY` 가 아직 비어 있다 (`sk-ant-` 로 시작하는 키 필요).
  OpenAI·Gemini는 실제 API로 확인됨.
- **사람이 여러 턴 이어서 0→5단계 완주하는 테스트는 아직** (PRD 1장 성공 기준).
- **검색 결과 500건은 새로고침하면 사라진다** — 브라우저 메모리에만 두기 때문
  (세션 요약만 sessionStorage). 새로고침 후 검색 패널이 안 열리면 이 때문이다.
  고치려면 결과를 다시 받아 오는 길을 만들어야 한다 (지금은 의도된 동작).
- **검색어가 너무 넓으면 조회가 시간 초과된다.** 실측으로 `우산` 한 낱말은
  14,461건을 훑다가 초과했다(`우산 보관`·`빗물`은 정상). AI가 학생에게 좁혀
  보자고 안내하도록 되어 있지만, 자주 걸리면 검색 쪽을 손볼 여지가 있다.

---

## 방금 끝난 일 (2026-08-11) — 우측 패널을 1.0에 맞춤

대표님 요청:

> "우측 화면을 수정할거야. **최대한 ideaprism처럼** 수정해줘.
> 챗봇은 곧 ideaprism을 쉽게 이용하게 해주는 목적도 있는거야.
> 1. 발명 카드가 **리스트보기 / 카드보기 선택** … 기본은 화면에 따라 **2~4열**
> 2. 발명을 클릭했을 때 **상세보기도 ideaprism 그대로**
> 3. **특허검색도 ideaprism 그대로**"

셋 다 1.0 코드를 이식해 다시 만들었다. 커밋 `07c4d3c`, 이어서 대표님 지적 두 건
(모달이 대화창을 가림 / 갈래를 다 쓰면 0건)을 반영한 것이 `ab1d3fb`.

| 요청 | 2.0 파일 | 1.0 원본 |
|---|---|---|
| 갤러리 + 카드 | `search/SearchPanel.tsx`, `search/InventionCard.tsx` | `SearchResultGallery.tsx`, `InventionCard.tsx` |
| 상세보기 | `search/InventionDetailModal.tsx` (신규) | `InventionDetailModal.tsx` |
| 특허검색 | `patent/PatentPanel.tsx`, `patent/PatentCard.tsx` (신규) | `patent/PatentSearchView.tsx` |
| 태그 색·아이콘 | `lib/tag-styles.ts` (신규) | `utils/tag-styles.ts` |
| OPSME 해석 | `lib/kipris/opsme.ts` (신규) | `utils/opsme-keywords.ts` |

### 이 작업에서 굳힌 결정 (다시 고민하지 말 것)

- **열 수는 `@container` 로 패널 폭 기준.** 화면 기준(`md:` `lg:`)으로 잡으면
  채팅이 36%를 쓰기 때문에 넓은 모니터에서도 카드가 짓눌린다.
  실측: 1440 화면 → 패널 921px → **4열**, 1024 화면 → 655px → **3열**, 그 아래 2열.
- **상세보기에 필요한 컬럼을 검색 결과에 함께 싣는다** (`invention_motive`,
  `next_step`, `curriculum`, `ipc`). 1.0의 검색 API가 이미 500건에 같은 묶음을
  싣고 있어 검증된 범위다. 덕분에 카드를 눌러도 서버를 다시 부르지 않는다.
- **상세 모달은 화면 전체가 아니라 우측 패널 안에만 얹힌다.** 왼쪽이 대화창이라
  화면을 덮으면 학생이 읽던 말풍선이 가려진다. `SearchPanel` 의 `relative` 상자
  기준 `absolute inset-0`. 모달 안쪽 배치도 화면 폭이 아니라 상자 폭(`@container`)
  기준이라, 패널이 좁으면 도면이 위로 올라가 쌓인다.
- **특허 5칸(OPSME)은 세션에 `parts`(낱말 전부) + `activeGroups`(켠 갈래)로 실린다.**
  검색식 문자열만 들고 있으면 학생이 갈래별로 고칠 수가 없다. 검색식 문법은
  여전히 `buildKiprisQuery` 한 곳에서만 만든다 (아키텍처 원칙 1).
- **검색식에 처음 넣는 갈래는 대상(O)·해결수단(S) 둘뿐** — 1.0과 같은 기준.
  규칙은 `formula.ts` 의 `DEFAULT_GROUPS` 한 곳에 있고 서버와 화면이 같이 쓴다.
  갈래끼리는 *(그리고)로 이어지므로 다섯을 다 곱하면 0건이 되는 일이 잦다.
  IPC는 갈래가 아니라 늘 붙으므로, 화면의 검색식은 보통 세 토막이 된다
  (예: `IPC=[B05B]*분무기*흡입관` = 134건).
  **AI가 고른 나머지 낱말은 버리지 않는다.** 5칸에 꺼진 채로 남아 학생이 켜면
  즉시 좁혀진다. 남겨 둔 낱말은 도구 결과로 AI에게도 알려 준다 —
  안 알려 주면 AI가 자기 낱말이 사라진 줄 알고 검색식을 다시 만들려 든다.
- **특허 패널은 "새 재료가 왔을 때만" 다시 세운다** (`useChat` 의 `patentEpoch`).
  학생이 스스로 조회하는 동안에는 고쳐 둔 낱말과 켜 둔 갈래가 남는다.
- **발명 상세의 "이 발명으로 특허 검색"** 은 1.0과 같은 `kipris_search_keywords`
  표를 읽어 5칸을 채운다. 같은 발명이면 1.0과 같은 검색식이 나온다.
  이때 세션은 아직 건드리지 않고, 학생이 실제로 "검색"을 눌렀을 때만 기록된다.

### 신설한 서버 창구 (읽기 전용, 1.0과 같은 표)

- `GET /api/ipc?code=A45B` → `ipc_descriptions` 의 뜻
- `GET /api/invention-keywords?id=…` → `kipris_search_keywords` 의 OPSME 5칸

### 1.0 참고 코드 (운영 중 — 읽기만, 절대 수정 금지)

기준 경로: `C:\Users\user\Documents\클맥_ideaprism`

| 무엇 | 파일 |
|---|---|
| 검색 페이지 전체 | `src/components/features/ClientSearchPage.tsx` |
| 필터 패널 | `src/components/features/FacetFilterPanel.tsx`, `FilterPanel.tsx` |
| 특허+발명 통합 모달 | `src/app/test/kipris-search/IntegratedInventionModal.tsx` |
| 상세 페이지(라우트) | `src/app/inventions/[id]/page.tsx` |

### 우측 패널을 더 손볼 때 지킬 것

- 필터 클릭은 **서버 왕복 없이** 즉시 반영돼야 한다 (PRD 8장, 체감 0.1초).
  `facets.ts` 의 순수 함수로 메모리에서 계산 중 — 이 구조는 유지할 것.
- 필터를 바꾸면 세션에 실려 **다음 턴에 AI도 같은 화면을 본다** (PRD S-4).
- 카드 500장을 한 번에 그리면 버벅인다. 지금 30장씩 "더 보기" 방식.
- 발명 이미지(`drawing_url`)와 특허 도면은 주소가 제각각이라 `next/image`
  최적화 없이 `<img>` 로 띄운다.
- 태그 색값(HEX)은 1.0과 한 글자도 다르지 않게 유지할 것. 여기서 색을
  "예쁘게" 고치면 두 서비스가 따로 놀기 시작한다.

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
| 추가 | 우측 패널을 1.0 화면에 맞춤 (갤러리·상세·특허) | ✅ |

### 실제 API로 검증된 것 / 안 된 것

- ✅ **OpenAI(`gpt-5.4-mini`)로 전 구간** — 스트리밍, 감정 태그, 검색(216건),
  필터(초등학교 123건), KIPRIS(2,874건), 퀘스트 승급, 배턴터치, 노트 저장
- ✅ **Gemini(`gemini-3.6-flash`)** — 검색까지
- ✅ **우측 패널 3종 (2026-08-11)** — 실제 브라우저에서 0단계 완주 → 검색(156건)
  → 4열(1440)/3열(1024) → 리스트 전환 → 상세 모달 두 탭(대화창 안 가림 확인)
  → "이 발명으로 특허 검색" → OPSME 5칸 자동 채움 + IPC 뜻 + 134건 조회
  + 갈래 켜서 좁히기 + 쪽 넘기기까지 확인
- ⚠️ **Claude 미검증** — `ANTHROPIC_API_KEY` 가 아직 비어 있음 (`sk-ant-` 로 시작하는 키 필요)
- ⚠️ **브라우저에서 사람이 여러 턴 이어서 대화한 완주 테스트는 아직** (PRD 1장 성공 기준)

### 폴더 구조 요약

```
personas/     캐릭터 대본 — "어떻게 말하는가"    (대표님이 고침)
flow/         대화 흐름 지침 — "어떻게 흘러가는가" (대표님이 고침, 9개 파일)
supabase/     invention_notes DDL (이미 적용됨)
tests/        회귀 테스트 72개
src/lib/
  ai/         types·config·provider + adapters/{claude,openai,gemini}
  quest.ts    퀘스트 상태기계 + 승급 검증   ← 단계 판정은 여기만
  tools.ts    도구 8종 명세 (중립 형식)
  tool-handlers.ts  도구 실행기 (서버)
  prompt.ts   프롬프트 조립 + 표식 파서 + 대화 압축
  flow.ts     flow/*.md 로더 (없으면 코드 기본값)
  tag-styles.ts  태그 색·아이콘 (1.0 이식 — 색값 그대로 유지할 것)
  search/     검색어 파서 · Supabase 조회 · 필터/통계(순수 함수)
  kipris/     검색식 생성 · 특허청 조회 · OPSME 키워드 해석
  notes/      발명노트 계산 · 저장
src/components/
  search/     SearchPanel(갤러리) · InventionCard · InventionDetailModal
  patent/     PatentPanel(OPSME 검색식) · PatentCard
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
- 명령: `npm run dev` / `npm test` (72개) / `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run lint` 는 **effect 안에서 setState 하는 것을 오류로 막는다.** 억누르지 말고
  구조를 바꿀 것 (값을 바꾸는 곳에서 함께 바꾸거나, 비동기 콜백 안으로 옮기기).

## 대표님과 일하는 방식

- 호칭은 **"대표님"**. 비개발자이므로 기술은 비유로 설명한다.
- 각 단계 완료 시 브리핑 → 승인 후 다음 단계.
- **로컬 커밋은 자유, push·배포는 반드시 승인 후.** 지금까지 커밋 16개, push 이력 없음.
- 검증한 것과 못 한 것을 반드시 나눠서 정직하게 보고한다.
- 키 값은 AI가 다루지 않는다 (대표님이 직접 입력). 부득이하면 값을 화면에 출력하지 않는
  방식으로 처리하고 먼저 여쭙는다.

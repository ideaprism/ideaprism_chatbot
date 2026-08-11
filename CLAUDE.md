# IdeaPrism 2.0 프로토타입 — 프로젝트 안내

## 이 프로젝트는

학생 발명교육 서비스 IdeaPrism의 2.0 프로토타입. AI 캐릭터(발명 선배·멘토)들과의 대화가 곧 조종석인 서비스 — 학생이 채팅으로 검색을 조종하고, 퀘스트(발명 5단계)를 완주하면 발명노트가 자동 완성된다. Claude.ai처럼 채팅이 기본 화면이고, 검색을 시키면 채팅이 좌측으로 축소되며 우측에 결과 패널이 열린다.

**IdeaPrism은 서비스가 셋이고, 셋은 한 몸이다.** 1.0(자료 창고) · 2.0(발명 대화, 이 저장소) ·
3.0(교사 관제탑). 같은 Supabase를 보기 때문에 한쪽을 고치면 다른 쪽이 흔들린다.

- **세 서비스의 목적·연결·영향 지도: [ECOSYSTEM.md](ECOSYSTEM.md)** — **어떤 작업을 시작하든 이것부터.** 특히 1.0을 건드리거나 단계·데이터 구조를 바꾸기 전에는 5장 「영향 지도」를 반드시 볼 것
- **지금 상태와 다음 할 일: [HANDOFF.md](HANDOFF.md)** — 새 세션이면 ECOSYSTEM 다음으로 읽을 것
- **요구사항의 기준 문서: [PRD.md](PRD.md)** — 범위·도구 명세·제작 순서(P0~P5)·완료 기준이 모두 여기 있음. 작업 전 반드시 읽을 것
- 배경 기획: [V2_PLAN_2026-08-10.md](V2_PLAN_2026-08-10.md) (기획서 v1.0)
- 캐릭터: [personas/](personas/) 6종 (⚠️ 지유 10번 감정 이미지는 문서의 파일명에서 `arms_` 접두어를 제거해야 함 — 문서 오타로 404 확인됨)

## 사용자(대표님)와 일하는 방식

- 사용자는 **비개발자 대표님**. 호칭은 반드시 "대표님" (사장님 ✗)
- 기술 개념은 비유와 쉬운 표현으로 설명 (예: service_role 키 → "건물 마스터키", 도구 호출 → "AI에게 리모컨 버튼을 쥐여주기")
- **작업 방식: PRD의 P0→P5 순서로, 각 단계 완료 시 브리핑 → 대표님 승인 후 다음 단계.** 1.0 정비 때 이 방식으로 진행했고 대표님이 선호함
- 로컬 커밋은 자유롭게, push·배포는 반드시 승인 후
- 매 단계 "눈으로 확인 가능한" 검증을 함께 제시 (PRD의 완료 기준 참조)

## 아키텍처 원칙 (합의된 결정 — 변경 시 대표님 확인)

1. **도구 호출(tool calling)만 사용** — RAG/TAG는 대표님이 직접 실험 후 기각함. AI는 주어진 버튼만 누른다(PRD 6장의 8종 + 전문가 초대 2종 = 지금 10종). SQL·이미지 주소·화면 코드를 직접 작성하지 않는다
2. **퀘스트 상태(0~5단계)는 코드(상태기계)가 관리** — AI는 현 단계의 대본만 받아 연기. 승급은 complete_stage 도구 + 코드 검증으로만
3. **감정 이미지·화자: AI는 이름만 표식으로 선택, 화면이 렌더링** (`[감정:이름]`·`[말:id]`)
4. **숫자는 프로그램이 세고 AI는 해석만** — 검색 1회로 최대 500건을 브라우저 메모리에 적재(1.0 방식 계승), 필터·통계는 메모리에서 즉시 계산. 전체 건수는 별도 조회해 "전체 N건 중 500건 기준" 정직 표기
5. 모델: Claude Sonnet 5로 시작, 곁일(노트 요약)은 저가 모델 검토. 대화 도중 모델 교체 금지. 상세는 PRD 7장 "모델 전략 고려사항"

## 기술 스택·환경

- Next.js(App Router) + TypeScript + Tailwind + framer-motion
- **Supabase는 1.0과 같은 프로젝트 공유** — inventions 등 읽기 + 신규 `invention_notes` 테이블
- Claude API는 서버 라우트 경유(키 노출 금지), 스트리밍 응답
- 환경변수(.env.local, 커밋 금지): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `KIPRIS_SERVICE_KEY`, `ANTHROPIC_API_KEY` — 실제 값은 1.0의 Vercel 대시보드에 있음(대표님이 직접 입력, AI는 키 값을 다루지 않음)
- 배포: Vercel 별도 프로젝트(프로토타입 기간 비공개), 저장소는 GitHub 비공개 신설 예정

## 1.0 참고 코드 (재사용 자산)

위치: `C:\Users\user\Documents\클맥_ideaprism` (운영 중 — 수정 금지, 참고만)

- 검색 API: `src/app/api/search/route.ts` — 키워드로 최대 500건 + 태그 목록 반환, facet 통계는 클라이언트가 useMemo로 계산 (`src/components/features/ClientSearchPage.tsx`)
- KIPRIS 검색식 생성·조회: `src/components/patent/PatentSearchView.tsx`, `src/app/api/kipris/search/route.ts` — 가장 어려운 자산, 그대로 이식
- UI 부품: InventionCardV2, FilterPanel 등 `src/components/`
- 1.0의 액세스 코드·어드민 인프라는 잠금 보존 상태 — 정식판에서 계정 체계로 부활 예정 (프로토타입은 익명)

## 시작 상태 (2026-08-12 갱신)

P0~P5 + 그 위에 얹은 것들까지 구현 완료. **로컬·GitHub·Vercel 전부 동기화(`3c7495d`).**
https://ideaprism-chatbot.vercel.app · https://github.com/ideaprism/ideaprism_chatbot
(배포본은 **입장코드**로 잠겨 있다 — 기본 `7117`, 관리자에서 변경)

굵직한 것만:

- **모델 3사 비교** — Claude·OpenAI·Gemini 어댑터 (대화 도중 교체 금지)
- **`flow/` 폴더** — 대화 흐름 지침을 텍스트 파일로 (`personas/`는 "어떻게 말하는가")
- **우측 패널을 1.0 화면에 맞춤** — 갤러리·상세보기·특허검색(OPSME)
- **랜딩페이지 `/`** — 1.0 디자인, 캐릭터 10명 소개. 대화는 `/chat`
- **캐릭터 10명** — 교사 1 · 학생 선배 6 · 전문가 3
- **0단계에서 선생님이 친구 둘을 짝지어 주고, 둘이 함께 대화한다** (`[말:id]` 표식)
- **전문가 초대** — 탐정은 5단계에서, 코치·연구원은 부를 때만
- **한 답변 안에서 문단마다 감정 그림이 바뀐다**
- **관리자 `/admin`** — 탭 넷(프롬프트·입장코드·이용내역·점검). 대화구조도 여기서 바꾼다
- **입장코드** — 첫 화면에서 코드를 넣어야 대화를 시작한다(기본 `7117`, 관리자에서 변경).
  소개는 누구나 보고, 막히는 것은 **돈이 나가는 자리**(chat·search·kipris API)다
- **학습 프로그램(트랙)을 데이터로 꺼냈다** — 단계 이름·대본·도구·완료 조건이
  `src/lib/track/` 에 있다. 완료 조건은 **부품 서랍**에서 골라 조립한다(`track/rules.ts`).
  단계 수는 트랙마다 다를 수 있다 — `0~5`·`stage < 5` 를 새로 쓰지 말 것

**남은 일**(학습 프로그램 스튜디오, 선생님 supervisor, 관리자 설정)과
굳힌 결정·함정 모음은 전부 [HANDOFF.md](HANDOFF.md)에 있다. **새 세션이면 그것부터 읽을 것.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

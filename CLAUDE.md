# IdeaPrism 2.0 프로토타입 — 프로젝트 안내

## 이 프로젝트는

학생 발명교육 서비스 IdeaPrism의 2.0 프로토타입. AI 캐릭터(발명 선배·멘토)들과의 대화가 곧 조종석인 서비스 — 학생이 채팅으로 검색을 조종하고, 퀘스트(발명 5단계)를 완주하면 발명노트가 자동 완성된다. Claude.ai처럼 채팅이 기본 화면이고, 검색을 시키면 채팅이 좌측으로 축소되며 우측에 결과 패널이 열린다.

- **지금 상태와 다음 할 일: [HANDOFF.md](HANDOFF.md)** — 새 세션이면 이것부터 읽을 것
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

1. **도구 호출(tool calling)만 사용** — RAG/TAG는 대표님이 직접 실험 후 기각함. AI는 PRD 6장의 버튼 8종만 누른다. SQL·이미지 주소·화면 코드를 직접 작성하지 않는다
2. **퀘스트 상태(0~5단계)는 코드(상태기계)가 관리** — AI는 현 단계의 대본만 받아 연기. 승급은 complete_stage 도구 + 코드 검증으로만
3. **감정 이미지: AI는 감정 이름만 구조화 필드로 선택, 화면이 렌더링**
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

## 시작 상태 (2026-08-11 갱신)

P0~P5 전부 구현 완료. **GitHub·Vercel 배포까지 끝났다.**
https://ideaprism-chatbot.vercel.app · https://github.com/ideaprism/ideaprism_chatbot

그 위에 붙은 것:

- **모델 3사 비교** — Claude·OpenAI·Gemini 어댑터 (대화 도중 교체 금지)
- **`flow/` 폴더** — 대화 흐름 지침을 텍스트 파일로 분리
  (`personas/`는 "어떻게 말하는가", `flow/`는 "어떻게 흘러가는가")
- **우측 패널을 1.0 화면에 맞춤** — 갤러리·상세보기·특허검색(OPSME)
- **관리자 페이지 `/admin`** — 캐릭터 대본·대화 흐름을 브라우저에서 편집
  (파일=공장 초기값, Supabase=고친 값. 접근 코드로 잠금)

**다음 세션의 일 4가지**(감정 이미지, 랜딩페이지, 시나리오 플랫폼, 관리자 확장)와
굳힌 결정·함정 모음은 전부 [HANDOFF.md](HANDOFF.md)에 있다. **새 세션이면 그것부터 읽을 것.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

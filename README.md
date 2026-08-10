# IdeaPrism 2.0 프로토타입

학생 발명교육 서비스 IdeaPrism의 2.0 프로토타입.
AI 캐릭터(발명 선배·멘토)와 대화하며 발명 5단계 퀘스트를 완주하면 발명노트가 자동 완성된다.

- 요구사항 기준 문서: [PRD.md](PRD.md)
- 배경 기획: [V2_PLAN_2026-08-10.md](V2_PLAN_2026-08-10.md)
- 작업 규칙: [CLAUDE.md](CLAUDE.md)

---

## 시작하기 (대표님 4단계)

### 1. 환경변수 넣기

```bash
cp .env.local.example .env.local
```

`.env.local` 을 열어 값을 채웁니다.

**AI 키는 셋 중 하나 이상만 있으면 대화가 됩니다.** 셋 다 넣으면 화면 상단에서 골라 가며 비교할 수 있습니다.

| 변수 | 어디서 구하나 | 없으면 |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) (`sk-ant-`로 시작) | Claude로 비교 불가 |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | OpenAI로 비교 불가 |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (무료 티어 있음) | Gemini로 비교 불가 |
| `NEXT_PUBLIC_SUPABASE_URL` | 1.0 Vercel 대시보드 | 선배 발명 검색 불가 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1.0 Vercel 대시보드 | 선배 발명 검색 불가 |
| `SUPABASE_SECRET_KEY` | 1.0 Vercel 대시보드 | 노트가 브라우저에만 남고 저장 안 됨 |
| `KIPRIS_SERVICE_KEY` | 1.0 Vercel 대시보드 | 5단계 특허 조회 불가 |

> Vercel에서 가려진 값은 **Settings → Environment Variables → 항목 우측 `⋯` → Edit** 을 눌러야 보입니다.
>
> 값을 넣은 뒤에는 개발 서버를 **한 번 껐다 켜야** 반영됩니다.

### 2. 발명노트 테이블 만들기

Supabase 대시보드 → SQL Editor → [supabase/invention_notes.sql](supabase/invention_notes.sql)
내용을 붙여넣고 **Run**. (1.0과 같은 프로젝트에 만듭니다)

### 3. 실행

```bash
npm run dev
```

http://localhost:3000 을 엽니다.

### 4. 준비 상태 확인

http://localhost:3000/api/health 를 열면 무엇이 준비됐고 무엇이 비었는지 한눈에 보입니다.
(키 "값"은 절대 표시되지 않고, 채워졌는지 여부만 나옵니다.)

---

## 학생이 겪게 되는 흐름

| 단계 | 담당 | 하는 일 | 완료 조건 |
|---|---|---|---|
| 0 만남 | 발명 마스터 선생님 | 별명·관심사를 나누고 선배를 소개받는다 | 별명 + 관심사 |
| 1 문제 발견 | 지유 선배 | 불편했던 장면을 찾고, 선배 발명을 함께 본다 | 관심 분야 + 관찰 1개 |
| 2 문제 정의 | 지유 선배 | 진짜 문제를 한 문장으로 좁힌다 | 문제 정의문 + 대상 + 불편함 |
| 3 아이디어 탐색 | 지유 선배 | SCAMPER로 아이디어를 넓힌다 | 기법 2개 + 후보 2개 |
| 4 아이디어 확정 | 지유 선배 | 하나를 골라 또렷하게 만든다 | 이름·요약·작동방식·차별점 |
| 5 선행기술조사 | 특허 탐정 | KIPRIS로 비슷한 특허를 찾고 차별점을 정리한다 | 검색식 + 차별점 |

담당이 바뀔 때는 배턴터치 연출이 뜨고, **새 캐릭터가 스스로 등장 인사를 건넵니다.**

---

## 만들어진 것 (P0~P5)

| 단계 | 내용 | 상태 |
|---|---|---|
| P0 셋업 | Next.js 골격, Claude(Sonnet 5) 스트리밍, 캐릭터 3명, 퀘스트 엔진 | ✅ |
| P1 검색 콘솔 | 2패널 UI, 검색 도구 4종, 최대 500건 적재 + 즉시 필터 | ✅ |
| P2 퀘스트 완주 | 배턴터치 자동 이어달리기 | ✅ |
| P3 발명노트 | Supabase 저장, 노트 패널, 완성본 인쇄 | ✅ |
| P4 특허 연결 | KIPRIS 검색식 생성 + 조회, 편집 가능한 특허 패널 | ✅ |
| P5 다듬기 | 주제 이탈 환기, 대화 압축, 비용 가드, 단계별 사용량 계측 | ✅ |
| 추가 | 모델 3사 비교 구조 (Claude·OpenAI·Gemini) | ✅ |

### 모델 3사 비교 (PRD 7장)

화면 상단에서 회사를 골라 같은 시나리오를 돌려 볼 수 있습니다.
**대화 도중에는 못 바꿉니다** — 프롬프트 캐시가 회사·모델별이라 중간에 갈아타면
이력 전체를 정가로 다시 처리하고 캐릭터 말투도 흔들리기 때문입니다.
바꾸면 새 대화로 다시 시작합니다.

회사마다 다른 부분은 어댑터(`src/lib/ai/adapters/`)가 흡수하고,
퀘스트·도구 8종·발명노트·검색·특허 로직은 **한 벌만 씁니다.**

| | Claude | OpenAI | Gemini |
|---|---|---|---|
| 사용 API | Messages | **Responses** | generateContent |
| 캐싱 | 어디를 캐싱할지 직접 지정 | 자동 (제어 불가) | 자동 (암시적) |
| 사고 조절 | adaptive + effort | reasoning effort | thinkingBudget |

> OpenAI는 Chat Completions에서 "도구 + 추론"을 함께 못 써서(`gpt-5.4-mini` 기준
> 400 오류) Responses API를 씁니다. 학생 대화가 OpenAI 서버에 남지 않도록 `store: false`.
>
> 캐싱 방식이 셋 다 달라 **비용 비교는 참고치**로 보셔야 합니다. 품질 비교는 유효합니다.

### 검증 상태

- ✅ **OpenAI로 끝까지 확인** — 첫 인사 스트리밍, 감정 태그, `complete_stage` 도구 호출,
  코드 검증을 통한 0→1단계 승급, 배턴터치, 단계별 사용량·캐시 기록까지 실제 호출로 확인
- ⚠️ **Claude·Gemini는 미검증** — 키가 없어 한 번도 호출하지 못했습니다
- ⚠️ **Supabase 검색·KIPRIS 조회 미검증** — 실제 키가 필요합니다
  (1.0 폴더의 `.env.local` 값은 자리표시자라 쓸 수 없습니다)

---

## 폴더 구조

```
personas/                  캐릭터 대본 (여기를 고치면 말투가 바뀝니다)
supabase/                  invention_notes 테이블 DDL
tests/                     핵심 로직 회귀 테스트 55개
src/
  app/
    page.tsx               채팅 + 2패널 화면
    api/chat/route.ts      Claude 스트리밍 + 도구 실행 (서버)
    api/kipris/route.ts    특허 패널에서 검색식 고쳐 다시 찾기 (AI 안 거침)
    api/health/route.ts    연결 점검
  components/              진행판 · 말풍선 · 감정 이미지 · 검색/노트/특허 패널
  hooks/useChat.ts         대화·패널 상태 관리
  lib/
    ai/config.ts           모델·강도·비용 상한       ← 모델 교체는 여기만
    characters.ts          캐릭터 + 감정 이미지 매핑
    personas.ts            페르소나 로더 (이미지 지시문 자동 제거)
    quest.ts               퀘스트 상태기계 + 승급 검증  ← 단계 판정은 여기만
    tools.ts               도구 8종 명세
    tool-handlers.ts       도구 실행기
    prompt.ts              프롬프트 조립 + 표식 파서 + 대화 압축
    search/                검색어 파서 · Supabase 조회 · 필터/통계
    kipris/                검색식 생성 · 특허청 조회
    notes/                 발명노트 계산 · 저장
    usage.ts               단계별 토큰 사용량
```

---

## 설계에서 지키고 있는 것

PRD의 아키텍처 원칙이 코드 어디에 박혀 있는지:

1. **도구 호출만 사용** — AI는 `tools.ts` 의 8개 버튼만 누른다. 미구현 도구는 AI에게 전달조차 하지 않는다.
2. **단계 판정은 코드가** — 승급은 `complete_stage` 호출 + `quest.ts` 검증을 통과해야만 일어난다.
   AI가 "다음 단계로 가자"고 선언해도 올라가지 않는다.
3. **감정은 이름만** — AI는 `[감정:이름]` 표식만 쓰고, 이미지 주소 조립은 `characters.ts` 가 한다.
   페르소나 원본의 `<img>` 지시문은 로딩 시점에 자동 제거된다.
4. **숫자는 프로그램이** — 검색 건수·통계·특허 건수는 전부 코드가 세어 AI에게 넘긴다.
   AI가 목록에 없는 값을 지어내면 조용히 버리고 무엇을 버렸는지 알려 준다.
5. **비용 이중 가드** — 세션당 호출 상한(`ai/config.ts`) + Anthropic 콘솔의 월 한도.
   특허 패널에서 검색식을 몇 번 고쳐도 AI 호출은 늘지 않는다.
6. **개인정보 미수집** — 별명만 받는다. 실명·연락처는 묻지도, 적지도 않는다.

---

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 배포용 빌드
npm test           # 핵심 로직 테스트 (55개)
npm run typecheck  # 타입 검사
npm run lint       # 린트
```

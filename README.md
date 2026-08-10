# IdeaPrism 2.0 프로토타입

학생 발명교육 서비스 IdeaPrism의 2.0 프로토타입.
AI 캐릭터(발명 선배·멘토)와 대화하며 발명 5단계 퀘스트를 완주하면 발명노트가 자동 완성된다.

- 요구사항 기준 문서: [PRD.md](PRD.md)
- 배경 기획: [V2_PLAN_2026-08-10.md](V2_PLAN_2026-08-10.md)
- 작업 규칙: [CLAUDE.md](CLAUDE.md)

---

## 시작하기 (대표님 3단계)

### 1. 환경변수 넣기

```bash
cp .env.local.example .env.local
```

`.env.local` 을 열어 값을 채웁니다. **`ANTHROPIC_API_KEY` 하나만 있어도 P0은 돌아갑니다.**

| 변수 | 어디서 구하나 | 언제 필요한가 |
|---|---|---|
| `ANTHROPIC_API_KEY` | [Anthropic 콘솔](https://console.anthropic.com/) → API Keys | **지금(P0)** |
| `NEXT_PUBLIC_SUPABASE_URL` | 1.0 Vercel 대시보드에서 복사 | P1 검색 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1.0 Vercel 대시보드에서 복사 | P1 검색 |
| `SUPABASE_SECRET_KEY` | 1.0 Vercel 대시보드에서 복사 | P3 노트 저장 |
| `KIPRIS_SERVICE_KEY` | 1.0 Vercel 대시보드에서 복사 | P4 특허 |

> 값을 넣은 뒤에는 개발 서버를 **한 번 껐다 켜야** 반영됩니다.

### 2. 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

### 3. 준비 상태 확인

http://localhost:3000/api/health 를 열면 무엇이 준비됐고 무엇이 비었는지 한눈에 보입니다.
(키 "값"은 절대 표시되지 않고, 채워졌는지 여부만 나옵니다.)

---

## 지금까지 만들어진 것 (P0)

| 항목 | 상태 |
|---|---|
| Next.js + TypeScript + Tailwind 골격 | ✅ |
| Claude(Sonnet 5) 스트리밍 연결 — 서버 라우트 경유, 키 노출 없음 | ✅ |
| 캐릭터 3명 페르소나 로딩 (personas/ 파일이 원본) | ✅ |
| 감정 이미지 30장 매핑 + 전수 검증 | ✅ |
| 퀘스트 0~5단계 상태기계 + 승급 검증 | ✅ |
| 도구 8종 명세 (동작: update_note, complete_stage) | ✅ |
| 상단 진행판 · 배턴터치 연출 · 2패널 골격 | ✅ |
| 발명노트 테이블 DDL 초안 | ✅ (아직 미적용) |

**완료 기준(PRD P0):** 첫 화면에서 지도교사가 스트리밍으로 인사를 건넨다.

### 아직 안 만든 것

- 검색 패널과 검색 도구 4종 (P1)
- 발명노트 Supabase 저장 (P3) — 지금은 브라우저 세션에만 쌓입니다
- KIPRIS 특허 조회 (P4)

---

## 폴더 구조

```
personas/                  캐릭터 대본 6종 (여기를 고치면 말투가 바뀝니다)
supabase/                  invention_notes 테이블 DDL
tests/                     핵심 로직 회귀 테스트
src/
  app/
    page.tsx               채팅 화면
    api/chat/route.ts      Claude 스트리밍 + 도구 실행 (서버)
    api/health/route.ts    연결 점검
  components/              진행판 · 말풍선 · 감정 이미지 · 배턴터치
  hooks/useChat.ts         대화 상태 관리
  lib/
    ai/config.ts           모델·강도·비용 상한  ← 모델 교체는 여기만
    characters.ts          캐릭터 + 감정 이미지 매핑
    personas.ts            페르소나 로더 (이미지 지시문 자동 제거)
    quest.ts               퀘스트 상태기계 + 승급 검증  ← 단계 판정은 여기만
    tools.ts               도구 8종 명세
    tool-handlers.ts       도구 실행기
    prompt.ts              프롬프트 조립 + 감정 태그 파서
```

---

## 설계에서 지키고 있는 것

PRD의 아키텍처 원칙이 코드 어디에 박혀 있는지:

1. **도구 호출만 사용** — AI는 `tools.ts` 의 8개 버튼만 누른다. 아직 구현 안 된 도구는 AI에게 전달조차 하지 않는다.
2. **단계 판정은 코드가** — 승급은 `complete_stage` 도구 호출 + `quest.ts` 의 검증 함수를 통과해야만 일어난다. AI가 "다음 단계로 가자"고 선언해도 올라가지 않는다.
3. **감정은 이름만** — AI는 `[감정:이름]` 태그만 쓰고, 이미지 주소 조립은 `characters.ts` 가 한다. 페르소나 원본의 `<img>` 지시문은 로딩 시점에 자동 제거된다.
4. **숫자는 프로그램이** — 검색 건수·통계는 도구가 돌려준 값만 쓰도록 프롬프트에 못박았다 (P1에서 실제 연결).
5. **비용 이중 가드** — 세션당 호출 상한(`ai/config.ts`) + Anthropic 콘솔의 월 한도.

---

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 배포용 빌드
npm test           # 핵심 로직 테스트 (13개)
npm run typecheck  # 타입 검사
npm run lint       # 린트
```

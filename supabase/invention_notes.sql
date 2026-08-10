-- ============================================================
-- IdeaPrism 2.0 프로토타입 — 발명노트 테이블 (초안)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--            (1.0과 같은 프로젝트에 만듭니다)
--
-- 프로토타입은 익명입니다. 실명·연락처는 저장하지 않으며,
-- 파일럿 전에 통째로 지울 수 있도록 한 테이블에 모읍니다.
-- ============================================================

create table if not exists public.invention_notes (
  id                uuid primary key default gen_random_uuid(),

  -- 익명 세션 식별자 (브라우저가 만든 UUID). 개인정보 아님.
  session_id        text not null unique,
  -- 학생이 직접 정한 별명. 실명 요구 금지.
  nickname          text,
  -- 매칭된 발명친구 (teacher | jiyou | detective)
  matched_character text,

  -- 진행 상태
  current_stage     smallint not null default 0,
  completed         boolean  not null default false,

  -- 단계별 기록 (JSON):
  --   { "0": { "summary": "...", "artifact": {...}, "dwellMs": 0, "retries": 0 }, ... }
  stages            jsonb not null default '{}'::jsonb,

  -- 최종 산출물
  final_idea        jsonb,
  kipris_query      text,
  kipris_summary    jsonb,

  -- 비용·사용량 계측 (PRD 7장: 단계별 사용량 계측)
  ai_calls          integer not null default 0,
  token_usage       jsonb   not null default '{}'::jsonb,

  started_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists invention_notes_session_idx
  on public.invention_notes (session_id);
create index if not exists invention_notes_started_idx
  on public.invention_notes (started_at desc);

-- updated_at 자동 갱신
create or replace function public.touch_invention_notes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invention_notes_touch on public.invention_notes;
create trigger invention_notes_touch
  before update on public.invention_notes
  for each row execute function public.touch_invention_notes();

-- ── 접근 제어 ────────────────────────────────────────────────
-- RLS를 켜고 정책을 하나도 만들지 않으면, anon 키로는 읽지도 쓰지도 못합니다.
-- 서버가 쓰는 secret 키는 RLS를 우회하므로 저장은 정상 동작합니다.
-- (= 브라우저에서 다른 학생의 노트를 훔쳐볼 수 없습니다)
alter table public.invention_notes enable row level security;

-- ── 프로토타입 데이터 삭제 (파일럿 전에 실행) ────────────────
-- truncate table public.invention_notes;

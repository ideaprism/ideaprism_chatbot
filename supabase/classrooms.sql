-- ============================================================
-- IdeaPrism — 교실과 선생님 (2.0 ↔ 3.0 을 잇는 표)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--            (1.0·2.0과 같은 프로젝트에 만듭니다)
--
-- 왜 필요한가
--   2.0은 학생이 익명으로 대화하는 곳이고, 3.0은 선생님이 지켜보는 곳입니다.
--   그 둘을 이으려면 "이 학생은 누구 반인가"가 있어야 합니다.
--
--   대표님 결정: **입장코드를 교실 코드로 승격한다.**
--   학생이 첫 화면에서 넣는 그 코드가 곧 교실입니다. 학생이 할 일은 늘지 않고
--   (코드 하나 넣는 것은 그대로), 그 코드의 선생님이 그 학생들을 봅니다.
--
--   실명·학교·연락처는 여전히 받지 않습니다. 학생은 별명뿐입니다.
-- ============================================================

-- ── 선생님 ──────────────────────────────────────────────────
-- 프로토타입이라 이메일·비밀번호를 받지 않습니다.
-- 대표님이 만들어 건네는 「로그인 코드」 하나로 3.0에 들어갑니다.
create table if not exists public.teachers (
  id          uuid primary key default gen_random_uuid(),
  -- 화면에 보일 이름 ("김영수 선생님")
  name        text not null,
  -- 3.0에 들어갈 때 넣는 코드. 사람마다 다릅니다
  login_code  text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── 교실 ────────────────────────────────────────────────────
create table if not exists public.classrooms (
  id          uuid primary key default gen_random_uuid(),
  -- 학생이 2.0 첫 화면에서 넣는 입장코드. 이 코드 하나가 교실 하나입니다
  code        text not null unique,
  -- 선생님이 알아볼 이름 ("성수중 3학년 발명반")
  name        text not null,
  -- 이 교실을 맡은 선생님. 아직 안 정해졌으면 비어 있어도 됩니다
  teacher_id  uuid references public.teachers(id) on delete set null,
  -- 끄면 그 코드로는 못 들어옵니다 (지우지 않고 닫아 두는 용도)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists classrooms_teacher_idx on public.classrooms (teacher_id);

-- ── 노트에 "어느 교실인가"를 남긴다 ─────────────────────────
-- 학생이 넣은 코드의 교실이 여기 찍힙니다. 3.0은 이 값으로 자기 반만 골라 봅니다.
alter table public.invention_notes
  add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;

create index if not exists invention_notes_classroom_idx
  on public.invention_notes (classroom_id);

-- ── 지금 쓰고 있는 입장코드를 첫 교실로 옮긴다 ──────────────
--
-- ⚠️ **이 부분이 없으면 아무도 못 들어오게 됩니다.**
--   표가 생기는 순간부터 문은 "교실에 있는 코드"만 인정합니다. 지금 쓰시던 코드가
--   교실 목록에 없으면 그 코드로는 못 들어옵니다.
--
-- 그래서 코드를 여기 적지 않고, **지금 저장돼 있는 값을 그대로 가져다** 씁니다.
-- 대표님이 관리자에서 코드를 바꾸셨든 안 바꾸셨든 알아서 맞습니다.

-- ① 관리자에서 바꾼 코드가 있으면 그것을 첫 교실로
insert into public.classrooms (code, name)
select trim(content), '첫 번째 교실'
from public.prompt_overrides
where kind = 'config' and name = '입장코드' and trim(content) <> ''
on conflict (code) do nothing;

-- ② 바꾼 적이 없으면(저장된 값이 없으면) 공장 초기값으로
insert into public.classrooms (code, name)
select '7117', '첫 번째 교실'
where not exists (select 1 from public.classrooms);

-- ── 접근 제어 ────────────────────────────────────────────────
-- RLS를 켜고 정책을 만들지 않으면 브라우저 키로는 읽지도 쓰지도 못합니다.
-- 서버가 쓰는 secret 키만 RLS를 우회합니다.
-- (= 학생 브라우저에서 다른 교실의 코드나 선생님 코드를 훔쳐볼 수 없습니다)
alter table public.teachers   enable row level security;
alter table public.classrooms enable row level security;

-- ── 되돌리기 (필요할 때만) ──────────────────────────────────
-- alter table public.invention_notes drop column if exists classroom_id;
-- drop table if exists public.classrooms;
-- drop table if exists public.teachers;

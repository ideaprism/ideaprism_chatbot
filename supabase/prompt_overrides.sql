-- ============================================================
-- IdeaPrism 2.0 프로토타입 — 프롬프트 덮어쓰기 테이블
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--            (1.0과 같은 프로젝트에 만듭니다)
--
-- 무엇을 하는 표인가
--   관리자 페이지(/admin)에서 고친 페르소나·대화 흐름·설정값이 여기 쌓입니다.
--
--   personas/ 와 flow/ 폴더의 파일은 그대로 "공장 초기값"으로 남습니다.
--   프로그램은 이 표에 값이 있으면 그것을 쓰고, 없으면 파일을 씁니다.
--   그래서 "기본값으로 되돌리기"는 이 표에서 한 줄을 지우는 일입니다.
--   (설정값은 파일이 없고 코드가 공장 초기값을 줍니다)
--
-- 왜 파일에 바로 안 쓰는가
--   Vercel 같은 곳에 올리면 서버의 파일은 읽기 전용이라 저장이 되지 않습니다.
--   또 파일을 직접 고치면 원본이 사라져 되돌릴 수가 없습니다.
--
-- ⚠️ 이미 이 표를 만들어 두셨다면
--   prompt_overrides_kind_config.sql 을 한 번 실행해 주세요.
--   `create table if not exists` 는 이미 있는 표의 규칙을 고치지 않습니다.
-- ============================================================

create table if not exists public.prompt_overrides (
  -- 어떤 종류인가
  --   'persona' 캐릭터 대본 | 'flow' 대화 흐름 | 'config' 설정값(대화구조·입장코드)
  -- ※ 새 종류를 만들면 여기도 함께 넣어야 합니다. 안 그러면 저장이 거부됩니다
  kind        text not null check (kind in ('persona', 'flow', 'config')),
  -- 문서 이름. persona 는 캐릭터 id(teacher/jiyou/detective),
  --            flow 는 파일 이름(공통규칙, 1-소재발견 …),
  --            config 는 설정 이름(대화구조, 입장코드)
  name        text not null,

  -- 고친 내용 원문 (파일에 적던 것과 같은 글)
  content     text not null,

  -- 누가 언제 고쳤는지 (프로토타입은 관리자 한 사람이라 메모용)
  note        text,
  updated_at  timestamptz not null default now(),

  primary key (kind, name)
);

-- updated_at 자동 갱신
create or replace function public.touch_prompt_overrides()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prompt_overrides_touch on public.prompt_overrides;
create trigger prompt_overrides_touch
  before update on public.prompt_overrides
  for each row execute function public.touch_prompt_overrides();

-- ── 접근 제어 ────────────────────────────────────────────────
-- RLS를 켜고 정책을 하나도 만들지 않으면 anon 키로는 읽지도 쓰지도 못합니다.
-- 서버가 쓰는 secret 키는 RLS를 우회하므로 관리자 페이지는 정상 동작합니다.
-- (= 학생 브라우저에서 프롬프트를 훔쳐보거나 고칠 수 없습니다)
alter table public.prompt_overrides enable row level security;

-- ── 전부 공장 초기값으로 되돌리기 (필요할 때만) ──────────────
-- truncate table public.prompt_overrides;

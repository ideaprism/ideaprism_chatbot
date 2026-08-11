-- ============================================================
-- 고침 — prompt_overrides 가 'config' 를 받아들이게 한다
--
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--
-- 무엇이 잘못됐었나
--   표를 처음 만들 때 kind 에 'persona'(캐릭터 대본)와 'flow'(대화 흐름)만
--   허용해 두었다. 그 뒤에 설정값을 담는 세 번째 종류 'config' 가 생겼는데
--   (대화구조 · 입장코드) 표의 규칙을 함께 고치지 않았다.
--
--   그래서 관리자 페이지에서 대화구조나 입장코드를 저장하면 표가 거부했다:
--     new row for relation "prompt_overrides"
--     violates check constraint "prompt_overrides_kind_check"
--
--   저장만 막혔을 뿐 대화는 멀쩡했다 — 저장된 값이 없으면 파일과 코드에 든
--   공장 초기값으로 돌아가게 만들어 두었기 때문이다.
--
-- 이 파일을 실행한 뒤
--   관리자 페이지에서 대화구조·입장코드를 저장할 수 있게 된다.
--   이미 표를 만들어 둔 곳에서는 이 파일만 실행하면 되고,
--   새로 만드는 곳은 prompt_overrides.sql 하나면 된다 (그쪽도 함께 고쳤다).
-- ============================================================

alter table public.prompt_overrides
  drop constraint if exists prompt_overrides_kind_check;

alter table public.prompt_overrides
  add constraint prompt_overrides_kind_check
  check (kind in ('persona', 'flow', 'config'));

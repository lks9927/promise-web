-- ============================================================================
-- 99_rollback_phase1_rls.sql  (DRAFT)
-- 02_rls_phase1.sql 을 되돌린다. 문제가 생기면 이 파일 전체를 실행하면
-- 6개 테이블이 적용 전과 같은 상태(RLS 꺼짐, 정책 없음)로 돌아온다.
-- 함수(01/03)를 되돌리는 것은 98_rollback_function_changes.sql 이다. 순서: 이 파일(99) 먼저, 그다음 98.
-- ============================================================================
begin;

drop trigger if exists trg_settlements_guard_non_admin on public.settlements;
drop function if exists public.settlements_guard_non_admin();

drop policy if exists deposits_select        on public.deposits;
drop policy if exists payout_requests_select on public.payout_requests;
drop policy if exists tax_invoices_select    on public.tax_invoices;
drop policy if exists bidding_history_select on public.bidding_history;
drop policy if exists settlements_select     on public.settlements;
drop policy if exists settlements_insert     on public.settlements;
drop policy if exists settlements_update     on public.settlements;
drop policy if exists settlements_delete     on public.settlements;
drop policy if exists flower_orders_select   on public.flower_orders;
drop policy if exists flower_orders_insert   on public.flower_orders;
drop policy if exists flower_orders_update   on public.flower_orders;
drop policy if exists flower_orders_delete   on public.flower_orders;

alter table public.deposits         disable row level security;
alter table public.payout_requests  disable row level security;
alter table public.tax_invoices     disable row level security;
alter table public.bidding_history  disable row level security;
alter table public.settlements      disable row level security;
alter table public.flower_orders    disable row level security;

commit;

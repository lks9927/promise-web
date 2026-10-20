-- ============================================================================
-- 02_rls_phase1.sql  (DRAFT - 01_prerequisites.sql 적용 후에만 실행)
-- 1단계: "로그인 없는 사용자(anon)가 직접 접근하지 않는" 테이블 6개에만 RLS 적용.
--   deposits, payout_requests, tax_invoices, bidding_history, settlements, flower_orders
-- 코드 조사 결과: 위 테이블은 로그인한 사용자만 브라우저에서 접근하고,
-- deposits/payout_requests/tax_invoices/bidding_history 는 브라우저 접근이 아예 없다.
-- 서버(서비스 키), DB 트리거/DEFINER 함수는 RLS 를 우회하므로 영향 없다.
-- 이 파일은 하나의 트랜잭션이다. 실패하면 전체가 취소된다.
-- ============================================================================
begin;

-- ---------------------------------------------------------------- deposits
-- 쓰기는 서버/트리거만. 본인 것만 읽기.
alter table public.deposits enable row level security;
drop policy if exists deposits_select on public.deposits;
create policy deposits_select on public.deposits
  for select to authenticated
  using ((select public.is_admin()) or partner_id = (select auth.uid()));

-- ---------------------------------------------------------- payout_requests
alter table public.payout_requests enable row level security;
drop policy if exists payout_requests_select on public.payout_requests;
create policy payout_requests_select on public.payout_requests
  for select to authenticated
  using ((select public.is_admin()) or dealer_id = (select auth.uid()));

-- -------------------------------------------------------------- tax_invoices
alter table public.tax_invoices enable row level security;
drop policy if exists tax_invoices_select on public.tax_invoices;
create policy tax_invoices_select on public.tax_invoices
  for select to authenticated
  using ((select public.is_admin()));

-- ----------------------------------------------------------- bidding_history
alter table public.bidding_history enable row level security;
drop policy if exists bidding_history_select on public.bidding_history;
create policy bidding_history_select on public.bidding_history
  for select to authenticated
  using ((select public.is_admin()) or leader_id = (select auth.uid()));

-- ---------------------------------------------------------------- settlements
alter table public.settlements enable row level security;

-- 읽기: 관리자 / 수령자 본인 / 해당 장례의 담당 팀장 또는 그 팀장의 master
-- (MyWallet 이 장례 기준으로 읽음). is_case_manager 는 DEFINER 도우미(01 파일).
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select to authenticated
  using (
    (select public.is_admin())
    or recipient_id = (select auth.uid())
    or public.is_case_manager(settlements.case_id)
  );

-- 쓰기: 관리자만 INSERT/DELETE.
drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements
  for delete to authenticated
  using ((select public.is_admin()));

-- UPDATE: 관리자는 전부. 담당 팀장(또는 그 팀장의 master)은 해당 장례의 draft 정산을
-- draft/awaiting_payment 로만 변경. (TeamLeaderDashboard.jsx handleStatusUpdate:
-- 장례가 team_settling 이 될 때 draft -> awaiting_payment)
drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements
  for update to authenticated
  using (
    (select public.is_admin())
    or (status = 'draft' and public.is_case_manager(settlements.case_id))
  )
  with check (
    (select public.is_admin())
    or (status in ('draft', 'awaiting_payment') and public.is_case_manager(settlements.case_id))
  );

-- RLS 는 "어떤 열을 바꾸는지"는 막지 못한다. 관리자가 아닌 로그인 사용자가 직접 UPDATE 할 때는
-- status 열만 바꿀 수 있게 막는다. (금액/수령자/메모 변조 방지)
-- current_user 가 'authenticated' 일 때만 검사하므로, DEFINER 함수/트리거/서비스 키는 영향 없다.
create or replace function public.settlements_guard_non_admin()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'settlements: 상태(status) 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_settlements_guard_non_admin on public.settlements;
create trigger trg_settlements_guard_non_admin
  before update on public.settlements
  for each row execute function public.settlements_guard_non_admin();

-- --------------------------------------------------------------- flower_orders
-- 코드: 팀장/관리자가 INSERT 만 한다(TeamLeaderDashboard.jsx). 읽기는 본인/관리자.
alter table public.flower_orders enable row level security;

drop policy if exists flower_orders_select on public.flower_orders;
create policy flower_orders_select on public.flower_orders
  for select to authenticated
  using ((select public.is_admin()) or team_leader_id = (select auth.uid()));

drop policy if exists flower_orders_insert on public.flower_orders;
create policy flower_orders_insert on public.flower_orders
  for insert to authenticated
  with check ((select public.is_admin()) or team_leader_id = (select auth.uid()));

drop policy if exists flower_orders_update on public.flower_orders;
create policy flower_orders_update on public.flower_orders
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists flower_orders_delete on public.flower_orders;
create policy flower_orders_delete on public.flower_orders
  for delete to authenticated
  using ((select public.is_admin()));

commit;

-- ============================================================================
-- 적용 직후 확인 (읽기 전용)
-- select relname, relrowsecurity from pg_class
--  where relnamespace='public'::regnamespace and relname in
--  ('deposits','payout_requests','tax_invoices','bidding_history','settlements','flower_orders');
-- ============================================================================

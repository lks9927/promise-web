-- ============================================================================
-- 06_tighten_open_tables.sql  (DRAFT - 01_prerequisites.sql 적용 후 실행)
-- 대상: RLS 는 이미 켜져 있지만 정책이 USING true / CHECK true 로 열려 있는 테이블 중
--       "로그인 없는 화면이 쓰지 않는" 부분만. (코드 조사 2026-10-20, 근거는 00_README.md)
--   additional_income_items, custom_packages, order_items, vendor_products,
--   delivery_drivers(쓰기만), vendors(수정/익명 읽기 열 제한)
-- 이번에 건드리지 않는 것(코드 수정이 먼저 필요, 00_README.md 2단계 참조):
--   orders, deliveries, funeral_progress_reports, delivery_drivers 의 SELECT, vendors 의 SELECT/INSERT
--   (배송기사 /delivery/:id 와 고객 /mypage 타임라인이 로그인 없이 직접 읽고 쓰기 때문)
-- 하나의 트랜잭션: 실패하면 전부 취소된다. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 도우미 함수 (모두 SECURITY DEFINER, 정책에서 RLS 재귀 없이 안전하게 쓰기 위함)
-- ----------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select p.role from public.profiles p where p.id = auth.uid(); $$;

create or replace function public.owns_vendor(p_vendor uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.vendors v where v.id = p_vendor and v.user_id = auth.uid()); $$;

create or replace function public.vendor_is_approved(p_vendor uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.vendors v where v.id = p_vendor and v.status = 'approved'); $$;

-- 발주의 담당 팀장 본인 또는 그 팀장의 master
create or replace function public.is_order_leader(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.orders o
      left join public.partners pt on pt.user_id = o.team_leader_id
     where o.id = p_order
       and o.team_leader_id is not null
       and (o.team_leader_id = auth.uid() or pt.master_id = auth.uid())
  );
$$;

-- 발주를 볼 수 있는 사람: 관리자, 담당 팀장/그 master, 해당 발주의 업체 본인
create or replace function public.can_access_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_admin()
      or public.is_order_leader(p_order)
      or exists (
           select 1 from public.orders o
             join public.vendors v on v.id = o.vendor_id
            where o.id = p_order and v.user_id = auth.uid()
         );
$$;

-- 이 정책들은 모두 authenticated 에만 적용되므로 로그인 없는 사용자(anon)의 실행 권한은 필요 없다.
-- (anon 이 RPC 로 직접 호출해 업체 승인 여부 등을 알아내는 통로를 막는다)
revoke all on function public.my_role()                 from public, anon;
revoke all on function public.owns_vendor(uuid)         from public, anon;
revoke all on function public.vendor_is_approved(uuid)  from public, anon;
revoke all on function public.is_order_leader(uuid)     from public, anon;
revoke all on function public.can_access_order(uuid)    from public, anon;
grant execute on function public.my_role(), public.owns_vendor(uuid), public.vendor_is_approved(uuid),
                          public.is_order_leader(uuid), public.can_access_order(uuid)
  to authenticated;

-- 기존 정책 이름이 63자로 잘려 있는 것이 있어, 이름을 외우지 않고 대상 테이블의 정책을 전부 지운다.
-- (regclass 를 글자로 바꾸면 public. 이 빠질 수 있어서 pg_class 에서 테이블 이름을 직접 읽는다.)
create or replace function pg_temp.drop_all_policies(p_table regclass)
returns void language plpgsql as $$
declare
  r record;
  v_name text := (select c.relname::text from pg_class c where c.oid = p_table);
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = v_name
  loop
    execute format('drop policy %I on public.%I', r.policyname, v_name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- additional_income_items  (코드: 팀장/관리자 화면 ProgressReportModal 만 접근)
-- ----------------------------------------------------------------------------
select pg_temp.drop_all_policies('public.additional_income_items');

create policy additional_income_items_select on public.additional_income_items
  for select to authenticated
  using ((select public.is_admin()) or public.is_case_manager(case_id));

-- 관리자 role 미리보기에서는 created_by 가 미리보기 대상 ID 일 수 있어 관리자는 제한하지 않는다.
create policy additional_income_items_insert on public.additional_income_items
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (public.is_case_manager(case_id) and created_by = (select auth.uid()))
  );

create policy additional_income_items_delete on public.additional_income_items
  for delete to authenticated
  using (
    (select public.is_admin())
    or (public.is_case_manager(case_id) and created_by = (select auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- custom_packages  (코드: 관리자 목록/승인, 팀장 제안 INSERT)
-- ----------------------------------------------------------------------------
select pg_temp.drop_all_policies('public.custom_packages');

create policy custom_packages_select on public.custom_packages
  for select to authenticated
  using ((select public.is_admin()) or team_leader_id = (select auth.uid()));

create policy custom_packages_insert on public.custom_packages
  for insert to authenticated
  with check ((select public.is_admin()) or team_leader_id = (select auth.uid()));

create policy custom_packages_update on public.custom_packages
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- vendor_products  (코드: 업체 본인 관리, 팀장 화면은 승인된 업체의 활성 상품만 조회)
-- ----------------------------------------------------------------------------
select pg_temp.drop_all_policies('public.vendor_products');

create policy vendor_products_select on public.vendor_products
  for select to authenticated
  using (
    (select public.is_admin())
    or public.owns_vendor(vendor_id)
    or (
      (select public.my_role()) in ('master', 'leader')
      and is_active
      and public.vendor_is_approved(vendor_id)
    )
  );

create policy vendor_products_insert on public.vendor_products
  for insert to authenticated
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy vendor_products_update on public.vendor_products
  for update to authenticated
  using ((select public.is_admin()) or public.owns_vendor(vendor_id))
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy vendor_products_delete on public.vendor_products
  for delete to authenticated
  using ((select public.is_admin()) or public.owns_vendor(vendor_id));

-- ----------------------------------------------------------------------------
-- order_items  (코드: 팀장 발주 시 INSERT, 업체 화면은 자기 발주 조회)
-- ----------------------------------------------------------------------------
select pg_temp.drop_all_policies('public.order_items');

create policy order_items_select on public.order_items
  for select to authenticated
  using (public.can_access_order(order_id));

create policy order_items_insert on public.order_items
  for insert to authenticated
  with check ((select public.is_admin()) or public.is_order_leader(order_id));

-- ----------------------------------------------------------------------------
-- delivery_drivers  (로그인 없는 배송기사가 업체의 활성 기사 목록을 읽으므로 SELECT 는 유지)
-- 쓰기만 업체 본인/관리자로 제한. (공개 목록은 2단계에서 RPC 로 대체 예정)
-- ----------------------------------------------------------------------------
select pg_temp.drop_all_policies('public.delivery_drivers');

-- 로그인 없는 사용자는 "활성 기사"만 읽는다(비활성 기사/탈퇴 기사는 노출 안 됨).
-- 다른 업체의 활성 기사까지 막으려면 주문 ID 를 검증하는 RPC 가 필요하다(2단계).
create policy delivery_drivers_select_anon on public.delivery_drivers
  for select to anon
  using (is_active);

create policy delivery_drivers_select_authenticated on public.delivery_drivers
  for select to authenticated
  using (is_active or (select public.is_admin()) or public.owns_vendor(vendor_id));

create policy delivery_drivers_insert on public.delivery_drivers
  for insert to authenticated
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy delivery_drivers_update on public.delivery_drivers
  for update to authenticated
  using ((select public.is_admin()) or public.owns_vendor(vendor_id))
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy delivery_drivers_delete on public.delivery_drivers
  for delete to authenticated
  using ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- vendors
--  - SELECT / INSERT 정책은 그대로 둔다(배송기사 화면이 로그인 없이 읽고, 가입이 insert 한다).
--  - UPDATE 가 USING true 라서 누구나 업체 상태를 'approved' 로 바꿀 수 있었다 -> 제한.
--  - 로그인 없는 사용자는 열 단위로 id, company_name, user_id, phone 만 읽게 해서
--    계좌/주소/승인 정보가 공개 키로 노출되지 않게 한다.
-- ----------------------------------------------------------------------------
drop policy if exists vendors_update_own on public.vendors;

create policy vendors_update_admin on public.vendors
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy vendors_update_owner on public.vendors
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 업체 본인은 계좌 정보(bank_name, bank_account)만 바꿀 수 있다. (Profile.jsx 가 하는 일)
-- 승인 상태/사유/업체명 등의 자가 변경을 막는다. 관리자, DEFINER 함수, 서비스 키는 영향 없음.
create or replace function public.vendors_guard_non_admin()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'bank_name' - 'bank_account')
       is distinct from (to_jsonb(old) - 'bank_name' - 'bank_account') then
      raise exception 'vendors: 계좌 정보 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendors_guard_non_admin on public.vendors;
create trigger trg_vendors_guard_non_admin
  before update on public.vendors
  for each row execute function public.vendors_guard_non_admin();

-- 로그인 없는 사용자(anon): 배송 화면이 쓰는 4개 열만 읽기 허용.
-- (authenticated 는 그대로. 로그인한 사용자 사이의 노출은 2단계에서 뷰/RPC 로 다룬다.)
-- (PUBLIC 에서 상속된 테이블 단위 SELECT 가 있어도 열 제한이 무력화되지 않도록 PUBLIC 에서도 회수)
revoke select on public.vendors from public, anon;
grant select on public.vendors to authenticated;
grant select (id, company_name, user_id, phone) on public.vendors to anon;

commit;

-- ============================================================================
-- 적용 후 확인
--  1) 공개 키로 이제 막혔는지 (읽기 전용 확인, 개수만):
--     select count(*) from public.additional_income_items;   -- anon 으로는 0 행이어야 함(앱에서 확인)
--  2) 화면:
--     - 배송기사 링크(/delivery/주문ID): 주문 정보, 업체 정보, 기사 목록이 그대로 보이고 완료 처리가 된다
--       (이 화면이 읽는 vendors 4개 열이 막히지 않았는지 확인하는 것이 핵심)
--     - 업체 로그인: 자기 상품 등록/수정/삭제, 기사 등록/수정, 발주 목록 확인
--     - 팀장 로그인: 발주 화면에서 승인된 업체의 상품 목록이 보이고 발주가 된다
--     - 팀장 로그인: 장례 진행 보고서의 추가수입 항목 추가/삭제
--     - 관리자 로그인: 업체 승인/반려, 맞춤 패키지 승인
--     - 업체 로그인: 프로필의 계좌 정보 수정이 된다 / 업체 상태는 업체가 바꿀 수 없다
--
-- 되돌리기 (원래 상태로):
--  begin;
--  먼저 이 파일이 만든 정책/트리거를 지운다:
--    drop policy if exists additional_income_items_select on public.additional_income_items;
--    drop policy if exists additional_income_items_insert on public.additional_income_items;
--    drop policy if exists additional_income_items_delete on public.additional_income_items;
--    drop policy if exists custom_packages_select on public.custom_packages;
--    drop policy if exists custom_packages_insert on public.custom_packages;
--    drop policy if exists custom_packages_update on public.custom_packages;
--    drop policy if exists vendor_products_select on public.vendor_products;
--    drop policy if exists vendor_products_insert on public.vendor_products;
--    drop policy if exists vendor_products_update on public.vendor_products;
--    drop policy if exists vendor_products_delete on public.vendor_products;
--    drop policy if exists order_items_select on public.order_items;
--    drop policy if exists order_items_insert on public.order_items;
--    drop policy if exists delivery_drivers_select_anon on public.delivery_drivers;
--    drop policy if exists delivery_drivers_select_authenticated on public.delivery_drivers;
--    drop policy if exists delivery_drivers_insert on public.delivery_drivers;
--    drop policy if exists delivery_drivers_update on public.delivery_drivers;
--    drop policy if exists delivery_drivers_delete on public.delivery_drivers;
--    drop policy if exists vendors_update_admin on public.vendors;
--    drop policy if exists vendors_update_owner on public.vendors;
--    drop trigger if exists trg_vendors_guard_non_admin on public.vendors;
--    drop function if exists public.vendors_guard_non_admin();
--  그리고 원래 정책을 다시 만든다 (운영 DB 에서 2026-10-20 확인한 내용):
--    create policy "Anyone can view additional_income_items" on public.additional_income_items for select using (true);
--    create policy "TeamLeaders and Admins can insert/update additional_income_item" on public.additional_income_items for all using (true);
--    create policy "Packages viewable by everyone" on public.custom_packages for select using (true);
--    create policy "Packages insertable by authenticated users" on public.custom_packages for insert with check (auth.uid() = team_leader_id);
--    create policy "Packages updateable by authenticated users" on public.custom_packages for update using ((auth.role() = 'authenticated') and ((auth.uid() = team_leader_id) or true));
--    create policy products_readable_by_all on public.vendor_products for select using (true);
--    create policy products_managed_by_vendor on public.vendor_products for all using (true);
--    create policy order_items_readable on public.order_items for select using (true);
--    create policy order_items_insert on public.order_items for insert with check (true);
--    create policy drivers_readable on public.delivery_drivers for select using (true);
--    create policy drivers_managed_by_vendor on public.delivery_drivers for all using (true);
--    create policy vendors_update_own on public.vendors for update using (true);
--    grant select on public.vendors to anon;
--  commit;
-- ============================================================================

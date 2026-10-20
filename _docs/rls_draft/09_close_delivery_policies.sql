-- ============================================================================
-- 09_close_delivery_policies.sql  (DRAFT - 새 코드 배포 "후"에 적용. 08, 01, 06 이 먼저 적용돼 있어야 함)
-- 문제: orders / deliveries 의 정책이 USING true(INSERT/SELECT/UPDATE 누구나)라서 공개 키만으로
--       주문 목록 전체(주소, 금액, 고인명 연결 정보 포함)를 나열하고 주문/배송 기록을 수정할 수 있다.
-- 새 코드는 배송기사 화면이 08 의 함수(토큰 필요)만 쓰므로 로그인 없는 직접 접근이 사라진다.
-- 이 파일 적용 후:
--   orders      : 관리자 / 담당 팀장·그 master / 해당 업체 대표만 읽기. 팀장·관리자만 생성.
--                 수정은 관리자, 담당 팀장·master, 업체 대표(상태 관련 열만)
--   deliveries  : 읽기는 주문을 볼 수 있는 사람, 쓰기는 업체 대표/관리자
--   delivery_drivers : 로그인 없는 사용자 읽기 제거(활성 기사 목록은 08 함수가 돌려줌)
--   vendors     : 로그인 없는 사용자의 열 단위 읽기 제거
-- 참고: 배송 사진 업로드(storage 'reports' 버킷)의 익명 권한은 별도 영역이라 이 파일에서 다루지 않는다.
-- ============================================================================
begin;

-- 도우미: 주문의 업체 대표인가
create or replace function public.is_order_vendor(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
      join public.vendors v on v.id = o.vendor_id
     where o.id = p_order and v.user_id = auth.uid()
  );
$$;
revoke all on function public.is_order_vendor(uuid) from public, anon;
grant execute on function public.is_order_vendor(uuid) to authenticated;

-- 정책 이름이 환경마다 다를 수 있어, 대상 테이블의 정책을 전부 지우고 새로 만든다.
create or replace function pg_temp.drop_all_policies(p_table regclass)
returns void language plpgsql as $$
declare
  r record;
  v_name text := (select c.relname::text from pg_class c where c.oid = p_table);
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = v_name
  loop
    execute format('drop policy %I on public.%I', r.policyname, v_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------- orders
select pg_temp.drop_all_policies('public.orders');

create policy orders_select on public.orders
  for select to authenticated
  using (public.can_access_order(id));

-- 발주 생성: 관리자, 또는 본인이 팀장으로 지정된 발주(OrderModal 이 team_leader_id = 본인으로 넣음)
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (team_leader_id = (select auth.uid()) and (select public.my_role()) in ('master', 'leader'))
  );

create policy orders_update on public.orders
  for update to authenticated
  using (
    (select public.is_admin())
    or public.is_order_leader(id)
    or public.owns_vendor(vendor_id)
  )
  with check (
    (select public.is_admin())
    or public.is_order_leader(id)
    or public.owns_vendor(vendor_id)
  );

-- 관리자가 아닌 직접 수정은 주문 "진행 상태" 관련 열만 허용(금액/업체/팀장 변조 방지).
create or replace function public.orders_guard_non_admin()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'status' - 'confirmed_at' - 'delivered_at')
       is distinct from (to_jsonb(old) - 'status' - 'confirmed_at' - 'delivered_at') then
      raise exception 'orders: 진행 상태 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_guard_non_admin on public.orders;
create trigger trg_orders_guard_non_admin
  before update on public.orders
  for each row execute function public.orders_guard_non_admin();

-- ------------------------------------------------------------------ deliveries
select pg_temp.drop_all_policies('public.deliveries');

create policy deliveries_select on public.deliveries
  for select to authenticated
  using (public.can_access_order(order_id));

create policy deliveries_insert on public.deliveries
  for insert to authenticated
  with check ((select public.is_admin()) or public.is_order_vendor(order_id));

-- ------------------------------------------------------------ delivery_drivers
-- 06 에서 만든 anon 읽기 정책 제거 (활성 기사 목록은 get_delivery_order 가 돌려준다)
drop policy if exists delivery_drivers_select_anon on public.delivery_drivers;

-- --------------------------------------------------------------------- vendors
-- 로그인 없는 사용자의 열 단위 읽기도 더 이상 필요 없다.
-- (테이블 단위 REVOKE 가 열 권한도 함께 회수하지만, 06 에서 준 열 권한을 명시해 두 번 확인한다)
revoke select on public.vendors from anon;
revoke select (id, company_name, user_id, phone) on public.vendors from anon;

commit;

-- ============================================================================
-- 적용 후 확인
--  - 업체 로그인: 발주 목록(항목 포함)이 보이고, 확인/납품 완료 처리가 된다.
--  - 팀장 로그인: 발주 화면에서 업체 선택 후 발주가 되고, 대시보드의 발주 목록이 보인다.
--  - 배송기사 링크(새 링크, ?t= 토큰 포함): 열리고 완료 처리가 되고 팀장/업체에 알림이 간다.
--  - 토큰 없는 옛 링크: "유효하지 않은 배송 링크입니다"가 보인다(의도한 동작).
-- 되돌리기:
--   begin;
--   drop trigger if exists trg_orders_guard_non_admin on public.orders;
--   drop function if exists public.orders_guard_non_admin();
--   drop policy if exists orders_select on public.orders;  drop policy if exists orders_insert on public.orders;
--   drop policy if exists orders_update on public.orders;
--   drop policy if exists deliveries_select on public.deliveries; drop policy if exists deliveries_insert on public.deliveries;
--   create policy orders_readable on public.orders for select using (true);
--   create policy orders_insert on public.orders for insert with check (true);
--   create policy orders_update on public.orders for update using (true);
--   create policy deliveries_readable on public.deliveries for select using (true);
--   create policy deliveries_insert on public.deliveries for insert with check (true);
--   create policy deliveries_update on public.deliveries for update using (true);
--   create policy delivery_drivers_select_anon on public.delivery_drivers for select to anon using (is_active);
--   grant select (id, company_name, user_id, phone) on public.vendors to anon;
--   commit;
-- ============================================================================

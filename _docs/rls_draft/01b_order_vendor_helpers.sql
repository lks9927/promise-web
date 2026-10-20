-- ============================================================================
-- 01b_order_vendor_helpers.sql  (DRAFT - 01_prerequisites.sql 다음에 적용)
-- 발주/업체 관련 정책에서 쓰는 SECURITY DEFINER 도우미 함수. 추가만 하며 기존 동작을 바꾸지 않는다.
-- (원래 06 안에 있던 것을 분리했다: 08 의 함수가 새 코드 배포 "전에" 필요하기 때문)
-- ============================================================================
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

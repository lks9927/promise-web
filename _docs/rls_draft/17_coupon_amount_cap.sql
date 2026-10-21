-- ============================================================================
-- 17_coupon_amount_cap.sql  (DRAFT - 코드 변경 없음, 지금 바로 적용 가능)
-- 선행: 12 (coupons 정책), 01 (is_admin).
--
-- 문제: 쿠폰 최대 금액(system_config.max_coupon_amount, 현재 50000)을 "화면"에서만 검사한다.
--       딜러/팀장이 화면을 거치지 않고 직접 요청하면 어떤 금액(예: 1천만 원)의 쿠폰도 발급할 수 있다.
-- 해결: 쿠폰 발급 정책(coupons_insert)에 금액 검사를 추가한다. 관리자는 제한 없음.
--       비관리자는 1원 이상 ~ system_config.max_coupon_amount 이하만. 숫자는 SQL 에 박지 않고 설정값만 쓴다
--       (설정이 없거나 숫자가 아니면 비관리자는 발급 불가). 한도는 관리자 설정 화면에서 바꾸면 바로 반영된다.
-- 12 의 coupons_insert 와 조건이 같고 금액 검사만 추가했다. 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

-- system_config 는 일반 사용자가 직접 읽을 수 없으므로 소유자 권한 함수로 한도만 읽는다.
create or replace function public.coupon_amount_ok(p_amount integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_amount is not null
     and p_amount > 0
     and p_amount <= (select nullif(regexp_replace(c.value, '[^0-9]', '', 'g'), '')::integer
                        from public.system_config c where c.key = 'max_coupon_amount');
$$;

revoke all on function public.coupon_amount_ok(integer) from public, anon;
grant execute on function public.coupon_amount_ok(integer) to authenticated, service_role;

drop policy if exists coupons_insert on public.coupons;

create policy coupons_insert on public.coupons
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      issued_by = (select auth.uid())
      and status = 'issued'
      and case_id is null
      and public.coupon_amount_ok(amount)
      and (select public.my_role()) in ('dealer', 'leader', 'master')
      and public.is_approved_partner()
    )
  );

commit;

-- ============================================================================
-- 되돌리기 (12 의 원래 정책):
--   begin;
--   drop policy if exists coupons_insert on public.coupons;
--   create policy coupons_insert on public.coupons
--     for insert to authenticated
--     with check (
--       (select public.is_admin())
--       or (
--         issued_by = (select auth.uid())
--         and status = 'issued'
--         and case_id is null
--         and (select public.my_role()) in ('dealer', 'leader', 'master')
--         and public.is_approved_partner()
--       )
--     );
--   drop function if exists public.coupon_amount_ok(integer);
--   commit;
-- ============================================================================

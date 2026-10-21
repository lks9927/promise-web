-- DRYRUN: 17 을 적용 + 역할별 시험 후 전부 롤백. 운영 DB 에 아무것도 남지 않는다. 결과는 오류 문구(DRYRUN_RESULT)로 나온다.
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

create function pg_temp.try(p_sql text, p_uid uuid, p_role text) returns text
language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || p_role;
  execute p_sql;
  get diagnostics n = row_count;
  execute 'reset role';
  return 'OK rows=' || n;
exception when others then
  execute 'reset role';
  return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 70);
end;
$f$;

do $t$
declare
  res text := '';
  r record;
  amt int;
begin
  res := res || E'\n한도 설정값: ' || coalesce((select value from public.system_config where key = 'max_coupon_amount'), '(없음 -> 비관리자 발급 불가)');
  res := res || E'\n함수 판정: 1원=' || public.coupon_amount_ok(1) || ', 한도=' || public.coupon_amount_ok((select nullif(value,'')::int from public.system_config where key = 'max_coupon_amount'))
        || ', 한도+1=' || public.coupon_amount_ok((select nullif(value,'')::int from public.system_config where key = 'max_coupon_amount') + 1)
        || ', 0=' || public.coupon_amount_ok(0) || ', -1=' || public.coupon_amount_ok(-1) || ', null=' || coalesce(public.coupon_amount_ok(null)::text, 'null');
  -- 42501 = 정책이 막음, 그 외(예: 23502 필수 열 없음, 23505 중복)는 정책을 통과했다는 뜻이다.
  for r in
    select pt.user_id as id, p.role from public.partners pt join public.profiles p on p.id = pt.user_id
     where pt.status = 'approved' and p.role in ('dealer','leader','master') order by p.role limit 3
  loop
    res := res || E'\n== 승인된 ' || r.role || E' ==';
    foreach amt in array array[1000, 50000, 50001, 10000000, 0, -5] loop
      res := res || E'\n  금액 ' || amt || ': ' || pg_temp.try(format('insert into public.coupons(code, amount, status, issued_by) values (%L, %s, ''issued'', %L)', 'DRY' || amt, amt, r.id), r.id, 'authenticated');
    end loop;
  end loop;
  for r in select id from public.profiles where role = 'admin' limit 1 loop
    res := res || E'\n== admin ==';
    res := res || E'\n  금액 10000000(관리자는 제한 없음): ' || pg_temp.try(format('insert into public.coupons(code, amount, status, issued_by) values (%L, 10000000, ''issued'', %L)', 'DRYADMIN', r.id), r.id, 'authenticated');
  end loop;
  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

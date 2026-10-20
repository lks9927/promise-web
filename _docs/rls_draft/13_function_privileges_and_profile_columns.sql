-- ============================================================================
-- 13_function_privileges_and_profile_columns.sql  (DRAFT - 새 코드 배포 "후", STAGE2 의 맨 앞)
-- 선행: 01, 01b (is_admin, is_my_report 등). 이 파일을 12 보다 먼저 적용한다.
--
-- 운영 DB 확인(2026-10-20)으로 찾은 "지금 실제로 열려 있는" 구멍을 닫는다:
--  (1) SECURITY DEFINER 함수 18개가 모두 "로그인 없이도" 실행 가능(기본 PUBLIC/anon 실행 권한).
--      그중 accept_bidding / pass_bidding 은 호출자가 누구인지 확인하지 않아, 공개 키만 있으면
--      장례 건을 임의의 팀장에게 배정하거나 남의 입찰을 대신 넘길 수 있다.
--      cleanup_orphan_auth 는 프로필이 없는 Auth 계정을 삭제한다(로그인 없이 호출 가능).
--  (2) profiles.admin_level 의 기본값이 'super' 라서 모든 계정(고객/딜러/팀장 포함)이 'super'.
--      (코드는 이 열을 쓰지 않는다. 관리자 판별은 role 로 한다.) 가입 조건과 충돌하므로 정리한다.
--  (3) 로그인한 사용자가 profiles.password(레거시 비밀번호 해시)를 다른 사람 것까지 읽을 수 있게 되는 것을 막는다.
--      -> password 열의 읽기 권한만 회수하고, 화면은 열 목록을 명시해서 읽는다(src/lib/profileColumns.js).
-- 하나의 트랜잭션: 실패하면 전부 취소된다. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

-- ---------------------------------------------------------------- (2) admin_level
alter table public.profiles alter column admin_level drop default;
update public.profiles set admin_level = null where role is distinct from 'admin';

-- ------------------------------------------------- (1) 입찰 함수: 호출자 검증 추가
-- 긴 원본 본문을 복사하지 않기 위해, 원본을 *_internal 로 이름만 바꿔 두고
-- 같은 이름의 얇은 함수가 호출자를 검증한 뒤 원본을 부른다. (다시 실행해도 안전)
do $$
begin
  -- 정확한 시그니처로 확인한다(같은 이름의 다른 버전이 있어도 엉뚱한 것을 바꾸지 않게).
  -- 운영 DB 조회(2026-10-20): 이 두 함수를 부르는 다른 DB 함수/트리거는 없고, 예약 작업 3개는
  -- check_report_delay_alarms / check_no_bid_alarms / process_bidding_timeouts 만 부른다.
  if to_regprocedure('public.accept_bidding(uuid,uuid)') is not null
     and to_regprocedure('public.accept_bidding_internal(uuid,uuid)') is null then
    alter function public.accept_bidding(uuid, uuid) rename to accept_bidding_internal;
  end if;
  if to_regprocedure('public.pass_bidding(uuid,uuid,text)') is not null
     and to_regprocedure('public.pass_bidding_internal(uuid,uuid,text)') is null then
    alter function public.pass_bidding(uuid, uuid, text) rename to pass_bidding_internal;
  end if;
end $$;

-- 배정 수락: 본인, 본인의 하위(master 가 대신), 또는 관리자만. 대상은 팀장/master 여야 한다.
create or replace function public.accept_bidding(p_case_id uuid, p_leader_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not (public.is_admin() or p_leader_id = auth.uid() or public.is_my_report(p_leader_id)) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_leader_id and pr.role in ('leader', 'master')) then
    return 'NOT_AVAILABLE';
  end if;
  return public.accept_bidding_internal(p_case_id, p_leader_id);
end;
$$;

-- 패스: 본인 또는 관리자만 (남의 입찰을 대신 넘길 수 없다)
create or replace function public.pass_bidding(p_case_id uuid, p_leader_id uuid, p_reason text default '수동 패스')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not (public.is_admin() or p_leader_id = auth.uid()) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  return public.pass_bidding_internal(p_case_id, p_leader_id, p_reason);
end;
$$;

-- --------------------------------------- (1) 모든 public 함수의 실행 권한 정리
-- 앞으로 만드는 함수가 자동으로 로그인 없이 실행 가능해지지 않게 기본 권한도 바꾼다.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

do $$
declare
  r record;
  anon_ok text[] := array[
    'submit_emergency_case',      -- 홈/쿠폰 링크의 장례 접수
    'get_public_rolling_cases',   -- 홈의 진행 현황 보드
    'check_phone_available',      -- 가입 화면의 전화번호 중복 확인
    'get_coupon_public',          -- 쿠폰 링크 조회
    'get_delivery_order',         -- 배송기사 링크 조회 (토큰 필요)
    'complete_delivery',          -- 배송기사 완료 처리 (토큰 필요)
    'request_password_reset'      -- 로그인 화면의 비밀번호 초기화 요청
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')  -- 확장 소속 함수 제외
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    if r.proname = any (anon_ok) then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
    elsif r.proname like '%\_internal' then
      -- 호출자 검증을 거치는 래퍼만 부를 수 있다 (직접 호출 불가)
      execute format('revoke all on function %s from authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
    end if;
  end loop;
end $$;

-- ------------------------------------ (3) profiles: password 열 읽기 권한만 회수
-- 로그인 없는 사용자는 profiles 에 접근할 수 없다. 로그인한 사용자는 password 를 뺀 모든 열을 읽는다.
-- (INSERT/UPDATE 권한은 그대로이며, 본인 외 수정은 RLS 정책과 가드 트리거가 막는다.)
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name <> 'password';

  execute 'revoke select on public.profiles from public, anon, authenticated';
  execute format('grant select (%s) on public.profiles to authenticated', cols);
end $$;
revoke insert, update, delete on public.profiles from anon;

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용)
--  1) 로그인 없이 실행 가능한 함수가 정확히 7개인지:
--     select p.proname from pg_proc p
--      where p.pronamespace='public'::regnamespace and p.prokind='f'
--        and has_function_privilege('anon', p.oid, 'execute')
--        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--      order by 1;
--  2) 입찰 함수: 팀장으로 로그인해 배정 수락/패스가 되는지(본인 건), 남의 ID 로는 권한 오류.
--  3) profiles 에서 password 를 읽으려 하면 거부되는지 (관리자 포함, 로그인한 사용자는 모두):
--     화면은 열 목록을 명시해서 읽으므로 정상 동작한다. (select * 를 쓰는 새 코드를 만들지 말 것)
--
-- 되돌리기:
--   begin;
--   -- 입찰 함수 원복
--   drop function if exists public.accept_bidding(uuid, uuid);
--   drop function if exists public.pass_bidding(uuid, uuid, text);
--   alter function public.accept_bidding_internal(uuid, uuid) rename to accept_bidding;
--   alter function public.pass_bidding_internal(uuid, uuid, text) rename to pass_bidding;
--   -- 함수 권한을 예전(모두 실행 가능)으로
--   do $$ declare r record; begin
--     for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
--              and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
--       execute format('grant execute on function %s to public, anon, authenticated, service_role', r.sig);
--     end loop; end $$;
--   alter default privileges for role postgres in schema public grant execute on functions to anon;
--   -- profiles 열 권한 원복
--   grant select on public.profiles to anon, authenticated;
--   -- admin_level 기본값 원복(원래 'super'): 필요하면
--   -- alter table public.profiles alter column admin_level set default 'super';
--   commit;
-- ============================================================================

-- DRYRUN: STAGE2 를 (begin/commit 없이) 적용 + 시험 후 전부 롤백. 오류 문구에 시험 결과가 나온다.
-- ============================================================================
-- STAGE2_apply_after_deploy.sql  (자동 조립 파일 - 원본: 13, 03, 02, 06, 09, 10, 12)
-- 새 코드를 "배포한 뒤에" 적용한다. STAGE1 이 먼저 적용돼 있어야 한다.
--   13: 로그인 없이도 실행되던 서버 함수 정리, 입찰 함수 호출자 검증, 비밀번호 열 숨김
--   03: 장례 등록 함수 보강(쿠폰 검증, 중복 방지, 딜러 변조 방지)
--   02: RLS 1단계(정산 등 6개 테이블)
--   06: 열려 있던 정책 정리(발주 항목, 업체 상품, 업체 수정 등)
--   09: 발주/배송 정책 닫기 (공개 키로 주문 목록 전체를 읽던 구멍)
--   10: system_config 에 RLS (공개 키로 모든 설정이 읽히고 쓰이던 구멍)
--   12: 핵심 테이블 RLS (profiles, partners, funeral_cases, coupons, notifications)
-- 적용 직후 홈 화면의 장례 접수, 쿠폰 링크 접수, 관리자 정산, 업체/팀장 발주 화면, 새 배송 링크를 확인한다.
-- 문제가 생기면 99_rollback_phase1_rls.sql -> 98_rollback_function_changes.sql (09 되돌리기는 09 파일 맨 아래).
-- ============================================================================

-- ################ 13_function_privileges_and_profile_columns.sql ################
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
  -- 대상은 팀장/master 이면서 승인된 파트너여야 한다(승인 대기 계정은 수락할 수 없다)
  if not exists (select 1 from public.profiles pr where pr.id = p_leader_id and pr.role in ('leader', 'master'))
     or not exists (select 1 from public.partners pt where pt.user_id = p_leader_id and pt.status = 'approved') then
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
--   alter default privileges for role postgres in schema public grant execute on functions to public;
--   alter default privileges for role postgres in schema public grant execute on functions to anon;
--   -- profiles 열 권한 원복
--   grant select on public.profiles to anon, authenticated;
--   -- admin_level 기본값 원복(원래 'super'): 필요하면
--   -- alter table public.profiles alter column admin_level set default 'super';
--   commit;
-- ============================================================================

-- ################ 03_submit_emergency_case_v2.sql ################
-- ============================================================================
-- 03_submit_emergency_case_v2.sql  (DRAFT - 01_prerequisites.sql 적용 후 실행)
-- 장례 등록 함수 보강. 시그니처(인자/반환 uuid)는 그대로라서 화면 코드는 바꾸지 않는다.
-- 호출 위치: Home.jsx(anon), CouponLanding.jsx(anon), DealerDashboard.jsx(로그인, p_dealer_id=본인)
--
-- 현재 함수(운영 DB 확인, 저장소 01_security_migration.sql 과 동일)의 문제:
--   1) 쿠폰을 검증하지 않는다: 없는 코드/이미 쓴 코드로도 접수가 생긴다.
--   2) 같은 링크를 다시 누르면 새 접수가 또 생긴다(중복 접수, 팀장 호출 중복).
--   3) p_dealer_id 를 요청 값 그대로 믿는다(남의 딜러 ID 로 실적 귀속 변조 가능).
--      (딜러 자동 지정 트리거는 dealer_id 가 비어 있을 때만 쿠폰 딜러를 넣는다)
--   4) 입력 길이/호출 횟수 제한이 없다.
--   5) 쿠폰 갱신이 status='active' 일 때만 동작하는데 실제 쿠폰 상태값은 'issued' 다
--      (사용 처리는 trg_auto_update_coupon 트리거가 대신한다).
-- 동작 요약:
--   - 쿠폰이 있으면: 존재/미사용 확인. 딜러는 기존 트리거와 같은 규칙(요청에 딜러가 없을 때만
--     쿠폰 발행자)으로 정한다. 이미 사용된 쿠폰이라도 "같은 전화번호의 기존 접수"가 있으면
--     새로 만들지 않고 그 접수 ID 를 돌려준다(멱등).
--   - 쿠폰이 없으면: 같은 번호 + 같은 장소 + 같은 상품 + 같은 딜러로 10분 안에 만든 접수가
--     있으면 그 ID 를 돌려준다(더블클릭 방지).
--   - p_dealer_id 는 "로그인한 본인" 또는 관리자만, 그리고 대상이 딜러/팀장/master 일 때만 허용.
--   - 같은 번호 1시간 5건 이상이면 거부.
--   - 의도적으로 "전체 호출 횟수 제한"은 넣지 않았다: 익명 한 명이 한도를 채워 정상 고객의
--     접수까지 막을 수 있기 때문이다. 대량 호출 방어는 서버 앞단(IP 제한/CAPTCHA)에서 한다.
-- ============================================================================
create or replace function public.submit_emergency_case(
  p_name text,
  p_phone text,
  p_location text,
  p_package_name text,
  p_coupon_code text default null,
  p_dealer_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid         uuid := auth.uid();
  v_name        text := btrim(coalesce(p_name, ''));
  v_phone       text := regexp_replace(coalesce(p_phone, ''), '[^0-9-]', '', 'g');
  v_digits      text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_location    text := btrim(coalesce(p_location, ''));
  v_package     text := btrim(coalesce(p_package_name, ''));
  v_code        text := upper(btrim(coalesce(p_coupon_code, '')));
  v_coupon      public.coupons%rowtype;
  v_dealer      uuid;
  v_customer_id uuid;
  v_case_id     uuid;
begin
  -- 1) 입력 검증 (기존 화면이 보내던 값은 통과하도록 느슨하게)
  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception '이름을 올바르게 입력해주세요.' using errcode = '22023';
  end if;
  if char_length(v_digits) < 9 or char_length(v_digits) > 13 then
    raise exception '연락처를 올바르게 입력해주세요.' using errcode = '22023';
  end if;
  if char_length(v_location) > 200 or char_length(v_package) > 100 then
    raise exception '입력값이 너무 깁니다.' using errcode = '22023';
  end if;

  -- 2) 같은 번호의 동시 호출(더블클릭)을 한 줄로 세운다. (64비트 해시)
  perform pg_advisory_xact_lock(hashtextextended('submit_emergency_case:' || v_digits, 0));

  -- 3) 딜러 지정은 "로그인한 본인 또는 관리자"만, 대상은 딜러/팀장/master 만 허용
  if p_dealer_id is not null then
    if v_uid is null or (p_dealer_id <> v_uid and not public.is_admin()) then
      raise exception '딜러 지정 권한이 없습니다.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p
                    where p.id = p_dealer_id and p.role in ('dealer', 'leader', 'master')) then
      raise exception '딜러 지정 권한이 없습니다.' using errcode = '42501';
    end if;
    v_dealer := p_dealer_id;
  end if;

  -- 5) 쿠폰 검증 (행을 잠가 동시 사용 방지)
  if v_code <> '' then
    select * into v_coupon from public.coupons where code = v_code for update;
    if not found then
      raise exception '유효하지 않은 쿠폰입니다.';
    end if;

    if v_coupon.case_id is not null or coalesce(v_coupon.status, '') not in ('issued', 'active') then
      -- 이미 사용된 쿠폰: 같은 번호로 접수된 건이면 그 건을 돌려준다(새로고침/재클릭 안전).
      select fc.id into v_case_id
        from public.funeral_cases fc
        join public.profiles p on p.id = fc.customer_id
       where fc.id = v_coupon.case_id
         and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_digits
       limit 1;
      if v_case_id is not null then
        return v_case_id;
      end if;
      raise exception '이미 사용된 쿠폰입니다.';
    end if;

    -- 딜러: 기존 트리거(trg_auto_set_dealer)와 같은 규칙. 요청에 딜러가 없을 때만 쿠폰 발행자.
    -- (요청의 딜러는 위 3)에서 본인/관리자로 이미 검증됨)
    if v_dealer is null and v_coupon.issued_by is not null then
      v_dealer := v_coupon.issued_by;
    end if;
  else
    -- 6) 쿠폰 없는 접수: 같은 번호/장소/상품/딜러로 10분 안의 접수가 있으면 그것을 돌려준다.
    select fc.id into v_case_id
      from public.funeral_cases fc
      join public.profiles p on p.id = fc.customer_id
     where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_digits
       and fc.created_at > now() - interval '10 minutes'
       and fc.status <> 'cancelled'
       and fc.location is not distinct from v_location
       and fc.package_name is not distinct from v_package
       and fc.dealer_id is not distinct from v_dealer
     order by fc.created_at desc
     limit 1;
    if v_case_id is not null then
      return v_case_id;
    end if;

    -- 같은 번호 1시간 5건 초과 거부
    if (select count(*) from public.funeral_cases fc
          join public.profiles p on p.id = fc.customer_id
         where regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = v_digits
           and fc.created_at > now() - interval '1 hour') >= 5 then
      raise exception '같은 번호로 접수가 너무 많습니다. 전화로 문의해주세요.';
    end if;
  end if;

  -- 7) 고객 프로필 찾기/만들기 (기존 로직 유지: 번호가 같은 customer 재사용)
  select id into v_customer_id
    from public.profiles
   where role = 'customer'
     and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits
   limit 1;

  if v_customer_id is null then
    v_customer_id := gen_random_uuid();
    insert into public.profiles (id, name, phone, role)
    values (v_customer_id, v_name, v_phone, 'customer');
  end if;

  -- 8) 장례 접수 건 생성 (트리거들이 딜러 지정/쿠폰 사용 처리/배정을 이어서 수행)
  insert into public.funeral_cases
    (customer_id, dealer_id, location, package_name, status, funnel_type, coupon_code)
  values
    (v_customer_id, v_dealer, v_location, v_package, 'requested',
     case when v_dealer is not null then 'partner_referral' else 'organic_search' end,
     nullif(v_code, ''))
  returning id into v_case_id;

  -- 9) 쿠폰 사용 처리(트리거가 이미 했다면 0행이라 무해)
  if v_code <> '' then
    update public.coupons
       set case_id = v_case_id, status = 'used'
     where id = v_coupon.id and status in ('issued', 'active');
  end if;

  return v_case_id;
end;
$$;

revoke all on function public.submit_emergency_case(text, text, text, text, text, uuid) from public;
grant execute on function public.submit_emergency_case(text, text, text, text, text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 적용 후 직접 확인할 것 (테스트 번호/쿠폰으로, 운영 데이터 말고):
--  1) 쿠폰 없이 같은 번호로 연속 2번 호출 -> 같은 case id 가 돌아오고 접수가 1건만 생긴다.
--  2) 존재하지 않는 쿠폰 코드 -> '유효하지 않은 쿠폰입니다.' 오류.
--  3) 정상 쿠폰 1회 -> 접수 생성, 쿠폰 status 가 used. 같은 쿠폰+같은 번호 재호출 -> 같은 case id.
--  4) 같은 쿠폰 + 다른 번호 -> '이미 사용된 쿠폰입니다.' 오류.
--  5) anon 으로 p_dealer_id 를 넣어 호출 -> '딜러 지정 권한이 없습니다.' 오류.
-- ----------------------------------------------------------------------------

-- ################ 02_rls_phase1.sql ################
-- ============================================================================
-- 02_rls_phase1.sql  (DRAFT - 01_prerequisites.sql 적용 후에만 실행)
-- 1단계: "로그인 없는 사용자(anon)가 직접 접근하지 않는" 테이블 6개에만 RLS 적용.
--   deposits, payout_requests, tax_invoices, bidding_history, settlements, flower_orders
-- 코드 조사 결과: 위 테이블은 로그인한 사용자만 브라우저에서 접근하고,
-- deposits/payout_requests/tax_invoices/bidding_history 는 브라우저 접근이 아예 없다.
-- 서버(서비스 키), DB 트리거/DEFINER 함수는 RLS 를 우회하므로 영향 없다.
-- 이 파일은 하나의 트랜잭션이다. 실패하면 전체가 취소된다.
-- ============================================================================

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


-- ============================================================================
-- 적용 직후 확인 (읽기 전용)
-- select relname, relrowsecurity from pg_class
--  where relnamespace='public'::regnamespace and relname in
--  ('deposits','payout_requests','tax_invoices','bidding_history','settlements','flower_orders');
-- ============================================================================

-- ################ 06_tighten_open_tables.sql ################
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

-- ----------------------------------------------------------------------------
-- 도우미 함수(my_role, owns_vendor, vendor_is_approved, is_order_leader, can_access_order)는
-- 01b_order_vendor_helpers.sql 로 분리했다. 01, 01b 를 먼저 적용해야 한다.

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

-- ################ 09_close_delivery_policies.sql ################
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

-- ################ 10_system_config_policies.sql ################
-- ============================================================================
-- 10_system_config_policies.sql  (DRAFT - 01 이 먼저 적용돼 있어야 함. 새 코드 배포 후(STAGE2))
-- system_config 에 RLS 를 켜고 "공개해도 되는 키만" 로그인 없이 읽게 한다.
-- 지금은 RLS 가 꺼져 있어 공개 키로 모든 설정(복구 키, 문자 수신 번호, 배정 순서 등)이 읽히고 쓰인다.
-- 코드 조사(2026-10-20) 결과 읽는 키:
--   로그인 없음(홈, 쿠폰 링크): funeral_packages, footer_* 8개
--   로그인한 딜러/팀장/master: max_coupon_per_batch, max_coupon_amount, flower_order_required, show_top_menu
--   그 밖의 모든 키(관리자 설정 화면): 관리자만. 서버(서비스 키, Edge Function)는 RLS 를 우회한다.
-- 쓰기(upsert)는 관리자만.
-- ============================================================================

alter table public.system_config enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'system_config'
  loop
    execute format('drop policy %I on public.system_config', r.policyname);
  end loop;
end $$;

-- 로그인 없이 읽는 공개 키 (홈 상품 목록과 하단 사업자 정보)
create policy system_config_select_public on public.system_config
  for select to anon, authenticated
  using (key in (
    'funeral_packages',
    'footer_phone', 'footer_hours', 'footer_email', 'footer_company_name',
    'footer_ceo_name', 'footer_business_number', 'footer_address', 'footer_mail_order'
  ));

-- 로그인한 사용자가 화면 동작에 쓰는 키
create policy system_config_select_app on public.system_config
  for select to authenticated
  using (key in ('max_coupon_per_batch', 'max_coupon_amount', 'flower_order_required', 'show_top_menu'));

-- 관리자: 모두 읽고 쓰기 (is_admin 은 01 에서 authenticated 에게만 실행 권한을 준다)
create policy system_config_admin_all on public.system_config
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- 적용 후 확인:
--  - 로그아웃 상태로 홈을 열어 상품 목록과 하단 정보가 보인다.
--  - 관리자로 설정 화면을 열어 저장이 된다. 딜러로 쿠폰 발급 화면의 한도 값이 보인다.
--  - 새 설정 키를 화면에서 쓰게 되면 이 파일의 목록에 추가해야 로그인 없이/로그인 후 읽힌다.
-- 되돌리기:
--   begin;
--   drop policy if exists system_config_select_public on public.system_config;
--   drop policy if exists system_config_select_app    on public.system_config;
--   drop policy if exists system_config_admin_all     on public.system_config;
--   alter table public.system_config disable row level security;
--   commit;

-- ################ 12_rls_phase2_core_tables.sql ################
-- ============================================================================
-- 12_rls_phase2_core_tables.sql  (DRAFT - 새 코드 배포 "후"에 적용 / STAGE2 맨 뒤)
-- 선행: 01, 01b(도우미 함수), 03, 06, 07, 08, 09, 10, 11 이 먼저 적용돼 있어야 한다.
--
-- 2단계 RLS "1차": 아직 RLS 가 꺼져 있는 핵심 테이블 5개와 진행 보고서 읽기를 닫는다.
--   profiles, partners, funeral_cases, coupons, notifications  (+ funeral_progress_reports 의 공개 읽기)
-- 핵심 효과: 로그인 없는(anon) 공개 키로는 위 테이블을 읽거나 쓸 수 없게 된다.
--   로그인 없는 화면(쿠폰 링크, 배송기사, 비밀번호 초기화 요청, 홈 접수, 롤링 현황)은 이미
--   서버 함수(DEFINER)로 대체돼 영향이 없다. 고객 /mypage 는 고객이 로그인할 수 없는 구조라 원래 쓸 수 없다.
-- 그 위에 로그인한 사용자의 범위를 상하 관계(partners.master_id)와 담당 장례로 제한한다.
-- 의도적으로 "열어 둔" 것(다음 단계에서 보기/함수로 좁힘):
--   * profiles 읽기: 로그인한 사용자 전체(여러 화면이 다른 사람의 이름/전화를 join 으로 읽는다).
--     계좌/사업자 정보 같은 민감 열도 로그인한 파트너끼리는 읽힌다.
--   * funeral_cases 수정: 관련된 팀장/상위 master 가 모든 열을 수정할 수 있다(열 단위 제한은 코드 영향이 커서 보류).
--   * notifications 생성: 로그인한 사용자가 다른 사람에게 알림을 만들 수 있다(발신자 위조 가능).
-- 서버(서비스 키), 트리거, DEFINER 함수는 RLS 를 우회한다.
-- 하나의 트랜잭션: 실패하면 전부 취소된다. 되돌리기는 파일 맨 아래.
-- ============================================================================

-- 도우미 함수(is_my_report, is_my_master, can_see_case)는 01b_order_vendor_helpers.sql 로 옮겼다. 01, 01b 를 먼저 적용해야 한다.

-- 기존 정책 이름과 상관없이 대상 테이블의 정책을 전부 지우고 새로 만든다.
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

-- ============================================================================
-- profiles
-- ============================================================================
select pg_temp.drop_all_policies('public.profiles');
alter table public.profiles enable row level security;

-- 읽기: 로그인한 사용자 (위 설명 참조). 로그인 없는 접근은 없다.
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

-- 가입 직후 본인 행 생성(가입 화면은 Auth 가입 직후 로그인 상태로 실행). 권한 있는 역할은 관리자만 부여.
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      id = (select auth.uid())
      and role in ('leader', 'dealer', 'vendor', 'customer')
      and admin_level is null          -- 관리자 등급 값은 가입 때 넣을 수 없다
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()))
  with check ((select public.is_admin()) or id = (select auth.uid()));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select public.is_admin()));

-- 본인 수정이어도 권한/식별 열은 못 바꾼다 (역할 상승 방지). 관리자, DEFINER 함수, 서비스 키는 영향 없음.
create or replace function public.profiles_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if current_user = 'authenticated' and not public.is_admin() then
    foreach k in array array['id', 'role', 'admin_level', 'password'] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'profiles: % 항목은 변경할 수 없습니다.', k using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_guard_non_admin on public.profiles;
create trigger trg_profiles_guard_non_admin
  before update on public.profiles
  for each row execute function public.profiles_guard_non_admin();

-- ============================================================================
-- partners
-- ============================================================================
select pg_temp.drop_all_policies('public.partners');
alter table public.partners enable row level security;

-- 읽기: 관리자 / 본인 / 내 하위 / 내 상위
create policy partners_select on public.partners
  for select to authenticated
  using (
    (select public.is_admin())
    or user_id = (select auth.uid())
    or master_id = (select auth.uid())
    or public.is_my_master(user_id)
  );

-- 가입: 본인 행을 "대기(pending) / C 등급 / 상위 없음"으로만 만들 수 있다. 그 밖은 관리자.
create policy partners_insert on public.partners
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (user_id = (select auth.uid()) and grade = 'C' and status = 'pending' and master_id is null)
  );

create policy partners_update on public.partners
  for update to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()))
  with check ((select public.is_admin()) or user_id = (select auth.uid()));

create policy partners_delete on public.partners
  for delete to authenticated
  using ((select public.is_admin()));

-- 본인은 계좌, 근무 상태, 주소/지역만 바꿀 수 있다 (등급, 승인 상태, 상위, 하위 한도는 관리자만).
-- (허용 목록 방식이라 partners/coupons/notifications 에 새 열을 추가해 화면에서 수정하게 되면 이 목록에도 넣어야 한다.
--  새 열이 자동으로 보호되는 쪽(실패하면 막힘)을 일부러 택했다. 현재 이 테이블들에는 updated_at 같은 자동 갱신 열이 없다.)
create or replace function public.partners_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'bank_account' - 'current_status' - 'is_working' - 'address' - 'detail_address' - 'region')
       is distinct from
       (to_jsonb(old) - 'bank_account' - 'current_status' - 'is_working' - 'address' - 'detail_address' - 'region') then
      raise exception 'partners: 등급/상태/상위 정보는 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_partners_guard_non_admin on public.partners;
create trigger trg_partners_guard_non_admin
  before update on public.partners
  for each row execute function public.partners_guard_non_admin();

-- ============================================================================
-- funeral_cases   (현재 정책 1개: 로그인한 사용자 전체 읽기 -> 관련자로 제한)
-- ============================================================================
select pg_temp.drop_all_policies('public.funeral_cases');
alter table public.funeral_cases enable row level security;

create policy funeral_cases_select on public.funeral_cases
  for select to authenticated
  using (
    (select public.is_admin())
    or customer_id       = (select auth.uid())
    or dealer_id         = (select auth.uid())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(dealer_id)
    or public.is_my_report(team_leader_id)
    -- 배정 대기 건: 화면이 보여 주는 것(아직 입찰자가 없거나 나에게 온 건)만. 남에게 간 건은 안 보인다.
    or (
      status = 'requested'
      and (select public.my_role()) in ('master', 'leader')
      and public.is_approved_partner()
      and (current_bidder_id is null or current_bidder_id = (select auth.uid()))
    )
  );

-- 팀장/master 가 만드는 "비공개(private) 장례". 일반 접수는 서버 함수(submit_emergency_case)가 만든다.
create policy funeral_cases_insert on public.funeral_cases
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      is_private = true
      and team_leader_id = (select auth.uid())
      and (select public.my_role()) in ('master', 'leader')
    )
  );

-- 수정: 담당/입찰 팀장과 그 팀장의 master 만. 배정 대기 건을 "가져가는" 일은 직접 UPDATE 가 아니라
--       accept_bidding 함수(13 에서 호출자 검증 추가)로만 한다(풀의 아무 건이나 수정해 가로채지 못하게).
-- 수정 후에도 내가 담당이거나, 담당을 해제해 배정 대기(requested, 담당 없음)로 되돌리는 경우는 허용한다
-- (팀장 화면의 "배정 취소": TeamLeaderDashboard 가 status='requested', team_leader_id=null 로 수정).
create policy funeral_cases_update on public.funeral_cases
  for update to authenticated
  using (
    (select public.is_admin())
    or team_leader_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
  )
  with check (
    (select public.is_admin())
    or team_leader_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
    or (status = 'requested' and team_leader_id is null)
  );

-- 관련 팀장/master 라도 장례 건의 "소유/금액" 열은 바꿀 수 없다(관리자와 DEFINER 함수/트리거만).
-- 트리거는 이름순으로 실행되므로 이름을 trg_00_ 로 시작해 다른 트리거보다 먼저 돌게 한다
-- (다른 트리거가 같은 UPDATE 안에서 바꾼 값을 "화면이 바꾼 것"으로 오해하지 않도록).
-- 상태, 담당자(배정 해제 포함), 입찰 정보, 고인명/빈소/장소/시간 같은 진행 정보는 그대로 수정 가능.
create or replace function public.funeral_cases_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if current_user = 'authenticated' and not public.is_admin() then
    foreach k in array array[
      'customer_id', 'dealer_id', 'coupon_code', 'funnel_type', 'is_private',
      'final_price', 'commission_amount', 'usage_fee', 'is_remitted', 'deducted_from_deposit',
      'additional_income_total', 'additional_income_rate', 'additional_income_settled',
      'master_rating', 'customer_rating',
      'current_bidder_id', 'bid_timeout_at', 'previous_bidders', 'current_bidder_pings'   -- 입찰 내부 값은 함수만 바꾼다
    ] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'funeral_cases: % 항목은 변경할 수 없습니다.', k using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_00_funeral_cases_guard_non_admin on public.funeral_cases;
create trigger trg_00_funeral_cases_guard_non_admin
  before update on public.funeral_cases
  for each row execute function public.funeral_cases_guard_non_admin();

create policy funeral_cases_delete on public.funeral_cases
  for delete to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- coupons   (정책 없음/RLS 꺼짐 -> 켬. 로그인 없는 조회는 get_coupon_public 함수가 대신한다)
-- ============================================================================
select pg_temp.drop_all_policies('public.coupons');
alter table public.coupons enable row level security;

create policy coupons_select on public.coupons
  for select to authenticated
  using (
    (select public.is_admin())
    or issued_by = (select auth.uid())
    or public.is_my_report(issued_by)
    or (case_id is not null and public.can_see_case(case_id))
  );

-- 발급: 본인 명의로, 사용 전(issued) 상태의 새 쿠폰만. 이미 사용된 것처럼 만들거나 장례 건에 미리 연결할 수 없다.
create policy coupons_insert on public.coupons
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      issued_by = (select auth.uid())
      and status = 'issued'
      and case_id is null
      and (select public.my_role()) in ('dealer', 'leader', 'master')
      and public.is_approved_partner()
    )
  );

-- 수정: 관리자, 또는 연결된 장례 건을 볼 수 있는 팀장/master (TeamLeaderDashboard 의 쿠폰 상태 처리)
create policy coupons_update on public.coupons
  for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.my_role()) in ('master', 'leader') and case_id is not null and public.can_see_case(case_id))
  )
  with check (
    (select public.is_admin())
    or ((select public.my_role()) in ('master', 'leader') and case_id is not null and public.can_see_case(case_id))
  );

create policy coupons_delete on public.coupons
  for delete to authenticated
  using ((select public.is_admin()));

-- 관리자가 아닌 직접 수정은 쿠폰의 "상태(status)"만 바꿀 수 있다 (코드, 금액, 발급자, 연결 건 변조 방지).
create or replace function public.coupons_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'coupons: 상태 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_00_coupons_guard_non_admin on public.coupons;
create trigger trg_00_coupons_guard_non_admin
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin();

-- ============================================================================
-- notifications   (정책 없음/RLS 꺼짐 -> 켬)
-- ============================================================================
select pg_temp.drop_all_policies('public.notifications');
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()) or sender_id = (select auth.uid()));

-- 만들기: 발신자를 비우거나 본인으로. (다른 사람 이름으로 위조는 막는다)
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check ((select public.is_admin()) or sender_id is null or sender_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()))
  with check ((select public.is_admin()) or user_id = (select auth.uid()));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using ((select public.is_admin()));

-- 받는 사람은 "읽음(is_read)"만 바꿀 수 있다.
create or replace function public.notifications_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'is_read') is distinct from (to_jsonb(old) - 'is_read') then
      raise exception 'notifications: 읽음 표시 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notifications_guard_non_admin on public.notifications;
create trigger trg_notifications_guard_non_admin
  before update on public.notifications
  for each row execute function public.notifications_guard_non_admin();

-- ============================================================================
-- funeral_progress_reports  (RLS 는 이미 켜져 있고 읽기 정책이 USING true 라 공개 읽기였다)
-- 읽기만 "장례 건을 볼 수 있는 사람"으로 바꾼다. 작성/수정/삭제 정책(작성자 기준)은 그대로 둔다.
-- ============================================================================
drop policy if exists "보고서는 누구나 열람 가능" on public.funeral_progress_reports;
create policy funeral_progress_reports_select on public.funeral_progress_reports
  for select to authenticated
  using (public.can_see_case(case_id));

-- ============================================================================
-- 인덱스: 정책이 쓰는 열 (데이터가 늘어도 느려지지 않게)
-- ============================================================================
create index if not exists funeral_cases_dealer_id_idx          on public.funeral_cases (dealer_id);
create index if not exists funeral_cases_team_leader_id_idx     on public.funeral_cases (team_leader_id);
create index if not exists funeral_cases_current_bidder_id_idx  on public.funeral_cases (current_bidder_id);
create index if not exists funeral_cases_customer_id_idx        on public.funeral_cases (customer_id);
create index if not exists funeral_cases_status_idx             on public.funeral_cases (status);
create index if not exists coupons_issued_by_idx                on public.coupons (issued_by);
create index if not exists coupons_case_id_idx                  on public.coupons (case_id);
create index if not exists notifications_user_id_idx            on public.notifications (user_id);
create index if not exists notifications_sender_id_idx          on public.notifications (sender_id);
create index if not exists partners_master_user_idx             on public.partners (master_id, user_id);
create index if not exists funeral_cases_coupon_code_idx        on public.funeral_cases (coupon_code);

-- Realtime(화면 자동 갱신)이 이 테이블들의 변경을 계속 받도록 publication 에 있는지 확인하고, 없으면 추가한다.
do $$
declare t text;
begin
  foreach t in array array['funeral_cases', 'notifications'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ============================================================================
-- 적용 직후 확인 (로그인 계정으로, 각 1~2분)
--  1. 관리자: 대시보드 전체(장례, 정산, 파트너, 쿠폰, 알림)가 평소처럼 보인다.
--  2. 딜러: 내 쿠폰 발급/목록, 내 장례 현황, 내 정산이 보인다. 다른 딜러의 장례/쿠폰은 안 보인다.
--  3. 팀장: 배정 대기 목록이 보이고 "수락"이 된다. 진행 보고서 작성/조회. 내 지갑.
--  4. master: 하위 딜러/팀장의 목록, 그들의 장례가 보인다.
--  5. 가입(/apply)이 끝까지 된다(테스트 계정). 로그아웃 후 공개 홈에서 장례 접수 버튼이 된다.
--  6. 로그인 없이 공개 키로 profiles/funeral_cases/coupons 를 읽으면 비어 있어야 한다.
--  문제가 생기면 바로 아래 되돌리기.
--
-- 되돌리기 (이 파일 이전 상태: 5개 테이블 RLS 꺼짐 / profiles, funeral_cases 의 옛 읽기 정책):
--  begin;
--  drop trigger if exists trg_profiles_guard_non_admin on public.profiles;
--  drop trigger if exists trg_partners_guard_non_admin on public.partners;
--  drop trigger if exists trg_notifications_guard_non_admin on public.notifications;
--  drop trigger if exists trg_00_funeral_cases_guard_non_admin on public.funeral_cases;
--  drop trigger if exists trg_00_coupons_guard_non_admin on public.coupons;
--  drop function if exists public.funeral_cases_guard_non_admin();
--  drop function if exists public.coupons_guard_non_admin();
--  drop function if exists public.profiles_guard_non_admin();
--  drop function if exists public.partners_guard_non_admin();
--  drop function if exists public.notifications_guard_non_admin();
--  select pg_temp.drop_all_policies('public.profiles');  select pg_temp.drop_all_policies('public.partners');
--  select pg_temp.drop_all_policies('public.funeral_cases'); select pg_temp.drop_all_policies('public.coupons');
--  select pg_temp.drop_all_policies('public.notifications');
--  (pg_temp 함수는 이 파일을 실행한 같은 탭에서만 남아 있다. 새 탭이면 파일 위쪽의 정의를 먼저 실행한다)
--  alter table public.profiles       disable row level security;
--  alter table public.partners       disable row level security;
--  alter table public.funeral_cases  disable row level security;
--  alter table public.coupons        disable row level security;
--  alter table public.notifications  disable row level security;
--  create policy "Profiles viewable by authenticated or self" on public.profiles for select using (auth.role() = 'authenticated' or auth.uid() = id);
--  create policy "Cases viewable by authenticated users" on public.funeral_cases for select using (auth.role() = 'authenticated');
--  drop policy if exists funeral_progress_reports_select on public.funeral_progress_reports;
--  create policy "보고서는 누구나 열람 가능" on public.funeral_progress_reports for select using (true);
--  commit;
-- ============================================================================

-- ############ 시험 구간: 위 2차 SQL 을 적용한 상태에서 기존 계정의 권한을 흉내 내 본다 ############
-- 마지막에 일부러 오류를 내서 "전부 취소(롤백)" 한다 -> DB 에는 아무것도 남지 않는다. 결과는 오류 문구에 담겨 나온다.
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
  uid uuid;
  other uuid;
  rl text;
  tbl text;
begin
  for r in
    select distinct on (role) role, id from public.profiles
     where role in ('admin','master','leader','dealer','customer','vendor')
     order by role, created_at
  loop
    uid := r.id; rl := r.role;
    select id into other from public.profiles where id <> uid limit 1;
    res := res || E'\n== ' || rl || ' ==';
    foreach tbl in array array['partners','funeral_cases','coupons','notifications','commission_policies','system_config','orders'] loop
      res := res || E'\n  읽기 ' || tbl || ': ' || pg_temp.try('select * from public.' || tbl, uid, 'authenticated');
    end loop;
    res := res || E'
  읽기 profiles(열 목록): ' || pg_temp.try('select id, role, name, phone, created_at from public.profiles', uid, 'authenticated');
    res := res || E'\n  password 열 읽기(막혀야 함): ' || pg_temp.try('select password from public.profiles limit 1', uid, 'authenticated');
    res := res || E'\n  내 role 을 admin 으로(막혀야 함): ' || pg_temp.try(format('update public.profiles set role=%L where id=%L', 'admin', uid), uid, 'authenticated');
    res := res || E'\n  남의 이름 수정(0행이어야 함): ' || pg_temp.try(format('update public.profiles set name=name where id=%L', other), uid, 'authenticated');
    res := res || E'\n  수수료 정책 수정(관리자만 1행 이상): ' || pg_temp.try('update public.commission_policies set id=id', uid, 'authenticated');
    res := res || E'\n  남 대신 배정수락(막혀야 함): ' || pg_temp.try(format('select public.accept_bidding(%L::uuid, %L::uuid)', gen_random_uuid(), other), uid, 'authenticated');
  end loop;

  res := res || E'\n== 로그인 없음(anon) ==';
  foreach tbl in array array['partners','funeral_cases','coupons','notifications','commission_policies','system_config','orders'] loop
    res := res || E'\n  읽기 ' || tbl || ': ' || pg_temp.try('select * from public.' || tbl, null, 'anon');
  end loop;
  res := res || E'\n  읽기 profiles(열 목록): ' || pg_temp.try('select id, role, name, phone from public.profiles', null, 'anon');
  res := res || E'\n  쿠폰 조회 함수(허용): ' || pg_temp.try('select public.get_coupon_public(''zzzz'')', null, 'anon');
  res := res || E'\n  배정수락 함수(막혀야 함): ' || pg_temp.try(format('select public.accept_bidding(%L::uuid, %L::uuid)', gen_random_uuid(), gen_random_uuid()), null, 'anon');
  res := res || E'\n  공개 설정 읽기(허용, system_config 일부): ' || pg_temp.try('select * from public.system_config where key like ''footer_%''', null, 'anon');

  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

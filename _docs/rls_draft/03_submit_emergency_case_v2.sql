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

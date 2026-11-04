-- ==== notify_emergency_dispatch ====
CREATE OR REPLACE FUNCTION public.notify_emergency_dispatch(p_case_id uuid, p_master_leader_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_admin RECORD;
    v_leader_name text;
    v_loc text;
    v_pkg text;
    v_msg text;
BEGIN
    SELECT name INTO v_leader_name FROM profiles WHERE id = p_master_leader_id;
    SELECT location, package_name INTO v_loc, v_pkg FROM funeral_cases WHERE id = p_case_id;

    v_msg := format(
        '🚨 비상 배차 발동!' || E'\n' ||
        '대기 중인 팀장 전원 부재 → 마스터 팀장 %s 비상 투입' || E'\n' ||
        '장소: %s (%s)' || E'\n' ||
        '즉시 상황을 확인해주세요.',
        COALESCE(v_leader_name, '미상'),
        COALESCE(v_loc, '미정'),
        COALESCE(v_pkg, '미정')
    );

    FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (v_admin.id, 'emergency', '🚨 비상 배차 — 마스터 팀장 투입', v_msg, false, now());
    END LOOP;
END;
$function$


-- ==== submit_emergency_case ====
CREATE OR REPLACE FUNCTION public.submit_emergency_case(p_name text, p_phone text, p_location text, p_package_name text, p_coupon_code text DEFAULT NULL::text, p_dealer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$


-- ==== is_master_leader ====
CREATE OR REPLACE FUNCTION public.is_master_leader(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = p_user_id
          AND p.master_id IS NULL
          AND pr.role = 'leader'
          AND p.status = 'approved'
    );
END;
$function$


-- ==== auto_assign_first_bidder ====
CREATE OR REPLACE FUNCTION public.auto_assign_first_bidder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_dispatch_mode text;
    v_order_map     jsonb;
    v_first_id      uuid;
    v_timeout_mins  int;
BEGIN
    IF NEW.status != 'requested' THEN RETURN NEW; END IF;

    SELECT value INTO v_dispatch_mode FROM system_config WHERE key = 'dispatch_mode';
    IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential', 'team_hybrid') THEN
        RETURN NEW;
    END IF;

    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    IF v_order_map IS NULL OR v_order_map = '{}'::jsonb THEN RETURN NEW; END IF;

    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;

    SELECT p.user_id INTO v_first_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

    IF v_first_id IS NULL THEN
        SELECT p.user_id INTO v_first_id
        FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.status = 'approved'
          AND p.current_status != 'off'
          AND p.master_id IS NULL
          AND pr.role = 'leader'
        ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

        IF v_first_id IS NOT NULL THEN
            PERFORM notify_emergency_dispatch(NEW.id, v_first_id);
        END IF;
    END IF;

    IF v_first_id IS NULL THEN
        PERFORM notify_escalation(NEW.id, 0, NULL);
        RETURN NEW;
    END IF;

    UPDATE funeral_cases
    SET current_bidder_id = v_first_id,
        current_bidder_pings = 1, -- 핑 횟수 초기화
        bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
        previous_bidders  = '{}'
    WHERE id = NEW.id;

    INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
    VALUES (NEW.id, v_first_id, 'offered', now());

    RETURN NEW;
END;
$function$


-- ==== find_next_bidder ====
CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb, p_previous uuid[], p_current_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_id    uuid;
    v_excl       uuid[];
BEGIN
    v_excl := array_append(COALESCE(p_previous, '{}'), p_current_id);

    -- 1차: 출동 대기(waiting) 중인 모든 팀장 (마스터 포함)
    SELECT p.user_id INTO v_next_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND p.user_id != ALL(v_excl)
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST
    LIMIT 1;

    -- 2차: 1차에서 제외(v_excl)된 사람만 남았다면 순환 (previous 무시하고 다시 waiting 중 찾기)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.current_status = 'waiting'
          AND p.status = 'approved'
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    -- 3차 (비상): 대기중(waiting)인 팀장이 아예 0명일 때 (전원 진행중이거나 off)
    -- 마스터 팀장에게 비상 배정 (off 제외)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.status = 'approved'
          AND p.current_status != 'off'
          AND p.master_id IS NULL
          AND pr.role = 'leader'
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    RETURN v_next_id;
END;
$function$

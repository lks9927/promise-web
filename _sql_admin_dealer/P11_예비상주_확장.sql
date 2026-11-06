-- 목적: 명함 QR 가족 안심 등록에 대상 성함(선택)과 시·군·구를 추가하고, 딜러 명단/알림에는 최소 정보만 노출한다.
-- 되돌리기: 아래에서 만든 7인자/5인자 submit_pre_registration 및 uuid 인자 get_my_pre_registrations를 P10/P10b 버전으로 복원한 뒤 elder_name, region_id 열과 FK를 제거한다.

ALTER TABLE public.pre_registrations
  ADD COLUMN IF NOT EXISTS elder_name text CHECK (elder_name IS NULL OR char_length(elder_name) BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id);

-- 기존 데이터와 이미 적용된 P10/P10b의 반환형을 명시적으로 교체한다.
DROP FUNCTION IF EXISTS public.submit_pre_registration(text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.submit_pre_registration(text, text, text, text, boolean, text, uuid);
DROP FUNCTION IF EXISTS public.get_my_pre_registrations();
DROP FUNCTION IF EXISTS public.get_my_pre_registrations(uuid);

CREATE FUNCTION public.submit_pre_registration(
  p_code text, p_name text, p_phone text, p_relationship text, p_consent boolean,
  p_elder_name text DEFAULT NULL, p_region_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_relationship text := btrim(coalesce(p_relationship, ''));
  v_elder_name text := nullif(btrim(regexp_replace(coalesce(p_elder_name, ''), '\s+', ' ', 'g')), '');
  v_region_name text;
  v_coupon public.coupons%ROWTYPE;
  v_dealer_name text;
  v_benefit_name text;
  v_attempts bigint;
  v_status text;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION '신청하시는 분 성함은 1자 이상 30자 이하로 입력해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_elder_name IS NOT NULL AND char_length(v_elder_name) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION '대상 성함은 1자 이상 30자 이하로 입력해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^01[0-9]{8,9}$' THEN
    RAISE EXCEPTION '휴대전화 번호를 확인해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_relationship = '형제자매' THEN v_relationship := '형제·자매'; END IF;
  IF v_relationship NOT IN ('자녀', '배우자', '형제·자매', '손주', '부모', '친척', '기타') THEN v_relationship := '기타'; END IF;
  IF p_region_id IS NOT NULL THEN
    SELECT r.name INTO v_region_name FROM public.regions r
     WHERE r.id = p_region_id AND r.level = 'sigungu' AND r.active;
    IF NOT FOUND THEN
      RAISE EXCEPTION '대상 지역은 활성화된 시·군·구로 선택해 주세요.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.pre_registration_attempts(phone) VALUES (v_phone);
  SELECT count(*) INTO v_attempts FROM public.pre_registration_attempts
   WHERE phone = v_phone AND created_at >= now() - interval '1 hour';
  IF v_attempts > 3 THEN RAISE EXCEPTION '잠시 후 다시 시도해 주세요.' USING ERRCODE = '42900'; END IF;
  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION '개인정보 수집 및 이용 동의가 필요합니다.' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_coupon FROM public.coupons c
   WHERE c.code = v_code AND c.is_card AND c.status = 'issued' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '사용할 수 없는 명함 쿠폰입니다.' USING ERRCODE = '22023'; END IF;
  SELECT name INTO v_dealer_name FROM public.profiles WHERE id = v_coupon.issued_by;
  SELECT nullif(btrim(value), '') INTO v_benefit_name FROM public.system_config WHERE key = 'family_benefit_name';

  INSERT INTO public.pre_registrations(coupon_id, coupon_code, dealer_id, name, phone, relationship, elder_name, region_id, consent_at)
  VALUES (v_coupon.id, v_coupon.code, v_coupon.issued_by, v_name, v_phone, v_relationship, v_elder_name, p_region_id, now())
  ON CONFLICT (coupon_id, phone) DO NOTHING
  RETURNING status INTO v_status;
  IF FOUND THEN
    BEGIN
      INSERT INTO public.notifications(user_id, sender_id, type, title, message)
      VALUES (v_coupon.issued_by, NULL, 'pre_registration', '가족 안심 등록 요청',
        (CASE WHEN char_length(v_name) = 2 THEN left(v_name, 1) || '*'
              WHEN char_length(v_name) >= 3 THEN left(v_name, 1) || '*' || right(v_name, 1)
              ELSE '*' END) || '님 (' || v_relationship || ')' ||
        CASE WHEN v_region_name IS NULL THEN '' ELSE ' · ' || v_region_name END);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('ok', true, 'status', 'registered', 'dealer_name', v_dealer_name, 'benefit_name', v_benefit_name);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'exists', 'dealer_name', v_dealer_name, 'benefit_name', v_benefit_name);
END;
$function$;

-- 5인자 호출(기존 클라이언트)은 기본값이 있는 7인자 함수가 그대로 받는다. 5인자 래퍼를 따로 두면 호출이 모호해져(not unique) 만들지 않는다.
REVOKE ALL ON FUNCTION public.submit_pre_registration(text, text, text, text, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_pre_registration(text, text, text, text, boolean, text, uuid) TO anon, authenticated;

CREATE FUNCTION public.get_my_pre_registrations(p_dealer uuid DEFAULT NULL)
RETURNS TABLE(id uuid, masked_name text, relationship text, region_name text, status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_target uuid := auth.uid();
BEGIN
  IF p_dealer IS NOT NULL AND (SELECT public.is_admin()) THEN v_target := p_dealer; END IF;
  RETURN QUERY
  SELECT pr.id,
         CASE WHEN char_length(pr.name) = 2 THEN left(pr.name, 1) || '*'
              WHEN char_length(pr.name) >= 3 THEN left(pr.name, 1) || '*' || right(pr.name, 1)
              ELSE '*' END,
         pr.relationship, r.name, pr.status, pr.created_at
    FROM public.pre_registrations pr
    LEFT JOIN public.regions r ON r.id = pr.region_id
   WHERE pr.dealer_id = v_target
     AND EXISTS (SELECT 1 FROM public.profiles pf JOIN public.partners pa ON pa.user_id = pf.id
                  WHERE pf.id = v_target AND pf.role = 'dealer' AND pa.status = 'approved')
   ORDER BY pr.created_at DESC
   LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_pre_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pre_registrations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_family_benefit_public()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH cfg AS (
    SELECT max(value) FILTER (WHERE key = 'family_benefit_name') AS name,
           max(value) FILTER (WHERE key = 'family_benefit_desc') AS description,
           max(value) FILTER (WHERE key = 'family_benefit_amount') AS amount,
           max(value) FILTER (WHERE key = 'pre_reg_elder_label') AS elder_label
      FROM public.system_config
     WHERE key IN ('family_benefit_name', 'family_benefit_desc', 'family_benefit_amount', 'pre_reg_elder_label')
  ), benefit AS (
    SELECT CASE WHEN coalesce(btrim(name), '') = '' THEN
      jsonb_build_object('name', NULL, 'description', NULL, 'amount', NULL)
    ELSE jsonb_build_object('name', name, 'description', nullif(description, ''),
      'amount', CASE WHEN amount ~ '^\s*-?[0-9]+\s*$' THEN btrim(amount)::numeric ELSE NULL END)
    END AS value,
    coalesce(nullif(left(btrim(regexp_replace(coalesce(elder_label, ''), '\s+', ' ', 'g')), 10), ''), '어르신') AS label
    FROM cfg
  )
  SELECT value || jsonb_build_object('elder_label', label) FROM benefit
$function$;
REVOKE ALL ON FUNCTION public.get_family_benefit_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_family_benefit_public() TO anon, authenticated;

INSERT INTO public.system_config(key, value)
SELECT 'pre_reg_elder_label', public.get_family_benefit_public()->>'elder_label'
ON CONFLICT (key) DO NOTHING;

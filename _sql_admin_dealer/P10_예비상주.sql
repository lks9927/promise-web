-- P10 예비 상주(가족 안심 혜택) 등록.
-- 적용 순서: P1a/P4 등 기존 관리자·딜러 SQL 적용 뒤 이 파일을 적용한다.
-- 되돌리기: 신규 함수/트리거/테이블/인덱스를 명시적으로 DROP 하고 coupons.is_card 열을 제거한다.
-- 주의: 명함 쿠폰은 재사용 QR이므로 사건 접수·정산에서 일반 쿠폰과 다르게 취급한다.

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS is_card boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS coupons_one_card_per_dealer
  ON public.coupons(issued_by) WHERE is_card;

CREATE OR REPLACE FUNCTION public.ensure_dealer_card_coupon(p_dealer uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i integer;
BEGIN
  IF p_dealer IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    JOIN public.partners pa ON pa.user_id = pr.id
    WHERE pr.id = p_dealer AND pr.role = 'dealer' AND pa.status = 'approved'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT c.code INTO v_code
  FROM public.coupons c
  WHERE c.issued_by = p_dealer AND c.is_card
  LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  FOR v_i IN 1..20 LOOP
    v_code := 'D' || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1)
                    || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    BEGIN
      INSERT INTO public.coupons(code, amount, status, batch_name, issued_by, is_card)
      VALUES (v_code, 0, 'issued', '명함용', p_dealer, true);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      SELECT c.code INTO v_code FROM public.coupons c
       WHERE c.issued_by = p_dealer AND c.is_card LIMIT 1;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END;
  END LOOP;
  RAISE EXCEPTION '명함용 쿠폰 코드 발급에 실패했습니다.';
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_dealer_card_coupon(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_card_coupon_on_dealer_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status = 'approved' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND role = 'dealer'
  ) THEN
    PERFORM public.ensure_dealer_card_coupon(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_issue_card_coupon ON public.partners;
CREATE TRIGGER trg_issue_card_coupon
AFTER INSERT OR UPDATE OF status ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.issue_card_coupon_on_dealer_approval();

CREATE OR REPLACE FUNCTION public.get_my_card_coupon()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN public.ensure_dealer_card_coupon(auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_card_coupon() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_card_coupon() TO authenticated;

CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id),
  coupon_code text NOT NULL,
  dealer_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  phone text NOT NULL,
  relationship text,
  consent_at timestamptz NOT NULL,
  consent_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'converted')),
  converted_case_id uuid REFERENCES public.funeral_cases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, phone)
);
CREATE TABLE IF NOT EXISTS public.pre_registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_registration_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pre_registrations, public.pre_registration_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_pre_registration(
  p_code text, p_name text, p_phone text, p_relationship text, p_consent boolean
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
  v_coupon public.coupons%ROWTYPE;
  v_dealer_name text;
  v_benefit_name text;
  v_attempts bigint;
  v_status text;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION '이름은 1자 이상 30자 이하로 입력해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^01[0-9]{8,9}$' THEN
    RAISE EXCEPTION '휴대전화 번호를 확인해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF v_relationship NOT IN ('자녀', '배우자', '형제자매', '부모', '친척', '기타') THEN v_relationship := '기타'; END IF;

  INSERT INTO public.pre_registration_attempts(phone) VALUES (v_phone);
  SELECT count(*) INTO v_attempts FROM public.pre_registration_attempts
   WHERE phone = v_phone AND created_at >= now() - interval '1 hour';
  IF v_attempts > 3 THEN
    RAISE EXCEPTION '잠시 후 다시 시도해 주세요.' USING ERRCODE = '42900';
  END IF;
  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION '개인정보 수집 및 이용 동의가 필요합니다.' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_coupon FROM public.coupons c
   WHERE c.code = v_code AND c.is_card AND c.status = 'issued' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '사용할 수 없는 명함 쿠폰입니다.' USING ERRCODE = '22023'; END IF;
  SELECT name INTO v_dealer_name FROM public.profiles WHERE id = v_coupon.issued_by;
  SELECT nullif(btrim(value), '') INTO v_benefit_name FROM public.system_config WHERE key='family_benefit_name';

  INSERT INTO public.pre_registrations(coupon_id, coupon_code, dealer_id, name, phone, relationship, consent_at)
  VALUES (v_coupon.id, v_coupon.code, v_coupon.issued_by, v_name, v_phone, v_relationship, now())
  ON CONFLICT (coupon_id, phone) DO NOTHING
  RETURNING status INTO v_status;
  IF FOUND THEN
    BEGIN
      INSERT INTO public.notifications(user_id, sender_id, type, title, message)
      VALUES (
        v_coupon.issued_by, NULL, 'pre_registration', '가족 안심 혜택 신청',
        (CASE WHEN char_length(v_name) = 2 THEN left(v_name, 1) || '*'
              WHEN char_length(v_name) >= 3 THEN left(v_name, 1) || '*' || right(v_name, 1)
              ELSE '*' END) || '님 (' || v_relationship || ')'
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('ok', true, 'status', 'registered', 'dealer_name', v_dealer_name, 'benefit_name', v_benefit_name);
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'exists', 'dealer_name', v_dealer_name, 'benefit_name', v_benefit_name);
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_pre_registration(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_pre_registration(text,text,text,text,boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_pre_registrations()
RETURNS TABLE(id uuid, masked_name text, relationship text, status text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT pr.id,
         CASE WHEN char_length(pr.name) = 2 THEN left(pr.name, 1) || '*'
              WHEN char_length(pr.name) >= 3 THEN left(pr.name, 1) || '*' || right(pr.name, 1)
              ELSE '*' END,
         pr.relationship, pr.status, pr.created_at
    FROM public.pre_registrations pr
   WHERE pr.dealer_id = auth.uid()
     AND EXISTS (SELECT 1 FROM public.profiles pf JOIN public.partners pa ON pa.user_id=pf.id
                  WHERE pf.id=auth.uid() AND pf.role='dealer' AND pa.status='approved')
   ORDER BY pr.created_at DESC
   LIMIT 100
$function$;
REVOKE ALL ON FUNCTION public.get_my_pre_registrations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pre_registrations() TO authenticated;

INSERT INTO public.system_config(key, value) VALUES
  ('family_benefit_name', ''), ('family_benefit_desc', ''), ('family_benefit_amount', '')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.get_family_benefit_public()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH cfg AS (
    SELECT max(value) FILTER (WHERE key='family_benefit_name') AS name,
           max(value) FILTER (WHERE key='family_benefit_desc') AS description,
           max(value) FILTER (WHERE key='family_benefit_amount') AS amount
      FROM public.system_config
     WHERE key IN ('family_benefit_name','family_benefit_desc','family_benefit_amount')
  )
  SELECT CASE WHEN coalesce(btrim(name), '') = '' THEN
      jsonb_build_object('name', NULL, 'description', NULL, 'amount', NULL)
    ELSE jsonb_build_object('name', name, 'description', nullif(description, ''),
      'amount', CASE WHEN amount ~ '^\s*-?[0-9]+\s*$' THEN btrim(amount)::numeric ELSE NULL END)
    END FROM cfg
$function$;
REVOKE ALL ON FUNCTION public.get_family_benefit_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_family_benefit_public() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_coupon_public(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'amount', c.amount, 'status', c.status,
    'recipient_name', CASE WHEN c.is_card THEN NULL ELSE c.recipient_name END,
    'recipient_phone', CASE WHEN c.is_card THEN NULL ELSE c.recipient_phone END,
    'is_card', c.is_card, 'dealer_name', pf.name
  )
  FROM public.coupons c LEFT JOIN public.profiles pf ON pf.id=c.issued_by
  WHERE c.code=upper(btrim(coalesce(p_code,''))) LIMIT 1
$function$;
REVOKE ALL ON FUNCTION public.get_coupon_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coupon_public(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_update_coupon_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.coupon_code IS NOT NULL THEN
    UPDATE public.coupons
       SET status='used', case_id=NEW.id
     WHERE code=NEW.coupon_code AND status='issued' AND NOT is_card;
  END IF;
  RETURN NEW;
END;
$function$;

-- P4의 시그니처·기존 동작을 보존하고, 명함 쿠폰 접수 때만 동일 전화 예비등록을 전환한다.
CREATE OR REPLACE FUNCTION public.submit_emergency_case(p_name text,p_phone text,p_location text,p_package_name text,p_coupon_code text DEFAULT NULL,p_dealer_id uuid DEFAULT NULL,p_region_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE v_customer_id uuid; v_case_id uuid; v_dealer uuid:=p_dealer_id; v_code text:=NULLIF(upper(btrim(coalesce(p_coupon_code,''))), '');
BEGIN
 IF p_region_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.regions WHERE id=p_region_id AND level='sigungu' AND active) THEN RAISE EXCEPTION '유효한 시·군·구 지역이 아닙니다.' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_customer_id FROM public.profiles WHERE role='customer' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') LIMIT 1;
 IF v_customer_id IS NULL THEN v_customer_id:=gen_random_uuid(); INSERT INTO public.profiles(id,name,phone,role) VALUES(v_customer_id,btrim(p_name),p_phone,'customer'); END IF;
 INSERT INTO public.funeral_cases(customer_id,dealer_id,location,package_name,status,funnel_type,coupon_code,region_id) VALUES(v_customer_id,v_dealer,btrim(coalesce(p_location,'')),btrim(coalesce(p_package_name,'')),'requested',CASE WHEN v_dealer IS NULL THEN 'organic_search' ELSE 'partner_referral' END,v_code,p_region_id) RETURNING id INTO v_case_id;
 IF v_code IS NOT NULL THEN
   UPDATE public.pre_registrations pr SET status='converted', converted_case_id=v_case_id
    WHERE pr.coupon_code=v_code AND pr.status='registered'
      AND regexp_replace(pr.phone,'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
      AND EXISTS (SELECT 1 FROM public.coupons c WHERE c.id=pr.coupon_id AND c.is_card);
 END IF;
 RETURN v_case_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.calculate_settlements()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_dealer_id UUID; v_master_dealer_id UUID; v_team_leader_id UUID; v_master_leader_id UUID; v_customer_id UUID; v_coupon_issued_by UUID;
 v_base_margin INTEGER; v_dealer_comm INTEGER; v_dealer_override INTEGER; v_leader_override INTEGER; v_customer_payback INTEGER;
 v_tax_amt INTEGER; v_net_amt INTEGER; v_base_amt INTEGER; v_policy_id INTEGER; v_is_card boolean := false;
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'in_progress' AND COALESCE(NEW.is_private, false) = false THEN
  IF NEW.package_name = '고급형' THEN v_policy_id := 2; ELSIF NEW.package_name = '무빈소' THEN v_policy_id := 3; ELSE v_policy_id := 1; END IF;
  SELECT COALESCE(base_margin,880000),COALESCE(sales_dealer_regular,200000),COALESCE(sales_dealer_master_override,50000),COALESCE(exec_leader_master_override,50000),COALESCE(customer_payback,100000)
   INTO v_base_margin,v_dealer_comm,v_dealer_override,v_leader_override,v_customer_payback FROM commission_policies WHERE id=v_policy_id LIMIT 1;
  v_base_margin:=COALESCE(v_base_margin,880000); v_dealer_comm:=COALESCE(v_dealer_comm,200000); v_dealer_override:=COALESCE(v_dealer_override,50000); v_leader_override:=COALESCE(v_leader_override,50000); v_customer_payback:=COALESCE(v_customer_payback,100000);
  NEW.usage_fee:=v_base_margin; v_dealer_id:=NEW.dealer_id; v_team_leader_id:=NEW.team_leader_id; v_customer_id:=NEW.customer_id;
  IF NEW.coupon_code IS NOT NULL THEN SELECT issued_by,is_card INTO v_coupon_issued_by,v_is_card FROM coupons WHERE code=NEW.coupon_code LIMIT 1; END IF;
  IF v_dealer_id IS NULL AND v_coupon_issued_by IS NOT NULL THEN SELECT id INTO v_coupon_issued_by FROM profiles WHERE id=v_coupon_issued_by AND role NOT IN ('admin'); v_dealer_id:=v_coupon_issued_by; END IF;
  IF v_dealer_id IS NOT NULL THEN SELECT master_id INTO v_master_dealer_id FROM partners WHERE user_id=v_dealer_id; END IF;
  IF v_team_leader_id IS NOT NULL THEN SELECT master_id INTO v_master_leader_id FROM partners WHERE user_id=v_team_leader_id; END IF;
  IF NEW.usage_fee>0 AND v_team_leader_id IS NOT NULL THEN v_base_amt:=ROUND(NEW.usage_fee/1.1); v_tax_amt:=NEW.usage_fee-v_base_amt; INSERT INTO settlements(case_id,recipient_id,amount,type,status,tax_type,base_amount,tax_amount,net_amount) VALUES(NEW.id,v_team_leader_id,NEW.usage_fee,'usage_fee_remittance','draft','vat_10',v_base_amt,v_tax_amt,NEW.usage_fee) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING; END IF;
  IF v_dealer_id IS NOT NULL THEN v_tax_amt:=ROUND(v_dealer_comm*0.033); v_net_amt:=v_dealer_comm-v_tax_amt; INSERT INTO settlements(case_id,recipient_id,amount,type,status,tax_type,base_amount,tax_amount,net_amount) VALUES(NEW.id,v_dealer_id,v_net_amt,'dealer_commission','draft','withholding_33',v_dealer_comm,v_tax_amt,v_net_amt) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING; IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id!=v_dealer_id THEN v_tax_amt:=ROUND(v_dealer_override*0.033); v_net_amt:=v_dealer_override-v_tax_amt; INSERT INTO settlements(case_id,recipient_id,amount,type,status,tax_type,base_amount,tax_amount,net_amount) VALUES(NEW.id,v_master_dealer_id,v_net_amt,'dealer_override','draft','withholding_33',v_dealer_override,v_tax_amt,v_net_amt) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING; END IF; END IF;
  IF v_master_leader_id IS NOT NULL AND v_master_leader_id!=v_team_leader_id THEN INSERT INTO settlements(case_id,recipient_id,amount,type,status,tax_type,base_amount,tax_amount,net_amount) VALUES(NEW.id,v_master_leader_id,v_leader_override,'leader_override','draft','none',v_leader_override,0,v_leader_override) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING; END IF;
  -- 명함 쿠폰은 혜택 금액이 아직 확정되지 않았으므로 고객 캐시백 정산을 만들지 않는다.
  IF NEW.coupon_code IS NOT NULL AND trim(NEW.coupon_code)!='' AND v_customer_id IS NOT NULL AND NOT v_is_card THEN INSERT INTO settlements(case_id,recipient_id,amount,type,status,tax_type,base_amount,tax_amount,net_amount) VALUES(NEW.id,v_customer_id,v_customer_payback,'customer_cashback','draft','none',v_customer_payback,0,v_customer_payback) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING; END IF;
 END IF;
 RETURN NEW;
END;
$function$;

DO $bootstrap$
DECLARE v_dealer record; v_issued integer := 0;
BEGIN
 FOR v_dealer IN SELECT pa.user_id FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' LOOP
   PERFORM public.ensure_dealer_card_coupon(v_dealer.user_id); v_issued := v_issued + 1;
 END LOOP;
 RAISE NOTICE 'P10 명함 쿠폰 확인/발급 대상: %', v_issued;
END;
$bootstrap$;

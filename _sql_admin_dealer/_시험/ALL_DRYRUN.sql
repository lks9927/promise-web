-- GENERATED FROM src/*.sql.  Do not add BEGIN/COMMIT/ROLLBACK around this DO block.
-- During execution, partners, funeral_cases and profiles can receive short DDL/DML locks (seconds, not a deployment lock).
DO $dry$
DECLARE
  v_result text := '';
  v_detail text;
  v_n bigint := 0;
  v_n2 bigint := 0;
  v_case uuid;
  v_fee_case_1 uuid;
  v_fee_case_2 uuid;
  v_customer uuid;
  v_leader uuid;
  v_other_leader uuid;
  v_region uuid;
  v_other_region uuid;
  v_sido uuid;
  v_other_sido uuid;
  v_s uuid;
  v_master uuid;
  v_child uuid;
  v_apply_1 boolean := false; v_apply_2 boolean := false; v_apply_3 boolean := false;
  v_apply_4 boolean := false; v_apply_5 boolean := false; v_apply_6 boolean := false;
  v_apply_7 boolean := false; v_apply_8 boolean := false; v_apply_9 boolean := false;
  v_apply_10 boolean := false; v_apply_11 boolean := false; v_apply_12 boolean := false;
  v_apply_13 boolean := false; v_apply_14 boolean := false;
  v_apply_15 boolean := false;
  v_apply_16 boolean := false;
  v_apply_17 boolean := false;
  v_apply_18 boolean := false;
  v_apply_19 boolean := false;
BEGIN
  ALTER TABLE public.funeral_cases DISABLE TRIGGER "funeral-case-alert";
  ALTER TABLE public.profiles DISABLE TRIGGER "profile-signup-alert";
  SELECT string_agg(c.relname || ':' || t.tgname || '=' || t.tgenabled::text, ', ' ORDER BY c.relname)
    INTO v_detail
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE NOT t.tgisinternal AND (c.oid='public.funeral_cases'::regclass AND t.tgname='funeral-case-alert'
    OR c.oid='public.profiles'::regclass AND t.tgname='profile-signup-alert');
  v_result := v_result || E'\n[INFO] alert triggers disabled and recorded: ' || coalesce(v_detail, 'not found');

-- Every include is a savepoint-like PL/pgSQL sub-block.  A failed prerequisite leaves its flag false.
BEGIN
-- P1a 정산 중복 방지 (2026-11-04). 기준: 운영 DB 함수 본문(2026-11-04 조회)을 그대로 두고
-- settlements INSERT 5곳에만 ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING 을 추가했다.
-- 추가 변경: is_private(팀장 본인 장례, 기록용) 사건은 정산 생성을 건너뜀. 그 밖의 동작(SECURITY DEFINER, 정책 id 분기, usage_fee 덮어쓰기)은 운영과 동일.
CREATE OR REPLACE FUNCTION public.calculate_settlements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dealer_id UUID;
    v_master_dealer_id UUID;
    v_team_leader_id UUID;
    v_master_leader_id UUID;
    v_customer_id UUID;
    v_coupon_issued_by UUID;

    v_base_margin INTEGER;
    v_dealer_comm INTEGER;
    v_dealer_override INTEGER;
    v_leader_override INTEGER;
    v_customer_payback INTEGER;

    v_tax_amt INTEGER;
    v_net_amt INTEGER;
    v_base_amt INTEGER;
    v_policy_id INTEGER;

BEGIN
    -- 상담 완료(in_progress) 시점: draft 정산 레코드 미리 생성
    -- [변경] 팀장 본인 장례(is_private, 기록용)는 정산서를 만들지 않는다.
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'in_progress' AND COALESCE(NEW.is_private, false) = false THEN

        -- 패키지명에 따라 정책 ID 설정
        IF NEW.package_name = '고급형' THEN
            v_policy_id := 2;
        ELSIF NEW.package_name = '무빈소' THEN
            v_policy_id := 3;
        ELSE
            v_policy_id := 1;
        END IF;

        -- 수수료 정책 로드 (base_margin 포함)
        SELECT
            COALESCE(base_margin, 880000),
            COALESCE(sales_dealer_regular, 200000),
            COALESCE(sales_dealer_master_override, 50000),
            COALESCE(exec_leader_master_override, 50000),
            COALESCE(customer_payback, 100000)
        INTO
            v_base_margin,
            v_dealer_comm,
            v_dealer_override,
            v_leader_override,
            v_customer_payback
        FROM commission_policies
        WHERE id = v_policy_id
        LIMIT 1;

        v_base_margin      := COALESCE(v_base_margin,      880000);
        v_dealer_comm      := COALESCE(v_dealer_comm,      200000);
        v_dealer_override  := COALESCE(v_dealer_override,   50000);
        v_leader_override  := COALESCE(v_leader_override,   50000);
        v_customer_payback := COALESCE(v_customer_payback, 100000);

        -- 🚨 핵심 수정: 프론트엔드가 보낸 usage_fee를 무시하고 DB 정책 값(base_margin)으로 강제 덮어씀
        NEW.usage_fee := v_base_margin;

        v_dealer_id       := NEW.dealer_id;
        v_team_leader_id  := NEW.team_leader_id;
        v_customer_id     := NEW.customer_id;

        -- 쿠폰으로 접수한 경우: dealer_id가 없어도 coupons.issued_by에서 딜러 자동 조회
        IF v_dealer_id IS NULL AND NEW.coupon_code IS NOT NULL THEN
            SELECT issued_by INTO v_coupon_issued_by
            FROM coupons
            WHERE code = NEW.coupon_code
            LIMIT 1;
            IF v_coupon_issued_by IS NOT NULL THEN
                SELECT id INTO v_coupon_issued_by
                FROM profiles
                WHERE id = v_coupon_issued_by
                  AND role NOT IN ('admin');
                v_dealer_id := v_coupon_issued_by;
            END IF;
        END IF;

        -- 딜러의 마스터 찾기
        IF v_dealer_id IS NOT NULL THEN
            SELECT master_id INTO v_master_dealer_id
            FROM partners WHERE user_id = v_dealer_id;
        END IF;

        -- 팀장의 마스터 찾기
        IF v_team_leader_id IS NOT NULL THEN
            SELECT master_id INTO v_master_leader_id
            FROM partners WHERE user_id = v_team_leader_id;
        END IF;

        -- A. 팀장 → 본사 사용료 (NEW.usage_fee 사용)
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            v_base_amt := ROUND(NEW.usage_fee / 1.1);
            v_tax_amt := NEW.usage_fee - v_base_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_team_leader_id, NEW.usage_fee, 'usage_fee_remittance', 'draft', 'vat_10', v_base_amt, v_tax_amt, NEW.usage_fee) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
        END IF;

        -- B. 본사 → 딜러 수수료
        IF v_dealer_id IS NOT NULL THEN
            v_tax_amt := ROUND(v_dealer_comm * 0.033);
            v_net_amt := v_dealer_comm - v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_dealer_id, v_net_amt, 'dealer_commission', 'draft', 'withholding_33', v_dealer_comm, v_tax_amt, v_net_amt) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;

            -- C. 본사 → 마스터딜러 관리수수료
            IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                v_tax_amt := ROUND(v_dealer_override * 0.033);
                v_net_amt := v_dealer_override - v_tax_amt;
                INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
                VALUES (NEW.id, v_master_dealer_id, v_net_amt, 'dealer_override', 'draft', 'withholding_33', v_dealer_override, v_tax_amt, v_net_amt) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
            END IF;
        END IF;

        -- D. 본사 → 마스터팀장 관리수수료
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_master_leader_id, v_leader_override, 'leader_override', 'draft', 'none', v_leader_override, 0, v_leader_override) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
        END IF;

        -- E. 본사 → 고객 캐시백 (쿠폰 사용 시)
        IF NEW.coupon_code IS NOT NULL AND TRIM(NEW.coupon_code) != '' AND v_customer_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_customer_id, v_customer_payback, 'customer_cashback', 'draft', 'none', v_customer_payback, 0, v_customer_payback) ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
        END IF;

    END IF;
    RETURN NEW;
END;
$function$;

  v_apply_1 := true; v_result := v_result || E'\n[PASS] apply P1a settlement uniqueness';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1a: ' || SQLERRM; END;
BEGIN
-- p1b: NULL은 무제한, 0 이상만 허용한다.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS max_subordinates integer;
ALTER TABLE public.partners
  ALTER COLUMN max_subordinates DROP DEFAULT,
  ALTER COLUMN max_subordinates SET DEFAULT NULL;
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_max_subordinates_nonnegative;
ALTER TABLE public.partners ADD CONSTRAINT partners_max_subordinates_nonnegative
  CHECK (max_subordinates IS NULL OR max_subordinates >= 0);

-- 팀장과 마스터 딜러가 하위 파트너를 새로 붙일 때 모두 적용한다.
CREATE OR REPLACE FUNCTION public.enforce_partner_subordinate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.master_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.master_id IS NOT DISTINCT FROM OLD.master_id) THEN
    RETURN NEW;
  END IF;
  SELECT max_subordinates INTO v_limit FROM partners WHERE user_id = NEW.master_id FOR UPDATE;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM partners WHERE master_id = NEW.master_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION '하위 인원 한도(%명)를 초과했습니다.', v_limit USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_partner_subordinate_limit ON public.partners;
CREATE TRIGGER enforce_partner_subordinate_limit BEFORE INSERT OR UPDATE OF master_id ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_subordinate_limit();

  v_apply_2 := true; v_result := v_result || E'\n[PASS] apply P1b subordinate limit';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1b: ' || SQLERRM; END;
BEGIN
-- p1c: 관리자만 실행 가능한 원자적 승격/강등 RPC. 등급은 C/Master만 허용한다.
CREATE TABLE IF NOT EXISTS public.partner_grade_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.partners(user_id),
  from_grade text,
  to_grade text NOT NULL CHECK (to_grade IN ('C', 'Master')),
  reason text,
  processed_by uuid NOT NULL REFERENCES public.profiles(id),
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_grade_history ENABLE ROW LEVEL SECURITY;
-- SQL 콘솔/서비스 롤(auth.uid() IS NULL) 실행도 이력을 남길 수 있게 처리자는 NULL을 허용한다.
ALTER TABLE public.partner_grade_history ALTER COLUMN processed_by DROP NOT NULL;
DROP POLICY IF EXISTS partner_grade_history_admin_only ON public.partner_grade_history;
CREATE POLICY partner_grade_history_admin_only ON public.partner_grade_history FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP FUNCTION IF EXISTS public.change_partner_grade(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.change_partner_grade(uuid,text,text,uuid,text);
CREATE OR REPLACE FUNCTION public.change_partner_grade(
  p_partner_id uuid, p_to_grade text, p_reason text DEFAULT NULL, p_master_id uuid DEFAULT NULL,
  p_new_role text DEFAULT NULL, p_change_master boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from_grade text; v_is_admin boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
    IF NOT v_is_admin THEN RAISE EXCEPTION '관리자만 등급을 변경할 수 있습니다.' USING ERRCODE = '42501'; END IF;
  END IF;
  IF p_to_grade NOT IN ('C','Master') THEN RAISE EXCEPTION '지원하지 않는 등급입니다.'; END IF;
  SELECT grade INTO v_from_grade FROM partners WHERE user_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '파트너를 찾을 수 없습니다.'; END IF;
  UPDATE partners SET grade = p_to_grade, master_id = CASE
    WHEN p_to_grade = 'Master' THEN NULL
    WHEN p_change_master THEN p_master_id
    ELSE master_id END
    WHERE user_id = p_partner_id;
  IF p_new_role IS NOT NULL THEN
    UPDATE profiles SET role = p_new_role WHERE id = p_partner_id;
  END IF;
  IF p_to_grade = 'C' AND v_from_grade = 'Master' THEN
    WITH detached_partners AS (
      UPDATE partners
      SET master_id = NULL
      WHERE master_id = p_partner_id
      RETURNING user_id, grade
    )
    INSERT INTO partner_grade_history(partner_id, from_grade, to_grade, reason, processed_by)
      SELECT user_id, grade, grade, '상위 마스터 강등으로 독립', auth.uid()
      FROM detached_partners;
    UPDATE partners SET max_subordinates = NULL WHERE user_id = p_partner_id;
  END IF;
  INSERT INTO partner_grade_history(partner_id, from_grade, to_grade, reason, processed_by)
    VALUES (p_partner_id, v_from_grade, p_to_grade, p_reason, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.change_partner_grade(uuid,text,text,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_partner_grade(uuid,text,text,uuid,text,boolean) TO authenticated;

  v_apply_3 := true; v_result := v_result || E'\n[PASS] apply P1c grade RPC';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1c: ' || SQLERRM; END;
BEGIN
CREATE TABLE IF NOT EXISTS public.partner_bank_accounts (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(user_id) ON DELETE CASCADE,
  bank_code text, bank_account text, bank_holder text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_bank_accounts_owner_or_admin ON public.partner_bank_accounts;
CREATE POLICY partner_bank_accounts_owner_or_admin ON public.partner_bank_accounts FOR ALL
USING (partner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (partner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- 기존 복합 문자열은 기존 표현을 보존하여 bank_account로 이관한다.
INSERT INTO public.partner_bank_accounts(partner_id, bank_account)
SELECT user_id, bank_account FROM public.partners WHERE NULLIF(trim(bank_account), '') IS NOT NULL
ON CONFLICT (partner_id) DO UPDATE SET bank_account = EXCLUDED.bank_account, updated_at = now();

  v_apply_4 := true; v_result := v_result || E'\n[PASS] apply P1d private bank table';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1d table: ' || SQLERRM; END;
BEGIN
CREATE OR REPLACE FUNCTION public.cancel_unpaid_settlements_for_cancelled_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE settlements SET status = 'cancelled'
    -- 결제 대기 건은 회수하고, 이미 지급 완료된 paid 정산은 회계 이력으로 유지한다.
    WHERE case_id = NEW.id AND status IN ('draft', 'pending', 'awaiting_payment');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cancel_unpaid_settlements_for_cancelled_case ON public.funeral_cases;
CREATE TRIGGER cancel_unpaid_settlements_for_cancelled_case AFTER UPDATE OF status ON public.funeral_cases
FOR EACH ROW EXECUTE FUNCTION public.cancel_unpaid_settlements_for_cancelled_case();

  v_apply_5 := true; v_result := v_result || E'\n[PASS] apply P1e cancellation settlement';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1e: ' || SQLERRM; END;
BEGIN
-- DB 기준 철자는 cancelled. 운영 상태 제약을 재생성해 canceled 유입을 차단한다.
UPDATE public.funeral_cases SET status = 'cancelled' WHERE status = 'canceled';
ALTER TABLE public.funeral_cases DROP CONSTRAINT IF EXISTS funeral_cases_status_check;
ALTER TABLE public.funeral_cases ADD CONSTRAINT funeral_cases_status_check CHECK
  (status IN ('requested','assigned','consulting','in_progress','team_settling','settling','hq_check','completed','cancelled')) NOT VALID;
ALTER TABLE public.funeral_cases VALIDATE CONSTRAINT funeral_cases_status_check;

  v_apply_6 := true; v_result := v_result || E'\n[PASS] apply P1f cancelled spelling';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1f: ' || SQLERRM; END;
BEGIN
CREATE OR REPLACE FUNCTION public.prevent_self_has_business_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.has_business IS DISTINCT FROM OLD.has_business
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION '사업자 여부는 관리자 확인 후 변경됩니다.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prevent_self_has_business_change ON public.profiles;
CREATE TRIGGER prevent_self_has_business_change BEFORE UPDATE OF has_business ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_has_business_change();

  v_apply_7 := true; v_result := v_result || E'\n[PASS] apply P1i business approval';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1i: ' || SQLERRM; END;
BEGIN
-- P2a: S is an independent top tier. Apply after P1b and P1c.
-- Do not modify calculate_settlements, assignment functions, or is_my_report here.

CREATE TABLE IF NOT EXISTS public.partner_hierarchy_rules (
  parent_grade text NOT NULL,
  child_grade text NOT NULL,
  PRIMARY KEY (parent_grade, child_grade)
);
DELETE FROM public.partner_hierarchy_rules;
INSERT INTO public.partner_hierarchy_rules (parent_grade, child_grade)
VALUES ('S', 'Master'), ('S', 'C'), ('Master', 'C');

ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_grade_check;
ALTER TABLE public.partners ADD CONSTRAINT partners_grade_check
  CHECK (grade IN ('C', 'Master', 'S'));

-- S is no longer normalized to Master; remove the old conversion helper.
DROP FUNCTION IF EXISTS public.normalize_partner_grade(text);

CREATE OR REPLACE FUNCTION public.is_master_or_above(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.partners p
                 WHERE p.user_id = p_user_id AND p.grade IN ('Master', 'S'))
$$;

CREATE OR REPLACE FUNCTION public.enforce_partner_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_child_role text; v_parent_role text; v_parent_grade text; v_cycle boolean;
BEGIN
  SELECT role INTO v_child_role FROM public.profiles WHERE id = NEW.user_id;
  IF v_child_role NOT IN ('dealer', 'leader') THEN
    RAISE EXCEPTION 'Only dealer and leader partners may have a hierarchy.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.grade = 'S' AND NEW.master_id IS NOT NULL THEN
    RAISE EXCEPTION 'S grade must be a root node.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.master_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.master_id = NEW.user_id THEN
    RAISE EXCEPTION 'A partner cannot be its own parent.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT pr.role, p.grade INTO v_parent_role, v_parent_grade
  FROM public.partners p JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = NEW.master_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent partner was not found.' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF v_parent_role <> v_child_role THEN
    RAISE EXCEPTION 'Parent and child must be in the same role line.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_hierarchy_rules r
                 WHERE r.parent_grade = v_parent_grade AND r.child_grade = NEW.grade) THEN
    RAISE EXCEPTION 'The parent and child grade combination is not allowed.' USING ERRCODE = 'check_violation';
  END IF;
  WITH RECURSIVE ancestors AS (
    SELECT user_id, master_id, ARRAY[user_id] AS path FROM public.partners WHERE user_id = NEW.master_id
    UNION ALL
    SELECT p.user_id, p.master_id, a.path || p.user_id FROM public.partners p JOIN ancestors a ON p.user_id = a.master_id
    WHERE NOT p.user_id = ANY(a.path) AND cardinality(a.path) < 16
  ) SELECT EXISTS (SELECT 1 FROM ancestors WHERE user_id = NEW.user_id) INTO v_cycle;
  IF v_cycle THEN RAISE EXCEPTION 'A hierarchy cycle is not allowed.' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_partner_hierarchy ON public.partners;
CREATE TRIGGER enforce_partner_hierarchy BEFORE INSERT OR UPDATE OF master_id, grade ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_hierarchy();

ALTER TABLE public.partner_grade_history DROP CONSTRAINT IF EXISTS partner_grade_history_to_grade_check;
ALTER TABLE public.partner_grade_history ADD CONSTRAINT partner_grade_history_to_grade_check
  CHECK (to_grade IN ('C', 'Master', 'S'));

CREATE OR REPLACE FUNCTION public.change_partner_grade(
  p_partner_id uuid, p_to_grade text, p_reason text DEFAULT NULL, p_master_id uuid DEFAULT NULL,
  p_new_role text DEFAULT NULL, p_change_master boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_from_grade text; v_role text; v_target_role text; v_is_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF auth.uid() IS NOT NULL AND NOT v_is_admin THEN RAISE EXCEPTION 'Only an admin may change a grade.' USING ERRCODE = '42501'; END IF;
  IF p_to_grade NOT IN ('C', 'Master', 'S') THEN RAISE EXCEPTION 'Unsupported grade.'; END IF;
  SELECT p.grade, pr.role INTO v_from_grade, v_role FROM public.partners p JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner was not found.'; END IF;
  v_target_role := COALESCE(p_new_role, v_role);
  IF v_target_role <> v_role THEN RAISE EXCEPTION 'A grade change cannot change the role line.' USING ERRCODE = 'check_violation'; END IF;

  -- S -> Master or C: all direct Master/C reports become HQ-direct and are recorded.
  IF v_from_grade = 'S' AND p_to_grade <> 'S' THEN
    WITH detached AS (UPDATE public.partners SET master_id = NULL WHERE master_id = p_partner_id RETURNING user_id, grade)
    INSERT INTO public.partner_grade_history(partner_id, from_grade, to_grade, reason, processed_by)
    SELECT user_id, grade, grade, 'S demotion: made HQ-direct', auth.uid() FROM detached;
  END IF;
  -- Master -> C: direct C reports must also become HQ-direct.
  IF v_from_grade = 'Master' AND p_to_grade = 'C' THEN
    WITH detached AS (UPDATE public.partners SET master_id = NULL WHERE master_id = p_partner_id RETURNING user_id, grade)
    INSERT INTO public.partner_grade_history(partner_id, from_grade, to_grade, reason, processed_by)
    SELECT user_id, grade, grade, 'Master demotion: made HQ-direct', auth.uid() FROM detached;
    UPDATE public.partners SET max_subordinates = NULL WHERE user_id = p_partner_id;
  END IF;
  UPDATE public.partners SET grade = p_to_grade,
    master_id = CASE WHEN p_to_grade = 'S' THEN NULL WHEN p_change_master THEN p_master_id ELSE master_id END
  WHERE user_id = p_partner_id;
  INSERT INTO public.partner_grade_history(partner_id, from_grade, to_grade, reason, processed_by)
  VALUES (p_partner_id, v_from_grade, p_to_grade, p_reason, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.change_partner_grade(uuid,text,text,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_partner_grade(uuid,text,text,uuid,text,boolean) TO authenticated;

-- [보안] 계층 규칙 표는 누구나 읽을 수 있지만 수정은 관리자(콘솔)만. Supabase 기본 권한으로 로그인 사용자가 규칙을 바꾸지 못하게 한다.
ALTER TABLE public.partner_hierarchy_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_hierarchy_rules_read ON public.partner_hierarchy_rules;
CREATE POLICY partner_hierarchy_rules_read ON public.partner_hierarchy_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS partner_hierarchy_rules_admin_write ON public.partner_hierarchy_rules;
CREATE POLICY partner_hierarchy_rules_admin_write ON public.partner_hierarchy_rules FOR ALL TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.partner_hierarchy_rules FROM anon, authenticated;

  v_apply_8 := true; v_result := v_result || E'\n[PASS] apply P2a hierarchy';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a hierarchy: ' || SQLERRM; END;
BEGIN
-- This RPC returns no customer, money, contact, or bank columns.
CREATE OR REPLACE FUNCTION public.s_downline_overview()
RETURNS TABLE (relationship text, partner_id uuid, 담당자명 text, 지역 text, 파트너상태 text, 접수일 timestamptz, 단계 text, 관시작시각 timestamptz, 입관시각 timestamptz, 종료시각 timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE tree AS (
    SELECT p.user_id, p.master_id, p.grade, pr.role, 1 AS depth, ARRAY[p.user_id] AS path FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.master_id=auth.uid()
    UNION ALL
    SELECT c.user_id, c.master_id, c.grade, pr.role, t.depth+1, t.path||c.user_id FROM public.partners c JOIN public.profiles pr ON pr.id=c.user_id JOIN tree t ON c.master_id=t.user_id WHERE t.depth < 8 AND NOT c.user_id=ANY(t.path)
  )
  SELECT CASE WHEN t.depth=1 AND t.grade='C' THEN 'direct_c' ELSE 'restricted_downline' END, t.user_id, pr.name, p.region, p.status, fc.created_at, fc.status, NULL::timestamptz, fc.encoffinment_time, fc.funeral_end_time
  FROM tree t JOIN public.partners p ON p.user_id=t.user_id JOIN public.profiles pr ON pr.id=t.user_id LEFT JOIN public.funeral_cases fc ON fc.dealer_id=t.user_id OR fc.team_leader_id=t.user_id
  WHERE EXISTS (SELECT 1 FROM public.partners me WHERE me.user_id=auth.uid() AND me.grade='S') AND t.role=(SELECT mepr.role FROM public.profiles mepr WHERE mepr.id=auth.uid())
$$;
REVOKE ALL ON FUNCTION public.s_downline_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.s_downline_overview() TO authenticated;

  v_apply_9 := true; v_result := v_result || E'\n[PASS] apply P2a S overview';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a overview: ' || SQLERRM; END;
BEGIN
CREATE OR REPLACE FUNCTION public.has_s_parent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.partners mine JOIN public.partners parent ON parent.user_id=mine.master_id WHERE mine.user_id=auth.uid() AND parent.grade='S')
$$;
DROP POLICY IF EXISTS partners_select ON public.partners;
CREATE POLICY partners_select ON public.partners FOR SELECT TO authenticated USING (
  public.is_admin() OR user_id=auth.uid() OR master_id=auth.uid() OR (public.is_my_master(user_id) AND NOT (grade='S' AND user_id<>auth.uid()))
);
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  public.is_admin() OR id=auth.uid() OR NOT EXISTS (SELECT 1 FROM public.partners mine JOIN public.partners parent ON parent.user_id=mine.master_id WHERE mine.user_id=auth.uid() AND parent.user_id=profiles.id AND parent.grade='S')
);
REVOKE ALL ON FUNCTION public.has_s_parent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_s_parent() TO authenticated;

  v_apply_10 := true; v_result := v_result || E'\n[PASS] apply P2a upstream RLS';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a RLS: ' || SQLERRM; END;
BEGIN
-- 대표마스터(S) 관리수수료는 패키지별 commission_policies에서만 관리한다.
ALTER TABLE public.commission_policies
  ADD COLUMN IF NOT EXISTS s_dealer_management_fee integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS s_leader_management_fee integer NOT NULL DEFAULT 0;

ALTER TABLE public.commission_policies
  DROP CONSTRAINT IF EXISTS commission_policies_s_dealer_management_fee_nonnegative,
  ADD CONSTRAINT commission_policies_s_dealer_management_fee_nonnegative
    CHECK (s_dealer_management_fee >= 0),
  DROP CONSTRAINT IF EXISTS commission_policies_s_leader_management_fee_nonnegative,
  ADD CONSTRAINT commission_policies_s_leader_management_fee_nonnegative
    CHECK (s_leader_management_fee >= 0);

-- package_name to policy mapping is defined once for management-fee aggregation.
-- This deliberately matches the existing calculate_settlements mapping without changing it.
CREATE OR REPLACE FUNCTION public.policy_id_for_package(p_package_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT CASE p_package_name
    WHEN '고급형' THEN 2
    WHEN '무빈소' THEN 3
    ELSE 1
  END;
$$;

  v_apply_15 := true; v_result := v_result || E'\n[PASS] apply P3c representative-master package pricing';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3c: ' || SQLERRM; END;
BEGIN
-- P3c must be applied first: the per-package representative-master amounts live in commission_policies.

ALTER TABLE public.funeral_cases ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE OR REPLACE FUNCTION public.zz_set_started_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'in_progress'
     AND NEW.status = 'in_progress'
     AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_set_started_at ON public.funeral_cases;
CREATE TRIGGER trg_zz_set_started_at
BEFORE UPDATE ON public.funeral_cases
FOR EACH ROW EXECUTE FUNCTION public.zz_set_started_at();

-- The helper is restricted to the caller's own root; it returns IDs only for reuse by restricted RPCs.
CREATE OR REPLACE FUNCTION public.partner_downline_ids(p_root uuid)
RETURNS TABLE (partner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  WITH RECURSIVE tree AS (
    SELECT p.user_id, ARRAY[p.user_id] AS path, 1 AS depth
    FROM public.partners p
    WHERE p.master_id = p_root
    UNION ALL
    SELECT c.user_id, t.path || c.user_id, t.depth + 1
    FROM public.partners c
    JOIN tree t ON c.master_id = t.user_id
    WHERE t.depth < 8 AND NOT c.user_id = ANY(t.path)
  )
  SELECT t.user_id
  FROM tree t
  WHERE p_root = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.partner_downline_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_downline_ids(uuid) TO authenticated;

-- S uses all recursive reports; Master uses direct reports only. The caller's own cases are excluded.
CREATE OR REPLACE FUNCTION public.my_management_fee_summary(
  p_month date DEFAULT (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul'))::date
)
RETURNS TABLE (
  in_progress_count bigint,
  completed_count bigint,
  month_started_count bigint,
  month_amount bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_grade text;
  v_line text;
BEGIN
  SELECT p.grade, CASE WHEN pr.role = 'leader' THEN 'leader' WHEN pr.role = 'dealer' THEN 'dealer' END
  INTO v_grade, v_line
  FROM public.partners p JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = v_uid;

  IF v_grade NOT IN ('S', 'Master') OR v_line IS NULL THEN
    RAISE EXCEPTION 'Management fee summary is restricted to S or Master partners.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT d.partner_id
    FROM public.partner_downline_ids(v_uid) d
    JOIN public.profiles pr ON pr.id = d.partner_id
    WHERE v_grade = 'S' AND ((v_line = 'leader' AND pr.role = 'leader') OR (v_line = 'dealer' AND pr.role = 'dealer'))
    UNION ALL
    SELECT p.user_id
    FROM public.partners p JOIN public.profiles pr ON pr.id = p.user_id
    WHERE v_grade = 'Master' AND p.master_id = v_uid
      AND ((v_line = 'leader' AND pr.role = 'leader') OR (v_line = 'dealer' AND pr.role = 'dealer'))
  ), cases AS (
    SELECT fc.status, fc.started_at, fc.package_name
    FROM public.funeral_cases fc
    JOIN targets t ON (v_line = 'dealer' AND fc.dealer_id = t.partner_id)
                   OR (v_line = 'leader' AND fc.team_leader_id = t.partner_id)
    WHERE fc.started_at IS NOT NULL AND fc.status <> 'cancelled'
  )
  SELECT
    count(*) FILTER (WHERE status IN ('in_progress', 'team_settling', 'hq_check')),
    count(*) FILTER (WHERE status = 'completed'),
    count(*) FILTER (WHERE (started_at AT TIME ZONE 'Asia/Seoul')::date >= p_month AND (started_at AT TIME ZONE 'Asia/Seoul')::date < (p_month + INTERVAL '1 month')::date),
    CASE
      -- Master management fees are settled by the existing settlement path, so this overview is count-only.
      WHEN v_grade = 'Master' THEN 0::bigint
      ELSE COALESCE(sum(
        CASE WHEN (started_at AT TIME ZONE 'Asia/Seoul')::date >= p_month AND (started_at AT TIME ZONE 'Asia/Seoul')::date < (p_month + INTERVAL '1 month')::date THEN
          CASE v_line
            WHEN 'dealer' THEN cp.s_dealer_management_fee
            WHEN 'leader' THEN cp.s_leader_management_fee
            ELSE 0
          END
        ELSE 0 END
      ), 0)::bigint
    END
  FROM cases c
  LEFT JOIN public.commission_policies cp ON cp.id = public.policy_id_for_package(c.package_name);
END;
$$;
REVOKE ALL ON FUNCTION public.my_management_fee_summary(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_management_fee_summary(date) TO authenticated;

  v_apply_11 := true; v_result := v_result || E'\n[PASS] apply P3a management fee';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3a: ' || SQLERRM; END;
BEGIN
-- P3b: 기준선2 운영 배정 함수 중 마스터 팀장 후보 판정만 변경한다.
-- grade='S' 내부값은 유지하며 S 하위 Master 팀장도 독립 Master 팀장과 같은 후보가 된다.

CREATE OR REPLACE FUNCTION public.is_master_leader(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.partners p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.user_id = p_user_id
      AND p.grade IN ('Master', 'S') -- P3b: master_id IS NULL 대신 등급으로 마스터 팀장 판정
      AND pr.role = 'leader'
      AND p.status = 'approved'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_assign_first_bidder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_dispatch_mode text; v_order_map jsonb; v_first_id uuid; v_timeout_mins int;
BEGIN
  IF NEW.status != 'requested' THEN RETURN NEW; END IF;
  SELECT value INTO v_dispatch_mode FROM system_config WHERE key = 'dispatch_mode';
  IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential', 'team_hybrid') THEN RETURN NEW; END IF;
  SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
  IF v_order_map IS NULL OR v_order_map = '{}'::jsonb THEN RETURN NEW; END IF;
  SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
  IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
  SELECT p.user_id INTO v_first_id FROM partners p
  WHERE p.current_status = 'waiting' AND p.status = 'approved'
    AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE (kv.key)::uuid = p.user_id)
  ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  IF v_first_id IS NULL THEN
    SELECT p.user_id INTO v_first_id FROM partners p JOIN profiles pr ON pr.id = p.user_id
    WHERE p.status = 'approved' AND p.current_status != 'off'
      AND p.grade IN ('Master', 'S') -- P3b: S 하위 Master 팀장도 비상 후보
      AND pr.role = 'leader'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
    IF v_first_id IS NOT NULL THEN PERFORM notify_emergency_dispatch(NEW.id, v_first_id); END IF;
  END IF;
  IF v_first_id IS NULL THEN PERFORM notify_escalation(NEW.id, 0, NULL); RETURN NEW; END IF;
  UPDATE funeral_cases SET current_bidder_id = v_first_id, current_bidder_pings = 1,
    bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = '{}'
  WHERE id = NEW.id;
  INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (NEW.id, v_first_id, 'offered', now());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb, p_previous uuid[], p_current_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
  v_excl := array_append(COALESCE(p_previous, '{}'), p_current_id);
  SELECT p.user_id INTO v_next_id FROM partners p
  WHERE p.current_status = 'waiting' AND p.status = 'approved' AND p.user_id != ALL(v_excl)
    AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
  ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  IF v_next_id IS NULL THEN
    SELECT p.user_id INTO v_next_id FROM partners p
    WHERE p.current_status = 'waiting' AND p.status = 'approved'
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  END IF;
  IF v_next_id IS NULL THEN
    SELECT p.user_id INTO v_next_id FROM partners p JOIN profiles pr ON pr.id = p.user_id
    WHERE p.status = 'approved' AND p.current_status != 'off'
      AND p.grade IN ('Master', 'S') -- P3b: S 하위 Master 팀장도 비상 후보
      AND pr.role = 'leader'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  END IF;
  RETURN v_next_id;
END;
$function$;

  v_apply_12 := true; v_result := v_result || E'\n[PASS] apply P3b S-child candidate';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3b: ' || SQLERRM; END;
BEGIN
-- P4 지역별 팀장 알림. 적용 순서: 이 파일 실행 후 send-alert Edge Function을 배포한다.
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES public.regions(id),
  name text NOT NULL, level text NOT NULL CHECK (level IN ('sido','sigungu')),
  sort integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  UNIQUE(parent_id, name)
);
CREATE TABLE IF NOT EXISTS public.partner_alert_regions (
  partner_id uuid NOT NULL REFERENCES public.partners(user_id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  PRIMARY KEY(partner_id, region_id)
);
ALTER TABLE public.funeral_cases ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id);
CREATE INDEX IF NOT EXISTS funeral_cases_region_id_idx ON public.funeral_cases(region_id);

INSERT INTO public.regions(parent_id,name,level,sort)
SELECT NULL::uuid, v.name, 'sido', v.sort
FROM (VALUES ('서울특별시',1),('인천광역시',2),('경기도',3)) AS v(name,sort)
WHERE NOT EXISTS (SELECT 1 FROM public.regions r WHERE r.parent_id IS NULL AND r.name=v.name AND r.level='sido');
WITH seed(sido,name,sort) AS (VALUES
 ('서울특별시','종로구',1),('서울특별시','중구',2),('서울특별시','용산구',3),('서울특별시','성동구',4),('서울특별시','광진구',5),('서울특별시','동대문구',6),('서울특별시','중랑구',7),('서울특별시','성북구',8),('서울특별시','강북구',9),('서울특별시','도봉구',10),('서울특별시','노원구',11),('서울특별시','은평구',12),('서울특별시','서대문구',13),('서울특별시','마포구',14),('서울특별시','양천구',15),('서울특별시','강서구',16),('서울특별시','구로구',17),('서울특별시','금천구',18),('서울특별시','영등포구',19),('서울특별시','동작구',20),('서울특별시','관악구',21),('서울특별시','서초구',22),('서울특별시','강남구',23),('서울특별시','송파구',24),('서울특별시','강동구',25),
 ('인천광역시','중구',1),('인천광역시','동구',2),('인천광역시','미추홀구',3),('인천광역시','연수구',4),('인천광역시','남동구',5),('인천광역시','부평구',6),('인천광역시','계양구',7),('인천광역시','서구',8),('인천광역시','강화군',9),('인천광역시','옹진군',10),
 ('경기도','수원시',1),('경기도','성남시',2),('경기도','의정부시',3),('경기도','안양시',4),('경기도','부천시',5),('경기도','광명시',6),('경기도','평택시',7),('경기도','동두천시',8),('경기도','안산시',9),('경기도','고양시',10),('경기도','과천시',11),('경기도','구리시',12),('경기도','남양주시',13),('경기도','오산시',14),('경기도','시흥시',15),('경기도','군포시',16),('경기도','의왕시',17),('경기도','하남시',18),('경기도','용인시',19),('경기도','파주시',20),('경기도','이천시',21),('경기도','안성시',22),('경기도','김포시',23),('경기도','화성시',24),('경기도','광주시',25),('경기도','양주시',26),('경기도','포천시',27),('경기도','여주시',28),('경기도','연천군',29),('경기도','가평군',30),('경기도','양평군',31))
INSERT INTO public.regions(parent_id,name,level,sort)
SELECT r.id, seed.name, 'sigungu', seed.sort FROM seed JOIN public.regions r ON r.name=seed.sido AND r.level='sido'
WHERE NOT EXISTS (SELECT 1 FROM public.regions old WHERE old.parent_id=r.id AND old.name=seed.name AND old.level='sigungu');

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_alert_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regions_read_all ON public.regions;
CREATE POLICY regions_read_all ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS regions_admin_write ON public.regions;
CREATE POLICY regions_admin_write ON public.regions FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS partner_alert_regions_owner_read ON public.partner_alert_regions;
CREATE POLICY partner_alert_regions_owner_read ON public.partner_alert_regions FOR SELECT USING (partner_id=auth.uid() OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS partner_alert_regions_owner_write ON public.partner_alert_regions;
CREATE POLICY partner_alert_regions_owner_write ON public.partner_alert_regions FOR ALL USING (partner_id=auth.uid()) WITH CHECK (partner_id=auth.uid());

CREATE OR REPLACE FUNCTION public.validate_partner_alert_region()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.partner_id AND role='leader') THEN RAISE EXCEPTION '팀장만 알림 지역을 선택할 수 있습니다.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS partner_alert_regions_leader_only ON public.partner_alert_regions;
CREATE TRIGGER partner_alert_regions_leader_only BEFORE INSERT OR UPDATE ON public.partner_alert_regions FOR EACH ROW EXECUTE FUNCTION public.validate_partner_alert_region();
INSERT INTO public.system_config(key,value) VALUES ('regional_alert_mode','off') ON CONFLICT (key) DO NOTHING;

-- Single source of truth for the opt-in rule. Approval, waiting and dispatch-order checks stay in existing candidate queries.
CREATE OR REPLACE FUNCTION public.leader_passes_region_filter(p_leader uuid,p_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH cfg AS (SELECT COALESCE((SELECT value FROM public.system_config WHERE key='regional_alert_mode'),'off') AS mode),
case_region AS (SELECT fc.region_id, r.parent_id FROM public.funeral_cases fc LEFT JOIN public.regions r ON r.id=fc.region_id WHERE fc.id=p_case_id),
prefs AS (SELECT par.region_id FROM public.partner_alert_regions par JOIN public.regions r ON r.id=par.region_id AND r.active=true WHERE par.partner_id=p_leader)
SELECT CASE WHEN (SELECT mode FROM cfg)='off' OR (SELECT region_id FROM case_region) IS NULL THEN true
 WHEN NOT EXISTS (SELECT 1 FROM prefs) THEN true
 WHEN (SELECT mode FROM cfg)='sigungu' THEN EXISTS (SELECT 1 FROM prefs p WHERE p.region_id=(SELECT region_id FROM case_region) OR p.region_id=(SELECT parent_id FROM case_region))
 WHEN (SELECT mode FROM cfg)='sido' THEN EXISTS (SELECT 1 FROM prefs p JOIN public.regions pr ON pr.id=p.region_id WHERE COALESCE(pr.parent_id,pr.id)=COALESCE((SELECT parent_id FROM case_region),(SELECT region_id FROM case_region)))
 ELSE true END; $$;
REVOKE ALL ON FUNCTION public.leader_passes_region_filter(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leader_passes_region_filter(uuid,uuid) TO authenticated, service_role;

-- P3b's latest S-grade candidate behavior plus the sole additional region predicate.
CREATE OR REPLACE FUNCTION public.auto_assign_first_bidder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_dispatch_mode text; v_order_map jsonb; v_first_id uuid; v_timeout_mins int;
BEGIN
 IF NEW.status!='requested' THEN RETURN NEW; END IF;
 SELECT value INTO v_dispatch_mode FROM public.system_config WHERE key='dispatch_mode';
 IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential','team_hybrid') THEN RETURN NEW; END IF;
 SELECT value::jsonb INTO v_order_map FROM public.system_config WHERE key='dispatch_order_map';
 IF v_order_map IS NULL OR v_order_map='{}'::jsonb THEN RETURN NEW; END IF;
 SELECT COALESCE(value::int,5) INTO v_timeout_mins FROM public.system_config WHERE key='bidding_timeout_minutes';
 SELECT p.user_id INTO v_first_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,NEW.id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_first_id IS NULL THEN SELECT p.user_id INTO v_first_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,NEW.id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; IF v_first_id IS NOT NULL THEN PERFORM public.notify_emergency_dispatch(NEW.id,v_first_id); END IF; END IF;
 IF v_first_id IS NULL THEN PERFORM public.notify_escalation(NEW.id,0,NULL); RETURN NEW; END IF;
 UPDATE public.funeral_cases SET current_bidder_id=v_first_id,current_bidder_pings=1,bid_timeout_at=now()+(v_timeout_mins||' minutes')::interval,previous_bidders='{}' WHERE id=NEW.id;
 INSERT INTO public.bidding_history(case_id,leader_id,status,offered_at) VALUES(NEW.id,v_first_id,'offered',now()); RETURN NEW;
END; $$;

-- Callers that know the case must use this four-argument form; it preserves all P3b candidate constraints and adds only the filter.
CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb,p_previous uuid[],p_current_id uuid,p_case_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
 v_excl:=array_append(COALESCE(p_previous,'{}'),p_current_id);
 SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND p.user_id!=ALL(v_excl) AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 RETURN v_next_id;
END; $$;

-- Keep the production timeout/pass logic intact; only pass the known case id to the regional-aware selector.
CREATE OR REPLACE FUNCTION public.process_bidding_timeouts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
    v_case RECORD; v_order_map jsonb; v_timeout_mins int; v_max_pings int; v_next_id uuid;
    v_pass_count int; v_excl uuid[]; v_is_cycling boolean; v_processed integer := 0;
BEGIN
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    SELECT COALESCE(value::int, 3) INTO v_max_pings FROM system_config WHERE key = 'bidding_max_pings';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
    IF v_max_pings IS NULL THEN v_max_pings := 3; END IF;
    FOR v_case IN SELECT id, current_bidder_id, previous_bidders, current_bidder_pings FROM funeral_cases WHERE status = 'requested' AND current_bidder_id IS NOT NULL AND bid_timeout_at < now() LOOP
        IF COALESCE(v_case.current_bidder_pings, 1) < v_max_pings THEN
            UPDATE funeral_cases SET current_bidder_pings = COALESCE(v_case.current_bidder_pings, 1) + 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval WHERE id = v_case.id;
        ELSE
            UPDATE bidding_history SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)' WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';
            INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_case.current_bidder_id, 'warning', '배정 미응답', format('%s회 미응답으로 다음 순번에게 배정됩니다.', v_max_pings), false, now());
            v_excl := array_append(COALESCE(v_case.previous_bidders, '{}'), v_case.current_bidder_id); v_pass_count := array_length(v_excl, 1);
            IF v_pass_count >= 3 THEN PERFORM notify_escalation(v_case.id, v_pass_count, v_case.current_bidder_id); END IF;
            v_next_id := NULL; v_is_cycling := false;
            IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
                v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id, v_case.id); -- P4: pass case id
                IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN v_is_cycling := true; END IF;
            END IF;
            IF v_next_id IS NOT NULL THEN
                IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN PERFORM notify_emergency_dispatch(v_case.id, v_next_id); END IF;
                UPDATE funeral_cases SET current_bidder_id = v_next_id, current_bidder_pings = 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_excl END WHERE id = v_case.id;
                INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (v_case.id, v_next_id, 'offered', now());
                INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_next_id, 'assignment', CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청' WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END, CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정합니다.' WHEN v_pass_count >= 3 THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count) ELSE '순차배정으로 새로운 콜이 배정되었습니다. 제한 시간 내 응답해주세요.' END, false, now());
            END IF;
        END IF;
        v_processed := v_processed + 1;
    END LOOP;
    RETURN v_processed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pass_bidding_internal(p_case_id uuid, p_leader_id uuid, p_reason text DEFAULT '수동 패스'::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
    v_order_map jsonb; v_timeout_mins int; v_next_id uuid; v_previous uuid[]; v_excl uuid[]; v_pass_count int; v_is_cycling boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM funeral_cases WHERE id = p_case_id AND current_bidder_id = p_leader_id AND status = 'requested') THEN RETURN 'NOT_CURRENT_BIDDER'; END IF;
    UPDATE bidding_history SET status = 'rejected', resolved_at = now(), reason = p_reason WHERE case_id = p_case_id AND leader_id = p_leader_id AND status = 'offered';
    UPDATE funeral_cases SET previous_bidders = array_append(COALESCE(previous_bidders, '{}'), p_leader_id) WHERE id = p_case_id;
    SELECT previous_bidders INTO v_previous FROM funeral_cases WHERE id = p_case_id; v_pass_count := array_length(v_previous, 1);
    IF v_pass_count >= 3 THEN PERFORM notify_escalation(p_case_id, v_pass_count, p_leader_id); END IF;
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
    v_next_id := NULL;
    IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
        v_next_id := find_next_bidder(v_order_map, v_previous, p_leader_id, p_case_id); -- P4: pass case id
        v_excl := array_append(COALESCE(v_previous, '{}'), p_leader_id);
        IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN v_is_cycling := true; END IF;
    END IF;
    IF v_next_id IS NOT NULL THEN
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN PERFORM notify_emergency_dispatch(p_case_id, v_next_id); END IF;
        UPDATE funeral_cases SET current_bidder_id = v_next_id, current_bidder_pings = 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_previous END WHERE id = p_case_id;
        INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (p_case_id, v_next_id, 'offered', now());
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_next_id, 'assignment', CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청' WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END, CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정합니다.' WHEN v_pass_count >= 3 THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count) ELSE '순차배정으로 새로운 콜이 배정되었습니다. 제한 시간 내 응답해주세요.' END, false, now());
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN RETURN 'ESCALATED_TO_MASTER'; END IF;
        IF v_is_cycling THEN RETURN 'CYCLING_RESTART'; END IF;
        RETURN 'PASSED_TO_NEXT';
    END IF;
    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id); RETURN 'NO_AVAILABLE_LEADER';
END;
$function$;

-- The two production callers now have explicit four-argument calls, so remove the ambiguous legacy overload.
DROP FUNCTION IF EXISTS public.find_next_bidder(jsonb,uuid[],uuid);

-- Existing public RPC callers keep their named six arguments; DEFAULT preserves old calls.
DROP FUNCTION IF EXISTS public.submit_emergency_case(text,text,text,text,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_emergency_case(p_name text,p_phone text,p_location text,p_package_name text,p_coupon_code text DEFAULT NULL,p_dealer_id uuid DEFAULT NULL,p_region_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_customer_id uuid; v_case_id uuid; v_dealer uuid:=p_dealer_id;
BEGIN
 IF p_region_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.regions WHERE id=p_region_id AND level='sigungu' AND active) THEN RAISE EXCEPTION '유효한 시·군·구 지역이 아닙니다.' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_customer_id FROM public.profiles WHERE role='customer' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') LIMIT 1;
 IF v_customer_id IS NULL THEN v_customer_id:=gen_random_uuid(); INSERT INTO public.profiles(id,name,phone,role) VALUES(v_customer_id,btrim(p_name),p_phone,'customer'); END IF;
 INSERT INTO public.funeral_cases(customer_id,dealer_id,location,package_name,status,funnel_type,coupon_code,region_id) VALUES(v_customer_id,v_dealer,btrim(coalesce(p_location,'')),btrim(coalesce(p_package_name,'')),'requested',CASE WHEN v_dealer IS NULL THEN 'organic_search' ELSE 'partner_referral' END,NULLIF(upper(btrim(coalesce(p_coupon_code,''))),''),p_region_id) RETURNING id INTO v_case_id;
 RETURN v_case_id;
END; $$;

  v_apply_13 := true; v_result := v_result || E'\n[PASS] apply P4 regional alerts';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P4: ' || SQLERRM; END;
BEGIN
-- P5 옛 정산 초안 트리거 제거 (사장님 결정 A안, 2026-11-04)
-- 사건 접수(INSERT) 직후 고정 금액(750000/50000/200000)으로 정산 초안을 만들던 trg_auto_draft_settlements 를 없앤다.
-- 진행 시작(in_progress) 때 calculate_settlements 가 commission_policies 금액으로 정산을 만든다.
-- 확인: 화면 코드는 접수 직후 초안을 읽지 않는다(TeamLeaderDashboard 는 team_settling 때 draft→awaiting_payment 로 바꿀 뿐이고
--       SettlementManager 의 '정산예정' 단계는 '상담 완료 후 정산 레코드 생성' 기준).
-- 함수 auto_create_draft_settlements() 는 되돌리기 쉽게 남겨 둔다(트리거만 제거).
DROP TRIGGER IF EXISTS trg_auto_draft_settlements ON public.funeral_cases;

  v_apply_16 := true; v_result := v_result || E'
[PASS] apply P5 drop old draft settlement trigger';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P5: ' || SQLERRM; END;
BEGIN
-- P6 profiles 조회를 '본인·관리자·관계 있는 상대'로 제한 (딜러<->팀장 상호 차단 포함; 이전 P6 RESTRICTIVE 안을 대체)
-- 현재 운영: profiles_select USING(true) -> 로그인한 누구나 전체 사용자의 이름·전화·이메일·푸시 토큰 등을 읽을 수 있다.
-- 변경: 한 함수 can_read_profile(대상)에서 규칙을 정하고 정책은 그 함수만 호출한다(규칙 변경은 함수 한 곳).
-- 허용 규칙(위에서부터 먼저 맞으면 허용; 2번은 최우선 거부):
--   본인 / 관리자 / [거부] 딜러<->팀장 상호 / 내 직속 상위(단, 마스터는 위 S 의 정보를 못 봄) / 내 직속 하위 /
--   내 사건의 담당 팀장·접수 딜러(고객 입장) / 내 사건의 고객(팀장·딜러·쿠폰 발행 딜러·상위 마스터 입장) /
--   출동 대기(requested) 사건의 고객(팀장; 현행 유지, 별도 정책 결정 대기) / 내게 알림·쪽지를 보낸 발신자(보낸 쪽 수신자는 제외) /
--   주문으로 연결된 팀장<->업체 / 관리자 프로필(문의·쪽지용)
-- 되돌리기: DROP POLICY profiles_select ON public.profiles; CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true); DROP FUNCTION public.can_read_profile(uuid);
-- 주의: fcm_token·email 등 컬럼 단위 제한은 이 파일 범위 밖(관계가 있는 상대에게는 같은 행의 컬럼이 보임).
CREATE OR REPLACE FUNCTION public.can_read_profile(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text; my_grade text; t_role text; t_grade text;
BEGIN
  IF me IS NULL OR p_target IS NULL THEN RETURN false; END IF;
  IF p_target = me THEN RETURN true; END IF;
  SELECT role INTO my_role FROM public.profiles WHERE id = me;
  IF my_role = 'admin' THEN RETURN true; END IF;
  SELECT role INTO t_role FROM public.profiles WHERE id = p_target;
  IF t_role IS NULL THEN RETURN false; END IF;
  -- 직거래 방지: 딜러와 팀장은 서로의 프로필을 읽지 못한다(사건을 같이 다뤄도 마찬가지).
  IF (my_role = 'dealer' AND t_role = 'leader') OR (my_role = 'leader' AND t_role = 'dealer') THEN RETURN false; END IF;
  SELECT grade INTO my_grade FROM public.partners WHERE user_id = me;
  SELECT grade INTO t_grade FROM public.partners WHERE user_id = p_target;
  -- 직속 상위: 마스터는 위의 대표마스터(S) 정보를 볼 수 없다.
  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = me AND master_id = p_target) THEN
    IF NOT (COALESCE(t_grade, '') = 'S' AND COALESCE(my_grade, '') = 'Master') THEN RETURN true; END IF;
  END IF;
  -- 직속 하위
  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = p_target AND master_id = me) THEN RETURN true; END IF;
  -- 고객 입장: 내 사건의 담당 팀장·접수 딜러
  IF EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id = me AND (fc.team_leader_id = p_target OR fc.dealer_id = p_target)) THEN RETURN true; END IF;
  -- 파트너 입장: 내 사건(또는 하위가 맡은 사건)의 고객
  IF EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.customer_id = p_target
      AND (fc.team_leader_id = me OR fc.dealer_id = me OR fc.current_bidder_id = me
           OR fc.coupon_code IN (SELECT c.code FROM public.coupons c WHERE c.issued_by = me)
           OR public.is_my_report(fc.dealer_id) OR public.is_my_report(fc.team_leader_id))
  ) THEN RETURN true; END IF;
  -- 출동 대기 사건의 고객(팀장에게만; 현행 동작 유지)
  IF my_role = 'leader' AND EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id = p_target AND fc.status = 'requested') THEN RETURN true; END IF;
  -- 알림·쪽지 상대
  -- (내가 받은 알림의 발신자만. 내가 보낸 알림의 수신자는 허용하지 않는다: 알림은 아무에게나 보낼 수 있어 우회로가 된다.)
  IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = me AND n.sender_id = p_target) THEN RETURN true; END IF;
  -- 주문으로 연결된 팀장 <-> 업체
  IF EXISTS (SELECT 1 FROM public.orders o JOIN public.vendors v ON v.id = o.vendor_id
             WHERE (o.team_leader_id = me AND v.user_id = p_target) OR (v.user_id = me AND o.team_leader_id = p_target)) THEN RETURN true; END IF;
  -- 관리자 프로필(문의·쪽지 대상)
  IF t_role = 'admin' THEN RETURN true; END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_no_dealer_leader_cross ON public.profiles;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (public.can_read_profile(id));

  v_apply_17 := true; v_result := v_result || E'
[PASS] apply P6 dealer-leader cross read block';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P6: ' || SQLERRM; END;
BEGIN
-- =============================================================================
-- [P7_승격요청.sql]
--
-- 1. 목적:
--   대표마스터(partners.grade = 'S')의 직속/하위 일반(C) 파트너에 대한 마스터(Master) 승격 요청,
--   본사 관리자(admin)의 승인/거절 심사, 및 본사 관리자 전용 승격 되돌리기(revert) 워크플로우를 구현합니다.
--
-- 2. 적용 순서:
--   - P2a_관리자등급_계층규칙.sql (change_partner_grade 최신 RPC 및 계층 검증 트리거)
--   - P3a_관리수수료_집계.sql (partner_downline_ids 하위 파트너 재귀 조회 헬퍼)
--   - 본 파일 (P7_승격요청.sql) 적용
--
-- 3. 되돌리기 (롤백 스크립트):
--   DROP FUNCTION IF EXISTS public.list_partner_promotion_requests(text);
--   DROP FUNCTION IF EXISTS public.revert_partner_promotion(uuid, text);
--   DROP FUNCTION IF EXISTS public.decide_partner_promotion(uuid, boolean, text);
--   DROP FUNCTION IF EXISTS public.request_partner_promotion(uuid, text);
--   DROP TABLE IF EXISTS public.partner_promotion_requests CASCADE;
-- =============================================================================

-- =============================================================================
-- (1) 표 public.partner_promotion_requests 생성 및 인덱스/RLS/권한 설정
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.partner_promotion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id),
  target_id uuid NOT NULL REFERENCES public.profiles(id),
  from_grade text NOT NULL,
  to_grade text NOT NULL CHECK (to_grade IN ('Master')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reverted')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  reverted_by uuid,
  reverted_at timestamptz
);

-- target 당 pending 1건만 되게 부분 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS partner_promotion_requests_target_pending_idx
  ON public.partner_promotion_requests (target_id)
  WHERE (status = 'pending');

-- RLS 활성화
ALTER TABLE public.partner_promotion_requests ENABLE ROW LEVEL SECURITY;

-- 정책 설정: 관리자(public.is_admin()) 전체 SELECT, 요청자 본인은 자기 요청만 SELECT
-- (INSERT / UPDATE / DELETE 정책 없음: RPC로만 변경 허용)
DROP POLICY IF EXISTS partner_promotion_requests_select_policy ON public.partner_promotion_requests;
CREATE POLICY partner_promotion_requests_select_policy
  ON public.partner_promotion_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR requester_id = auth.uid()
  );

-- 테이블 직접 권한: authenticated 역할에 SELECT만 허용
REVOKE ALL ON TABLE public.partner_promotion_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.partner_promotion_requests FROM anon;
GRANT SELECT ON TABLE public.partner_promotion_requests TO authenticated;


-- =============================================================================
-- (2) request_partner_promotion: 대표마스터의 승격 요청 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_partner_promotion(
  p_target uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_grade text;
  v_caller_role text;
  v_target_grade text;
  v_target_role text;
  v_req_id uuid;
BEGIN
  -- 1) 호출자 인증 확인
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 호출자가 partners.grade = 'S' 인지 확인
  SELECT p.grade, pr.role
  INTO v_caller_grade, v_caller_role
  FROM public.partners p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = v_caller_id;

  IF NOT FOUND OR v_caller_grade IS DISTINCT FROM 'S' THEN
    RAISE EXCEPTION '대표마스터(S 등급) 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 3) 대상 파트너(target) 확인
  SELECT p.grade, pr.role
  INTO v_target_grade, v_target_role
  FROM public.partners p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 대상 파트너를 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 4) target 의 partners.grade 가 'C' 인지 확인
  IF v_target_grade <> 'C' THEN
    RAISE EXCEPTION '일반(C) 등급 파트너만 마스터 승격을 요청할 수 있습니다. (현재 등급: %)', v_target_grade
      USING ERRCODE = 'P0001';
  END IF;

  -- 5) 호출자와 대상이 같은 profiles.role 라인인지 확인
  IF v_caller_role IS DISTINCT FROM v_target_role THEN
    RAISE EXCEPTION '동일한 직군 라인(딜러/팀장)의 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 6) target 이 호출자의 하위 조직(public.partner_downline_ids)에 속하는지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_downline_ids(v_caller_id) d
    WHERE d.partner_id = p_target
  ) THEN
    RAISE EXCEPTION '본인의 직속/하위 조직 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 7) 이미 pending 중인 요청이 있는지 확인 (유니크 인덱스 이전 명시적 메시지)
  IF EXISTS (
    SELECT 1 FROM public.partner_promotion_requests
    WHERE target_id = p_target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION '해당 파트너에 대해 이미 심사 대기 중인 승격 요청이 존재합니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 8) 승격 요청 생성 (from_grade: target 현재 등급, to_grade: 'Master')
  INSERT INTO public.partner_promotion_requests (
    requester_id,
    target_id,
    from_grade,
    to_grade,
    status,
    reason
  ) VALUES (
    v_caller_id,
    p_target,
    v_target_grade,
    'Master',
    'pending',
    p_reason
  )
  RETURNING id INTO v_req_id;

  RETURN v_req_id;
END;
$$;


-- =============================================================================
-- (3) decide_partner_promotion: 본사의 승격 승인 / 거절 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.decide_partner_promotion(
  p_request uuid,
  p_approve boolean,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_req public.partner_promotion_requests%ROWTYPE;
BEGIN
  -- 1) 관리자 권한 확인 (콘솔 실행인 auth.uid() IS NULL 환경은 허용)
  IF v_caller_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 승격 요청을 심사할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 요청 조회 및 행 잠금(FOR UPDATE), pending 상태 확인
  SELECT *
  INTO v_req
  FROM public.partner_promotion_requests
  WHERE id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 요청을 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION '대기 중(pending)인 승격 요청만 처리할 수 있습니다. (현재 상태: %)', v_req.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) 승인 / 거절 분기 처리
  IF p_approve THEN
    -- 승인: 최신 change_partner_grade 시그니처에 맞춰 호출하여 target을 'Master'로 승격
    PERFORM public.change_partner_grade(
      p_partner_id := v_req.target_id,
      p_to_grade := 'Master',
      p_reason := '대표마스터 요청 승인: ' || p_request::text,
      p_master_id := NULL,
      p_new_role := NULL,
      p_change_master := false
    );

    UPDATE public.partner_promotion_requests
    SET
      status = 'approved',
      decided_by = v_caller_id,
      decided_at = now(),
      decision_note = p_note
    WHERE id = p_request;
  ELSE
    -- 거절: status rejected 기록
    UPDATE public.partner_promotion_requests
    SET
      status = 'rejected',
      decided_by = v_caller_id,
      decided_at = now(),
      decision_note = p_note
    WHERE id = p_request;
  END IF;
END;
$$;


-- =============================================================================
-- (4) revert_partner_promotion: 본사 전용 승격 되돌리기(revert) RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revert_partner_promotion(
  p_request uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_req public.partner_promotion_requests%ROWTYPE;
BEGIN
  -- 1) 관리자 권한 확인 (콘솔 실행인 auth.uid() IS NULL 환경은 허용)
  IF v_caller_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 승격을 되돌릴 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 요청 조회 및 행 잠금(FOR UPDATE), approved 상태 확인
  SELECT *
  INTO v_req
  FROM public.partner_promotion_requests
  WHERE id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 요청을 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION '승인된(approved) 요청만 되돌릴 수 있습니다. (현재 상태: %)', v_req.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) change_partner_grade 로 target 을 from_grade 로 원복
  PERFORM public.change_partner_grade(
    p_partner_id := v_req.target_id,
    p_to_grade := v_req.from_grade,
    p_reason := '승격 되돌리기: ' || p_request::text,
    p_master_id := NULL,
    p_new_role := NULL,
    p_change_master := false
  );

  -- 4) 요청 상태를 reverted 로 갱신 및 되돌리기 이력 기록
  UPDATE public.partner_promotion_requests
  SET
    status = 'reverted',
    reverted_by = v_caller_id,
    reverted_at = now(),
    decision_note = CASE
      WHEN p_note IS NOT NULL AND p_note <> '' THEN
        CASE
          WHEN decision_note IS NOT NULL AND decision_note <> '' THEN
            decision_note || E'\n[되돌리기] ' || p_note
          ELSE
            p_note
        END
      ELSE decision_note
    END
  WHERE id = p_request;
END;
$$;


-- =============================================================================
-- (5) list_partner_promotion_requests: 승격 요청 목록 조회 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_partner_promotion_requests(
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  requester_name text,
  target_id uuid,
  target_name text,
  from_grade text,
  to_grade text,
  status text,
  reason text,
  created_at timestamptz,
  decided_at timestamptz,
  decision_note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- 관리자 여부 판별 (auth.uid() IS NULL 인 콘솔 환경은 전체 조회 허용)
  IF v_caller_id IS NULL THEN
    v_is_admin := true;
  ELSE
    v_is_admin := public.is_admin();
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.requester_id,
    COALESCE(req_p.name, '알 수 없음')::text AS requester_name,
    r.target_id,
    COALESCE(tgt_p.name, '알 수 없음')::text AS target_name,
    r.from_grade,
    r.to_grade,
    r.status,
    r.reason,
    r.created_at,
    r.decided_at,
    r.decision_note
  FROM public.partner_promotion_requests r
  LEFT JOIN public.profiles req_p ON req_p.id = r.requester_id
  LEFT JOIN public.profiles tgt_p ON tgt_p.id = r.target_id
  WHERE (v_is_admin OR r.requester_id = v_caller_id)
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.created_at DESC;
END;
$$;


-- =============================================================================
-- 함수 실행 권한 설정: PUBLIC 권한 회수 및 authenticated 권한 부여
-- =============================================================================
REVOKE ALL ON FUNCTION public.request_partner_promotion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_partner_promotion(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_partner_promotion(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_partner_promotion(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_partner_promotion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_partner_promotion(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_partner_promotion_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_partner_promotion_requests(text) TO authenticated;

  v_apply_18 := true; v_result := v_result || E'
[PASS] apply P7 promotion requests';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P7: ' || SQLERRM; END;
BEGIN
-- P8 팀장 본인 장례(기록용, is_private) 의 홍보 공개 동의 표시 칸 (사장님 결정 2026-11-04)
-- 유족이 보안(익명) 처리된 홍보 자료(진행 화면·블로그)로 쓰는 데 동의했는지 기록한다. 기본값 false(미동의).
-- 홍보 공개 기능 자체는 이번 범위 아님: 이 칸이 true 인 기록만 나중에 공개 후보가 된다.
-- 되돌리기: ALTER TABLE public.funeral_cases DROP COLUMN publicity_consent;
ALTER TABLE public.funeral_cases ADD COLUMN IF NOT EXISTS publicity_consent boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.funeral_cases.publicity_consent IS '유족의 홍보 자료 공개 동의(익명·보안 처리 전제). 팀장 본인 장례(is_private) 기록용에서 사용.';

  v_apply_19 := true; v_result := v_result || E'
[PASS] apply P8 publicity consent column';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P8: ' || SQLERRM; END;
-- P1d DROP is intentionally last: the final exception rolls this DDL back.
BEGIN
-- 반드시 P1d_계좌_비공개테이블_생성_이관.sql 적용 및 대조 후 마지막에만 실행한다.
ALTER TABLE public.partners DROP COLUMN IF EXISTS bank_account;

  v_apply_14 := true; v_result := v_result || E'\n[PASS] apply P1d legacy bank column drop';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1d drop: ' || SQLERRM; END;

-- Test data is always selected from existing rows: no profiles/auth.users INSERT is permitted.
SELECT p.user_id INTO v_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' ORDER BY p.user_id LIMIT 1;
SELECT p.user_id INTO v_other_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' AND p.user_id IS DISTINCT FROM v_leader ORDER BY p.user_id LIMIT 1;
SELECT id INTO v_customer FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;

-- P1h: report the live policy surface instead of applying its proposal SQL.
SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
v_result := v_result || E'\n[INFO] P1h profiles policy count=' || v_n;

-- No public function, including both alert paths, may invoke an external HTTP/network API.
SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND (pg_get_functiondef(p.oid) ~* E'supabase_functions\\.http_request' OR pg_get_functiondef(p.oid) ~* E'\\mnet\\s*\\.');
IF v_n=0 THEN v_result:=v_result||E'\n[PASS] no public external HTTP/network calls'; ELSE v_result:=v_result||E'\n[FAIL] public external HTTP/network calls='||v_n; END IF;

-- Required actual lifecycle: INSERT -> in_progress -> cancelled, with the alert triggers already disabled.
IF v_apply_1 AND v_apply_5 AND v_apply_6 AND v_apply_11 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  BEGIN
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
      VALUES(v_customer,v_leader,'requested','DRYRUN only','일반형') RETURNING id INTO v_case;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=v_case;
    SELECT count(*) INTO v_n FROM public.settlements WHERE case_id=v_case;
    UPDATE public.funeral_cases SET status='cancelled' WHERE id=v_case;
    SELECT count(*) INTO v_n2 FROM public.settlements WHERE case_id=v_case AND status IN ('draft','pending','awaiting_payment');
    IF v_n2=0 THEN v_result:=v_result||E'\n[PASS] lifecycle INSERT -> in_progress -> cancelled; settlements='||v_n;
    ELSE v_result:=v_result||E'\n[FAIL] lifecycle unpaid settlements not cancelled='||v_n2; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] lifecycle: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] lifecycle | apply prerequisite or existing customer/leader missing'; END IF;

-- P1a: repeated generator invocation must not make duplicate (case, recipient, type) settlement rows.
IF v_apply_1 AND v_case IS NOT NULL THEN
  BEGIN
    UPDATE public.funeral_cases SET status='requested' WHERE id=v_case; UPDATE public.funeral_cases SET status='in_progress' WHERE id=v_case;
    SELECT count(*)-count(DISTINCT (case_id,recipient_id,type)) INTO v_n FROM public.settlements WHERE case_id=v_case;
    IF v_n=0 THEN v_result:=v_result||E'\n[PASS] P1a duplicate settlement prevention'; ELSE v_result:=v_result||E'\n[FAIL] P1a duplicate settlement rows='||v_n; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P1a actual: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P1a actual | lifecycle unavailable'; END IF;

-- P1c/P1i permission denials: authenticated role + claims, always reset in both paths.
IF v_apply_3 AND v_leader IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_leader::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_leader::text,true);
  PERFORM public.change_partner_grade(v_leader,'C','dryrun unauthorized'); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[FAIL] P1c non-admin grade change allowed';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[PASS] P1c non-admin grade change denied';
WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P1c permission: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P1c permission | prerequisite/data'; END IF;
IF v_apply_7 AND v_leader IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_leader::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_leader::text,true);
  UPDATE public.profiles SET has_business=NOT coalesce(has_business,false) WHERE id=v_leader; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[FAIL] P1i self has_business change allowed';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[PASS] P1i self has_business change denied';
WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P1i permission: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P1i permission | prerequisite/data'; END IF;

-- P1b NULL unlimited, P2a allowed/forbidden hierarchy and P3b use existing approved leaders only.
IF v_apply_2 AND v_apply_8 AND v_apply_12 AND v_leader IS NOT NULL AND v_other_leader IS NOT NULL THEN
  BEGIN
    SELECT p.user_id INTO v_s FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.user_id=v_leader;
    v_master:=v_other_leader; UPDATE public.partners SET grade='S',master_id=NULL,max_subordinates=NULL WHERE user_id=v_s;
    UPDATE public.partners SET grade='Master',master_id=v_s WHERE user_id=v_master;
    IF public.is_master_leader(v_master) THEN v_result:=v_result||E'\n[PASS] P2a S->Master allowed and P3b candidate'; ELSE v_result:=v_result||E'\n[FAIL] P3b S-child Master not candidate'; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P1b/P2a/P3b actual: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P1b/P2a/P3b | prerequisite/data'; END IF;

IF v_apply_9 AND v_s IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT count(*) INTO v_n FROM public.s_downline_overview(); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_n>0 THEN v_result:=v_result||E'\n[PASS] P2a S overview actual rows='||v_n; ELSE v_result:=v_result||E'\n[FAIL] P2a S overview no rows'; END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P2a S overview: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a S overview | prerequisite/data'; END IF;

IF v_apply_4 THEN SELECT count(*) INTO v_n FROM public.partner_bank_accounts; v_result:=v_result||E'\n[PASS] P1d bank table readable by owner/admin policy; migrated rows='||v_n; ELSE v_result:=v_result||E'\n[SKIP] P1d bank/RLS | prerequisite failed'; END IF;
IF v_apply_11 AND v_case IS NOT NULL THEN SELECT started_at IS NOT NULL INTO v_detail FROM public.funeral_cases WHERE id=v_case; v_result:=v_result||E'\n[INFO] P3a started_at recorded='||coalesce(v_detail,'false'); ELSE v_result:=v_result||E'\n[SKIP] P3a started_at | lifecycle unavailable'; END IF;

-- Remaining prior scenarios: verify the concrete rule table, forbidden S child relation, upstream RLS helper, and fee RPC.
IF v_apply_2 THEN SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_max_subordinates_nonnegative'; IF v_n=1 THEN v_result:=v_result||E'\n[PASS] P1b NULL/unlimited constraint installed'; ELSE v_result:=v_result||E'\n[FAIL] P1b limit constraint missing'; END IF; ELSE v_result:=v_result||E'\n[SKIP] P1b limit/null | prerequisite failed'; END IF;
IF v_apply_8 THEN
  SELECT count(*) INTO v_n FROM public.partner_hierarchy_rules WHERE (parent_grade,child_grade) IN (('S','Master'),('S','C'),('Master','C'));
  IF v_n=3 THEN v_result:=v_result||E'\n[PASS] P2a allowed S/Master/C combinations'; ELSE v_result:=v_result||E'\n[FAIL] P2a allowed combinations count='||v_n; END IF;
  IF v_s IS NOT NULL AND v_master IS NOT NULL THEN BEGIN UPDATE public.partners SET master_id=v_master WHERE user_id=v_s; v_result:=v_result||E'\n[FAIL] P2a forbidden S child relation allowed'; EXCEPTION WHEN check_violation THEN v_result:=v_result||E'\n[PASS] P2a forbidden S child relation denied'; WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P2a forbidden relation: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a forbidden relation | hierarchy data unavailable'; END IF;
ELSE v_result:=v_result||E'\n[SKIP] P2a rule table | prerequisite failed'; END IF;
IF v_apply_10 AND v_master IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_master::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_master::text,true);
  SELECT public.has_s_parent()::text INTO v_detail; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[PASS] P2a upstream RLS helper actual='||coalesce(v_detail,'false');
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P2a upstream RLS: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a upstream RLS | prerequisite/data'; END IF;
-- P3a/P3c: an S caller receives the sum of the current-month, per-package amounts.
-- Test-only policy updates and cases are rolled back by the enclosing DRYRUN DO block.
IF v_apply_15 THEN
  SELECT (public.policy_id_for_package('기본형')=1 AND public.policy_id_for_package('고급형')=2 AND public.policy_id_for_package('무빈소')=3)::text INTO v_detail;
  IF v_detail='true' THEN v_result:=v_result||E'\n[PASS] P3c package-to-policy mapping 1/2/3'; ELSE v_result:=v_result||E'\n[FAIL] P3c package-to-policy mapping'; END IF;
ELSE v_result:=v_result||E'\n[SKIP] P3c package-to-policy mapping | apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_s IS NOT NULL AND v_master IS NOT NULL AND v_customer IS NOT NULL THEN BEGIN
  UPDATE public.commission_policies SET s_leader_management_fee=11111 WHERE id=1;
  UPDATE public.commission_policies SET s_leader_management_fee=22222 WHERE id=2;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount INTO v_n FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
    VALUES(v_customer,v_master,'requested','DRYRUN P3a package 1','기본형') RETURNING id INTO v_fee_case_1;
  INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
    VALUES(v_customer,v_master,'requested','DRYRUN P3a package 2','고급형') RETURNING id INTO v_fee_case_2;
  UPDATE public.funeral_cases SET status='in_progress' WHERE id IN (v_fee_case_1,v_fee_case_2);
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount INTO v_n2 FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_n2-v_n=33333 THEN v_result:=v_result||E'\n[PASS] P3a/P3c package fee sum delta=33333'; ELSE v_result:=v_result||E'\n[FAIL] P3a/P3c package fee sum expected delta=33333 actual='||coalesce((v_n2-v_n)::text,'NULL'); END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a/P3c package fee sum: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P3a/P3c package fee sum | approved S/downline/customer data or apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_master IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_master::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_master::text,true);
  SELECT month_amount::text INTO v_detail FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_detail='0' THEN v_result:=v_result||E'\n[PASS] P3a Master summary amount=0'; ELSE v_result:=v_result||E'\n[FAIL] P3a Master summary amount expected=0 actual='||coalesce(v_detail,'NULL'); END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a Master fee summary: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P3a Master fee summary | approved Master data or apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_s IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount::text INTO v_detail FROM public.my_management_fee_summary() LIMIT 1; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[PASS] P3a S/Master fee summary actual month_amount='||coalesce(v_detail,'0');
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a fee summary: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P3a fee summary | prerequisite/data'; END IF;

-- P4 plan: off preserves all candidates; sigungu/sido match and mismatch are checked against the filter itself (no Edge/network call).
IF v_apply_13 AND v_case IS NOT NULL AND v_leader IS NOT NULL THEN
  BEGIN
    SELECT r.id,r.parent_id INTO v_region,v_sido FROM public.regions r WHERE r.name='종로구' AND r.level='sigungu' LIMIT 1;
    SELECT r.id,r.parent_id INTO v_other_region,v_other_sido FROM public.regions r WHERE r.name='중구' AND r.level='sigungu' AND r.parent_id IS DISTINCT FROM v_sido LIMIT 1;
    UPDATE public.system_config SET value='off' WHERE key='regional_alert_mode';
    IF public.leader_passes_region_filter(v_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 off keeps existing behavior'; ELSE v_result:=v_result||E'\n[FAIL] P4 off filtered leader'; END IF;
    IF v_region IS NULL OR v_other_region IS NULL OR v_other_leader IS NULL THEN v_result:=v_result||E'\n[SKIP] P4 enabled scenarios | region/second leader missing';
    ELSE
      UPDATE public.funeral_cases SET region_id=v_region WHERE id=v_case;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_region),(v_other_leader,v_other_region);
      UPDATE public.system_config SET value='sigungu' WHERE key='regional_alert_mode';
      IF public.leader_passes_region_filter(v_leader,v_case) AND NOT public.leader_passes_region_filter(v_other_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 sigungu selected/mismatch'; ELSE v_result:=v_result||E'\n[FAIL] P4 sigungu selected/mismatch'; END IF;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_sido),(v_other_leader,v_other_sido);
      UPDATE public.system_config SET value='sido' WHERE key='regional_alert_mode';
      IF public.leader_passes_region_filter(v_leader,v_case) AND NOT public.leader_passes_region_filter(v_other_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 sido selected/mismatch'; ELSE v_result:=v_result||E'\n[FAIL] P4 sido selected/mismatch'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P4 scenario: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P4 scenarios | prerequisite/data'; END IF;

-- P4 follow-up: callers must use the sole four-argument selector; test only reuses and updates existing partners/regions.
IF v_apply_13 AND v_case IS NOT NULL AND v_leader IS NOT NULL AND v_other_leader IS NOT NULL THEN
  DECLARE v_map jsonb; v_next_4 uuid; v_next_null uuid; v_next_region uuid; v_next_inactive uuid;
  BEGIN
    SELECT id INTO v_region FROM public.regions WHERE level='sigungu' AND active ORDER BY sort,id LIMIT 1;
    SELECT id INTO v_other_region FROM public.regions WHERE level='sigungu' AND active AND id IS DISTINCT FROM v_region ORDER BY sort,id LIMIT 1;
    IF v_region IS NULL OR v_other_region IS NULL THEN
      v_result:=v_result||E'\n[SKIP] P4 next-bidder/caller scenarios | two active sigungu regions missing';
    ELSE
      v_map:=jsonb_build_object(v_leader::text,'1',v_other_leader::text,'2');
      UPDATE public.partners SET status='approved',current_status='waiting',last_assigned_at=now() WHERE user_id=v_leader;
      UPDATE public.partners SET status='approved',current_status='waiting',last_assigned_at=now()-interval '1 minute' WHERE user_id=v_other_leader;
      UPDATE public.funeral_cases SET region_id=v_region WHERE id=v_case;
      UPDATE public.system_config SET value='off' WHERE key='regional_alert_mode';
      v_next_4:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      v_next_null:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,NULL);
      IF v_next_4 IS NOT DISTINCT FROM v_next_null THEN v_result:=v_result||E'\n[PASS] P4 off four-arg and NULL-case selector match'; ELSE v_result:=v_result||E'\n[FAIL] P4 off four-arg and NULL-case selector differ'; END IF;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_region),(v_other_leader,v_other_region);
      UPDATE public.system_config SET value='sigungu' WHERE key='regional_alert_mode';
      v_next_region:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      IF v_next_region=v_leader THEN v_result:=v_result||E'\n[PASS] P4 sigungu next bidder is matching leader'; ELSE v_result:=v_result||E'\n[FAIL] P4 sigungu next bidder mismatch'; END IF;
      UPDATE public.regions SET active=false WHERE id=v_other_region;
      v_next_inactive:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      IF public.leader_passes_region_filter(v_other_leader,v_case) AND v_next_inactive=v_other_leader THEN v_result:=v_result||E'\n[PASS] P4 inactive-only preference treated as no preference'; ELSE v_result:=v_result||E'\n[FAIL] P4 inactive-only preference filtered'; END IF;
    END IF;
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND ((p.proname='process_bidding_timeouts' AND pg_get_functiondef(p.oid) ~ E'find_next_bidder\\s*\\(\\s*v_order_map\\s*,\\s*v_case\\.previous_bidders\\s*,\\s*v_case\\.current_bidder_id\\s*,\\s*v_case\\.id\\s*\\)') OR (p.proname='pass_bidding_internal' AND pg_get_functiondef(p.oid) ~ E'find_next_bidder\\s*\\(\\s*v_order_map\\s*,\\s*v_previous\\s*,\\s*p_leader_id\\s*,\\s*p_case_id\\s*\\)'));
    IF v_n=2 THEN v_result:=v_result||E'\n[PASS] P4 timeout/pass callers use four-arg selector'; ELSE v_result:=v_result||E'\n[FAIL] P4 timeout/pass caller four-arg definitions='||v_n; END IF;
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='find_next_bidder';
    IF v_n=1 THEN v_result:=v_result||E'\n[PASS] P4 find_next_bidder legacy overload removed'; ELSE v_result:=v_result||E'\n[FAIL] P4 find_next_bidder overload count='||v_n; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P4 next-bidder/caller scenario: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P4 next-bidder/caller scenarios | prerequisite/data'; END IF;

-- P5/P1a: no draft settlements at intake; policy settlements at in_progress; is_private (team leader own funeral, record only) creates none.
IF v_apply_1 AND v_apply_16 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  DECLARE c1 uuid; c2 uuid; n_intake bigint; n_start bigint; n_private bigint;
  BEGIN
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
      VALUES(v_customer,v_leader,'requested','DRYRUN P5 normal','기본형') RETURNING id INTO c1;
    SELECT count(*) INTO n_intake FROM public.settlements WHERE case_id=c1;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=c1;
    SELECT count(*) INTO n_start FROM public.settlements WHERE case_id=c1;
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name,is_private)
      VALUES(v_customer,v_leader,'requested','DRYRUN P5 private','기본형',true) RETURNING id INTO c2;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=c2;
    SELECT count(*) INTO n_private FROM public.settlements WHERE case_id=c2;
    IF n_intake=0 AND n_start>0 AND n_private=0 THEN
      v_result:=v_result||E'
[PASS] P5/P1a no intake draft; in_progress settlements='||n_start||'; private case settlements=0';
    ELSE
      v_result:=v_result||E'
[FAIL] P5/P1a intake='||n_intake||' start='||n_start||' private='||n_private;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[FAIL] P5/P1a: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P5/P1a | prerequisite/data'; END IF;

-- P6 (relationship-based profiles read). Builds a case customer<->dealer+leader, an unrelated customer/dealer, and master/S upline.
IF v_apply_17 THEN
  DECLARE d uuid; d2 uuid; l uuid; m1 uuid; s1 uuid; cu uuid; cu2 uuid; ad uuid; cs uuid;
    n_d_l bigint; n_d_cu bigint; n_d_cu2 bigint; n_d_d2 bigint; n_d_ad bigint; n_d_self bigint;
    n_l_d bigint; n_l_cu bigint; n_l_cu2 bigint; n_cu_l bigint; n_cu_d bigint; n_cu_cu2 bigint; n_adm bigint;
    n_up bigint; n_down bigint; n_m_s bigint; ok boolean;
  BEGIN
    SELECT p.user_id INTO d FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO d2 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' AND p.user_id<>d ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO l FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO m1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.user_id<>l ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO s1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.user_id NOT IN (l,m1) ORDER BY p.user_id LIMIT 1;
    SELECT id INTO cu FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;
    SELECT id INTO cu2 FROM public.profiles WHERE role='customer' AND id<>cu ORDER BY id LIMIT 1;
    SELECT id INTO ad FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    -- Not enough customer/admin profiles in production: temporarily re-role spare dealer profiles inside this rolled-back test.
    IF cu IS NULL THEN SELECT p.user_id INTO cu FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d)) ORDER BY p.user_id LIMIT 1; IF cu IS NOT NULL THEN UPDATE public.profiles SET role='customer' WHERE id=cu; END IF; END IF;
    IF cu2 IS NULL THEN SELECT p.user_id INTO cu2 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d),COALESCE(cu,d)) ORDER BY p.user_id LIMIT 1; IF cu2 IS NOT NULL THEN UPDATE public.profiles SET role='customer' WHERE id=cu2; END IF; END IF;
    IF ad IS NULL THEN SELECT p.user_id INTO ad FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d),COALESCE(cu,d),COALESCE(cu2,d)) ORDER BY p.user_id LIMIT 1; IF ad IS NOT NULL THEN UPDATE public.profiles SET role='admin' WHERE id=ad; END IF; END IF;
    IF d IS NULL OR d2 IS NULL OR l IS NULL OR m1 IS NULL OR s1 IS NULL OR cu IS NULL OR cu2 IS NULL OR ad IS NULL THEN
      v_result:=v_result||E'
[SKIP] P6 | test data missing (need 2 dealers, 3 leaders, 2 customers, admin)';
    ELSE
      UPDATE public.partners SET master_id=NULL WHERE user_id IN (d,d2,l,m1,s1);
      UPDATE public.partners SET grade='S' WHERE user_id=s1;
      UPDATE public.partners SET grade='Master', master_id=s1 WHERE user_id=m1;
      UPDATE public.partners SET grade='Master' WHERE user_id=d2;
      UPDATE public.partners SET grade='C', master_id=d2 WHERE user_id=d;
      INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(cu,d,l,'requested','DRYRUN P6','기본형');
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d::text,true);
      SELECT count(*) INTO n_d_l FROM public.profiles WHERE id=l;
      SELECT count(*) INTO n_d_cu FROM public.profiles WHERE id=cu;
      SELECT count(*) INTO n_d_cu2 FROM public.profiles WHERE id=cu2;
      SELECT count(*) INTO n_d_d2 FROM public.profiles WHERE id=d2;
      SELECT count(*) INTO n_d_ad FROM public.profiles WHERE id=ad;
      SELECT count(*) INTO n_d_self FROM public.profiles WHERE id=d;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d2::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d2::text,true);
      SELECT count(*) INTO n_down FROM public.profiles WHERE id=d;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',l::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',l::text,true);
      SELECT count(*) INTO n_l_d FROM public.profiles WHERE id=d;
      SELECT count(*) INTO n_l_cu FROM public.profiles WHERE id=cu;
      SELECT count(*) INTO n_l_cu2 FROM public.profiles WHERE id=cu2;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',cu::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',cu::text,true);
      SELECT count(*) INTO n_cu_l FROM public.profiles WHERE id=l;
      SELECT count(*) INTO n_cu_d FROM public.profiles WHERE id=d;
      SELECT count(*) INTO n_cu_cu2 FROM public.profiles WHERE id=cu2;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',m1::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',m1::text,true);
      SELECT count(*) INTO n_m_s FROM public.profiles WHERE id=s1;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',s1::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',s1::text,true);
      SELECT count(*) INTO n_up FROM public.profiles WHERE id=m1;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      SELECT count(*) INTO n_adm FROM public.profiles WHERE id IN (d,l,cu,cu2,d2);
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      ok := n_d_l=0 AND n_d_cu=1 AND n_d_cu2=0 AND n_d_d2=1 AND n_d_ad=1 AND n_d_self=1 AND n_down=1
        AND n_l_d=0 AND n_l_cu=1 AND n_l_cu2=0 AND n_cu_l=1 AND n_cu_d=1 AND n_cu_cu2=0 AND n_m_s=0 AND n_up=1 AND n_adm=5;
      IF ok THEN v_result:=v_result||E'
[PASS] P6 relationship-based profile reads (dealer<->leader blocked, case customer visible, unrelated hidden, upline/downline, master cannot read S)';
      ELSE v_result:=v_result||format(E'
[FAIL] P6 d->l=%s d->cu=%s d->cu2=%s d->d2(master)=%s d->admin=%s d->self=%s master->down=%s l->d=%s l->cu=%s l->cu2=%s cu->l=%s cu->d=%s cu->cu2=%s master->S=%s S->master=%s admin sees=%s',n_d_l,n_d_cu,n_d_cu2,n_d_d2,n_d_ad,n_d_self,n_down,n_l_d,n_l_cu,n_l_cu2,n_cu_l,n_cu_d,n_cu_cu2,n_m_s,n_up,n_adm); END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P6: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P6 | apply prerequisite missing'; END IF;

-- P7: promotion request -> admin decision -> revert.
IF v_apply_18 AND v_apply_2 AND v_apply_3 AND v_apply_8 THEN
  DECLARE s uuid; tgt uuid; other uuid; ad uuid; req uuid; ok1 boolean:=false; ok_nons boolean:=false; ok_nodown boolean:=false; ok_dup boolean:=false; ok_apr boolean:=false; ok_hist boolean:=false; ok_rev boolean:=false; ok_decnon boolean:=false; g text; n_h bigint;
  BEGIN
    SELECT p.user_id INTO s FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='Master' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO tgt FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='C' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO other FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='C' AND p.user_id IS DISTINCT FROM tgt ORDER BY p.user_id LIMIT 1;
    SELECT id INTO ad FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    IF s IS NULL OR tgt IS NULL OR other IS NULL OR ad IS NULL THEN
      v_result:=v_result||E'
[SKIP] P7 | test data missing (S/target/other/admin)';
    ELSE
      UPDATE public.partners SET master_id=NULL WHERE user_id IN (s,tgt,other);
      UPDATE public.partners SET grade='S' WHERE user_id=s;
      UPDATE public.partners SET master_id=s WHERE user_id=tgt;
      -- S requests promotion of own downline C
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',s::text,true);
      BEGIN req := public.request_partner_promotion(tgt,'dryrun'); ok1 := req IS NOT NULL; EXCEPTION WHEN OTHERS THEN ok1:=false; END;
      BEGIN PERFORM public.request_partner_promotion(other,'not downline'); ok_nodown:=false; EXCEPTION WHEN OTHERS THEN ok_nodown:=true; END;
      BEGIN PERFORM public.request_partner_promotion(tgt,'dup'); ok_dup:=false; EXCEPTION WHEN OTHERS THEN ok_dup:=true; END;
      BEGIN PERFORM public.decide_partner_promotion(req,true,'self approve'); ok_decnon:=false; EXCEPTION WHEN OTHERS THEN ok_decnon:=true; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      -- non-S (the target) cannot request
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',tgt::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',tgt::text,true);
      BEGIN PERFORM public.request_partner_promotion(other,'by C'); ok_nons:=false; EXCEPTION WHEN OTHERS THEN ok_nons:=true; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      -- admin approves
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      BEGIN PERFORM public.decide_partner_promotion(req,true,'ok'); EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[INFO] P7 approve error: '||SQLERRM; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SELECT grade INTO g FROM public.partners WHERE user_id=tgt; ok_apr := (g='Master');
      SELECT count(*) INTO n_h FROM public.partner_grade_history WHERE partner_id=tgt AND to_grade='Master'; ok_hist := n_h>=1;
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      BEGIN PERFORM public.revert_partner_promotion(req,'undo'); EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[INFO] P7 revert error: '||SQLERRM; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SELECT grade INTO g FROM public.partners WHERE user_id=tgt; ok_rev := (g='C');
      IF ok1 AND ok_nodown AND ok_dup AND ok_decnon AND ok_nons AND ok_apr AND ok_hist AND ok_rev THEN
        v_result:=v_result||E'
[PASS] P7 request/approve/revert flow and permission denials';
      ELSE
        v_result:=v_result||format(E'
[FAIL] P7 request=%s notDownlineDenied=%s dupDenied=%s sSelfDecideDenied=%s nonSDenied=%s approved=%s history=%s reverted=%s',ok1,ok_nodown,ok_dup,ok_decnon,ok_nons,ok_apr,ok_hist,ok_rev);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P7: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P7 | apply prerequisite missing'; END IF;

-- P8: private (record-only) case with publicity consent is stored, creates no settlement, and default is false.
IF v_apply_19 AND v_apply_1 AND v_apply_16 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  DECLARE c uuid; cons boolean; dflt boolean; n_set bigint;
  BEGIN
    INSERT INTO public.funeral_cases(team_leader_id,status,location,is_private,publicity_consent) VALUES(v_leader,'in_progress','DRYRUN P8 consent',true,true) RETURNING id INTO c;
    SELECT publicity_consent INTO cons FROM public.funeral_cases WHERE id=c;
    SELECT count(*) INTO n_set FROM public.settlements WHERE case_id=c;
    INSERT INTO public.funeral_cases(team_leader_id,status,location,is_private) VALUES(v_leader,'in_progress','DRYRUN P8 default',true) RETURNING id INTO c;
    SELECT publicity_consent INTO dflt FROM public.funeral_cases WHERE id=c;
    IF cons=true AND dflt=false AND n_set=0 THEN v_result:=v_result||E'
[PASS] P8 consent saved=true default=false settlements=0';
    ELSE v_result:=v_result||E'
[FAIL] P8 consent='||coalesce(cons::text,'null')||' default='||coalesce(dflt::text,'null')||' settlements='||n_set; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[FAIL] P8: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P8 | prerequisite/data'; END IF;

-- P6 bypass check: sending a notification to an unrelated user must not make that user's profile readable.
IF v_apply_17 THEN
  DECLARE a uuid; v uuid; n_before bigint; n_after bigint;
  BEGIN
    SELECT p.user_id INTO a FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT pr.id INTO v FROM public.profiles pr WHERE pr.role='customer' AND NOT EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id=pr.id AND (fc.dealer_id=a OR fc.team_leader_id=a)) ORDER BY pr.id DESC LIMIT 1;
    IF a IS NULL OR v IS NULL THEN v_result:=v_result||E'
[SKIP] P6 notification bypass | data missing';
    ELSE
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',a::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',a::text,true);
      SELECT count(*) INTO n_before FROM public.profiles WHERE id=v;
      INSERT INTO public.notifications(user_id,sender_id,type,title,message) VALUES(v,a,'dryrun','dryrun','bypass attempt');
      SELECT count(*) INTO n_after FROM public.profiles WHERE id=v;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF n_after=0 THEN v_result:=v_result||E'
[PASS] P6 notification bypass blocked (before='||n_before||' after='||n_after||')';
      ELSE v_result:=v_result||E'
[FAIL] P6 notification bypass: sender can read recipient profile after sending (before='||n_before||' after='||n_after||')'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P6 notification bypass: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P6 notification bypass | apply prerequisite missing'; END IF;


v_result := E'[SUMMARY] PASS ' || regexp_count(v_result,E'\\[PASS\\]') || ' / FAIL ' || regexp_count(v_result,E'\\[FAIL\\]') || ' / SKIP ' || regexp_count(v_result,E'\\[SKIP\\]') || E'\n' || ltrim(v_result,E'\n');
RAISE EXCEPTION '%', 'DRYRUN_RESULT'||E'\n'||v_result;
END $dry$;

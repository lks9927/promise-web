-- P19 장례 접수 알림 중복 방지 (2026-11-10)
-- 문제: P13 의 create_private_case_leader_fee() 가 AFTER INSERT 안에서 funeral_cases 를 UPDATE(usage_fee) 한다.
--   그 UPDATE 가 funeral-case-alert 웹훅(UPDATE)을 한 번 더 발동시켜, 팀장 수수료가 0보다 커지면 알림이 중복될 수 있다.
-- 수정: usage_fee 는 BEFORE INSERT 트리거에서 NEW 값으로 채운다(UPDATE 없음). 정산 초안 INSERT 는 AFTER INSERT 에 남긴다.
--   수수료 0원(현재 운영 값)에서는 두 트리거 모두 아무 일도 하지 않으므로 동작이 동일하다.
-- 되돌리기: DROP TRIGGER IF EXISTS trg_private_case_usage_fee ON public.funeral_cases;
--           DROP FUNCTION IF EXISTS public.set_private_case_usage_fee();
--           그리고 P13 의 create_private_case_leader_fee() 본문(UPDATE 포함)을 다시 적용한다.

CREATE OR REPLACE FUNCTION public.set_private_case_usage_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fee integer := 0;
BEGIN
  IF NEW.team_leader_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(cp.team_leader_fee, 0)
    INTO v_fee
    FROM public.commission_policies cp
   WHERE cp.id = public.policy_id_for_package(NEW.package_name)
   LIMIT 1;
  IF COALESCE(v_fee, 0) > 0 THEN
    NEW.usage_fee := v_fee;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_private_case_usage_fee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_private_case_usage_fee ON public.funeral_cases;
CREATE TRIGGER trg_private_case_usage_fee
BEFORE INSERT ON public.funeral_cases
FOR EACH ROW
WHEN (NEW.is_private)
EXECUTE FUNCTION public.set_private_case_usage_fee();

CREATE OR REPLACE FUNCTION public.create_private_case_leader_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_fee integer := 0;
  v_base integer;
  v_tax integer;
BEGIN
  IF NEW.team_leader_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cp.team_leader_fee, 0)
    INTO v_fee
    FROM public.commission_policies cp
   WHERE cp.id = public.policy_id_for_package(NEW.package_name)
   LIMIT 1;

  IF COALESCE(v_fee, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_base := ROUND(v_fee / 1.1);
  v_tax := v_fee - v_base;
  -- funeral_cases 를 UPDATE 하지 않는다(알림 웹훅 재발동 방지). usage_fee 는 BEFORE INSERT 트리거가 채운다.
  INSERT INTO public.settlements
    (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
  VALUES
    (NEW.id, NEW.team_leader_id, v_fee, 'usage_fee_remittance', 'draft', 'vat_10', v_base, v_tax, v_fee)
  ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
  RETURN NEW;
END;
$function$;

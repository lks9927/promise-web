-- P13 정산 5줄 모델 (2026-11-09)
-- 목적: 패키지별 팀장 기록용 수수료를 추가하고, is_private 사건의 팀장→본사 사용료 초안만 만든다.
-- 되돌리기: DROP TRIGGER IF EXISTS trg_private_case_leader_fee ON public.funeral_cases;
--           DROP FUNCTION IF EXISTS public.create_private_case_leader_fee();
--           ALTER TABLE public.commission_policies DROP COLUMN IF EXISTS team_leader_fee;
-- calculate_settlements는 P10 본문을 유지한다. 일반 사건의 딜러/마스터/쿠폰 계산은 변경하지 않는다.

ALTER TABLE public.commission_policies
  ADD COLUMN IF NOT EXISTS team_leader_fee integer NOT NULL DEFAULT 0;

ALTER TABLE public.commission_policies
  DROP CONSTRAINT IF EXISTS commission_policies_team_leader_fee_nonnegative,
  ADD CONSTRAINT commission_policies_team_leader_fee_nonnegative
    CHECK (team_leader_fee >= 0);

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
  UPDATE public.funeral_cases SET usage_fee = v_fee WHERE id = NEW.id;
  INSERT INTO public.settlements
    (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
  VALUES
    (NEW.id, NEW.team_leader_id, v_fee, 'usage_fee_remittance', 'draft', 'vat_10', v_base, v_tax, v_fee)
  ON CONFLICT ON CONSTRAINT unique_settlement_per_case DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_private_case_leader_fee ON public.funeral_cases;
CREATE TRIGGER trg_private_case_leader_fee
AFTER INSERT ON public.funeral_cases
FOR EACH ROW
WHEN (NEW.is_private)
EXECUTE FUNCTION public.create_private_case_leader_fee();

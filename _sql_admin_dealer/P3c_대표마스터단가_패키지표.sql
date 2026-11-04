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

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

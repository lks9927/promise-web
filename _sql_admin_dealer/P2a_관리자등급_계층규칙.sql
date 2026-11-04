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

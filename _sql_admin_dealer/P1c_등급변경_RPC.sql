-- p1c: 관리자만 실행 가능한 원자적 승격/강등 RPC. 등급은 C/Master만 허용한다.
CREATE TABLE IF NOT EXISTS public.partner_grade_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.profiles(id),
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

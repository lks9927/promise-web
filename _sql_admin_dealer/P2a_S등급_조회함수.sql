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

BEGIN;
WITH expected(parent_grade, child_grade) AS (VALUES ('S'::text,'Master'::text),('S'::text,'C'::text),('Master'::text,'C'::text)), actual AS (SELECT parent_grade, child_grade FROM public.partner_hierarchy_rules)
SELECT 'missing' AS issue, parent_grade, child_grade FROM expected EXCEPT SELECT 'missing', parent_grade, child_grade FROM actual
UNION ALL SELECT 'unexpected', parent_grade, child_grade FROM actual EXCEPT SELECT 'unexpected', parent_grade, child_grade FROM expected;
SELECT user_id, grade, master_id FROM public.partners WHERE grade IS NULL OR grade NOT IN ('C','Master','S');
SELECT p.user_id, pr.role, p.grade, p.master_id, parent.grade AS parent_grade, parent_pr.role AS parent_role FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id LEFT JOIN public.partners parent ON parent.user_id=p.master_id LEFT JOIN public.profiles parent_pr ON parent_pr.id=parent.user_id WHERE p.master_id IS NOT NULL AND (pr.role <> parent_pr.role OR NOT EXISTS (SELECT 1 FROM public.partner_hierarchy_rules r WHERE r.parent_grade=parent.grade AND r.child_grade=p.grade));
ROLLBACK;

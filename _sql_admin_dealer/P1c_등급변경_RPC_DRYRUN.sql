BEGIN;
SELECT user_id, grade, master_id, max_subordinates FROM public.partners ORDER BY created_at;
SELECT * FROM public.partner_grade_history
WHERE reason = '상위 마스터 강등으로 독립'
ORDER BY processed_at DESC;
ROLLBACK;

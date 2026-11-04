BEGIN;
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'max_subordinates';
SELECT user_id, master_id, max_subordinates FROM public.partners ORDER BY created_at;
-- 적용 SQL을 이 위치에 붙여 넣어 트리거/제약 생성 결과를 확인한다.
ROLLBACK;

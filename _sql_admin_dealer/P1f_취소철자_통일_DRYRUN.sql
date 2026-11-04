BEGIN;
SELECT count(*) AS canceled_rows_to_normalize
FROM public.funeral_cases
WHERE status = 'canceled';
SELECT status, count(*) FROM public.funeral_cases GROUP BY status ORDER BY status;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.funeral_cases'::regclass AND contype='c';
ROLLBACK;

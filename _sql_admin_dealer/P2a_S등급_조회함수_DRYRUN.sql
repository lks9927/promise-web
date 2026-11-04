BEGIN;
SELECT routine_name, security_type FROM information_schema.routines WHERE routine_schema='public' AND routine_name='s_downline_overview';
SELECT * FROM public.s_downline_overview() LIMIT 20;
ROLLBACK;

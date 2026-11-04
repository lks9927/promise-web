BEGIN;
SELECT id, role, has_business FROM public.profiles ORDER BY created_at;
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
SELECT pg_get_functiondef('public.prevent_self_has_business_change()'::regprocedure);
ROLLBACK;

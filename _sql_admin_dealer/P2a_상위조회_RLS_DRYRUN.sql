BEGIN;
SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('partners','profiles') ORDER BY tablename, policyname;
SELECT public.has_s_parent() AS caller_has_s_parent;
SELECT p.user_id, p.grade FROM public.partners p WHERE public.is_my_master(p.user_id) AND p.grade='S';
ROLLBACK;

BEGIN;
-- profiles는 다른 기능도 쓰므로 이 단계에서는 정책 변경 없이 현재 노출 정책을 점검만 한다.
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
ROLLBACK;

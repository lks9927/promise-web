-- DB 기준 철자는 cancelled. 운영 상태 제약을 재생성해 canceled 유입을 차단한다.
UPDATE public.funeral_cases SET status = 'cancelled' WHERE status = 'canceled';
ALTER TABLE public.funeral_cases DROP CONSTRAINT IF EXISTS funeral_cases_status_check;
ALTER TABLE public.funeral_cases ADD CONSTRAINT funeral_cases_status_check CHECK
  (status IN ('requested','assigned','consulting','in_progress','team_settling','settling','hq_check','completed','cancelled')) NOT VALID;
ALTER TABLE public.funeral_cases VALIDATE CONSTRAINT funeral_cases_status_check;

-- ============================================================================
-- 01_prerequisites.sql  (DRAFT - 운영 DB에 적용 전 반드시 검토)
-- RLS를 켜기 "전에" 먼저 적용해야 하는 준비 작업. 이것만 적용해도 동작은 바뀌지 않는다.
-- 근거(2026-10-20 운영 DB 확인):
--   * calculate_settlements() 는 SECURITY INVOKER 인 트리거 함수이고,
--     funeral_cases.status 가 in_progress 로 바뀔 때 settlements 에 INSERT 한다.
--     settlements 에 RLS 를 켜면 "상태를 바꾼 팀장" 권한으로 실행되어 막힌다.
--   * 나머지 함수/트리거는 이미 SECURITY DEFINER 라서 RLS 영향을 받지 않는다.
-- ============================================================================

-- 1) 관리자 판별 도우미.
--    정책에서는 반드시 (select public.is_admin()) 형태로 감싸 쿼리당 1회만 평가되게 쓴다.
--    anon 에게도 EXECUTE 를 주는 이유: 정책식 안에서 호출되므로 권한이 없으면
--    anon 요청이 "permission denied for function" 으로 실패한다 (결과는 항상 false).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 정책은 모두 authenticated 에게만 적용되므로 anon 의 실행 권한은 주지 않는다.
-- (장례 등록 함수는 DEFINER 라서 내부에서 호출해도 anon 권한이 필요 없다.
--  2단계에서 anon 정책이 이 함수를 써야 하면 그때 그 정책에 맞춰 부여한다.)
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 1-2) 장례 건의 "관리 권한" 판별: 담당 팀장 본인, 또는 그 팀장의 상위 master.
--      DEFINER 로 만들어 funeral_cases/partners 의 RLS(2단계에서 켬)와 무관하게 동작하고,
--      정책끼리 서로를 참조해 생기는 재귀 오류를 피한다.
create or replace function public.is_case_manager(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.funeral_cases c
      left join public.partners pt on pt.user_id = c.team_leader_id
     where c.id = p_case
       and c.team_leader_id is not null
       and (c.team_leader_id = auth.uid() or pt.master_id = auth.uid())
  );
$$;

revoke all on function public.is_case_manager(uuid) from public, anon;
grant execute on function public.is_case_manager(uuid) to authenticated;

-- 2) 정산 계산 트리거 함수를 SECURITY DEFINER 로 전환.
--    (함수 본문은 그대로, 실행 권한만 소유자로 바뀐다. 소유자는 RLS 를 우회한다.)
--    되돌리기: 98_rollback_function_changes.sql
alter function public.calculate_settlements() security definer;
alter function public.calculate_settlements() set search_path = public, pg_temp;

-- 확인용 (적용 후 실행): calculate_settlements 가 DEFINER 인지 보기
-- select proname, prosecdef from pg_proc
-- where pronamespace = 'public'::regnamespace and proname in ('calculate_settlements','is_admin');

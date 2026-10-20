-- ============================================================================
-- STAGE1_apply_before_deploy.sql  (자동 조립 파일 - 원본은 01, 05, 07)
-- 새 코드를 "배포하기 전에" 적용한다. 기존 화면 동작은 바뀌지 않는다:
--   - 01: 도우미 함수 추가, 정산 계산 트리거 함수의 실행 권한 전환(본문 동일)
--   - 05: 수수료 정책을 관리자만 수정(공개 키로 누구나 수정하던 구멍 닫기)
--   - 07: 쿠폰 조회 함수 추가(새 코드가 사용)
-- SQL Editor 에 파일 전체를 붙여넣고 Run. 오류가 나면 멈추고 오류 문구를 알려주세요.
-- ============================================================================

-- ################ 01_prerequisites.sql ################
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

-- ################ 05_close_commission_policies.sql ################
-- ============================================================================
-- 05_close_commission_policies.sql  (DRAFT - 다른 파일과 독립적으로 적용 가능)
-- 문제(운영 DB 확인, 2026-10-20): commission_policies 는 RLS 가 이미 켜져 있지만 정책이
--   - "Allow update access to all users"  UPDATE USING true   -> 공개 키만 있으면 누구나 수수료 정책 수정
--   - "Allow read access to all users"    SELECT USING true   -> 로그인 없이 누구나 요율 조회
--   - admin_full_access_commission_policies  ALL (관리자)      -> 이건 정상
-- 정산 금액(calculate_settlements)이 이 테이블 값에서 계산되므로 수정 가능 = 금액 조작 가능.
-- 코드 조사: 이 테이블은 관리자(CommissionSettings.jsx)가 읽고 쓰고, 팀장(MyWallet.jsx)이
-- 로그인 상태로 요율을 "읽기만" 한다. 로그인 없는 접근은 없다. 트리거(DEFINER)와 서버는 RLS 우회.
-- 결과: 수정은 관리자만, 읽기는 로그인한 사용자만.
-- 되돌리기: 이 파일 맨 아래 주석 참조.
-- ============================================================================
begin;

drop policy if exists "Allow update access to all users" on public.commission_policies;
drop policy if exists "Allow read access to all users"   on public.commission_policies;

-- 읽기: 로그인한 사용자(팀장 지갑이 요율을 표시). 관리자는 기존 ALL 정책이 이미 허용.
drop policy if exists commission_policies_select_authenticated on public.commission_policies;
create policy commission_policies_select_authenticated on public.commission_policies
  for select to authenticated
  using (true);

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용)
--  select policyname, cmd, roles from pg_policies
--   where schemaname='public' and tablename='commission_policies';
--  -> admin_full_access_commission_policies (ALL) 와 commission_policies_select_authenticated (SELECT) 만 남아야 한다.
-- 화면 확인: 관리자 로그인 -> 수수료 설정을 열고 값 저장이 된다 / 팀장 로그인 -> 내 지갑이 열린다.
--
-- 되돌리기 (원래 상태로):
--  begin;
--  drop policy if exists commission_policies_select_authenticated on public.commission_policies;
--  create policy "Allow read access to all users"   on public.commission_policies for select using (true);
--  create policy "Allow update access to all users" on public.commission_policies for update using (true);
--  commit;
-- ============================================================================

-- ################ 07_coupon_public_rpc.sql ################
-- ============================================================================
-- 07_coupon_public_rpc.sql  (DRAFT)
-- 목적: 로그인 없는 화면이 coupons 테이블을 select('*') 로 직접 읽던 것을
--       "쿠폰 코드를 알아야만 조회되고, 필요한 4개 필드만 돌려주는 함수"로 바꾼다.
--       (이 함수가 적용되고 화면 코드가 바뀐 뒤에야 coupons 에 RLS 를 켤 수 있다)
-- 쓰는 화면: CouponLanding.jsx(쿠폰 링크), Home.jsx(접수 전 쿠폰 확인)
-- 화면이 쓰는 필드(코드로 확인): amount, status('used' 여부), recipient_name, recipient_phone
--
-- !! 적용 순서 !!  이 SQL 을 "먼저" 적용한 뒤에 새 화면 코드를 배포한다.
--    (코드를 먼저 배포하면 쿠폰 링크 화면이 함수를 못 찾아 "유효하지 않은 쿠폰"으로 보인다.)
--    이 SQL 은 새 함수를 추가할 뿐이라 기존 화면 동작에는 영향이 없다.
-- ============================================================================
create or replace function public.get_coupon_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'amount',          c.amount,
           'status',          c.status,
           'recipient_name',  c.recipient_name,
           'recipient_phone', c.recipient_phone
         )
    from public.coupons c
   where c.code = upper(btrim(coalesce(p_code, '')))
   limit 1;
$$;

revoke all on function public.get_coupon_public(text) from public;
grant execute on function public.get_coupon_public(text) to anon, authenticated;

-- 확인 (읽기 전용, 테스트 코드로):
--   select public.get_coupon_public('존재하지않는코드');   -- null
--   select public.get_coupon_public('<발행된 쿠폰 코드>');  -- {"amount":..., "status":"issued", ...}
-- 되돌리기:
--   drop function if exists public.get_coupon_public(text);

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

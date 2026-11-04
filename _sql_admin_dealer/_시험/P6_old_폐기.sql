-- P6 딜러 <-> 팀장 개인정보 상호 조회 DB 차단 (p1h 완성, 2026-11-04)
-- 현재 운영: profiles_select 정책이 USING(true) 라 로그인한 누구나 모든 프로필의 이름·전화·이메일 등을 읽을 수 있다.
-- 이 파일은 'RESTRICTIVE 정책' 하나를 추가해, 딜러가 팀장 프로필을, 팀장이 딜러 프로필을 읽는 것만 막는다.
--  - 본인 행, 관리자는 항상 허용. 그 밖의 조회(고객·업체·같은 역할끼리 등)는 기존 정책 그대로다(범위를 좁게 시작).
--  - RESTRICTIVE 는 기존 PERMISSIVE 정책(profiles_select)과 AND 로 결합된다. 되돌리기: DROP POLICY profiles_no_dealer_leader_cross ON public.profiles;
-- 주의: 접수 딜러 이름 등을 팀장 화면에 보이던 곳이 있으면 빈 값으로 보인다(직거래 방지가 목적이므로 의도된 동작).
DROP POLICY IF EXISTS profiles_no_dealer_leader_cross ON public.profiles;
CREATE POLICY profiles_no_dealer_leader_cross ON public.profiles
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_admin())
    OR id = (SELECT auth.uid())
    OR NOT (
      ((SELECT public.my_role()) = 'dealer' AND role = 'leader')
      OR ((SELECT public.my_role()) = 'leader' AND role = 'dealer')
    )
  );

-- P6 profiles 조회를 '본인·관리자·관계 있는 상대'로 제한 (딜러<->팀장 상호 차단 포함; 이전 P6 RESTRICTIVE 안을 대체)
-- 현재 운영: profiles_select USING(true) -> 로그인한 누구나 전체 사용자의 이름·전화·이메일·푸시 토큰 등을 읽을 수 있다.
-- 변경: 한 함수 can_read_profile(대상)에서 규칙을 정하고 정책은 그 함수만 호출한다(규칙 변경은 함수 한 곳).
-- 허용 규칙(위에서부터 먼저 맞으면 허용; 2번은 최우선 거부):
--   본인 / 관리자 / [거부] 딜러<->팀장 상호 / 내 직속 상위(단, 마스터는 위 S 의 정보를 못 봄) / 내 직속 하위 /
--   내 사건의 담당 팀장·접수 딜러(고객 입장) / 내 사건의 고객(팀장·딜러·쿠폰 발행 딜러·상위 마스터 입장) /
--   출동 대기(requested) 사건의 고객(팀장; 현행 유지, 별도 정책 결정 대기) / 내게 알림·쪽지를 보낸 발신자(보낸 쪽 수신자는 제외) /
--   주문으로 연결된 팀장<->업체 / 관리자 프로필(문의·쪽지용)
-- 되돌리기: DROP POLICY profiles_select ON public.profiles; CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true); DROP FUNCTION public.can_read_profile(uuid);
-- 주의: fcm_token·email 등 컬럼 단위 제한은 이 파일 범위 밖(관계가 있는 상대에게는 같은 행의 컬럼이 보임).
CREATE OR REPLACE FUNCTION public.can_read_profile(p_target uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  my_role text; my_grade text; t_role text; t_grade text;
BEGIN
  IF me IS NULL OR p_target IS NULL THEN RETURN false; END IF;
  IF p_target = me THEN RETURN true; END IF;
  SELECT role INTO my_role FROM public.profiles WHERE id = me;
  IF my_role = 'admin' THEN RETURN true; END IF;
  SELECT role INTO t_role FROM public.profiles WHERE id = p_target;
  IF t_role IS NULL THEN RETURN false; END IF;
  -- 직거래 방지: 딜러와 팀장은 서로의 프로필을 읽지 못한다(사건을 같이 다뤄도 마찬가지).
  IF (my_role = 'dealer' AND t_role = 'leader') OR (my_role = 'leader' AND t_role = 'dealer') THEN RETURN false; END IF;
  SELECT grade INTO my_grade FROM public.partners WHERE user_id = me;
  SELECT grade INTO t_grade FROM public.partners WHERE user_id = p_target;
  -- 직속 상위: 마스터는 위의 대표마스터(S) 정보를 볼 수 없다.
  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = me AND master_id = p_target) THEN
    IF NOT (COALESCE(t_grade, '') = 'S' AND COALESCE(my_grade, '') = 'Master') THEN RETURN true; END IF;
  END IF;
  -- 직속 하위
  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = p_target AND master_id = me) THEN RETURN true; END IF;
  -- 고객 입장: 내 사건의 담당 팀장·접수 딜러
  IF EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id = me AND (fc.team_leader_id = p_target OR fc.dealer_id = p_target)) THEN RETURN true; END IF;
  -- 파트너 입장: 내 사건(또는 하위가 맡은 사건)의 고객
  IF EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.customer_id = p_target
      AND (fc.team_leader_id = me OR fc.dealer_id = me OR fc.current_bidder_id = me
           OR fc.coupon_code IN (SELECT c.code FROM public.coupons c WHERE c.issued_by = me)
           OR public.is_my_report(fc.dealer_id) OR public.is_my_report(fc.team_leader_id))
  ) THEN RETURN true; END IF;
  -- 출동 대기 사건의 고객(팀장에게만; 현행 동작 유지)
  IF my_role = 'leader' AND EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id = p_target AND fc.status = 'requested') THEN RETURN true; END IF;
  -- 알림·쪽지 상대
  -- (내가 받은 알림의 발신자만. 내가 보낸 알림의 수신자는 허용하지 않는다: 알림은 아무에게나 보낼 수 있어 우회로가 된다.)
  IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = me AND n.sender_id = p_target) THEN RETURN true; END IF;
  -- 주문으로 연결된 팀장 <-> 업체
  IF EXISTS (SELECT 1 FROM public.orders o JOIN public.vendors v ON v.id = o.vendor_id
             WHERE (o.team_leader_id = me AND v.user_id = p_target) OR (v.user_id = me AND o.team_leader_id = p_target)) THEN RETURN true; END IF;
  -- 관리자 프로필(문의·쪽지 대상)
  IF t_role = 'admin' THEN RETURN true; END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_no_dealer_leader_cross ON public.profiles;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (public.can_read_profile(id));

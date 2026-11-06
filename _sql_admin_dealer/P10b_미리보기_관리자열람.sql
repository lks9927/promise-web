-- P10b 관리자 '화면 미리보기'(딜러 임퍼소네이트)에서도 명함 QR·안심 혜택 명단이 보이게 한다 (2026-11-06)
-- 관리자가 p_dealer 를 넘기면 그 딜러의 것을, 그 외에는 호출자 본인의 것을 돌려준다(관리자가 아닌 사용자가 다른 id 를 넘겨도 본인 것으로 취급).
-- 되돌리기: 인자 없는 원래 함수(P10_예비상주.sql)로 CREATE OR REPLACE 후 이 파일의 p_dealer 버전을 DROP.
DROP FUNCTION IF EXISTS public.get_my_card_coupon();
DROP FUNCTION IF EXISTS public.get_my_pre_registrations();

CREATE OR REPLACE FUNCTION public.get_my_card_coupon(p_dealer uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_target uuid := auth.uid();
BEGIN
  IF p_dealer IS NOT NULL AND (SELECT public.is_admin()) THEN v_target := p_dealer; END IF;
  RETURN public.ensure_dealer_card_coupon(v_target);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_card_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_card_coupon(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_pre_registrations(p_dealer uuid DEFAULT NULL)
RETURNS TABLE(id uuid, masked_name text, relationship text, status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_target uuid := auth.uid();
BEGIN
  IF p_dealer IS NOT NULL AND (SELECT public.is_admin()) THEN v_target := p_dealer; END IF;
  RETURN QUERY
  SELECT pr.id,
         CASE WHEN char_length(pr.name) = 2 THEN left(pr.name, 1) || '*'
              WHEN char_length(pr.name) >= 3 THEN left(pr.name, 1) || '*' || right(pr.name, 1)
              ELSE '*' END,
         pr.relationship, pr.status, pr.created_at
    FROM public.pre_registrations pr
   WHERE pr.dealer_id = v_target
     AND EXISTS (SELECT 1 FROM public.profiles pf JOIN public.partners pa ON pa.user_id = pf.id
                  WHERE pf.id = v_target AND pf.role = 'dealer' AND pa.status = 'approved')
   ORDER BY pr.created_at DESC
   LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_pre_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_pre_registrations(uuid) TO authenticated;

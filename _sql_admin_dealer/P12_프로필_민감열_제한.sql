-- 목적: profiles의 행 RLS(P6)는 유지하면서, 관계가 있는 상대에게도 민감 열이 노출되지 않게 한다.
-- 되돌리기: 아래 두 RPC를 DROP하고, REVOKE했던 테이블 SELECT를 복구한 뒤 공개/민감 열 전체를
-- authenticated에 GRANT 한다. 예: GRANT SELECT ON public.profiles TO authenticated;
-- (anon에는 profiles SELECT를 부여하지 않는다. 현재 P6도 authenticated 행 정책이다.)

REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, name, phone, role, avatar_url, introduction, experience_years,
  certificate_url, gallery_urls, business_license_url, has_business, created_at
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  id uuid, email text, admin_level text, password_reset_requested boolean,
  os_type text, fcm_token text, agreed_terms boolean, agreed_privacy boolean,
  agreed_marketing boolean, agreed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.admin_level, p.password_reset_requested,
         p.os_type, p.fcm_token, p.agreed_terms, p.agreed_privacy,
         p.agreed_marketing, p.agreed_at
    FROM public.profiles p
   WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.admin_get_profile_private(p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid, email text, admin_level text, password_reset_requested boolean,
  os_type text, fcm_token text, agreed_terms boolean, agreed_privacy boolean,
  agreed_marketing boolean, agreed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.email, p.admin_level, p.password_reset_requested,
         p.os_type, p.fcm_token, p.agreed_terms, p.agreed_privacy,
         p.agreed_marketing, p.agreed_at
    FROM public.profiles p
   WHERE public.is_admin()
     AND (p_ids IS NULL OR p.id = ANY(p_ids));
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_profile_private(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_private(uuid[]) TO authenticated;

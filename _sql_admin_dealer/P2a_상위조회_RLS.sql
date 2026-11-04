CREATE OR REPLACE FUNCTION public.has_s_parent()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.partners mine JOIN public.partners parent ON parent.user_id=mine.master_id WHERE mine.user_id=auth.uid() AND parent.grade='S')
$$;
DROP POLICY IF EXISTS partners_select ON public.partners;
CREATE POLICY partners_select ON public.partners FOR SELECT TO authenticated USING (
  public.is_admin() OR user_id=auth.uid() OR master_id=auth.uid() OR (public.is_my_master(user_id) AND NOT (grade='S' AND user_id<>auth.uid()))
);
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  public.is_admin() OR id=auth.uid() OR NOT EXISTS (SELECT 1 FROM public.partners mine JOIN public.partners parent ON parent.user_id=mine.master_id WHERE mine.user_id=auth.uid() AND parent.user_id=profiles.id AND parent.grade='S')
);
REVOKE ALL ON FUNCTION public.has_s_parent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_s_parent() TO authenticated;

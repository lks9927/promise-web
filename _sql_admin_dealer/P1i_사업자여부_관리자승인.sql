CREATE OR REPLACE FUNCTION public.prevent_self_has_business_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.has_business IS DISTINCT FROM OLD.has_business
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION '사업자 여부는 관리자 확인 후 변경됩니다.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prevent_self_has_business_change ON public.profiles;
CREATE TRIGGER prevent_self_has_business_change BEFORE UPDATE OF has_business ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_has_business_change();

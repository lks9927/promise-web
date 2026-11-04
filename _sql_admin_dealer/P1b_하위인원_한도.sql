-- p1b: NULL은 무제한, 0 이상만 허용한다.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS max_subordinates integer;
ALTER TABLE public.partners
  ALTER COLUMN max_subordinates DROP DEFAULT,
  ALTER COLUMN max_subordinates SET DEFAULT NULL;
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_max_subordinates_nonnegative;
ALTER TABLE public.partners ADD CONSTRAINT partners_max_subordinates_nonnegative
  CHECK (max_subordinates IS NULL OR max_subordinates >= 0);

-- 팀장과 마스터 딜러가 하위 파트너를 새로 붙일 때 모두 적용한다.
CREATE OR REPLACE FUNCTION public.enforce_partner_subordinate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.master_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.master_id IS NOT DISTINCT FROM OLD.master_id) THEN
    RETURN NEW;
  END IF;
  SELECT max_subordinates INTO v_limit FROM partners WHERE user_id = NEW.master_id FOR UPDATE;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM partners WHERE master_id = NEW.master_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION '하위 인원 한도(%명)를 초과했습니다.', v_limit USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_partner_subordinate_limit ON public.partners;
CREATE TRIGGER enforce_partner_subordinate_limit BEFORE INSERT OR UPDATE OF master_id ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_subordinate_limit();

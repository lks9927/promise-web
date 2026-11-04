CREATE OR REPLACE FUNCTION public.cancel_unpaid_settlements_for_cancelled_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE settlements SET status = 'cancelled'
    -- 결제 대기 건은 회수하고, 이미 지급 완료된 paid 정산은 회계 이력으로 유지한다.
    WHERE case_id = NEW.id AND status IN ('draft', 'pending', 'awaiting_payment');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cancel_unpaid_settlements_for_cancelled_case ON public.funeral_cases;
CREATE TRIGGER cancel_unpaid_settlements_for_cancelled_case AFTER UPDATE OF status ON public.funeral_cases
FOR EACH ROW EXECUTE FUNCTION public.cancel_unpaid_settlements_for_cancelled_case();

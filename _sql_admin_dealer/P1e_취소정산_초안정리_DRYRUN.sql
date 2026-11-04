BEGIN;
SELECT fc.id, fc.status, s.id AS settlement_id, s.status AS settlement_status
FROM public.funeral_cases fc LEFT JOIN public.settlements s ON s.case_id = fc.id
WHERE fc.status = 'cancelled' AND s.status IN ('draft', 'pending', 'awaiting_payment', 'paid');
ROLLBACK;

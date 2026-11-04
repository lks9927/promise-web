BEGIN;
SELECT count(*) AS source_count FROM public.partners WHERE NULLIF(trim(bank_account), '') IS NOT NULL;
SELECT * FROM public.partner_bank_accounts;
ROLLBACK;

BEGIN;
SELECT p.user_id, p.bank_account AS legacy_value, b.bank_account AS migrated_value
FROM public.partners p LEFT JOIN public.partner_bank_accounts b ON b.partner_id = p.user_id
WHERE NULLIF(trim(p.bank_account), '') IS NOT NULL;
ROLLBACK;

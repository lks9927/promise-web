CREATE TABLE IF NOT EXISTS public.partner_bank_accounts (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(user_id) ON DELETE CASCADE,
  bank_code text, bank_account text, bank_holder text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_bank_accounts_owner_or_admin ON public.partner_bank_accounts;
CREATE POLICY partner_bank_accounts_owner_or_admin ON public.partner_bank_accounts FOR ALL
USING (partner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (partner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
-- 기존 복합 문자열은 기존 표현을 보존하여 bank_account로 이관한다.
INSERT INTO public.partner_bank_accounts(partner_id, bank_account)
SELECT user_id, bank_account FROM public.partners WHERE NULLIF(trim(bank_account), '') IS NOT NULL
ON CONFLICT (partner_id) DO UPDATE SET bank_account = EXCLUDED.bank_account, updated_at = now();

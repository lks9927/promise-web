-- Enable bulk issuance by making issued_to optional
alter table public.coupons alter column issued_to drop not null;

-- Add a comment/description field for batches (optional but good for 'Shopping Mall Promo')
alter table public.coupons add column batch_name text;

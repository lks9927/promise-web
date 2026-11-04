-- 반드시 P1d_계좌_비공개테이블_생성_이관.sql 적용 및 대조 후 마지막에만 실행한다.
ALTER TABLE public.partners DROP COLUMN IF EXISTS bank_account;

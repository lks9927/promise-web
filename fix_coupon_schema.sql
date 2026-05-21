-- 1. 쿠폰 받는 사람을 '익명(NULL)' 허용으로 변경 (필수값 제한 해제)
alter table public.coupons alter column issued_to drop not null;

-- 2. batch_name 컬럼이 없을 때만 추가 (있으면 무시)
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'coupons' and column_name = 'batch_name') then
        alter table public.coupons add column batch_name text;
    end if;
end $$;

-- 1. 쿠폰 받기 익명(NULL) 허용 (확실한 재적용)
alter table public.coupons alter column issued_to drop not null;

-- 2. batch_name 컬럼 안전하게 추가 (확실한 재적용)
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'coupons' and column_name = 'batch_name') then
        alter table public.coupons add column batch_name text;
    end if;
end $$;

-- 3. [핵심] 권한 문제 해결!
-- 기존에 'admin'만 허용하던 정책을 삭제하고, 'super' 관리자도 포함하도록 수정합니다.
drop policy if exists "Admins can insert coupons" on public.coupons;

create policy "Admins and Super users can insert coupons"
  on public.coupons for insert
  with check (
    auth.uid() in (
      select id from public.profiles 
      where role in ('admin', 'super', 'manager')
    )
  );

-- 4. 조회 권한도 마찬가지로 확장
drop policy if exists "Admins can view all coupons" on public.coupons;

create policy "Admins and Super users can view all coupons"
  on public.coupons for select
  using (
    auth.uid() in (
      select id from public.profiles 
      where role in ('admin', 'super', 'manager')
    )
  );

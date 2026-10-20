-- ============================================================================
-- 14b_profile_private_lockdown.sql  (DRAFT - 새 코드 배포 "후", 14a 적용 완료 상태에서)
-- 새 코드(profile_private 를 읽고 쓰는 화면)가 배포된 뒤에 적용한다. 배포 전에 적용하면 예전 화면이 오류가 난다.
--
-- 하는 일:
--   (1) 배포 사이에 예전 코드가 profiles 에 저장한 값을 profile_private 로 한 번 더 채운다(비어 있는 칸만).
--   (2) 로그인한 사용자가 profiles 의 12개 열을 읽거나 쓰지 못하게 열 권한을 회수한다.
--       (service_role 과 DB 함수는 영향 없음. 데이터는 지우지 않는다 - 안정되면 별도로 열을 삭제)
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

insert into public.profile_private (id, address, address_detail, bank_code, bank_account, bank_holder,
                                    business_number, business_name, ceo_name, business_type, business_item,
                                    tax_email, business_address)
select p.id, p.address, p.address_detail, p.bank_code, p.bank_account, p.bank_holder,
       p.business_number, p.business_name, p.ceo_name, p.business_type, p.business_item,
       p.tax_email, p.business_address
  from public.profiles p
 where coalesce(p.address, p.address_detail, p.bank_code, p.bank_account, p.bank_holder, p.business_number,
                p.business_name, p.ceo_name, p.business_type, p.business_item, p.tax_email, p.business_address) is not null
on conflict (id) do update set
  address          = coalesce(public.profile_private.address,          excluded.address),
  address_detail   = coalesce(public.profile_private.address_detail,   excluded.address_detail),
  bank_code        = coalesce(public.profile_private.bank_code,        excluded.bank_code),
  bank_account     = coalesce(public.profile_private.bank_account,     excluded.bank_account),
  bank_holder      = coalesce(public.profile_private.bank_holder,      excluded.bank_holder),
  business_number  = coalesce(public.profile_private.business_number,  excluded.business_number),
  business_name    = coalesce(public.profile_private.business_name,    excluded.business_name),
  ceo_name         = coalesce(public.profile_private.ceo_name,         excluded.ceo_name),
  business_type    = coalesce(public.profile_private.business_type,    excluded.business_type),
  business_item    = coalesce(public.profile_private.business_item,    excluded.business_item),
  tax_email        = coalesce(public.profile_private.tax_email,        excluded.tax_email),
  business_address = coalesce(public.profile_private.business_address, excluded.business_address);

revoke select (address, address_detail, bank_code, bank_account, bank_holder, business_number, business_name,
               ceo_name, business_type, business_item, tax_email, business_address)
  on public.profiles from public, anon, authenticated;
-- INSERT/UPDATE 는 테이블 전체 권한이 걸려 있어서 열 단위 회수가 듣지 않는다.
-- 테이블 권한을 회수하고, 12개를 뺀 나머지 열에만 다시 부여한다.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name <> all (array['address', 'address_detail', 'bank_code', 'bank_account', 'bank_holder',
                                   'business_number', 'business_name', 'ceo_name', 'business_type',
                                   'business_item', 'tax_email', 'business_address']);
  execute 'revoke insert, update on public.profiles from public, anon, authenticated';
  execute format('grant insert (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;

commit;

-- ============================================================================
-- 적용 후 확인: 로그인한 사용자가 profiles.address 를 읽으면 거부, profile_private 는 본인 것만 보여야 한다.
--   (select * 를 쓰는 코드는 이제 오류가 난다 - src/lib/profileColumns.js 의 열 목록을 쓴다)
--
-- 되돌리기 (열 권한만 복구, 데이터는 그대로):
--   begin;
--   grant select (address, address_detail, bank_code, bank_account, bank_holder, business_number, business_name,
--                 ceo_name, business_type, business_item, tax_email, business_address) on public.profiles to authenticated;
--   grant insert, update on public.profiles to authenticated;
--   commit;
--   (14b 적용 후 새 화면에서 저장된 값은 profile_private 에만 있다. 되돌릴 때는 필요하면 profile_private -> profiles 로 복사)
-- ============================================================================

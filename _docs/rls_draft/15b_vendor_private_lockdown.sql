-- ============================================================================
-- 15b_vendor_private_lockdown.sql  (DRAFT - 새 코드 배포 "후", 15a 적용 완료 상태에서)
-- 새 코드(vendors 를 열 목록으로 읽고 vendor_private 에 계좌를 저장하는 화면)가 배포된 뒤에 적용한다.
-- 배포 전에 적용하면 vendors 를 select('*') 로 읽는 예전 화면이 오류가 난다.
--
-- 하는 일:
--   (1) 배포 사이에 예전 코드가 vendors 에 저장한 계좌를 vendor_private 로 한 번 더 채운다(비어 있는 칸만).
--   (2) 로그인한 사용자가 vendors.bank_name / bank_account 를 읽거나 쓰지 못하게 한다.
--       (SELECT/INSERT/UPDATE 는 테이블 전체 권한이라 열 단위 회수가 듣지 않는다 -> 회수 후 나머지 열에만 다시 부여)
--       DELETE 권한, 행 정책, 가드 트리거는 그대로. service_role 과 DB 함수(DEFINER)는 영향 없음.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

insert into public.vendor_private (vendor_id, bank_name, bank_account)
select v.id, v.bank_name, v.bank_account
  from public.vendors v
 where coalesce(v.bank_name, v.bank_account) is not null
on conflict (vendor_id) do update set
  bank_name    = coalesce(public.vendor_private.bank_name,    excluded.bank_name),
  bank_account = coalesce(public.vendor_private.bank_account, excluded.bank_account);

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'vendors'
     and column_name <> all (array['bank_name', 'bank_account']);

  execute 'revoke select, insert, update on public.vendors from public, anon, authenticated';
  execute format('grant select (%s) on public.vendors to authenticated', cols);
  execute format('grant insert (%s) on public.vendors to authenticated', cols);
  execute format('grant update (%s) on public.vendors to authenticated', cols);
end $$;

commit;

-- ============================================================================
-- 적용 후 확인: 로그인한 사용자가 vendors.bank_account 를 읽으면 거부, vendor_private 는 본인 것만.
--   (vendors 에 select('*') 를 쓰는 코드를 만들지 말 것 - src/lib/vendorColumns.js 의 열 목록을 쓴다)
--
-- 되돌리기 (권한만 복구, 데이터는 그대로):
--   begin;
--   grant select, insert, update on public.vendors to authenticated;
--   commit;
--   (15b 적용 후 새 화면에서 저장된 계좌는 vendor_private 에만 있다. 필요하면 vendor_private -> vendors 로 복사)
-- ============================================================================

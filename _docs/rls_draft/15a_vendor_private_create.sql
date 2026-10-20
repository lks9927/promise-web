-- ============================================================================
-- 15a_vendor_private_create.sql  (DRAFT - 새 코드 배포 "전", 추가만 하므로 화면 동작은 바뀌지 않는다)
-- 선행: 01b (owns_vendor), 14a 와 무관하게 적용 가능.
--
-- 문제: vendors 는 로그인한 누구나 읽을 수 있다(팀장 발주 화면이 업체 목록을 읽기 때문).
--       그래서 외주업체의 계좌(bank_name, bank_account)가 다른 로그인 사용자에게 보인다.
-- 해결: 계좌 2개 열을 본인(업체)과 관리자만 읽는 public.vendor_private 로 옮긴다.
--       이 파일은 새 테이블 + 정책 + 기존 데이터 복사만 한다(vendors 의 열은 그대로 -> 예전 코드도 동작).
--       열 접근을 막는 것은 새 코드 배포 후 15b.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

create table if not exists public.vendor_private (
  vendor_id    uuid primary key references public.vendors(id) on delete cascade,
  bank_name    text,
  bank_account text,
  created_at   timestamptz not null default now()
);

alter table public.vendor_private enable row level security;

drop policy if exists vendor_private_select on public.vendor_private;
drop policy if exists vendor_private_insert on public.vendor_private;
drop policy if exists vendor_private_update on public.vendor_private;
drop policy if exists vendor_private_delete on public.vendor_private;

-- 관리자 또는 그 업체의 주인만 (owns_vendor 는 01b 의 도우미 함수)
create policy vendor_private_select on public.vendor_private
  for select to authenticated
  using ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy vendor_private_insert on public.vendor_private
  for insert to authenticated
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy vendor_private_update on public.vendor_private
  for update to authenticated
  using ((select public.is_admin()) or public.owns_vendor(vendor_id))
  with check ((select public.is_admin()) or public.owns_vendor(vendor_id));

create policy vendor_private_delete on public.vendor_private
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.vendor_private from public, anon;
grant select, insert, update, delete on public.vendor_private to authenticated;
grant all on public.vendor_private to service_role;

-- 기존 계좌 복사 (값이 있는 업체만). 다시 실행해도 이미 있는 행은 건드리지 않는다.
insert into public.vendor_private (vendor_id, bank_name, bank_account)
select v.id, v.bank_name, v.bank_account
  from public.vendors v
 where coalesce(v.bank_name, v.bank_account) is not null
on conflict (vendor_id) do nothing;

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용)
--   select count(*) from public.vendor_private;
--   select count(*) from public.vendors where coalesce(bank_name, bank_account) is not null;   -- 위와 같아야 한다
--
-- 되돌리기 (데이터는 vendors 에 그대로 남아 있다):
--   begin;
--   drop table if exists public.vendor_private;
--   commit;
-- ============================================================================

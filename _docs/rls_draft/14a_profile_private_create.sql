-- ============================================================================
-- 14a_profile_private_create.sql  (DRAFT - 새 코드 배포 "전", 추가만 하므로 화면 동작은 바뀌지 않는다)
-- 선행: 01 (is_admin), STAGE1/STAGE2 적용 완료 상태.
--
-- 목적: profiles 는 로그인한 누구나 읽을 수 있어서(전화번호는 화면 곳곳에서 필요) 주소/계좌/사업자 정보까지
--       다른 사람에게 보인다. 이런 열을 본인과 관리자만 읽는 별도 테이블 public.profile_private 로 옮긴다.
--
-- 옮기는 열(12개): address, address_detail, bank_code, bank_account, bank_holder,
--                  business_number, business_name, ceo_name, business_type, business_item, tax_email, business_address
-- profiles 에 남기는 열:
--   * has_business : 정산 계산 트리거(calculate_settlements)가 읽는 참/거짓 값(민감 정보 아님)
--   * certificate_url, business_license_url : 고객 화면의 팀장 소개(모자이크 처리된 자격증/등록증)에 쓰인다
--   * phone, name 등 : 화면 곳곳에서 다른 사람 것을 join 으로 읽는다
--
-- 이 파일은 (1) 새 테이블 + RLS, (2) 기존 데이터 복사만 한다. profiles 의 원래 열은 그대로 두므로
-- 예전 코드도 그대로 동작한다. 열 접근을 막는 것은 새 코드 배포 후 14b 에서 한다.
-- 하나의 트랜잭션: 실패하면 전부 취소된다. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

create table if not exists public.profile_private (
  id               uuid primary key references public.profiles(id) on delete cascade,
  address          text,
  address_detail   text,
  bank_code        text,
  bank_account     text,
  bank_holder      text,
  business_number  text,
  business_name    text,
  ceo_name         text,
  business_type    text,
  business_item    text,
  tax_email        text,
  business_address text,
  created_at       timestamptz not null default now()
);

alter table public.profile_private enable row level security;

drop policy if exists profile_private_select on public.profile_private;
drop policy if exists profile_private_insert on public.profile_private;
drop policy if exists profile_private_update on public.profile_private;
drop policy if exists profile_private_delete on public.profile_private;

-- 본인과 관리자만 읽고 쓴다. (master 가 하위 팀장의 정보를 봐야 하는 화면은 현재 없다. 필요해지면 함수로 추가한다.)
create policy profile_private_select on public.profile_private
  for select to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()));

create policy profile_private_insert on public.profile_private
  for insert to authenticated
  with check ((select public.is_admin()) or id = (select auth.uid()));

create policy profile_private_update on public.profile_private
  for update to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()))
  with check ((select public.is_admin()) or id = (select auth.uid()));

create policy profile_private_delete on public.profile_private
  for delete to authenticated
  using ((select public.is_admin()));

-- 로그인 없는 사용자는 접근 불가. (id 는 profiles.id 와 같은 값이라 기본키 조회만으로 빠르다)
revoke all on public.profile_private from public, anon;
grant select, insert, update, delete on public.profile_private to authenticated;
grant all on public.profile_private to service_role;

-- 기존 데이터 복사 (값이 하나라도 있는 계정만). 다시 실행해도 이미 있는 행은 건드리지 않는다.
insert into public.profile_private (id, address, address_detail, bank_code, bank_account, bank_holder,
                                    business_number, business_name, ceo_name, business_type, business_item,
                                    tax_email, business_address)
select p.id, p.address, p.address_detail, p.bank_code, p.bank_account, p.bank_holder,
       p.business_number, p.business_name, p.ceo_name, p.business_type, p.business_item,
       p.tax_email, p.business_address
  from public.profiles p
 where coalesce(p.address, p.address_detail, p.bank_code, p.bank_account, p.bank_holder, p.business_number,
                p.business_name, p.ceo_name, p.business_type, p.business_item, p.tax_email, p.business_address) is not null
on conflict (id) do nothing;

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용)
--   select count(*) from public.profile_private;   -- 주소/계좌/사업자 정보를 가진 계정 수와 같아야 한다
--   select count(*) from public.profiles where coalesce(address, bank_account, business_number, tax_email) is not null;
--
-- 되돌리기 (데이터는 profiles 에 그대로 남아 있으므로 새 테이블만 지우면 된다):
--   begin;
--   drop table if exists public.profile_private;
--   commit;
-- ============================================================================

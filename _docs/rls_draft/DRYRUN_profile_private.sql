-- DRYRUN: 14a + 14b 를 적용 + 역할별 시험 후 전부 롤백. 운영 DB 에 아무것도 남지 않는다. 결과는 오류 문구(DRYRUN_RESULT)로 나온다.
-- 전제: STAGE1, STAGE2 가 적용된 운영 DB. (SQL Editor 에 전체를 붙여넣고 Run -> 오류 화면의 문구를 읽는다)

-- ################ 14a ################
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

-- ################ 14b ################
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

-- ############ 시험 구간 ############
create function pg_temp.try(p_sql text, p_uid uuid, p_role text) returns text
language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || p_role;
  execute p_sql;
  get diagnostics n = row_count;
  execute 'reset role';
  return 'OK rows=' || n;
exception when others then
  execute 'reset role';
  return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 70);
end;
$f$;

do $t$
declare
  res text := '';
  r record;
  uid uuid;
  other uuid;
  rl text;
  n_src bigint;
  n_dst bigint;
begin
  select count(*) into n_dst from public.profile_private;
  select count(*) into n_src from public.profiles p
   where coalesce(p.address, p.address_detail, p.bank_code, p.bank_account, p.bank_holder, p.business_number,
                  p.business_name, p.ceo_name, p.business_type, p.business_item, p.tax_email, p.business_address) is not null;
  res := res || E'\n이전 확인: 원본 ' || n_src || '행 / profile_private ' || n_dst || '행 (같아야 함)';

  for r in
    select distinct on (role) role, id from public.profiles
     where role in ('admin','master','leader','dealer','customer','vendor')
     order by role, created_at
  loop
    uid := r.id; rl := r.role;
    select id into other from public.profiles where id <> uid and role <> 'admin' limit 1;
    res := res || E'\n== ' || rl || ' ==';
    res := res || E'\n  profile_private 전체 읽기(관리자만 전체, 그 외 본인 1행 이하): ' || pg_temp.try('select * from public.profile_private', uid, 'authenticated');
    res := res || E'\n  내 행 upsert(허용): ' || pg_temp.try(format('insert into public.profile_private(id, address) values (%L, ''x'') on conflict (id) do update set address = excluded.address', uid), uid, 'authenticated');
    res := res || E'\n  남의 행 upsert(관리자 외 막혀야 함): ' || pg_temp.try(format('insert into public.profile_private(id, address) values (%L, ''x'') on conflict (id) do update set address = excluded.address', other), uid, 'authenticated');
    res := res || E'\n  남의 계좌 읽기(관리자 외 0행): ' || pg_temp.try(format('select bank_account from public.profile_private where id = %L', other), uid, 'authenticated');
    res := res || E'\n  profiles.phone/has_business/certificate_url 읽기(허용): ' || pg_temp.try('select id, name, phone, has_business, certificate_url, business_license_url from public.profiles', uid, 'authenticated');
    res := res || E'\n  profiles.address 읽기(막혀야 함): ' || pg_temp.try('select address from public.profiles limit 1', uid, 'authenticated');
    res := res || E'\n  profiles.bank_account 읽기(막혀야 함): ' || pg_temp.try('select bank_account from public.profiles limit 1', uid, 'authenticated');
    res := res || E'\n  profiles.address 쓰기(막혀야 함): ' || pg_temp.try(format('update public.profiles set address = ''x'' where id = %L', uid), uid, 'authenticated');
    res := res || E'\n  내 소개 수정(허용): ' || pg_temp.try(format('update public.profiles set introduction = introduction, has_business = has_business where id = %L', uid), uid, 'authenticated');
    res := res || E'\n  내 role 변경(막혀야 함): ' || pg_temp.try(format('update public.profiles set role=%L where id=%L', 'admin', uid), uid, 'authenticated');
  end loop;

  res := res || E'\n== 로그인 없음(anon) ==';
  res := res || E'\n  profile_private 읽기(막혀야 함): ' || pg_temp.try('select * from public.profile_private', null, 'anon');
  res := res || E'\n  profile_private 쓰기(막혀야 함): ' || pg_temp.try('insert into public.profile_private(id) values (gen_random_uuid())', null, 'anon');
  res := res || E'\n  profiles 읽기(막혀야 함): ' || pg_temp.try('select id from public.profiles', null, 'anon');

  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

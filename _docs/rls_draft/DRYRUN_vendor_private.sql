-- DRYRUN: 15a + 15b 를 적용 + 역할별 시험 후 전부 롤백. 운영 DB 에 아무것도 남지 않는다. 결과는 오류 문구(DRYRUN_RESULT)로 나온다.
-- 전제: STAGE1, STAGE2 적용된 운영 DB. 15a, 15b 원본을 고치면 이 파일도 다시 만든다.

-- ################ 15a ################
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

-- ################ 15b ################
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
  my_v uuid;
  other_v uuid;
  rl text;
  n_src bigint;
  n_dst bigint;
  cols text;
  cols_list text := 'id,user_id,company_name,business_type,phone,address,status,rejection_reason,approved_at,approved_by,created_at,tax_type';
begin
  select count(*) into n_dst from public.vendor_private;
  select count(*) into n_src from public.vendors v where coalesce(v.bank_name, v.bank_account) is not null;
  res := res || E'\n이전 확인: 원본 ' || n_src || '행 / vendor_private ' || n_dst || '행 (같아야 함)';
  select string_agg(column_name, ',') into cols from information_schema.columns
   where table_schema='public' and table_name='vendors' and column_name <> all (string_to_array(cols_list, ','));
  res := res || E'\nvendors 의 열 중 코드 목록(VENDOR_COLUMNS)에 없는 것(없어야 함): ' || coalesce(cols, '(없음)');

  select user_id, id into uid, my_v from public.vendors where user_id is not null limit 1;
  select id into other_v from public.vendors where id <> my_v limit 1;
  res := res || E'\n업체 수: ' || (select count(*) from public.vendors);

  for r in
    select 'vendor'::text as role, uid as id where uid is not null
    union all
    select s.role, s.id from (select distinct on (role) role, id from public.profiles where role in ('admin','leader','dealer','customer') order by role, created_at) s
  loop
    res := res || E'\n== ' || r.role || E' ==';
    res := res || E'\n  vendors 열 목록 읽기(허용): ' || pg_temp.try('select ' || cols_list || ' from public.vendors', r.id, 'authenticated');
    res := res || E'\n  vendors.bank_account 읽기(막혀야 함): ' || pg_temp.try('select bank_account from public.vendors', r.id, 'authenticated');
    res := res || E'\n  vendors select *(막혀야 함): ' || pg_temp.try('select * from public.vendors', r.id, 'authenticated');
    res := res || E'\n  vendor_private 읽기(관리자 전체, 업체 본인 1행 이하, 그 외 0): ' || pg_temp.try('select * from public.vendor_private', r.id, 'authenticated');
    if my_v is not null then
      res := res || E'\n  내 업체 계좌 upsert(업체 본인/관리자만 OK): ' || pg_temp.try(format('insert into public.vendor_private(vendor_id, bank_account) values (%L, ''x'') on conflict (vendor_id) do update set bank_account = excluded.bank_account', my_v), r.id, 'authenticated');
    end if;
    if other_v is not null then
      res := res || E'\n  다른 업체 계좌 upsert(업체 본인 불가, 관리자만 OK): ' || pg_temp.try(format('insert into public.vendor_private(vendor_id, bank_account) values (%L, ''x'') on conflict (vendor_id) do update set bank_account = excluded.bank_account', other_v), r.id, 'authenticated');
    end if;
    res := res || E'\n  vendors.bank_account 쓰기(막혀야 함): ' || pg_temp.try('update public.vendors set bank_account = ''x''', r.id, 'authenticated');
    res := res || E'\n  vendors 상태 수정(관리자만 OK): ' || pg_temp.try('update public.vendors set status = status', r.id, 'authenticated');
  end loop;

  res := res || E'\n== 로그인 없음(anon) ==';
  res := res || E'\n  vendors 읽기(막혀야 함): ' || pg_temp.try('select id from public.vendors', null, 'anon');
  res := res || E'\n  vendor_private 읽기(막혀야 함): ' || pg_temp.try('select * from public.vendor_private', null, 'anon');

  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

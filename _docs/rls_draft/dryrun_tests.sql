
-- ############ 시험 구간: 위 2차 SQL 을 적용한 상태에서 기존 계정의 권한을 흉내 내 본다 ############
-- 마지막에 일부러 오류를 내서 "전부 취소(롤백)" 한다 -> DB 에는 아무것도 남지 않는다. 결과는 오류 문구에 담겨 나온다.
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
  tbl text;
begin
  for r in
    select distinct on (role) role, id from public.profiles
     where role in ('admin','master','leader','dealer','customer','vendor')
     order by role, created_at
  loop
    uid := r.id; rl := r.role;
    select id into other from public.profiles where id <> uid limit 1;
    res := res || E'\n== ' || rl || ' ==';
    foreach tbl in array array['partners','funeral_cases','coupons','notifications','commission_policies','system_config','orders'] loop
      res := res || E'\n  읽기 ' || tbl || ': ' || pg_temp.try('select * from public.' || tbl, uid, 'authenticated');
    end loop;
    res := res || E'
  읽기 profiles(열 목록): ' || pg_temp.try('select id, role, name, phone, created_at from public.profiles', uid, 'authenticated');
    res := res || E'\n  password 열 읽기(막혀야 함): ' || pg_temp.try('select password from public.profiles limit 1', uid, 'authenticated');
    res := res || E'\n  내 role 을 admin 으로(막혀야 함): ' || pg_temp.try(format('update public.profiles set role=%L where id=%L', 'admin', uid), uid, 'authenticated');
    res := res || E'\n  남의 이름 수정(0행이어야 함): ' || pg_temp.try(format('update public.profiles set name=name where id=%L', other), uid, 'authenticated');
    res := res || E'\n  수수료 정책 수정(관리자만 1행 이상): ' || pg_temp.try('update public.commission_policies set id=id', uid, 'authenticated');
    res := res || E'\n  남 대신 배정수락(막혀야 함): ' || pg_temp.try(format('select public.accept_bidding(%L::uuid, %L::uuid)', gen_random_uuid(), other), uid, 'authenticated');
  end loop;

  res := res || E'\n== 로그인 없음(anon) ==';
  foreach tbl in array array['partners','funeral_cases','coupons','notifications','commission_policies','system_config','orders'] loop
    res := res || E'\n  읽기 ' || tbl || ': ' || pg_temp.try('select * from public.' || tbl, null, 'anon');
  end loop;
  res := res || E'\n  읽기 profiles(열 목록): ' || pg_temp.try('select id, role, name, phone from public.profiles', null, 'anon');
  res := res || E'\n  쿠폰 조회 함수(허용): ' || pg_temp.try('select public.get_coupon_public(''zzzz'')', null, 'anon');
  res := res || E'\n  배정수락 함수(막혀야 함): ' || pg_temp.try(format('select public.accept_bidding(%L::uuid, %L::uuid)', gen_random_uuid(), gen_random_uuid()), null, 'anon');
  res := res || E'\n  공개 설정 읽기(허용, system_config 일부): ' || pg_temp.try('select * from public.system_config where key like ''footer_%''', null, 'anon');

  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

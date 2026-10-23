-- DRYRUN: 18 을 적용 + 시험 후 전부 롤백. 운영 DB 에 아무것도 남지 않는다. 결과는 오류 문구(DRYRUN_RESULT)로 나온다.
-- ============================================================================
-- 18_drop_profiles_password.sql  (DRAFT - 새 코드 배포 "후" 에 적용)
-- 선행: 새 코드 배포 완료. 새 코드는 옛 비밀번호 열을 읽지도 쓰지도 않고(Login.jsx 의 옛 로그인 경로와
--       api/legacy-login-migrate.js 삭제, AdminDashboard 의 password: null 제거), 로그인은 Supabase Auth 만 쓴다.
--
-- 하는 일: profiles.password(옛 비밀번호 해시) 열을 삭제한다.
--   * 운영 확인(2026-10-23): 값이 있는 계정 17개 중 16개는 Auth 계정이 이미 있고 로그인 기록이 있다.
--     나머지 1개는 사용자 본인의 테스트 팀장 계정이며 삭제를 감수하기로 했다(로그인 불가가 됨).
--   * 되돌릴 수 있게, 삭제 전에 (id, password) 를 잠금 처리된 백업 테이블에 복사한다.
--     백업은 안정되면 지운다(drop table public.profiles_password_backup).
--   * cascade 를 쓰지 않으므로 이 열에 의존하는 뷰 등이 있으면 오류로 전체 취소된다.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================

create table if not exists public.profiles_password_backup as
  select id, password, now() as backed_up_at
    from public.profiles
   where password is not null;

alter table public.profiles_password_backup enable row level security;   -- 정책 없음 = 일반 사용자 접근 불가
revoke all on public.profiles_password_backup from public, anon, authenticated;

alter table public.profiles drop column if exists password;


-- ============================================================================
-- 적용 후 확인 (읽기 전용):
--   select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='password';  -- 0행
--   select count(*) from public.profiles_password_backup;   -- 17
--
-- 되돌리기 (백업이 있을 때):
--   begin;
--   alter table public.profiles add column if not exists password text;
--   update public.profiles p set password = b.password from public.profiles_password_backup b where b.id = p.id;
--   -- 열 권한: 로그인한 사용자가 읽지 못하게 13 과 같이 password 를 뺀 열 목록만 읽도록 유지 (새로 만든 열은 자동으로 권한이 없다)
--   commit;
-- ============================================================================

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
begin
  res := res || E'\n백업 행 수: ' || (select count(*) from public.profiles_password_backup) || ' (적용 전 password 값이 있던 계정 수와 같아야 함)';
  res := res || E'\npassword 열 남아 있나(0이어야 함): ' || (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='password');
  res := res || E'\n본문에 password 가 들어간 public 함수(profiles.password 를 쓰면 깨질 수 있음): ' || coalesce((select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.prosrc ~* '\mpassword\M' and p.proname not like 'request_password_reset'), '(없음)');
  res := res || E'\n트리거 함수 profiles_guard_non_admin 정상 동작(내 소개 수정): ';
  for r in select id, role from public.profiles where role in ('admin','leader','customer') order by role limit 3 loop
    res := res || E'\n  ' || r.role || ' 내 정보 수정(허용): ' || pg_temp.try(format('update public.profiles set introduction = introduction where id = %L', r.id), r.id, 'authenticated');
    res := res || E'\n  ' || r.role || ' 내 role 변경(막혀야 함): ' || pg_temp.try(format('update public.profiles set role = %L where id = %L', 'admin', r.id), r.id, 'authenticated');
    res := res || E'\n  ' || r.role || ' 열 목록 읽기(허용): ' || pg_temp.try('select id, name, phone, role from public.profiles', r.id, 'authenticated');
    res := res || E'\n  ' || r.role || ' 백업 테이블 읽기(막혀야 함): ' || pg_temp.try('select * from public.profiles_password_backup', r.id, 'authenticated');
  end loop;
  res := res || E'\n비밀번호 재설정 요청 함수(anon, 허용): ' || pg_temp.try('select public.request_password_reset(''dry'', ''000'')', null, 'anon');
  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

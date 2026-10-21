-- DRYRUN: 16 을 적용 + 역할별 시험 후 전부 롤백. 운영 DB 에 아무것도 남지 않는다. 결과는 오류 문구(DRYRUN_RESULT)로 나온다.
-- ============================================================================
-- 16_notifications_tighten_insert.sql  (DRAFT - 새 코드 배포 "후")
-- 선행: 12 (notifications 의 RLS 와 정책). 새 코드는 알림을 만들 때 발신자(sender_id)를 항상 본인으로 채운다.
--
-- 지금 정책(12): 발신자를 "비우거나 본인"으로만 만들 수 있다.
--   -> 다른 사람 이름으로 위조는 막혀 있지만, 발신자를 비우면 "시스템 알림"처럼 보이는 가짜 알림을 만들 수 있다.
--   -> link(눌렀을 때 이동 경로)에 외부 주소를 넣어 피싱 링크를 보낼 수 있다.
-- 변경: 관리자가 아니면 (1) 발신자는 반드시 본인, (2) link 는 비우거나 앱 안의 경로('/...')만.
-- DB 함수/트리거(DEFINER)가 만드는 시스템 알림은 영향 없음.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================

drop policy if exists notifications_insert on public.notifications;

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      sender_id = (select auth.uid())
      and (link is null or (link like '/%' and link not like '//%'))
    )
  );


-- ============================================================================
-- 되돌리기 (12 의 원래 정책):
--   begin;
--   drop policy if exists notifications_insert on public.notifications;
--   create policy notifications_insert on public.notifications
--     for insert to authenticated
--     with check ((select public.is_admin()) or sender_id is null or sender_id = (select auth.uid()));
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
  other uuid;
begin
  for r in select s.role, s.id from (select distinct on (role) role, id from public.profiles where role in ('admin','leader','customer') order by role, created_at) s
  loop
    select id into other from public.profiles where id <> r.id and role <> 'admin' limit 1;
    res := res || E'\n== ' || r.role || E' ==';
    res := res || E'\n  본인 발신 + 앱 내 링크(허용): ' || pg_temp.try(format('insert into public.notifications(user_id, sender_id, type, title, message, link) values (%L, %L, ''info'', ''t'', ''m'', ''/leader'')', other, r.id), r.id, 'authenticated');
    res := res || E'\n  본인 발신 + 링크 없음(허용): ' || pg_temp.try(format('insert into public.notifications(user_id, sender_id, type, title, message) values (%L, %L, ''info'', ''t'', ''m'')', other, r.id), r.id, 'authenticated');
    res := res || E'\n  발신자 비움(관리자만 OK): ' || pg_temp.try(format('insert into public.notifications(user_id, type, title, message) values (%L, ''info'', ''t'', ''m'')', other), r.id, 'authenticated');
    res := res || E'\n  남 이름으로 발신(관리자만 OK): ' || pg_temp.try(format('insert into public.notifications(user_id, sender_id, type, title, message) values (%L, %L, ''info'', ''t'', ''m'')', other, other), r.id, 'authenticated');
    res := res || E'\n  외부 링크(관리자만 OK): ' || pg_temp.try(format('insert into public.notifications(user_id, sender_id, type, title, message, link) values (%L, %L, ''info'', ''t'', ''m'', ''https://evil.example'')', other, r.id), r.id, 'authenticated');
    res := res || E'\n  // 로 시작하는 링크(관리자만 OK): ' || pg_temp.try(format('insert into public.notifications(user_id, sender_id, type, title, message, link) values (%L, %L, ''info'', ''t'', ''m'', ''//evil.example'')', other, r.id), r.id, 'authenticated');
  end loop;
  res := res || E'\n== 로그인 없음(anon) ==';
  res := res || E'\n  알림 만들기(막혀야 함): ' || pg_temp.try('insert into public.notifications(type, title, message) values (''info'', ''t'', ''m'')', null, 'anon');
  raise exception E'DRYRUN_RESULT (전부 취소됨)%', res;
end
$t$;

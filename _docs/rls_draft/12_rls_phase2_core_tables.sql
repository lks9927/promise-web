-- ============================================================================
-- 12_rls_phase2_core_tables.sql  (DRAFT - 새 코드 배포 "후"에 적용 / STAGE2 맨 뒤)
-- 선행: 01, 01b(도우미 함수), 03, 06, 07, 08, 09, 10, 11 이 먼저 적용돼 있어야 한다.
--
-- 2단계 RLS "1차": 아직 RLS 가 꺼져 있는 핵심 테이블 5개와 진행 보고서 읽기를 닫는다.
--   profiles, partners, funeral_cases, coupons, notifications  (+ funeral_progress_reports 의 공개 읽기)
-- 핵심 효과: 로그인 없는(anon) 공개 키로는 위 테이블을 읽거나 쓸 수 없게 된다.
--   로그인 없는 화면(쿠폰 링크, 배송기사, 비밀번호 초기화 요청, 홈 접수, 롤링 현황)은 이미
--   서버 함수(DEFINER)로 대체돼 영향이 없다. 고객 /mypage 는 고객이 로그인할 수 없는 구조라 원래 쓸 수 없다.
-- 그 위에 로그인한 사용자의 범위를 상하 관계(partners.master_id)와 담당 장례로 제한한다.
-- 의도적으로 "열어 둔" 것(다음 단계에서 보기/함수로 좁힘):
--   * profiles 읽기: 로그인한 사용자 전체(여러 화면이 다른 사람의 이름/전화를 join 으로 읽는다).
--     계좌/사업자 정보 같은 민감 열도 로그인한 파트너끼리는 읽힌다.
--   * funeral_cases 수정: 관련된 팀장/상위 master 가 모든 열을 수정할 수 있다(열 단위 제한은 코드 영향이 커서 보류).
--   * notifications 생성: 로그인한 사용자가 다른 사람에게 알림을 만들 수 있다(발신자 위조 가능).
-- 서버(서비스 키), 트리거, DEFINER 함수는 RLS 를 우회한다.
-- 하나의 트랜잭션: 실패하면 전부 취소된다. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 도우미 함수 (SECURITY DEFINER: 정책끼리 서로 참조해 생기는 RLS 재귀를 피한다)
-- ----------------------------------------------------------------------------
-- 내 하위(partners.master_id = 나)인가
create or replace function public.is_my_report(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_user is not null and exists (
    select 1 from public.partners pt where pt.user_id = p_user and pt.master_id = auth.uid()
  );
$$;

-- 내 상위(나의 master)인가
create or replace function public.is_my_master(p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_user is not null and exists (
    select 1 from public.partners pt where pt.user_id = auth.uid() and pt.master_id = p_user
  );
$$;

-- 이 장례 건을 볼 수 있는가: 관리자, 당사자(고객/딜러/담당 팀장/입찰 중인 팀장),
-- 딜러·팀장의 상위 master, 또는 "접수 대기(requested)" 건(팀장/master 가 배정 대기 목록을 봄)
create or replace function public.can_see_case(p_case uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.funeral_cases c
     where c.id = p_case
       and (
         public.is_admin()
         or c.customer_id       = auth.uid()
         or c.dealer_id         = auth.uid()
         or c.team_leader_id    = auth.uid()
         or c.current_bidder_id = auth.uid()
         or public.is_my_report(c.dealer_id)
         or public.is_my_report(c.team_leader_id)
         or (c.status = 'requested' and public.my_role() in ('master', 'leader'))
       )
  );
$$;

revoke all on function public.is_my_report(uuid)  from public, anon;
revoke all on function public.is_my_master(uuid)  from public, anon;
revoke all on function public.can_see_case(uuid)  from public, anon;
grant execute on function public.is_my_report(uuid), public.is_my_master(uuid), public.can_see_case(uuid)
  to authenticated;

-- 기존 정책 이름과 상관없이 대상 테이블의 정책을 전부 지우고 새로 만든다.
create or replace function pg_temp.drop_all_policies(p_table regclass)
returns void language plpgsql as $$
declare
  r record;
  v_name text := (select c.relname::text from pg_class c where c.oid = p_table);
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = v_name
  loop
    execute format('drop policy %I on public.%I', r.policyname, v_name);
  end loop;
end $$;

-- ============================================================================
-- profiles
-- ============================================================================
select pg_temp.drop_all_policies('public.profiles');
alter table public.profiles enable row level security;

-- 읽기: 로그인한 사용자 (위 설명 참조). 로그인 없는 접근은 없다.
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

-- 가입 직후 본인 행 생성(가입 화면은 Auth 가입 직후 로그인 상태로 실행). 권한 있는 역할은 관리자만 부여.
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      id = (select auth.uid())
      and role in ('leader', 'dealer', 'vendor', 'customer')
      and admin_level is null          -- 관리자 등급 값은 가입 때 넣을 수 없다
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.is_admin()) or id = (select auth.uid()))
  with check ((select public.is_admin()) or id = (select auth.uid()));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select public.is_admin()));

-- 본인 수정이어도 권한/식별 열은 못 바꾼다 (역할 상승 방지). 관리자, DEFINER 함수, 서비스 키는 영향 없음.
create or replace function public.profiles_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if current_user = 'authenticated' and not public.is_admin() then
    foreach k in array array['id', 'role', 'admin_level', 'password'] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'profiles: % 항목은 변경할 수 없습니다.', k using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_guard_non_admin on public.profiles;
create trigger trg_profiles_guard_non_admin
  before update on public.profiles
  for each row execute function public.profiles_guard_non_admin();

-- ============================================================================
-- partners
-- ============================================================================
select pg_temp.drop_all_policies('public.partners');
alter table public.partners enable row level security;

-- 읽기: 관리자 / 본인 / 내 하위 / 내 상위
create policy partners_select on public.partners
  for select to authenticated
  using (
    (select public.is_admin())
    or user_id = (select auth.uid())
    or master_id = (select auth.uid())
    or public.is_my_master(user_id)
  );

-- 가입: 본인 행을 "대기(pending) / C 등급 / 상위 없음"으로만 만들 수 있다. 그 밖은 관리자.
create policy partners_insert on public.partners
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (user_id = (select auth.uid()) and grade = 'C' and status = 'pending' and master_id is null)
  );

create policy partners_update on public.partners
  for update to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()))
  with check ((select public.is_admin()) or user_id = (select auth.uid()));

create policy partners_delete on public.partners
  for delete to authenticated
  using ((select public.is_admin()));

-- 본인은 계좌, 근무 상태, 주소/지역만 바꿀 수 있다 (등급, 승인 상태, 상위, 하위 한도는 관리자만).
create or replace function public.partners_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'bank_account' - 'current_status' - 'is_working' - 'address' - 'detail_address' - 'region')
       is distinct from
       (to_jsonb(old) - 'bank_account' - 'current_status' - 'is_working' - 'address' - 'detail_address' - 'region') then
      raise exception 'partners: 등급/상태/상위 정보는 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_partners_guard_non_admin on public.partners;
create trigger trg_partners_guard_non_admin
  before update on public.partners
  for each row execute function public.partners_guard_non_admin();

-- ============================================================================
-- funeral_cases   (현재 정책 1개: 로그인한 사용자 전체 읽기 -> 관련자로 제한)
-- ============================================================================
select pg_temp.drop_all_policies('public.funeral_cases');
alter table public.funeral_cases enable row level security;

create policy funeral_cases_select on public.funeral_cases
  for select to authenticated
  using (
    (select public.is_admin())
    or customer_id       = (select auth.uid())
    or dealer_id         = (select auth.uid())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(dealer_id)
    or public.is_my_report(team_leader_id)
    or (status = 'requested' and (select public.my_role()) in ('master', 'leader'))
  );

-- 팀장/master 가 만드는 "비공개(private) 장례". 일반 접수는 서버 함수(submit_emergency_case)가 만든다.
create policy funeral_cases_insert on public.funeral_cases
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      is_private = true
      and team_leader_id = (select auth.uid())
      and (select public.my_role()) in ('master', 'leader')
    )
  );

-- 수정: 담당/입찰 팀장, 그 팀장의 master, 배정 대기 건을 가져가는 팀장/master. 가져간 뒤에는 본인이 담당이어야 한다.
create policy funeral_cases_update on public.funeral_cases
  for update to authenticated
  using (
    (select public.is_admin())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
    or (status = 'requested' and (select public.my_role()) in ('master', 'leader'))
  )
  with check (
    (select public.is_admin())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
  );

create policy funeral_cases_delete on public.funeral_cases
  for delete to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- coupons   (정책 없음/RLS 꺼짐 -> 켬. 로그인 없는 조회는 get_coupon_public 함수가 대신한다)
-- ============================================================================
select pg_temp.drop_all_policies('public.coupons');
alter table public.coupons enable row level security;

create policy coupons_select on public.coupons
  for select to authenticated
  using (
    (select public.is_admin())
    or issued_by = (select auth.uid())
    or public.is_my_report(issued_by)
    or (case_id is not null and public.can_see_case(case_id))
  );

create policy coupons_insert on public.coupons
  for insert to authenticated
  with check ((select public.is_admin()) or issued_by = (select auth.uid()));

-- 수정: 관리자, 또는 연결된 장례 건을 볼 수 있는 팀장/master (TeamLeaderDashboard 의 쿠폰 상태 처리)
create policy coupons_update on public.coupons
  for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.my_role()) in ('master', 'leader') and case_id is not null and public.can_see_case(case_id))
  )
  with check (
    (select public.is_admin())
    or ((select public.my_role()) in ('master', 'leader') and case_id is not null and public.can_see_case(case_id))
  );

create policy coupons_delete on public.coupons
  for delete to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- notifications   (정책 없음/RLS 꺼짐 -> 켬)
-- ============================================================================
select pg_temp.drop_all_policies('public.notifications');
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()) or sender_id = (select auth.uid()));

-- 만들기: 발신자를 비우거나 본인으로. (다른 사람 이름으로 위조는 막는다)
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check ((select public.is_admin()) or sender_id is null or sender_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using ((select public.is_admin()) or user_id = (select auth.uid()))
  with check ((select public.is_admin()) or user_id = (select auth.uid()));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using ((select public.is_admin()));

-- 받는 사람은 "읽음(is_read)"만 바꿀 수 있다.
create or replace function public.notifications_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'is_read') is distinct from (to_jsonb(old) - 'is_read') then
      raise exception 'notifications: 읽음 표시 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notifications_guard_non_admin on public.notifications;
create trigger trg_notifications_guard_non_admin
  before update on public.notifications
  for each row execute function public.notifications_guard_non_admin();

-- ============================================================================
-- funeral_progress_reports  (RLS 는 이미 켜져 있고 읽기 정책이 USING true 라 공개 읽기였다)
-- 읽기만 "장례 건을 볼 수 있는 사람"으로 바꾼다. 작성/수정/삭제 정책(작성자 기준)은 그대로 둔다.
-- ============================================================================
drop policy if exists "보고서는 누구나 열람 가능" on public.funeral_progress_reports;
create policy funeral_progress_reports_select on public.funeral_progress_reports
  for select to authenticated
  using (public.can_see_case(case_id));

-- ============================================================================
-- 인덱스: 정책이 쓰는 열 (데이터가 늘어도 느려지지 않게)
-- ============================================================================
create index if not exists funeral_cases_dealer_id_idx          on public.funeral_cases (dealer_id);
create index if not exists funeral_cases_team_leader_id_idx     on public.funeral_cases (team_leader_id);
create index if not exists funeral_cases_current_bidder_id_idx  on public.funeral_cases (current_bidder_id);
create index if not exists funeral_cases_customer_id_idx        on public.funeral_cases (customer_id);
create index if not exists funeral_cases_status_idx             on public.funeral_cases (status);
create index if not exists coupons_issued_by_idx                on public.coupons (issued_by);
create index if not exists coupons_case_id_idx                  on public.coupons (case_id);
create index if not exists notifications_user_id_idx            on public.notifications (user_id);
create index if not exists notifications_sender_id_idx          on public.notifications (sender_id);
create index if not exists partners_user_id_idx                 on public.partners (user_id);

commit;

-- ============================================================================
-- 적용 직후 확인 (로그인 계정으로, 각 1~2분)
--  1. 관리자: 대시보드 전체(장례, 정산, 파트너, 쿠폰, 알림)가 평소처럼 보인다.
--  2. 딜러: 내 쿠폰 발급/목록, 내 장례 현황, 내 정산이 보인다. 다른 딜러의 장례/쿠폰은 안 보인다.
--  3. 팀장: 배정 대기 목록이 보이고 "수락"이 된다. 진행 보고서 작성/조회. 내 지갑.
--  4. master: 하위 딜러/팀장의 목록, 그들의 장례가 보인다.
--  5. 가입(/apply)이 끝까지 된다(테스트 계정). 로그아웃 후 공개 홈에서 장례 접수 버튼이 된다.
--  6. 로그인 없이 공개 키로 profiles/funeral_cases/coupons 를 읽으면 비어 있어야 한다.
--  문제가 생기면 바로 아래 되돌리기.
--
-- 되돌리기 (이 파일 이전 상태: 5개 테이블 RLS 꺼짐 / profiles, funeral_cases 의 옛 읽기 정책):
--  begin;
--  drop trigger if exists trg_profiles_guard_non_admin on public.profiles;
--  drop trigger if exists trg_partners_guard_non_admin on public.partners;
--  drop trigger if exists trg_notifications_guard_non_admin on public.notifications;
--  drop function if exists public.profiles_guard_non_admin();
--  drop function if exists public.partners_guard_non_admin();
--  drop function if exists public.notifications_guard_non_admin();
--  select pg_temp.drop_all_policies('public.profiles');  select pg_temp.drop_all_policies('public.partners');
--  select pg_temp.drop_all_policies('public.funeral_cases'); select pg_temp.drop_all_policies('public.coupons');
--  select pg_temp.drop_all_policies('public.notifications');
--  (pg_temp 함수는 이 파일을 실행한 같은 탭에서만 남아 있다. 새 탭이면 파일 위쪽의 정의를 먼저 실행한다)
--  alter table public.profiles       disable row level security;
--  alter table public.partners       disable row level security;
--  alter table public.funeral_cases  disable row level security;
--  alter table public.coupons        disable row level security;
--  alter table public.notifications  disable row level security;
--  create policy "Profiles viewable by authenticated or self" on public.profiles for select using (auth.role() = 'authenticated' or auth.uid() = id);
--  create policy "Cases viewable by authenticated users" on public.funeral_cases for select using (auth.role() = 'authenticated');
--  drop policy if exists funeral_progress_reports_select on public.funeral_progress_reports;
--  create policy "보고서는 누구나 열람 가능" on public.funeral_progress_reports for select using (true);
--  commit;
-- ============================================================================

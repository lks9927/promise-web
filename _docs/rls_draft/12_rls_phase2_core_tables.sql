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

-- 도우미 함수(is_my_report, is_my_master, can_see_case)는 01b_order_vendor_helpers.sql 로 옮겼다. 01, 01b 를 먼저 적용해야 한다.

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
    -- 배정 대기 건: 화면이 보여 주는 것(아직 입찰자가 없거나 나에게 온 건)만. 남에게 간 건은 안 보인다.
    or (
      status = 'requested'
      and (select public.my_role()) in ('master', 'leader')
      and (current_bidder_id is null or current_bidder_id = (select auth.uid()))
    )
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

-- 수정: 담당/입찰 팀장과 그 팀장의 master 만. 배정 대기 건을 "가져가는" 일은 직접 UPDATE 가 아니라
--       accept_bidding 함수(13 에서 호출자 검증 추가)로만 한다(풀의 아무 건이나 수정해 가로채지 못하게).
-- 수정 후에도 내가 담당이거나, 담당을 해제해 배정 대기(requested, 담당 없음)로 되돌리는 경우는 허용한다
-- (팀장 화면의 "배정 취소": TeamLeaderDashboard 가 status='requested', team_leader_id=null 로 수정).
create policy funeral_cases_update on public.funeral_cases
  for update to authenticated
  using (
    (select public.is_admin())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
  )
  with check (
    (select public.is_admin())
    or team_leader_id    = (select auth.uid())
    or current_bidder_id = (select auth.uid())
    or public.is_my_report(team_leader_id)
    or (status = 'requested' and team_leader_id is null)
  );

-- 관련 팀장/master 라도 장례 건의 "소유/금액" 열은 바꿀 수 없다(관리자와 DEFINER 함수/트리거만).
-- 트리거는 이름순으로 실행되므로 이름을 trg_00_ 로 시작해 다른 트리거보다 먼저 돌게 한다
-- (다른 트리거가 같은 UPDATE 안에서 바꾼 값을 "화면이 바꾼 것"으로 오해하지 않도록).
-- 상태, 담당자(배정 해제 포함), 입찰 정보, 고인명/빈소/장소/시간 같은 진행 정보는 그대로 수정 가능.
create or replace function public.funeral_cases_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if current_user = 'authenticated' and not public.is_admin() then
    foreach k in array array[
      'customer_id', 'dealer_id', 'coupon_code', 'funnel_type', 'is_private',
      'final_price', 'commission_amount', 'usage_fee', 'is_remitted', 'deducted_from_deposit',
      'additional_income_total', 'additional_income_rate', 'additional_income_settled',
      'master_rating', 'customer_rating'
    ] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'funeral_cases: % 항목은 변경할 수 없습니다.', k using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_00_funeral_cases_guard_non_admin on public.funeral_cases;
create trigger trg_00_funeral_cases_guard_non_admin
  before update on public.funeral_cases
  for each row execute function public.funeral_cases_guard_non_admin();

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

-- 발급: 본인 명의로, 사용 전(issued) 상태의 새 쿠폰만. 이미 사용된 것처럼 만들거나 장례 건에 미리 연결할 수 없다.
create policy coupons_insert on public.coupons
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      issued_by = (select auth.uid())
      and status = 'issued'
      and case_id is null
      and (select public.my_role()) in ('dealer', 'leader', 'master')
    )
  );

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

-- 관리자가 아닌 직접 수정은 쿠폰의 "상태(status)"만 바꿀 수 있다 (코드, 금액, 발급자, 연결 건 변조 방지).
create or replace function public.coupons_guard_non_admin()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'coupons: 상태 외의 값은 변경할 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_00_coupons_guard_non_admin on public.coupons;
create trigger trg_00_coupons_guard_non_admin
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin();

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
create index if not exists partners_master_user_idx             on public.partners (master_id, user_id);
create index if not exists funeral_cases_coupon_code_idx        on public.funeral_cases (coupon_code);

-- Realtime(화면 자동 갱신)이 이 테이블들의 변경을 계속 받도록 publication 에 있는지 확인하고, 없으면 추가한다.
do $$
declare t text;
begin
  foreach t in array array['funeral_cases', 'notifications'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

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
--  drop trigger if exists trg_00_funeral_cases_guard_non_admin on public.funeral_cases;
--  drop trigger if exists trg_00_coupons_guard_non_admin on public.coupons;
--  drop function if exists public.funeral_cases_guard_non_admin();
--  drop function if exists public.coupons_guard_non_admin();
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

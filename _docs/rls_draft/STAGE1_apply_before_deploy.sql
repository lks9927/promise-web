-- ============================================================================
-- STAGE1_apply_before_deploy.sql  (자동 조립 파일 - 원본: 01, 01b, 05, 07, 08, 11)
-- 새 코드를 "배포하기 전에" 적용한다. 기존 화면 동작은 바뀌지 않는다(추가만 한다):
--   01 : 관리자/장례 담당 판별 도우미, 정산 계산 트리거 함수를 소유자 권한으로(본문 동일)
--   01b: 발주/업체 도우미 함수
--   05 : 수수료 정책을 관리자만 수정 (지금은 공개 키로 누구나 수정 가능 - 가장 급함)
--   07 : 쿠폰 조회 함수
--   08 : 배송기사 링크용 토큰 테이블과 함수
--   11 : 비밀번호 초기화 요청 함수
-- SQL Editor 에 파일 전체를 붙여넣고 Run. 오류가 나면 멈추고 오류 문구를 알려주세요.
-- ============================================================================

-- ################ 01_prerequisites.sql ################
-- ============================================================================
-- 01_prerequisites.sql  (DRAFT - 운영 DB에 적용 전 반드시 검토)
-- RLS를 켜기 "전에" 먼저 적용해야 하는 준비 작업. 이것만 적용해도 동작은 바뀌지 않는다.
-- 근거(2026-10-20 운영 DB 확인):
--   * calculate_settlements() 는 SECURITY INVOKER 인 트리거 함수이고,
--     funeral_cases.status 가 in_progress 로 바뀔 때 settlements 에 INSERT 한다.
--     settlements 에 RLS 를 켜면 "상태를 바꾼 팀장" 권한으로 실행되어 막힌다.
--   * 나머지 함수/트리거는 이미 SECURITY DEFINER 라서 RLS 영향을 받지 않는다.
-- ============================================================================

-- 1) 관리자 판별 도우미.
--    정책에서는 반드시 (select public.is_admin()) 형태로 감싸 쿼리당 1회만 평가되게 쓴다.
--    anon 에게도 EXECUTE 를 주는 이유: 정책식 안에서 호출되므로 권한이 없으면
--    anon 요청이 "permission denied for function" 으로 실패한다 (결과는 항상 false).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- 정책은 모두 authenticated 에게만 적용되므로 anon 의 실행 권한은 주지 않는다.
-- (장례 등록 함수는 DEFINER 라서 내부에서 호출해도 anon 권한이 필요 없다.
--  2단계에서 anon 정책이 이 함수를 써야 하면 그때 그 정책에 맞춰 부여한다.)
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 1-2) 장례 건의 "관리 권한" 판별: 담당 팀장 본인, 또는 그 팀장의 상위 master.
--      DEFINER 로 만들어 funeral_cases/partners 의 RLS(2단계에서 켬)와 무관하게 동작하고,
--      정책끼리 서로를 참조해 생기는 재귀 오류를 피한다.
create or replace function public.is_case_manager(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.funeral_cases c
      left join public.partners pt on pt.user_id = c.team_leader_id
     where c.id = p_case
       and c.team_leader_id is not null
       and (c.team_leader_id = auth.uid() or pt.master_id = auth.uid())
  );
$$;

revoke all on function public.is_case_manager(uuid) from public, anon;
grant execute on function public.is_case_manager(uuid) to authenticated;

-- 2) 정산 계산 트리거 함수를 SECURITY DEFINER 로 전환.
--    (함수 본문은 그대로, 실행 권한만 소유자로 바뀐다. 소유자는 RLS 를 우회한다.)
--    되돌리기: 98_rollback_function_changes.sql
alter function public.calculate_settlements() security definer;
alter function public.calculate_settlements() set search_path = public, pg_temp;

-- 확인용 (적용 후 실행): calculate_settlements 가 DEFINER 인지 보기
-- select proname, prosecdef from pg_proc
-- where pronamespace = 'public'::regnamespace and proname in ('calculate_settlements','is_admin');

-- ################ 01b_order_vendor_helpers.sql ################
-- ============================================================================
-- 01b_order_vendor_helpers.sql  (DRAFT - 01_prerequisites.sql 다음에 적용)
-- 발주/업체 관련 정책에서 쓰는 SECURITY DEFINER 도우미 함수. 추가만 하며 기존 동작을 바꾸지 않는다.
-- (원래 06 안에 있던 것을 분리했다: 08 의 함수가 새 코드 배포 "전에" 필요하기 때문)
-- ============================================================================
-- 도우미 함수 (모두 SECURITY DEFINER, 정책에서 RLS 재귀 없이 안전하게 쓰기 위함)
-- ----------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select p.role from public.profiles p where p.id = auth.uid(); $$;

create or replace function public.owns_vendor(p_vendor uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.vendors v where v.id = p_vendor and v.user_id = auth.uid()); $$;

create or replace function public.vendor_is_approved(p_vendor uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.vendors v where v.id = p_vendor and v.status = 'approved'); $$;

-- 발주의 담당 팀장 본인 또는 그 팀장의 master
create or replace function public.is_order_leader(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.orders o
      left join public.partners pt on pt.user_id = o.team_leader_id
     where o.id = p_order
       and o.team_leader_id is not null
       and (o.team_leader_id = auth.uid() or pt.master_id = auth.uid())
  );
$$;

-- 발주를 볼 수 있는 사람: 관리자, 담당 팀장/그 master, 해당 발주의 업체 본인
create or replace function public.can_access_order(p_order uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_admin()
      or public.is_order_leader(p_order)
      or exists (
           select 1 from public.orders o
             join public.vendors v on v.id = o.vendor_id
            where o.id = p_order and v.user_id = auth.uid()
         );
$$;

-- 이 정책들은 모두 authenticated 에만 적용되므로 로그인 없는 사용자(anon)의 실행 권한은 필요 없다.
-- (anon 이 RPC 로 직접 호출해 업체 승인 여부 등을 알아내는 통로를 막는다)
revoke all on function public.my_role()                 from public, anon;
revoke all on function public.owns_vendor(uuid)         from public, anon;
revoke all on function public.vendor_is_approved(uuid)  from public, anon;
revoke all on function public.is_order_leader(uuid)     from public, anon;
revoke all on function public.can_access_order(uuid)    from public, anon;
grant execute on function public.my_role(), public.owns_vendor(uuid), public.vendor_is_approved(uuid),
                          public.is_order_leader(uuid), public.can_access_order(uuid)
  to authenticated;

-- ################ 05_close_commission_policies.sql ################
-- ============================================================================
-- 05_close_commission_policies.sql  (DRAFT - 다른 파일과 독립적으로 적용 가능)
-- 문제(운영 DB 확인, 2026-10-20): commission_policies 는 RLS 가 이미 켜져 있지만 정책이
--   - "Allow update access to all users"  UPDATE USING true   -> 공개 키만 있으면 누구나 수수료 정책 수정
--   - "Allow read access to all users"    SELECT USING true   -> 로그인 없이 누구나 요율 조회
--   - admin_full_access_commission_policies  ALL (관리자)      -> 이건 정상
-- 정산 금액(calculate_settlements)이 이 테이블 값에서 계산되므로 수정 가능 = 금액 조작 가능.
-- 코드 조사: 이 테이블은 관리자(CommissionSettings.jsx)가 읽고 쓰고, 팀장(MyWallet.jsx)이
-- 로그인 상태로 요율을 "읽기만" 한다. 로그인 없는 접근은 없다. 트리거(DEFINER)와 서버는 RLS 우회.
-- 결과: 수정은 관리자만, 읽기는 로그인한 사용자만.
-- 되돌리기: 이 파일 맨 아래 주석 참조.
-- ============================================================================
begin;

drop policy if exists "Allow update access to all users" on public.commission_policies;
drop policy if exists "Allow read access to all users"   on public.commission_policies;

-- 읽기: 로그인한 사용자(팀장 지갑이 요율을 표시). 관리자는 기존 ALL 정책이 이미 허용.
drop policy if exists commission_policies_select_authenticated on public.commission_policies;
create policy commission_policies_select_authenticated on public.commission_policies
  for select to authenticated
  using (true);

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용)
--  select policyname, cmd, roles from pg_policies
--   where schemaname='public' and tablename='commission_policies';
--  -> admin_full_access_commission_policies (ALL) 와 commission_policies_select_authenticated (SELECT) 만 남아야 한다.
-- 화면 확인: 관리자 로그인 -> 수수료 설정을 열고 값 저장이 된다 / 팀장 로그인 -> 내 지갑이 열린다.
--
-- 되돌리기 (원래 상태로):
--  begin;
--  drop policy if exists commission_policies_select_authenticated on public.commission_policies;
--  create policy "Allow read access to all users"   on public.commission_policies for select using (true);
--  create policy "Allow update access to all users" on public.commission_policies for update using (true);
--  commit;
-- ============================================================================

-- ################ 07_coupon_public_rpc.sql ################
-- ============================================================================
-- 07_coupon_public_rpc.sql  (DRAFT)
-- 목적: 로그인 없는 화면이 coupons 테이블을 select('*') 로 직접 읽던 것을
--       "쿠폰 코드를 알아야만 조회되고, 필요한 4개 필드만 돌려주는 함수"로 바꾼다.
--       (이 함수가 적용되고 화면 코드가 바뀐 뒤에야 coupons 에 RLS 를 켤 수 있다)
-- 쓰는 화면: CouponLanding.jsx(쿠폰 링크), Home.jsx(접수 전 쿠폰 확인)
-- 화면이 쓰는 필드(코드로 확인): amount, status('used' 여부), recipient_name, recipient_phone
--
-- !! 적용 순서 !!  이 SQL 을 "먼저" 적용한 뒤에 새 화면 코드를 배포한다.
--    (코드를 먼저 배포하면 쿠폰 링크 화면이 함수를 못 찾아 "유효하지 않은 쿠폰"으로 보인다.)
--    이 SQL 은 새 함수를 추가할 뿐이라 기존 화면 동작에는 영향이 없다.
-- ============================================================================
create or replace function public.get_coupon_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'amount',          c.amount,
           'status',          c.status,
           'recipient_name',  c.recipient_name,
           'recipient_phone', c.recipient_phone
         )
    from public.coupons c
   where c.code = upper(btrim(coalesce(p_code, '')))
   limit 1;
$$;

revoke all on function public.get_coupon_public(text) from public;
grant execute on function public.get_coupon_public(text) to anon, authenticated;

-- 확인 (읽기 전용, 테스트 코드로):
--   select public.get_coupon_public('존재하지않는코드');   -- null
--   select public.get_coupon_public('<발행된 쿠폰 코드>');  -- {"amount":..., "status":"issued", ...}
-- 되돌리기:
--   drop function if exists public.get_coupon_public(text);

-- ################ 08_delivery_rpc.sql ################
-- ============================================================================
-- 08_delivery_rpc.sql  (DRAFT - 추가만 하는 SQL, 새 코드 배포 "전에" 적용)
-- 목적: 배송기사 화면(/delivery/:orderId)이 로그인 없이 orders / deliveries / delivery_drivers /
--       vendors 를 직접 읽고 쓰던 것을 "토큰이 맞아야만 동작하는 함수 2개"로 바꾼다.
--   - order_delivery_tokens : 주문별 무작위 토큰(UUID 122비트)을 "별도 테이블"에 둔다.
--       orders 에 열을 추가하지 않는 이유: orders 의 정책이 09 를 적용하기 전까지 공개 읽기라서,
--       열로 두면 그 사이 누구나 모든 토큰을 읽을 수 있다. 이 테이블은 RLS 가 켜져 있고 정책이 없으며
--       anon/authenticated 의 테이블 권한도 회수해 PostgREST 로는 절대 읽히지 않는다(DEFINER 함수만 접근).
--   - get_order_delivery_token(주문ID)  : 권한 있는 로그인 사용자(업체 대표, 담당 팀장/master, 관리자)에게만
--                                         토큰을 돌려줌(없으면 만든다). 링크는 ?t=토큰 을 붙인다.
--   - get_delivery_order(주문ID, 토큰)  : 주문/장례/업체/팀장/활성 기사 목록을 한 번에 돌려줌
--   - complete_delivery(...)           : 배송 기록 + 주문 상태 + 알림 2건을 한 번에 처리(여러 번 눌러도 안전)
-- 이 파일은 기존 정책/동작을 바꾸지 않는다. (정책을 닫는 것은 09 파일, 새 코드 배포 후)
-- 선행 조건: 01 과 06 이 먼저 적용돼 있어야 한다(can_access_order 함수 사용).
-- 참고(코드 조사): 기존 알림 insert 는 notifications 에 없는 열(body, related_id)을 써서 한 번도
--   저장되지 않았다. 이 함수는 실제 열(user_id, type, title, message, is_read)에 저장한다.
-- ============================================================================
begin;

-- 1) 주문별 배송 토큰 테이블 (행은 필요할 때 get_order_delivery_token 이 만든다)
create table if not exists public.order_delivery_tokens (
  order_id   uuid primary key references public.orders(id) on delete cascade,
  token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table public.order_delivery_tokens enable row level security;   -- 정책을 만들지 않는다 = 아무도 직접 접근 못함
revoke all on table public.order_delivery_tokens from public, anon, authenticated;

-- 1-2) 링크를 만들 권한이 있는 사람에게만 토큰을 돌려준다(없으면 생성).
create or replace function public.get_order_delivery_token(p_order uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if p_order is null or auth.uid() is null or not public.can_access_order(p_order) then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  insert into public.order_delivery_tokens (order_id) values (p_order)
  on conflict (order_id) do nothing;

  select t.token into v_token from public.order_delivery_tokens t where t.order_id = p_order;
  return v_token;
end;
$$;

-- 2) 조회: 토큰이 맞는 주문만. 필요한 값만 돌려준다(업체 계좌/팀장 ID 등은 포함하지 않는다).
create or replace function public.get_delivery_order(p_order uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
begin
  if p_order is null or p_token is null or char_length(p_token) < 16 then
    return null;
  end if;

  select ord.* into o
    from public.orders ord
    join public.order_delivery_tokens t on t.order_id = ord.id
   where ord.id = p_order and t.token = p_token;
  if not found then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'id',            o.id,
      'order_number',  o.order_number,
      'status',        o.status,
      'delivery_note', o.delivery_note,
      'total_amount',  o.total_amount,
      'funeral_cases', (
        select jsonb_build_object(
                 'location',          c.location,
                 'deceased_name',     c.deceased_name,
                 'room_number',       c.room_number,
                 'encoffinment_time', c.encoffinment_time,
                 'funeral_end_time',  c.funeral_end_time)
          from public.funeral_cases c where c.id = o.case_id),
      'vendor', (
        select jsonb_build_object('id', v.id, 'company_name', v.company_name, 'phone', v.phone)
          from public.vendors v where v.id = o.vendor_id),
      'team_leader', (
        select jsonb_build_object('name', p.name, 'phone', p.phone)
          from public.profiles p where p.id = o.team_leader_id),
      'drivers', coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
          from public.delivery_drivers d
         where d.vendor_id = o.vendor_id and d.is_active), '[]'::jsonb)
    )
  );
end;
$$;

-- 3) 완료 처리
create or replace function public.complete_delivery(
  p_order     uuid,
  p_token     text,
  p_driver    uuid,
  p_photo_url text,
  p_notes     text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o            public.orders%rowtype;
  v_vendor_uid uuid;
  v_company    text;
  v_driver_id  uuid;
  v_driver     text := '배송기사';
  v_photo      text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_notes      text := nullif(btrim(coalesce(p_notes, '')), '');
  v_ref        text;
begin
  if p_order is null or p_token is null or char_length(p_token) < 16 then
    raise exception '유효하지 않은 배송 링크입니다.';
  end if;

  -- 같은 주문의 동시 완료 처리를 한 줄로 세운다.
  select ord.* into o
    from public.orders ord
   where ord.id = p_order
     and exists (select 1 from public.order_delivery_tokens t where t.order_id = ord.id and t.token = p_token)
     for update of ord;
  if not found then
    raise exception '유효하지 않은 배송 링크입니다.';
  end if;

  -- 이미 완료된 주문: 중복 알림/기록 없이 성공으로 돌려준다(새로고침/재전송 안전).
  if o.status = 'delivered' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if o.status = 'cancelled' then
    raise exception '취소된 주문입니다.';
  end if;

  if v_photo is not null and (char_length(v_photo) > 600 or v_photo !~ '^https://') then
    raise exception '사진 주소가 올바르지 않습니다.';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception '메모가 너무 깁니다.';
  end if;

  -- 기사는 이 주문의 업체에 속한 활성 기사만 허용
  if p_driver is not null then
    select d.id, d.name into v_driver_id, v_driver
      from public.delivery_drivers d
     where d.id = p_driver and d.vendor_id = o.vendor_id and d.is_active;
    if v_driver_id is null then
      raise exception '배송기사를 확인할 수 없습니다.';
    end if;
  else
    v_driver := '미확인 기사';
  end if;

  select v.user_id, v.company_name into v_vendor_uid, v_company
    from public.vendors v where v.id = o.vendor_id;

  insert into public.deliveries (order_id, driver_id, driver_name, status, delivery_photo_url, notes, completed_at)
  values (o.id, v_driver_id, v_driver, 'delivered', v_photo, v_notes, now());

  update public.orders set status = 'delivered', delivered_at = now() where id = o.id;

  -- 알림: 팀장, 업체 대표 (실제 notifications 열 사용)
  -- 알림은 부가 기능이다. 알림 저장이 실패해도 배송 완료 처리는 그대로 유지한다.
  v_ref := coalesce(o.order_number, left(o.id::text, 8));
  begin
    if o.team_leader_id is not null then
      insert into public.notifications (user_id, type, title, message, is_read, created_at)
      values (o.team_leader_id, 'delivery', '납품 완료 알림',
              '[' || v_ref || '] ' || coalesce(v_company, '업체') || '에서 장례식장으로 납품이 완료되었습니다. (배송완료: ' || v_driver || ')',
              false, now());
    end if;
    if v_vendor_uid is not null then
      insert into public.notifications (user_id, type, title, message, is_read, created_at)
      values (v_vendor_uid, 'delivery', '배송기사 납품 완료 확인',
              '[' || v_ref || '] 배송기사(' || v_driver || ')가 납품 완료 처리를 하였습니다.',
              false, now());
    end if;
  exception when others then
    raise warning 'complete_delivery: notification insert failed (%): %', sqlstate, sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'already', false);
end;
$$;

-- 로그인 없는 배송기사가 부르므로 anon 에게도 실행 권한. (토큰이 맞아야만 아무 일이 일어난다)
revoke all on function public.get_delivery_order(uuid, text) from public;
revoke all on function public.complete_delivery(uuid, text, uuid, text, text) from public;
revoke all on function public.get_order_delivery_token(uuid) from public, anon;
grant execute on function public.get_delivery_order(uuid, text) to anon, authenticated;
grant execute on function public.complete_delivery(uuid, text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_order_delivery_token(uuid) to authenticated;

commit;

-- 확인 (읽기 전용):
--   select public.get_delivery_order(gen_random_uuid(), 'x');             -- null
--   select relrowsecurity from pg_class where oid = 'public.order_delivery_tokens'::regclass;  -- true
-- 되돌리기:
--   drop function if exists public.get_delivery_order(uuid, text);
--   drop function if exists public.complete_delivery(uuid, text, uuid, text, text);
--   drop function if exists public.get_order_delivery_token(uuid);
--   drop table if exists public.order_delivery_tokens;

-- ################ 11_password_reset_request_rpc.sql ################
-- ============================================================================
-- 11_password_reset_request_rpc.sql  (DRAFT - 추가만 하는 SQL, 새 코드 배포 "전에" 적용)
-- 로그인 화면의 "비밀번호를 잊으셨나요? (초기화 요청)"이 로그인 없이 profiles 를 이름+전화로
-- 직접 조회하고(select) 직접 수정(update)하던 것을 서버 함수 하나로 바꾼다.
-- 결과값: 'ok' (요청 접수, 관리자 포함) | 'not_found'
-- 이름과 전화번호가 모두 일치해야 한다(앞뒤 공백은 무시). 대량 호출 방어는 서버 앞단(IP 제한)에서 한다.
-- 이 함수가 쓰이게 되면
-- profiles 에 RLS 를 켤 때 로그인 없는 직접 조회를 막을 수 있다.
-- ============================================================================
create or replace function public.request_password_reset(p_name text, p_phone text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_role text;
begin
  if p_name is null or p_phone is null
     or char_length(btrim(p_name)) < 1 or char_length(p_name) > 50
     or char_length(p_phone) < 3 or char_length(p_phone) > 40 then
    return 'not_found';
  end if;

  select p.id, p.role into v_id, v_role
    from public.profiles p
   where p.name = btrim(p_name) and p.phone = btrim(p_phone)
   limit 1;

  if v_id is null then
    return 'not_found';
  end if;

  -- 관리자 계정도 일반 계정과 같은 응답('ok')을 준다: 익명 호출자가 "이 이름/번호는 관리자"임을
  -- 알아내지 못하게 한다. 요청 표시가 남으면 다른 관리자가 승인 화면에서 임시 비밀번호를 발급한다.
  update public.profiles set password_reset_requested = true where id = v_id;
  return 'ok';
end;
$$;

revoke all on function public.request_password_reset(text, text) from public;
grant execute on function public.request_password_reset(text, text) to anon, authenticated;

-- 되돌리기: drop function if exists public.request_password_reset(text, text);

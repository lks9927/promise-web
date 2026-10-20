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

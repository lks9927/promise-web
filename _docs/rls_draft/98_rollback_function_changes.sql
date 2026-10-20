-- ============================================================================
-- 98_rollback_function_changes.sql  (DRAFT)
-- 01_prerequisites.sql 과 03_submit_emergency_case_v2.sql 로 바꾼 함수를 적용 전 상태로 되돌린다.
-- RLS 정책(02)을 되돌리는 것은 99_rollback_phase1_rls.sql.
-- 순서: 99 (RLS 끄기) -> 98 (함수 되돌리기).  is_admin / is_case_manager 는 남겨도 무해하다.
-- ============================================================================
begin;

-- 정산 계산 트리거 함수: 호출자 권한 실행(원래 상태)으로 복귀
alter function public.calculate_settlements() security invoker;
alter function public.calculate_settlements() reset search_path;

-- 장례 등록 함수: 적용 전 운영 DB 정의 그대로 (2026-10-20 pg_get_functiondef 로 확인한 내용)
create or replace function public.submit_emergency_case(
  p_name text,
  p_phone text,
  p_location text,
  p_package_name text,
  p_coupon_code text default null::text,
  p_dealer_id uuid default null::uuid
) returns uuid
language plpgsql
security definer
as $function$
declare
  v_customer_id uuid;
  v_case_id uuid;
  v_clean_phone text;
begin
  v_clean_phone := regexp_replace(p_phone, '[^0-9-]', '', 'g');

  -- 기존에 동일한 전화번호의 고객이 있는지 확인 (재방문 체크 구조 마련)
  select id into v_customer_id from profiles where phone = v_clean_phone and role = 'customer' limit 1;

  -- 없으면 신규 고객 프로필로 몰래 생성 (보안 유지)
  if v_customer_id is null then
    v_customer_id := gen_random_uuid();
    insert into profiles (id, name, phone, role)
    values (v_customer_id, p_name, v_clean_phone, 'customer');
  end if;

  -- 장례 접수 건 생성
  insert into funeral_cases (customer_id, dealer_id, location, package_name, status, funnel_type, coupon_code)
  values (
    v_customer_id,
    p_dealer_id,
    p_location,
    p_package_name,
    'requested',
    case when p_dealer_id is not null then 'partner_referral' else 'organic_search' end,
    p_coupon_code
  )
  returning id into v_case_id;

  -- 쿠폰이 있다면 연결 상태 업데이트 ('used' 로 변경)
  if p_coupon_code is not null and p_coupon_code != '' then
    update coupons set case_id = v_case_id, status = 'used' where code = p_coupon_code and status = 'active';
  end if;

  return v_case_id;
end;
$function$;

-- create or replace 는 기존 실행 권한(ACL)을 그대로 두므로, 03 에서 바꾼 권한을 원래대로 돌린다.
-- (Supabase 기본: PUBLIC 에 EXECUTE. 03 은 PUBLIC 을 막고 anon/authenticated 에만 줬다.)
grant execute on function public.submit_emergency_case(text, text, text, text, text, uuid) to public;

-- 01 에서 새로 만든 도우미 함수 삭제. 반드시 99_rollback_phase1_rls.sql(정책 삭제)을 먼저 실행한 뒤에 한다.
-- 정책이 아직 남아 있으면 "다른 객체가 의존한다"는 오류로 이 파일 전체가 취소된다.
drop function if exists public.is_case_manager(uuid);
drop function if exists public.is_admin();

commit;

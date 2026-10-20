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

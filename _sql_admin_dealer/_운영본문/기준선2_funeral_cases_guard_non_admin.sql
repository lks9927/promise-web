CREATE OR REPLACE FUNCTION public.funeral_cases_guard_non_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  k text;
begin
  if current_user = 'authenticated' and not public.is_admin() then
    foreach k in array array[
      'customer_id', 'dealer_id', 'coupon_code', 'funnel_type', 'is_private',
      'final_price', 'commission_amount', 'usage_fee', 'is_remitted', 'deducted_from_deposit',
      'additional_income_total', 'additional_income_rate', 'additional_income_settled',
      'master_rating', 'customer_rating',
      'current_bidder_id', 'bid_timeout_at', 'previous_bidders', 'current_bidder_pings'   -- 입찰 내부 값은 함수만 바꾼다
    ] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'funeral_cases: % 항목은 변경할 수 없습니다.', k using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$function$

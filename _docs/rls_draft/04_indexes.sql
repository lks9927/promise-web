-- ============================================================================
-- 04_indexes.sql  (DRAFT, 선택 적용 - 지금 데이터 양에서는 없어도 동작한다)
-- 속도 원칙(v2 가 느려졌던 교훈): RLS 정책과 새 등록 함수가 쓰는 열에 인덱스를 둔다.
-- 데이터가 수천 건을 넘기기 전에 적용하면 된다. 모두 IF NOT EXISTS 라서 여러 번 실행해도 안전.
-- 인덱스 생성은 짧게 테이블을 잠그지만 현재 규모(수십 행)에서는 문제없다.
-- ============================================================================

-- submit_emergency_case 가 쓰는 조회
create index if not exists funeral_cases_created_at_idx
  on public.funeral_cases (created_at);
create index if not exists funeral_cases_customer_created_idx
  on public.funeral_cases (customer_id, created_at desc);

-- 전화번호 숫자만 비교(함수 본문의 식과 정확히 같아야 인덱스가 쓰인다)
create index if not exists profiles_phone_digits_idx
  on public.profiles ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')));

-- RLS 정책이 필터링하는 열
create index if not exists settlements_recipient_id_idx   on public.settlements (recipient_id);
create index if not exists settlements_case_id_idx        on public.settlements (case_id);
create index if not exists deposits_partner_id_idx        on public.deposits (partner_id);
create index if not exists payout_requests_dealer_id_idx  on public.payout_requests (dealer_id);
create index if not exists bidding_history_leader_id_idx  on public.bidding_history (leader_id);
create index if not exists flower_orders_team_leader_idx  on public.flower_orders (team_leader_id);
create index if not exists partners_master_id_idx         on public.partners (master_id);

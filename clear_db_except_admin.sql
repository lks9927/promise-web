-- 1. 정산, 접수, 메시지 등 업무/금액 관련된 모든 하위 테이블 비우기 (CASCADE가 걸려있어 관련된 모든 세부 테이블도 함께 비워집니다)
TRUNCATE TABLE 
  public.flower_orders,
  public.funeral_progress_reports,
  public.settlements,
  public.bidding_history,
  public.notifications,
  public.coupons,
  public.funeral_cases
CASCADE;

-- 2. 최고관리자(admin) 계정만 남기고 나머지 유저 구동 데이터(딜러, 본부장, 팀장 등) 싹 다 삭제
DELETE FROM auth.users 
WHERE id IN (
  SELECT id FROM public.profiles 
  WHERE role NOT IN ('admin')
);

-- 3. 관리자 본인의 찌꺼기(파트너스/정산은행 정보) 등도 완전히 삭제하려면 이것도 실행 (본사 설정이므로 지우는게 깔끔함)
DELETE FROM public.partners;

-- 완료를 알리는 더미 쿼리
SELECT '데이터 초기화가 완료되었습니다. 관리자 계정만 남았습니다.' as process_result;

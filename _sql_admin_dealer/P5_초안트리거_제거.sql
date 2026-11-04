-- P5 옛 정산 초안 트리거 제거 (사장님 결정 A안, 2026-11-04)
-- 사건 접수(INSERT) 직후 고정 금액(750000/50000/200000)으로 정산 초안을 만들던 trg_auto_draft_settlements 를 없앤다.
-- 진행 시작(in_progress) 때 calculate_settlements 가 commission_policies 금액으로 정산을 만든다.
-- 확인: 화면 코드는 접수 직후 초안을 읽지 않는다(TeamLeaderDashboard 는 team_settling 때 draft→awaiting_payment 로 바꿀 뿐이고
--       SettlementManager 의 '정산예정' 단계는 '상담 완료 후 정산 레코드 생성' 기준).
-- 함수 auto_create_draft_settlements() 는 되돌리기 쉽게 남겨 둔다(트리거만 제거).
DROP TRIGGER IF EXISTS trg_auto_draft_settlements ON public.funeral_cases;

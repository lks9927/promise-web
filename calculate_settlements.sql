-- 정산 내역 자동 생성 함수
CREATE OR REPLACE FUNCTION calculate_settlements() RETURNS TRIGGER AS $$
DECLARE
    -- ID 변수
    v_dealer_id UUID;
    v_master_dealer_id UUID;
    v_team_leader_id UUID;
    v_master_leader_id UUID;
    
    -- 금액 변수 (추후 system_config 테이블에서 가져오거나 상품별로 다르게 책정 가능)
    -- 현재는 기본값으로 설정하고, 관리자가 '수정'하는 방식
    v_dealer_comm INTEGER := 300000;      -- 일반 딜러 영업수수료
    v_dealer_override INTEGER := 100000;  -- 마스터 딜러 오버라이딩
    v_leader_override INTEGER := 50000;   -- 마스터 팀장 오버라이딩
    
BEGIN
    -- 상태가 'team_settling' (장례종료/팀장정산)으로 변경될 때만 실행
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'team_settling' THEN
        
        -- 1. 역할 및 상위자(Master) 식별
        v_dealer_id := NEW.dealer_id;
        v_team_leader_id := NEW.team_leader_id;
        
        -- 딜러의 마스터 찾기
        IF v_dealer_id IS NOT NULL THEN
            SELECT master_id INTO v_master_dealer_id FROM partners WHERE user_id = v_dealer_id;
        END IF;

        -- 팀장의 마스터 찾기
        IF v_team_leader_id IS NOT NULL THEN
            SELECT master_id INTO v_master_leader_id FROM partners WHERE user_id = v_team_leader_id;
        END IF;

        -- 2. 정산 내역 생성 (모두 'pending' 상태로 생성하여 관리자 확인 유도)
        
        -- A. [입금] 팀장 -> 본사 (사용료 송금)
        -- 사용료(usage_fee)가 0보다 크다면 송금 대기 내역 생성
        -- (현재 usage_fee 로직이 없으므로, 추후 업데이트 시 작동하도록 예외처리)
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status)
            VALUES (NEW.id, v_team_leader_id, NEW.usage_fee, 'usage_fee_remittance', 'pending');
        END IF;

        -- B. [출금] 본사 -> 일반 딜러 (영업 수수료)
        IF v_dealer_id IS NOT NULL THEN
             INSERT INTO settlements (case_id, recipient_id, amount, type, status)
             VALUES (NEW.id, v_dealer_id, v_dealer_comm, 'dealer_commission', 'pending');
             
             -- C. [출금] 본사 -> 마스터 딜러 (오버라이딩)
             -- 딜러에게 마스터가 있고, 그 마스터가 본인이 아닐 때
             IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                INSERT INTO settlements (case_id, recipient_id, amount, type, status)
                VALUES (NEW.id, v_master_dealer_id, v_dealer_override, 'dealer_override', 'pending');
             END IF;
        END IF;

        -- D. [출금] 본사 -> 마스터 팀장 (오버라이딩)
        -- 팀장에게 마스터가 있고, 그 마스터가 본인이 아닐 때
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status)
            VALUES (NEW.id, v_master_leader_id, v_leader_override, 'leader_override', 'pending');
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (업데이트 시 작동)
DROP TRIGGER IF EXISTS trigger_calculate_settlements ON funeral_cases;
CREATE TRIGGER trigger_calculate_settlements
AFTER UPDATE ON funeral_cases
FOR EACH ROW
EXECUTE FUNCTION calculate_settlements();

-- ============================================================
-- 🏛️ 정산 회계 시스템 2.0 업그레이드 SQL
-- 실행 위치: Supabase SQL Editor
-- ============================================================

-- 1. settlements 테이블에 회계 컬럼 추가
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'none';
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS base_amount integer DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_amount integer DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS net_amount integer DEFAULT 0;

-- 2. 기존 데이터 마이그레이션 (amount → base_amount, net_amount로 복사)
UPDATE settlements 
SET base_amount = amount, 
    net_amount = amount,
    tax_type = CASE 
        WHEN type = 'usage_fee_remittance' THEN 'vat_10'
        WHEN type IN ('dealer_commission', 'dealer_override', 'leader_override') THEN 'withholding_33'
        ELSE 'none'
    END
WHERE base_amount = 0 OR base_amount IS NULL;

-- 3. vendors 테이블에 세금 유형 컬럼 추가
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'vat_10';
-- 기본값은 부가세(vat_10). 면세 업체(꽃집)는 관리자가 승인 시 'tax_free'로 변경.

-- 4. 정산 트리거 함수 업그레이드 (세금 자동 계산 포함)
CREATE OR REPLACE FUNCTION calculate_settlements() RETURNS TRIGGER AS $$
DECLARE
    v_dealer_id UUID;
    v_master_dealer_id UUID;
    v_team_leader_id UUID;
    v_master_leader_id UUID;
    v_customer_id UUID;
    
    -- 정책 변수
    v_dealer_comm INTEGER;
    v_dealer_override INTEGER;
    v_leader_override INTEGER;
    v_customer_payback INTEGER;
    
    -- 세금 계산용 변수
    v_tax_amt INTEGER;
    v_net_amt INTEGER;
    
BEGIN
    -- 1. 수수료 정책 가져오기
    SELECT 
        sales_dealer_regular, 
        sales_dealer_master_override, 
        exec_leader_master_override,
        customer_payback 
    INTO 
        v_dealer_comm, 
        v_dealer_override, 
        v_leader_override,
        v_customer_payback
    FROM commission_policies WHERE id = 1;

    -- 기본값 처리
    v_dealer_comm := COALESCE(v_dealer_comm, 300000);
    v_dealer_override := COALESCE(v_dealer_override, 100000);
    v_leader_override := COALESCE(v_leader_override, 50000);
    v_customer_payback := COALESCE(v_customer_payback, 100000);

    -- 상태가 'team_settling' (장례종료/팀장정산)으로 변경될 때만 실행
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'team_settling' THEN
        
        v_dealer_id := NEW.dealer_id;
        v_team_leader_id := NEW.team_leader_id;
        v_customer_id := NEW.customer_id;
        
        -- 딜러의 마스터 찾기
        IF v_dealer_id IS NOT NULL THEN
            SELECT master_id INTO v_master_dealer_id FROM partners WHERE user_id = v_dealer_id;
        END IF;

        -- 팀장의 마스터 찾기
        IF v_team_leader_id IS NOT NULL THEN
            SELECT master_id INTO v_master_leader_id FROM partners WHERE user_id = v_team_leader_id;
        END IF;

        -- ═══════════════════════════════════════════
        -- A. [입금] 팀장 → 본사 (사용료 + 부가세 10%)
        -- ═══════════════════════════════════════════
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            v_tax_amt := ROUND(NEW.usage_fee * 0.10);
            v_net_amt := NEW.usage_fee + v_tax_amt;
            
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_team_leader_id, v_net_amt, 'usage_fee_remittance', 'pending', 'vat_10', NEW.usage_fee, v_tax_amt, v_net_amt);
        END IF;

        -- ═══════════════════════════════════════════
        -- B. [출금] 본사 → 딜러 (수수료 - 원천징수 3.3%)
        -- ═══════════════════════════════════════════
        IF v_dealer_id IS NOT NULL THEN
            v_tax_amt := ROUND(v_dealer_comm * 0.033);
            v_net_amt := v_dealer_comm - v_tax_amt;
            
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_dealer_id, v_net_amt, 'dealer_commission', 'pending', 'withholding_33', v_dealer_comm, v_tax_amt, v_net_amt);
              
            -- C. [출금] 본사 → 마스터 딜러 (오버라이딩)
            IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                v_tax_amt := ROUND(v_dealer_override * 0.033);
                v_net_amt := v_dealer_override - v_tax_amt;
                
                INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
                VALUES (NEW.id, v_master_dealer_id, v_net_amt, 'dealer_override', 'pending', 'withholding_33', v_dealer_override, v_tax_amt, v_net_amt);
            END IF;
        END IF;

        -- ═══════════════════════════════════════════
        -- D. [출금] 본사 → 마스터 팀장 (오버라이딩)
        -- ═══════════════════════════════════════════
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            v_tax_amt := ROUND(v_leader_override * 0.033);
            v_net_amt := v_leader_override - v_tax_amt;
            
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_master_leader_id, v_net_amt, 'leader_override', 'pending', 'withholding_33', v_leader_override, v_tax_amt, v_net_amt);
        END IF;

        -- ═══════════════════════════════════════════
        -- E. [출금] 본사 → 고객 (쿠폰 사용 시 캐시백 10만)
        -- ═══════════════════════════════════════════
        IF NEW.coupon_code IS NOT NULL AND NEW.coupon_code != '' AND v_customer_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_customer_id, v_customer_payback, 'customer_cashback', 'pending', 'none', v_customer_payback, 0, v_customer_payback);
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재생성
DROP TRIGGER IF EXISTS trigger_calculate_settlements ON funeral_cases;
CREATE TRIGGER trigger_calculate_settlements
AFTER UPDATE ON funeral_cases
FOR EACH ROW
EXECUTE FUNCTION calculate_settlements();

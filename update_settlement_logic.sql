-- ============================================================
-- 정산 트리거 업데이트 SQL (세금 및 소수점 문제 해결)
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_settlements() RETURNS TRIGGER AS $$
DECLARE
    v_dealer_id UUID;
    v_master_dealer_id UUID;
    v_team_leader_id UUID;
    v_master_leader_id UUID;
    v_customer_id UUID;
    v_coupon_issued_by UUID;  -- 쿠폰 발행 딜러 ID

    v_dealer_comm INTEGER;
    v_dealer_override INTEGER;
    v_leader_override INTEGER;
    v_customer_payback INTEGER;

    v_tax_amt INTEGER;
    v_net_amt INTEGER;
BEGIN
    -- 상태가 'team_settling'으로 변경될 때만 실행
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'team_settling' THEN

        -- 수수료 정책 로드 (id=1)
        SELECT
            COALESCE(sales_dealer_regular, 200000),
            COALESCE(sales_dealer_master_override, 50000),
            COALESCE(exec_leader_master_override, 50000),
            COALESCE(customer_payback, 100000)
        INTO
            v_dealer_comm,
            v_dealer_override,
            v_leader_override,
            v_customer_payback
        FROM commission_policies
        WHERE id = 1
        LIMIT 1;

        -- 정책이 없을 때 기본값 지정
        v_dealer_comm      := COALESCE(v_dealer_comm, 200000);
        v_dealer_override  := COALESCE(v_dealer_override, 50000);
        v_leader_override  := COALESCE(v_leader_override, 50000);
        v_customer_payback := COALESCE(v_customer_payback, 100000);

        v_dealer_id       := NEW.dealer_id;
        v_team_leader_id  := NEW.team_leader_id;
        v_customer_id     := NEW.customer_id;

        -- 쿠폰으로 접수한 경우: dealer_id가 없어도 coupons.issued_by에서 딜러 자동 조회
        IF v_dealer_id IS NULL AND NEW.coupon_code IS NOT NULL THEN
            SELECT issued_by INTO v_coupon_issued_by
            FROM coupons
            WHERE code = NEW.coupon_code
            LIMIT 1;
            
            -- 관리자(admin/head)가 발행한 쿠폰이 아닌 경우만 딜러로 인정
            IF v_coupon_issued_by IS NOT NULL THEN
                SELECT id INTO v_coupon_issued_by
                FROM profiles
                WHERE id = v_coupon_issued_by
                  AND role NOT IN ('admin');
                v_dealer_id := v_coupon_issued_by;
            END IF;
        END IF;

        -- 딜러의 마스터 찾기
        IF v_dealer_id IS NOT NULL THEN
            SELECT master_id INTO v_master_dealer_id
            FROM partners WHERE user_id = v_dealer_id;
        END IF;

        -- 팀장의 마스터 찾기
        IF v_team_leader_id IS NOT NULL THEN
            SELECT master_id INTO v_master_leader_id
            FROM partners WHERE user_id = v_team_leader_id;
        END IF;

        -- ═══ A. 팀장 → 본사 사용료 (사업자: VAT 10% 발생) ═══
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            v_tax_amt := ROUND(NEW.usage_fee * 0.10)::INTEGER;
            v_net_amt := NEW.usage_fee + v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_team_leader_id, v_net_amt, 'usage_fee_remittance', 'pending', 'vat_10', NEW.usage_fee, v_tax_amt, v_net_amt);
        END IF;

        -- ═══ B. 본사 → 딜러 수수료 (비사업자 원천징수 3.3%) ═══
        IF v_dealer_id IS NOT NULL THEN
            v_tax_amt := ROUND(v_dealer_comm * 0.033)::INTEGER;
            v_net_amt := v_dealer_comm - v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_dealer_id, v_net_amt, 'dealer_commission', 'pending', 'withholding_33', v_dealer_comm, v_tax_amt, v_net_amt);

            -- ═══ C. 본사 → 마스터딜러 관리수수료 (비사업자 원천징수 3.3%) ═══
            IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                v_tax_amt := ROUND(v_dealer_override * 0.033)::INTEGER;
                v_net_amt := v_dealer_override - v_tax_amt;
                INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
                VALUES (NEW.id, v_master_dealer_id, v_net_amt, 'dealer_override', 'pending', 'withholding_33', v_dealer_override, v_tax_amt, v_net_amt);
            END IF;
        END IF;

        -- ═══ D. 본사 → 마스터팀장 관리수수료 (사업자 세금계산서 발행: VAT +10%) ═══
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            v_tax_amt := ROUND(v_leader_override * 0.10)::INTEGER;
            v_net_amt := v_leader_override + v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_master_leader_id, v_net_amt, 'leader_override', 'pending', 'vat_10', v_leader_override, v_tax_amt, v_net_amt);
        END IF;

        -- ═══ E. 본사 → 고객 캐시백 (쿠폰 사용 시) ═══
        IF NEW.coupon_code IS NOT NULL AND TRIM(NEW.coupon_code) != '' AND v_customer_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_customer_id, v_customer_payback, 'customer_cashback', 'pending', 'none', v_customer_payback, 0, v_customer_payback);
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재등록
DROP TRIGGER IF EXISTS trigger_calculate_settlements ON funeral_cases;
CREATE TRIGGER trigger_calculate_settlements
    AFTER UPDATE ON funeral_cases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_settlements();

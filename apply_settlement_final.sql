-- ============================================================
-- 🏛️ 정산 시스템 최종 적용 SQL (2024)
-- upgrade_accounting.sql + fix_settlement_trigger.sql 통합본
-- Supabase SQL Editor에서 이 파일 하나만 실행하세요
-- ============================================================

-- ═══ STEP 1. settlements 테이블 컬럼 추가 ═══
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'none';
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS base_amount integer DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tax_amount integer DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS net_amount integer DEFAULT 0;

-- ═══ STEP 2. vendors 테이블 세금 유형 컬럼 추가 ═══
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'vat_10';

-- ═══ STEP 3. commission_policies 확인 및 기본값 보정 ═══
INSERT INTO commission_policies (
    id, base_margin, customer_payback,
    sales_dealer_regular, sales_dealer_master_override, sales_dealer_master_direct,
    sales_leader_regular, sales_leader_master_direct,
    exec_leader_master_override, exec_leader_master_direct, is_percentage
) VALUES (
    1, 1000000, 100000,
    200000, 50000, 200000,
    700000, 700000,
    50000, 0, false
)
ON CONFLICT (id) DO UPDATE SET
    customer_payback              = EXCLUDED.customer_payback,
    sales_dealer_regular          = EXCLUDED.sales_dealer_regular,
    sales_dealer_master_override  = EXCLUDED.sales_dealer_master_override,
    exec_leader_master_override   = EXCLUDED.exec_leader_master_override,
    updated_at = now();

-- ═══ STEP 4. 정산 트리거 함수 (최신 버전) ═══
-- 변경 사항:
--   - coupon.issued_by 자동 조회 (딜러쿠폰으로 고객 직접 접수 시 딜러 수수료 지급)
--   - 마스터팀장 관리수수료: 사업자 → 원천징수 없음 (tax_type=none)
--   - 고객 캐시백: 세금 없음
--   - COALESCE 방어코드로 commission_policies null 방지
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

        -- 정책이 없을 때 기본값
        v_dealer_comm      := COALESCE(v_dealer_comm,      200000);
        v_dealer_override  := COALESCE(v_dealer_override,   50000);
        v_leader_override  := COALESCE(v_leader_override,   50000);
        v_customer_payback := COALESCE(v_customer_payback, 100000);

        v_dealer_id      := NEW.dealer_id;
        v_team_leader_id := NEW.team_leader_id;
        v_customer_id    := NEW.customer_id;

        -- ── 딜러쿠폰으로 고객이 직접 접수한 경우 ──
        -- dealer_id가 없어도 coupons.issued_by에서 딜러 자동 조회
        -- (딜러가 쿠폰을 고객에게 주고, 고객이 사이트에서 직접 등록한 경우)
        IF v_dealer_id IS NULL AND NEW.coupon_code IS NOT NULL THEN
            SELECT issued_by INTO v_coupon_issued_by
            FROM coupons
            WHERE code = NEW.coupon_code
            LIMIT 1;
            -- 관리자가 발행한 쿠폰이 아닌 경우만 딜러로 인정
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

        -- ═══ A. 팀장 → 본사 사용료 (usage_fee > 0 일 때만) ═══
        -- 팀장은 사업자 → VAT 10% 추가
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            v_tax_amt := ROUND(NEW.usage_fee * 0.10);
            v_net_amt := NEW.usage_fee + v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_team_leader_id, v_net_amt, 'usage_fee_remittance', 'pending', 'vat_10', NEW.usage_fee, v_tax_amt, v_net_amt);
        END IF;

        -- ═══ B. 본사 → 딜러 수수료 ═══
        -- 딜러: 사업자 여부에 따라 다름 (현재는 일괄 withholding_33 적용, 추후 개인별 설정 가능)
        IF v_dealer_id IS NOT NULL THEN
            v_tax_amt := ROUND(v_dealer_comm * 0.033);
            v_net_amt := v_dealer_comm - v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_dealer_id, v_net_amt, 'dealer_commission', 'pending', 'withholding_33', v_dealer_comm, v_tax_amt, v_net_amt);

            -- ═══ C. 본사 → 마스터딜러 관리수수료 ═══
            IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                v_tax_amt := ROUND(v_dealer_override * 0.033);
                v_net_amt := v_dealer_override - v_tax_amt;
                INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
                VALUES (NEW.id, v_master_dealer_id, v_net_amt, 'dealer_override', 'pending', 'withholding_33', v_dealer_override, v_tax_amt, v_net_amt);
            END IF;
        END IF;

        -- ═══ D. 본사 → 마스터팀장 관리수수료 ═══
        -- 팀장은 사업자 등록자 → 원천징수 없음, 전액 지급
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_master_leader_id, v_leader_override, 'leader_override', 'pending', 'none', v_leader_override, 0, v_leader_override);
        END IF;

        -- ═══ E. 본사 → 고객 캐시백 (쿠폰 사용 시) ═══
        -- 쿠폰 할인 처리 → 세금 없음
        IF NEW.coupon_code IS NOT NULL AND TRIM(NEW.coupon_code) != '' AND v_customer_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_customer_id, v_customer_payback, 'customer_cashback', 'pending', 'none', v_customer_payback, 0, v_customer_payback);
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══ STEP 5. 트리거 재등록 ═══
DROP TRIGGER IF EXISTS trigger_calculate_settlements ON funeral_cases;
CREATE TRIGGER trigger_calculate_settlements
    AFTER UPDATE ON funeral_cases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_settlements();

-- ═══ 완료 확인 ═══
SELECT
    'OK: 완료' AS result,
    (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'settlements' AND column_name = 'tax_type') AS tax_type_column_exists,
    (SELECT count(*) FROM commission_policies WHERE id = 1) AS policy_exists;

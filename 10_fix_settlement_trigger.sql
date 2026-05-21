-- 사용료 부가세 계산 수정: 포함가 기준으로 역산
CREATE OR REPLACE FUNCTION calculate_settlements() RETURNS TRIGGER AS $$
DECLARE
    v_dealer_id UUID;
    v_master_dealer_id UUID;
    v_team_leader_id UUID;
    v_master_leader_id UUID;
    v_customer_id UUID;
    v_coupon_issued_by UUID;

    v_dealer_comm INTEGER;
    v_dealer_override INTEGER;
    v_leader_override INTEGER;
    v_customer_payback INTEGER;

    v_tax_amt INTEGER;
    v_net_amt INTEGER;
    v_base_amt INTEGER;
    v_policy_id INTEGER;

BEGIN
    -- 상담 완료(in_progress) 시점: draft 정산 레코드 미리 생성
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'in_progress' THEN

        -- 패키지명에 따라 정책 ID 설정
        IF NEW.package_name = '고급형' THEN
            v_policy_id := 2;
        ELSIF NEW.package_name = '무빈소' THEN
            v_policy_id := 3;
        ELSE
            v_policy_id := 1;
        END IF;

        -- 수수료 정책 로드
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
        WHERE id = v_policy_id
        LIMIT 1;

        v_dealer_comm      := COALESCE(v_dealer_comm,      200000);
        v_dealer_override  := COALESCE(v_dealer_override,   50000);
        v_leader_override  := COALESCE(v_leader_override,   50000);
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

        -- A. 팀장 → 본사 사용료 (usage_fee는 부가세 포함가)
        IF NEW.usage_fee > 0 AND v_team_leader_id IS NOT NULL THEN
            v_base_amt := ROUND(NEW.usage_fee / 1.1);
            v_tax_amt := NEW.usage_fee - v_base_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_team_leader_id, NEW.usage_fee, 'usage_fee_remittance', 'draft', 'vat_10', v_base_amt, v_tax_amt, NEW.usage_fee);
        END IF;

        -- B. 본사 → 딜러 수수료
        IF v_dealer_id IS NOT NULL THEN
            v_tax_amt := ROUND(v_dealer_comm * 0.033);
            v_net_amt := v_dealer_comm - v_tax_amt;
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_dealer_id, v_net_amt, 'dealer_commission', 'draft', 'withholding_33', v_dealer_comm, v_tax_amt, v_net_amt);

            -- C. 본사 → 마스터딜러 관리수수료
            IF v_master_dealer_id IS NOT NULL AND v_master_dealer_id != v_dealer_id THEN
                v_tax_amt := ROUND(v_dealer_override * 0.033);
                v_net_amt := v_dealer_override - v_tax_amt;
                INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
                VALUES (NEW.id, v_master_dealer_id, v_net_amt, 'dealer_override', 'draft', 'withholding_33', v_dealer_override, v_tax_amt, v_net_amt);
            END IF;
        END IF;

        -- D. 본사 → 마스터팀장 관리수수료
        IF v_master_leader_id IS NOT NULL AND v_master_leader_id != v_team_leader_id THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_master_leader_id, v_leader_override, 'leader_override', 'draft', 'none', v_leader_override, 0, v_leader_override);
        END IF;

        -- E. 본사 → 고객 캐시백 (쿠폰 사용 시)
        IF NEW.coupon_code IS NOT NULL AND TRIM(NEW.coupon_code) != '' AND v_customer_id IS NOT NULL THEN
            INSERT INTO settlements (case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount)
            VALUES (NEW.id, v_customer_id, v_customer_payback, 'customer_cashback', 'draft', 'none', v_customer_payback, 0, v_customer_payback);
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SELECT 'OK: 사용료 부가세 포함가 역산으로 수정 완료' AS result;

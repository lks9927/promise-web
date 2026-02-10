-- 테스트용 대량 데이터 생성 (각 역할별 10명씩)
-- 이 스크립트를 실행하면 기존 데이터를 유지하면서 새로운 데이터가 추가됩니다.

-- 1. 팀장 (Leader) 10명 생성
DO $$
DECLARE
    i INT;
    new_id UUID;
BEGIN
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'leader'||i||'@test.com', 'leader', '김팀장'||i, '010-1000-'||LPAD(i::text, 4, '0'));
        
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '강남구', 'A', 'approved', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15'); -- 마스터 ID 연결
    END LOOP;
END $$;

-- 2. 상례사 (Assistant) 10명 생성
DO $$
DECLARE
    i INT;
    new_id UUID;
BEGIN
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'assistant'||i||'@test.com', 'assistant', '이상례'||i, '010-2000-'||LPAD(i::text, 4, '0'));
        
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '서초구', 'B', 'approved', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15');
    END LOOP;
END $$;

-- 3. 딜러 (Dealer) 10명 생성
DO $$
DECLARE
    i INT;
    new_id UUID;
BEGIN
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'dealer'||i||'@test.com', 'dealer', '박딜러'||i, '010-3000-'||LPAD(i::text, 4, '0'));
        
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '송파구', 'C', 'approved', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15');
    END LOOP;
END $$;

-- 4. 고객 (Customer) 10명 및 해당 고객들의 장례 접수 내역 생성
DO $$
DECLARE
    i INT;
    cust_id UUID;
    case_status text;
BEGIN
    FOR i IN 1..10 LOOP
        cust_id := uuid_generate_v4();
        -- 고객 프로필
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (cust_id, 'customer'||i||'@test.com', 'customer', '최고객'||i, '010-4000-'||LPAD(i::text, 4, '0'));
        
        -- 랜덤 상태 설정
        IF i <= 3 THEN case_status := 'requested';
        ELSIF i <= 6 THEN case_status := 'in_progress';
        ELSE case_status := 'completed';
        END IF;

        -- 장례 접수 내역
        INSERT INTO funeral_cases (customer_id, status, location, package_name, final_price, master_rating, customer_rating)
        VALUES (cust_id, case_status, '서울대학병원 장례식장', '프리미엄 3일장', 3900000, 
                CASE WHEN case_status = 'completed' THEN 5 ELSE NULL END,
                CASE WHEN case_status = 'completed' THEN 5 ELSE NULL END
        );
    END LOOP;
END $$;

-- [최종_진짜_최종_해결.sql]
-- 빠진 컬럼(평가 점수)을 추가하고 데이터를 다시 넣습니다.

-- 1. funeral_cases 테이블에 평가 점수 컬럼 추가
ALTER TABLE funeral_cases 
ADD COLUMN IF NOT EXISTS master_rating integer check (master_rating between 1 and 5);

ALTER TABLE funeral_cases 
ADD COLUMN IF NOT EXISTS customer_rating integer check (customer_rating between 1 and 5);

-- 2. profiles 테이블 역할 제약조건 확실히 풀기
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'master', 'leader', 'assistant', 'dealer', 'customer'));

-- 3. 데이터 생성 (이제 진짜 됩니다!)
DO $$
DECLARE
    i INT;
    new_id UUID;
    cust_id UUID;
    case_status text;
    master_uuid UUID := 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15';
BEGIN
    -- (1) 팀장 10명
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'leader'||i||'@test.com', 'leader', '김팀장'||i, '010-1000-'||LPAD(i::text, 4, '0'));
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '강남구', 'A', 'approved', master_uuid);
    END LOOP;

    -- (2) 상례사 10명
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'assistant'||i||'@test.com', 'assistant', '이상례'||i, '010-2000-'||LPAD(i::text, 4, '0'));
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '서초구', 'B', 'approved', master_uuid);
    END LOOP;

    -- (3) 딜러 10명
    FOR i IN 1..10 LOOP
        new_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (new_id, 'dealer'||i||'@test.com', 'dealer', '박딜러'||i, '010-3000-'||LPAD(i::text, 4, '0'));
        INSERT INTO partners (user_id, region, grade, status, master_id)
        VALUES (new_id, '송파구', 'C', 'approved', master_uuid);
    END LOOP;

    -- (4) 고객 10명 & 장례 접수
    FOR i IN 1..10 LOOP
        cust_id := uuid_generate_v4();
        INSERT INTO profiles (id, email, role, name, phone)
        VALUES (cust_id, 'customer'||i||'@test.com', 'customer', '최고객'||i, '010-4000-'||LPAD(i::text, 4, '0'));
        
        IF i <= 3 THEN case_status := 'requested';
        ELSIF i <= 6 THEN case_status := 'in_progress';
        ELSE case_status := 'completed';
        END IF;

        INSERT INTO funeral_cases (customer_id, status, location, package_name, final_price, master_rating, customer_rating)
        VALUES (cust_id, case_status, '서울대학병원 장례식장', '프리미엄 3일장', 3900000, 
                CASE WHEN case_status = 'completed' THEN 5 ELSE NULL END,
                CASE WHEN case_status = 'completed' THEN 5 ELSE NULL END
        );
    END LOOP;
END $$;

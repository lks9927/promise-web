-- 보안 및 인증 전면 개편 마이그레이션 스크립트 (V1 Security Hotfix + V2 Preparedness)

-- 1. pgcrypto 확장 활성화 (비밀번호 암호화용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. profiles 에 있는 멤버들을 auth.users (공식 인증 테이블) 로 복제
-- (기존에 로컬스토리지용으로 넣었던 계정들을 실제 로그인 가능하게 만듦)
DO $$
DECLARE
    r RECORD;
    v_email text;
    v_password text;
    v_encrypted text;
BEGIN
    FOR r IN SELECT * FROM profiles WHERE role IN ('admin', 'master', 'leader', 'dealer', 'vendor') LOOP
        -- 이메일이 없는 경우 전화번호를 이용해 가짜 이메일 생성 (영어/숫자 허용)
        v_email := COALESCE(r.email, regexp_replace(r.phone, '[^0-9a-zA-Z]', '', 'g') || '@promise10.com');
        -- 비밀번호가 없는 경우 1234 로 통일 (이후 로그인 시 변경 권장)
        v_password := COALESCE(r.password, '1234');
        -- 비밀번호 해시
        v_encrypted := crypt(v_password, gen_salt('bf'));

        -- auth.users 에 이미 존재하는지 확인
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = r.id) THEN
            INSERT INTO auth.users (
                id,
                instance_id,
                aud,
                role,
                email,
                encrypted_password,
                email_confirmed_at,
                created_at,
                updated_at,
                confirmation_token,
                recovery_token
            ) VALUES (
                r.id,
                '00000000-0000-0000-0000-000000000000',
                'authenticated',
                'authenticated',
                v_email,
                v_encrypted,
                now(),
                now(),
                now(),
                '',
                ''
            );
        END IF;
    END LOOP;
END $$;

-- 3. 긴급 접수용 보안 함수 (RPC) - 로그인 없이 접수 + 기존 고객(전화번호) 연결
CREATE OR REPLACE FUNCTION submit_emergency_case(
    p_name text,
    p_phone text,
    p_location text,
    p_package_name text,
    p_coupon_code text DEFAULT NULL,
    p_dealer_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_customer_id uuid;
    v_case_id uuid;
    v_clean_phone text;
BEGIN
    v_clean_phone := regexp_replace(p_phone, '[^0-9-]', '', 'g');

    -- 기존에 동일한 전화번호의 고객이 있는지 확인 (재방문 체크 구조 마련)
    SELECT id INTO v_customer_id FROM profiles WHERE phone = v_clean_phone AND role = 'customer' LIMIT 1;
    
    -- 없으면 신규 고객 프로필로 몰래 생성 (보안 유지)
    IF v_customer_id IS NULL THEN
        v_customer_id := gen_random_uuid();
        INSERT INTO profiles (id, name, phone, role) 
        VALUES (v_customer_id, p_name, v_clean_phone, 'customer');
    END IF;

    -- 장례 접수 건 생성
    INSERT INTO funeral_cases (customer_id, dealer_id, location, package_name, status, funnel_type, coupon_code)
    VALUES (
        v_customer_id, 
        p_dealer_id, 
        p_location, 
        p_package_name, 
        'requested', 
        CASE WHEN p_dealer_id IS NOT NULL THEN 'partner_referral' ELSE 'organic_search' END, 
        p_coupon_code
    )
    RETURNING id INTO v_case_id;

    -- 쿠폰이 있다면 연결 상태 업데이트 ('used' 로 변경)
    IF p_coupon_code IS NOT NULL AND p_coupon_code != '' THEN
        UPDATE coupons SET case_id = v_case_id, status = 'used' WHERE code = p_coupon_code AND status = 'active';
    END IF;

    RETURN v_case_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 롤링 현황판용 안전 노출 함수 (RPC) - 민감정보 가림 처리
CREATE OR REPLACE FUNCTION get_public_rolling_cases()
RETURNS TABLE (
    id uuid,
    location text,
    created_at timestamp with time zone,
    masked_name text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id, 
        c.location, 
        c.created_at,
        CASE 
            WHEN p.name IS NULL OR p.name = '' THEN '익명'
            WHEN length(p.name) <= 2 THEN substr(p.name, 1, 1) || '*'
            ELSE substr(p.name, 1, 1) || repeat('*', length(p.name)-2) || substr(p.name, length(p.name), 1)
        END AS masked_name
    FROM funeral_cases c
    LEFT JOIN profiles p ON c.customer_id = p.id
    WHERE c.status = 'in_progress'
    ORDER BY c.created_at DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 취약했던 기존 보안 룰(RLS) 파기 및 재설정
-- (이제 익명 해커가 select 로 남의 개인정보를 빼갈 수 없습니다)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Public funeral cases viewable" ON funeral_cases;

-- "본인" 또는 "로그인 한 본사 파트너(authenticated)" 만 정보를 조회할 수 있게 설정
CREATE POLICY "Profiles viewable by authenticated or self" 
ON profiles FOR SELECT 
USING (
    auth.role() = 'authenticated' OR auth.uid() = id
);

CREATE POLICY "Cases viewable by authenticated users" 
ON funeral_cases FOR SELECT 
USING (
    auth.role() = 'authenticated' 
    -- 나중에는 role = 'admin' 이거나 배정된 담당자만 보도록 더 세밀하게 제한 가능
);

-- ======================================================================
-- [V2 준비] 정산 및 세금 자동화 처리 테이블 스펙 초안
-- ======================================================================
CREATE TABLE IF NOT EXISTS tax_invoices (
    id uuid default gen_random_uuid() primary key,
    case_id uuid references funeral_cases(id) on delete cascade,
    recipient_business_number text, -- 팀장 사업자번호
    amount integer not null,
    issue_date timestamp with time zone,
    status text check (status in ('pending', 'issued', 'failed')) default 'pending',
    provider text default 'popbill', -- 연동 API 명
    created_at timestamp with time zone default now()
);

CREATE TABLE IF NOT EXISTS payout_requests (
    id uuid default gen_random_uuid() primary key,
    dealer_id uuid references profiles(id),
    requested_amount integer not null, -- 신청 커미션 출금액
    tax_withheld integer not null, -- 3.3% 원천징수액
    net_payout integer not null, -- 실지급액
    toss_payout_id text, -- 토스 송금 트랜잭션 ID
    status text check (status in ('requested', 'authenticating', 'completed', 'failed')) default 'requested',
    created_at timestamp with time zone default now()
);

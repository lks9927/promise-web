-- ==========================================
-- 외주업체(하늘꽃) 테스트 계정 및 승인 완료 처리
-- Supabase SQL Editor에서 실행하세요
-- ==========================================

DO $$
DECLARE
    vendor_user_id UUID := 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99';
BEGIN
    -- 1. profiles 테이블에 벤더 계정 추가
    INSERT INTO profiles (id, email, role, name, phone, password)
    VALUES (vendor_user_id, 'vendor@test.com', 'vendor', '하늘꽃 본점', '010-8888-9999', '1234')
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        password = EXCLUDED.password;

    -- 2. vendors 테이블에 업체 정보 추가 + status = 'approved' 로 설정
    INSERT INTO vendors (user_id, company_name, business_type, phone, address, status)
    VALUES (
        vendor_user_id, 
        '하늘꽃 본점', 
        'flowers', 
        '010-8888-9999', 
        '서울시 서초구 꽃마을길 1', 
        'approved'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        business_type = EXCLUDED.business_type,
        status = 'approved'; -- 무조건 승인 상태로

    -- 3. (선택) vendor_products 에 기본 상품 하나 추가
    -- 이미 존재하면 넘어가게 처리할 수도 있지만 간편하게 insert
    INSERT INTO vendor_products (vendor_id, product_name, category, price, is_active)
    SELECT id, '기본 입관꽃 세트 (하늘꽃)', '입관꽃', 150000, true
    FROM vendors
    WHERE user_id = vendor_user_id
    AND NOT EXISTS (
        SELECT 1 FROM vendor_products vp 
        JOIN vendors v ON v.id = vp.vendor_id 
        WHERE v.user_id = vendor_user_id
    );

END $$;

NOTIFY pgrst, 'reload schema';
SELECT 'vendor created and approved' AS result;

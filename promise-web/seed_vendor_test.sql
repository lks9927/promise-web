-- ==========================================
-- 외주업체 통합(종합) 테스트 계정 및 승인 완료 처리
-- Supabase SQL Editor에서 실행하세요
-- ==========================================

DO $$
DECLARE
    vendor_user_id UUID := 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99';
    v_vendor_id UUID;
BEGIN
    -- 0. 기존 DB 제약조건 완화 (wreaths, all 추가)
    -- 이 블록은 안전하게 기존 제약조건을 지우고 새로 생성합니다.
    ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_business_type_check;
    ALTER TABLE vendors ADD CONSTRAINT vendors_business_type_check 
        CHECK (business_type IN ('flowers', 'goods', 'wreaths', 'burial', 'all', 'other'));

    -- 1. 기존 데이터 정리 (중복 방지)
    DELETE FROM vendor_products WHERE vendor_id IN (SELECT id FROM vendors WHERE user_id = vendor_user_id);
    DELETE FROM vendors WHERE user_id = vendor_user_id;
    DELETE FROM profiles WHERE id = vendor_user_id;

    -- 2. profiles 테이블에 벤더 계정 추가
    INSERT INTO profiles (id, email, role, name, phone, password)
    VALUES (vendor_user_id, 'vendor@test.com', 'vendor', '하늘꽃 종합상사', '010-8888-9999', '1234');

    -- 3. vendors 테이블에 '종합(all)' 업체 추가 + status = 'approved' 로 설정
    INSERT INTO vendors (user_id, company_name, business_type, phone, address, status)
    VALUES (
        vendor_user_id, 
        '하늘꽃 종합상사', 
        'all', -- 종합형 업체 (장례용품, 입관꽃, 화환 모두 취급)
        '010-8888-9999', 
        '서울시 서초구 상사마을길 1', 
        'approved'
    ) RETURNING id INTO v_vendor_id;

    -- 4. 각 분류별 상품 추가
    -- 장례용품
    INSERT INTO vendor_products (vendor_id, product_name, category, price, unit, is_active)
    VALUES (v_vendor_id, '최고급 수의 세트', '장례용품', 300000, '세트', true);
    
    -- 입관꽃
    INSERT INTO vendor_products (vendor_id, product_name, category, price, unit, is_active)
    VALUES (v_vendor_id, '기본 입관꽃 세트 (하늘꽃)', '입관꽃', 150000, '세트', true);

    -- 화환
    INSERT INTO vendor_products (vendor_id, product_name, category, price, unit, is_active)
    VALUES (v_vendor_id, '특대 근조 3단 화환', '화환', 100000, '개', true);

END $$;

NOTIFY pgrst, 'reload schema';
SELECT 'vendor comprehensive account and products created successfully' AS result;

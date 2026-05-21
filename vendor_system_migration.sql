-- =====================================================================
-- 외주업체 시스템 마이그레이션
-- Supabase SQL Editor에서 실행하세요
-- =====================================================================

-- 1. 프로필 역할에 'vendor', 'driver' 추가
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'master', 'leader', 'dealer', 'customer', 'vendor', 'driver'));

-- 2. 외주업체 테이블
CREATE TABLE IF NOT EXISTS vendors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    business_type TEXT CHECK (business_type IN ('flowers', 'goods', 'burial', 'other')) NOT NULL,
    -- flowers: 입관꽃, goods: 장례용품, burial: 장지업체(납골당/수목장), other: 기타
    phone TEXT,
    address TEXT,
    bank_account TEXT,
    bank_name TEXT,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending',
    rejection_reason TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 외주업체 판매 상품 테이블
CREATE TABLE IF NOT EXISTS vendor_products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    category TEXT, -- 예: '수국', '국화', '혼수함', '납골당A'
    price INTEGER NOT NULL DEFAULT 0, -- 단가 (원)
    unit TEXT DEFAULT '개', -- 개, 박스, 세트, 건 등
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 발주서 테이블
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    case_id UUID REFERENCES funeral_cases(id) ON DELETE CASCADE,
    team_leader_id UUID REFERENCES profiles(id),
    vendor_id UUID REFERENCES vendors(id),
    status TEXT CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
    -- pending: 발주대기, confirmed: 업체확인, shipped: 배송중, delivered: 납품완료, cancelled: 취소
    total_amount INTEGER DEFAULT 0,
    delivery_address TEXT, -- 장례식장 주소 (case에서 자동입력)
    delivery_note TEXT,    -- 장례 일시 등 특이사항
    order_number TEXT,     -- 발주번호 (자동생성)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- 5. 발주 항목 테이블
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES vendor_products(id),
    product_name TEXT NOT NULL, -- 스냅샷 (상품명 변경되어도 보존)
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit TEXT DEFAULT '개',
    total_price INTEGER GENERATED ALWAYS AS (unit_price * quantity) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 배송기사 테이블
CREATE TABLE IF NOT EXISTS delivery_drivers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- 앱 계정 (선택)
    name TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 납품 기록 테이블
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES delivery_drivers(id) ON DELETE SET NULL,
    driver_name TEXT, -- 스냅샷
    status TEXT CHECK (status IN ('in_transit', 'delivered')) DEFAULT 'in_transit',
    delivery_photo_url TEXT,
    notes TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. 발주번호 자동생성 함수
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- 9. RLS 정책
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_readable_by_all" ON vendors FOR SELECT USING (true);
CREATE POLICY "vendors_insert_own" ON vendors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vendors_update_own" ON vendors FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE vendor_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_readable_by_all" ON vendor_products FOR SELECT USING (true);
CREATE POLICY "products_managed_by_vendor" ON vendor_products FOR ALL
    USING (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_id AND vendors.user_id = auth.uid()));

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_readable" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_readable" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (true);

ALTER TABLE delivery_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers_readable" ON delivery_drivers FOR SELECT USING (true);
CREATE POLICY "drivers_managed_by_vendor" ON delivery_drivers FOR ALL
    USING (EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_id AND vendors.user_id = auth.uid()));

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries_readable" ON deliveries FOR SELECT USING (true);
CREATE POLICY "deliveries_insert" ON deliveries FOR INSERT WITH CHECK (true);
CREATE POLICY "deliveries_update" ON deliveries FOR UPDATE USING (true);

-- 10. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

SELECT 'vendor_system migration complete' AS result;

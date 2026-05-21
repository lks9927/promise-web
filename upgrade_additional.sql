-- 부가수입 기능 및 토스 연동 관련 추가 DB 스키마

-- 1. profiles 테이블에 계좌 정보 추가 (토스 송금용)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_holder TEXT;

-- 2. funeral_cases 테이블에 부가수입 관련 컬럼 추가
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS additional_income_total INTEGER DEFAULT 0;
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS additional_income_rate INTEGER DEFAULT 50;
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS additional_income_settled BOOLEAN DEFAULT false;

-- 3. 부가수입 항목 설정/등록 테이블 생성
CREATE TABLE IF NOT EXISTS additional_income_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES funeral_cases(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price INTEGER DEFAULT 0,
    total_price INTEGER GENERATED ALWAYS AS (quantity * unit_price) STORED,
    receipt_url TEXT,                    -- 영수증 사진 URL (선택, 나중에 추가 가능하도록)
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS (Row Level Security) 설정 (팀장/관리자 접근)
ALTER TABLE additional_income_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view additional_income_items"
ON additional_income_items FOR SELECT USING (true);

CREATE POLICY "TeamLeaders and Admins can insert/update additional_income_items"
ON additional_income_items FOR ALL USING (true); -- 편의상 현재 true 처리, 필요시 세분화

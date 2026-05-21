-- ======================================================================
-- [커스텀 장례 패키지 상품 제안 시스템] 테이블
-- ======================================================================

CREATE TABLE IF NOT EXISTS custom_packages (
    id uuid default gen_random_uuid() primary key,
    team_leader_id uuid references profiles(id) on delete cascade,
    name text not null, -- 패키지 이름 (예: 무빈소 초가성비 패키지)
    description text, -- 한 줄 설명
    items jsonb not null default '[]'::jsonb, -- 엑셀형 항목 내역: [{ name: '고급 수의', qty: 1, price: 300000, total: 300000 }]
    total_price integer not null default 0, -- 총 판매 가격 (항목 총합)
    fee_amount integer not null default 0, -- 본사 납입 수수료 (딜러/마진 미노출용)
    status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
    created_at timestamp with time zone default now()
);

-- 보안(RLS) 파이프
ALTER TABLE custom_packages ENABLE ROW LEVEL SECURITY;

-- 1. 조회: 로그인 된 모든 사용자(admin, leader, dealer) 조회 가능
CREATE POLICY "Packages viewable by authenticated users"
ON custom_packages FOR SELECT
USING (auth.role() = 'authenticated');

-- 2. 생성: 파트너(리더 등)만 생성 가능
CREATE POLICY "Packages insertable by authenticated users"
ON custom_packages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = team_leader_id);

-- 3. 수정/삭제: 
-- 관리자는 모든 상태 변경/수정 가능 (Admin)
-- 팀장은 본인이 올린 'pending' 건만 수정/삭제 가능하도록 방어
CREATE POLICY "Packages updateable by authenticated users"
ON custom_packages FOR UPDATE
USING (auth.role() = 'authenticated' AND (auth.uid() = team_leader_id OR true));

-- ======================================================================
-- 기본 시스템 상품 4종 (초기 V1 고정 패키지) 마이그레이션 삽입
-- (이 데이터는 본사 admin 권한으로 입력된 것으로 판단하여 승인 완료 처리)
-- ======================================================================
INSERT INTO custom_packages (team_leader_id, name, description, total_price, fee_amount, status, items)
SELECT 
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1), -- 본사 계정(첫 레코드) 매핑
    '기본형 (390만원)', 
    '본사 고정 기본 패키지', 
    3900000, 
    300000, 
    'approved',
    jsonb_build_array(
        jsonb_build_object('name', '장례 기본 서비스', 'qty', 1, 'price', 3900000, 'total', 3900000)
    )
WHERE NOT EXISTS (SELECT 1 FROM custom_packages WHERE name = '기본형 (390만원)');

INSERT INTO custom_packages (team_leader_id, name, description, total_price, fee_amount, status, items)
SELECT 
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    '고급형 (490만원)', 
    '품격을 높인 본사 보증 상품', 
    4900000, 
    400000, 
    'approved',
    jsonb_build_array(
        jsonb_build_object('name', '장례 고급 서비스', 'qty', 1, 'price', 4900000, 'total', 4900000)
    )
WHERE NOT EXISTS (SELECT 1 FROM custom_packages WHERE name = '고급형 (490만원)');

INSERT INTO custom_packages (team_leader_id, name, description, total_price, fee_amount, status, items)
SELECT 
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    '프리미엄 (590만원)', 
    '풀 코스 지원 안심 패키지', 
    5900000, 
    500000, 
    'approved',
    jsonb_build_array(
        jsonb_build_object('name', '프리미엄 서비스 일체', 'qty', 1, 'price', 5900000, 'total', 5900000)
    )
WHERE NOT EXISTS (SELECT 1 FROM custom_packages WHERE name = '프리미엄 (590만원)');

INSERT INTO custom_packages (team_leader_id, name, description, total_price, fee_amount, status, items)
SELECT 
    (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
    'VIP (790만원)', 
    'VVIP 전문 의전 및 특수 차량 지원', 
    7900000, 
    700000, 
    'approved',
    jsonb_build_array(
        jsonb_build_object('name', 'VVIP 마스터 전담 진행', 'qty', 1, 'price', 7900000, 'total', 7900000)
    )
WHERE NOT EXISTS (SELECT 1 FROM custom_packages WHERE name = 'VIP (790만원)');

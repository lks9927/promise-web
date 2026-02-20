-- 1. 파트너 테이블에 예치금 잔액(지갑) 추가
ALTER TABLE partners ADD COLUMN IF NOT EXISTS deposit_balance INTEGER DEFAULT 0;

-- 2. 예치금 입출금 내역 테이블 생성 (지갑 히스토리)
CREATE TABLE IF NOT EXISTS deposits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  partner_id UUID REFERENCES partners(user_id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('deposit', 'deduction', 'refund')), -- 입금(충전), 차감(사용료), 환불
  amount INTEGER NOT NULL, -- 변동 금액 (+/-)
  balance_after INTEGER NOT NULL, -- 변동 후 잔액
  description TEXT, -- 적요 (예: "관리자 충전", "장례 건 #123 사용료 차감")
  created_by UUID REFERENCES profiles(id), -- 처리한 관리자
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 장례 접수 테이블에 수수료/송금 관련 컬럼 추가
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS usage_fee INTEGER DEFAULT 0; -- 본사에 낼 돈 (사용료/입금가)
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS is_remitted BOOLEAN DEFAULT FALSE; -- 송금 완료 여부
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS deducted_from_deposit BOOLEAN DEFAULT FALSE; -- 예치금에서 차감되었는지 여부

-- 4. 정산 테이블의 유형(type) 확장 및 메모 컬럼 추가
-- 기존 check constraint 삭제 후 재생성 (PostgreSQL 방식)
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_type_check;

ALTER TABLE settlements ADD CONSTRAINT settlements_type_check 
CHECK (type IN (
  -- 기존 유형
  'dealer_commission',   -- 일반 딜러 수수료 (본인 영업)
  'customer_cashback',   -- 고객 캐시백
  'leader_fee',          -- 팀장 수고비 (기본)
  'master_fee',          -- (구) 마스터 수수료
  'flower_cost',         -- 꽃값
  'override_fee',        -- (구) 오버라이딩
  
  -- 신규 추가 유형 (3-Tier 구조)
  'usage_fee_remittance', -- 팀장 -> 본사 송금 (입금 기록용)
  'dealer_override',      -- 마스터 딜러 오버라이딩 (하위 딜러 영업분)
  'leader_override'       -- 마스터 팀장 오버라이딩 (하위 팀장 수행분)
));

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS admin_memo TEXT; -- 관리자 메모 (수정 사유 등)

-- funeral_cases 테이블에 dealer_id 컬럼 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE funeral_cases 
ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 기존 데이터: customer_id가 딜러인 경우 dealer_id로 복사
-- (이미 접수된 딜러 케이스가 있을 경우 대비)
UPDATE funeral_cases fc
SET dealer_id = fc.customer_id
WHERE dealer_id IS NULL
  AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = fc.customer_id 
      AND p.role IN ('dealer', 'master')
  );

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_funeral_cases_dealer_id ON funeral_cases(dealer_id);

-- coupons 테이블에 case_id가 있는데 status가 'used'가 아닌 것 수정 (기존 버그 데이터 정리)
UPDATE coupons
SET status = 'used'
WHERE case_id IS NOT NULL
  AND status != 'used';

NOTIFY pgrst, 'reload schema';

SELECT 'dealer_id column added and data fixed' AS result;

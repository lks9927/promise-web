-- =============================================
-- 딜러 접수 버그 수정 SQL
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. funeral_cases에 dealer_id 컬럼 추가 (이미 있으면 무시)
ALTER TABLE funeral_cases 
ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. 기존 데이터 보정: customer_id가 딜러인 케이스에 dealer_id 채우기
UPDATE funeral_cases fc
SET dealer_id = fc.customer_id
WHERE dealer_id IS NULL
  AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = fc.customer_id 
      AND p.role IN ('dealer', 'master')
  );

-- 3. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_funeral_cases_dealer_id ON funeral_cases(dealer_id);

-- 4. coupons 테이블에 case_id 컬럼 추가 (없을 경우 대비)
ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.funeral_cases(id);

-- 5. 이미 case_id가 있지만 status가 'used'가 아닌 쿠폰 수정
UPDATE coupons
SET status = 'used'
WHERE case_id IS NOT NULL
  AND status != 'used';

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

SELECT 'dealer_id + case_id fix complete' AS result;

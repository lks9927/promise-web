-- ============================================================
-- 17. 쿠폰 링크 발송 시스템 — DB 마이그레이션
-- 딜러가 예비상주에게 쿠폰 링크를 문자로 발송하고
-- 예비상주가 원클릭으로 장례접수를 할 수 있는 기능
-- ============================================================

-- 1) coupons 테이블에 수신자 정보 컬럼 추가
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS link_sent_at TIMESTAMPTZ;

-- 2) 인덱스 추가 (코드 기반 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code);

-- 3) 확인
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'coupons' 
  AND column_name IN ('recipient_name', 'recipient_phone', 'link_sent_at')
ORDER BY ordinal_position;

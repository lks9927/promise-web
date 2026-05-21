-- profiles 테이블에 push_subscription 컬럼 추가
-- Web Push 구독 정보 저장 (endpoint, keys 등)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS push_subscription JSONB DEFAULT NULL;

-- 인덱스 추가 (구독 정보가 있는 유저만 빠르게 조회)
CREATE INDEX IF NOT EXISTS idx_profiles_push_subscription
ON profiles ((push_subscription IS NOT NULL));

COMMENT ON COLUMN profiles.push_subscription IS 'Web Push API 구독 정보 (endpoint, keys). 백그라운드/대기 상태 OS 알림 발송에 사용.';

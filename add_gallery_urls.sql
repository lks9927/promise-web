-- 팀장 추가 프로필 / 현장 사진 저장을 위한 갤러리 배열 (JSONB)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gallery_urls JSONB DEFAULT '[]'::jsonb;

-- 사업자등록증 URL 컬럼 추가 (자격증과 별도 분리)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS business_license_url TEXT;

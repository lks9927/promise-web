-- =====================================================================
-- [필수 실행] funeral_cases 테이블 컬럼 추가 + 상태값 제약조건 수정
-- Supabase 대시보드 → SQL Editor 에서 실행하세요
-- =====================================================================

-- 1. 상태값 제약조건 수정 (consulting 추가)
ALTER TABLE funeral_cases DROP CONSTRAINT IF EXISTS funeral_cases_status_check;
ALTER TABLE funeral_cases ADD CONSTRAINT funeral_cases_status_check
    CHECK (status IN (
        'requested',
        'assigned',
        'consulting',
        'in_progress',
        'team_settling',
        'hq_check',
        'completed',
        'cancelled'
    ));

-- 2. 상담 상세 정보 컬럼 추가
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS deceased_name TEXT;
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS room_number TEXT;
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS encoffinment_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS funeral_end_time TIMESTAMP WITH TIME ZONE;

-- 3. Supabase 스키마 캐시 갱신 (실행 후 API가 새 컬럼을 인식)
NOTIFY pgrst, 'reload schema';

-- 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'funeral_cases'
  AND column_name IN ('deceased_name', 'room_number', 'encoffinment_time', 'funeral_end_time', 'status');

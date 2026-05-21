-- 1. partners 테이블에 'current_status' 컬럼 추가 (TEXT 타입)
-- 값 예시: 'waiting' (대기), 'working' (진행중), 'off' (휴식)
DO $$ 
BEGIN
    ALTER TABLE partners ADD COLUMN current_status VARCHAR(20) DEFAULT 'waiting';
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- 2. 기존 is_working 데이터를 기반으로 초기값 설정
UPDATE partners SET current_status = 'waiting' WHERE is_working = true;
UPDATE partners SET current_status = 'off' WHERE is_working = false;

-- 3. 코멘트 추가
COMMENT ON COLUMN partners.current_status IS '현재 파트너 상태: waiting(대기), working(진행중), off(휴식)';

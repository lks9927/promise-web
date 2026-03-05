-- =====================================================================
-- 장례 케이스 상태값 제약조건 수정
-- 오류: new row for relation "funeral_cases" violates check constraint
--       "funeral_cases_status_check"
-- 원인: 'consulting' 상태가 기존 CHECK 제약조건에 없었음
-- =====================================================================

-- 기존 제약조건 삭제
ALTER TABLE funeral_cases DROP CONSTRAINT IF EXISTS funeral_cases_status_check;

-- 새 제약조건 추가 (consulting 및 모든 실제 사용 상태 포함)
ALTER TABLE funeral_cases ADD CONSTRAINT funeral_cases_status_check
    CHECK (status IN (
        'requested',      -- 접수 대기
        'assigned',       -- 팀장 배정
        'consulting',     -- 상담 중 (추가됨)
        'in_progress',    -- 서비스 진행
        'team_settling',  -- 팀 정산 대기
        'hq_check',       -- 본사 정산 검토
        'completed',      -- 완료
        'cancelled'       -- 취소
    ));

-- 확인
SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conname = 'funeral_cases_status_check';

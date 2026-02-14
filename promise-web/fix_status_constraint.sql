
-- 기존 상태값 제약조건(funeral_cases_status_check)을 삭제하여
-- 새로운 6가지 상태(requested, assigned, consulting, in_progress, settling, completed)를 허용하도록 변경합니다.

ALTER TABLE funeral_cases DROP CONSTRAINT IF EXISTS funeral_cases_status_check;

ALTER TABLE funeral_cases ADD CONSTRAINT funeral_cases_status_check 
CHECK (status IN ('requested', 'assigned', 'consulting', 'in_progress', 'settling', 'completed', 'hq_check', 'team_settling'));
-- (참고: 기존 코드에서 team_settling, hq_check도 있었으므로 호환성을 위해 포함)

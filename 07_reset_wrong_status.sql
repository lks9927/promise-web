-- 기존에 잘못 설정된 팀장들의 상태를 실제 진행 중인 장례 기준으로 초기화 및 동기화합니다.
UPDATE partners
SET current_status = 'waiting';

UPDATE partners p
SET current_status = 'working'
WHERE EXISTS (
    SELECT 1 
    FROM funeral_cases fc
    WHERE fc.team_leader_id = p.user_id
      AND fc.status IN ('assigned', 'consulting', 'in_progress', 'team_settling', 'settling', 'hq_check')
);

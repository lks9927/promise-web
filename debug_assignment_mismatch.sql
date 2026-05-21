-- 1. 현재 '배정됨(assigned)' 이상 상태인 모든 장례 건 조회
-- (누가 담당 팀장인지, 그 팀장의 이름은 무엇인지 확인)
SELECT 
    fc.id as case_id,
    fc.status,
    fc.package_name,
    fc.team_leader_id as assigned_leader_id,
    p.name as leader_name,
    p.phone as leader_phone
FROM funeral_cases fc
LEFT JOIN profiles p ON fc.team_leader_id = p.id
WHERE fc.status != 'requested';

-- 2. '김마스터'라는 이름을 가진 모든 사용자 조회
-- (혹시 ID가 여러 개인지 확인)
SELECT id, name, phone, role 
FROM profiles 
WHERE name LIKE '%김마스터%';

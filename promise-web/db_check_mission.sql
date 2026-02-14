-- 1. [핵심] 현재 배정된 모든 장례 건과 담당자 확인
-- (최대박 님 건이 누구에게 배정되어 있는지 여기서 바로 보입니다)
SELECT 
    f.id as case_id,
    f.status,
    f.package_name,
    p.name as assigned_leader_name,
    f.team_leader_id
FROM funeral_cases f
LEFT JOIN profiles p ON f.team_leader_id = p.id
WHERE f.status != 'requested'
ORDER BY f.created_at DESC;

-- 2. 로그인 중인 '김마스터'의 시스템상 ID 대조
-- (이 ID가 위 리스트의 team_leader_id와 일치해야 내 현황에 뜹니다)
SELECT id, name, phone, email
FROM profiles 
WHERE name = '김마스터';

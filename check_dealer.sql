-- 이하늘 딜러 관련 데이터 확인
SELECT p.id, pr.name, pr.role, pa.grade, pa.status, pa.master_id
FROM profiles pr
JOIN partners pa ON pa.user_id = pr.id
LEFT JOIN profiles p ON p.id = pr.id
WHERE pr.name = '이하늘';

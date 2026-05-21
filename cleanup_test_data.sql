UPDATE coupons SET case_id = NULL, status = 'active';
DELETE FROM settlements;
DELETE FROM funeral_cases;
UPDATE partners SET current_status = 'waiting', is_working = true WHERE user_id = '64bcfb49-c5f7-4e4d-af9f-63b5c8bc2ef2';
SELECT 'OK: 초기화 완료' as result;

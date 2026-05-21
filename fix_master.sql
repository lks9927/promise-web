-- 마스터 프로필 데이터 추가 (승인 처리를 위해 필요)
-- 이 쿼리를 실행해 주세요!

INSERT INTO profiles (id, email, role, name, phone) 
VALUES ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'master@promise.com', 'master', '최고관리자(마스터)', '010-0000-0000')
ON CONFLICT (id) DO NOTHING;

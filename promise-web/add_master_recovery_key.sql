INSERT INTO system_config (key, value, description) 
VALUES ('master_recovery_key', 'admin1234', '관리자 비밀번호 분실 시 사용할 수 있는 마스터 복구 키')
ON CONFLICT (key) DO NOTHING;

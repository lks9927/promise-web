-- 시스템 설정 테이블 생성 (if not exists)
CREATE TABLE IF NOT EXISTS system_config (
  key text primary key,
  value text,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 기본 설정값 입력 (팀장 실시간 입찰 허용 여부)
INSERT INTO system_config (key, value, description) 
VALUES ('bidding_enabled', 'false', '팀장 실시간 입찰 허용 여부 (true/false)')
ON CONFLICT (key) DO NOTHING;

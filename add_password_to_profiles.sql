-- profiles 테이블에 password 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password text;

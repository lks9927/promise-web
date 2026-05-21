-- 역할(Role) 제약조건 업데이트
-- 'assistant' 역할이 데이터베이스에서 허용되도록 설정을 변경합니다.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'master', 'leader', 'assistant', 'dealer', 'customer'));

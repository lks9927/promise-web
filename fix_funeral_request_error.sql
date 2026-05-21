-- 1. profiles 테이블에 password 컬럼이 없는 경우 추가
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password text;

-- 2. profiles 테이블에 password_reset_requested 컬럼이 없는 경우 추가
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_reset_requested boolean DEFAULT false;

-- 3. 익명 사용자(비로그인)도 profiles 테이블에 데이터를 추가할 수 있도록 RLS 정책 설정
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON profiles;

-- 새 정책 추가: 누구나 프로필 생성 가능 (회원가입/접수 시 필요)
CREATE POLICY "Allow anonymous inserts" 
ON profiles FOR INSERT 
TO public 
WITH CHECK (true);

-- 새 정책 추가: 누구나 프로필 조회 가능 (로그인/중복체크 시 필요)
CREATE POLICY "Public profiles are viewable by everyone." 
ON profiles FOR SELECT 
TO public 
USING (true);

-- 새 정책 추가: 본인 프로필 수정 가능 (비밀번호 재설정 등)
CREATE POLICY "Users can update own profile." 
ON profiles FOR UPDATE 
TO public 
USING (auth.uid() = id);

-- 4. funeral_cases 테이블 권한 설정
ALTER TABLE funeral_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts for funeral cases" ON funeral_cases;
DROP POLICY IF EXISTS "Public funeral cases viewable" ON funeral_cases;

-- 누구나 장례 접수 가능
CREATE POLICY "Allow anonymous inserts for funeral cases" 
ON funeral_cases FOR INSERT 
TO public 
WITH CHECK (true);

-- 누구나 장례 건 조회 가능 (롤링 현황판 등을 위해)
CREATE POLICY "Public funeral cases viewable" 
ON funeral_cases FOR SELECT 
TO public 
USING (true);

-- [긴급 수정] 권한 문제 해결을 위한 강제 초기화 스크립트

-- 1. funeral_cases 테이블의 모든 기존 정책(Policy) 삭제 (충돌 방지)
DROP POLICY IF EXISTS "Allow authenticated interactions" ON funeral_cases;
DROP POLICY IF EXISTS "Enable read access for all users" ON funeral_cases;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON funeral_cases;
DROP POLICY IF EXISTS "Enable update for users based on email" ON funeral_cases;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON funeral_cases;
DROP POLICY IF EXISTS "Allow select for authenticated users" ON funeral_cases;

-- 2. partners 테이블의 기존 정책 삭제
DROP POLICY IF EXISTS "Allow partners access" ON partners;
DROP POLICY IF EXISTS "Enable read access for all users" ON partners;

-- 3. RLS(보안) 잠시 껐다가 켜기 (확실한 적용을 위해)
ALTER TABLE funeral_cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE funeral_cases ENABLE ROW LEVEL SECURITY;

ALTER TABLE partners DISABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 4. [핵심] 로그인한 유저(authenticated)라면 무조건 조회/추가/수정/삭제 가능하게 허용
CREATE POLICY "Super Permissive Policy for Cases"
ON funeral_cases
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Super Permissive Policy for Partners"
ON partners
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. 비로그인 유저도 조회는 가능하게 허용 (옵션)
CREATE POLICY "Public Read Access"
ON funeral_cases
FOR SELECT
TO anon
USING (true);

-- 6. 확인용 메시지
SELECT 'Permissions have been reset successfully' as result;

-- [긴급] 비로그인(Anon) 상태에서도 수정 권한 허용
-- 현재 로그인 로직이 Supabase Auth 세션을 사용하지 않고 있어, DB에선 Anon으로 인식됨.

-- 1. funeral_cases: 익명 사용자(Anon)도 업데이트/추가 가능하게 변경
DROP POLICY IF EXISTS "Public Update Access" ON funeral_cases;
CREATE POLICY "Public Update Access"
ON funeral_cases
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- 2. partners: 익명 사용자(Anon)도 상태 변경 가능하게 변경
DROP POLICY IF EXISTS "Public Partner Access" ON partners;
CREATE POLICY "Public Partner Access"
ON partners
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- 3. RLS가 켜져 있어도 Anon 정책이 있으면 통과됨
-- 혹시 모르니 RLS 자체를 꺼버리는 것도 방법 (최후의 수단, 개발용)
-- ALTER TABLE funeral_cases DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE partners DISABLE ROW LEVEL SECURITY;

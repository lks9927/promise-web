-- 1. team_leader_id 컬럼이 없을 경우를 대비해 추가 (이미 있으면 에러나지만 무시됨)
DO $$ 
BEGIN
    ALTER TABLE funeral_cases ADD COLUMN team_leader_id UUID REFERENCES profiles(id);
EXCEPTION
    WHEN duplicate_column THEN
        NULL;
END $$;

-- 2. 기존 RLS 정책이 있다면 충돌 방지를 위해 정리 (선택사항)
-- DROP POLICY IF EXISTS "Team leaders can update cases" ON funeral_cases;

-- 3. 팀장(leader), 딜러(dealer), 관리자(admin) 등 인증된 사용자가 
--    장례 건(funeral_cases)을 업데이트할 수 있도록 허용
--    (특히 status='requested'인 건을 채갈 수 있어야 함)

ALTER TABLE funeral_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow update for authenticated users"
ON funeral_cases
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. 조회(SELECT)도 확실하게 허용
CREATE POLICY "Allow select for authenticated users"
ON funeral_cases
FOR SELECT
TO authenticated
USING (true);

-- 5. 삽입(INSERT) 허용 (딜러가 접수해야 하므로)
CREATE POLICY "Allow insert for authenticated users"
ON funeral_cases
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 1. partners 테이블에 '근무 상태' (is_working) 컬럼 추가
-- 이미 존재하면 에러 없이 넘어감
DO $$ 
BEGIN
    ALTER TABLE partners ADD COLUMN is_working BOOLEAN DEFAULT true;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- 2. funeral_cases 테이블에 'team_leader_id' 컬럼 확실히 추가
DO $$ 
BEGIN
    ALTER TABLE funeral_cases ADD COLUMN team_leader_id UUID REFERENCES profiles(id);
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- 3. 권한 문제 해결 (RLS 정책)
-- 기존 정책이 충돌날 수 있으므로 안전하게 정책을 활성화합니다.
ALTER TABLE funeral_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- 3-1. funeral_cases: 인증된 유저(팀장/딜러)는 조회, 추가, 수정 모두 가능하게 함
DROP POLICY IF EXISTS "Allow authenticated interactions" ON funeral_cases;
CREATE POLICY "Allow authenticated interactions"
ON funeral_cases
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3-2. partners: 내 상태(is_working)를 수정할 수 있어야 함
-- (간단하게 인증된 유저는 partners 읽기/수정 가능하게 풂)
DROP POLICY IF EXISTS "Allow partners access" ON partners;
CREATE POLICY "Allow partners access"
ON partners
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

COMMENT ON COLUMN partners.is_working IS '현재 근무(출동대기) 상태 여부';

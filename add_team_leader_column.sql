-- Add team_leader_id column to funeral_cases table
ALTER TABLE funeral_cases 
ADD COLUMN team_leader_id UUID REFERENCES profiles(id);

-- (Optional) If you want to allow fast queries on this column
CREATE INDEX IF NOT EXISTS idx_funeral_cases_team_leader ON funeral_cases(team_leader_id);

COMMENT ON COLUMN funeral_cases.team_leader_id IS '장례를 담당하는 팀장(Leader)의 ID';

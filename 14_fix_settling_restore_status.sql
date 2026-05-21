CREATE OR REPLACE FUNCTION auto_restore_leader_status()
RETURNS TRIGGER AS $$
BEGIN
    -- 장례가 취소되었을 때
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        IF OLD.team_leader_id IS NOT NULL THEN
            -- 해당 팀장의 다른 진행중인 장례가 없으면 대기중으로 복귀
            IF NOT EXISTS (
                SELECT 1 FROM funeral_cases
                WHERE team_leader_id = OLD.team_leader_id
                  AND id != NEW.id
                  -- team_settling(정산 대기) 상태는 이미 장례가 끝난 것으로 간주하여 제외
                  AND status IN ('assigned', 'consulting', 'in_progress')
            ) THEN
                UPDATE partners
                SET current_status = 'waiting'
                WHERE user_id = OLD.team_leader_id;
            END IF;
        END IF;
    END IF;

    -- 장례가 종료되었을 때 (정산 대기 진입 시점부터 대기 상태로 변경)
    -- (in_progress -> team_settling -> hq_check -> completed)
    IF NEW.status IN ('team_settling', 'completed', 'hq_check') AND OLD.status NOT IN ('team_settling', 'completed', 'hq_check') THEN
        IF NEW.team_leader_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM funeral_cases
                WHERE team_leader_id = NEW.team_leader_id
                  AND id != NEW.id
                  -- team_settling(정산 대기) 상태는 이미 장례가 끝난 것으로 간주하여 제외
                  AND status IN ('assigned', 'consulting', 'in_progress')
            ) THEN
                UPDATE partners
                SET current_status = 'waiting'
                WHERE user_id = NEW.team_leader_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 현재 team_settling 상태인 건을 가진 팀장들 중, 다른 진행 중인 장례가 없다면 상태를 waiting으로 초기화
UPDATE partners p
SET current_status = 'waiting'
WHERE is_working = true
  AND current_status != 'waiting'
  AND NOT EXISTS (
      SELECT 1 FROM funeral_cases fc
      WHERE fc.team_leader_id = p.user_id
        AND fc.status IN ('assigned', 'consulting', 'in_progress')
  );

-- ======================================================================
-- [V5 공정 순환 배정 + 상태 자동 관리]
-- 1) last_assigned_at 기반 공정 순번 (고정 순번표 대체)
-- 2) 장례 취소 시 팀장 current_status → 'waiting' 자동 복귀
-- 3) 입찰 수락 시 last_assigned_at 갱신 + current_status → 'working'
-- ======================================================================

-- =============================================
-- 0. 컬럼 추가 (이미 있으면 무시)
-- =============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'partners' AND column_name = 'last_assigned_at'
    ) THEN
        ALTER TABLE partners ADD COLUMN last_assigned_at timestamptz DEFAULT now();
    END IF;
END $$;

-- 기존 팀장들의 last_assigned_at을 created_at으로 세팅 (공정하게 시작)
UPDATE partners SET last_assigned_at = created_at WHERE last_assigned_at IS NULL;


-- =============================================
-- 1. find_next_bidder 개선: last_assigned_at 기반 공정 순번
--    dispatch_order_map은 여전히 받지만, ORDER BY를 last_assigned_at으로 변경
--    → 가장 오래 배정 안 받은 대기중 팀장이 우선
-- =============================================
DROP FUNCTION IF EXISTS find_next_bidder(jsonb, uuid[], uuid) CASCADE;

CREATE OR REPLACE FUNCTION find_next_bidder(
    p_order_map      jsonb,
    p_previous       uuid[],
    p_current_id     uuid
) RETURNS uuid AS $$
DECLARE
    v_next_id    uuid;
    v_excl       uuid[];
BEGIN
    v_excl := array_append(COALESCE(p_previous, '{}'), p_current_id);

    -- 1차: 대기중(waiting) + 승인됨(approved) + 제외 목록에 없는 팀장 중
    --       last_assigned_at이 가장 오래된 사람
    SELECT p.user_id INTO v_next_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND p.user_id != ALL(v_excl)
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST
    LIMIT 1;

    -- 2차: 대기중 아니어도 승인된 팀장 (전원 바쁠 때 fallback)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.status = 'approved'
          AND p.user_id != ALL(v_excl)
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    -- 3차: 전체 소진 → 순환 (previous 무시, 처음부터)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.current_status = 'waiting'
          AND p.status = 'approved'
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;

        IF v_next_id IS NULL THEN
            SELECT p.user_id INTO v_next_id
            FROM partners p
            WHERE p.status = 'approved'
              AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
            ORDER BY p.last_assigned_at ASC NULLS FIRST
            LIMIT 1;
        END IF;
    END IF;

    RETURN v_next_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 2. accept_bidding 개선: last_assigned_at 갱신 + 상태 변경
-- =============================================
CREATE OR REPLACE FUNCTION accept_bidding(p_case_id uuid, p_leader_id uuid)
RETURNS text AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM funeral_cases
        WHERE id = p_case_id
          AND (current_bidder_id = p_leader_id OR current_bidder_id IS NULL)
          AND status = 'requested'
    ) THEN RETURN 'NOT_AVAILABLE'; END IF;

    UPDATE bidding_history
    SET status = 'accepted', resolved_at = now()
    WHERE case_id = p_case_id AND leader_id = p_leader_id AND status = 'offered';

    UPDATE funeral_cases
    SET status            = 'assigned',
        team_leader_id    = p_leader_id,
        current_bidder_id = NULL,
        bid_timeout_at    = NULL
    WHERE id = p_case_id;

    -- ★ 공정 순번: 배정 시각 갱신 (다음번에 맨 뒤로)
    UPDATE partners
    SET last_assigned_at = now(),
        current_status = 'working'
    WHERE user_id = p_leader_id;

    RETURN 'ACCEPTED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 3. 장례 취소 시 팀장 상태 자동 복귀 트리거
--    funeral_cases.status가 'cancelled' 또는 'requested'로 되돌아가면
--    해당 team_leader의 current_status를 'waiting'으로 복원
-- =============================================
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
                  AND status IN ('assigned', 'consulting', 'in_progress', 'team_settling')
            ) THEN
                UPDATE partners
                SET current_status = 'waiting'
                WHERE user_id = OLD.team_leader_id;
            END IF;
        END IF;
    END IF;

    -- 장례가 완료되었을 때 (team_settling → hq_check → completed)
    IF NEW.status IN ('completed', 'hq_check') AND OLD.status NOT IN ('completed', 'hq_check') THEN
        IF NEW.team_leader_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM funeral_cases
                WHERE team_leader_id = NEW.team_leader_id
                  AND id != NEW.id
                  AND status IN ('assigned', 'consulting', 'in_progress', 'team_settling')
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

DROP TRIGGER IF EXISTS trg_auto_restore_leader_status ON funeral_cases;
CREATE TRIGGER trg_auto_restore_leader_status
    AFTER UPDATE ON funeral_cases
    FOR EACH ROW
    EXECUTE FUNCTION auto_restore_leader_status();

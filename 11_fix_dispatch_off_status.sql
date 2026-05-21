-- ======================================================================
-- [배차 로직 수정] 오프(off) 상태 팀장 강제 배차 제외
-- 대기중(waiting)인 팀장이 없을 때, 강제로 배당을 넘기는 폴백(Fallback) 
-- 로직에서 current_status = 'off' 인 사람을 확실히 제외합니다.
-- ======================================================================

-- 1. 다음 배차자 찾기 함수 수정
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

    -- 1차: 대기중(waiting) + 제외 목록에 없는 팀장 중 가장 오래된 사람
    SELECT p.user_id INTO v_next_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND p.user_id != ALL(v_excl)
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST
    LIMIT 1;

    -- 2차: 대기중 아니어도 승인된 팀장 (전원 바쁠 때) -> 단, off는 무조건 제외!
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.status = 'approved'
          AND p.current_status != 'off'
          AND p.user_id != ALL(v_excl)
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    -- 3차: 전체 소진 → 순환 (previous 무시, 처음부터 대기중 우선)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.current_status = 'waiting'
          AND p.status = 'approved'
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;

        -- 4차: 순환 (대기중 없음) -> 단, off는 무조건 제외!
        IF v_next_id IS NULL THEN
            SELECT p.user_id INTO v_next_id
            FROM partners p
            WHERE p.status = 'approved'
              AND p.current_status != 'off'
              AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
            ORDER BY p.last_assigned_at ASC NULLS FIRST
            LIMIT 1;
        END IF;
    END IF;

    RETURN v_next_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. 새 장례 접수 시 첫 배차자 자동 지정 함수도 동일하게 수정
CREATE OR REPLACE FUNCTION auto_assign_first_bidder()
RETURNS TRIGGER AS $$
DECLARE
    v_dispatch_mode text;
    v_order_map     jsonb;
    v_first_id      uuid;
    v_timeout_mins  int;
BEGIN
    IF NEW.status != 'requested' THEN RETURN NEW; END IF;

    SELECT value INTO v_dispatch_mode FROM system_config WHERE key = 'dispatch_mode';
    IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential', 'team_hybrid') THEN
        RETURN NEW;
    END IF;

    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    IF v_order_map IS NULL OR v_order_map = '{}'::jsonb THEN RETURN NEW; END IF;

    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;

    -- 출동대기 상태인 1순위
    SELECT (kv.key)::uuid INTO v_first_id
    FROM jsonb_each_text(v_order_map) kv
    JOIN partners p ON p.user_id = (kv.key)::uuid
    WHERE p.current_status = 'waiting' AND p.status = 'approved'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

    -- 없으면 상태 무관 1순위 -> 단, off는 무조건 제외!
    IF v_first_id IS NULL THEN
        SELECT (kv.key)::uuid INTO v_first_id
        FROM jsonb_each_text(v_order_map) kv
        JOIN partners p ON p.user_id = (kv.key)::uuid
        WHERE p.status = 'approved' AND p.current_status != 'off'
        ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
    END IF;

    IF v_first_id IS NOT NULL THEN
        UPDATE funeral_cases
        SET current_bidder_id = v_first_id,
            bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
            previous_bidders  = '{}'
        WHERE id = NEW.id;

        INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
        VALUES (NEW.id, v_first_id, 'offered', now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

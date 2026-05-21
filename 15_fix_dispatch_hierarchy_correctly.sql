-- ============================================================
-- 15_fix_dispatch_hierarchy_correctly.sql
-- 배차 로직 정상화: 마스터/일반 동일하게 대기열 포함 + 비상시 마스터 투입
--
-- 1순위: 출동 대기(waiting) 중인 모든 팀장 (마스터 포함, 구분 없음)
-- 2순위: (순환) 이전 패스 무시하고 출동 대기 중인 모든 팀장 다시 검색
-- 3순위: 대기 중인 사람이 0명일 때 (전원 진행 중) → 마스터 팀장 비상 투입
-- off 상태: 모든 단계에서 무조건 제외
-- ============================================================

-- ═══ 헬퍼: 마스터 팀장 여부 확인 ═══
CREATE OR REPLACE FUNCTION is_master_leader(p_user_id uuid) RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = p_user_id
          AND p.master_id IS NULL
          AND pr.role = 'leader'
          AND p.status = 'approved'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 헬퍼: 비상 배차 관리자 알림 ═══
CREATE OR REPLACE FUNCTION notify_emergency_dispatch(p_case_id uuid, p_master_leader_id uuid) RETURNS void AS $$
DECLARE
    v_admin RECORD;
    v_leader_name text;
    v_loc text;
    v_pkg text;
    v_msg text;
BEGIN
    SELECT name INTO v_leader_name FROM profiles WHERE id = p_master_leader_id;
    SELECT location, package_name INTO v_loc, v_pkg FROM funeral_cases WHERE id = p_case_id;

    v_msg := format(
        '🚨 비상 배차 발동!' || E'\n' ||
        '대기 중인 팀장 전원 부재 → 마스터 팀장 %s 비상 투입' || E'\n' ||
        '장소: %s (%s)' || E'\n' ||
        '즉시 상황을 확인해주세요.',
        COALESCE(v_leader_name, '미상'),
        COALESCE(v_loc, '미정'),
        COALESCE(v_pkg, '미정')
    );

    FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (v_admin.id, 'emergency', '🚨 비상 배차 — 마스터 팀장 투입', v_msg, false, now());
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 1. 다음 배차자 찾기 (대기중 팀장 우선 → 모두 없으면 마스터) ═══
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

    -- 1차: 출동 대기(waiting) 중인 모든 팀장 (마스터 포함)
    SELECT p.user_id INTO v_next_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND p.user_id != ALL(v_excl)
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST
    LIMIT 1;

    -- 2차: 1차에서 제외(v_excl)된 사람만 남았다면 순환 (previous 무시하고 다시 waiting 중 찾기)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        WHERE p.current_status = 'waiting'
          AND p.status = 'approved'
          AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    -- 3차 (비상): 대기중(waiting)인 팀장이 아예 0명일 때 (전원 진행중이거나 off)
    -- 마스터 팀장에게 비상 배정 (off 제외)
    IF v_next_id IS NULL THEN
        SELECT p.user_id INTO v_next_id
        FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.status = 'approved'
          AND p.current_status != 'off'
          AND p.master_id IS NULL
          AND pr.role = 'leader'
        ORDER BY p.last_assigned_at ASC NULLS FIRST
        LIMIT 1;
    END IF;

    RETURN v_next_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 2. 새 장례 접수 시 첫 배차자 자동 지정 ═══
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

    -- 1순위: 출동 대기(waiting) 중인 모든 팀장 (마스터 포함)
    SELECT p.user_id INTO v_first_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

    -- 2순위 (비상): 대기 중인 사람이 0명일 때 마스터 팀장에게 비상 투입
    IF v_first_id IS NULL THEN
        SELECT p.user_id INTO v_first_id
        FROM partners p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.status = 'approved'
          AND p.current_status != 'off'
          AND p.master_id IS NULL
          AND pr.role = 'leader'
        ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

        IF v_first_id IS NOT NULL THEN
            PERFORM notify_emergency_dispatch(NEW.id, v_first_id);
        END IF;
    END IF;

    -- 아무도 없으면 관리자 알림만
    IF v_first_id IS NULL THEN
        PERFORM notify_escalation(NEW.id, 0, NULL);
        RETURN NEW;
    END IF;

    UPDATE funeral_cases
    SET current_bidder_id = v_first_id,
        bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
        previous_bidders  = '{}'
    WHERE id = NEW.id;

    INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
    VALUES (NEW.id, v_first_id, 'offered', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 3. 타임아웃 처리 (유지) ═══
CREATE OR REPLACE FUNCTION process_bidding_timeouts()
RETURNS integer AS $$
DECLARE
    v_case         RECORD;
    v_order_map    jsonb;
    v_timeout_mins int;
    v_next_id      uuid;
    v_pass_count   int;
    v_excl         uuid[];
    v_is_cycling   boolean;
    v_processed    integer := 0;
BEGIN
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;

    FOR v_case IN
        SELECT id, current_bidder_id, previous_bidders
        FROM funeral_cases
        WHERE status = 'requested'
          AND current_bidder_id IS NOT NULL
          AND bid_timeout_at < now()
    LOOP
        UPDATE bidding_history
        SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)'
        WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';

        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (v_case.current_bidder_id, 'warning', '배정 타임아웃',
            '배정 요청에 시간 내 응답하지 않아 다음 순번으로 이관되었습니다.', false, now());

        v_excl       := array_append(COALESCE(v_case.previous_bidders, '{}'), v_case.current_bidder_id);
        v_pass_count := array_length(v_excl, 1);

        IF v_pass_count >= 3 THEN
            PERFORM notify_escalation(v_case.id, v_pass_count, v_case.current_bidder_id);
        END IF;

        v_next_id    := NULL;
        v_is_cycling := false;

        IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
            v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id);

            IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
                v_is_cycling := true;
            END IF;
        END IF;

        IF v_next_id IS NOT NULL THEN
            -- 지금 넣으려는 대상이 대기중인 마스터가 아니라, '비상 투입'된 경우인지 확인
            -- find_next_bidder 내부 로직상 waiting이 없어서 마스터가 뽑힌 거라면 비상임.
            -- 단순히 is_master_leader(v_next_id) 라고 해서 무조건 비상이 아님! (평소엔 순환받으므로)
            -- 따라서 '비상 투입' 판단을 위해 파트너의 상태가 waiting이 아닌지 확인.
            IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN
                PERFORM notify_emergency_dispatch(v_case.id, v_next_id);
            END IF;

            UPDATE funeral_cases
            SET current_bidder_id = v_next_id,
                bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
                previous_bidders  = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_excl END
            WHERE id = v_case.id;

            INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
            VALUES (v_case.id, v_next_id, 'offered', now());

            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES (
                v_next_id, 'assignment',
                CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청'
                     WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청'
                     ELSE '새 배정 요청' END,
                CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting'
                    THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정됩니다.'
                    WHEN v_pass_count >= 3
                    THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count)
                    ELSE '순차배정으로 장례 콜이 도착했습니다. 제한 시간 내 응답해주세요.'
                END,
                false, now()
            );
        END IF;

        v_processed := v_processed + 1;
    END LOOP;

    RETURN v_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 4. 팀장 수동 패스 (유지) ═══
CREATE OR REPLACE FUNCTION pass_bidding(p_case_id uuid, p_leader_id uuid, p_reason text DEFAULT '수동 패스')
RETURNS text AS $$
DECLARE
    v_order_map    jsonb;
    v_timeout_mins int;
    v_next_id      uuid;
    v_previous     uuid[];
    v_excl         uuid[];
    v_pass_count   int;
    v_is_cycling   boolean := false;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM funeral_cases
        WHERE id = p_case_id AND current_bidder_id = p_leader_id AND status = 'requested'
    ) THEN RETURN 'NOT_CURRENT_BIDDER'; END IF;

    UPDATE bidding_history
    SET status = 'rejected', resolved_at = now(), reason = p_reason
    WHERE case_id = p_case_id AND leader_id = p_leader_id AND status = 'offered';

    UPDATE funeral_cases
    SET previous_bidders = array_append(COALESCE(previous_bidders, '{}'), p_leader_id)
    WHERE id = p_case_id;

    SELECT previous_bidders INTO v_previous FROM funeral_cases WHERE id = p_case_id;
    v_pass_count := array_length(v_previous, 1);

    IF v_pass_count >= 3 THEN
        PERFORM notify_escalation(p_case_id, v_pass_count, p_leader_id);
    END IF;

    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;

    v_next_id := NULL;
    IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
        v_next_id := find_next_bidder(v_order_map, v_previous, p_leader_id);

        v_excl := array_append(COALESCE(v_previous, '{}'), p_leader_id);
        IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
            v_is_cycling := true;
        END IF;
    END IF;

    IF v_next_id IS NOT NULL THEN
        -- 마스터 비상 투입 확인 (마스터이면서 waiting이 아닌 경우)
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN
            PERFORM notify_emergency_dispatch(p_case_id, v_next_id);
        END IF;

        UPDATE funeral_cases
        SET current_bidder_id = v_next_id,
            bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
            previous_bidders  = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_previous END
        WHERE id = p_case_id;

        INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
        VALUES (p_case_id, v_next_id, 'offered', now());

        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (
            v_next_id, 'assignment',
            CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청'
                 WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청'
                 ELSE '새 배정 요청' END,
            CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting'
                THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정됩니다.'
                WHEN v_pass_count >= 3
                THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count)
                ELSE '순차배정으로 장례 콜이 도착했습니다. 제한 시간 내 응답해주세요.'
            END,
            false, now()
        );

        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN 
            RETURN 'ESCALATED_TO_MASTER'; 
        END IF;
        IF v_is_cycling THEN RETURN 'CYCLING_RESTART'; END IF;
        RETURN 'PASSED_TO_NEXT';
    END IF;

    -- 아무도 없음
    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id);
    RETURN 'NO_AVAILABLE_LEADER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

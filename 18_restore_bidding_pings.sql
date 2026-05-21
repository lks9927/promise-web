-- ============================================================
-- 18_restore_bidding_pings.sql
-- 이전 패치(15번)에서 누락된 '3분에 3회' 핑(Ping) 발송 로직 복구
-- ============================================================

-- ═══ 1. 타임아웃 처리 (핑 횟수 연장 복구) ═══
CREATE OR REPLACE FUNCTION process_bidding_timeouts()
RETURNS integer AS $$
DECLARE
    v_case         RECORD;
    v_order_map    jsonb;
    v_timeout_mins int;
    v_max_pings    int;
    v_next_id      uuid;
    v_pass_count   int;
    v_excl         uuid[];
    v_is_cycling   boolean;
    v_processed    integer := 0;
BEGIN
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    SELECT COALESCE(value::int, 3) INTO v_max_pings FROM system_config WHERE key = 'bidding_max_pings';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
    IF v_max_pings IS NULL THEN v_max_pings := 3; END IF;

    FOR v_case IN
        SELECT id, current_bidder_id, previous_bidders, current_bidder_pings
        FROM funeral_cases
        WHERE status = 'requested'
          AND current_bidder_id IS NOT NULL
          AND bid_timeout_at < now()
    LOOP
        -- 현재 팀장의 핑(알람) 횟수 확인 (기본 1회부터 시작)
        IF COALESCE(v_case.current_bidder_pings, 1) < v_max_pings THEN
            -- 핑 횟수가 남았으면 카운트만 올리고 타임아웃 지정시간(3분) 다시 연장
            UPDATE funeral_cases
            SET current_bidder_pings = COALESCE(v_case.current_bidder_pings, 1) + 1,
                bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval
            WHERE id = v_case.id;
        ELSE
            -- 핑 횟수를 다 채웠으면(3번 울렸으면) 다음 사람으로 패스
            UPDATE bidding_history
            SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)'
            WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';

            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES (v_case.current_bidder_id, 'warning', '배정 타임아웃',
                format('%s회 미응답으로 다음 순번에게 배정이 넘어갔습니다.', v_max_pings), false, now());

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
                IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN
                    PERFORM notify_emergency_dispatch(v_case.id, v_next_id);
                END IF;

                UPDATE funeral_cases
                SET current_bidder_id = v_next_id,
                    current_bidder_pings = 1, -- 새 팀장이므로 핑 횟수 1로 리셋
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
        END IF;

        v_processed := v_processed + 1;
    END LOOP;

    RETURN v_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 2. 새 장례 접수 시 첫 배차자 지정 (current_bidder_pings 리셋 추가) ═══
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

    SELECT p.user_id INTO v_first_id
    FROM partners p
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

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

    IF v_first_id IS NULL THEN
        PERFORM notify_escalation(NEW.id, 0, NULL);
        RETURN NEW;
    END IF;

    UPDATE funeral_cases
    SET current_bidder_id = v_first_id,
        current_bidder_pings = 1, -- 핑 횟수 초기화
        bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
        previous_bidders  = '{}'
    WHERE id = NEW.id;

    INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
    VALUES (NEW.id, v_first_id, 'offered', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 3. 팀장 수동 패스 (current_bidder_pings 리셋 추가) ═══
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
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN
            PERFORM notify_emergency_dispatch(p_case_id, v_next_id);
        END IF;

        UPDATE funeral_cases
        SET current_bidder_id = v_next_id,
            current_bidder_pings = 1, -- 핑 횟수 초기화
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

    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id);
    RETURN 'NO_AVAILABLE_LEADER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

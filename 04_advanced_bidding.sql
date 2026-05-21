-- ============================================================================
-- 04_advanced_bidding.sql
-- 배정 로직 고도화: 반복 알람 및 관리자 비상 알람 연동 스크립트
-- ============================================================================
-- 이 스크립트를 Supabase의 SQL Editor에 복사하여 붙여넣기(RUN) 하시면 됩니다.

-- 1. [DB 컬럼 추가] 재알람(Ping) 횟수를 추적하기 위한 컬럼 추가
ALTER TABLE funeral_cases ADD COLUMN IF NOT EXISTS current_bidder_pings int DEFAULT 1;

-- 2. 새 접수 시 1순위 자동 배정 트리거 함수 수정
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

    -- 1순위 탐색 (출동대기) — last_assigned_at 기준 공정 순환
    SELECT (kv.key)::uuid INTO v_first_id
    FROM jsonb_each_text(v_order_map) kv
    JOIN partners p ON p.user_id = (kv.key)::uuid
    WHERE p.current_status = 'waiting' AND p.status = 'approved'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;

    -- 없으면 상태 무관 1순위
    IF v_first_id IS NULL THEN
        SELECT (kv.key)::uuid INTO v_first_id
        FROM jsonb_each_text(v_order_map) kv
        JOIN partners p ON p.user_id = (kv.key)::uuid
        WHERE p.status = 'approved'
        ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
    END IF;

    IF v_first_id IS NOT NULL THEN
        UPDATE funeral_cases
        SET current_bidder_id = v_first_id,
            bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
            previous_bidders  = '{}',
            current_bidder_pings = 1   -- 처음 배정될 때 알람 횟수를 1로 초기화
        WHERE id = NEW.id;

        INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
        VALUES (NEW.id, v_first_id, 'offered', now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. 타임아웃 프로세스 수정 (설정된 횟수만큼 재알림 후 다음 사람 넘김, 에스컬레이션 인원 유동 적용)
CREATE OR REPLACE FUNCTION process_bidding_timeouts()
RETURNS integer AS $$
DECLARE
    v_case         RECORD;
    v_order_map    jsonb;
    v_timeout_mins int;
    v_max_pings    int;
    v_escalation_count int;
    v_next_id      uuid;
    v_pass_count   int;
    v_excl         uuid[];
    v_is_cycling   boolean;
    v_processed    integer := 0;
BEGIN
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    SELECT COALESCE(value::int, 3) INTO v_max_pings FROM system_config WHERE key = 'bidding_max_pings';
    SELECT COALESCE(value::int, 3) INTO v_escalation_count FROM system_config WHERE key = 'escalation_pass_count';

    FOR v_case IN
        SELECT id, current_bidder_id, COALESCE(previous_bidders, '{}') as previous_bidders, COALESCE(current_bidder_pings, 1) as pings
        FROM funeral_cases
        WHERE status = 'requested'
          AND current_bidder_id IS NOT NULL
          AND bid_timeout_at < now()
    LOOP
        -- 최대 알람 횟수 도달 안 했으면 이 사람에게 다시 알람 (연장)
        IF v_case.pings < v_max_pings THEN
            UPDATE funeral_cases
            SET current_bidder_pings = v_case.pings + 1,
                bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval
            WHERE id = v_case.id;

            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES (v_case.current_bidder_id, 'assignment', 
                format('장례 배정 대기중 (알림 %s회차)', v_case.pings + 1),
                format('아직 배정을 수락하지 않으셨습니다. %s분 뒤 응답이 없으면 다른 팀장에게 이관될 수 있습니다.', v_timeout_mins), 
                false, now());

            v_processed := v_processed + 1;
            CONTINUE; -- 다음 케이스로 즉시 넘어감
        END IF;

        -- 여기서부터는 최대 알람 횟수(max_pings) 도달한 케이스 -> 다음 사람으로 패스!
        UPDATE bidding_history
        SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)'
        WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';

        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (v_case.current_bidder_id, 'warning', '배정 타임아웃',
            '설정된 응답 시간이 지나 다음 순번으로 이관되었습니다.', false, now());

        v_excl       := array_append(v_case.previous_bidders, v_case.current_bidder_id);
        v_pass_count := array_length(v_excl, 1);

        -- 에스컬레이션(관리자 긴급 알람) 체크
        IF v_pass_count >= v_escalation_count THEN
            PERFORM notify_escalation(v_case.id, v_pass_count, v_case.current_bidder_id);
        END IF;

        -- 다음 사람 탐색
        v_next_id   := NULL;
        v_is_cycling := false;

        IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
            v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id);
            IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
                v_is_cycling := true;
            END IF;
        END IF;

        IF v_next_id IS NOT NULL THEN
            UPDATE funeral_cases
            SET current_bidder_id = v_next_id,
                bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
                previous_bidders  = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_excl END,
                current_bidder_pings = 1   -- 다음 사람으로 넘어갔으므로 알람 횟수 1로 초기화
            WHERE id = v_case.id;

            INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
            VALUES (v_case.id, v_next_id, 'offered', now());

            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES (
                v_next_id, 'assignment',
                CASE WHEN v_pass_count >= v_escalation_count THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END,
                CASE WHEN v_pass_count >= v_escalation_count
                    THEN format('긴급! 앞서 %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count)
                    ELSE '순차배정 장례 콜입니다. 응답해주세요.'
                END,
                false, now()
            );
        END IF;

        v_processed := v_processed + 1;
    END LOOP;

    RETURN v_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. 팀장 수동 패스 로직(거절) 등에도 escalation_count 유동 적용 및 pings 초기화
CREATE OR REPLACE FUNCTION pass_bidding(p_case_id uuid, p_leader_id uuid, p_reason text DEFAULT '수동 패스')
RETURNS text AS $$
DECLARE
    v_order_map    jsonb;
    v_timeout_mins int;
    v_escalation_count int;
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
    WHERE id = p_case_id
    RETURNING previous_bidders INTO v_previous;

    v_pass_count := array_length(v_previous, 1);

    SELECT COALESCE(value::int, 3) INTO v_escalation_count FROM system_config WHERE key = 'escalation_pass_count';

    IF v_pass_count >= v_escalation_count THEN
        PERFORM notify_escalation(p_case_id, v_pass_count, p_leader_id);
    END IF;

    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';

    v_next_id := NULL;
    IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
        v_next_id := find_next_bidder(v_order_map, v_previous, p_leader_id);

        v_excl := array_append(COALESCE(v_previous, '{}'), p_leader_id);
        IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
            v_is_cycling := true;
        END IF;
    END IF;

    IF v_next_id IS NOT NULL THEN
        UPDATE funeral_cases
        SET current_bidder_id = v_next_id,
            bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
            previous_bidders  = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_previous END,
            current_bidder_pings = 1   -- 다음 사람에게 넘기므로 횟수 초기화
        WHERE id = p_case_id;

        INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
        VALUES (p_case_id, v_next_id, 'offered', now());

        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (
            v_next_id, 'assignment',
            CASE WHEN v_pass_count >= v_escalation_count THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END,
            CASE WHEN v_pass_count >= v_escalation_count
                THEN format('긴급! %s명이 미응답(거절)한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count)
                ELSE '순차배정 장례 콜입니다. 응답해주세요.'
            END,
            false, now()
        );

        IF v_is_cycling THEN RETURN 'CYCLING_RESTART'; END IF;
        RETURN 'PASSED_TO_NEXT';
    END IF;

    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id);
    RETURN 'NO_AVAILABLE_LEADER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

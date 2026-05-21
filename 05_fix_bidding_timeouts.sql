-- ======================================================================
-- [V4.1 순차배정 핑(Ping) 시스템 업데이트]
-- 팀장당 지정된 횟수(bidding_max_pings)만큼 알람을 재전송한 뒤에야
-- 다음 순번으로 턴을 넘기도록 로직을 수정합니다.
-- ======================================================================

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
            -- 핑 횟수가 남았으면 카운트만 올리고 타임아웃 3분 다시 연장
            UPDATE funeral_cases
            SET current_bidder_pings = COALESCE(v_case.current_bidder_pings, 1) + 1,
                bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval
            WHERE id = v_case.id;
        ELSE
            -- 핑 횟수를 다 채웠으면 (예: 3번 다 울렸으면) 다음 사람으로 순번 패스
            -- 1. 현재 입찰 히스토리를 timeout으로 마감
            UPDATE bidding_history
            SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)'
            WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';

            -- 2. 누락자 명단에 현재 팀장 추가
            v_excl := array_append(COALESCE(v_case.previous_bidders, '{}'), v_case.current_bidder_id);
            v_pass_count := array_length(v_excl, 1);

            -- 3. 다음 순번 찾기
            v_next_id   := NULL;
            v_is_cycling := false;

            IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
                v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id);

                IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
                    v_is_cycling := true;
                END IF;
            END IF;

            -- 4. 다음 순번이 있으면 배정 업데이트
            IF v_next_id IS NOT NULL THEN
                UPDATE funeral_cases
                SET current_bidder_id = v_next_id,
                    current_bidder_pings = 1, -- 새 팀장이므로 핑 횟수 1로 리셋
                    bid_timeout_at    = now() + (v_timeout_mins || ' minutes')::interval,
                    previous_bidders  = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_excl END
                WHERE id = v_case.id;

                INSERT INTO bidding_history (case_id, leader_id, status, offered_at)
                VALUES (v_case.id, v_next_id, 'offered', now());

                -- 5. 떠나는 팀장에게 안내 알림
                INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
                VALUES (
                    v_case.current_bidder_id, 'timeout_pass',
                    '⏰ 배정 시간 초과',
                    format('%s회 미응답으로 다음 순번에게 배정이 넘어갔습니다.', v_max_pings),
                    false, now()
                );
            END IF;
        END IF;

        v_processed := v_processed + 1;
    END LOOP;

    RETURN v_processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================================
-- [V4 순차배정 시간제한 시스템] 순환 배정 + 긴급 에스컬레이션
-- 1) 새 접수 시 → AFTER INSERT 트리거로 1순위 자동 배정
-- 2) 타임아웃/패스 시 → 다음 순번 자동 배정 (소진 시 처음부터 순환)
-- 3) 3번째 누락부터 → 관리자 + 해당 마스터 긴급 알람
-- 4) 이후 넘어갈 때마다 계속 알람
-- ======================================================================

-- 기존 함수/트리거 정리 (파라미터명 변경 시 DROP 필요)
DROP TRIGGER IF EXISTS trg_auto_assign_first_bidder ON funeral_cases;
DROP FUNCTION IF EXISTS auto_assign_first_bidder() CASCADE;
DROP FUNCTION IF EXISTS find_next_bidder(jsonb, uuid[], uuid) CASCADE;
DROP FUNCTION IF EXISTS notify_escalation(uuid, int, uuid) CASCADE;
DROP FUNCTION IF EXISTS process_bidding_timeouts() CASCADE;
DROP FUNCTION IF EXISTS pass_bidding(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS accept_bidding(uuid, uuid) CASCADE;

-- =============================================
-- 공통 헬퍼: 긴급 알람 발송 (관리자 전원 + 해당 마스터)
-- =============================================
CREATE OR REPLACE FUNCTION notify_escalation(p_case_id uuid, p_pass_count int, p_current_leader_id uuid)
RETURNS void AS $$
DECLARE
    v_admin     RECORD;
    v_master_id uuid;
    v_loc       text;
    v_pkg       text;
    v_msg       text;
BEGIN
    SELECT location, package_name INTO v_loc, v_pkg
    FROM funeral_cases WHERE id = p_case_id;

    v_msg := format(
        '⚠️ 긴급 배정 누락 %s회 발생' || E'\n' ||
        '장소: %s (%s)' || E'\n' ||
        '즉각 수동 배정이 필요합니다.',
        p_pass_count,
        COALESCE(v_loc, '미정'),
        COALESCE(v_pkg, '미정')
    );

    -- 관리자 전원
    FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (
            v_admin.id, 'emergency',
            format('🚨 배정 누락 %s회 — 즉시 확인 필요', p_pass_count),
            v_msg, false, now()
        );
    END LOOP;

    -- 현재 팀장의 마스터
    SELECT master_id INTO v_master_id FROM partners WHERE user_id = p_current_leader_id;
    IF v_master_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (
            v_master_id, 'emergency',
            format('🚨 팀원 배정 누락 %s회 — 확인 바랍니다', p_pass_count),
            v_msg, false, now()
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 공통 헬퍼: 다음 순번 찾기 (순환 로직 포함)
-- =============================================
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

    -- 출동대기 상태인 다음 순번 우선
    SELECT (kv.key)::uuid INTO v_next_id
    FROM jsonb_each_text(p_order_map) kv
    JOIN partners p ON p.user_id = (kv.key)::uuid
    WHERE p.current_status = 'waiting'
      AND p.status = 'approved'
      AND (kv.key)::uuid != ALL(v_excl)
    ORDER BY (kv.value)::int ASC
    LIMIT 1;

    -- 없으면 상태 무관
    IF v_next_id IS NULL THEN
        SELECT (kv.key)::uuid INTO v_next_id
        FROM jsonb_each_text(p_order_map) kv
        JOIN partners p ON p.user_id = (kv.key)::uuid
        WHERE p.status = 'approved'
          AND (kv.key)::uuid != ALL(v_excl)
        ORDER BY (kv.value)::int ASC
        LIMIT 1;
    END IF;

    -- 전체 소진 → 순환: previous 리셋 후 1순위부터
    IF v_next_id IS NULL THEN
        SELECT (kv.key)::uuid INTO v_next_id
        FROM jsonb_each_text(p_order_map) kv
        JOIN partners p ON p.user_id = (kv.key)::uuid
        WHERE p.current_status = 'waiting' AND p.status = 'approved'
        ORDER BY (kv.value)::int ASC LIMIT 1;

        IF v_next_id IS NULL THEN
            SELECT (kv.key)::uuid INTO v_next_id
            FROM jsonb_each_text(p_order_map) kv
            JOIN partners p ON p.user_id = (kv.key)::uuid
            WHERE p.status = 'approved'
            ORDER BY (kv.value)::int ASC LIMIT 1;
        END IF;
    END IF;

    RETURN v_next_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 1. 새 접수 시 1순위 자동 배정 트리거 (AFTER INSERT)
-- =============================================
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

    -- 출동대기 상태인 1순위 — last_assigned_at 기준 공정 순환
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
        -- AFTER INSERT이므로 UPDATE로 적용 (FK 문제 없음)
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

DROP TRIGGER IF EXISTS trg_auto_assign_first_bidder ON funeral_cases;
CREATE TRIGGER trg_auto_assign_first_bidder
    AFTER INSERT ON funeral_cases   -- AFTER: 케이스가 먼저 존재해야 bidding_history FK 가능
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_first_bidder();


-- =============================================
-- 2. 타임아웃 처리 (순환 배정 + 긴급 알람)
-- =============================================
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
        -- 히스토리 → timeout
        UPDATE bidding_history
        SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)'
        WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';

        -- 당사자 알림
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (v_case.current_bidder_id, 'warning', '배정 타임아웃',
            '배정 요청에 시간 내 응답하지 않아 다음 순번으로 이관되었습니다.', false, now());

        -- 누락 횟수 계산
        v_excl       := array_append(COALESCE(v_case.previous_bidders, '{}'), v_case.current_bidder_id);
        v_pass_count := array_length(v_excl, 1);

        -- 3회 이상 → 긴급 에스컬레이션
        IF v_pass_count >= 3 THEN
            PERFORM notify_escalation(v_case.id, v_pass_count, v_case.current_bidder_id);
        END IF;

        -- 다음 순번 (순환 감지)
        v_next_id   := NULL;
        v_is_cycling := false;

        IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
            v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id);

            -- 다음 사람이 이미 previous에 있다면 새 순환 시작
            IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN
                v_is_cycling := true;
            END IF;
        END IF;

        IF v_next_id IS NOT NULL THEN
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
                CASE WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END,
                CASE WHEN v_pass_count >= 3
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


-- =============================================
-- 3. 팀장 수동 패스 RPC (순환 + 긴급 알람)
-- =============================================
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

    -- 히스토리 (rejected)
    UPDATE bidding_history
    SET status = 'rejected', resolved_at = now(), reason = p_reason
    WHERE case_id = p_case_id AND leader_id = p_leader_id AND status = 'offered';

    -- previous_bidders 업데이트
    UPDATE funeral_cases
    SET previous_bidders = array_append(COALESCE(previous_bidders, '{}'), p_leader_id)
    WHERE id = p_case_id;

    SELECT previous_bidders INTO v_previous FROM funeral_cases WHERE id = p_case_id;
    v_pass_count := array_length(v_previous, 1);

    -- 3회 이상 → 긴급 에스컬레이션
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
            CASE WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END,
            CASE WHEN v_pass_count >= 3
                THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count)
                ELSE '순차배정으로 장례 콜이 도착했습니다. 제한 시간 내 응답해주세요.'
            END,
            false, now()
        );

        IF v_is_cycling THEN RETURN 'CYCLING_RESTART'; END IF;
        RETURN 'PASSED_TO_NEXT';
    END IF;

    -- 극히 드문 케이스: 아무도 없음
    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id);
    RETURN 'NO_AVAILABLE_LEADER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 4. 팀장 수락 RPC
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

    RETURN 'ACCEPTED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

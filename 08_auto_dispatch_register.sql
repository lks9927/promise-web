-- ======================================================================
-- [자동 순번 등록] 팀장 승인 시 dispatch_order_map에 자동 추가
-- system_config.auto_dispatch_register = 'true' 일 때만 작동
-- ======================================================================

CREATE OR REPLACE FUNCTION auto_add_to_dispatch_order()
RETURNS TRIGGER AS $$
DECLARE
    v_auto_register text;
    v_order_map     jsonb;
    v_max_order     int;
    v_role          text;
BEGIN
    -- 승인 상태로 변경된 경우에만 실행
    IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
        RETURN NEW;
    END IF;

    -- 해당 유저가 팀장(leader)인지 확인
    SELECT role INTO v_role FROM profiles WHERE id = NEW.user_id;
    IF v_role != 'leader' THEN
        RETURN NEW;
    END IF;

    -- 자동 등록 설정 확인
    SELECT value INTO v_auto_register FROM system_config WHERE key = 'auto_dispatch_register';
    IF v_auto_register IS NULL OR v_auto_register != 'true' THEN
        RETURN NEW;
    END IF;

    -- 현재 순번표 로드
    SELECT COALESCE(value::jsonb, '{}'::jsonb) INTO v_order_map 
    FROM system_config WHERE key = 'dispatch_order_map';
    
    IF v_order_map IS NULL THEN
        v_order_map := '{}'::jsonb;
    END IF;

    -- 이미 등록되어 있으면 스킵
    IF v_order_map ? NEW.user_id::text THEN
        RETURN NEW;
    END IF;

    -- 현재 최대 순번 구하기
    SELECT COALESCE(MAX((val)::int), 0) INTO v_max_order
    FROM jsonb_each_text(v_order_map) AS t(key, val);

    -- 맨 뒤 순번으로 추가
    v_order_map := v_order_map || jsonb_build_object(NEW.user_id::text, v_max_order + 1);

    -- 저장
    INSERT INTO system_config (key, value)
    VALUES ('dispatch_order_map', v_order_map::text)
    ON CONFLICT (key) DO UPDATE SET value = v_order_map::text;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_add_dispatch_order ON partners;
CREATE TRIGGER trg_auto_add_dispatch_order
    AFTER UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_to_dispatch_order();

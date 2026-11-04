-- P3b: 기준선2 운영 배정 함수 중 마스터 팀장 후보 판정만 변경한다.
-- grade='S' 내부값은 유지하며 S 하위 Master 팀장도 독립 Master 팀장과 같은 후보가 된다.

CREATE OR REPLACE FUNCTION public.is_master_leader(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.partners p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.user_id = p_user_id
      AND p.grade IN ('Master', 'S') -- P3b: master_id IS NULL 대신 등급으로 마스터 팀장 판정
      AND pr.role = 'leader'
      AND p.status = 'approved'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_assign_first_bidder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_dispatch_mode text; v_order_map jsonb; v_first_id uuid; v_timeout_mins int;
BEGIN
  IF NEW.status != 'requested' THEN RETURN NEW; END IF;
  SELECT value INTO v_dispatch_mode FROM system_config WHERE key = 'dispatch_mode';
  IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential', 'team_hybrid') THEN RETURN NEW; END IF;
  SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
  IF v_order_map IS NULL OR v_order_map = '{}'::jsonb THEN RETURN NEW; END IF;
  SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
  IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
  SELECT p.user_id INTO v_first_id FROM partners p
  WHERE p.current_status = 'waiting' AND p.status = 'approved'
    AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE (kv.key)::uuid = p.user_id)
  ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  IF v_first_id IS NULL THEN
    SELECT p.user_id INTO v_first_id FROM partners p JOIN profiles pr ON pr.id = p.user_id
    WHERE p.status = 'approved' AND p.current_status != 'off'
      AND p.grade IN ('Master', 'S') -- P3b: S 하위 Master 팀장도 비상 후보
      AND pr.role = 'leader'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
    IF v_first_id IS NOT NULL THEN PERFORM notify_emergency_dispatch(NEW.id, v_first_id); END IF;
  END IF;
  IF v_first_id IS NULL THEN PERFORM notify_escalation(NEW.id, 0, NULL); RETURN NEW; END IF;
  UPDATE funeral_cases SET current_bidder_id = v_first_id, current_bidder_pings = 1,
    bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = '{}'
  WHERE id = NEW.id;
  INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (NEW.id, v_first_id, 'offered', now());
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb, p_previous uuid[], p_current_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
  v_excl := array_append(COALESCE(p_previous, '{}'), p_current_id);
  SELECT p.user_id INTO v_next_id FROM partners p
  WHERE p.current_status = 'waiting' AND p.status = 'approved' AND p.user_id != ALL(v_excl)
    AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
  ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  IF v_next_id IS NULL THEN
    SELECT p.user_id INTO v_next_id FROM partners p
    WHERE p.current_status = 'waiting' AND p.status = 'approved'
      AND EXISTS (SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE (kv.key)::uuid = p.user_id)
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  END IF;
  IF v_next_id IS NULL THEN
    SELECT p.user_id INTO v_next_id FROM partners p JOIN profiles pr ON pr.id = p.user_id
    WHERE p.status = 'approved' AND p.current_status != 'off'
      AND p.grade IN ('Master', 'S') -- P3b: S 하위 Master 팀장도 비상 후보
      AND pr.role = 'leader'
    ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
  END IF;
  RETURN v_next_id;
END;
$function$;

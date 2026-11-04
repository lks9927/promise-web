-- P4 지역별 팀장 알림. 적용 순서: 이 파일 실행 후 send-alert Edge Function을 배포한다.
CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES public.regions(id),
  name text NOT NULL, level text NOT NULL CHECK (level IN ('sido','sigungu')),
  sort integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  UNIQUE(parent_id, name)
);
CREATE TABLE IF NOT EXISTS public.partner_alert_regions (
  partner_id uuid NOT NULL REFERENCES public.partners(user_id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  PRIMARY KEY(partner_id, region_id)
);
ALTER TABLE public.funeral_cases ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id);
CREATE INDEX IF NOT EXISTS funeral_cases_region_id_idx ON public.funeral_cases(region_id);

INSERT INTO public.regions(parent_id,name,level,sort)
SELECT NULL::uuid, v.name, 'sido', v.sort
FROM (VALUES ('서울특별시',1),('인천광역시',2),('경기도',3)) AS v(name,sort)
WHERE NOT EXISTS (SELECT 1 FROM public.regions r WHERE r.parent_id IS NULL AND r.name=v.name AND r.level='sido');
WITH seed(sido,name,sort) AS (VALUES
 ('서울특별시','종로구',1),('서울특별시','중구',2),('서울특별시','용산구',3),('서울특별시','성동구',4),('서울특별시','광진구',5),('서울특별시','동대문구',6),('서울특별시','중랑구',7),('서울특별시','성북구',8),('서울특별시','강북구',9),('서울특별시','도봉구',10),('서울특별시','노원구',11),('서울특별시','은평구',12),('서울특별시','서대문구',13),('서울특별시','마포구',14),('서울특별시','양천구',15),('서울특별시','강서구',16),('서울특별시','구로구',17),('서울특별시','금천구',18),('서울특별시','영등포구',19),('서울특별시','동작구',20),('서울특별시','관악구',21),('서울특별시','서초구',22),('서울특별시','강남구',23),('서울특별시','송파구',24),('서울특별시','강동구',25),
 ('인천광역시','중구',1),('인천광역시','동구',2),('인천광역시','미추홀구',3),('인천광역시','연수구',4),('인천광역시','남동구',5),('인천광역시','부평구',6),('인천광역시','계양구',7),('인천광역시','서구',8),('인천광역시','강화군',9),('인천광역시','옹진군',10),
 ('경기도','수원시',1),('경기도','성남시',2),('경기도','의정부시',3),('경기도','안양시',4),('경기도','부천시',5),('경기도','광명시',6),('경기도','평택시',7),('경기도','동두천시',8),('경기도','안산시',9),('경기도','고양시',10),('경기도','과천시',11),('경기도','구리시',12),('경기도','남양주시',13),('경기도','오산시',14),('경기도','시흥시',15),('경기도','군포시',16),('경기도','의왕시',17),('경기도','하남시',18),('경기도','용인시',19),('경기도','파주시',20),('경기도','이천시',21),('경기도','안성시',22),('경기도','김포시',23),('경기도','화성시',24),('경기도','광주시',25),('경기도','양주시',26),('경기도','포천시',27),('경기도','여주시',28),('경기도','연천군',29),('경기도','가평군',30),('경기도','양평군',31))
INSERT INTO public.regions(parent_id,name,level,sort)
SELECT r.id, seed.name, 'sigungu', seed.sort FROM seed JOIN public.regions r ON r.name=seed.sido AND r.level='sido'
WHERE NOT EXISTS (SELECT 1 FROM public.regions old WHERE old.parent_id=r.id AND old.name=seed.name AND old.level='sigungu');

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_alert_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regions_read_all ON public.regions;
CREATE POLICY regions_read_all ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS regions_admin_write ON public.regions;
CREATE POLICY regions_admin_write ON public.regions FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS partner_alert_regions_owner_read ON public.partner_alert_regions;
CREATE POLICY partner_alert_regions_owner_read ON public.partner_alert_regions FOR SELECT USING (partner_id=auth.uid() OR (SELECT public.is_admin()));
DROP POLICY IF EXISTS partner_alert_regions_owner_write ON public.partner_alert_regions;
CREATE POLICY partner_alert_regions_owner_write ON public.partner_alert_regions FOR ALL USING (partner_id=auth.uid()) WITH CHECK (partner_id=auth.uid());

CREATE OR REPLACE FUNCTION public.validate_partner_alert_region()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.partner_id AND role='leader') THEN RAISE EXCEPTION '팀장만 알림 지역을 선택할 수 있습니다.' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS partner_alert_regions_leader_only ON public.partner_alert_regions;
CREATE TRIGGER partner_alert_regions_leader_only BEFORE INSERT OR UPDATE ON public.partner_alert_regions FOR EACH ROW EXECUTE FUNCTION public.validate_partner_alert_region();
INSERT INTO public.system_config(key,value) VALUES ('regional_alert_mode','off') ON CONFLICT (key) DO NOTHING;

-- Single source of truth for the opt-in rule. Approval, waiting and dispatch-order checks stay in existing candidate queries.
CREATE OR REPLACE FUNCTION public.leader_passes_region_filter(p_leader uuid,p_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
WITH cfg AS (SELECT COALESCE((SELECT value FROM public.system_config WHERE key='regional_alert_mode'),'off') AS mode),
case_region AS (SELECT fc.region_id, r.parent_id FROM public.funeral_cases fc LEFT JOIN public.regions r ON r.id=fc.region_id WHERE fc.id=p_case_id),
prefs AS (SELECT par.region_id FROM public.partner_alert_regions par JOIN public.regions r ON r.id=par.region_id AND r.active=true WHERE par.partner_id=p_leader)
SELECT CASE WHEN (SELECT mode FROM cfg)='off' OR (SELECT region_id FROM case_region) IS NULL THEN true
 WHEN NOT EXISTS (SELECT 1 FROM prefs) THEN true
 WHEN (SELECT mode FROM cfg)='sigungu' THEN EXISTS (SELECT 1 FROM prefs p WHERE p.region_id=(SELECT region_id FROM case_region) OR p.region_id=(SELECT parent_id FROM case_region))
 WHEN (SELECT mode FROM cfg)='sido' THEN EXISTS (SELECT 1 FROM prefs p JOIN public.regions pr ON pr.id=p.region_id WHERE COALESCE(pr.parent_id,pr.id)=COALESCE((SELECT parent_id FROM case_region),(SELECT region_id FROM case_region)))
 ELSE true END; $$;
REVOKE ALL ON FUNCTION public.leader_passes_region_filter(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leader_passes_region_filter(uuid,uuid) TO authenticated, service_role;

-- P3b's latest S-grade candidate behavior plus the sole additional region predicate.
CREATE OR REPLACE FUNCTION public.auto_assign_first_bidder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_dispatch_mode text; v_order_map jsonb; v_first_id uuid; v_timeout_mins int;
BEGIN
 IF NEW.status!='requested' THEN RETURN NEW; END IF;
 SELECT value INTO v_dispatch_mode FROM public.system_config WHERE key='dispatch_mode';
 IF v_dispatch_mode IS NULL OR v_dispatch_mode NOT IN ('sequential','team_hybrid') THEN RETURN NEW; END IF;
 SELECT value::jsonb INTO v_order_map FROM public.system_config WHERE key='dispatch_order_map';
 IF v_order_map IS NULL OR v_order_map='{}'::jsonb THEN RETURN NEW; END IF;
 SELECT COALESCE(value::int,5) INTO v_timeout_mins FROM public.system_config WHERE key='bidding_timeout_minutes';
 SELECT p.user_id INTO v_first_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,NEW.id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_first_id IS NULL THEN SELECT p.user_id INTO v_first_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,NEW.id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; IF v_first_id IS NOT NULL THEN PERFORM public.notify_emergency_dispatch(NEW.id,v_first_id); END IF; END IF;
 IF v_first_id IS NULL THEN PERFORM public.notify_escalation(NEW.id,0,NULL); RETURN NEW; END IF;
 UPDATE public.funeral_cases SET current_bidder_id=v_first_id,current_bidder_pings=1,bid_timeout_at=now()+(v_timeout_mins||' minutes')::interval,previous_bidders='{}' WHERE id=NEW.id;
 INSERT INTO public.bidding_history(case_id,leader_id,status,offered_at) VALUES(NEW.id,v_first_id,'offered',now()); RETURN NEW;
END; $$;

-- Callers that know the case must use this four-argument form; it preserves all P3b candidate constraints and adds only the filter.
CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb,p_previous uuid[],p_current_id uuid,p_case_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
 v_excl:=array_append(COALESCE(p_previous,'{}'),p_current_id);
 SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND p.user_id!=ALL(v_excl) AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 RETURN v_next_id;
END; $$;

-- Keep the production timeout/pass logic intact; only pass the known case id to the regional-aware selector.
CREATE OR REPLACE FUNCTION public.process_bidding_timeouts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
    v_case RECORD; v_order_map jsonb; v_timeout_mins int; v_max_pings int; v_next_id uuid;
    v_pass_count int; v_excl uuid[]; v_is_cycling boolean; v_processed integer := 0;
BEGIN
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    SELECT COALESCE(value::int, 3) INTO v_max_pings FROM system_config WHERE key = 'bidding_max_pings';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
    IF v_max_pings IS NULL THEN v_max_pings := 3; END IF;
    FOR v_case IN SELECT id, current_bidder_id, previous_bidders, current_bidder_pings FROM funeral_cases WHERE status = 'requested' AND current_bidder_id IS NOT NULL AND bid_timeout_at < now() LOOP
        IF COALESCE(v_case.current_bidder_pings, 1) < v_max_pings THEN
            UPDATE funeral_cases SET current_bidder_pings = COALESCE(v_case.current_bidder_pings, 1) + 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval WHERE id = v_case.id;
        ELSE
            UPDATE bidding_history SET status = 'timeout', resolved_at = now(), reason = '시간 초과 (자동 패스)' WHERE case_id = v_case.id AND leader_id = v_case.current_bidder_id AND status = 'offered';
            INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_case.current_bidder_id, 'warning', '배정 미응답', format('%s회 미응답으로 다음 순번에게 배정됩니다.', v_max_pings), false, now());
            v_excl := array_append(COALESCE(v_case.previous_bidders, '{}'), v_case.current_bidder_id); v_pass_count := array_length(v_excl, 1);
            IF v_pass_count >= 3 THEN PERFORM notify_escalation(v_case.id, v_pass_count, v_case.current_bidder_id); END IF;
            v_next_id := NULL; v_is_cycling := false;
            IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
                v_next_id := find_next_bidder(v_order_map, v_case.previous_bidders, v_case.current_bidder_id, v_case.id); -- P4: pass case id
                IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN v_is_cycling := true; END IF;
            END IF;
            IF v_next_id IS NOT NULL THEN
                IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN PERFORM notify_emergency_dispatch(v_case.id, v_next_id); END IF;
                UPDATE funeral_cases SET current_bidder_id = v_next_id, current_bidder_pings = 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_excl END WHERE id = v_case.id;
                INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (v_case.id, v_next_id, 'offered', now());
                INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_next_id, 'assignment', CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청' WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END, CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정합니다.' WHEN v_pass_count >= 3 THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count) ELSE '순차배정으로 새로운 콜이 배정되었습니다. 제한 시간 내 응답해주세요.' END, false, now());
            END IF;
        END IF;
        v_processed := v_processed + 1;
    END LOOP;
    RETURN v_processed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pass_bidding_internal(p_case_id uuid, p_leader_id uuid, p_reason text DEFAULT '수동 패스'::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE
    v_order_map jsonb; v_timeout_mins int; v_next_id uuid; v_previous uuid[]; v_excl uuid[]; v_pass_count int; v_is_cycling boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM funeral_cases WHERE id = p_case_id AND current_bidder_id = p_leader_id AND status = 'requested') THEN RETURN 'NOT_CURRENT_BIDDER'; END IF;
    UPDATE bidding_history SET status = 'rejected', resolved_at = now(), reason = p_reason WHERE case_id = p_case_id AND leader_id = p_leader_id AND status = 'offered';
    UPDATE funeral_cases SET previous_bidders = array_append(COALESCE(previous_bidders, '{}'), p_leader_id) WHERE id = p_case_id;
    SELECT previous_bidders INTO v_previous FROM funeral_cases WHERE id = p_case_id; v_pass_count := array_length(v_previous, 1);
    IF v_pass_count >= 3 THEN PERFORM notify_escalation(p_case_id, v_pass_count, p_leader_id); END IF;
    SELECT value::jsonb INTO v_order_map FROM system_config WHERE key = 'dispatch_order_map';
    SELECT COALESCE(value::int, 5) INTO v_timeout_mins FROM system_config WHERE key = 'bidding_timeout_minutes';
    IF v_timeout_mins IS NULL THEN v_timeout_mins := 5; END IF;
    v_next_id := NULL;
    IF v_order_map IS NOT NULL AND v_order_map != '{}'::jsonb THEN
        v_next_id := find_next_bidder(v_order_map, v_previous, p_leader_id, p_case_id); -- P4: pass case id
        v_excl := array_append(COALESCE(v_previous, '{}'), p_leader_id);
        IF v_next_id IS NOT NULL AND v_next_id = ANY(v_excl) THEN v_is_cycling := true; END IF;
    END IF;
    IF v_next_id IS NOT NULL THEN
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN PERFORM notify_emergency_dispatch(p_case_id, v_next_id); END IF;
        UPDATE funeral_cases SET current_bidder_id = v_next_id, current_bidder_pings = 1, bid_timeout_at = now() + (v_timeout_mins || ' minutes')::interval, previous_bidders = CASE WHEN v_is_cycling THEN '{}'::uuid[] ELSE v_previous END WHERE id = p_case_id;
        INSERT INTO bidding_history (case_id, leader_id, status, offered_at) VALUES (p_case_id, v_next_id, 'offered', now());
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES (v_next_id, 'assignment', CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '🚨 비상 배정 요청' WHEN v_pass_count >= 3 THEN '🚨 긴급 배정 요청' ELSE '새 배정 요청' END, CASE WHEN is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN '비상! 대기 중인 팀장이 전원 부재하여 마스터 팀장에게 비상 배정합니다.' WHEN v_pass_count >= 3 THEN format('긴급! %s명이 미응답한 장례 콜입니다. 즉시 응답해주세요.', v_pass_count) ELSE '순차배정으로 새로운 콜이 배정되었습니다. 제한 시간 내 응답해주세요.' END, false, now());
        IF is_master_leader(v_next_id) AND (SELECT current_status FROM partners WHERE user_id = v_next_id) != 'waiting' THEN RETURN 'ESCALATED_TO_MASTER'; END IF;
        IF v_is_cycling THEN RETURN 'CYCLING_RESTART'; END IF;
        RETURN 'PASSED_TO_NEXT';
    END IF;
    PERFORM notify_escalation(p_case_id, v_pass_count + 1, p_leader_id); RETURN 'NO_AVAILABLE_LEADER';
END;
$function$;

-- The two production callers now have explicit four-argument calls, so remove the ambiguous legacy overload.
DROP FUNCTION IF EXISTS public.find_next_bidder(jsonb,uuid[],uuid);

-- Existing public RPC callers keep their named six arguments; DEFAULT preserves old calls.
DROP FUNCTION IF EXISTS public.submit_emergency_case(text,text,text,text,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_emergency_case(p_name text,p_phone text,p_location text,p_package_name text,p_coupon_code text DEFAULT NULL,p_dealer_id uuid DEFAULT NULL,p_region_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_customer_id uuid; v_case_id uuid; v_dealer uuid:=p_dealer_id;
BEGIN
 IF p_region_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.regions WHERE id=p_region_id AND level='sigungu' AND active) THEN RAISE EXCEPTION '유효한 시·군·구 지역이 아닙니다.' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_customer_id FROM public.profiles WHERE role='customer' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') LIMIT 1;
 IF v_customer_id IS NULL THEN v_customer_id:=gen_random_uuid(); INSERT INTO public.profiles(id,name,phone,role) VALUES(v_customer_id,btrim(p_name),p_phone,'customer'); END IF;
 INSERT INTO public.funeral_cases(customer_id,dealer_id,location,package_name,status,funnel_type,coupon_code,region_id) VALUES(v_customer_id,v_dealer,btrim(coalesce(p_location,'')),btrim(coalesce(p_package_name,'')),'requested',CASE WHEN v_dealer IS NULL THEN 'organic_search' ELSE 'partner_referral' END,NULLIF(upper(btrim(coalesce(p_coupon_code,''))),''),p_region_id) RETURNING id INTO v_case_id;
 RETURN v_case_id;
END; $$;

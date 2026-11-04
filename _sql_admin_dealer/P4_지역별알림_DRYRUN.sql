BEGIN;
ALTER TABLE public.funeral_cases DISABLE TRIGGER "funeral-case-alert";

-- P4 吏??퀎 ????뚮┝. ?곸슜 ?쒖꽌: ???뚯씪 ?ㅽ뻾 ??send-alert Edge Function??諛고룷?쒕떎.
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
FROM (VALUES ('?쒖슱?밸퀎??,1),('?몄쿇愿묒뿭??,2),('寃쎄린??,3)) AS v(name,sort)
WHERE NOT EXISTS (SELECT 1 FROM public.regions r WHERE r.parent_id IS NULL AND r.name=v.name AND r.level='sido');
WITH seed(sido,name,sort) AS (VALUES
 ('?쒖슱?밸퀎??,'醫낅줈援?,1),('?쒖슱?밸퀎??,'以묎뎄',2),('?쒖슱?밸퀎??,'?⑹궛援?,3),('?쒖슱?밸퀎??,'?깅룞援?,4),('?쒖슱?밸퀎??,'愿묒쭊援?,5),('?쒖슱?밸퀎??,'?숇?臾멸뎄',6),('?쒖슱?밸퀎??,'以묐옉援?,7),('?쒖슱?밸퀎??,'?깅턿援?,8),('?쒖슱?밸퀎??,'媛뺣턿援?,9),('?쒖슱?밸퀎??,'?꾨큺援?,10),('?쒖슱?밸퀎??,'?몄썝援?,11),('?쒖슱?밸퀎??,'??됯뎄',12),('?쒖슱?밸퀎??,'?쒕?臾멸뎄',13),('?쒖슱?밸퀎??,'留덊룷援?,14),('?쒖슱?밸퀎??,'?묒쿇援?,15),('?쒖슱?밸퀎??,'媛뺤꽌援?,16),('?쒖슱?밸퀎??,'援щ줈援?,17),('?쒖슱?밸퀎??,'湲덉쿇援?,18),('?쒖슱?밸퀎??,'?곷벑?ш뎄',19),('?쒖슱?밸퀎??,'?숈옉援?,20),('?쒖슱?밸퀎??,'愿?낃뎄',21),('?쒖슱?밸퀎??,'?쒖큹援?,22),('?쒖슱?밸퀎??,'媛뺣궓援?,23),('?쒖슱?밸퀎??,'?≫뙆援?,24),('?쒖슱?밸퀎??,'媛뺣룞援?,25),
 ('?몄쿇愿묒뿭??,'以묎뎄',1),('?몄쿇愿묒뿭??,'?숆뎄',2),('?몄쿇愿묒뿭??,'誘몄텛?援?,3),('?몄쿇愿묒뿭??,'?곗닔援?,4),('?몄쿇愿묒뿭??,'?⑤룞援?,5),('?몄쿇愿묒뿭??,'遺?됯뎄',6),('?몄쿇愿묒뿭??,'怨꾩뼇援?,7),('?몄쿇愿묒뿭??,'?쒓뎄',8),('?몄쿇愿묒뿭??,'媛뺥솕援?,9),('?몄쿇愿묒뿭??,'?뱀쭊援?,10),
 ('寃쎄린??,'?섏썝??,1),('寃쎄린??,'?깅궓??,2),('寃쎄린??,'?섏젙遺??,3),('寃쎄린??,'?덉뼇??,4),('寃쎄린??,'遺泥쒖떆',5),('寃쎄린??,'愿묐챸??,6),('寃쎄린??,'?됲깮??,7),('寃쎄린??,'?숇몢泥쒖떆',8),('寃쎄린??,'?덉궛??,9),('寃쎄린??,'怨좎뼇??,10),('寃쎄린??,'怨쇱쿇??,11),('寃쎄린??,'援щ━??,12),('寃쎄린??,'?⑥뼇二쇱떆',13),('寃쎄린??,'?ㅼ궛??,14),('寃쎄린??,'?쒗씎??,15),('寃쎄린??,'援고룷??,16),('寃쎄린??,'?섏솗??,17),('寃쎄린??,'?섎궓??,18),('寃쎄린??,'?⑹씤??,19),('寃쎄린??,'?뚯＜??,20),('寃쎄린??,'?댁쿇??,21),('寃쎄린??,'?덉꽦??,22),('寃쎄린??,'源?ъ떆',23),('寃쎄린??,'?붿꽦??,24),('寃쎄린??,'愿묒＜??,25),('寃쎄린??,'?묒＜??,26),('寃쎄린??,'?ъ쿇??,27),('寃쎄린??,'?ъ＜??,28),('寃쎄린??,'?곗쿇援?,29),('寃쎄린??,'媛?됯뎔',30),('寃쎄린??,'?묓룊援?,31))
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.partner_id AND role='leader') THEN RAISE EXCEPTION '??λ쭔 ?뚮┝ 吏??쓣 ?좏깮?????덉뒿?덈떎.' USING ERRCODE='42501'; END IF;
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
prefs AS (SELECT region_id FROM public.partner_alert_regions WHERE partner_id=p_leader)
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
CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb,p_previous uuid[],p_current_id uuid,p_case_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
 v_excl:=array_append(COALESCE(p_previous,'{}'),p_current_id);
 SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND p.user_id!=ALL(v_excl) AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,p_case_id) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 RETURN v_next_id;
END; $$;

-- Existing public RPC callers keep their named six arguments; DEFAULT preserves old calls.
DROP FUNCTION IF EXISTS public.submit_emergency_case(text,text,text,text,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_emergency_case(p_name text,p_phone text,p_location text,p_package_name text,p_coupon_code text DEFAULT NULL,p_dealer_id uuid DEFAULT NULL,p_region_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_customer_id uuid; v_case_id uuid; v_dealer uuid:=p_dealer_id;
BEGIN
 IF p_region_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.regions WHERE id=p_region_id AND level='sigungu' AND active) THEN RAISE EXCEPTION '?좏슚???쑣룰뎔쨌援?吏??씠 ?꾨떃?덈떎.' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_customer_id FROM public.profiles WHERE role='customer' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') LIMIT 1;
 IF v_customer_id IS NULL THEN v_customer_id:=gen_random_uuid(); INSERT INTO public.profiles(id,name,phone,role) VALUES(v_customer_id,btrim(p_name),p_phone,'customer'); END IF;
 INSERT INTO public.funeral_cases(customer_id,dealer_id,location,package_name,status,funnel_type,coupon_code,region_id) VALUES(v_customer_id,v_dealer,btrim(coalesce(p_location,'')),btrim(coalesce(p_package_name,'')),'requested',CASE WHEN v_dealer IS NULL THEN 'organic_search' ELSE 'partner_referral' END,NULLIF(upper(btrim(coalesce(p_coupon_code,''))),''),p_region_id) RETURNING id INTO v_case_id;
 RETURN v_case_id;
END; $$;


-- Scenario checks inside this rollback-only transaction.
SELECT COALESCE((SELECT value FROM public.system_config WHERE key='regional_alert_mode'),'off') AS regional_alert_mode;
SELECT fc.id, fc.region_id, public.leader_passes_region_filter(p.user_id, fc.id) AS passes_region FROM public.funeral_cases fc CROSS JOIN public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' ORDER BY fc.created_at DESC LIMIT 50;
ROLLBACK;

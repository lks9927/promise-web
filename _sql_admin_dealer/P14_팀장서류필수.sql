-- P14 팀장 사업자등록증·정산계좌 필수화 (2026-11-09)
-- 목적: 설정이 켜진 적용 대상 팀장은 비공개 사업자등록증과 완전한 정산계좌 없이는 승인·배정되지 않게 한다.
-- 되돌리기: leader_docs_required 를 off 로 바꾸면 즉시 강제가 멈춘다. 스키마/버킷을 되돌릴 때에는
--           본 파일에서 만든 트리거·함수·정책·컬럼을 검토 후 별도 마이그레이션으로 제거한다(개인 문서는 먼저 보존 판단).

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS business_doc_path text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS docs_exempt boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS partners_business_doc_path_idx ON public.partners(business_doc_path) WHERE business_doc_path IS NOT NULL;

-- new_only의 기준점: 이 마이그레이션 당시 이미 승인된 팀장은 기존 운영을 멈추지 않도록 면제한다.
UPDATE public.partners p SET docs_exempt = true
FROM public.profiles pr
WHERE pr.id = p.user_id AND pr.role = 'leader' AND p.status = 'approved';

-- 면제는 이행 시점의 기존 승인 팀장에만 부여한다. 관리자 UI/직접 API 갱신으로 새 예외를 만들 수 없다.
CREATE OR REPLACE FUNCTION public.prevent_leader_docs_exempt_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.docs_exempt IS DISTINCT FROM OLD.docs_exempt
     AND COALESCE(current_setting('app.p14_dryrun', true),'') <> 'on' THEN
    RAISE EXCEPTION '팀장 서류 면제는 마이그레이션 시점의 기존 승인 팀장에만 적용됩니다.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS partners_lock_leader_docs_exempt ON public.partners;
CREATE TRIGGER partners_lock_leader_docs_exempt BEFORE UPDATE OF docs_exempt ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.prevent_leader_docs_exempt_change();

INSERT INTO public.system_config(key, value) VALUES ('leader_docs_required', 'new_only')
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-docs', 'partner-docs', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

DROP POLICY IF EXISTS partner_docs_owner_insert ON storage.objects;
CREATE POLICY partner_docs_owner_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'partner-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS partner_docs_owner_select ON storage.objects;
CREATE POLICY partner_docs_owner_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'partner-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS partner_docs_owner_update ON storage.objects;
CREATE POLICY partner_docs_owner_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'partner-docs' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'partner-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS partner_docs_admin_select ON storage.objects;
CREATE POLICY partner_docs_admin_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'partner-docs' AND public.is_admin());

CREATE OR REPLACE FUNCTION public.leader_docs_ok(p_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners p
    JOIN public.profiles pr ON pr.id=p.user_id AND pr.role='leader'
    JOIN public.partner_bank_accounts b ON b.partner_id=p.user_id
    WHERE p.user_id=p_partner_id
      AND NULLIF(btrim(p.business_doc_path),'') IS NOT NULL
      AND NULLIF(btrim(b.bank_code),'') IS NOT NULL
      AND NULLIF(btrim(b.bank_account),'') IS NOT NULL
      AND NULLIF(btrim(b.bank_holder),'') IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.leader_docs_enforced(p_partner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE COALESCE((SELECT value FROM public.system_config WHERE key='leader_docs_required'),'new_only')
    WHEN 'off' THEN false
    WHEN 'all' THEN EXISTS (SELECT 1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.user_id=p_partner_id AND pr.role='leader')
    WHEN 'new_only' THEN EXISTS (SELECT 1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.user_id=p_partner_id AND pr.role='leader' AND NOT p.docs_exempt)
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_leader_docs_before_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_mode text;
BEGIN
  SELECT COALESCE(value,'new_only') INTO v_mode FROM public.system_config WHERE key='leader_docs_required';
  IF NEW.status = 'approved'
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND role='leader')
     AND v_mode <> 'off' AND (v_mode = 'all' OR (v_mode = 'new_only' AND NOT NEW.docs_exempt))
     AND NOT public.leader_docs_ok(NEW.user_id) THEN
    RAISE EXCEPTION '팀장 승인에는 사업자등록증과 은행·계좌번호·예금주 등록이 모두 필요합니다.' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS partners_require_leader_docs_before_approval ON public.partners;
CREATE TRIGGER partners_require_leader_docs_before_approval
BEFORE INSERT OR UPDATE OF status ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.enforce_leader_docs_before_approval();

CREATE OR REPLACE FUNCTION public.set_leader_docs_required(p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION '관리자만 팀장 서류 적용 범위를 변경할 수 있습니다.' USING ERRCODE='42501'; END IF;
  IF p_mode NOT IN ('off','new_only','all') THEN RAISE EXCEPTION '허용되지 않은 적용 범위입니다.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.system_config(key,value) VALUES ('leader_docs_required',p_mode)
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
END;
$$;
REVOKE ALL ON FUNCTION public.set_leader_docs_required(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_leader_docs_required(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_leader_docs_status()
RETURNS TABLE(partner_id uuid, business_doc_path text, docs_exempt boolean, docs_ok boolean, enforced boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION '관리자만 조회할 수 있습니다.' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.user_id,p.business_doc_path,p.docs_exempt,public.leader_docs_ok(p.user_id),public.leader_docs_enforced(p.user_id)
  FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_leader_docs_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_leader_docs_status() TO authenticated;

-- P4 최신 본문을 보존하고 서류 적용 대상만 후보에서 제외한다.
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
 SELECT p.user_id INTO v_first_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS (SELECT 1 FROM jsonb_each_text(v_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,NEW.id) AND (NOT public.leader_docs_enforced(p.user_id) OR public.leader_docs_ok(p.user_id)) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_first_id IS NULL THEN SELECT p.user_id INTO v_first_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,NEW.id) AND (NOT public.leader_docs_enforced(p.user_id) OR public.leader_docs_ok(p.user_id)) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; IF v_first_id IS NOT NULL THEN PERFORM public.notify_emergency_dispatch(NEW.id,v_first_id); END IF; END IF;
 IF v_first_id IS NULL THEN PERFORM public.notify_escalation(NEW.id,0,NULL); RETURN NEW; END IF;
 UPDATE public.funeral_cases SET current_bidder_id=v_first_id,current_bidder_pings=1,bid_timeout_at=now()+(v_timeout_mins||' minutes')::interval,previous_bidders='{}' WHERE id=NEW.id;
 INSERT INTO public.bidding_history(case_id,leader_id,status,offered_at) VALUES(NEW.id,v_first_id,'offered',now()); RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.find_next_bidder(p_order_map jsonb,p_previous uuid[],p_current_id uuid,p_case_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_next_id uuid; v_excl uuid[];
BEGIN
 v_excl:=array_append(COALESCE(p_previous,'{}'),p_current_id);
 SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND p.user_id!=ALL(v_excl) AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) AND (NOT public.leader_docs_enforced(p.user_id) OR public.leader_docs_ok(p.user_id)) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p WHERE p.current_status='waiting' AND p.status='approved' AND EXISTS(SELECT 1 FROM jsonb_each_text(p_order_map) kv WHERE kv.key::uuid=p.user_id) AND public.leader_passes_region_filter(p.user_id,p_case_id) AND (NOT public.leader_docs_enforced(p.user_id) OR public.leader_docs_ok(p.user_id)) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 IF v_next_id IS NULL THEN SELECT p.user_id INTO v_next_id FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.status='approved' AND p.current_status!='off' AND p.grade IN ('Master','S') AND pr.role='leader' AND public.leader_passes_region_filter(p.user_id,p_case_id) AND (NOT public.leader_docs_enforced(p.user_id) OR public.leader_docs_ok(p.user_id)) ORDER BY p.last_assigned_at ASC NULLS FIRST LIMIT 1; END IF;
 RETURN v_next_id;
END; $$;

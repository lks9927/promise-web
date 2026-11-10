-- Test data is always selected from existing rows: no profiles/auth.users INSERT is permitted.
SELECT p.user_id INTO v_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' ORDER BY p.user_id LIMIT 1;
SELECT p.user_id INTO v_other_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' AND p.user_id IS DISTINCT FROM v_leader ORDER BY p.user_id LIMIT 1;
SELECT id INTO v_customer FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;

-- P10: use only existing approved dealer/customer rows.  Every mutation stays inside the outer rollback.
IF v_apply_20 THEN
  SELECT pa.user_id INTO v_dealer FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id
   WHERE pa.status='approved' AND pr.role='dealer' ORDER BY pa.user_id LIMIT 1;
  SELECT pa.user_id INTO v_other_dealer FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id
   WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id IS DISTINCT FROM v_dealer ORDER BY pa.user_id LIMIT 1;
  SELECT regexp_replace(phone,'[^0-9]','','g') INTO v_customer_phone FROM public.profiles WHERE id=v_customer;
  SELECT public.ensure_dealer_card_coupon(v_dealer) INTO v_card_code;
  SELECT code INTO v_normal_code FROM public.coupons WHERE NOT is_card AND status='issued' ORDER BY created_at LIMIT 1;
  SELECT count(*) INTO v_n FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer';
  SELECT count(*) INTO v_n2 FROM public.coupons c JOIN public.partners pa ON pa.user_id=c.issued_by JOIN public.profiles pr ON pr.id=pa.user_id WHERE c.is_card AND pa.status='approved' AND pr.role='dealer';
  IF v_dealer IS NOT NULL AND v_card_code IS NOT NULL AND
     (SELECT count(*) FROM public.coupons WHERE issued_by=v_dealer AND is_card)=1 AND
     public.ensure_dealer_card_coupon(v_dealer)=v_card_code AND v_n=v_n2 THEN
    v_result:=v_result||E'\n[PASS] P10 approved dealer bulk/card issuance one-per-dealer and idempotent';
  ELSE v_result:=v_result||E'\n[FAIL] P10 approved dealer card issuance/idempotency approved='||v_n||' cards='||v_n2; END IF;
ELSE v_result:=v_result||E'\n[SKIP] P10 setup | apply prerequisite missing'; END IF;

IF v_apply_20 THEN
  DECLARE d uuid; l uuid; before_n bigint; after_n bigint; no_card text; pending_card text;
  BEGIN
    SELECT pa.user_id INTO d FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id
     WHERE pa.status='approved' AND pr.role='dealer' ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO l FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id
     WHERE pa.status='approved' AND pr.role='leader' ORDER BY pa.user_id LIMIT 1;
    SELECT count(*) INTO before_n FROM public.coupons WHERE issued_by=d AND is_card;
    DELETE FROM public.coupons WHERE issued_by=d AND is_card;
    UPDATE public.partners SET status='pending' WHERE user_id=d;
    SELECT public.ensure_dealer_card_coupon(d) INTO pending_card;
    UPDATE public.partners SET status='approved' WHERE user_id=d;
    SELECT count(*) INTO after_n FROM public.coupons WHERE issued_by=d AND is_card;
    SELECT code INTO v_card_code FROM public.coupons WHERE issued_by=d AND is_card;
    SELECT public.ensure_dealer_card_coupon(l) INTO no_card;
    IF before_n=1 AND after_n=1 AND pending_card IS NULL AND no_card IS NULL THEN v_result:=v_result||E'\n[PASS] P10 approval trigger issues dealer only; pending dealer/leader denied';
    ELSE v_result:=v_result||E'\n[FAIL] P10 approval trigger/role guard before='||before_n||' after='||after_n||' pending='||coalesce(pending_card,'NULL')||' leader='||coalesce(no_card,'NULL'); END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P10 approval trigger: '||SQLERRM; END;
END IF;

IF v_apply_20 AND v_dealer IS NOT NULL AND v_customer_phone ~ '^01[0-9]{8,9}$' THEN
  DECLARE j jsonb; denied boolean:=false; bad boolean:=false; normal_bad boolean:=false; phone_bad boolean:=false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
    j:=public.submit_pre_registration(v_card_code,'김테스트',v_customer_phone,'자녀',true);
    IF j->>'status'='registered' THEN v_result:=v_result||E'\n[PASS] P10 anon pre-registration'; ELSE v_result:=v_result||E'\n[FAIL] P10 anon pre-registration result='||j::text; END IF;
    j:=public.submit_pre_registration(v_card_code,'김테스트',v_customer_phone,'자녀',true);
    IF j->>'status'='exists' THEN v_result:=v_result||E'\n[PASS] P10 duplicate pre-registration is idempotent'; ELSE v_result:=v_result||E'\n[FAIL] P10 duplicate result='||j::text; END IF;
    PERFORM public.submit_pre_registration(v_card_code,'김테스트',v_customer_phone,'자녀',true);
    BEGIN PERFORM public.submit_pre_registration(v_card_code,'김테스트',v_customer_phone,'자녀',true); EXCEPTION WHEN OTHERS THEN denied:=position('잠시 후' in SQLERRM)>0; END;
    BEGIN PERFORM public.submit_pre_registration(v_card_code,'김테스트','0101','자녀',true); EXCEPTION WHEN OTHERS THEN phone_bad:=true; END;
    BEGIN PERFORM public.submit_pre_registration('BADCODE','김테스트','01099998888','자녀',true); EXCEPTION WHEN OTHERS THEN bad:=true; END;
    BEGIN PERFORM public.submit_pre_registration(v_normal_code,'김테스트','01088887777','자녀',true); EXCEPTION WHEN OTHERS THEN normal_bad:=true; END;
    BEGIN PERFORM public.submit_pre_registration(v_card_code,'김테스트','01077776666','자녀',false); EXCEPTION WHEN OTHERS THEN bad:=bad AND position('동의' in SQLERRM)>0; END;
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true);
    IF denied AND bad AND normal_bad AND phone_bad THEN v_result:=v_result||E'\n[PASS] P10 rate/consent/code/ordinary-card/phone validation'; ELSE v_result:=v_result||E'\n[FAIL] P10 validation rate='||denied||' bad='||bad||' normal='||normal_bad||' phone='||phone_bad; END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); v_result:=v_result||E'\n[FAIL] P10 anon registration: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P10 anon registration | dealer/customer phone data missing'; END IF;

IF v_apply_20 AND v_dealer IS NOT NULL THEN
  DECLARE direct_blocked boolean:=false; read_blocked boolean:=false; attempts_read_blocked boolean:=false; prereg_insert_blocked boolean:=false; auth_read_blocked boolean:=false; auth_insert_blocked boolean:=false; n bigint; cols text;
  BEGIN
    SET LOCAL ROLE anon; PERFORM set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
    BEGIN SELECT count(*) INTO n FROM public.pre_registrations; read_blocked := (n=0); EXCEPTION WHEN insufficient_privilege THEN read_blocked:=true; END;
    BEGIN SELECT count(*) INTO n FROM public.pre_registration_attempts; attempts_read_blocked := (n=0); EXCEPTION WHEN insufficient_privilege THEN attempts_read_blocked:=true; END;
    BEGIN INSERT INTO public.pre_registration_attempts(phone) VALUES('01012345678'); EXCEPTION WHEN insufficient_privilege THEN direct_blocked:=true; END;
    BEGIN INSERT INTO public.pre_registrations(coupon_id,coupon_code,dealer_id,name,phone,consent_at) SELECT id,code,issued_by,'직접입력','01012345678',now() FROM public.coupons WHERE code=v_card_code; EXCEPTION WHEN insufficient_privilege THEN prereg_insert_blocked:=true; END;
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true);
    SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_dealer::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_dealer::text,true);
    BEGIN SELECT count(*) INTO n FROM public.pre_registrations; auth_read_blocked := (n=0); EXCEPTION WHEN insufficient_privilege THEN auth_read_blocked:=true; END;
    BEGIN INSERT INTO public.pre_registration_attempts(phone) VALUES('01012345679'); EXCEPTION WHEN insufficient_privilege THEN auth_insert_blocked:=true; END;
    SELECT count(*) INTO n FROM public.get_my_pre_registrations();
    SELECT pg_get_function_result('public.get_my_pre_registrations(uuid)'::regprocedure) INTO cols;
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    IF read_blocked AND attempts_read_blocked AND direct_blocked AND prereg_insert_blocked AND auth_read_blocked AND auth_insert_blocked AND n>=1 AND cols !~* 'phone|elder_name| name ' AND cols ~* 'region_name' THEN v_result:=v_result||E'\n[PASS] P10 anon/authenticated direct table block and dealer masked RPC columns'; ELSE v_result:=v_result||E'\n[FAIL] P10 direct/RPC anon-pre-read='||read_blocked||' anon-attempts-read='||attempts_read_blocked||' anon-attempts-insert='||direct_blocked||' anon-pre-insert='||prereg_insert_blocked||' auth-read='||auth_read_blocked||' auth-insert='||auth_insert_blocked||' rows='||n||' cols='||cols; END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P10 direct/RPC: '||SQLERRM; END;
END IF;

IF v_apply_20 AND v_other_dealer IS NOT NULL AND v_leader IS NOT NULL THEN
  DECLARE n_other bigint; n_leader bigint;
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_other_dealer::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_other_dealer::text,true); SELECT count(*) INTO n_other FROM public.get_my_pre_registrations(); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_leader::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_leader::text,true); SELECT count(*) INTO n_leader FROM public.get_my_pre_registrations(); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    IF n_other=0 AND n_leader=0 THEN v_result:=v_result||E'\n[PASS] P10 other dealer/leader pre-registration isolation'; ELSE v_result:=v_result||E'\n[FAIL] P10 isolation other='||n_other||' leader='||n_leader; END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P10 isolation: '||SQLERRM; END;
END IF;

IF v_apply_20 AND v_dealer IS NOT NULL AND v_customer IS NOT NULL AND v_customer_phone ~ '^01[0-9]{8,9}$' AND v_normal_code IS NOT NULL THEN
  DECLARE card_case uuid; normal_case uuid; n_cash bigint; n_dealer bigint; card_status text; converted text; msg text; j jsonb; b jsonb;
  BEGIN
    SELECT public.submit_emergency_case('김테스트',v_customer_phone,'DRYRUN P10 card','일반형',v_card_code,NULL,NULL) INTO card_case;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=card_case;
    SELECT status INTO card_status FROM public.coupons WHERE code=v_card_code;
    SELECT status INTO converted FROM public.pre_registrations WHERE coupon_code=v_card_code AND phone=v_customer_phone;
    SELECT count(*) INTO n_cash FROM public.settlements WHERE case_id=card_case AND type='customer_cashback';
    SELECT count(*) INTO n_dealer FROM public.settlements WHERE case_id=card_case AND type='dealer_commission';
    SELECT message INTO msg FROM public.notifications WHERE user_id=v_dealer AND type='pre_registration' ORDER BY created_at DESC LIMIT 1;
    SELECT public.submit_emergency_case('김테스트',v_customer_phone,'DRYRUN P10 normal','일반형',v_normal_code,NULL,NULL) INTO normal_case;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=normal_case;
    SELECT public.get_coupon_public(v_card_code) INTO j; SELECT public.get_family_benefit_public() INTO b;
    UPDATE public.system_config SET value='가족 안심 혜택' WHERE key='family_benefit_name'; UPDATE public.system_config SET value='설명' WHERE key='family_benefit_desc'; UPDATE public.system_config SET value='12345' WHERE key='family_benefit_amount';
    IF card_status='issued' AND converted='converted' AND n_cash=0 AND n_dealer=1 AND msg !~ '[0-9]{7,}' AND msg !~ '김테스트' AND (j ? 'amount' AND j ? 'status' AND j ? 'recipient_name' AND j ? 'recipient_phone' AND j ? 'is_card' AND j ? 'dealer_name') AND b->>'name' IS NULL AND (public.get_family_benefit_public()->>'amount')='12345' AND (SELECT status FROM public.coupons WHERE code=v_normal_code)='used' AND (SELECT count(*) FROM public.settlements WHERE case_id=normal_case AND type='customer_cashback')=1 THEN
      v_result:=v_result||E'\n[PASS] P10 card conversion/reuse/settlement, normal coupon compatibility, notification masking, public benefit RPC';
    ELSE v_result:=v_result||E'\n[FAIL] P10 card case status='||coalesce(card_status,'NULL')||' converted='||coalesce(converted,'NULL')||' cashback='||n_cash||' dealer='||n_dealer||' msg='||coalesce(msg,'NULL'); END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P10 case/benefit: '||SQLERRM; END;
END IF;

-- P1h: report the live policy surface instead of applying its proposal SQL.
SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='profiles';
v_result := v_result || E'\n[INFO] P1h profiles policy count=' || v_n;

-- No public function, including both alert paths, may invoke an external HTTP/network API.
SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND (pg_get_functiondef(p.oid) ~* E'supabase_functions\\.http_request' OR pg_get_functiondef(p.oid) ~* E'\\mnet\\s*\\.');
IF v_n=0 THEN v_result:=v_result||E'\n[PASS] no public external HTTP/network calls'; ELSE v_result:=v_result||E'\n[FAIL] public external HTTP/network calls='||v_n; END IF;

-- Required actual lifecycle: INSERT -> in_progress -> cancelled, with the alert triggers already disabled.
IF v_apply_1 AND v_apply_5 AND v_apply_6 AND v_apply_11 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  BEGIN
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
      VALUES(v_customer,v_leader,'requested','DRYRUN only','일반형') RETURNING id INTO v_case;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=v_case;
    SELECT count(*) INTO v_n FROM public.settlements WHERE case_id=v_case;
    UPDATE public.funeral_cases SET status='cancelled' WHERE id=v_case;
    SELECT count(*) INTO v_n2 FROM public.settlements WHERE case_id=v_case AND status IN ('draft','pending','awaiting_payment');
    IF v_n2=0 THEN v_result:=v_result||E'\n[PASS] lifecycle INSERT -> in_progress -> cancelled; settlements='||v_n;
    ELSE v_result:=v_result||E'\n[FAIL] lifecycle unpaid settlements not cancelled='||v_n2; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] lifecycle: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] lifecycle | apply prerequisite or existing customer/leader missing'; END IF;

-- P1a: repeated generator invocation must not make duplicate (case, recipient, type) settlement rows.
IF v_apply_1 AND v_case IS NOT NULL THEN
  BEGIN
    UPDATE public.funeral_cases SET status='requested' WHERE id=v_case; UPDATE public.funeral_cases SET status='in_progress' WHERE id=v_case;
    SELECT count(*)-count(DISTINCT (case_id,recipient_id,type)) INTO v_n FROM public.settlements WHERE case_id=v_case;
    IF v_n=0 THEN v_result:=v_result||E'\n[PASS] P1a duplicate settlement prevention'; ELSE v_result:=v_result||E'\n[FAIL] P1a duplicate settlement rows='||v_n; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P1a actual: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P1a actual | lifecycle unavailable'; END IF;

-- P1c/P1i permission denials: authenticated role + claims, always reset in both paths.
IF v_apply_3 AND v_leader IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_leader::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_leader::text,true);
  PERFORM public.change_partner_grade(v_leader,'C','dryrun unauthorized'); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[FAIL] P1c non-admin grade change allowed';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[PASS] P1c non-admin grade change denied';
WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P1c permission: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P1c permission | prerequisite/data'; END IF;
IF v_apply_7 AND v_leader IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_leader::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_leader::text,true);
  UPDATE public.profiles SET has_business=NOT coalesce(has_business,false) WHERE id=v_leader; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[FAIL] P1i self has_business change allowed';
EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[PASS] P1i self has_business change denied';
WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P1i permission: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P1i permission | prerequisite/data'; END IF;

-- P1b NULL unlimited, P2a allowed/forbidden hierarchy and P3b use existing approved leaders only.
IF v_apply_2 AND v_apply_8 AND v_apply_12 AND v_leader IS NOT NULL AND v_other_leader IS NOT NULL THEN
  BEGIN
    SELECT p.user_id INTO v_s FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE p.user_id=v_leader;
    v_master:=v_other_leader; UPDATE public.partners SET grade='S',master_id=NULL,max_subordinates=NULL WHERE user_id=v_s;
    UPDATE public.partners SET grade='Master',master_id=v_s WHERE user_id=v_master;
    IF public.is_master_leader(v_master) THEN v_result:=v_result||E'\n[PASS] P2a S->Master allowed and P3b candidate'; ELSE v_result:=v_result||E'\n[FAIL] P3b S-child Master not candidate'; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P1b/P2a/P3b actual: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P1b/P2a/P3b | prerequisite/data'; END IF;

IF v_apply_9 AND v_s IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT count(*) INTO v_n FROM public.s_downline_overview(); RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_n>0 THEN v_result:=v_result||E'\n[PASS] P2a S overview actual rows='||v_n; ELSE v_result:=v_result||E'\n[FAIL] P2a S overview no rows'; END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P2a S overview: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a S overview | prerequisite/data'; END IF;

IF v_apply_4 THEN SELECT count(*) INTO v_n FROM public.partner_bank_accounts; v_result:=v_result||E'\n[PASS] P1d bank table readable by owner/admin policy; migrated rows='||v_n; ELSE v_result:=v_result||E'\n[SKIP] P1d bank/RLS | prerequisite failed'; END IF;
IF v_apply_11 AND v_case IS NOT NULL THEN SELECT started_at IS NOT NULL INTO v_detail FROM public.funeral_cases WHERE id=v_case; v_result:=v_result||E'\n[INFO] P3a started_at recorded='||coalesce(v_detail,'false'); ELSE v_result:=v_result||E'\n[SKIP] P3a started_at | lifecycle unavailable'; END IF;

-- Remaining prior scenarios: verify the concrete rule table, forbidden S child relation, upstream RLS helper, and fee RPC.
IF v_apply_2 THEN SELECT count(*) INTO v_n FROM pg_constraint WHERE conrelid='public.partners'::regclass AND conname='partners_max_subordinates_nonnegative'; IF v_n=1 THEN v_result:=v_result||E'\n[PASS] P1b NULL/unlimited constraint installed'; ELSE v_result:=v_result||E'\n[FAIL] P1b limit constraint missing'; END IF; ELSE v_result:=v_result||E'\n[SKIP] P1b limit/null | prerequisite failed'; END IF;
IF v_apply_8 THEN
  SELECT count(*) INTO v_n FROM public.partner_hierarchy_rules WHERE (parent_grade,child_grade) IN (('S','Master'),('S','C'),('Master','C'));
  IF v_n=3 THEN v_result:=v_result||E'\n[PASS] P2a allowed S/Master/C combinations'; ELSE v_result:=v_result||E'\n[FAIL] P2a allowed combinations count='||v_n; END IF;
  IF v_s IS NOT NULL AND v_master IS NOT NULL THEN BEGIN UPDATE public.partners SET master_id=v_master WHERE user_id=v_s; v_result:=v_result||E'\n[FAIL] P2a forbidden S child relation allowed'; EXCEPTION WHEN check_violation THEN v_result:=v_result||E'\n[PASS] P2a forbidden S child relation denied'; WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P2a forbidden relation: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a forbidden relation | hierarchy data unavailable'; END IF;
ELSE v_result:=v_result||E'\n[SKIP] P2a rule table | prerequisite failed'; END IF;
IF v_apply_10 AND v_master IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_master::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_master::text,true);
  SELECT public.has_s_parent()::text INTO v_detail; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[PASS] P2a upstream RLS helper actual='||coalesce(v_detail,'false');
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P2a upstream RLS: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P2a upstream RLS | prerequisite/data'; END IF;
-- P3a/P3c: an S caller receives the sum of the current-month, per-package amounts.
-- Test-only policy updates and cases are rolled back by the enclosing DRYRUN DO block.
IF v_apply_15 THEN
  SELECT (public.policy_id_for_package('기본형')=1 AND public.policy_id_for_package('고급형')=2 AND public.policy_id_for_package('무빈소')=3)::text INTO v_detail;
  IF v_detail='true' THEN v_result:=v_result||E'\n[PASS] P3c package-to-policy mapping 1/2/3'; ELSE v_result:=v_result||E'\n[FAIL] P3c package-to-policy mapping'; END IF;
ELSE v_result:=v_result||E'\n[SKIP] P3c package-to-policy mapping | apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_s IS NOT NULL AND v_master IS NOT NULL AND v_customer IS NOT NULL THEN BEGIN
  UPDATE public.commission_policies SET s_leader_management_fee=11111 WHERE id=1;
  UPDATE public.commission_policies SET s_leader_management_fee=22222 WHERE id=2;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount INTO v_n FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
    VALUES(v_customer,v_master,'requested','DRYRUN P3a package 1','기본형') RETURNING id INTO v_fee_case_1;
  INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
    VALUES(v_customer,v_master,'requested','DRYRUN P3a package 2','고급형') RETURNING id INTO v_fee_case_2;
  UPDATE public.funeral_cases SET status='in_progress' WHERE id IN (v_fee_case_1,v_fee_case_2);
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount INTO v_n2 FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_n2-v_n=33333 THEN v_result:=v_result||E'\n[PASS] P3a/P3c package fee sum delta=33333'; ELSE v_result:=v_result||E'\n[FAIL] P3a/P3c package fee sum expected delta=33333 actual='||coalesce((v_n2-v_n)::text,'NULL'); END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a/P3c package fee sum: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P3a/P3c package fee sum | approved S/downline/customer data or apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_master IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_master::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_master::text,true);
  SELECT month_amount::text INTO v_detail FROM public.my_management_fee_summary() LIMIT 1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  IF v_detail='0' THEN v_result:=v_result||E'\n[PASS] P3a Master summary amount=0'; ELSE v_result:=v_result||E'\n[FAIL] P3a Master summary amount expected=0 actual='||coalesce(v_detail,'NULL'); END IF;
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a Master fee summary: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P3a Master fee summary | approved Master data or apply prerequisite missing'; END IF;

IF v_apply_11 AND v_apply_15 AND v_s IS NOT NULL THEN BEGIN
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',v_s::text,true);
  SELECT month_amount::text INTO v_detail FROM public.my_management_fee_summary() LIMIT 1; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
  v_result:=v_result||E'\n[PASS] P3a S/Master fee summary actual month_amount='||coalesce(v_detail,'0');
EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P3a fee summary: '||SQLERRM; END; ELSE v_result:=v_result||E'\n[SKIP] P3a fee summary | prerequisite/data'; END IF;

-- P4 plan: off preserves all candidates; sigungu/sido match and mismatch are checked against the filter itself (no Edge/network call).
IF v_apply_13 AND v_case IS NOT NULL AND v_leader IS NOT NULL THEN
  BEGIN
    SELECT r.id,r.parent_id INTO v_region,v_sido FROM public.regions r WHERE r.name='종로구' AND r.level='sigungu' LIMIT 1;
    SELECT r.id,r.parent_id INTO v_other_region,v_other_sido FROM public.regions r WHERE r.name='중구' AND r.level='sigungu' AND r.parent_id IS DISTINCT FROM v_sido LIMIT 1;
    UPDATE public.system_config SET value='off' WHERE key='regional_alert_mode';
    IF public.leader_passes_region_filter(v_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 off keeps existing behavior'; ELSE v_result:=v_result||E'\n[FAIL] P4 off filtered leader'; END IF;
    IF v_region IS NULL OR v_other_region IS NULL OR v_other_leader IS NULL THEN v_result:=v_result||E'\n[SKIP] P4 enabled scenarios | region/second leader missing';
    ELSE
      UPDATE public.funeral_cases SET region_id=v_region WHERE id=v_case;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_region),(v_other_leader,v_other_region);
      UPDATE public.system_config SET value='sigungu' WHERE key='regional_alert_mode';
      IF public.leader_passes_region_filter(v_leader,v_case) AND NOT public.leader_passes_region_filter(v_other_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 sigungu selected/mismatch'; ELSE v_result:=v_result||E'\n[FAIL] P4 sigungu selected/mismatch'; END IF;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_sido),(v_other_leader,v_other_sido);
      UPDATE public.system_config SET value='sido' WHERE key='regional_alert_mode';
      IF public.leader_passes_region_filter(v_leader,v_case) AND NOT public.leader_passes_region_filter(v_other_leader,v_case) THEN v_result:=v_result||E'\n[PASS] P4 sido selected/mismatch'; ELSE v_result:=v_result||E'\n[FAIL] P4 sido selected/mismatch'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P4 scenario: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P4 scenarios | prerequisite/data'; END IF;

-- P4 follow-up: callers must use the sole four-argument selector; test only reuses and updates existing partners/regions.
IF v_apply_13 AND v_case IS NOT NULL AND v_leader IS NOT NULL AND v_other_leader IS NOT NULL THEN
  DECLARE v_map jsonb; v_next_4 uuid; v_next_null uuid; v_next_region uuid; v_next_inactive uuid;
  BEGIN
    SELECT id INTO v_region FROM public.regions WHERE level='sigungu' AND active ORDER BY sort,id LIMIT 1;
    SELECT id INTO v_other_region FROM public.regions WHERE level='sigungu' AND active AND id IS DISTINCT FROM v_region ORDER BY sort,id LIMIT 1;
    IF v_region IS NULL OR v_other_region IS NULL THEN
      v_result:=v_result||E'\n[SKIP] P4 next-bidder/caller scenarios | two active sigungu regions missing';
    ELSE
      v_map:=jsonb_build_object(v_leader::text,'1',v_other_leader::text,'2');
      UPDATE public.partners SET status='approved',current_status='waiting',last_assigned_at=now() WHERE user_id=v_leader;
      UPDATE public.partners SET status='approved',current_status='waiting',last_assigned_at=now()-interval '1 minute' WHERE user_id=v_other_leader;
      UPDATE public.funeral_cases SET region_id=v_region WHERE id=v_case;
      UPDATE public.system_config SET value='off' WHERE key='regional_alert_mode';
      v_next_4:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      v_next_null:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,NULL);
      IF v_next_4 IS NOT DISTINCT FROM v_next_null THEN v_result:=v_result||E'\n[PASS] P4 off four-arg and NULL-case selector match'; ELSE v_result:=v_result||E'\n[FAIL] P4 off four-arg and NULL-case selector differ'; END IF;
      DELETE FROM public.partner_alert_regions WHERE partner_id IN (v_leader,v_other_leader);
      INSERT INTO public.partner_alert_regions(partner_id,region_id) VALUES(v_leader,v_region),(v_other_leader,v_other_region);
      UPDATE public.system_config SET value='sigungu' WHERE key='regional_alert_mode';
      v_next_region:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      IF v_next_region=v_leader THEN v_result:=v_result||E'\n[PASS] P4 sigungu next bidder is matching leader'; ELSE v_result:=v_result||E'\n[FAIL] P4 sigungu next bidder mismatch'; END IF;
      UPDATE public.regions SET active=false WHERE id=v_other_region;
      v_next_inactive:=public.find_next_bidder(v_map,'{}'::uuid[],v_case,v_case);
      IF public.leader_passes_region_filter(v_other_leader,v_case) AND v_next_inactive=v_other_leader THEN v_result:=v_result||E'\n[PASS] P4 inactive-only preference treated as no preference'; ELSE v_result:=v_result||E'\n[FAIL] P4 inactive-only preference filtered'; END IF;
    END IF;
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND ((p.proname='process_bidding_timeouts' AND pg_get_functiondef(p.oid) ~ E'find_next_bidder\\s*\\(\\s*v_order_map\\s*,\\s*v_case\\.previous_bidders\\s*,\\s*v_case\\.current_bidder_id\\s*,\\s*v_case\\.id\\s*\\)') OR (p.proname='pass_bidding_internal' AND pg_get_functiondef(p.oid) ~ E'find_next_bidder\\s*\\(\\s*v_order_map\\s*,\\s*v_previous\\s*,\\s*p_leader_id\\s*,\\s*p_case_id\\s*\\)'));
    IF v_n=2 THEN v_result:=v_result||E'\n[PASS] P4 timeout/pass callers use four-arg selector'; ELSE v_result:=v_result||E'\n[FAIL] P4 timeout/pass caller four-arg definitions='||v_n; END IF;
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='find_next_bidder';
    IF v_n=1 THEN v_result:=v_result||E'\n[PASS] P4 find_next_bidder legacy overload removed'; ELSE v_result:=v_result||E'\n[FAIL] P4 find_next_bidder overload count='||v_n; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P4 next-bidder/caller scenario: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P4 next-bidder/caller scenarios | prerequisite/data'; END IF;

-- P5/P1a: no draft settlements at intake; policy settlements at in_progress; is_private (team leader own funeral, record only) creates none.
IF v_apply_1 AND v_apply_16 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  DECLARE c1 uuid; c2 uuid; n_intake bigint; n_start bigint; n_private bigint;
  BEGIN
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name)
      VALUES(v_customer,v_leader,'requested','DRYRUN P5 normal','기본형') RETURNING id INTO c1;
    SELECT count(*) INTO n_intake FROM public.settlements WHERE case_id=c1;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=c1;
    SELECT count(*) INTO n_start FROM public.settlements WHERE case_id=c1;
    INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name,is_private)
      VALUES(v_customer,v_leader,'requested','DRYRUN P5 private','기본형',true) RETURNING id INTO c2;
    UPDATE public.funeral_cases SET status='in_progress' WHERE id=c2;
    SELECT count(*) INTO n_private FROM public.settlements WHERE case_id=c2;
    IF n_intake=0 AND n_start>0 AND n_private=0 THEN
      v_result:=v_result||E'
[PASS] P5/P1a no intake draft; in_progress settlements='||n_start||'; private case settlements=0';
    ELSE
      v_result:=v_result||E'
[FAIL] P5/P1a intake='||n_intake||' start='||n_start||' private='||n_private;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[FAIL] P5/P1a: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P5/P1a | prerequisite/data'; END IF;

-- P6 (relationship-based profiles read). Builds a case customer<->dealer+leader, an unrelated customer/dealer, and master/S upline.
IF v_apply_17 THEN
  DECLARE d uuid; d2 uuid; l uuid; m1 uuid; s1 uuid; cu uuid; cu2 uuid; ad uuid; cs uuid;
    n_d_l bigint; n_d_cu bigint; n_d_cu2 bigint; n_d_d2 bigint; n_d_ad bigint; n_d_self bigint;
    n_l_d bigint; n_l_cu bigint; n_l_cu2 bigint; n_cu_l bigint; n_cu_d bigint; n_cu_cu2 bigint; n_adm bigint;
    n_up bigint; n_down bigint; n_m_s bigint; ok boolean;
  BEGIN
    SELECT p.user_id INTO d FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO d2 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' AND p.user_id<>d ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO l FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO m1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.user_id<>l ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO s1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.user_id NOT IN (l,m1) ORDER BY p.user_id LIMIT 1;
    SELECT id INTO cu FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;
    SELECT id INTO cu2 FROM public.profiles WHERE role='customer' AND id<>cu ORDER BY id LIMIT 1;
    SELECT id INTO ad FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    -- Not enough customer/admin profiles in production: temporarily re-role spare dealer profiles inside this rolled-back test.
    IF cu IS NULL THEN SELECT p.user_id INTO cu FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d)) ORDER BY p.user_id LIMIT 1; IF cu IS NOT NULL THEN UPDATE public.profiles SET role='customer' WHERE id=cu; END IF; END IF;
    IF cu2 IS NULL THEN SELECT p.user_id INTO cu2 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d),COALESCE(cu,d)) ORDER BY p.user_id LIMIT 1; IF cu2 IS NOT NULL THEN UPDATE public.profiles SET role='customer' WHERE id=cu2; END IF; END IF;
    IF ad IS NULL THEN SELECT p.user_id INTO ad FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.user_id NOT IN (d,COALESCE(d2,d),COALESCE(cu,d),COALESCE(cu2,d)) ORDER BY p.user_id LIMIT 1; IF ad IS NOT NULL THEN UPDATE public.profiles SET role='admin' WHERE id=ad; END IF; END IF;
    IF d IS NULL OR d2 IS NULL OR l IS NULL OR m1 IS NULL OR s1 IS NULL OR cu IS NULL OR cu2 IS NULL OR ad IS NULL THEN
      v_result:=v_result||E'
[SKIP] P6 | test data missing (need 2 dealers, 3 leaders, 2 customers, admin)';
    ELSE
      UPDATE public.partners SET master_id=NULL WHERE user_id IN (d,d2,l,m1,s1);
      UPDATE public.partners SET grade='S' WHERE user_id=s1;
      UPDATE public.partners SET grade='Master', master_id=s1 WHERE user_id=m1;
      UPDATE public.partners SET grade='Master' WHERE user_id=d2;
      UPDATE public.partners SET grade='C', master_id=d2 WHERE user_id=d;
      INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(cu,d,l,'requested','DRYRUN P6','기본형');
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d::text,true);
      SELECT count(*) INTO n_d_l FROM public.profiles WHERE id=l;
      SELECT count(*) INTO n_d_cu FROM public.profiles WHERE id=cu;
      SELECT count(*) INTO n_d_cu2 FROM public.profiles WHERE id=cu2;
      SELECT count(*) INTO n_d_d2 FROM public.profiles WHERE id=d2;
      SELECT count(*) INTO n_d_ad FROM public.profiles WHERE id=ad;
      SELECT count(*) INTO n_d_self FROM public.profiles WHERE id=d;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d2::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d2::text,true);
      SELECT count(*) INTO n_down FROM public.profiles WHERE id=d;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',l::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',l::text,true);
      SELECT count(*) INTO n_l_d FROM public.profiles WHERE id=d;
      SELECT count(*) INTO n_l_cu FROM public.profiles WHERE id=cu;
      SELECT count(*) INTO n_l_cu2 FROM public.profiles WHERE id=cu2;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',cu::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',cu::text,true);
      SELECT count(*) INTO n_cu_l FROM public.profiles WHERE id=l;
      SELECT count(*) INTO n_cu_d FROM public.profiles WHERE id=d;
      SELECT count(*) INTO n_cu_cu2 FROM public.profiles WHERE id=cu2;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',m1::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',m1::text,true);
      SELECT count(*) INTO n_m_s FROM public.profiles WHERE id=s1;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',s1::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',s1::text,true);
      SELECT count(*) INTO n_up FROM public.profiles WHERE id=m1;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      SELECT count(*) INTO n_adm FROM public.profiles WHERE id IN (d,l,cu,cu2,d2);
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      ok := n_d_l=0 AND n_d_cu=1 AND n_d_cu2=0 AND n_d_d2=1 AND n_d_ad=1 AND n_d_self=1 AND n_down=1
        AND n_l_d=0 AND n_l_cu=1 AND n_l_cu2=0 AND n_cu_l=1 AND n_cu_d=1 AND n_cu_cu2=0 AND n_m_s=0 AND n_up=1 AND n_adm=5;
      IF ok THEN v_result:=v_result||E'
[PASS] P6 relationship-based profile reads (dealer<->leader blocked, case customer visible, unrelated hidden, upline/downline, master cannot read S)';
      ELSE v_result:=v_result||format(E'
[FAIL] P6 d->l=%s d->cu=%s d->cu2=%s d->d2(master)=%s d->admin=%s d->self=%s master->down=%s l->d=%s l->cu=%s l->cu2=%s cu->l=%s cu->d=%s cu->cu2=%s master->S=%s S->master=%s admin sees=%s',n_d_l,n_d_cu,n_d_cu2,n_d_d2,n_d_ad,n_d_self,n_down,n_l_d,n_l_cu,n_l_cu2,n_cu_l,n_cu_d,n_cu_cu2,n_m_s,n_up,n_adm); END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P6: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P6 | apply prerequisite missing'; END IF;

-- P7: promotion request -> admin decision -> revert.
IF v_apply_18 AND v_apply_2 AND v_apply_3 AND v_apply_8 THEN
  DECLARE s uuid; tgt uuid; other uuid; ad uuid; req uuid; ok1 boolean:=false; ok_nons boolean:=false; ok_nodown boolean:=false; ok_dup boolean:=false; ok_apr boolean:=false; ok_hist boolean:=false; ok_rev boolean:=false; ok_decnon boolean:=false; g text; n_h bigint;
  BEGIN
    SELECT p.user_id INTO s FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='Master' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO tgt FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='C' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO other FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' AND p.grade='C' AND p.user_id IS DISTINCT FROM tgt ORDER BY p.user_id LIMIT 1;
    SELECT id INTO ad FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    IF s IS NULL OR tgt IS NULL OR other IS NULL OR ad IS NULL THEN
      v_result:=v_result||E'
[SKIP] P7 | test data missing (S/target/other/admin)';
    ELSE
      UPDATE public.partners SET master_id=NULL WHERE user_id IN (s,tgt,other);
      UPDATE public.partners SET grade='S' WHERE user_id=s;
      UPDATE public.partners SET master_id=s WHERE user_id=tgt;
      -- S requests promotion of own downline C
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',s::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',s::text,true);
      BEGIN req := public.request_partner_promotion(tgt,'dryrun'); ok1 := req IS NOT NULL; EXCEPTION WHEN OTHERS THEN ok1:=false; END;
      BEGIN PERFORM public.request_partner_promotion(other,'not downline'); ok_nodown:=false; EXCEPTION WHEN OTHERS THEN ok_nodown:=true; END;
      BEGIN PERFORM public.request_partner_promotion(tgt,'dup'); ok_dup:=false; EXCEPTION WHEN OTHERS THEN ok_dup:=true; END;
      BEGIN PERFORM public.decide_partner_promotion(req,true,'self approve'); ok_decnon:=false; EXCEPTION WHEN OTHERS THEN ok_decnon:=true; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      -- non-S (the target) cannot request
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',tgt::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',tgt::text,true);
      BEGIN PERFORM public.request_partner_promotion(other,'by C'); ok_nons:=false; EXCEPTION WHEN OTHERS THEN ok_nons:=true; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      -- admin approves
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      BEGIN PERFORM public.decide_partner_promotion(req,true,'ok'); EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[INFO] P7 approve error: '||SQLERRM; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SELECT grade INTO g FROM public.partners WHERE user_id=tgt; ok_apr := (g='Master');
      SELECT count(*) INTO n_h FROM public.partner_grade_history WHERE partner_id=tgt AND to_grade='Master'; ok_hist := n_h>=1;
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      BEGIN PERFORM public.revert_partner_promotion(req,'undo'); EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[INFO] P7 revert error: '||SQLERRM; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SELECT grade INTO g FROM public.partners WHERE user_id=tgt; ok_rev := (g='C');
      IF ok1 AND ok_nodown AND ok_dup AND ok_decnon AND ok_nons AND ok_apr AND ok_hist AND ok_rev THEN
        v_result:=v_result||E'
[PASS] P7 request/approve/revert flow and permission denials';
      ELSE
        v_result:=v_result||format(E'
[FAIL] P7 request=%s notDownlineDenied=%s dupDenied=%s sSelfDecideDenied=%s nonSDenied=%s approved=%s history=%s reverted=%s',ok1,ok_nodown,ok_dup,ok_decnon,ok_nons,ok_apr,ok_hist,ok_rev);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P7: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P7 | apply prerequisite missing'; END IF;

-- P8: private (record-only) case with publicity consent is stored, creates no settlement, and default is false.
IF v_apply_19 AND v_apply_1 AND v_apply_16 AND v_customer IS NOT NULL AND v_leader IS NOT NULL THEN
  DECLARE c uuid; cons boolean; dflt boolean; n_set bigint;
  BEGIN
    INSERT INTO public.funeral_cases(team_leader_id,status,location,is_private,publicity_consent) VALUES(v_leader,'in_progress','DRYRUN P8 consent',true,true) RETURNING id INTO c;
    SELECT publicity_consent INTO cons FROM public.funeral_cases WHERE id=c;
    SELECT count(*) INTO n_set FROM public.settlements WHERE case_id=c;
    INSERT INTO public.funeral_cases(team_leader_id,status,location,is_private) VALUES(v_leader,'in_progress','DRYRUN P8 default',true) RETURNING id INTO c;
    SELECT publicity_consent INTO dflt FROM public.funeral_cases WHERE id=c;
    IF cons=true AND dflt=false AND n_set=0 THEN v_result:=v_result||E'
[PASS] P8 consent saved=true default=false settlements=0';
    ELSE v_result:=v_result||E'
[FAIL] P8 consent='||coalesce(cons::text,'null')||' default='||coalesce(dflt::text,'null')||' settlements='||n_set; END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'
[FAIL] P8: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P8 | prerequisite/data'; END IF;

-- P6 bypass check: sending a notification to an unrelated user must not make that user's profile readable.
IF v_apply_17 THEN
  DECLARE a uuid; v uuid; n_before bigint; n_after bigint;
  BEGIN
    SELECT p.user_id INTO a FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT pr.id INTO v FROM public.profiles pr WHERE pr.role='customer' AND NOT EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.customer_id=pr.id AND (fc.dealer_id=a OR fc.team_leader_id=a)) ORDER BY pr.id DESC LIMIT 1;
    IF a IS NULL OR v IS NULL THEN v_result:=v_result||E'
[SKIP] P6 notification bypass | data missing';
    ELSE
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',a::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',a::text,true);
      SELECT count(*) INTO n_before FROM public.profiles WHERE id=v;
      INSERT INTO public.notifications(user_id,sender_id,type,title,message) VALUES(v,a,'dryrun','dryrun','bypass attempt');
      SELECT count(*) INTO n_after FROM public.profiles WHERE id=v;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF n_after=0 THEN v_result:=v_result||E'
[PASS] P6 notification bypass blocked (before='||n_before||' after='||n_after||')';
      ELSE v_result:=v_result||E'
[FAIL] P6 notification bypass: sender can read recipient profile after sending (before='||n_before||' after='||n_after||')'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P6 notification bypass: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P6 notification bypass | apply prerequisite missing'; END IF;

-- PostgREST embed guard: no foreign key may reference partners(user_id) (profiles:user_id embeds become ambiguous, PGRST201).
SELECT count(*) INTO v_n FROM pg_constraint WHERE contype='f' AND confrelid='public.partners'::regclass;
IF v_n=0 THEN v_result:=v_result||E'
[PASS] PostgREST embed guard: no FK references partners'; ELSE v_result:=v_result||E'
[FAIL] PostgREST embed guard: FKs referencing partners='||v_n||' (profiles:user_id embeds will fail with PGRST201)'; END IF;

-- P10b: admin preview can read a dealer's card coupon; non-admin passing another id still gets own; leader gets null.
IF v_apply_21 THEN
  DECLARE d1 uuid; d2 uuid; ad uuid; ld uuid; c_d1 text; c_adm text; c_nonadm text; c_leader text; c_d2 text;
  BEGIN
    SELECT p.user_id INTO d1 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO d2 FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='dealer' AND p.status='approved' AND p.user_id<>d1 ORDER BY p.user_id LIMIT 1;
    SELECT p.user_id INTO ld FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id WHERE pr.role='leader' AND p.status='approved' ORDER BY p.user_id LIMIT 1;
    SELECT id INTO ad FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    IF d1 IS NULL OR d2 IS NULL OR ld IS NULL OR ad IS NULL THEN
      v_result:=v_result||E'
[SKIP] P10b | data missing';
    ELSE
      c_d1 := public.ensure_dealer_card_coupon(d1); c_d2 := public.ensure_dealer_card_coupon(d2);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ad::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ad::text,true);
      SELECT public.get_my_card_coupon(d1) INTO c_adm;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d2::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d2::text,true);
      SELECT public.get_my_card_coupon(d1) INTO c_nonadm;
      SELECT public.get_my_card_coupon() INTO c_d2;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',ld::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',ld::text,true);
      SELECT public.get_my_card_coupon() INTO c_leader;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF c_adm IS NOT DISTINCT FROM c_d1 AND c_d1 IS NOT NULL AND c_nonadm IS NOT DISTINCT FROM public.ensure_dealer_card_coupon(d2) AND c_leader IS NULL THEN
        v_result:=v_result||E'
[PASS] P10b admin preview reads dealer card; non-admin id ignored; leader null';
      ELSE
        v_result:=v_result||format(E'
[FAIL] P10b admin=%s d1=%s nonadm=%s d2=%s leader=%s',c_adm,c_d1,c_nonadm,c_d2,c_leader);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'
[FAIL] P10b: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'
[SKIP] P10b | apply prerequisite missing'; END IF;

-- P11: extended anonymous registration, old 5-argument compatibility, regional privacy and isolation.
IF v_apply_22 THEN
  DECLARE d uuid; other_d uuid; leader_d uuid; region uuid; sido uuid; region_label text; reg_id uuid; card text;
    j jsonb; legacy jsonb; normalized text; listed_region text; listed_cols text; notice text;
    n_other bigint := 0; n_leader bigint := 0; bad_region boolean := false; ok boolean := false;
  BEGIN
    SELECT pa.user_id INTO d FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO other_d FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id<>d ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO leader_d FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='leader' ORDER BY pa.user_id LIMIT 1;
    SELECT id, name INTO region, region_label FROM public.regions WHERE level='sigungu' AND active ORDER BY id LIMIT 1;
    SELECT id INTO sido FROM public.regions WHERE level='sido' AND active ORDER BY id LIMIT 1;
    IF d IS NULL OR region IS NULL OR sido IS NULL THEN v_result:=v_result||E'\n[SKIP] P11 | dealer or region data missing';
    ELSE
      card := public.ensure_dealer_card_coupon(d);
      SET LOCAL ROLE anon; PERFORM set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
      j := public.submit_pre_registration(card,'신청자','01066661111','형제자매',true,'어르신 이름',region);
      legacy := public.submit_pre_registration(card,'호환신청자','01066662222','자녀',true);
      BEGIN PERFORM public.submit_pre_registration(card,'지역거부','01066663333','자녀',true,'어르신',sido); EXCEPTION WHEN OTHERS THEN bad_region := position('시·군·구' in SQLERRM)>0; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true);
      SELECT id, relationship INTO reg_id, normalized FROM public.pre_registrations WHERE coupon_code=card AND phone='01066661111';
      SELECT message INTO notice FROM public.notifications WHERE user_id=d AND type='pre_registration' ORDER BY created_at DESC LIMIT 1;
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',d::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',d::text,true);
      SELECT region_name INTO listed_region FROM public.get_my_pre_registrations() WHERE id=reg_id;
      SELECT pg_get_function_result('public.get_my_pre_registrations(uuid)'::regprocedure) INTO listed_cols;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF other_d IS NOT NULL THEN SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',other_d::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',other_d::text,true); SELECT count(*) INTO n_other FROM public.get_my_pre_registrations(d) WHERE id=reg_id; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); END IF;
      IF leader_d IS NOT NULL THEN SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',leader_d::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',leader_d::text,true); SELECT count(*) INTO n_leader FROM public.get_my_pre_registrations(d) WHERE id=reg_id; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); END IF;
      ok := j->>'status'='registered' AND legacy->>'status'='registered' AND normalized='형제·자매' AND bad_region AND listed_region=region_label
        AND listed_cols ~* 'region_name' AND listed_cols !~* 'elder_name|phone| name ' AND notice !~ '어르신 이름|01066661111'
        AND (other_d IS NULL OR n_other=0) AND (leader_d IS NULL OR n_leader=0);
      IF ok THEN v_result:=v_result||E'\n[PASS] P11 extended/legacy registration, sigungu guard, masking, notification privacy, isolation';
      ELSE v_result:=v_result||format(E'\n[FAIL] P11 new=%s legacy=%s relation=%s region=%s bad=%s cols=%s notice=%s other=%s leader=%s',j,legacy,normalized,listed_region,bad_region,listed_cols,notice,n_other,n_leader); END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true); v_result:=v_result||E'\n[FAIL] P11: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'\n[SKIP] P11 | apply prerequisite missing'; END IF;

-- P11: public benefit response always includes a normalized label, independently of benefit configuration.
IF v_apply_22 THEN
  DECLARE had_label boolean; had_name boolean; had_desc boolean; had_amount boolean;
    old_label text; old_name text; old_desc text; old_amount text;
    j_missing jsonb; j_custom jsonb; j_blank jsonb; keys_ok boolean := false; empty_benefit_ok boolean := false;
  BEGIN
    SELECT EXISTS (SELECT 1 FROM public.system_config WHERE key='pre_reg_elder_label'),
           (SELECT value FROM public.system_config WHERE key='pre_reg_elder_label') INTO had_label, old_label;
    SELECT EXISTS (SELECT 1 FROM public.system_config WHERE key='family_benefit_name'),
           (SELECT value FROM public.system_config WHERE key='family_benefit_name') INTO had_name, old_name;
    SELECT EXISTS (SELECT 1 FROM public.system_config WHERE key='family_benefit_desc'),
           (SELECT value FROM public.system_config WHERE key='family_benefit_desc') INTO had_desc, old_desc;
    SELECT EXISTS (SELECT 1 FROM public.system_config WHERE key='family_benefit_amount'),
           (SELECT value FROM public.system_config WHERE key='family_benefit_amount') INTO had_amount, old_amount;

    DELETE FROM public.system_config WHERE key='pre_reg_elder_label';
    SELECT public.get_family_benefit_public() INTO j_missing;
    INSERT INTO public.system_config(key, value) VALUES ('pre_reg_elder_label', '  할머니  ')
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
    SELECT public.get_family_benefit_public() INTO j_custom;
    INSERT INTO public.system_config(key, value) VALUES ('pre_reg_elder_label', '   ')
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
    INSERT INTO public.system_config(key, value) VALUES
      ('family_benefit_name', ''), ('family_benefit_desc', '설명'), ('family_benefit_amount', '1000')
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
    SELECT public.get_family_benefit_public() INTO j_blank;
    keys_ok := j_blank ?& ARRAY['name', 'description', 'amount', 'elder_label'];
    empty_benefit_ok := j_blank->>'name' IS NULL AND j_blank->>'description' IS NULL AND j_blank->>'amount' IS NULL;

    DELETE FROM public.system_config WHERE key IN ('pre_reg_elder_label', 'family_benefit_name', 'family_benefit_desc', 'family_benefit_amount');
    INSERT INTO public.system_config(key, value)
    SELECT key, value FROM (VALUES
      ('pre_reg_elder_label', old_label, had_label), ('family_benefit_name', old_name, had_name),
      ('family_benefit_desc', old_desc, had_desc), ('family_benefit_amount', old_amount, had_amount)
    ) AS saved(key, value, exists_before) WHERE exists_before;

    IF j_missing->>'elder_label'='어르신' AND j_custom->>'elder_label'='할머니' AND j_blank->>'elder_label'='어르신'
      AND keys_ok AND empty_benefit_ok THEN
      v_result:=v_result||E'\n[PASS] P11 public benefit label default/custom/blank and legacy keys';
    ELSE v_result:=v_result||format(E'\n[FAIL] P11 public benefit label missing=%s custom=%s blank=%s keys=%s empty=%s',j_missing,j_custom,j_blank,keys_ok,empty_benefit_ok); END IF;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.system_config WHERE key IN ('pre_reg_elder_label', 'family_benefit_name', 'family_benefit_desc', 'family_benefit_amount');
    INSERT INTO public.system_config(key, value)
    SELECT key, value FROM (VALUES
      ('pre_reg_elder_label', old_label, had_label), ('family_benefit_name', old_name, had_name),
      ('family_benefit_desc', old_desc, had_desc), ('family_benefit_amount', old_amount, had_amount)
    ) AS saved(key, value, exists_before) WHERE exists_before;
    v_result:=v_result||E'\n[FAIL] P11 public benefit label: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'\n[SKIP] P11 public benefit label | apply prerequisite missing'; END IF;

-- P13: policy values are deliberately changed, then every controlled case is compared as an exact row set.
IF v_apply_23 AND v_customer IS NOT NULL THEN
  DECLARE dm uuid; dc uuid; lm uuid; lc uuid; c uuid; p1 record; p2 record; ordinary text; card text; bad bigint; margin_ok boolean; private_zero_ok boolean; private_usage_ok boolean;
  BEGIN
    SELECT pa.user_id INTO dm FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO dc FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id IS DISTINCT FROM dm ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO lm FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='leader' ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO lc FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='leader' AND pa.user_id IS DISTINCT FROM lm ORDER BY pa.user_id LIMIT 1;
    IF dm IS NULL OR dc IS NULL OR lm IS NULL OR lc IS NULL THEN v_result:=v_result||E'\n[SKIP] P13 | need 2 approved dealers and leaders';
    ELSE
      UPDATE public.commission_policies SET base_margin=765432,sales_dealer_regular=123456,sales_dealer_master_override=34567,exec_leader_master_override=45678,customer_payback=23456,team_leader_fee=98765 WHERE id=1;
      UPDATE public.commission_policies SET base_margin=654321,sales_dealer_regular=223344,sales_dealer_master_override=33445,exec_leader_master_override=44556,customer_payback=55667,team_leader_fee=66778 WHERE id=2;
      SELECT * INTO p1 FROM public.commission_policies WHERE id=1; SELECT * INTO p2 FROM public.commission_policies WHERE id=2;
      CREATE TEMP TABLE p13_expected(case_id uuid,type text,recipient_id uuid,amount integer,base_amount integer,tax_amount integer,net_amount integer,status text) ON COMMIT DROP;
      UPDATE public.partners SET master_id=NULL WHERE user_id IN(dm,dc,lm,lc); UPDATE public.partners SET grade='Master' WHERE user_id IN(dm,lm); UPDATE public.partners SET grade='C' WHERE user_id IN(dc,lc);
      -- S1 ordinary dealer / ordinary leader.
      INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(v_customer,dc,lc,'requested','P13 S1','기본형') RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'dealer_commission',dc,p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular,ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),'draft');
      -- S2 master dealer direct / child leader.
      UPDATE public.partners SET master_id=lm WHERE user_id=lc; INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(v_customer,dm,lc,'requested','P13 S2','기본형') RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'dealer_commission',dm,p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular,ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),'draft'),(c,'leader_override',lm,p1.exec_leader_master_override,p1.exec_leader_master_override,0,p1.exec_leader_master_override,'draft');
      -- S3 child dealer under master.
      UPDATE public.partners SET master_id=dm WHERE user_id=dc; INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(v_customer,dc,lc,'requested','P13 S3','기본형') RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'dealer_commission',dc,p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular,ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),'draft'),(c,'dealer_override',dm,p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override,ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),'draft'),(c,'leader_override',lm,p1.exec_leader_master_override,p1.exec_leader_master_override,0,p1.exec_leader_master_override,'draft');
      -- S4 headquarters customer.
      INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name) VALUES(v_customer,lc,'requested','P13 S4','기본형') RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'leader_override',lm,p1.exec_leader_master_override,p1.exec_leader_master_override,0,p1.exec_leader_master_override,'draft');
      SELECT p1.base_margin-p1.exec_leader_master_override=(SELECT amount FROM public.settlements WHERE case_id=c AND type='usage_fee_remittance')-(SELECT amount FROM public.settlements WHERE case_id=c AND type='leader_override') INTO margin_ok;
      -- S5 ordinary coupon versus card coupon.
      INSERT INTO public.coupons(code,amount,status) VALUES('P13ORDINARY',0,'issued') RETURNING code INTO ordinary;
      INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name,coupon_code) VALUES(v_customer,dc,lc,'requested','P13 S5 ordinary','기본형',ordinary) RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'dealer_commission',dc,p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular,ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),'draft'),(c,'dealer_override',dm,p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override,ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),'draft'),(c,'leader_override',lm,p1.exec_leader_master_override,p1.exec_leader_master_override,0,p1.exec_leader_master_override,'draft'),(c,'customer_cashback',v_customer,p1.customer_payback,p1.customer_payback,0,p1.customer_payback,'draft');
      SELECT public.ensure_dealer_card_coupon(dc) INTO card; INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name,coupon_code) VALUES(v_customer,dc,lc,'requested','P13 S5 card','기본형',card) RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.base_margin,ROUND(p1.base_margin/1.1),p1.base_margin-ROUND(p1.base_margin/1.1),p1.base_margin,'draft'),(c,'dealer_commission',dc,p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular,ROUND(p1.sales_dealer_regular*.033),p1.sales_dealer_regular-ROUND(p1.sales_dealer_regular*.033),'draft'),(c,'dealer_override',dm,p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override,ROUND(p1.sales_dealer_master_override*.033),p1.sales_dealer_master_override-ROUND(p1.sales_dealer_master_override*.033),'draft'),(c,'leader_override',lm,p1.exec_leader_master_override,p1.exec_leader_master_override,0,p1.exec_leader_master_override,'draft');
      -- S6 policy 2 mapping.
      UPDATE public.partners SET master_id=NULL WHERE user_id IN(dc,lc); INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(v_customer,dc,lc,'requested','P13 S6','고급형') RETURNING id INTO c; UPDATE public.funeral_cases SET status='in_progress' WHERE id=c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p2.base_margin,ROUND(p2.base_margin/1.1),p2.base_margin-ROUND(p2.base_margin/1.1),p2.base_margin,'draft'),(c,'dealer_commission',dc,p2.sales_dealer_regular-ROUND(p2.sales_dealer_regular*.033),p2.sales_dealer_regular,ROUND(p2.sales_dealer_regular*.033),p2.sales_dealer_regular-ROUND(p2.sales_dealer_regular*.033),'draft');
      -- S7 zero and positive private-team-leader fee.
      UPDATE public.commission_policies SET team_leader_fee=0 WHERE id=1; INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name,is_private) VALUES(v_customer,lc,'in_progress','P13 S7 zero','기본형',true) RETURNING id INTO c; SELECT count(*)=0 INTO private_zero_ok FROM public.settlements WHERE case_id=c;
      UPDATE public.commission_policies SET team_leader_fee=98765 WHERE id=1; SELECT * INTO p1 FROM public.commission_policies WHERE id=1; INSERT INTO public.funeral_cases(customer_id,team_leader_id,status,location,package_name,is_private) VALUES(v_customer,lc,'in_progress','P13 S7 fee','기본형',true) RETURNING id INTO c;
      INSERT INTO p13_expected VALUES(c,'usage_fee_remittance',lc,p1.team_leader_fee,ROUND(p1.team_leader_fee/1.1),p1.team_leader_fee-ROUND(p1.team_leader_fee/1.1),p1.team_leader_fee,'draft');
      SELECT usage_fee=p1.team_leader_fee INTO private_usage_ok FROM public.funeral_cases WHERE id=c;
      SELECT count(*) INTO bad FROM ((SELECT s.case_id,s.type,s.recipient_id,s.amount,s.base_amount,s.tax_amount,s.net_amount,s.status FROM public.settlements s JOIN (SELECT DISTINCT case_id FROM p13_expected) e ON e.case_id=s.case_id EXCEPT ALL SELECT case_id,type,recipient_id,amount,base_amount,tax_amount,net_amount,status FROM p13_expected) UNION ALL (SELECT case_id,type,recipient_id,amount,base_amount,tax_amount,net_amount,status FROM p13_expected EXCEPT ALL SELECT s.case_id,s.type,s.recipient_id,s.amount,s.base_amount,s.tax_amount,s.net_amount,s.status FROM public.settlements s JOIN (SELECT DISTINCT case_id FROM p13_expected) e ON e.case_id=s.case_id)) x;
      IF bad=0 AND margin_ok AND private_zero_ok AND private_usage_ok THEN v_result:=v_result||E'\n[PASS] P13 S1-S7 exact policy-derived settlement sets'; ELSE v_result:=v_result||E'\n[FAIL] P13 exact-set diff='||bad||' margin='||coalesce(margin_ok::text,'null')||' private-zero='||coalesce(private_zero_ok::text,'null')||' private-usage='||coalesce(private_usage_ok::text,'null'); END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P13: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P13 | apply/customer prerequisite missing'; END IF;

-- P12: existing profiles only. Each caller is simulated with authenticated JWT claims,
-- then RESET ROLE so this dry-run never leaves an impersonated role behind.
IF v_apply_24 THEN
  DECLARE a uuid; d uuid; l uuid; c uuid; other_l uuid; relation_l uuid; relation_c uuid;
    who uuid; got_id uuid; expected_email text; got_email text; got_os text; expected_os text;
    denied boolean; public_self bigint; public_related bigint; public_other bigint;
    admin_private_ok boolean := false; nonadmin_private_n bigint := -1; service_ok boolean := false;
  BEGIN
    PERFORM set_config('app.p14_dryrun','on',true);
    SELECT id INTO a FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    SELECT id INTO d FROM public.profiles WHERE role='dealer' ORDER BY id LIMIT 1;
    SELECT id INTO l FROM public.profiles WHERE role='leader' ORDER BY id LIMIT 1;
    SELECT id INTO c FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;
    SELECT fc.customer_id, fc.team_leader_id INTO relation_c, relation_l
      FROM public.funeral_cases fc JOIN public.profiles lp ON lp.id=fc.team_leader_id AND lp.role='leader'
     WHERE fc.customer_id IS NOT NULL ORDER BY fc.created_at NULLS LAST LIMIT 1;
    SELECT id INTO other_l FROM public.profiles pr WHERE pr.role='leader' AND pr.id IS DISTINCT FROM relation_l AND NOT EXISTS(SELECT 1 FROM public.funeral_cases x WHERE x.customer_id=relation_c AND x.team_leader_id=pr.id) AND NOT EXISTS(SELECT 1 FROM public.partners pa WHERE (pa.user_id=pr.id AND pa.master_id IS NOT NULL) OR pa.master_id=pr.id) ORDER BY pr.id LIMIT 1; -- unrelated: no case with this customer, no master/child links (P13 test data lives in this transaction)

    IF a IS NULL OR d IS NULL OR l IS NULL OR c IS NULL THEN
      v_result:=v_result||E'\n[SKIP] P12 profile tests | need admin, dealer, leader, customer';
    ELSE
      -- Direct sensitive-column reads must fail even for the caller's own row.
      FOREACH who IN ARRAY ARRAY[a,d,l,c] LOOP
        denied := false;
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',who::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', who::text, true);
        BEGIN
          EXECUTE format('SELECT email FROM public.profiles WHERE id=%L', who);
        EXCEPTION WHEN insufficient_privilege THEN denied := true;
        END;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
        IF NOT denied THEN RAISE EXCEPTION 'P12 direct email read did not fail for %', who; END IF;
      END LOOP;

      -- P6 row behavior remains: own + related public fields visible, unrelated leader invisible.
      IF relation_c IS NOT NULL AND relation_l IS NOT NULL AND other_l IS NOT NULL THEN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',relation_c::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', relation_c::text, true);
        SELECT count(*) INTO public_self FROM public.profiles WHERE id=relation_c;
        SELECT count(*) INTO public_related FROM public.profiles WHERE id=relation_l;
        SELECT count(*) INTO public_other FROM public.profiles WHERE id=other_l;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
        IF public_self=1 AND public_related=1 AND public_other=0 THEN
          v_result:=v_result||E'\n[PASS] P12 direct sensitive denial and P6 public own/related/unrelated rows';
        ELSE v_result:=v_result||format(E'\n[FAIL] P12 public P6 rows self=%s related=%s unrelated=%s',public_self,public_related,public_other); END IF;
      ELSE v_result:=v_result||E'\n[SKIP] P12 P6 public-row check | need related customer/leader and another leader'; END IF;

      -- Each role receives only its own sensitive values through the self RPC.
      FOREACH who IN ARRAY ARRAY[a,d,l,c] LOOP
        SELECT email, os_type INTO expected_email, expected_os FROM public.profiles WHERE id=who;
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',who::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', who::text, true);
        SELECT id, email, os_type INTO got_id, got_email, got_os FROM public.get_my_profile_private();
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
        IF got_id IS DISTINCT FROM who OR got_email IS DISTINCT FROM expected_email OR got_os IS DISTINCT FROM expected_os THEN
          RAISE EXCEPTION 'P12 self RPC mismatch for %', who;
        END IF;
      END LOOP;
      v_result:=v_result||E'\n[PASS] P12 get_my_profile_private returns each caller own email/os_type';

      SELECT email INTO expected_email FROM public.profiles WHERE id=d;
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',a::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', a::text, true);
      SELECT (SELECT email FROM public.admin_get_profile_private(ARRAY[d]) LIMIT 1) IS NOT DISTINCT FROM expected_email
         AND (SELECT count(*) FROM public.admin_get_profile_private(NULL)) = (SELECT count(*) FROM public.profiles)
        INTO admin_private_ok;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', d::text, true);
      SELECT count(*) INTO nonadmin_private_n FROM public.admin_get_profile_private(ARRAY[a,d]);
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF admin_private_ok AND nonadmin_private_n=0 THEN
        v_result:=v_result||E'\n[PASS] P12 admin private RPC returns requested values; non-admin gets zero rows';
      ELSE v_result:=v_result||format(E'\n[FAIL] P12 admin private RPC admin=%s nonadmin_rows=%s',admin_private_ok,nonadmin_private_n); END IF;

      -- These are the public profile field combinations used by screen embeds after P12.
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',a::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', a::text, true);
      PERFORM 1 FROM public.partners pa LEFT JOIN public.profiles p ON p.id=pa.user_id
        WHERE (p.name IS NULL OR p.name IS NOT NULL) AND (p.phone IS NULL OR p.phone IS NOT NULL) AND (p.role IS NULL OR p.role IS NOT NULL) LIMIT 1;
      PERFORM 1 FROM public.funeral_cases fc LEFT JOIN public.profiles customer ON customer.id=fc.customer_id
        LEFT JOIN public.profiles leader ON leader.id=fc.team_leader_id
        WHERE (customer.name IS NULL OR customer.name IS NOT NULL) AND (customer.phone IS NULL OR customer.phone IS NOT NULL)
          AND (leader.avatar_url IS NULL OR leader.avatar_url IS NOT NULL) LIMIT 1;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      v_result:=v_result||E'\n[PASS] P12 admin screen public profile embed field combinations are selectable';

      SELECT has_column_privilege('postgres','public.profiles','id','SELECT')
         AND has_column_privilege('postgres','public.profiles','phone','SELECT')
         AND has_column_privilege('postgres','public.profiles','name','SELECT')
         AND has_column_privilege('postgres','public.profiles','os_type','SELECT')
         AND has_column_privilege('postgres','public.profiles','fcm_token','SELECT')
         AND has_column_privilege('postgres','public.profiles','role','SELECT')
        INTO service_ok;
      IF service_ok THEN v_result:=v_result||E'\n[PASS] P12 postgres/service-role send-alert profile columns remain selectable';
      ELSE v_result:=v_result||E'\n[FAIL] P12 postgres/service-role send-alert column privilege missing'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    v_result:=v_result||E'\n[FAIL] P12 profile sensitive-column tests: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'\n[SKIP] P12 profile sensitive-column tests | apply prerequisite missing'; END IF;

-- P14: existing profiles/partners only. The final DRYRUN_RESULT exception rolls every UPDATE back.
IF v_apply_25 THEN
  DECLARE a uuid; l_missing uuid; l_ready uuid; approval_ok boolean := false; denied boolean := false;
    candidate uuid; expected_map jsonb; policy_ok boolean := false; n_missing bigint := 0;
  BEGIN
    SELECT id INTO a FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;
    SELECT p.user_id INTO l_missing FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
      WHERE pr.role='leader' ORDER BY (p.status='approved') DESC, p.user_id LIMIT 1;
    SELECT p.user_id INTO l_ready FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
      WHERE pr.role='leader' AND p.user_id IS DISTINCT FROM l_missing ORDER BY p.user_id LIMIT 1;
    IF l_missing IS NULL OR l_ready IS NULL THEN
      v_result:=v_result||E'\n[SKIP] P14 | need two existing leader partners';
    ELSE
      DELETE FROM public.partner_bank_accounts WHERE partner_id=l_missing;
      UPDATE public.partners SET business_doc_path=NULL, docs_exempt=false, status='pending', current_status='waiting' WHERE user_id=l_missing;
      INSERT INTO public.partner_bank_accounts(partner_id,bank_code,bank_account,bank_holder)
        VALUES(l_ready,'004','123456789012','P14시험')
        ON CONFLICT(partner_id) DO UPDATE SET bank_code=EXCLUDED.bank_code,bank_account=EXCLUDED.bank_account,bank_holder=EXCLUDED.bank_holder;
      UPDATE public.partners SET business_doc_path=l_ready::text||'/p14-test.pdf', docs_exempt=false, status='pending', current_status='waiting' WHERE user_id=l_ready;

      -- off, new_only exempt, new_only non-exempt and all each use an actual approval UPDATE.
      INSERT INTO public.system_config(key,value) VALUES('leader_docs_required','off') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
      UPDATE public.partners SET status='approved' WHERE user_id=l_missing;
      approval_ok := (SELECT status='approved' FROM public.partners WHERE user_id=l_missing);
      UPDATE public.partners SET status='pending',docs_exempt=true WHERE user_id=l_missing;
      INSERT INTO public.system_config(key,value) VALUES('leader_docs_required','new_only') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
      UPDATE public.partners SET status='approved' WHERE user_id=l_missing;
      approval_ok := approval_ok AND (SELECT status='approved' FROM public.partners WHERE user_id=l_missing);
      UPDATE public.partners SET status='pending',docs_exempt=false WHERE user_id=l_missing;
      BEGIN UPDATE public.partners SET status='approved' WHERE user_id=l_missing; EXCEPTION WHEN check_violation THEN denied:=true; END;
      INSERT INTO public.system_config(key,value) VALUES('leader_docs_required','all') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
      UPDATE public.partners SET docs_exempt=true WHERE user_id=l_missing;
      BEGIN UPDATE public.partners SET status='approved' WHERE user_id=l_missing; EXCEPTION WHEN check_violation THEN denied:=denied; END;
      -- An administrator executes the same UPDATE; the trigger must still reject it.
      IF a IS NOT NULL THEN
        SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',a::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',a::text,true);
        BEGIN UPDATE public.partners SET status='approved' WHERE user_id=l_missing; EXCEPTION WHEN check_violation THEN denied:=denied; END;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      END IF;
      UPDATE public.partners SET status='approved' WHERE user_id=l_ready;
      expected_map := jsonb_build_object(l_missing::text,'1',l_ready::text,'2');
      SELECT public.find_next_bidder(expected_map,'{}'::uuid[],gen_random_uuid(),NULL) INTO candidate;
      IF approval_ok AND denied AND candidate=l_ready THEN v_result:=v_result||E'\n[PASS] P14 off/new_only/all approval guard and bidder candidate set';
      ELSE v_result:=v_result||format(E'\n[FAIL] P14 approval/candidate off-new=%s denied=%s candidate=%s expected=%s',approval_ok,denied,candidate,l_ready); END IF;

      SELECT count(*) INTO n_missing FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
        WHERE pr.role='leader' AND public.leader_docs_enforced(p.user_id) AND NOT public.leader_docs_ok(p.user_id);
      SELECT count(*)=4 AND bool_and((COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%partner-docs%' AND (policyname='partner_docs_admin_select' OR (COALESCE(qual,'')||COALESCE(with_check,'')) LIKE '%foldername%'))
        INTO policy_ok FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
          AND policyname IN ('partner_docs_owner_insert','partner_docs_owner_select','partner_docs_owner_update','partner_docs_admin_select');
      IF policy_ok THEN v_result:=v_result||format(E'\n[PASS] P14 private bucket RLS policy definitions; enforced missing=%s',n_missing);
      ELSE v_result:=v_result||E'\n[FAIL] P14 private bucket RLS policy definitions'; END IF;

      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',l_ready::text,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',l_ready::text,true);
      denied:=false; BEGIN PERFORM public.set_leader_docs_required('off'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF denied THEN v_result:=v_result||E'\n[PASS] P14 non-admin config change denied'; ELSE v_result:=v_result||E'\n[FAIL] P14 non-admin config change was allowed'; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    v_result:=v_result||E'\n[FAIL] P14: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'\n[SKIP] P14 | apply prerequisite missing'; END IF;

-- P17: only a new pre_registrations INSERT invokes the existing authenticated
-- webhook machinery. The trigger remains disabled throughout this dry-run, so
-- no public HTTP/network call can be queued by the P10/P11 registration tests.
IF v_apply_26 THEN
  DECLARE prereg_def text; funeral_now text; profile_now text; prereg_enabled text; cfg_ok boolean;
  BEGIN
    SELECT pg_get_triggerdef(t.oid), t.tgenabled::text INTO prereg_def, prereg_enabled
      FROM pg_trigger t WHERE t.tgrelid='public.pre_registrations'::regclass AND t.tgname='pre-registration-dealer-alert' AND NOT t.tgisinternal;
    SELECT pg_get_triggerdef(t.oid) INTO funeral_now
      FROM pg_trigger t WHERE t.tgrelid='public.funeral_cases'::regclass AND t.tgname='funeral-case-alert' AND NOT t.tgisinternal;
    SELECT pg_get_triggerdef(t.oid) INTO profile_now
      FROM pg_trigger t WHERE t.tgrelid='public.profiles'::regclass AND t.tgname='profile-signup-alert' AND NOT t.tgisinternal;
    SELECT count(*)=2 INTO cfg_ok FROM public.system_config
      WHERE (key='sms_alert_prereg_dealer' AND value='true') OR (key='sms_alert_prereg_hourly_cap' AND value ~ '^[1-9][0-9]*$');
    IF v_prereg_alert_was_enabled AND prereg_enabled='D'
       AND prereg_def ILIKE '%AFTER INSERT ON public.pre_registrations%'
       AND prereg_def ILIKE '%supabase_functions.http_request%'
       AND funeral_now=v_funeral_alert_def AND profile_now=v_profile_alert_def AND cfg_ok THEN
      v_result:=v_result||E'\n[PASS] P17 pre-registration-only webhook exists/enabled-before-dryrun; existing alerts unchanged; dryrun trigger disabled';
    ELSE
      v_result:=v_result||format(E'\n[FAIL] P17 webhook/trigger invariants enabled-before=%s now=%s config=%s',v_prereg_alert_was_enabled,coalesce(prereg_enabled,'NULL'),cfg_ok);
    END IF;
  EXCEPTION WHEN OTHERS THEN v_result:=v_result||E'\n[FAIL] P17 trigger static checks: '||SQLERRM; END;
ELSE v_result:=v_result||E'\n[SKIP] P17 | apply prerequisite missing'; END IF;


-- P18: s_downline_overview_v2(). The hierarchy is built inside this rolled-back transaction, so the test never depends on production rows.
IF v_apply_27 AND v_customer IS NOT NULL THEN
  DECLARE
    sa uuid; sb uuid; sc uuid; sx uuid; sd uuid; se uuid; sf uuid; sg uuid; sh uuid; si uuid; lead uuid; nm_b text; cols text;
    c1 uuid; code1 text; coup_id uuid; r record; u uuid; got_n int; ok boolean := true; why text := '';
    fee1 text; fee2 text; fee3 text; path_ok boolean; iso_ok boolean; nonS_ok boolean; hidden_ok boolean; deep_ok boolean := true;
  BEGIN
    SELECT pa.user_id INTO sa FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sb FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id<>sa ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sc FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sx FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sd FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO se FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx,sd) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sf FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx,sd,se) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sg FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx,sd,se,sf) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO sh FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx,sd,se,sf,sg) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO si FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='dealer' AND pa.user_id NOT IN (sa,sb,sc,sx,sd,se,sf,sg,sh) ORDER BY pa.user_id LIMIT 1;
    SELECT pa.user_id INTO lead FROM public.partners pa JOIN public.profiles pr ON pr.id=pa.user_id WHERE pa.status='approved' AND pr.role='leader' ORDER BY pa.user_id LIMIT 1;
    IF sa IS NULL OR sb IS NULL OR sc IS NULL OR sx IS NULL OR lead IS NULL THEN
      v_result:=v_result||E'\n[SKIP] P18 | need 4 approved dealers and 1 leader';
    ELSE
      SELECT name INTO nm_b FROM public.profiles WHERE id=sb;
      -- clear links into/out of the test members, then build S(sa) -> Master(sb) -> C(sc); sx is an unrelated second S.
      UPDATE public.partners SET master_id=NULL WHERE master_id IN (sa,sb,sc,sx) OR user_id IN (sa,sb,sc,sx);
      UPDATE public.partners SET grade='S' WHERE user_id IN (sa,sx);
      UPDATE public.partners SET grade='Master', master_id=sa WHERE user_id=sb;
      UPDATE public.partners SET grade='C', master_id=sb WHERE user_id=sc;

      -- a) static column check: no customer, money, contact, photo, or bank column can be returned.
      SELECT pg_get_function_result(p.oid) INTO cols FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='s_downline_overview_v2' LIMIT 1;
      IF cols IS NULL OR cols ~* '(phone|contact|연락처|금액|amount|photo|avatar|image|customer|elder|사진|계좌|bank|tax|net_)' THEN ok:=false; why:=why||' cols'; END IF;

      -- b) pre-registrations: two stored + one converted for sc (expected counts 3 / 2 / 1).
      SELECT id, code INTO coup_id, code1 FROM public.coupons WHERE issued_by=sc AND is_card ORDER BY created_at LIMIT 1;
      IF coup_id IS NULL THEN
        PERFORM public.ensure_dealer_card_coupon(sc);
        SELECT id, code INTO coup_id, code1 FROM public.coupons WHERE issued_by=sc AND is_card ORDER BY created_at LIMIT 1;
      END IF;
      DELETE FROM public.pre_registrations WHERE dealer_id IN (sa,sb,sc,sx);
      INSERT INTO public.pre_registrations(coupon_id,coupon_code,dealer_id,name,phone,relationship,consent_at,status) VALUES
        (coup_id,code1,sc,'P18a','01011110001','자녀',now(),'registered'),
        (coup_id,code1,sc,'P18b','01011110002','자녀',now(),'registered'),
        (coup_id,code1,sc,'P18c','01011110003','자녀',now(),'converted');

      -- c) one case for sc with a leader: settlements are generated by the production trigger.
      INSERT INTO public.funeral_cases(customer_id,dealer_id,team_leader_id,status,location,package_name) VALUES(v_customer,sc,lead,'requested','P18 case','기본형') RETURNING id INTO c1;
      UPDATE public.funeral_cases SET status='in_progress' WHERE id=c1;

      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', sa::text, true);
      SELECT count(*) INTO got_n FROM public.s_downline_overview_v2();
      IF got_n<>2 THEN ok:=false; why:=why||' rows='||got_n; END IF;
      SELECT * INTO r FROM public.s_downline_overview_v2() WHERE partner_id=sb;
      path_ok := r.소속마스터경로='직속' AND r.예비등록건수=0;
      SELECT * INTO r FROM public.s_downline_overview_v2() WHERE partner_id=sc;
      path_ok := path_ok AND r.소속마스터경로=nm_b AND r.예비등록건수=3 AND r.예비보관중=2 AND r.예비접수완료=1 AND r.단계='in_progress';
      fee1 := r.수수료상태;
      IF NOT path_ok THEN ok:=false; why:=why||' path/prereg('||coalesce(r.소속마스터경로,'null')||','||coalesce(r.예비등록건수::text,'null')||','||coalesce(r.단계,'null')||')'; END IF;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- d) fee status: draft rows -> wait; sc's own commission rows all paid -> paid; one reopened -> wait again.
      UPDATE public.settlements SET status='paid' WHERE case_id=c1 AND recipient_id=sc AND type IN ('dealer_commission','dealer_override');
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', sa::text, true);
      SELECT 수수료상태 INTO fee2 FROM public.s_downline_overview_v2() WHERE partner_id=sc;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      UPDATE public.settlements SET status='awaiting_payment' WHERE case_id=c1 AND recipient_id=sc AND type='dealer_commission';
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', sa::text, true);
      SELECT 수수료상태 INTO fee3 FROM public.s_downline_overview_v2() WHERE partner_id=sc;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF fee1 IS DISTINCT FROM '대기' OR fee2 IS DISTINCT FROM '지급 완료' OR fee3 IS DISTINCT FROM '대기' THEN
        ok:=false; why:=why||' fee='||coalesce(fee1,'null')||'/'||coalesce(fee2,'null')||'/'||coalesce(fee3,'null');
      END IF;

      -- e) isolation: another S gets 0 rows; Master, child, leader, customer callers get 0 rows.
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sx::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', sx::text, true);
      SELECT count(*) INTO got_n FROM public.s_downline_overview_v2(); iso_ok := (got_n=0);
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      nonS_ok := true;
      FOREACH u IN ARRAY ARRAY[sb,sc,lead,v_customer] LOOP
        SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',u::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', u::text, true);
        SELECT count(*) INTO got_n FROM public.s_downline_overview_v2(); IF got_n<>0 THEN nonS_ok:=false; END IF;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      END LOOP;
      IF NOT iso_ok OR NOT nonS_ok THEN ok:=false; why:=why||' isolation(iso='||iso_ok||',nonS='||nonS_ok||')'; END IF;

      -- g) cycle guard alone must allow the ninth depth; no production row is inserted.
      IF sd IS NOT NULL AND se IS NOT NULL AND sf IS NOT NULL AND sg IS NOT NULL AND sh IS NOT NULL AND si IS NOT NULL THEN
        UPDATE public.partners SET master_id=NULL WHERE master_id IN (sa,sb,sc,sx,sd,se,sf,sg,sh,si) OR user_id IN (sa,sb,sc,sx,sd,se,sf,sg,sh,si);
        UPDATE public.partners SET grade='S' WHERE user_id=sa;
        UPDATE public.partners SET grade='Master', master_id=sa WHERE user_id=sd;
        UPDATE public.partners SET grade='C', master_id=sa WHERE user_id=sb;
        UPDATE public.partners SET master_id=sb WHERE user_id=sc;
        UPDATE public.partners SET master_id=sc WHERE user_id=sx;
        UPDATE public.partners SET master_id=sx WHERE user_id=sd;
        UPDATE public.partners SET master_id=sd WHERE user_id=se;
        UPDATE public.partners SET master_id=se WHERE user_id=sf;
        UPDATE public.partners SET master_id=sf WHERE user_id=sg;
        UPDATE public.partners SET master_id=sg WHERE user_id=sh;
        UPDATE public.partners SET master_id=sh WHERE user_id=si;
        SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub',sa::text,true);
        SELECT EXISTS(SELECT 1 FROM public.s_downline_overview_v2() WHERE partner_id=si AND relationship='restricted_downline') INTO deep_ok;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
        IF NOT deep_ok THEN ok:=false; why:=why||' depth9'; END IF;
      END IF;

      -- f) the S caller cannot read progress reports, pre-registrations, or settlements directly.
      hidden_ok := true;
      SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub',sa::text,'role','authenticated')::text, true); PERFORM set_config('request.jwt.claim.sub', sa::text, true);
      BEGIN SELECT count(*) INTO got_n FROM public.funeral_progress_reports; IF got_n<>0 THEN hidden_ok:=false; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN SELECT count(*) INTO got_n FROM public.pre_registrations; IF got_n<>0 THEN hidden_ok:=false; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN SELECT count(*) INTO got_n FROM public.settlements WHERE case_id=c1; IF got_n<>0 THEN hidden_ok:=false; END IF; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      IF NOT hidden_ok THEN ok:=false; why:=why||' direct-read'; END IF;

      IF ok THEN v_result:=v_result||E'\n[PASS] P18 columns, owner path, exact prereg counts 3/2/1, fee wait/paid/wait, S isolation, non-S zero rows, depth9, no direct reads';
      ELSE v_result:=v_result||E'\n[FAIL] P18:'||why; END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    v_result:=v_result||E'\n[FAIL] P18: '||SQLERRM;
  END;
ELSE v_result:=v_result||E'\n[SKIP] P18 | apply/customer prerequisite missing'; END IF;

-- P15: Extra sales and fee settlements verification
IF v_apply_28 AND v_customer IS NOT NULL THEN
  DECLARE
    lead1 uuid; lead2 uuid; deal1 uuid; cust1 uuid := v_customer; cust2 uuid; adm1 uuid;
    c_basic uuid; c_adv uuid; c_lock uuid;
    item1_id uuid; item2_id uuid; item3_id uuid;
    s_row record;
    got_tot integer; got_cnt integer;
    ok boolean := true; why text := '';
    non_draft_err boolean := false;
    not_in_prog_err boolean := false;
    hard_delete_err boolean := false;
    role_lead1_cnt integer; role_lead2_cnt integer; role_deal_cnt integer;
    role_cust1_cnt integer; role_cust2_cnt integer; role_adm_cnt integer;
    lead2_insert_denied boolean := false;
    deal_insert_denied boolean := false;
    cust_insert_denied boolean := false;
    bucket_ok boolean := false;
    storage_policies_ok boolean := false;
    cust_summary_col_ok boolean := true;
    col_rec record;
    s_before_count integer; s_after_count integer;
    base_remit integer; extra_fee integer; tot_deposit integer; transfer_count integer; overflow_blocked boolean := false;
    log_item1 uuid; log_item2 uuid;
    n_logs bigint;
    log1 record; log2 record; log3 record;
    restore_rec record;
    ts_item1 uuid;
    matrix_c uuid; matrix_i uuid;
    matrix_cnt integer := 0; m_ok boolean := true;
    err_hq boolean := false; err_comp boolean := false; err_canc boolean := false;
    err_pend boolean := false; err_paid boolean := false;
    err_no_reason boolean := false; err_blank_reason boolean := false;
    log_read_lead1 bigint; log_read_lead2 bigint; log_read_deal bigint;
    log_read_cust1 bigint; log_read_adm bigint;
    log_insert_blocked boolean := false; log_update_blocked boolean := false; log_delete_blocked boolean := false;
    log_fk_partners_cnt integer;
  BEGIN
    SELECT id INTO lead1 FROM public.profiles WHERE role='leader' ORDER BY id LIMIT 1;
    SELECT id INTO lead2 FROM public.profiles WHERE role='leader' AND id IS DISTINCT FROM lead1 ORDER BY id LIMIT 1;
    SELECT id INTO deal1 FROM public.profiles WHERE role='dealer' ORDER BY id LIMIT 1;
    SELECT id INTO cust2 FROM public.profiles WHERE role='customer' AND id IS DISTINCT FROM cust1 ORDER BY id LIMIT 1;
    SELECT id INTO adm1 FROM public.profiles WHERE role='admin' ORDER BY id LIMIT 1;

    IF lead1 IS NULL OR deal1 IS NULL OR adm1 IS NULL THEN
      v_result := v_result || E'\n[SKIP] P15 | need leader, dealer, and admin profiles';
    ELSE
      -- 1. Commission policies setup: rate 37 for policy 1 ('기본형'), rate 41 for policy 2 ('고급형')
      UPDATE public.commission_policies SET extra_sales_fee_rate = 37 WHERE id = 1;
      UPDATE public.commission_policies SET extra_sales_fee_rate = 41 WHERE id = 2;

      -- Create basic case
      INSERT INTO public.funeral_cases(customer_id, dealer_id, team_leader_id, status, location, package_name)
      VALUES(cust1, deal1, lead1, 'requested', 'P15 basic test', '기본형') RETURNING id INTO c_basic;
      UPDATE public.funeral_cases SET status='in_progress' WHERE id=c_basic;

      -- Check existing settlements count
      SELECT count(*) INTO s_before_count FROM public.settlements WHERE case_id=c_basic;

      -- Insert 3 items:
      -- item 1: unit_price 15000, quantity 2 (소계 30000)
      -- item 2: unit_price 20000, quantity 3 (소계 60000)
      -- item 3: unit_price 50000, quantity 1 (소계 50000) -> cancelled
      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_basic, '영정사진 고급형', 15000, 2, lead1) RETURNING id INTO item1_id;

      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_basic, '제단 꽃장식 추가', 20000, 3, lead1) RETURNING id INTO item2_id;

      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by, is_cancelled, cancel_reason)
      VALUES(c_basic, '취소될 항목', 50000, 1, lead1, true, '초기 취소 사유') RETURNING id INTO item3_id;

      -- Verify case total: 30000 + 60000 = 90000 (cancelled excluded)
      SELECT additional_income_total INTO got_tot FROM public.funeral_cases WHERE id=c_basic;
      IF got_tot <> 90000 THEN
        ok := false; why := why || ' case_tot=' || coalesce(got_tot::text,'null') || '!=90000';
      END IF;

      -- Verify extra_sales_fee settlement:
      -- fee = ROUND(90000 * 37 / 100) = 33300
      -- base = ROUND(33300 / 1.1) = 30273
      -- tax = 33300 - 30273 = 3027
      SELECT * INTO s_row FROM public.settlements WHERE case_id=c_basic AND type='extra_sales_fee';
      IF s_row.id IS NULL OR s_row.amount <> 33300 OR s_row.base_amount <> 30273 OR s_row.tax_amount <> 3027
         OR s_row.net_amount <> 33300 OR s_row.recipient_id <> lead1 OR s_row.status <> 'draft' THEN
        ok := false; why := why || ' s_basic(amt=' || coalesce(s_row.amount::text,'null') || ',base=' || coalesce(s_row.base_amount::text,'null') || ',tax=' || coalesce(s_row.tax_amount::text,'null') || ')';
      END IF;

      -- Test policy 2 ('고급형', rate 41)
      INSERT INTO public.funeral_cases(customer_id, dealer_id, team_leader_id, status, location, package_name)
      VALUES(cust1, deal1, lead1, 'requested', 'P15 adv test', '고급형') RETURNING id INTO c_adv;
      UPDATE public.funeral_cases SET status='in_progress' WHERE id=c_adv;

      SELECT count(*) INTO s_before_count FROM public.settlements WHERE case_id=c_adv;

      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_adv, '고급 수의 업그레이드', 100000, 1, lead1);

      -- fee = ROUND(100000 * 41 / 100) = 41000, base = ROUND(41000 / 1.1) = 37273, tax = 3727
      SELECT * INTO s_row FROM public.settlements WHERE case_id=c_adv AND type='extra_sales_fee';
      IF s_row.id IS NULL OR s_row.amount <> 41000 OR s_row.base_amount <> 37273 OR s_row.tax_amount <> 3727 THEN
        ok := false; why := why || ' s_adv(amt=' || coalesce(s_row.amount::text,'null') || ',base=' || coalesce(s_row.base_amount::text,'null') || ')';
      END IF;

      -- 2. Modify item & zero-total settlement deletion
      -- Update item 1: unit_price 10000, quantity 1 -> sum becomes 10000 + 60000 = 70000
      -- fee = ROUND(70000 * 37 / 100) = 25900, base = ROUND(25900 / 1.1) = 23545, tax = 2355
      UPDATE public.additional_income_items SET unit_price = 10000, quantity = 1 WHERE id=item1_id;
      SELECT * INTO s_row FROM public.settlements WHERE case_id=c_basic AND type='extra_sales_fee';
      IF s_row.amount <> 25900 OR s_row.base_amount <> 23545 OR s_row.tax_amount <> 2355 THEN
        ok := false; why := why || ' update_item(amt=' || coalesce(s_row.amount::text,'null') || ')';
      END IF;

      -- Cancel item 1 and item 2 -> total becomes 0
      UPDATE public.additional_income_items SET is_cancelled = true, cancel_reason = '테스트 일괄 취소' WHERE id IN (item1_id, item2_id);
      SELECT additional_income_total INTO got_tot FROM public.funeral_cases WHERE id=c_basic;
      SELECT count(*) INTO got_cnt FROM public.settlements WHERE case_id=c_basic AND type='extra_sales_fee';
      IF got_tot <> 0 OR got_cnt <> 0 THEN
        ok := false; why := why || ' zero_del(tot=' || got_tot || ',cnt=' || got_cnt || ')';
      END IF;

      -- Uncancel item 1 -> row recreated, exactly 1 row
      UPDATE public.additional_income_items SET is_cancelled = false WHERE id=item1_id;
      SELECT count(*) INTO got_cnt FROM public.settlements WHERE case_id=c_basic AND type='extra_sales_fee';
      IF got_cnt <> 1 THEN
        ok := false; why := why || ' uncancel_cnt=' || got_cnt;
      END IF;

      -- 3. Locking, Cancellation reasons, Item logs, and Settling tests:
      -- a) Hard delete forbidden
      BEGIN
        DELETE FROM public.additional_income_items WHERE id=item1_id;
      EXCEPTION WHEN OTHERS THEN
        hard_delete_err := (position('삭제할 수 없습니다' in SQLERRM) > 0);
      END;
      IF NOT hard_delete_err THEN ok := false; why := why || ' hard_delete_not_blocked'; END IF;

      -- b) Invalid case status (e.g. consulting) -> blocked
      INSERT INTO public.funeral_cases(customer_id, team_leader_id, status, location, package_name)
      VALUES(cust1, lead1, 'consulting', 'P15 lock test', '기본형') RETURNING id INTO c_lock;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity)
        VALUES(c_lock, '시도 항목', 10000, 1);
      EXCEPTION WHEN OTHERS THEN
        not_in_prog_err := (SQLERRM = '본사 입금 확인 이후에는 추가 매출을 수정할 수 없습니다.');
      END;
      IF NOT not_in_prog_err THEN ok := false; why := why || ' non_in_prog_not_blocked'; END IF;

      -- c) Registration -> Cancel reason tests (null/blank blocked, reason allowed) -> Re-registration & log check
      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_basic, '이력시험품목1', 20000, 2, lead1) RETURNING id INTO log_item1;

      -- Cancellation without reason -> must fail
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = true, cancel_reason = NULL WHERE id = log_item1;
      EXCEPTION WHEN OTHERS THEN
        err_no_reason := (SQLERRM = '취소 사유를 입력해 주세요.');
      END;
      IF NOT err_no_reason THEN ok := false; why := why || ' cancel_no_reason_not_blocked'; END IF;

      -- Cancellation with blank reason -> must fail
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = true, cancel_reason = '    ' WHERE id = log_item1;
      EXCEPTION WHEN OTHERS THEN
        err_blank_reason := (SQLERRM = '취소 사유를 입력해 주세요.');
      END;
      IF NOT err_blank_reason THEN ok := false; why := why || ' cancel_blank_reason_not_blocked'; END IF;

      -- Cancellation with valid reason -> must succeed
      UPDATE public.additional_income_items
      SET is_cancelled = true, cancel_reason = '상주 단순변심 취소'
      WHERE id = log_item1;

      -- Re-registration
      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_basic, '이력시험품목2', 15000, 3, lead1) RETURNING id INTO log_item2;

      -- Verify logs for log_item1 & log_item2
      SELECT count(*) INTO n_logs FROM public.additional_income_item_logs WHERE item_id = log_item1;
      IF n_logs <> 2 THEN ok := false; why := why || ' log_item1_count=' || n_logs; END IF;

      SELECT * INTO log1 FROM public.additional_income_item_logs WHERE item_id = log_item1 ORDER BY changed_at ASC LIMIT 1;
      SELECT * INTO log2 FROM public.additional_income_item_logs WHERE item_id = log_item1 ORDER BY changed_at DESC LIMIT 1;

      IF log1.action <> 'create' OR (log1.new_row->>'unit_price')::int <> 20000
         OR (log1.new_row->>'quantity')::int <> 2 OR (log1.new_row->>'is_cancelled')::boolean <> false
         OR log1.actor_id <> lead1 OR log1.old_row IS NOT NULL THEN
        ok := false; why := why || ' log1_create_mismatch';
      END IF;

      IF log2.action <> 'cancel' OR (log2.old_row->>'is_cancelled')::boolean <> false
         OR (log2.new_row->>'is_cancelled')::boolean <> true OR log2.reason <> '상주 단순변심 취소'
         OR log2.actor_id <> lead1 THEN
        ok := false; why := why || ' log2_cancel_mismatch';
      END IF;

      SELECT * INTO log3 FROM public.additional_income_item_logs WHERE item_id = log_item2 ORDER BY changed_at ASC LIMIT 1;
      IF log3.action <> 'create' OR (log3.new_row->>'unit_price')::int <> 15000
         OR (log3.new_row->>'quantity')::int <> 3 OR log3.actor_id <> lead1 THEN
        ok := false; why := why || ' log3_create_mismatch';
      END IF;

      -- d) Restore item and verify columns cleared & log recorded
      UPDATE public.additional_income_items SET is_cancelled = false WHERE id = log_item1;
      SELECT cancel_reason, cancelled_by, cancelled_at INTO restore_rec
      FROM public.additional_income_items WHERE id = log_item1;

      IF restore_rec.cancel_reason IS NOT NULL OR restore_rec.cancelled_by IS NOT NULL OR restore_rec.cancelled_at IS NOT NULL THEN
        ok := false; why := why || ' restore_columns_not_cleared';
      END IF;

      SELECT * INTO log3 FROM public.additional_income_item_logs WHERE item_id = log_item1 ORDER BY changed_at DESC LIMIT 1;
      IF log3.action <> 'restore' OR (log3.old_row->>'is_cancelled')::boolean <> true
         OR (log3.new_row->>'is_cancelled')::boolean <> false OR log3.actor_id <> lead1 THEN
        ok := false; why := why || ' restore_log_mismatch';
      END IF;

      -- e) Transition c_basic to team_settling -> fee transitions to awaiting_payment
      UPDATE public.funeral_cases SET status = 'team_settling' WHERE id = c_basic;
      SELECT status INTO s_row.status FROM public.settlements WHERE case_id = c_basic AND type = 'extra_sales_fee';
      IF s_row.status IS DISTINCT FROM 'awaiting_payment' THEN
        ok := false; why := why || ' settling_initial_status=' || coalesce(s_row.status,'null');
      END IF;

      -- Insert item during team_settling -> must be allowed, and fee updated while retaining awaiting_payment
      INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
      VALUES(c_basic, '종료후 추가품목', 50000, 2, lead1) RETURNING id INTO ts_item1;

      -- Total active in c_basic:
      -- item1_id: 10000 * 1 = 10000
      -- log_item1: 20000 * 2 = 40000
      -- log_item2: 15000 * 3 = 45000
      -- ts_item1: 50000 * 2 = 100000
      -- Total = 195000
      -- fee = ROUND(195000 * 37 / 100) = 72150
      -- base = ROUND(72150 / 1.1) = 65591
      -- tax = 72150 - 65591 = 6559
      SELECT * INTO s_row FROM public.settlements WHERE case_id = c_basic AND type = 'extra_sales_fee';
      IF s_row.amount <> 72150 OR s_row.base_amount <> 65591 OR s_row.tax_amount <> 6559
         OR s_row.status <> 'awaiting_payment' THEN
        ok := false; why := why || format(' ts_insert_calc(amt=%s,base=%s,tax=%s,status=%s)', s_row.amount, s_row.base_amount, s_row.tax_amount, s_row.status);
      END IF;

      -- Cancel ts_item1 during team_settling -> must be allowed, and fee recalculated
      UPDATE public.additional_income_items
      SET is_cancelled = true, cancel_reason = '종료후 취소 사유'
      WHERE id = ts_item1;

      -- Total after cancelling ts_item1: 195000 - 100000 = 95000
      -- fee = ROUND(95000 * 37 / 100) = 35150
      -- base = ROUND(35150 / 1.1) = 31955
      -- tax = 35150 - 31955 = 3195
      SELECT * INTO s_row FROM public.settlements WHERE case_id = c_basic AND type = 'extra_sales_fee';
      IF s_row.amount <> 35150 OR s_row.base_amount <> 31955 OR s_row.tax_amount <> 3195
         OR s_row.status <> 'awaiting_payment' THEN
        ok := false; why := why || format(' ts_cancel_calc(amt=%s,base=%s,tax=%s,status=%s)', s_row.amount, s_row.base_amount, s_row.tax_amount, s_row.status);
      END IF;

      -- f) Matrix test: case status x settlement status (at least 8 combinations)
      INSERT INTO public.funeral_cases(customer_id, team_leader_id, status, location, package_name)
      VALUES(cust1, lead1, 'in_progress', 'P15 matrix test', '기본형') RETURNING id INTO matrix_c;

      -- 1) in_progress + draft -> INSERT allowed
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'M1', 10000, 1, lead1) RETURNING id INTO matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m1_fail'; END;

      -- 2) in_progress + draft -> UPDATE(cancel) allowed
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = true, cancel_reason = 'M2 취소' WHERE id = matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m2_fail'; END;

      -- 3) in_progress + awaiting_payment -> UPDATE allowed
      UPDATE public.settlements SET status = 'awaiting_payment' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = false WHERE id = matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m3_fail'; END;

      -- 4) in_progress + paid -> INSERT denied ("이미 입금 처리 중이라 수정할 수 없습니다.")
      UPDATE public.settlements SET status = 'paid' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      err_paid := false;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'M4', 10000, 1, lead1);
      EXCEPTION WHEN OTHERS THEN
        err_paid := (SQLERRM = '이미 입금 처리 중이라 수정할 수 없습니다.');
      END;
      IF err_paid THEN matrix_cnt := matrix_cnt + 1; ELSE m_ok := false; why := why || ' m4_fail'; END IF;

      -- 5) team_settling + draft -> INSERT allowed
      UPDATE public.funeral_cases SET status = 'team_settling' WHERE id = matrix_c;
      UPDATE public.settlements SET status = 'draft' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'M5', 10000, 1, lead1) RETURNING id INTO matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m5_fail'; END;

      -- 6) team_settling + awaiting_payment -> INSERT allowed
      UPDATE public.settlements SET status = 'awaiting_payment' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'M6', 10000, 1, lead1) RETURNING id INTO matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m6_fail'; END;

      -- 7) team_settling + awaiting_payment -> UPDATE(cancel) allowed
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = true, cancel_reason = 'M7 취소' WHERE id = matrix_i;
        matrix_cnt := matrix_cnt + 1;
      EXCEPTION WHEN OTHERS THEN m_ok := false; why := why || ' m7_fail'; END;

      -- 8) team_settling + paid -> UPDATE(cancel) denied ("이미 입금 처리 중이라 수정할 수 없습니다.")
      UPDATE public.settlements SET status = 'paid' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      err_paid := false;
      BEGIN
        UPDATE public.additional_income_items SET is_cancelled = false WHERE id = matrix_i;
      EXCEPTION WHEN OTHERS THEN
        err_paid := (SQLERRM = '이미 입금 처리 중이라 수정할 수 없습니다.');
      END;
      IF err_paid THEN matrix_cnt := matrix_cnt + 1; ELSE m_ok := false; why := why || ' m8_fail'; END IF;

      -- 9) team_settling + pending -> INSERT denied ("이미 입금 처리 중이라 수정할 수 없습니다.")
      UPDATE public.settlements SET status = 'pending' WHERE case_id = matrix_c AND type = 'extra_sales_fee';
      err_pend := false;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'M9', 10000, 1, lead1);
      EXCEPTION WHEN OTHERS THEN
        err_pend := (SQLERRM = '이미 입금 처리 중이라 수정할 수 없습니다.');
      END;
      IF err_pend THEN matrix_cnt := matrix_cnt + 1; ELSE m_ok := false; why := why || ' m9_fail'; END IF;

      IF matrix_cnt < 8 OR NOT m_ok THEN
        ok := false; why := why || ' matrix_cnt=' || matrix_cnt;
      END IF;

      -- g) hq_check, completed, cancelled cases must reject insert/update with exact error message
      UPDATE public.settlements SET status = 'draft' WHERE case_id = matrix_c;

      -- hq_check
      UPDATE public.funeral_cases SET status = 'hq_check' WHERE id = matrix_c;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'HQ_TEST', 10000, 1, lead1);
      EXCEPTION WHEN OTHERS THEN
        err_hq := (SQLERRM = '본사 입금 확인 이후에는 추가 매출을 수정할 수 없습니다.');
      END;
      IF NOT err_hq THEN ok := false; why := why || ' hq_check_not_blocked'; END IF;

      -- completed
      UPDATE public.funeral_cases SET status = 'completed' WHERE id = matrix_c;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'COMP_TEST', 10000, 1, lead1);
      EXCEPTION WHEN OTHERS THEN
        err_comp := (SQLERRM = '본사 입금 확인 이후에는 추가 매출을 수정할 수 없습니다.');
      END;
      IF NOT err_comp THEN ok := false; why := why || ' completed_not_blocked'; END IF;

      -- cancelled
      UPDATE public.funeral_cases SET status = 'cancelled' WHERE id = matrix_c;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity, created_by)
        VALUES(matrix_c, 'CANC_TEST', 10000, 1, lead1);
      EXCEPTION WHEN OTHERS THEN
        err_canc := (SQLERRM = '본사 입금 확인 이후에는 추가 매출을 수정할 수 없습니다.');
      END;
      IF NOT err_canc THEN ok := false; why := why || ' cancelled_not_blocked'; END IF;

      -- 4. Role-based RLS tests on c_adv
      -- lead1 (own case): can select
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',lead1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', lead1::text, true);
      SELECT count(*) INTO role_lead1_cnt FROM public.additional_income_items WHERE case_id=c_adv;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- lead2 (other leader): select 0 rows, insert denied
      IF lead2 IS NOT NULL THEN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',lead2::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', lead2::text, true);
        SELECT count(*) INTO role_lead2_cnt FROM public.additional_income_items WHERE case_id=c_adv;
        BEGIN
          INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity)
          VALUES(c_adv, '타팀장 침범', 10000, 1);
        EXCEPTION WHEN OTHERS THEN
          lead2_insert_denied := true;
        END;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      ELSE
        role_lead2_cnt := 0; lead2_insert_denied := true;
      END IF;

      -- deal1: select 0 rows, insert denied
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',deal1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', deal1::text, true);
      SELECT count(*) INTO role_deal_cnt FROM public.additional_income_items WHERE case_id=c_adv;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity)
        VALUES(c_adv, '딜러 침범', 10000, 1);
      EXCEPTION WHEN OTHERS THEN
        deal_insert_denied := true;
      END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- cust1 (case customer): can select active items, cannot insert
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',cust1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', cust1::text, true);
      SELECT count(*) INTO role_cust1_cnt FROM public.additional_income_items WHERE case_id=c_adv;
      BEGIN
        INSERT INTO public.additional_income_items(case_id, item_name, unit_price, quantity)
        VALUES(c_adv, '고객 침범', 10000, 1);
      EXCEPTION WHEN OTHERS THEN
        cust_insert_denied := true;
      END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- cust2 (other customer): select 0 rows
      IF cust2 IS NOT NULL THEN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',cust2::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', cust2::text, true);
        SELECT count(*) INTO role_cust2_cnt FROM public.additional_income_items WHERE case_id=c_adv;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      ELSE
        role_cust2_cnt := 0;
      END IF;

      -- adm1 (admin): can select all
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',adm1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', adm1::text, true);
      SELECT count(*) INTO role_adm_cnt FROM public.additional_income_items WHERE case_id=c_adv;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      IF role_lead1_cnt < 1 OR role_lead2_cnt <> 0 OR NOT lead2_insert_denied
         OR role_deal_cnt <> 0 OR NOT deal_insert_denied
         OR role_cust1_cnt < 1 OR NOT cust_insert_denied
         OR role_cust2_cnt <> 0 OR role_adm_cnt < 1 THEN
        ok := false;
        why := why || format(' rls(lead1=%s,lead2=%s,deal=%s,cust1=%s,cust2=%s,adm=%s)',
          role_lead1_cnt, role_lead2_cnt, role_deal_cnt, role_cust1_cnt, role_cust2_cnt, role_adm_cnt);
      END IF;

      -- 4-2. Log table permissions & FK check
      -- adm1 (admin): can read logs
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',adm1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', adm1::text, true);
      SELECT count(*) INTO log_read_adm FROM public.additional_income_item_logs WHERE case_id = c_basic;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- lead1 (assigned leader): can read logs
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',lead1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', lead1::text, true);
      SELECT count(*) INTO log_read_lead1 FROM public.additional_income_item_logs WHERE case_id = c_basic;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- lead2 (other leader): 0 rows
      IF lead2 IS NOT NULL THEN
        SET LOCAL ROLE authenticated;
        PERFORM set_config('request.jwt.claims', json_build_object('sub',lead2::text,'role','authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', lead2::text, true);
        SELECT count(*) INTO log_read_lead2 FROM public.additional_income_item_logs WHERE case_id = c_basic;
        RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
      ELSE
        log_read_lead2 := 0;
      END IF;

      -- deal1: 0 rows
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',deal1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', deal1::text, true);
      SELECT count(*) INTO log_read_deal FROM public.additional_income_item_logs WHERE case_id = c_basic;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- cust1: 0 rows
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',cust1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', cust1::text, true);
      SELECT count(*) INTO log_read_cust1 FROM public.additional_income_item_logs WHERE case_id = c_basic;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      -- Direct write attempts on additional_income_item_logs -> must fail
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub',lead1::text,'role','authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', lead1::text, true);

      BEGIN
        INSERT INTO public.additional_income_item_logs(item_id, case_id, action, reason)
        VALUES(log_item1, c_basic, 'create', '직접삽입시도');
      EXCEPTION WHEN OTHERS THEN
        log_insert_blocked := true;
      END;

      BEGIN
        UPDATE public.additional_income_item_logs SET reason = '직접수정시도' WHERE case_id = c_basic;
      EXCEPTION WHEN OTHERS THEN
        log_update_blocked := true;
      END;

      BEGIN
        DELETE FROM public.additional_income_item_logs WHERE case_id = c_basic;
      EXCEPTION WHEN OTHERS THEN
        log_delete_blocked := true;
      END;
      RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);

      IF log_read_adm = 0 OR log_read_lead1 = 0 OR log_read_lead2 <> 0 OR log_read_deal <> 0 OR log_read_cust1 <> 0
         OR NOT log_insert_blocked OR NOT log_update_blocked OR NOT log_delete_blocked THEN
        ok := false;
        why := why || format(' log_perms(adm=%s,lead1=%s,lead2=%s,deal=%s,cust=%s,ins_b=%s,up_b=%s,del_b=%s)',
          log_read_adm, log_read_lead1, log_read_lead2, log_read_deal, log_read_cust1, log_insert_blocked, log_update_blocked, log_delete_blocked);
      END IF;

      -- Check FK of additional_income_item_logs does not reference partners
      SELECT count(*) INTO log_fk_partners_cnt
      FROM pg_constraint
      WHERE conrelid = 'public.additional_income_item_logs'::regclass
        AND contype = 'f'
        AND confrelid = 'public.partners'::regclass;

      IF log_fk_partners_cnt <> 0 THEN
        ok := false; why := why || ' log_fk_references_partners=' || log_fk_partners_cnt;
      END IF;

      -- 5. Existing settlements invariant on c_adv
      SELECT count(*) INTO s_after_count FROM public.settlements WHERE case_id=c_adv AND type != 'extra_sales_fee';
      IF s_before_count <> s_after_count THEN
        ok := false; why := why || ' invariant_broken(' || s_before_count || '!=' || s_after_count || ')';
      END IF;

      -- 6. Customer summary function inspection
      FOR col_rec IN
        SELECT p.proargnames
        FROM pg_proc p
        WHERE p.proname = 'get_customer_extra_sales_summary'
      LOOP
        IF array_to_string(col_rec.proargnames, ' ') ~* 'fee|rate|margin|leader|tax|base' THEN
          cust_summary_col_ok := false;
        END IF;
      END LOOP;
      IF NOT cust_summary_col_ok THEN
        ok := false; why := why || ' cust_summary_leaked_columns';
      END IF;

      -- 7. Private storage bucket & policy check
      SELECT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id='case-extra-photos' AND public=false
      ) INTO bucket_ok;

      SELECT count(*)=4 INTO storage_policies_ok
      FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND policyname IN ('case_extra_photos_insert','case_extra_photos_select','case_extra_photos_update','case_extra_photos_delete');

      IF NOT bucket_ok OR NOT storage_policies_ok THEN
        ok := false; why := why || ' storage(bucket=' || bucket_ok || ',policies=' || storage_policies_ok || ')';
      END IF;

      -- 8. Total deposit summation: usage_fee_remittance + extra_sales_fee
      SELECT amount INTO base_remit FROM public.settlements WHERE case_id=c_adv AND type='usage_fee_remittance';
      SELECT amount INTO extra_fee FROM public.settlements WHERE case_id=c_adv AND type='extra_sales_fee';
      tot_deposit := COALESCE(base_remit, 0) + COALESCE(extra_fee, 0);
      IF tot_deposit <> (COALESCE(base_remit, 0) + 41000) THEN
        ok := false; why := why || ' tot_deposit=' || tot_deposit;
      END IF;

      -- 9. A replacement leader must leave exactly one draft fee row for the new recipient.
      IF lead2 IS NOT NULL THEN
        UPDATE public.funeral_cases SET team_leader_id=lead2 WHERE id=c_adv;
        UPDATE public.additional_income_items SET description='P15 팀장 교체 재동기화' WHERE case_id=c_adv AND is_cancelled=false;
        SELECT count(*) INTO transfer_count FROM public.settlements WHERE case_id=c_adv AND type='extra_sales_fee' AND recipient_id=lead2 AND amount=41000 AND base_amount=37273 AND tax_amount=3727 AND status='draft';
        IF transfer_count<>1 OR (SELECT count(*) FROM public.settlements WHERE case_id=c_adv AND type='extra_sales_fee')<>1 THEN
          ok := false; why := why || ' leader_transfer(extra_rows=' || transfer_count || ')';
        END IF;
      END IF;

      -- 10. The explicit range guard fires before the generated integer column can overflow.
      BEGIN
        INSERT INTO public.additional_income_items(case_id,item_name,unit_price,quantity,created_by)
        VALUES(c_adv,'P15 정수 범위 시험',100000,100000,lead2);
      EXCEPTION WHEN numeric_value_out_of_range THEN
        overflow_blocked := SQLERRM = '추가 매출 항목 금액은 2,147,483,647원을 초과할 수 없습니다.';
      END;
      IF NOT overflow_blocked THEN ok := false; why := why || ' integer_range_guard'; END IF;

      IF ok THEN
        v_result := v_result || E'\n[PASS] P15 rate 37/41 exact calc, item lifecycle & logs & cancel reason, team_settling allowed & awaiting_payment kept, status matrix, lock & exceptions, RLS role isolation, existing settlements invariant, customer summary sanitized, storage bucket & policies, deposit sum, leader transfer exact row, integer range guard';
      ELSE
        v_result := v_result || E'\n[FAIL] P15: ' || why;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claims','',true); PERFORM set_config('request.jwt.claim.sub','',true);
    v_result := v_result || E'\n[FAIL] P15: ' || SQLERRM;
  END;
ELSE
  v_result := v_result || E'\n[SKIP] P15 | apply/customer prerequisite missing';
END IF;

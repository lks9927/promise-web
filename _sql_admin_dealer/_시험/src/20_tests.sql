-- Test data is always selected from existing rows: no profiles/auth.users INSERT is permitted.
SELECT p.user_id INTO v_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' ORDER BY p.user_id LIMIT 1;
SELECT p.user_id INTO v_other_leader FROM public.partners p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.status='approved' AND pr.role='leader' AND p.user_id IS DISTINCT FROM v_leader ORDER BY p.user_id LIMIT 1;
SELECT id INTO v_customer FROM public.profiles WHERE role='customer' ORDER BY id LIMIT 1;

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


CREATE OR REPLACE FUNCTION public.auto_create_draft_settlements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_master_tl_id  UUID;
  v_master_dl_id  UUID;
  v_biz           BOOLEAN;
  v_tax           NUMERIC;
  v_net           NUMERIC;
  v_tax_type      TEXT;
  v_cashback      NUMERIC;
BEGIN
  IF NEW.team_leader_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.team_leader_id IS NOT DISTINCT FROM NEW.team_leader_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM settlements WHERE case_id = NEW.id) THEN RETURN NEW; END IF;

  -- ① 팀장 장례수수료: 면세 750,000
  INSERT INTO settlements (case_id,type,status,amount,base_amount,tax_amount,net_amount,tax_type,recipient_id,admin_memo)
  VALUES (NEW.id,'usage_fee_remittance','draft',750000,750000,0,750000,'exempt',NEW.team_leader_id,'자동생성');

  -- ② 마스터 팀장 관리수수료: 면세 50,000
  SELECT master_id INTO v_master_tl_id FROM partners WHERE user_id = NEW.team_leader_id;
  IF v_master_tl_id IS NOT NULL THEN
    INSERT INTO settlements (case_id,type,status,amount,base_amount,tax_amount,net_amount,tax_type,recipient_id,admin_memo)
    VALUES (NEW.id,'leader_override','draft',50000,50000,0,50000,'exempt',v_master_tl_id,'자동생성(관리수수료)');
  END IF;

  -- ③ 딜러 커미션 (dealer_id는 이미 자동 세팅됨)
  IF NEW.dealer_id IS NOT NULL THEN
    SELECT COALESCE(has_business,false) INTO v_biz FROM profiles WHERE id = NEW.dealer_id;
    IF v_biz THEN
      v_tax:=FLOOR(200000*0.1); v_net:=200000+v_tax; v_tax_type:='vat';
    ELSE
      v_tax:=FLOOR(200000*0.033); v_net:=200000-v_tax; v_tax_type:='withholding';
    END IF;
    INSERT INTO settlements (case_id,type,status,amount,base_amount,tax_amount,net_amount,tax_type,recipient_id,admin_memo)
    VALUES (NEW.id,'dealer_commission','draft',200000,200000,v_tax,v_net,v_tax_type,NEW.dealer_id,'자동생성(딜러)');

    -- ④ 마스터 딜러 관리수수료
    SELECT master_id INTO v_master_dl_id FROM partners WHERE user_id = NEW.dealer_id;
    IF v_master_dl_id IS NOT NULL THEN
      SELECT COALESCE(has_business,false) INTO v_biz FROM profiles WHERE id = v_master_dl_id;
      IF v_biz THEN
        v_tax:=FLOOR(50000*0.1); v_net:=50000+v_tax; v_tax_type:='vat';
      ELSE
        v_tax:=FLOOR(50000*0.033); v_net:=50000-v_tax; v_tax_type:='withholding';
      END IF;
      INSERT INTO settlements (case_id,type,status,amount,base_amount,tax_amount,net_amount,tax_type,recipient_id,admin_memo)
      VALUES (NEW.id,'dealer_override','draft',50000,50000,v_tax,v_net,v_tax_type,v_master_dl_id,'자동생성(마스터딜러)');
    END IF;
  END IF;

  -- ⑤ 상주 캐시백
  IF NEW.coupon_code IS NOT NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT amount INTO v_cashback FROM coupons WHERE code = NEW.coupon_code LIMIT 1;
    IF v_cashback IS NOT NULL AND v_cashback > 0 THEN
      INSERT INTO settlements (case_id,type,status,amount,base_amount,tax_amount,net_amount,tax_type,recipient_id,admin_memo)
      VALUES (NEW.id,'customer_cashback','draft',v_cashback,v_cashback,0,v_cashback,'none',NEW.customer_id,'자동생성(상주캐시백)');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$

-- P15 추가 매출 등록과 수수료 정산 (2026-11-09)
-- 목적: 장례 진행 중 상주 요청에 따른 추가 매출 항목 등록/취소, 정책별 수수료(extra_sales_fee) 자동 산정/정산 행 연동,
--       장례 종료 시 잠금, 비공개 사진 버킷(case-extra-photos) 구축.
-- 되돌리기:
--   DROP TRIGGER IF EXISTS trg_lock_extra_sales_on_team_settling ON public.funeral_cases;
--   DROP FUNCTION IF EXISTS public.lock_extra_sales_on_team_settling();
--   DROP TRIGGER IF EXISTS trg_additional_income_sync ON public.additional_income_items;
--   DROP FUNCTION IF EXISTS public.sync_additional_income_case_and_settlement();
--   DROP TRIGGER IF EXISTS trg_additional_income_check ON public.additional_income_items;
--   DROP FUNCTION IF EXISTS public.check_additional_income_item_allowed();
--   DROP FUNCTION IF EXISTS public.get_customer_extra_sales_summary(uuid);
--   DROP FUNCTION IF EXISTS public.extra_sales_fee_split(integer);
--   DROP POLICY IF EXISTS case_extra_photos_delete ON storage.objects;
--   DROP POLICY IF EXISTS case_extra_photos_update ON storage.objects;
--   DROP POLICY IF EXISTS case_extra_photos_select ON storage.objects;
--   DROP POLICY IF EXISTS case_extra_photos_insert ON storage.objects;
--   DROP POLICY IF EXISTS additional_income_items_update ON public.additional_income_items;
--   DROP POLICY IF EXISTS additional_income_items_insert ON public.additional_income_items;
--   DROP POLICY IF EXISTS additional_income_items_select ON public.additional_income_items;
--   ALTER TABLE public.commission_policies DROP COLUMN IF EXISTS extra_sales_fee_rate;
--   ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_type_check;
--   ALTER TABLE public.settlements ADD CONSTRAINT settlements_type_check CHECK (type IN (
--     'dealer_commission', 'customer_cashback', 'leader_fee', 'master_fee', 'flower_cost',
--     'override_fee', 'usage_fee_remittance', 'dealer_override', 'leader_override'
--   ));
-- 적용 순서 및 배포 안전성:
--   1. 본 SQL 은 웹 화면 배포 전후 어느 시점에 적용해도 안전합니다.
--   2. 화면 컴포넌트에는 DB 에 새 열/표/버킷이 아직 생성되지 않은 상태에서도
--      화면이 깨지지 않고 조용히 숨겨지는 폴백(fallback)이 적용되어 있습니다.

-- 1. 수수료 정책 테이블에 추가 매출 수수료율(%) 컬럼 추가
ALTER TABLE public.commission_policies
  ADD COLUMN IF NOT EXISTS extra_sales_fee_rate numeric(5,2) NOT NULL DEFAULT 50;

ALTER TABLE public.commission_policies
  DROP CONSTRAINT IF EXISTS commission_policies_extra_sales_fee_rate_check,
  ADD CONSTRAINT commission_policies_extra_sales_fee_rate_check
    CHECK (extra_sales_fee_rate BETWEEN 0 AND 100);

-- 2. additional_income_items 테이블 확장 (새 표 생성 금지, profiles(id) 참조 준수)
CREATE TABLE IF NOT EXISTS public.additional_income_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    case_id UUID REFERENCES public.funeral_cases(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price INTEGER DEFAULT 0,
    total_price INTEGER GENERATED ALWAYS AS (quantity * unit_price) STORED,
    receipt_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.additional_income_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.additional_income_items
  DROP CONSTRAINT IF EXISTS chk_additional_income_items_desc_len,
  ADD CONSTRAINT chk_additional_income_items_desc_len
    CHECK (description IS NULL OR char_length(description) <= 1000);

ALTER TABLE public.additional_income_items
  DROP CONSTRAINT IF EXISTS chk_additional_income_items_photo_count,
  ADD CONSTRAINT chk_additional_income_items_photo_count
    CHECK (array_length(photo_urls, 1) IS NULL OR array_length(photo_urls, 1) <= 10);

ALTER TABLE public.additional_income_items
  DROP CONSTRAINT IF EXISTS chk_additional_income_items_qty,
  ADD CONSTRAINT chk_additional_income_items_qty
    CHECK (quantity >= 1);

ALTER TABLE public.additional_income_items
  DROP CONSTRAINT IF EXISTS chk_additional_income_items_price,
  ADD CONSTRAINT chk_additional_income_items_price
    CHECK (unit_price >= 0);

-- 3. settlements 테이블의 type CHECK 제약에 extra_sales_fee 추가 (기존 목록 완전 보존)
ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_type_check;
ALTER TABLE public.settlements ADD CONSTRAINT settlements_type_check
CHECK (type IN (
  'dealer_commission',
  'customer_cashback',
  'leader_fee',
  'master_fee',
  'flower_cost',
  'override_fee',
  'usage_fee_remittance',
  'dealer_override',
  'leader_override',
  'extra_sales_fee'
));

-- 4. 부가세 포함 수수료 분리 함수 (유일한 1.1 분리 공식 위치)
CREATE OR REPLACE FUNCTION public.extra_sales_fee_split(p_fee integer)
RETURNS TABLE (base_amount integer, tax_amount integer)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(ROUND(p_fee / 1.1)::integer, 0) AS base_amount,
    COALESCE((p_fee - ROUND(p_fee / 1.1)::integer), 0) AS tax_amount;
$$;

REVOKE ALL ON FUNCTION public.extra_sales_fee_split(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extra_sales_fee_split(integer) TO authenticated;

-- 5. 추가 매출 등록/수정/삭제 제한 검증 트리거 (BEFORE)
CREATE OR REPLACE FUNCTION public.check_additional_income_item_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case_id uuid;
  v_case_status text;
  v_non_draft_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- 사건 자체가 지워지는 연쇄 삭제(ON DELETE CASCADE)는 허용하고, 사건이 남아 있는 직접 삭제만 막는다.
    IF NOT EXISTS (SELECT 1 FROM public.funeral_cases fc WHERE fc.id = OLD.case_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION '추가 매출 항목은 삭제할 수 없습니다. 취소 기능을 이용하세요.';
  END IF;

  v_case_id := COALESCE(NEW.case_id, OLD.case_id);

  -- total_price와 정산 금액은 integer 열이다. 생성 열을 계산하기 전에 범위를 명확히 막는다.
  IF TG_OP <> 'DELETE' AND NEW.quantity::bigint * NEW.unit_price::bigint > 2147483647 THEN
    RAISE EXCEPTION '추가 매출 항목 금액은 2,147,483,647원을 초과할 수 없습니다.' USING ERRCODE='22003';
  END IF;

  -- 1. 장례 상태 확인: in_progress 일 때만 등록/수정/취소 가능
  SELECT fc.status INTO v_case_status
  FROM public.funeral_cases fc
  WHERE fc.id = v_case_id;

  IF v_case_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION '장례 진행 중(in_progress) 상태에서만 추가 매출을 등록·수정·취소할 수 있습니다.';
  END IF;

  -- 2. 정산 확정 여부 확인: draft 가 아닌 정산 행이 있으면 차단
  SELECT COUNT(*) INTO v_non_draft_count
  FROM public.settlements s
  WHERE s.case_id = v_case_id
    AND s.status IS DISTINCT FROM 'draft';

  IF v_non_draft_count > 0 THEN
    RAISE EXCEPTION '정산이 확정되어 수정할 수 없습니다.';
  END IF;

  -- 3. 생성자 및 갱신 시각 처리
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF NEW.is_cancelled = true AND (OLD.is_cancelled = false OR OLD.is_cancelled IS NULL) THEN
      NEW.cancelled_at := now();
    ELSIF NEW.is_cancelled = false AND OLD.is_cancelled = true THEN
      NEW.cancelled_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_additional_income_check ON public.additional_income_items;
CREATE TRIGGER trg_additional_income_check
BEFORE INSERT OR UPDATE OR DELETE ON public.additional_income_items
FOR EACH ROW
EXECUTE FUNCTION public.check_additional_income_item_allowed();

-- 6. 추가 매출 합계 및 정산 행 자동 연동 트리거 (AFTER)
CREATE OR REPLACE FUNCTION public.sync_additional_income_case_and_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case_id uuid;
  v_tot integer := 0;
  v_team_leader_id uuid;
  v_pkg text;
  v_pol_id integer;
  v_rate numeric := 0;
  v_fee integer := 0;
  v_base integer := 0;
  v_tax integer := 0;
BEGIN
  v_case_id := COALESCE(NEW.case_id, OLD.case_id);

  -- 취소 제외 품목 총합 계산
  SELECT COALESCE(SUM(unit_price * quantity), 0)::integer
  INTO v_tot
  FROM public.additional_income_items
  WHERE case_id = v_case_id
    AND is_cancelled = false;

  -- funeral_cases.additional_income_total 갱신
  UPDATE public.funeral_cases
  SET additional_income_total = v_tot
  WHERE id = v_case_id
    AND additional_income_total IS DISTINCT FROM v_tot;

  -- 담당 팀장 및 패키지 정책 확인
  SELECT fc.team_leader_id, fc.package_name
  INTO v_team_leader_id, v_pkg
  FROM public.funeral_cases fc
  WHERE fc.id = v_case_id;

  -- 합계가 0보다 크고 팀장이 지정된 경우 extra_sales_fee 정산 행 upsert
  IF v_tot > 0 AND v_team_leader_id IS NOT NULL THEN
    v_pol_id := public.policy_id_for_package(v_pkg);
    SELECT cp.extra_sales_fee_rate
    INTO v_rate
    FROM public.commission_policies cp
    WHERE cp.id = v_pol_id;

    IF v_rate IS NULL THEN
      SELECT cp.extra_sales_fee_rate INTO v_rate FROM public.commission_policies ORDER BY id LIMIT 1;
    END IF;

    v_fee := ROUND(v_tot * COALESCE(v_rate, 0) / 100)::integer;
    SELECT s.base_amount, s.tax_amount INTO v_base, v_tax
    FROM public.extra_sales_fee_split(v_fee) s;

    -- 사건 진행 중 담당 팀장이 바뀐 경우, 이전 팀장의 draft 행을 남기면 수수료가 이중 집계된다.
    DELETE FROM public.settlements
    WHERE case_id = v_case_id
      AND type = 'extra_sales_fee'
      AND recipient_id IS DISTINCT FROM v_team_leader_id
      AND status = 'draft';

    INSERT INTO public.settlements (
      case_id, recipient_id, amount, type, status, tax_type, base_amount, tax_amount, net_amount
    ) VALUES (
      v_case_id, v_team_leader_id, v_fee, 'extra_sales_fee', 'draft', 'vat_10', v_base, v_tax, v_fee
    )
    ON CONFLICT (case_id, recipient_id, type)
    DO UPDATE SET
      amount = EXCLUDED.amount,
      base_amount = EXCLUDED.base_amount,
      tax_amount = EXCLUDED.tax_amount,
      net_amount = EXCLUDED.net_amount,
      status = 'draft';
  ELSE
    -- 합계가 0 이거나 전액 취소된 경우 정산 행 삭제
    DELETE FROM public.settlements
    WHERE case_id = v_case_id
      AND type = 'extra_sales_fee';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_additional_income_sync ON public.additional_income_items;
CREATE TRIGGER trg_additional_income_sync
AFTER INSERT OR UPDATE OR DELETE ON public.additional_income_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_additional_income_case_and_settlement();

-- 7. 장례 종료(team_settling) 전환 시 extra_sales_fee 행 잠금(awaiting_payment) 트리거
CREATE OR REPLACE FUNCTION public.lock_extra_sales_on_team_settling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'in_progress' AND NEW.status = 'team_settling' THEN
    UPDATE public.settlements
    SET status = 'awaiting_payment'
    WHERE case_id = NEW.id
      AND type = 'extra_sales_fee'
      AND status = 'draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_extra_sales_on_team_settling ON public.funeral_cases;
CREATE TRIGGER trg_lock_extra_sales_on_team_settling
AFTER UPDATE OF status ON public.funeral_cases
FOR EACH ROW
EXECUTE FUNCTION public.lock_extra_sales_on_team_settling();

-- 8. 고객 전용 추가 매출 요약 조회 RPC (수수료율·본사 수수료·팀장 몫 완벽 은닉)
CREATE OR REPLACE FUNCTION public.get_customer_extra_sales_summary(p_case_id uuid)
RETURNS TABLE (
  total_amount integer,
  item_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id = p_case_id
      AND (
        fc.customer_id = auth.uid()
        OR public.is_admin()
        OR fc.team_leader_id = auth.uid()
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(aii.total_price), 0)::integer AS total_amount,
    COUNT(aii.id)::integer AS item_count
  FROM public.additional_income_items aii
  WHERE aii.case_id = p_case_id
    AND aii.is_cancelled = false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_extra_sales_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_extra_sales_summary(uuid) TO authenticated;

-- 9. additional_income_items RLS 정책 재작성
ALTER TABLE public.additional_income_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view additional_income_items" ON public.additional_income_items;
DROP POLICY IF EXISTS "TeamLeaders and Admins can insert/update additional_income_items" ON public.additional_income_items;
DROP POLICY IF EXISTS additional_income_items_select ON public.additional_income_items;
DROP POLICY IF EXISTS additional_income_items_insert ON public.additional_income_items;
DROP POLICY IF EXISTS additional_income_items_update ON public.additional_income_items;
DROP POLICY IF EXISTS additional_income_items_delete ON public.additional_income_items;

CREATE POLICY additional_income_items_select ON public.additional_income_items
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id = additional_income_items.case_id
      AND fc.team_leader_id = auth.uid()
  )
  OR (
    is_cancelled = false
    AND EXISTS (
      SELECT 1 FROM public.funeral_cases fc
      WHERE fc.id = additional_income_items.case_id
        AND fc.customer_id = auth.uid()
    )
  )
);

CREATE POLICY additional_income_items_insert ON public.additional_income_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id = additional_income_items.case_id
      AND fc.team_leader_id = auth.uid()
      AND fc.status = 'in_progress'
  )
);

CREATE POLICY additional_income_items_update ON public.additional_income_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id = additional_income_items.case_id
      AND fc.team_leader_id = auth.uid()
      AND fc.status = 'in_progress'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id = additional_income_items.case_id
      AND fc.team_leader_id = auth.uid()
      AND fc.status = 'in_progress'
  )
);

REVOKE ALL ON public.additional_income_items FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.additional_income_items TO authenticated;

-- 10. 비공개 사진 버킷 case-extra-photos 생성 및 RLS 정책
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('case-extra-photos', 'case-extra-photos', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS case_extra_photos_insert ON storage.objects;
CREATE POLICY case_extra_photos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'case-extra-photos'
  AND EXISTS (
    SELECT 1 FROM public.funeral_cases fc
    WHERE fc.id::text = (storage.foldername(name))[1]
      AND fc.team_leader_id = auth.uid()
      AND fc.status = 'in_progress'
  )
);

DROP POLICY IF EXISTS case_extra_photos_select ON storage.objects;
CREATE POLICY case_extra_photos_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'case-extra-photos'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.funeral_cases fc
      WHERE fc.id::text = (storage.foldername(name))[1]
        AND (fc.team_leader_id = auth.uid() OR fc.customer_id = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS case_extra_photos_update ON storage.objects;
CREATE POLICY case_extra_photos_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'case-extra-photos'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.funeral_cases fc
      WHERE fc.id::text = (storage.foldername(name))[1]
        AND fc.team_leader_id = auth.uid()
        AND fc.status = 'in_progress'
    )
  )
)
WITH CHECK (
  bucket_id = 'case-extra-photos'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.funeral_cases fc
      WHERE fc.id::text = (storage.foldername(name))[1]
        AND fc.team_leader_id = auth.uid()
        AND fc.status = 'in_progress'
    )
  )
);

DROP POLICY IF EXISTS case_extra_photos_delete ON storage.objects;
CREATE POLICY case_extra_photos_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'case-extra-photos'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.funeral_cases fc
      WHERE fc.id::text = (storage.foldername(name))[1]
        AND fc.team_leader_id = auth.uid()
        AND fc.status = 'in_progress'
    )
  )
);

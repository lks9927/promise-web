-- =============================================================================
-- [P7_승격요청.sql]
--
-- 1. 목적:
--   대표마스터(partners.grade = 'S')의 직속/하위 일반(C) 파트너에 대한 마스터(Master) 승격 요청,
--   본사 관리자(admin)의 승인/거절 심사, 및 본사 관리자 전용 승격 되돌리기(revert) 워크플로우를 구현합니다.
--
-- 2. 적용 순서:
--   - P2a_관리자등급_계층규칙.sql (change_partner_grade 최신 RPC 및 계층 검증 트리거)
--   - P3a_관리수수료_집계.sql (partner_downline_ids 하위 파트너 재귀 조회 헬퍼)
--   - 본 파일 (P7_승격요청.sql) 적용
--
-- 3. 되돌리기 (롤백 스크립트):
--   DROP FUNCTION IF EXISTS public.list_partner_promotion_requests(text);
--   DROP FUNCTION IF EXISTS public.revert_partner_promotion(uuid, text);
--   DROP FUNCTION IF EXISTS public.decide_partner_promotion(uuid, boolean, text);
--   DROP FUNCTION IF EXISTS public.request_partner_promotion(uuid, text);
--   DROP TABLE IF EXISTS public.partner_promotion_requests CASCADE;
-- =============================================================================

-- =============================================================================
-- (1) 표 public.partner_promotion_requests 생성 및 인덱스/RLS/권한 설정
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.partner_promotion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id),
  target_id uuid NOT NULL REFERENCES public.profiles(id),
  from_grade text NOT NULL,
  to_grade text NOT NULL CHECK (to_grade IN ('Master')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reverted')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  reverted_by uuid,
  reverted_at timestamptz
);

-- target 당 pending 1건만 되게 부분 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS partner_promotion_requests_target_pending_idx
  ON public.partner_promotion_requests (target_id)
  WHERE (status = 'pending');

-- RLS 활성화
ALTER TABLE public.partner_promotion_requests ENABLE ROW LEVEL SECURITY;

-- 정책 설정: 관리자(public.is_admin()) 전체 SELECT, 요청자 본인은 자기 요청만 SELECT
-- (INSERT / UPDATE / DELETE 정책 없음: RPC로만 변경 허용)
DROP POLICY IF EXISTS partner_promotion_requests_select_policy ON public.partner_promotion_requests;
CREATE POLICY partner_promotion_requests_select_policy
  ON public.partner_promotion_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR requester_id = auth.uid()
  );

-- 테이블 직접 권한: authenticated 역할에 SELECT만 허용
REVOKE ALL ON TABLE public.partner_promotion_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.partner_promotion_requests FROM anon;
GRANT SELECT ON TABLE public.partner_promotion_requests TO authenticated;


-- =============================================================================
-- (2) request_partner_promotion: 대표마스터의 승격 요청 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_partner_promotion(
  p_target uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_grade text;
  v_caller_role text;
  v_target_grade text;
  v_target_role text;
  v_req_id uuid;
BEGIN
  -- 1) 호출자 인증 확인
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 호출자가 partners.grade = 'S' 인지 확인
  SELECT p.grade, pr.role
  INTO v_caller_grade, v_caller_role
  FROM public.partners p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = v_caller_id;

  IF NOT FOUND OR v_caller_grade IS DISTINCT FROM 'S' THEN
    RAISE EXCEPTION '대표마스터(S 등급) 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 3) 대상 파트너(target) 확인
  SELECT p.grade, pr.role
  INTO v_target_grade, v_target_role
  FROM public.partners p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 대상 파트너를 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 4) target 의 partners.grade 가 'C' 인지 확인
  IF v_target_grade <> 'C' THEN
    RAISE EXCEPTION '일반(C) 등급 파트너만 마스터 승격을 요청할 수 있습니다. (현재 등급: %)', v_target_grade
      USING ERRCODE = 'P0001';
  END IF;

  -- 5) 호출자와 대상이 같은 profiles.role 라인인지 확인
  IF v_caller_role IS DISTINCT FROM v_target_role THEN
    RAISE EXCEPTION '동일한 직군 라인(딜러/팀장)의 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 6) target 이 호출자의 하위 조직(public.partner_downline_ids)에 속하는지 확인
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_downline_ids(v_caller_id) d
    WHERE d.partner_id = p_target
  ) THEN
    RAISE EXCEPTION '본인의 직속/하위 조직 파트너만 승격을 요청할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 7) 이미 pending 중인 요청이 있는지 확인 (유니크 인덱스 이전 명시적 메시지)
  IF EXISTS (
    SELECT 1 FROM public.partner_promotion_requests
    WHERE target_id = p_target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION '해당 파트너에 대해 이미 심사 대기 중인 승격 요청이 존재합니다.' USING ERRCODE = 'P0001';
  END IF;

  -- 8) 승격 요청 생성 (from_grade: target 현재 등급, to_grade: 'Master')
  INSERT INTO public.partner_promotion_requests (
    requester_id,
    target_id,
    from_grade,
    to_grade,
    status,
    reason
  ) VALUES (
    v_caller_id,
    p_target,
    v_target_grade,
    'Master',
    'pending',
    p_reason
  )
  RETURNING id INTO v_req_id;

  RETURN v_req_id;
END;
$$;


-- =============================================================================
-- (3) decide_partner_promotion: 본사의 승격 승인 / 거절 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.decide_partner_promotion(
  p_request uuid,
  p_approve boolean,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_req public.partner_promotion_requests%ROWTYPE;
BEGIN
  -- 1) 관리자 권한 확인 (콘솔 실행인 auth.uid() IS NULL 환경은 허용)
  IF v_caller_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 승격 요청을 심사할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 요청 조회 및 행 잠금(FOR UPDATE), pending 상태 확인
  SELECT *
  INTO v_req
  FROM public.partner_promotion_requests
  WHERE id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 요청을 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION '대기 중(pending)인 승격 요청만 처리할 수 있습니다. (현재 상태: %)', v_req.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) 승인 / 거절 분기 처리
  IF p_approve THEN
    -- 승인: 최신 change_partner_grade 시그니처에 맞춰 호출하여 target을 'Master'로 승격
    PERFORM public.change_partner_grade(
      p_partner_id := v_req.target_id,
      p_to_grade := 'Master',
      p_reason := '대표마스터 요청 승인: ' || p_request::text,
      p_master_id := NULL,
      p_new_role := NULL,
      p_change_master := false
    );

    UPDATE public.partner_promotion_requests
    SET
      status = 'approved',
      decided_by = v_caller_id,
      decided_at = now(),
      decision_note = p_note
    WHERE id = p_request;
  ELSE
    -- 거절: status rejected 기록
    UPDATE public.partner_promotion_requests
    SET
      status = 'rejected',
      decided_by = v_caller_id,
      decided_at = now(),
      decision_note = p_note
    WHERE id = p_request;
  END IF;
END;
$$;


-- =============================================================================
-- (4) revert_partner_promotion: 본사 전용 승격 되돌리기(revert) RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revert_partner_promotion(
  p_request uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_req public.partner_promotion_requests%ROWTYPE;
BEGIN
  -- 1) 관리자 권한 확인 (콘솔 실행인 auth.uid() IS NULL 환경은 허용)
  IF v_caller_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION '관리자만 승격을 되돌릴 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  -- 2) 요청 조회 및 행 잠금(FOR UPDATE), approved 상태 확인
  SELECT *
  INTO v_req
  FROM public.partner_promotion_requests
  WHERE id = p_request
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '승격 요청을 찾을 수 없습니다.' USING ERRCODE = 'P0001';
  END IF;

  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION '승인된(approved) 요청만 되돌릴 수 있습니다. (현재 상태: %)', v_req.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) change_partner_grade 로 target 을 from_grade 로 원복
  PERFORM public.change_partner_grade(
    p_partner_id := v_req.target_id,
    p_to_grade := v_req.from_grade,
    p_reason := '승격 되돌리기: ' || p_request::text,
    p_master_id := NULL,
    p_new_role := NULL,
    p_change_master := false
  );

  -- 4) 요청 상태를 reverted 로 갱신 및 되돌리기 이력 기록
  UPDATE public.partner_promotion_requests
  SET
    status = 'reverted',
    reverted_by = v_caller_id,
    reverted_at = now(),
    decision_note = CASE
      WHEN p_note IS NOT NULL AND p_note <> '' THEN
        CASE
          WHEN decision_note IS NOT NULL AND decision_note <> '' THEN
            decision_note || E'\n[되돌리기] ' || p_note
          ELSE
            p_note
        END
      ELSE decision_note
    END
  WHERE id = p_request;
END;
$$;


-- =============================================================================
-- (5) list_partner_promotion_requests: 승격 요청 목록 조회 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_partner_promotion_requests(
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  requester_name text,
  target_id uuid,
  target_name text,
  from_grade text,
  to_grade text,
  status text,
  reason text,
  created_at timestamptz,
  decided_at timestamptz,
  decision_note text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- 관리자 여부 판별 (auth.uid() IS NULL 인 콘솔 환경은 전체 조회 허용)
  IF v_caller_id IS NULL THEN
    v_is_admin := true;
  ELSE
    v_is_admin := public.is_admin();
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.requester_id,
    COALESCE(req_p.name, '알 수 없음')::text AS requester_name,
    r.target_id,
    COALESCE(tgt_p.name, '알 수 없음')::text AS target_name,
    r.from_grade,
    r.to_grade,
    r.status,
    r.reason,
    r.created_at,
    r.decided_at,
    r.decision_note
  FROM public.partner_promotion_requests r
  LEFT JOIN public.profiles req_p ON req_p.id = r.requester_id
  LEFT JOIN public.profiles tgt_p ON tgt_p.id = r.target_id
  WHERE (v_is_admin OR r.requester_id = v_caller_id)
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.created_at DESC;
END;
$$;


-- =============================================================================
-- 함수 실행 권한 설정: PUBLIC 권한 회수 및 authenticated 권한 부여
-- =============================================================================
REVOKE ALL ON FUNCTION public.request_partner_promotion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_partner_promotion(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_partner_promotion(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_partner_promotion(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.revert_partner_promotion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_partner_promotion(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_partner_promotion_requests(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_partner_promotion_requests(text) TO authenticated;

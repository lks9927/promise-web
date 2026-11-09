-- P18 대표마스터 화면 확장 (2026-11-09)
-- 목적: s_downline_overview() 를 대체하는 s_downline_overview_v2() 를 추가한다.
--   - 반환 컬럼: 소속 마스터 경로(이름만), 예비 등록 건수(딜러 라인만), 장례 단계/시각, 수수료 상태
--   - 사진·25단계 보고·고객 정보·금액·연락처·계좌 반환 없음
--   - 호출자 grade='S' 검사: 아니면 빈 결과 반환(오류 아님)
--   - 라인 분리: 딜러 대표 → 딜러 라인만, 팀장 대표 → 팀장 라인만
--   - 새 테이블/FK 없음; pre_registrations 는 SECURITY DEFINER 내에서만 집계
-- 되돌리기: DROP FUNCTION IF EXISTS public.s_downline_overview_v2();
-- 주의: s_downline_overview() 는 기존 호환을 위해 그대로 유지한다.
--       화면은 v2 를 먼저 시도하고, v2 가 없으면(적용 전) 기존 함수로 폴백한다.

-- 정산 type 목록 (기준선_calculate_settlements_본문.sql 참조):
--   dealer_commission  : 딜러 → S 딜러 대표 대상
--   dealer_override    : 마스터딜러 관리수수료 → S 딜러 대표 대상
--   leader_override    : 마스터팀장 관리수수료 → S 팀장 대표 대상
--   usage_fee_remittance : 팀장→본사 사용료 (수취인=팀장; 팀장 대표 대상 아님, 제외)
--   customer_cashback  : 고객 캐시백 (제외)
-- '취소' 정산: status='cancelled' → 집계에서 제외
-- '지급 완료' 조건: 해당 사건의 대상 정산이 1건 이상이고 모두 status='paid'
-- '대기' 조건: paid 아닌 정산이 1건이라도 있거나, 아직 정산 없음

DROP FUNCTION IF EXISTS public.s_downline_overview_v2();

CREATE FUNCTION public.s_downline_overview_v2()
RETURNS TABLE (
  relationship          text,
  partner_id            uuid,
  담당자명              text,
  지역                  text,
  파트너상태            text,
  소속마스터경로        text,
  예비등록건수          bigint,
  예비보관중            bigint,
  예비접수완료          bigint,
  접수일                timestamptz,
  단계                  text,
  관시작시각            timestamptz,
  입관시각              timestamptz,
  종료시각              timestamptz,
  수수료상태            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_grade  text;
  v_line   text;  -- 'dealer' or 'leader'
BEGIN
  -- 호출자 등급·라인 확인
  SELECT pa.grade,
         CASE WHEN pr.role = 'dealer' THEN 'dealer'
              WHEN pr.role = 'leader' THEN 'leader'
         END
    INTO v_grade, v_line
    FROM public.partners pa
    JOIN public.profiles pr ON pr.id = pa.user_id
   WHERE pa.user_id = v_uid;

  -- S 등급이 아니면 빈 결과 (오류 없음)
  IF v_grade IS DISTINCT FROM 'S' OR v_line IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE tree AS (
    SELECT
      p.user_id,
      p.master_id,
      p.grade,
      pr.role,
      1                       AS depth,
      ARRAY[p.user_id]        AS path,
      -- 직속 상위가 대표 본인이면 '직속', 아니면 상위 이름
      '직속'::text            AS master_name,
      -- 경로(대표→마스터→딜러): depth=1 이면 '직속'만
      '직속'::text            AS master_path
    FROM public.partners p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.master_id = v_uid

    UNION ALL

    SELECT
      c.user_id,
      c.master_id,
      c.grade,
      pr.role,
      t.depth + 1,
      t.path || c.user_id,
      -- 직속 상위(master_id)의 이름
      (SELECT pn.name FROM public.profiles pn WHERE pn.id = c.master_id),
      -- 경로: 이전 경로 → 현재 상위 이름
      CASE WHEN t.depth = 1 THEN COALESCE((SELECT pn.name FROM public.profiles pn WHERE pn.id = c.master_id), '?')
           ELSE t.master_path || ' → ' || COALESCE((SELECT pn.name FROM public.profiles pn WHERE pn.id = c.master_id), '?') END
    FROM public.partners c
    JOIN public.profiles pr ON pr.id = c.user_id
    JOIN tree t ON c.master_id = t.user_id
    WHERE NOT c.user_id = ANY(t.path)
  ),
  -- 각 하위 파트너의 가장 최신 사건 1건(완료·취소 제외 우선, 없으면 취소 포함)
  latest_case AS (
    SELECT DISTINCT ON (fc_role.pid)
      fc_role.pid,
      fc.id            AS case_id,
      fc.created_at    AS fc_created_at,
      fc.status        AS fc_status,
      fc.started_at    AS fc_started_at,
      fc.encoffinment_time,
      fc.funeral_end_time
    FROM (
      SELECT t2.user_id AS pid, 'dealer' AS role
      FROM tree t2
      WHERE v_line = 'dealer' AND t2.role = 'dealer'
      UNION ALL
      SELECT t2.user_id AS pid, 'leader' AS role
      FROM tree t2
      WHERE v_line = 'leader' AND t2.role = 'leader'
    ) fc_role
    LEFT JOIN public.funeral_cases fc
      ON (v_line = 'dealer' AND fc.dealer_id = fc_role.pid)
      OR (v_line = 'leader' AND fc.team_leader_id = fc_role.pid)
    ORDER BY
      fc_role.pid,
      -- 진행 중 사건 우선
      CASE WHEN fc.status NOT IN ('completed', 'cancelled') THEN 0 ELSE 1 END,
      fc.created_at DESC NULLS LAST
  ),
  -- 예비 등록 집계 (딜러 라인만; pre_registrations 는 RLS 로 직접 접근 불가 → SECURITY DEFINER 내부에서만)
  prereg_agg AS (
    SELECT
      pr.dealer_id,
      count(*) FILTER (WHERE pr.status = 'registered') AS cnt_보관중,
      count(*) FILTER (WHERE pr.status = 'converted')  AS cnt_접수완료,
      count(*)                                          AS cnt_total
    FROM public.pre_registrations pr
    WHERE pr.dealer_id IN (
      SELECT t2.user_id FROM tree t2 WHERE v_line = 'dealer' AND t2.role = 'dealer'
    )
    GROUP BY pr.dealer_id
  ),
  -- 수수료 상태 집계: 해당 사건에서 이 파트너가 수취인인 정산(type 필터, cancelled 제외)
  -- 딜러 라인: dealer_commission, dealer_override
  -- 팀장 라인: leader_override
  fee_agg AS (
    SELECT
      s.recipient_id,
      lc2.case_id,
      CASE
        WHEN count(*) FILTER (WHERE s.status <> 'cancelled') = 0 THEN '대기'
        WHEN count(*) FILTER (WHERE s.status NOT IN ('paid', 'cancelled')) = 0
             AND count(*) FILTER (WHERE s.status = 'paid') > 0 THEN '지급 완료'
        ELSE '대기'
      END AS fee_status
    FROM latest_case lc2
    JOIN public.settlements s
      ON s.case_id = lc2.case_id
      AND s.recipient_id IN (
        SELECT t2.user_id FROM tree t2
        WHERE (v_line = 'dealer' AND t2.role = 'dealer')
           OR (v_line = 'leader' AND t2.role = 'leader')
      )
      AND (
        (v_line = 'dealer' AND s.type IN ('dealer_commission', 'dealer_override'))
        OR
        (v_line = 'leader' AND s.type = 'leader_override')
      )
      AND s.status <> 'cancelled'
    WHERE lc2.case_id IS NOT NULL
    GROUP BY s.recipient_id, lc2.case_id
  )
  SELECT
    -- relationship: 직속 C 여부
    CASE
      WHEN t.depth = 1 AND t.grade = 'C' THEN 'direct_c'
      ELSE 'restricted_downline'
    END                             AS relationship,
    t.user_id                       AS partner_id,
    pr.name                         AS 담당자명,
    pa.region                       AS 지역,
    pa.status                       AS 파트너상태,
    -- 소속 마스터 경로: depth=1 이면 '직속', depth>1 이면 경로 문자열
    t.master_path                   AS 소속마스터경로,
    -- 예비 등록: 딜러 라인만, 팀장 라인은 NULL(0)
    COALESCE(pra.cnt_total,  0)     AS 예비등록건수,
    COALESCE(pra.cnt_보관중, 0)     AS 예비보관중,
    COALESCE(pra.cnt_접수완료,0)    AS 예비접수완료,
    -- 장례 사건
    lc.fc_created_at                AS 접수일,
    lc.fc_status                    AS 단계,
    lc.fc_started_at                AS 관시작시각,
    lc.encoffinment_time            AS 입관시각,
    lc.funeral_end_time             AS 종료시각,
    -- 수수료 상태
    COALESCE(fa.fee_status, '대기') AS 수수료상태
  FROM tree t
  JOIN public.partners pa   ON pa.user_id = t.user_id
  JOIN public.profiles pr   ON pr.id      = t.user_id
  LEFT JOIN latest_case lc  ON lc.pid     = t.user_id
  LEFT JOIN prereg_agg pra  ON pra.dealer_id = t.user_id AND v_line = 'dealer'
  LEFT JOIN fee_agg fa      ON fa.recipient_id = t.user_id AND fa.case_id = lc.case_id
  WHERE
    -- 라인 분리: 대표 라인과 동일한 role 의 하위만
    (v_line = 'dealer' AND t.role = 'dealer')
    OR
    (v_line = 'leader' AND t.role = 'leader');
END;
$$;

REVOKE ALL ON FUNCTION public.s_downline_overview_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.s_downline_overview_v2() FROM anon;
GRANT EXECUTE ON FUNCTION public.s_downline_overview_v2() TO authenticated;

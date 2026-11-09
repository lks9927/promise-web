-- P17 가족 안심 등록: 담당 딜러 문자 알림
-- 적용 순서: (1) send-alert Edge Function을 먼저 배포하고 (2) 이 SQL(설치 함수 생성)을 실행한 뒤 (3) SELECT public.p17_install_prereg_dealer_alert(); 를 실행하고 (4) 설치 함수를 DROP 한다.
-- 되돌리기: DROP TRIGGER IF EXISTS "pre-registration-dealer-alert" ON public.pre_registrations;
--            DELETE FROM public.system_config WHERE key IN ('sms_alert_prereg_dealer','sms_alert_prereg_hourly_cap');
-- 이 트리거는 기존 funeral-case-alert의 URL/Authorization 헤더/timeout 인자를 그대로 복제한다.
-- 따라서 운영에서 기존 웹훅 인증 방식이 바뀌어도 이 파일에 키를 복사해 두지 않는다.

INSERT INTO public.system_config(key, value) VALUES
  ('sms_alert_prereg_dealer', 'true'),
  ('sms_alert_prereg_hourly_cap', '10')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.p17_install_prereg_dealer_alert()
RETURNS void LANGUAGE plpgsql AS $p17$
DECLARE
  v_http_args text;
  v_def text;
BEGIN
  -- 운영 기준선의 실제 webhook 정의에서 http_request 인자를 복제한다.
  -- (URL, Authorization 헤더, params, timeout) 모두 기존 funeral 알림과 같아야 한다.
  SELECT pg_get_triggerdef(t.oid)
    INTO v_def
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.funeral_cases'::regclass
    AND t.tgname = 'funeral-case-alert'
    AND NOT t.tgisinternal
    AND t.tgfoid = 'supabase_functions.http_request'::regproc;

  IF v_def IS NOT NULL AND position('http_request(' IN v_def) > 0 THEN
    v_http_args := left(substr(v_def, position('http_request(' IN v_def) + length('http_request(')), -1);
  END IF;

  IF NULLIF(btrim(v_http_args),'') IS NULL THEN
    RAISE EXCEPTION 'P17 requires public.funeral_cases trigger funeral-case-alert using supabase_functions.http_request; no trigger was changed.';
  END IF;

  DROP TRIGGER IF EXISTS "pre-registration-dealer-alert" ON public.pre_registrations;
  EXECUTE format(
    'CREATE TRIGGER "pre-registration-dealer-alert" AFTER INSERT ON public.pre_registrations FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(%s)',
    v_http_args
  );
END
$p17$;
REVOKE ALL ON FUNCTION public.p17_install_prereg_dealer_alert() FROM PUBLIC, anon, authenticated;
-- 이 파일 실행 뒤 별도 문장으로: SELECT public.p17_install_prereg_dealer_alert();  (설치 후 DROP FUNCTION public.p17_install_prereg_dealer_alert();)

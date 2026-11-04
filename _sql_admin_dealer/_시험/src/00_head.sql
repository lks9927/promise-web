-- GENERATED FROM src/*.sql.  Do not add BEGIN/COMMIT/ROLLBACK around this DO block.
-- During execution, partners, funeral_cases and profiles can receive short DDL/DML locks (seconds, not a deployment lock).
DO $dry$
DECLARE
  v_result text := '';
  v_detail text;
  v_n bigint := 0;
  v_n2 bigint := 0;
  v_case uuid;
  v_fee_case_1 uuid;
  v_fee_case_2 uuid;
  v_customer uuid;
  v_leader uuid;
  v_other_leader uuid;
  v_region uuid;
  v_other_region uuid;
  v_sido uuid;
  v_other_sido uuid;
  v_s uuid;
  v_master uuid;
  v_child uuid;
  v_apply_1 boolean := false; v_apply_2 boolean := false; v_apply_3 boolean := false;
  v_apply_4 boolean := false; v_apply_5 boolean := false; v_apply_6 boolean := false;
  v_apply_7 boolean := false; v_apply_8 boolean := false; v_apply_9 boolean := false;
  v_apply_10 boolean := false; v_apply_11 boolean := false; v_apply_12 boolean := false;
  v_apply_13 boolean := false; v_apply_14 boolean := false;
  v_apply_15 boolean := false;
  v_apply_16 boolean := false;
  v_apply_17 boolean := false;
  v_apply_18 boolean := false;
  v_apply_19 boolean := false;
BEGIN
  ALTER TABLE public.funeral_cases DISABLE TRIGGER "funeral-case-alert";
  ALTER TABLE public.profiles DISABLE TRIGGER "profile-signup-alert";
  SELECT string_agg(c.relname || ':' || t.tgname || '=' || t.tgenabled::text, ', ' ORDER BY c.relname)
    INTO v_detail
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE NOT t.tgisinternal AND (c.oid='public.funeral_cases'::regclass AND t.tgname='funeral-case-alert'
    OR c.oid='public.profiles'::regclass AND t.tgname='profile-signup-alert');
  v_result := v_result || E'\n[INFO] alert triggers disabled and recorded: ' || coalesce(v_detail, 'not found');

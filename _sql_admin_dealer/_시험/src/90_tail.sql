v_result := E'[SUMMARY] PASS ' || regexp_count(v_result,E'\\[PASS\\]') || ' / FAIL ' || regexp_count(v_result,E'\\[FAIL\\]') || ' / SKIP ' || regexp_count(v_result,E'\\[SKIP\\]') || E'\n' || ltrim(v_result,E'\n');
RAISE EXCEPTION '%', 'DRYRUN_RESULT'||E'\n'||v_result;
END $dry$;

-- Every include is a savepoint-like PL/pgSQL sub-block.  A failed prerequisite leaves its flag false.
BEGIN
  -- @@INCLUDE ../../P1a_정산중복방지.sql
  v_apply_1 := true; v_result := v_result || E'\n[PASS] apply P1a settlement uniqueness';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1a: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1b_하위인원_한도.sql
  v_apply_2 := true; v_result := v_result || E'\n[PASS] apply P1b subordinate limit';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1b: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1c_등급변경_RPC.sql
  v_apply_3 := true; v_result := v_result || E'\n[PASS] apply P1c grade RPC';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1c: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1d_계좌_비공개테이블_생성_이관.sql
  v_apply_4 := true; v_result := v_result || E'\n[PASS] apply P1d private bank table';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1d table: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1e_취소정산_초안정리.sql
  v_apply_5 := true; v_result := v_result || E'\n[PASS] apply P1e cancellation settlement';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1e: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1f_취소철자_통일.sql
  v_apply_6 := true; v_result := v_result || E'\n[PASS] apply P1f cancelled spelling';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1f: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P1i_사업자여부_관리자승인.sql
  v_apply_7 := true; v_result := v_result || E'\n[PASS] apply P1i business approval';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1i: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P2a_관리자등급_계층규칙.sql
  v_apply_8 := true; v_result := v_result || E'\n[PASS] apply P2a hierarchy';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a hierarchy: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P2a_S등급_조회함수.sql
  v_apply_9 := true; v_result := v_result || E'\n[PASS] apply P2a S overview';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a overview: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P2a_상위조회_RLS.sql
  v_apply_10 := true; v_result := v_result || E'\n[PASS] apply P2a upstream RLS';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P2a RLS: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P3c_대표마스터단가_패키지표.sql
  v_apply_15 := true; v_result := v_result || E'\n[PASS] apply P3c representative-master package pricing';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3c: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P3a_관리수수료_집계.sql
  v_apply_11 := true; v_result := v_result || E'\n[PASS] apply P3a management fee';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3a: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P3b_배정_S하위_후보.sql
  v_apply_12 := true; v_result := v_result || E'\n[PASS] apply P3b S-child candidate';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P3b: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P4_지역별알림.sql
  v_apply_13 := true; v_result := v_result || E'\n[PASS] apply P4 regional alerts';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P4: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P5_초안트리거_제거.sql
  v_apply_16 := true; v_result := v_result || E'
[PASS] apply P5 drop old draft settlement trigger';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P5: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P6_profiles_조회_관계기반.sql
  v_apply_17 := true; v_result := v_result || E'
[PASS] apply P6 dealer-leader cross read block';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P6: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P7_승격요청.sql
  v_apply_18 := true; v_result := v_result || E'
[PASS] apply P7 promotion requests';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P7: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P8_홍보공개동의.sql
  v_apply_19 := true; v_result := v_result || E'
[PASS] apply P8 publicity consent column';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P8: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P10_예비상주.sql
  v_apply_20 := true; v_result := v_result || E'
[PASS] apply P10 pre-registration/card coupon';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P10: ' || SQLERRM; END;
BEGIN
  DROP FUNCTION IF EXISTS public.get_my_card_coupon(uuid); DROP FUNCTION IF EXISTS public.get_my_pre_registrations(uuid); -- harness only: prod already has P11 signatures
  -- @@INCLUDE ../../P10b_미리보기_관리자열람.sql
  v_apply_21 := true; v_result := v_result || E'
[PASS] apply P10b admin preview read';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P10b: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P11_예비상주_확장.sql
  v_apply_22 := true; v_result := v_result || E'
[PASS] apply P11 family registration extension';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P11: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P13_정산5줄모델.sql
  v_apply_23 := true; v_result := v_result || E'
[PASS] apply P13 five-line settlement model';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P13: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P12_프로필_민감열_제한.sql
  v_apply_24 := true; v_result := v_result || E'
[PASS] apply P12 profile sensitive-column restriction';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P12: ' || SQLERRM; END;
BEGIN
  -- @@INCLUDE ../../P14_팀장서류필수.sql
  v_apply_25 := true; v_result := v_result || E'
[PASS] apply P14 leader document requirement';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'
[FAIL] apply P14: ' || SQLERRM; END;
-- P1d DROP is intentionally last: the final exception rolls this DDL back.
BEGIN
  -- @@INCLUDE ../../P1d_계좌_기존열_제거.sql
  v_apply_14 := true; v_result := v_result || E'\n[PASS] apply P1d legacy bank column drop';
EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P1d drop: ' || SQLERRM; END;

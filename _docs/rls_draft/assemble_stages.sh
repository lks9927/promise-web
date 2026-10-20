#!/usr/bin/env bash
# STAGE1/STAGE2 묶음 SQL 을 원본 파일에서 다시 조립한다. (원본을 고친 뒤 실행)
#   STAGE1 (새 코드 배포 전): 01, 01b, 05, 07, 08   -> 화면 동작이 바뀌지 않는다(추가만)
#   STAGE2 (새 코드 배포 후): 03, 02, 06, 09
cd "$(dirname "$0")"
add() { echo; echo "-- ################ $1 ################"; cat "$1"; }
{
cat <<'H'
-- ============================================================================
-- STAGE1_apply_before_deploy.sql  (자동 조립 파일 - 원본: 01, 01b, 05, 07, 08)
-- 새 코드를 "배포하기 전에" 적용한다. 기존 화면 동작은 바뀌지 않는다(추가만 한다):
--   01 : 관리자/장례 담당 판별 도우미, 정산 계산 트리거 함수를 소유자 권한으로(본문 동일)
--   01b: 발주/업체 도우미 함수
--   05 : 수수료 정책을 관리자만 수정 (지금은 공개 키로 누구나 수정 가능 - 가장 급함)
--   07 : 쿠폰 조회 함수
--   08 : 배송기사 링크용 토큰 테이블과 함수
-- SQL Editor 에 파일 전체를 붙여넣고 Run. 오류가 나면 멈추고 오류 문구를 알려주세요.
-- ============================================================================
H
add 01_prerequisites.sql; add 01b_order_vendor_helpers.sql; add 05_close_commission_policies.sql
add 07_coupon_public_rpc.sql; add 08_delivery_rpc.sql
} > STAGE1_apply_before_deploy.sql
{
cat <<'H'
-- ============================================================================
-- STAGE2_apply_after_deploy.sql  (자동 조립 파일 - 원본: 03, 02, 06, 09)
-- 새 코드를 "배포한 뒤에" 적용한다. STAGE1 이 먼저 적용돼 있어야 한다.
--   03: 장례 등록 함수 보강(쿠폰 검증, 중복 방지, 딜러 변조 방지)
--   02: RLS 1단계(정산 등 6개 테이블)
--   06: 열려 있던 정책 정리(발주 항목, 업체 상품, 업체 수정 등)
--   09: 발주/배송 정책 닫기 (공개 키로 주문 목록 전체를 읽던 구멍)
-- 적용 직후 홈 화면의 장례 접수, 쿠폰 링크 접수, 관리자 정산, 업체/팀장 발주 화면, 새 배송 링크를 확인한다.
-- 문제가 생기면 99_rollback_phase1_rls.sql -> 98_rollback_function_changes.sql (09 되돌리기는 09 파일 맨 아래).
-- ============================================================================
H
add 03_submit_emergency_case_v2.sql; add 02_rls_phase1.sql; add 06_tighten_open_tables.sql
add 09_close_delivery_policies.sql
} > STAGE2_apply_after_deploy.sql
wc -l STAGE1_apply_before_deploy.sql STAGE2_apply_after_deploy.sql

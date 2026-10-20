-- ============================================================================
-- 10_system_config_policies.sql  (DRAFT - 01 이 먼저 적용돼 있어야 함. 새 코드 배포 후(STAGE2))
-- system_config 에 RLS 를 켜고 "공개해도 되는 키만" 로그인 없이 읽게 한다.
-- 지금은 RLS 가 꺼져 있어 공개 키로 모든 설정(복구 키, 문자 수신 번호, 배정 순서 등)이 읽히고 쓰인다.
-- 코드 조사(2026-10-20) 결과 읽는 키:
--   로그인 없음(홈, 쿠폰 링크): funeral_packages, footer_* 8개
--   로그인한 딜러/팀장/master: max_coupon_per_batch, max_coupon_amount, flower_order_required, show_top_menu
--   그 밖의 모든 키(관리자 설정 화면): 관리자만. 서버(서비스 키, Edge Function)는 RLS 를 우회한다.
-- 쓰기(upsert)는 관리자만.
-- ============================================================================
begin;

alter table public.system_config enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'system_config'
  loop
    execute format('drop policy %I on public.system_config', r.policyname);
  end loop;
end $$;

-- 로그인 없이 읽는 공개 키 (홈 상품 목록과 하단 사업자 정보)
create policy system_config_select_public on public.system_config
  for select to anon, authenticated
  using (key in (
    'funeral_packages',
    'footer_phone', 'footer_hours', 'footer_email', 'footer_company_name',
    'footer_ceo_name', 'footer_business_number', 'footer_address', 'footer_mail_order'
  ));

-- 로그인한 사용자가 화면 동작에 쓰는 키
create policy system_config_select_app on public.system_config
  for select to authenticated
  using (key in ('max_coupon_per_batch', 'max_coupon_amount', 'flower_order_required', 'show_top_menu'));

-- 관리자: 모두 읽고 쓰기 (is_admin 은 01 에서 authenticated 에게만 실행 권한을 준다)
create policy system_config_admin_all on public.system_config
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

commit;

-- 적용 후 확인:
--  - 로그아웃 상태로 홈을 열어 상품 목록과 하단 정보가 보인다.
--  - 관리자로 설정 화면을 열어 저장이 된다. 딜러로 쿠폰 발급 화면의 한도 값이 보인다.
--  - 새 설정 키를 화면에서 쓰게 되면 이 파일의 목록에 추가해야 로그인 없이/로그인 후 읽힌다.
-- 되돌리기:
--   begin;
--   drop policy if exists system_config_select_public on public.system_config;
--   drop policy if exists system_config_select_app    on public.system_config;
--   drop policy if exists system_config_admin_all     on public.system_config;
--   alter table public.system_config disable row level security;
--   commit;

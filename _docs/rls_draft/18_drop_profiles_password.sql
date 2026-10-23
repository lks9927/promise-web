-- ============================================================================
-- 18_drop_profiles_password.sql  (DRAFT - 새 코드 배포 "후" 에 적용)
-- 선행: 새 코드 배포 완료. 새 코드는 옛 비밀번호 열을 읽지도 쓰지도 않고(Login.jsx 의 옛 로그인 경로와
--       api/legacy-login-migrate.js 삭제, AdminDashboard 의 password: null 제거), 로그인은 Supabase Auth 만 쓴다.
--
-- 하는 일: profiles.password(옛 비밀번호 해시) 열을 삭제한다.
--   * 운영 확인(2026-10-23): 값이 있는 계정 17개 중 16개는 Auth 계정이 이미 있고 로그인 기록이 있다.
--     나머지 1개는 사용자 본인의 테스트 팀장 계정이며 삭제를 감수하기로 했다(로그인 불가가 됨).
--   * 되돌릴 수 있게, 삭제 전에 (id, password) 를 잠금 처리된 백업 테이블에 복사한다.
--     백업은 안정되면 지운다(drop table public.profiles_password_backup).
--   * cascade 를 쓰지 않으므로 이 열에 의존하는 뷰 등이 있으면 오류로 전체 취소된다.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

create table if not exists public.profiles_password_backup as
  select id, password, now() as backed_up_at
    from public.profiles
   where password is not null;

alter table public.profiles_password_backup enable row level security;   -- 정책 없음 = 일반 사용자 접근 불가
revoke all on public.profiles_password_backup from public, anon, authenticated;

alter table public.profiles drop column if exists password;

commit;

-- ============================================================================
-- 적용 후 확인 (읽기 전용):
--   select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='password';  -- 0행
--   select count(*) from public.profiles_password_backup;   -- 17
--
-- 되돌리기 (백업이 있을 때):
--   begin;
--   alter table public.profiles add column if not exists password text;
--   update public.profiles p set password = b.password from public.profiles_password_backup b where b.id = p.id;
--   -- 열 권한: 로그인한 사용자가 읽지 못하게 13 과 같이 password 를 뺀 열 목록만 읽도록 유지 (새로 만든 열은 자동으로 권한이 없다)
--   commit;
-- ============================================================================

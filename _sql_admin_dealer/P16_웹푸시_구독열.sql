-- P16 웹 푸시 구독 저장 열 (2026-11-10 보완)
-- 목적: 앱이 로그인 때 저장하려는 profiles.push_subscription 열이 운영에 없어 400 오류가 나고 웹 푸시 구독이 저장되지 않는다.
-- 열을 추가하고, 본인 행에 쓸 수 있도록 '쓰기' 열 권한만 준다. 읽기 권한은 주지 않는다(P12 공개 열 목록에 포함하지 않음).
--   읽기는 서버 api/send-push.js 가 서비스 롤로만 한다(관리자 발송 시 userIds 로 조회).
-- profiles 는 열 단위 권한이므로 새 열에는 UPDATE 권한을 따로 줘야 한다(주지 않으면 PATCH 가 permission denied).
-- 본인 행 제한은 기존 profiles UPDATE 정책(RLS)이 담당한다.
-- 되돌리기: REVOKE UPDATE (push_subscription) ON public.profiles FROM authenticated;
--           ALTER TABLE public.profiles DROP COLUMN IF EXISTS push_subscription;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_subscription jsonb;
REVOKE ALL (push_subscription) ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (push_subscription) ON public.profiles TO authenticated;

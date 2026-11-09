-- P16 웹 푸시 구독 저장 열 (2026-11-09)
-- 목적: 앱이 로그인 때 저장하려는 profiles.push_subscription 열이 운영에 없어 400 오류가 나고 웹 푸시 구독이 저장되지 않는다.
-- 열만 추가한다. 읽기 권한은 주지 않는다(P12 공개 열 목록에 포함하지 않음: 서버 api/send-push.js 가 서비스 롤로만 읽음).
-- 본인 행의 UPDATE 는 기존 profiles UPDATE 정책/권한을 따른다.
-- 되돌리기: ALTER TABLE public.profiles DROP COLUMN IF EXISTS push_subscription;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_subscription jsonb;

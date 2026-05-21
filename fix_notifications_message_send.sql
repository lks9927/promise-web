-- ============================================================
-- 메시지 발송 오류 수정 SQL (Supabase 콘솔에서 실행)
-- 문제: notifications.user_id가 auth.users(id) 참조 →
--       커스텀 localStorage 인증 UUID와 불일치로 INSERT 실패
-- ============================================================

-- 1. 기존 FK 제약 제거 (auth.users 참조)
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

-- 2. FK를 profiles(id)로 변경 (커스텀 인증 UUID 기반)
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. RLS 정책 재설정 (anon 역할도 허용)
-- INSERT
DROP POLICY IF EXISTS "System/Admin can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.notifications;
CREATE POLICY "Allow insert for all"
    ON public.notifications FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- SELECT
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow select by user_id" ON public.notifications;
CREATE POLICY "Allow select for all"
    ON public.notifications FOR SELECT
    TO anon, authenticated
    USING (true);

-- UPDATE (읽음 처리)
DROP POLICY IF EXISTS "Users can update their own notifications (mark as read)" ON public.notifications;
DROP POLICY IF EXISTS "Allow update" ON public.notifications;
CREATE POLICY "Allow update for all"
    ON public.notifications FOR UPDATE
    TO anon, authenticated
    USING (true);

-- 4. (선택) anon 테이블 권한 명시적 부여
GRANT SELECT, INSERT, UPDATE ON public.notifications TO anon;

-- ※ 주의: 위 정책은 개발용 임시 설정입니다.
--   Supabase Auth 정식 전환 후에는 auth.uid() 기반으로 변경하세요.

-- 시스템 설정 테이블 생성
CREATE TABLE IF NOT EXISTS public.system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ios_bidding_only boolean DEFAULT true, -- 1. 아이폰 유저 입찰 알람만 발송 (true) / 모든 알람 발송 (false)
    all_users_bidding_sms boolean DEFAULT true, -- 2. 모든 유저 입찰알람 문자로 발송 (true) / 아이폰만 발송 (false)
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- RLS 정책 설정
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for authenticated users" 
    ON public.system_settings 
    FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow update access for admin users" 
    ON public.system_settings 
    FOR ALL
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND (profiles.role = 'admin' OR profiles.role = 'master' OR profiles.admin_level = 'super')
        )
    );

-- 기본 설정값(싱글톤 1줄) 무조건 삽입
INSERT INTO public.system_settings (id, ios_bidding_only, all_users_bidding_sms)
SELECT '00000000-0000-0000-0000-000000000001', true, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.system_settings WHERE id = '00000000-0000-0000-0000-000000000001'
);

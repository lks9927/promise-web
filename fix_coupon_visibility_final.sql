-- [결정적 해결책] 쿠폰 테이블 권한 강제 재설정
-- RLS를 켜고, 명시적으로 '모든 사용자(로그인 여부 불문)'에게 '모든 권한'을 줍니다.
-- 이 스크립트를 실행하면 100% 보여야 정상입니다.

-- 1. RLS 활성화 (정책 적용을 위해 켬)
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 2. 기존 꼬인 정책들 전부 삭제
DROP POLICY IF EXISTS "Admins can insert coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can view all coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins and Super users can insert coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins and Super users can view all coupons" ON public.coupons;
DROP POLICY IF EXISTS "Users can view valid coupons" ON public.coupons;
DROP POLICY IF EXISTS "Users can update their coupons" ON public.coupons;
DROP POLICY IF EXISTS "Users can redeem coupons" ON public.coupons;
DROP POLICY IF EXISTS "Enable access to all users" ON public.coupons;
DROP POLICY IF EXISTS "Super Permissive Policy" ON public.coupons;

-- 3. [핵심] "누구나 다 허용" 정책 생성 (Super Permissive)
-- USING (true): 조회 조건 없음 (다 보임)
-- WITH CHECK (true): 입력/수정 조건 없음 (다 가능)
CREATE POLICY "Allow All Access"
ON public.coupons
FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Role별 권한(GRANT) 확실하게 부여
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.coupons TO anon, authenticated, service_role;

-- 5. 시퀀스(ID 생성 등) 권한 부여 (필요 시)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

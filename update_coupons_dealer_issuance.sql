-- 쿠폰 테이블에 발행자(issued_by) 정보 추가
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES public.profiles(id);

-- 시스템 설정에 '딜러 1회 쿠폰 발행 제한 수' 추가
INSERT INTO public.system_config (key, value, description) 
VALUES ('max_coupon_per_batch', '10', '딜러가 한 번에 발행할 수 있는 최대 쿠폰 수')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 캐시 새로고침
NOTIFY pgrst, 'reload schema';

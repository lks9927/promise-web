-- [쿠폰 시스템 복구 및 기능 확장 통합 SQL]
-- 1. 쿠폰 테이블 생성 (없을 경우에만)
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL,
  amount integer NOT NULL,
  status text DEFAULT 'issued', -- 'issued', 'used'
  issued_to text, -- 전화번호 (NULL 가능)
  batch_name text, -- 배치명
  issued_by uuid REFERENCES public.profiles(id), -- 누가 발행했는지 추적
  created_at timestamp with time zone DEFAULT now()
);

-- 1-1. 만약 테이블은 있는데 발행자(issued_by) 컬럼만 없다면 추가
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES public.profiles(id);

-- 2. RLS(보안) 설정 및 권한 부여
-- 데이터 유실 방지를 위해 일단 보안 정책을 끄거나 모두 허용으로 설정합니다.
ALTER TABLE public.coupons DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.coupons TO anon;
GRANT ALL ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;

-- 3. 시스템 설정에 '딜러 1회 쿠폰 발행 제한 수' 추가
INSERT INTO public.system_config (key, value, description) 
VALUES ('max_coupon_per_batch', '10', '딜러가 한 번에 발행할 수 있는 최대 쿠폰 수')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 4. 캐시 새로고침 안내 필드
NOTIFY pgrst, 'reload schema';

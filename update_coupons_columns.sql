-- 1. 쿠폰 테이블에 사용 용도 및 관련 사건 ID 컬럼 추가
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS used_for VARCHAR(50);
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.funeral_cases(id);

-- 2. 쿠폰 사용 용도 코멘트 추가
COMMENT ON COLUMN public.coupons.used_for IS '쿠폰 사용 용도 (현금지급, 화환사용, 입관꽃사용, 수동입력 등)';
COMMENT ON COLUMN public.coupons.case_id IS '쿠폰이 사용된 장례 접수 건 ID';

-- 3. 기존 데이터와 호환을 위해 status 체크 (이미 존재할 수 있음)
-- 만약 status가 boolean이었다면 text로 변경하는 로직이 필요할 수 있으나, 
-- 이전 작업에서 'active', 'used' 등을 사용하는 것으로 보아 이미 text/varchar 임.

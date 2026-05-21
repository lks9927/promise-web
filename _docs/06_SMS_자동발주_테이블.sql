-- ==============================================================================
-- SMS 자동 발주 시스템 관련 추가 테이블 (설계 지도 반영)
-- ==============================================================================

-- 1. 발주 키워드 필터 테이블 (업체별 커스텀)
CREATE TABLE IF NOT EXISTS public.sms_filter_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('include', 'exclude')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.sms_filter_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own sms_filter_keywords" ON public.sms_filter_keywords
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = sms_filter_keywords.company_id));


-- 2. 장례식장 배송 권역 테이블
CREATE TABLE IF NOT EXISTS public.funeral_halls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  is_deliverable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.funeral_halls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own funeral_halls" ON public.funeral_halls
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = funeral_halls.company_id));


-- 3. 자동 답장 문구 설정 테이블
CREATE TABLE IF NOT EXISTS public.sms_reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('accepted', 'rejected')),
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.sms_reply_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own sms_reply_templates" ON public.sms_reply_templates
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = sms_reply_templates.company_id));


-- 4. 발주 대기열(SMS Queue) 테이블
CREATE TABLE IF NOT EXISTS public.sms_order_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- 수신 정보
  sender_phone TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  
  -- 고객 매칭 (옵션)
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  is_new_client BOOLEAN DEFAULT false,
  
  -- 장례식장 매칭 (옵션)
  funeral_hall_id UUID REFERENCES public.funeral_halls(id) ON DELETE SET NULL,
  funeral_hall_name TEXT,
  is_deliverable BOOLEAN,
  
  -- 자동 답장 결과
  auto_reply_type TEXT CHECK (auto_reply_type IN ('accepted', 'rejected', null)),
  auto_reply_sent BOOLEAN DEFAULT false,
  auto_reply_at TIMESTAMPTZ,
  
  -- 담당자 처리 상태
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'spam')),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.sms_order_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own sms_order_queue" ON public.sms_order_queue
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = sms_order_queue.company_id));


-- 5. 문자 앱에서 꺼내기 위한 임시 발신 대기열 (outbox)
-- 앱이 /sms/outbox API를 폴링해서 문자를 발송하도록 함
CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own sms_outbox" ON public.sms_outbox
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = sms_outbox.company_id));


-- 6. 영업 문자 발송 이력 테이블
CREATE TABLE IF NOT EXISTS public.sms_marketing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  catalog_url TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.sms_marketing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage own sms_marketing_log" ON public.sms_marketing_log
  FOR ALL USING (company_id = auth.uid() OR auth.uid() IN (SELECT id FROM users WHERE company_id = sms_marketing_log.company_id));


-- 7. 기존 compositions (상품 템플릿) 테이블에 사진 컬럼 추가
-- 확인 먼저 하고 추가
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'compositions' AND column_name = 'photo_url') THEN
    ALTER TABLE public.compositions ADD COLUMN photo_url TEXT;
  END IF;
END $$;

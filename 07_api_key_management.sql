-- ======================================================================
-- [API 키 관리 시스템] - 외부 연동용 API Gateway 기반
-- 1) api_keys: API 키 관리 (이름, 권한, 상태, 만료일)
-- 2) api_logs: 사용 기록 (요청 로그)
-- ======================================================================

-- =============================================
-- 1. api_keys 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,                        -- 키 이름 (예: '홍보자동화', '제휴사A')
    api_key TEXT NOT NULL UNIQUE,              -- 실제 API 키 값
    permissions TEXT[] DEFAULT '{}',           -- 권한 배열 (예: ['cases.read', 'cases.write', 'photos.read'])
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    created_by UUID REFERENCES profiles(id),  -- 누가 생성했는지
    expires_at TIMESTAMPTZ,                    -- 만료일 (NULL이면 무기한)
    last_used_at TIMESTAMPTZ,                 -- 마지막 사용 시각
    request_count INTEGER DEFAULT 0,          -- 총 요청 횟수
    daily_limit INTEGER DEFAULT 1000,         -- 일일 요청 제한
    description TEXT,                          -- 설명/메모
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. api_logs 테이블 (사용 기록)
-- =============================================
CREATE TABLE IF NOT EXISTS api_logs (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,                    -- 호출된 엔드포인트 (예: '/api/cases')
    method TEXT NOT NULL,                      -- HTTP 메서드 (GET, POST 등)
    status_code INTEGER,                       -- 응답 상태 코드
    ip_address TEXT,                           -- 요청 IP
    request_body JSONB,                        -- 요청 바디 (민감정보 제외)
    response_summary TEXT,                     -- 응답 요약
    duration_ms INTEGER,                       -- 처리 시간 (ms)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 3. 인덱스
-- =============================================
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_logs_key_id ON api_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at DESC);

-- =============================================
-- 4. RLS 정책 (관리자만 접근)
-- =============================================
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- 관리자(admin) 역할만 api_keys CRUD 가능
CREATE POLICY "admin_api_keys_all" ON api_keys
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 관리자(admin) 역할만 api_logs 조회 가능
CREATE POLICY "admin_api_logs_select" ON api_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Edge Function에서 service_role key로 로그 삽입 가능
CREATE POLICY "service_api_logs_insert" ON api_logs
    FOR INSERT WITH CHECK (true);

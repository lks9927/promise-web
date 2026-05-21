-- ======================================================================
-- [V2 팀장 배정 시스템] 타임아웃 릴레이 입찰 로직 및 히스토리 기록
-- ======================================================================

-- 1. 장례 접수 테이블(funeral_cases)에 순차 배정 관련 컬럼 추가
ALTER TABLE funeral_cases 
ADD COLUMN IF NOT EXISTS current_bidder_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS bid_timeout_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS previous_bidders uuid[] DEFAULT '{}';

-- 2. 입찰 반응 이력 기록 테이블 생성 (bidding_history)
CREATE TABLE IF NOT EXISTS bidding_history (
    id uuid default gen_random_uuid() primary key,
    case_id uuid not null references funeral_cases(id) on delete cascade,
    leader_id uuid not null references profiles(id) on delete cascade,
    status text not null check (status in ('offered', 'accepted', 'timeout', 'rejected')),
    offered_at timestamp with time zone default now(),
    resolved_at timestamp with time zone,
    reason text,
    created_at timestamp with time zone default now()
);

-- RLS 설정
ALTER TABLE bidding_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own bidding history" ON bidding_history FOR SELECT USING (auth.role() = 'authenticated' AND (auth.uid() = leader_id OR EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'master'))));

-- 3. 시스템 설정에 대기 시간 설정 정보 추가 (기본 5분)
INSERT INTO system_config (key, value, description)
VALUES ('bidding_timeout_minutes', '5', '팀장 미배정 시 자동 다음 배정까지의 대기 시간 (분)')
ON CONFLICT (key) DO NOTHING;

-- 4. RPC: 타임아웃된 입찰을 검사하고 다음 사람에게 넘기는 시스템 함수
-- (실제 서비스에서는 pg_cron이나 Edge Functions(Cron Job)을 통해 1분마다 주기적으로 실행되도록 구성)
CREATE OR REPLACE FUNCTION process_bidding_timeouts()
RETURNS integer AS $$
DECLARE
    v_case RECORD;
    v_timeout_mins integer;
    v_processed_count integer := 0;
BEGIN
    FOR v_case IN 
        SELECT id, current_bidder_id, previous_bidders 
        FROM funeral_cases 
        WHERE status = 'requested' 
          AND current_bidder_id IS NOT NULL 
          AND bid_timeout_at < now()
    LOOP
        -- 1. 히스토리 기록 (Timeout 처리)
        UPDATE bidding_history 
        SET status = 'timeout', 
            resolved_at = now(), 
            reason = '지정된 시간 내 미응답 (자동 패스)'
        WHERE case_id = v_case.id 
          AND leader_id = v_case.current_bidder_id 
          AND status = 'offered';

        -- 2. 해당 팀장에게 타임아웃 페널티 알림 발송 기록
        INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
        VALUES (
            v_case.current_bidder_id,
            'warning',
            '배정 타임아웃 안내',
            '배정 요청에 정해진 시간 내 응답하지 않아 다음 순번으로 콜이 이관되었습니다.',
            false,
            now()
        );

        -- 3. 다음 순번자 탐색 (배열에 추가된 사람 이외의 다음 사람)
        -- (현재는 가중치/순번 로직이 복잡하므로 current_bidder_id를 NULL로 만들고 모든 미배정자에게 노출시키는 폴백 또는 대기 큐로 보냄 처리)
        -- (추후 실제 순번 데이터를 기반으로 next_id를 찾아 UPDATE하는 로직으로 고도화)
        UPDATE funeral_cases 
        SET previous_bidders = array_append(previous_bidders, v_case.current_bidder_id),
            current_bidder_id = NULL, -- 임시: 권한 박탈 및 대기 파울/폴백 상태
            bid_timeout_at = NULL
        WHERE id = v_case.id;

        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    RETURN v_processed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

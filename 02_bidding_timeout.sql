-- Timeout Bidding Logic -- Add bid_timeout_at and bidding_status to funeral_cases

ALTER TABLE funeral_cases
ADD COLUMN bid_timeout_at timestamp with time zone,
ADD COLUMN previous_bidders uuid[] DEFAULT '{}'; -- Track team leaders who have already been offered or passed

-- Add bidding parameters to system_config if they don't exist
INSERT INTO system_config (key, value, description)
VALUES ('bidding_timeout_minutes', '3', '팀장 미배정 시 자동 다음 배정까지의 제한 시간(분)')
ON CONFLICT (key) DO NOTHING;

-- Note: Actual edge function to handle the timeout would be created in supabase/functions/bidding-timeout/index.ts

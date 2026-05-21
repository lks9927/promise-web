-- ============================================================
-- 19_enable_cron_timeout.sql
-- 백그라운드 자동 타임아웃 처리 활성화 (pg_cron)
-- ============================================================

-- 1. pg_cron 확장 활성화 (Supabase 환경에서 기본 제공됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. (처음 실행 시에는 unschedule 할 필요가 없습니다)
-- SELECT cron.unschedule('process_bidding_timeouts_job');

-- 3. 매 1분마다 process_bidding_timeouts() 함수를 자동으로 실행하도록 스케줄 등록
SELECT cron.schedule(
  'process_bidding_timeouts_job', 
  '* * * * *', -- 매 분마다 실행
  $$ SELECT process_bidding_timeouts(); $$
);

-- 확인용 메시지
-- 등록된 크론 작업은 cron.job 테이블에서 확인할 수 있습니다.
-- SELECT * FROM cron.job;

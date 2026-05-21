-- partners 테이블에 누락된 컬럼 추가 (status, master_id)
-- Supabase SQL Editor에서 이 쿼리를 실행해주세요.

ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS status text check (status in ('pending', 'approved', 'rejected')) default 'pending';

ALTER TABLE partners 
ADD COLUMN IF NOT EXISTS master_id uuid references profiles(id);

-- 기존 데이터가 있다면 status를 'pending'으로 초기화 (선택 사항)
UPDATE partners SET status = 'pending' WHERE status IS NULL;

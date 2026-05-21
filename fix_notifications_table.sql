-- 1. sender_id 컬럼 추가 (profiles 테이블 참조)
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. sender_name 컬럼 추가 (발송자 이름 저장. 삭제되더라도 이름은 남게)
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- 3. schema.sql 이나 다른 시드 파일에도 적용될 수 있도록 캐시 새로고침 안내
-- Supabase SQL 편집기에서 이 스크립트를 실행해 주시면 됩니다.

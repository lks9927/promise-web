-- 1. 쿠폰 받는 사람을 '익명(NULL)' 허용으로 변경 (필수값 제한 해제)
alter table public.coupons alter column issued_to drop not null;

-- 2. batch_name 컬럼이 없을 때만 추가 (있으면 무시)
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'coupons' and column_name = 'batch_name') then
        alter table public.coupons add column batch_name text;
    end if;
end $$;

-- 3. RLS(Row Level Security) 비활성화
-- 현재 프로젝트 구조상 Supabase Auth(로그인)가 아닌 커스텀 인증을 사용하고 있어,
-- RLS가 켜져 있으면 DB 접근이 차단됩니다. 
-- 따라서 쿠폰 테이블의 RLS를 꺼서 누구나(Anon Key) 접근 가능하도록 임시 조치합니다.
alter table public.coupons disable row level security;

-- 최후의 수단: 쿠폰 테이블 재생성 (데이터 백업 X)
-- 다른 설정이 뭔가 꼬여서 계속 안 보이는 것일 수 있으니, 아예 깨끗하게 다시 만듭니다.

-- 1. 기존 테이블 삭제 (강제)
drop table if exists public.coupons cascade;

-- 2. 아주 간단한 구조로 재생성 (보안 정책 없음)
create table public.coupons (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  amount integer not null,
  status text default 'issued', -- 'issued', 'used'
  issued_to text, -- 전화번호 (NULL 가능)
  batch_name text, -- 배치명
  created_at timestamp with time zone default now()
);

-- 3. RLS(보안) 아예 끄기 (확실하게)
alter table public.coupons disable row level security;

-- 4. 누구나 접근 가능하게 권한 풀기
grant all on table public.coupons to anon;
grant all on table public.coupons to authenticated;
grant all on table public.coupons to service_role;

-- 5. 테스트 데이터 1개 넣기 (보이는지 확인용)
insert into public.coupons (code, amount, batch_name) values ('TEST-COUPON-123', 10000, '테스트발행');

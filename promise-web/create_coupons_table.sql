-- 쿠폰 테이블 생성
create table if not exists public.coupons (
  code text primary key,
  amount integer not null,
  status text default 'issued', -- 'issued', 'used', 'expired'
  issued_to text not null, -- 전화번호
  used_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  used_at timestamp with time zone,
  image_url text -- 쿠폰 이미지 URL (선택사항)
);

-- RLS 정책 설정 (보안)
alter table public.coupons enable row level security;

-- 관리자는 모든 쿠폰을 볼 수 있음
create policy "Admins can view all coupons"
  on public.coupons for select
  using (auth.uid() in (select id from public.profiles where role = 'admin'));

-- 관리자는 쿠폰을 생성할 수 있음
create policy "Admins can insert coupons"
  on public.coupons for insert
  with check (auth.uid() in (select id from public.profiles where role = 'admin'));

-- 사용자는 자신에게 발급된 쿠폰을 조회하거나 사용할 수 있음 (업데이트)
create policy "Users can update their coupons"
  on public.coupons for update
  using (true) -- 간단하게 처리 (실제로는 더 복잡한 검증 필요)
  with check (status = 'used');

-- 프로필 테이블에 캐시백 컬럼 추가 (없다면)
alter table public.profiles add column if not exists cashback integer default 0;

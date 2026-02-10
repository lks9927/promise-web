-- 기존 데이터를 삭제하고 새로 시작하려면 아래 주석을 풀고 실행하세요
DROP TABLE IF EXISTS settlements;
DROP TABLE IF EXISTS funeral_cases;
DROP TABLE IF EXISTS partners;
DROP TABLE IF EXISTS profiles;

-- 1. UUID 확장 기능 활성화
create extension if not exists "uuid-ossp";

-- 2. 사용자 정보 (profiles)
create table profiles (
  id uuid primary key, -- Here modified: temporarily removed auth.users check
  email text,
  role text check (role in ('admin', 'master', 'leader', 'assistant', 'dealer', 'customer')) default 'customer',
  admin_level text check (admin_level in ('super', 'operating')) default 'super', -- Added admin_level
  name text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. 파트너 정보 (partners)
create table partners (
  user_id uuid references profiles(id) on delete cascade primary key,
  region text,
  grade text,
  bank_account text,
  referral_code text,
  master_id uuid references profiles(id), -- Approved by whom
  status text check (status in ('pending', 'approved', 'rejected', 'suspended')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. 장례 접수 (funeral_cases)
create table funeral_cases (
  id uuid default uuid_generate_v4() primary key,
  customer_id uuid references profiles(id),
  dealer_id uuid references profiles(id),
  team_leader_id uuid references profiles(id), -- Added team_leader_id
  status text check (status in ('requested', 'assigned', 'in_progress', 'team_settling', 'hq_check', 'completed', 'cancelled')) default 'requested',
  location text,
  package_name text,
  final_price integer default 0,
  commission_amount integer default 0,
  master_rating integer check (master_rating between 1 and 5), -- 1 to 5 stars
  customer_rating integer check (customer_rating between 1 and 5), -- 1 to 5 stars
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. 정산 내역 (settlements)
create table settlements (
  id uuid default uuid_generate_v4() primary key,
  case_id uuid references funeral_cases(id) on delete cascade,
  recipient_id uuid references profiles(id),
  amount integer default 0,
  type text check (type in ('dealer_commission', 'customer_cashback', 'leader_fee', 'master_fee', 'flower_cost', 'override_fee')), -- Added override_fee
  is_pre_paid boolean default false,
  status text check (status in ('pending', 'paid')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. 테스트용 가짜 데이터 입력
-- (참고: 실제 앱에서는 회원가입 시 ID가 생성되므로, 여기서는 테스트를 위해 임의의 ID를 직접 지정해 넣습니다)

-- 사용자 (관리자, 팀장, 딜러, 고객)
insert into profiles (id, email, role, name, phone) values
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin@promise.com', 'admin', '관리자', '010-1234-5678'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'hero@promise.com', 'leader', '박영웅 팀장', '010-1111-2222'),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'dealer1@promise.com', 'dealer', '김철수 딜러', '010-3333-4444'),
  ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'customer1@promise.com', 'customer', '이영희 고객', '010-5555-6666');

-- 장례 접수 건 (2건)
insert into funeral_cases (id, customer_id, dealer_id, status, location, package_name, final_price, commission_amount) values
  ('f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a20', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'team_settling', '서울성모병원', '프리미엄 3일장', 3500000, 300000),
  ('f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', null, 'hq_check', '삼성서울병원', '스카이플라워 VIP', 4500000, 450000);

-- 6. 화환 발주 (flower_orders) - New Table
create table flower_orders (
  id uuid default uuid_generate_v4() primary key,
  case_id uuid references funeral_cases(id) on delete cascade,
  team_leader_id uuid references profiles(id),
  flower_type text default 'sky_flower', -- 입관꽃(하늘꽃)
  amount integer default 150000, -- Default price example
  status text check (status in ('ordered', 'delivering', 'delivered')) default 'ordered',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. 시스템 설정 (system_config) - New Table
create table system_config (
  key text primary key,
  value text,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 기본 설정값 입력
insert into system_config (key, value, description) values
  ('flower_order_required', 'false', '하늘꽃 발주 버튼 노출 여부 (true/false)'),
  ('global_settlement_enabled', 'false', '전체 정산 기능 활성화 여부 (true/false)');

-- 정산 내역 (딜러 수수료, 고객 캐시백)
insert into settlements (case_id, recipient_id, amount, type, is_pre_paid, status) values
  ('f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a20', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 300000, 'dealer_commission', false, 'pending'),
  ('f2eebc99-9c0b-4ef8-bb6d-6bb9bd380a21', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 100000, 'customer_cashback', true, 'pending');
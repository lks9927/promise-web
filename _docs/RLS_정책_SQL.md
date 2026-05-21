# RLS (Row Level Security) 정책 SQL

> ⚠️ 이 파일의 SQL을 Supabase SQL Editor에 복사/실행하면 데이터 보안이 완성됩니다.
> 실행 전 반드시 관리자 계정으로 로그인 테스트를 해주세요.

## 실행 방법
1. Supabase Dashboard → SQL Editor 클릭
2. 아래 SQL을 섹션별로 복사 → [Run] 클릭
3. 모든 섹션 실행 후 각 역할(admin, leader, dealer 등)로 로그인하여 데이터 접근 확인

---

## 1. RLS 활성화 (모든 주요 테이블)

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE funeral_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
```

## 2. profiles 테이블 정책

```sql
-- 본인 프로필만 읽기/수정
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 관리자는 전체 프로필 읽기/수정 가능
CREATE POLICY "Admin full access to profiles"
  ON profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 마스터는 파트너(leader/dealer) 프로필 열람 가능
CREATE POLICY "Master can view partner profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'
    )
  );
```

## 3. funeral_cases 테이블 정책

```sql
-- 관리자: 모든 접수 읽기/쓰기
CREATE POLICY "Admin full access to funeral_cases"
  ON funeral_cases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 마스터: 모든 접수 읽기
CREATE POLICY "Master can view all funeral_cases"
  ON funeral_cases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

-- 팀장: 본인 배정 건만 읽기/수정
CREATE POLICY "Leader can view assigned cases"
  ON funeral_cases FOR SELECT
  USING (assigned_leader_id = auth.uid());

CREATE POLICY "Leader can update assigned cases"
  ON funeral_cases FOR UPDATE
  USING (assigned_leader_id = auth.uid());

-- 딜러: 본인이 접수한 건만 읽기 + 신규 접수 가능
CREATE POLICY "Dealer can view own cases"
  ON funeral_cases FOR SELECT
  USING (dealer_id = auth.uid());

CREATE POLICY "Dealer can insert cases"
  ON funeral_cases FOR INSERT
  WITH CHECK (dealer_id = auth.uid());
```

## 4. settlements 테이블 정책

```sql
-- 관리자: 전체 읽기/쓰기
CREATE POLICY "Admin full access to settlements"
  ON settlements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 마스터: 전체 정산 읽기
CREATE POLICY "Master can view all settlements"
  ON settlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

-- 파트너(leader/dealer): 본인 관련 정산만 읽기
CREATE POLICY "Partners can view own settlements"
  ON settlements FOR SELECT
  USING (partner_id = auth.uid());
```

## 5. partners 테이블 정책

```sql
-- 관리자: 전체 접근
CREATE POLICY "Admin full access to partners"
  ON partners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 마스터: 소속 파트너 읽기/승인
CREATE POLICY "Master can manage partners"
  ON partners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'master'
    )
  );

-- 본인 파트너 프로필만 읽기
CREATE POLICY "Partners can view own record"
  ON partners FOR SELECT
  USING (user_id = auth.uid());
```

## 6. vendors 테이블 정책

```sql
-- 관리자: 전체 접근
CREATE POLICY "Admin full access to vendors"
  ON vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 본인 업체만 읽기/수정
CREATE POLICY "Vendors can view own record"
  ON vendors FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Vendors can update own record"
  ON vendors FOR UPDATE
  USING (user_id = auth.uid());
```

## 7. coupons 테이블 정책

```sql
-- 관리자: 전체 접근
CREATE POLICY "Admin full access to coupons"
  ON coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 딜러: 본인 발행 건만 읽기 + 발행 가능
CREATE POLICY "Dealer can view own coupons"
  ON coupons FOR SELECT
  USING (issued_by = auth.uid());

CREATE POLICY "Dealer can insert coupons"
  ON coupons FOR INSERT
  WITH CHECK (issued_by = auth.uid());
```

---

## ⚠️ 주의사항
- RLS를 켜면 **정책에 명시되지 않은 접근은 모두 차단**됩니다.
- 반드시 **admin 계정으로 먼저 로그인 테스트**를 하세요.
- 문제가 생기면 아래 SQL로 특정 테이블의 RLS를 끌 수 있습니다:
  ```sql
  ALTER TABLE 테이블이름 DISABLE ROW LEVEL SECURITY;
  ```

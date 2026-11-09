// profiles 에서 읽어도 되는 열. (옛 비밀번호 password 열은 18_drop_profiles_password.sql 로 삭제됨. 비밀번호는 Supabase Auth 가 관리)
// DB 는 로그인한 사용자에게 주소/계좌/사업자 열의 읽기 권한을 주지 않으므로 select('*') 를 쓰면 오류가 난다.
// 새 열을 profiles 에 추가하면 DB 의 열 권한(13_function_privileges.sql 참고)과 이 목록을 함께 갱신한다.
export const PROFILE_PUBLIC_COLUMNS = [
  'id', 'name', 'phone', 'role', 'avatar_url', 'introduction', 'experience_years',
  'certificate_url', 'gallery_urls', 'business_license_url', 'has_business', 'created_at'
].join(', ');

export const PROFILE_PRIVATE_COLUMNS = [
  'id', 'email', 'admin_level', 'password_reset_requested', 'os_type', 'fcm_token',
  'agreed_terms', 'agreed_privacy', 'agreed_marketing', 'agreed_at'
].join(', ');

// Existing callers retain this public-only export. Sensitive fields come from the private RPCs.
export const PROFILE_COLUMNS = PROFILE_PUBLIC_COLUMNS;

// 주소/계좌/사업자 정보는 profiles 가 아니라 본인과 관리자만 읽는 profile_private 테이블에 있다.
// (DB: _docs/rls_draft/14a, 14b). profiles 에서 이 열들을 읽거나 쓰면 오류가 난다.
export const PRIVATE_COLUMNS = [
  'address', 'address_detail', 'bank_code', 'bank_account', 'bank_holder', 'business_number',
  'business_name', 'ceo_name', 'business_type', 'business_item', 'tax_email', 'business_address'
].join(', ');

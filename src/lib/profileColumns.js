// profiles 에서 읽어도 되는 열. 비밀번호(레거시 password)는 제외한다.
// DB 는 로그인한 사용자에게 password 열의 읽기 권한을 주지 않으므로 select('*') 를 쓰면 오류가 난다.
// 새 열을 profiles 에 추가하면 DB 의 열 권한(13_function_privileges.sql 참고)과 이 목록을 함께 갱신한다.
export const PROFILE_COLUMNS = [
  'id', 'email', 'role', 'admin_level', 'name', 'phone', 'introduction', 'experience_years',
  'created_at', 'password_reset_requested', 'certificate_url', 'gallery_urls', 'business_license_url',
  'address', 'address_detail', 'os_type', 'fcm_token', 'bank_code', 'bank_account', 'bank_holder',
  'avatar_url', 'has_business', 'business_number', 'business_name', 'ceo_name', 'business_type',
  'business_item', 'tax_email', 'business_address', 'agreed_terms', 'agreed_privacy',
  'agreed_marketing', 'agreed_at'
].join(', ');

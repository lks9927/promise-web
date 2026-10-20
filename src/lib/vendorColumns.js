// vendors 에서 읽어도 되는 열. 계좌(bank_name, bank_account)는 제외한다.
// 계좌는 본인과 관리자만 읽는 vendor_private 테이블에 있다 (DB: _docs/rls_draft/15a, 15b).
// 15b 적용 후에는 vendors 에 select('*') 를 쓰면 권한 오류가 난다. 새 열을 추가하면 이 목록과 DB 열 권한을 함께 갱신한다.
export const VENDOR_COLUMNS = [
  'id', 'user_id', 'company_name', 'business_type', 'phone', 'address', 'status',
  'rejection_reason', 'approved_at', 'approved_by', 'created_at', 'tax_type'
].join(', ');

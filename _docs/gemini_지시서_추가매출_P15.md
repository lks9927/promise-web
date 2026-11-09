# Gemini 작업 지시서: 추가 매출 등록과 수수료 정산 (P15)

난이도 높음. 돈이 걸린 정산 변경이라 **정확성이 속도보다 우선**이다. 작업 폴더는 `D:\Anti-Gravity\AI_Project\promise-web` (브랜치 `admin-dealer`).
한국어로 보고하고, 사용자는 개발자가 아니니 쉬운 말로 쓴다. 사용자는 "광수"라고 부른다.

## 0. 절대 규칙 (어기면 작업 무효)
1. **운영 DB·네트워크 접근 금지.** SQL 은 파일로만 만든다. 적용은 하지 않는다. `git commit`·`git push`·배포도 하지 않는다.
2. **`calculate_settlements` 함수 본문은 한 글자도 바꾸지 않는다.** 추가 매출은 전용 함수와 트리거로 처리한다.
3. 금액·비율을 코드에 박지 않는다(50% 포함). 모두 설정값(`commission_policies`)에서 읽는다.
4. 새 표는 **`profiles(id)`** 를 참조한다. `partners` 를 참조하는 외래키를 만들면 PostgREST 임베드가 모호해져(PGRST201) 화면이 깨진다.
5. 이 지시서에 없는 기존 화면 요소를 지우거나 바꾸지 않는다. (이전 작업에서 요청 없이 기존 카드를 지운 사고가 있었다.)
6. 새 profiles/auth.users 행을 시험에서 만들지 않는다. 기존 행을 재사용·UPDATE 하고, 예행연습 마지막에 전체가 롤백된다.
7. 셸 명령이 허용되면 `npm.cmd run build` 와 `node _sql_admin_dealer/_시험/build_all_dryrun.mjs` 만 실행한다. 허용되지 않으면 하지 말고 "셸이 필요한 확인 목록"으로 보고한다.

## 1. 광수가 확정한 기능
- 장례 진행 중 상주가 원해서 **추가 상품·서비스**가 생기면, **팀장이 로그인해서 해당 장례 건에 항목을 여러 개 등록**한다. 입력: 품목명, 설명(선택), 단가(원, 0 이상), 수량(기본 1), 사진(여러 장, 선택).
- **입력은 장례가 종료되기 전(`in_progress`)까지만** 가능하다. 장례 종료(`team_settling` 전환) 시점에 합계가 확정되고, 이후에는 등록·수정·취소가 잠긴다. 종료 전에는 합계와 예상 수수료를 팀장 화면에 미리 보여 준다.
- **추가 매출 전액이 사건 총합에 더해지고, 그 금액의 50% 를 팀장이 본사에 낸다(본사 수익).** 50 은 설정값이다(`commission_policies.extra_sales_fee_rate`, 기본 50, 패키지별 정책 행을 따름. 사건의 `package_name` → 기존 함수 `policy_id_for_package()` 로 정책 선택).
- **수수료는 부가세 포함가**: `fee = ROUND(추가 매출 합계 × rate / 100)` 정수 원. 공급가 = `ROUND(fee / 1.1)`, 부가세 = `fee − 공급가`. 팀장은 면세사업자라 매입세액 공제가 안 되므로 실제 부담은 포함가 전액이다. 팀장 몫 = 합계 − fee.
  - 이 분리 계산식은 **SQL 함수 한 곳**(예: `extra_sales_fee_split(fee int) → (base_amount int, tax_amount int)`)에서만 정한다. 트리거·화면 모두 이 함수가 돌려준 값을 쓰고, 화면에서 `1.1` 을 따로 쓰지 않는다. (나중에 부가세 포함 여부를 바꾸기 쉽게)
- **장례 종료 시 팀장의 입금액을 한 번에 합산해서 보여 준다**: 총 입금액 = 기본 수수료(`usage_fee_remittance` 금액) + 추가 매출 수수료. 팀장 화면(입금 안내)과 관리자 정산 화면에 `기본 수수료 / 추가 매출 수수료 / 총 입금액(부가세 포함)` 을 나눠 표시한다. 관리자 화면에는 공급가·부가세 내역도 함께 보여 준다. 팀장은 총합으로 한 번만 입금한다.
- **고객 화면에는 추가 매출 항목과 합계만** 보인다. 수수료율·본사 수수료·팀장 몫은 **절대 노출 금지**(함수의 반환 열도 호출자 역할별로 분리).
- 딜러는 접근 금지(딜러와 팀장은 서로의 정보를 못 본다는 원칙).

## 2. 이미 있는 '부가수입' 기능과의 통합 (중복 금지)
조사 결과(코드로 확인됨):
- 표 `additional_income_items`(운영 0행): `id, case_id, created_by, item_name, quantity, unit_price, total_price, receipt_url, created_at`. 정책: 선택은 관리자 또는 `is_case_manager(case_id)`, 삽입은 `created_by = auth.uid()`, 삭제도 본인.
- 사건 컬럼: `funeral_cases.additional_income_total`, `additional_income_rate`, `additional_income_settled`.
- 화면: `src/components/teamleader/ProgressReportModal.jsx` 하단 "💰 부가수입 항목" 섹션(항목 입력·삭제, `in_progress` 에서만). 본사 쪽 `src/components/admin/SettlementManager.jsx` 의 `handleSettleAdditionalIncome`(본사가 비율을 prompt 로 받아 **팀장에게 (100−비율)%를 지급**하는 방식), 팀장 지갑 `src/components/team/MyWallet.jsx` 에 `additional_income_*` 참조.
- 발견된 결함: ① `settlements.type` CHECK 목록에 `additional_income` 이 없어 위 본사 정산 확정이 실제로는 실패한다. ② `additional_income_items` 합계를 `funeral_cases.additional_income_total` 로 맞추는 트리거가 없다.
- **광수 결정: 기존 방식(본사가 팀장에게 지급)은 폐기하고, 새 방식(팀장이 본사에 수수료 납부)만 쓴다.**

해야 할 일:
1. 새 표를 만들지 말고 **`additional_income_items` 를 확장**한다: `description text`(≤1000자), `photo_urls text[] NOT NULL DEFAULT '{}'`(최대 10장 CHECK), `is_cancelled boolean NOT NULL DEFAULT false`, `cancelled_at timestamptz`, `updated_at timestamptz`. 단가≥0, 수량≥1 CHECK 를 건다. `created_by` 는 INSERT 때 서버에서 `auth.uid()` 로 강제한다(트리거 또는 정책). RLS 를 이 요구에 맞게 다시 쓴다:
   - 담당 팀장(`funeral_cases.team_leader_id = auth.uid()`)만 INSERT/UPDATE(취소 표시 포함), **사건 status 가 `in_progress` 일 때만**. 하드 DELETE 는 금지(취소 표시로 대체).
   - 관리자: 전체 SELECT.
   - 고객: 자기 사건(`funeral_cases.customer_id = auth.uid()`) 읽기 전용, 취소 항목은 제외.
   - 딜러·익명: 접근 불가(권한 회수).
2. **합계 자동 반영 트리거**: 항목이 INSERT/UPDATE/DELETE 될 때마다 `funeral_cases.additional_income_total` 을 `취소 제외 SUM(unit_price × quantity)` 로 갱신한다. (`total_price` 는 생성 열이 아니면 같은 값으로 유지)
3. **수수료 정산 행**: `settlements.type` CHECK 에 `extra_sales_fee` 를 **추가**한다(기존 허용 목록 `dealer_commission, customer_cashback, leader_fee, master_fee, flower_cost, override_fee, usage_fee_remittance, dealer_override, leader_override` 는 그대로 유지하고 하나만 더한다. `additional_income` 은 쓰지 않으니 넣지 않는다). 사건당 1행: `recipient_id = 사건의 team_leader_id`, `type='extra_sales_fee'`, `amount = fee(포함가)`, `tax_type='vat_10'`, `base_amount`/`tax_amount` 는 위 분리 함수 값, `net_amount = fee`, `status='draft'`. 기존 `usage_fee_remittance` 행과 같은 방식이다. `unique_settlement_per_case` 제약이 (case_id, type) 계열인지 **먼저 조사**하고, 종류만 다르면 충돌하지 않는지 확인한다(충돌하면 임의로 바꾸지 말고 이유와 대안을 보고).
4. **갱신 규칙**: 항목 변경 후 위 행을 upsert 한다. 합계가 0 이 되면 행을 삭제한다(선택 후 보고). **그 사건의 정산이 확정·지급 단계 이상이면(status 가 `draft` 가 아니면) 추가 매출 등록·수정·취소 자체를 막는다**(한국어 오류: "정산이 확정되어 수정할 수 없습니다"). 사건이 `in_progress` 가 아니어도 막는다.
5. **장례 종료 시 확정**: 팀장이 '장례 종료(정산 요청)' 를 누르면 사건이 `in_progress → team_settling` 으로 가고 정산 `draft → awaiting_payment` 로 바뀐다(`TeamLeaderDashboard.jsx` 약 345~358줄). 이때 `extra_sales_fee` 행도 같이 `awaiting_payment` 가 되도록 하고(이 행이 없으면 아무것도 하지 않는다), 그 뒤에는 잠긴다. 본사 '입금 확인'(`SettlementManager.jsx` 약 403~441줄, `usage_fee_remittance` 를 `paid` 로 하고 사건을 `hq_check` 로 보냄)이 **`extra_sales_fee` 행도 함께 `paid` 처리**하도록 고친다. 사건이 `completed` 로 가는 조건("모든 정산이 paid", 약 455~464줄)이 깨지지 않게 한다.
6. **기존 부가수입 본사 확정 방식 폐기**: `SettlementManager.jsx` 의 `handleSettleAdditionalIncome` 와 그 배너('부가수입 정산 대기' 영역, `fetchPendingIncomes` 등)를 제거하거나 숨긴다. `MyWallet.jsx` 의 `additional_income_*` 표시는 새 모델(추가 매출 합계·수수료·팀장 몫)로 바꾼다. 다른 기능이 깨지지 않게 참조를 모두 `grep` 으로 확인한다.

## 3. 사진 저장
- 기존 업로드 패턴을 조사한다(`ProgressReportModal.jsx` 약 269~290줄은 `reports` 버킷 사용, `Profile.jsx` 는 `profiles` 버킷). **두 버킷은 모두 공개(public)** 다.
- 추가 매출 사진은 고객·팀장·관리자만 보게 **비공개 버킷 `case-extra-photos`** (public=false, 이미지 jpeg/png/webp 만, 파일당 5MB, 한 항목 최대 10장)를 SQL 로 만든다. 경로는 `<case_id>/<파일명>`. `storage.objects` RLS: 업로드는 해당 사건의 담당 팀장만, 읽기는 해당 사건의 팀장·고객·관리자(서명 URL 로 열람). 정책 이름은 `case_extra_photos_*` 로 한다.
- 클라이언트에서 이미지 압축은 `Profile.jsx` 의 기존 압축 방식을 재사용한다.
- 버킷 정책 정의에서 `qual`(USING)이 없는 INSERT 정책은 `with_check` 를 읽어야 한다(시험할 때 `COALESCE(qual,'') || COALESCE(with_check,'')`).

## 4. 화면
- **팀장**: `ProgressReportModal.jsx` 의 기존 '💰 부가수입 항목' 섹션을 **'추가 매출'** 로 바꾸고 확장한다(이름 변경, 설명·사진 여러 장·취소 버튼 추가). 위치(진행 보고 화면 하단)는 유지. 목록(품목·수량·단가·소계·사진 썸네일), 합계, 예상 수수료(부가세 포함 표기), 팀장 몫을 보여 준다. `in_progress` 가 아니면 읽기 전용.
- **팀장 입금 안내**: 장례 종료 후 입금 안내 영역(`TeamLeaderDashboard.jsx`, `team_settling` 카드)에 `기본 수수료 / 추가 매출 수수료(부가세 포함) / 총 입금액` 표시.
- **관리자**: `SettlementManager.jsx` 정산 상세에 `extra_sales_fee` 행의 종류 라벨 '추가 매출 수수료', 포함가·공급가·부가세 표시(기존 라벨 매핑 위치를 먼저 찾는다). 사건 상세(`CaseDetailModal`)에서는 추가 매출 목록·합계를 읽기로 표시. 관리자 수수료 설정 화면 `src/components/admin/CommissionSettings.jsx` 에 한 줄 **'추가 매출 수수료(%)'** (`extra_sales_fee_rate`) 추가 — 열이 아직 DB 에 없을 때 저장이 깨지지 않게 이미 있는 `s_*` 열 폴백 방식을 그대로 따른다.
- **고객**: `CustomerStatus.jsx` 에 항목·합계만 읽기 전용(수수료 문구 금지).
- 모든 문구는 쉬운 한국어. **DB 에 새 열·표가 아직 없을 때(SQL 적용 전 웹 배포)도 화면이 깨지거나 오류 팝업이 뜨지 않게** 섹션을 조용히 숨기는 폴백을 넣는다.

## 5. 설정 열
`commission_policies.extra_sales_fee_rate numeric(5,2) NOT NULL DEFAULT 50 CHECK (extra_sales_fee_rate BETWEEN 0 AND 100)` 를 `ADD COLUMN IF NOT EXISTS` 로 추가한다. 이미 있는 3개 정책 행(id 1 기본형, id 2 고급형, id 3 무빈소)이 모두 50 이 된다.

## 6. 파일과 시험 하니스 (규칙이 까다롭다)
- SQL 파일: `_sql_admin_dealer/P15_추가매출.sql` (멱등, 맨 위에 목적·**되돌리기**·적용 순서 주석. 화면을 먼저 배포해도 안전한 순서도 명시).
- 예행연습 하니스는 `_sql_admin_dealer/_시험/` 아래에 있다. 한 개의 큰 `DO $dry$ ... $dry$` 블록을 만들고 마지막에 `RAISE EXCEPTION 'DRYRUN_RESULT'` 로 전부 롤백한다.
  - `src/00_head.sql`: 변수 선언. 맨 끝의 `v_apply_N boolean := false;` 다음 번호(현재 `v_apply_27` 까지 있음 → `v_apply_28`)를 추가.
  - `src/10_apply.sql`: 적용 블록. P18 블록 바로 뒤, **맨 아래 P1d(계좌 열 삭제) 앞**에 넣는다. 형식은 기존 블록을 그대로 복사한다: `BEGIN` / `-- @@INCLUDE ../../P15_추가매출.sql` / `v_apply_28 := true; v_result := v_result || E'\n[PASS] apply P15 ...';` / `EXCEPTION WHEN OTHERS THEN v_result := v_result || E'\n[FAIL] apply P15: ' || SQLERRM; END;`
  - `src/20_tests.sql`: 파일 **맨 끝**에 시험 블록 추가(기존 P17·P18 블록이 형식 예시).
  - 합본 만들기: `node _sql_admin_dealer/_시험/build_all_dryrun.mjs` → `ALL_DRYRUN.sql` 재생성. (이 합본을 실행하는 것은 호출자가 한다. 직접 DB 에 실행하지 않는다.)
- **하니스 함정(이미 겪은 실수, 반복 금지):**
  1. `@@INCLUDE` 된 SQL 은 plpgsql `BEGIN…END` 안에 인라인된다. 따라서 P15 파일에 **중첩 `DO $x$…$x$;` 블록을 쓰지 마라**(구문 오류). 필요하면 함수 정의 + 하니스에서 `PERFORM` 으로 호출.
  2. plpgsql 에서 `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` 문을 쓰지 마라(구문 오류). 필요하면 `BEGIN … EXCEPTION WHEN … END` 하위 블록을 쓴다.
  3. `::regprocedure` 는 인자 목록이 필요하다(`'f(uuid)'::regprocedure`). 함수 이름만 비교할 때는 `::regproc` 또는 `pg_proc` 조회.
  4. 표준 문자열(`'...'`)에서 `'\\.'` 은 "백슬래시 + 임의 문자"다. 정규식 대신 `LIKE`/`ILIKE`/`position()` 을 쓴다.
  5. 시험 파일 안 정규식으로 한국어 열 이름을 검사하는 것은 괜찮지만 `~*` 패턴 안의 백슬래시는 위 4번과 같다.
  6. 트리거가 외부 HTTP(웹훅)를 호출하면 안 된다. 하니스 머리에서 알림 트리거 2개(`funeral-case-alert`, `profile-signup-alert`)는 이미 임시 비활성화된다. 새 트리거는 DB 안에서만 동작해야 한다.
  7. `calculate_settlements` 는 `funeral_cases` 의 BEFORE UPDATE 트리거로, `status` 가 `in_progress` 로 바뀔 때 정산 행을 만든다. 시험에서는 사건을 `requested` 로 INSERT 한 뒤 `UPDATE ... SET status='in_progress'` 로 정산을 만든다. `is_private=true` 인 사건은 INSERT 때 이미 `in_progress` 라 정산이 안 만들어진다(이 기능과 무관).
- **시험은 반드시 '기대값을 직접 계산해서 정확히 비교'한다.** "값만 출력하고 PASS" 금지, "0 이상이면 PASS" 같은 느슨한 조건 금지. 운영 데이터(현재 사건 0건·정산 0건)에 의존하는 시험은 쓸모가 없으므로, 시험 안에서 기존 행을 UPDATE 해 필요한 상황을 만들어라. 참고할 좋은 예: `src/20_tests.sql` 의 `P13` 블록(정산 금액 정확 비교)과 `P18` 블록(계층을 직접 만든 뒤 정확한 건수 비교).
- 시험 항목(모두 정확한 기대값 비교):
  1. `commission_policies` 의 `extra_sales_fee_rate` 를 **낯선 값(예: 37)** 으로 바꾸고, 여러 항목(단가·수량 다름, 취소 1건 포함)의 합계·수수료·공급가·부가세·팀장 몫이 직접 계산한 값과 일치. 고급형(정책 id 2)에는 다른 비율(예: 41)을 넣어 패키지별로 다르게 적용되는지.
  2. 항목 수정·취소 후 `extra_sales_fee` 정산 행의 `amount/base/tax/net` 이 즉시 갱신되고, 합계 0 이면 행이 없어짐. 사건당 `extra_sales_fee` 행은 항상 0 또는 1개.
  3. 장례 종료(`team_settling`)·`awaiting_payment`·`paid` 이후 등록·수정·취소가 거부되고(예외 메시지 확인), 사건이 `in_progress` 가 아니어도 거부.
  4. 역할별 권한: 담당 팀장 등록·수정·취소 가능, 다른 팀장 불가, 딜러 SELECT 0행·INSERT 거부, 고객은 자기 사건만 SELECT(취소 항목 제외)·INSERT 거부, 타인 고객 0행, 관리자 전체 읽기, 익명 거부. (역할 흉내: `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', json_build_object('sub', <uuid>::text, 'role','authenticated')::text, true)` + `set_config('request.jwt.claim.sub', <uuid>::text, true)`, 끝나면 `RESET ROLE` 과 두 `set_config` 를 빈 문자열로.)
  5. **기존 정산 불변**: 추가 매출 등록 전후로 같은 사건의 기존 정산 행(`usage_fee_remittance`, `dealer_commission` 등)의 집합이 동일.
  6. 고객 역할의 합계 조회 함수 반환 열에 수수료·비율·팀장 몫이 없음(열 이름 정적 검사).
  7. 비공개 버킷 정책 정의(`pg_policies` 의 `storage.objects`, 정책 이름 `case_extra_photos_*`)가 존재하고 버킷 이름·사건 경로 조건을 담고 있음.
  8. 입금 합산: `usage_fee_remittance` 금액 + `extra_sales_fee` 금액 = 화면용 총 입금액 함수/값과 일치.
- 화면 점검: `bash _sql_admin_dealer/_시험/ssr_smoke.sh`(셸 허용 시)에 새 컴포넌트를 포함해 렌더 오류가 없게 한다. 새로 쓰는 `select` 문자열은 `rest_smoke.sh` 에 추가한다(PostgREST 열 이름·임베드가 맞는지).

## 7. 문서
- `_docs/추가매출_세무확인사항.md`: 추가 매출 수수료의 부가세 포함 처리, 팀장 면세사업자라 매입세액 공제 불가, 공급가/부가세 분리 기준(반올림 방식)을 **세무사 확인 필요 사항**으로 기록.
- 작업 마지막에 변경한 파일 목록, 만든 SQL 객체 목록, 못 한 것·확신이 없는 것, 광수에게 확인할 점을 보고한다.

## 8. 완료 기준 체크리스트
- [ ] `calculate_settlements` 본문 무변경 (`git diff` 로 확인)
- [ ] 금액·비율 하드코딩 없음 (`grep -n "1.1\|50"` 로 새로 추가된 코드 확인; `1.1` 은 분리 함수 한 곳에만)
- [ ] 새 FK 는 `profiles(id)` 만 (partners 참조 없음)
- [ ] 고객 화면과 고객용 함수에 수수료 정보 없음
- [ ] 적용 전 웹 배포에도 화면이 깨지지 않는 폴백
- [ ] `npm.cmd run build` 통과, `ALL_DRYRUN.sql` 재생성
- [ ] 시험이 정확한 기대값 비교이며 운영 데이터에 의존하지 않음

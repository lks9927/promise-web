# RLS / 장례 등록 함수 SQL 초안 (2026-10-20)

**아직 어떤 DB에도 적용하지 않은 초안이다.** 적용은 사용자가 Supabase SQL Editor에서 확인 후 실행한다.
근거: 2026-10-20 운영 DB(`pfwiaaxkgwhdjpdjlwjd`) 읽기 전용 조회(컬럼, 함수, 트리거, 정책)와 코드 전수 조사.

## 적용 순서

| 순서 | 파일 | 하는 일 | 동작 변화 |
|---|---|---|---|
| 1 | `01_prerequisites.sql` | 관리자/장례 담당 판별 도우미, 정산 계산 트리거를 DEFINER 로 | 없음 |
| 2 | `03_submit_emergency_case_v2.sql` | 장례 등록 함수 보강 (쿠폰 검증, 중복 방지, 딜러 변조 방지) | 아래 참조 |
| 3 | `02_rls_phase1.sql` | 6개 테이블에 RLS | 로그인 없는 접근이 없는 테이블만 |
| 4 | `04_indexes.sql` | 인덱스 (선택) | 없음 |
| 되돌리기 | `99_rollback_phase1_rls.sql` -> `98_rollback_function_changes.sql` | RLS 끄기 -> 함수 원복 | |

각 파일은 한 번에 하나씩 실행하고, 실행마다 아래 확인을 한다. SQL Editor 에서 **파일 전체를 붙여넣어 한 번에 실행**한다
(`begin; ... commit;` 이 있는 파일은 실패하면 전부 취소된다).

## 1단계 RLS 대상 (6개)

`deposits`, `payout_requests`, `tax_invoices`, `bidding_history`, `settlements`, `flower_orders`

코드 조사 결과 이 6개는 로그인한 사용자만 브라우저에서 접근하고, 앞 4개는 브라우저 접근이 아예 없다.
서버(서비스 키), 트리거와 DEFINER 함수는 RLS 를 우회한다.
정산은 관리자가 아닌 사용자가 `status` 외의 열(금액, 수령자, 메모)을 직접 바꾸지 못하게 트리거로 막는다.

## 장례 등록 함수 보강 내용 (03)

| 문제(현재 운영 함수) | 보강 |
|---|---|
| 없는 쿠폰/이미 쓴 쿠폰으로도 접수됨 | 쿠폰 존재/미사용 확인. 사용된 쿠폰이라도 같은 번호 접수가 있으면 그 건을 돌려줌 |
| 같은 링크를 또 누르면 접수가 또 생김 | 쿠폰 없는 접수는 같은 번호+장소+상품+딜러로 10분 안이면 기존 건을 돌려줌 |
| 남의 딜러 ID 를 넣어 실적 귀속 변조 가능 | 딜러 지정은 로그인한 본인/관리자만, 대상은 딜러·팀장·master 만 |
| 입력 길이/횟수 제한 없음 | 이름 50, 연락처 9~13자리, 장소 200, 상품 100자. 같은 번호 1시간 5건 이상 거부 |

**일부러 넣지 않은 것**: 전체 호출 횟수 제한. 익명 한 명이 한도를 채우면 정상 고객 접수까지 막히기 때문이다.
대량 호출 방어는 서버 앞단(IP 제한, CAPTCHA)이 맞다.

화면 코드는 바꾸지 않는다(인자와 반환값 동일). 단, 오류 문구가 한국어로 오므로 화면이 오류 메시지를 그대로 보여 주는지는 적용 후 확인한다.

## 적용 후 확인 (테스트 번호/쿠폰으로, 실제 가입자 데이터 말고)

01 적용 후: `select proname, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('calculate_settlements','is_admin','is_case_manager');` 가 모두 `true`.

03 적용 후 (파일 맨 아래 5가지 시나리오). 특히 **홈 화면의 장례 접수 버튼**과 **쿠폰 링크 접수**가 여전히 되는지 직접 눌러서 확인.

02 적용 후:
1. 관리자 로그인 -> 정산 화면이 열리고 정산 상태를 바꿀 수 있다.
2. 팀장 로그인 -> 장례 상태를 `team_settling` 으로 바꾸면 해당 정산이 `awaiting_payment` 로 바뀐다.
3. 팀장/딜러 로그인 -> 내 정산(내 지갑)이 보인다. 남의 정산은 안 보인다.
4. 팀장이 새 장례를 `in_progress` 로 바꿀 때(정산 초안 자동 생성)가 에러 없이 된다. **이게 01 의 DEFINER 전환이 필요한 이유다.**
5. 문제가 있으면 바로 `99_rollback_phase1_rls.sql`.

## 2단계 (코드 수정이 먼저 필요) - 나머지 6개 테이블

`profiles`, `funeral_cases`, `coupons`, `partners`, `notifications`, `system_config`

지금 켜면 아래 **로그인 없는(anon) 화면**이 멈춘다. 먼저 안전한 서버 함수(RPC)로 바꾸는 코드 작업이 필요하다.

| 화면 | 현재 직접 접근 | 바꿀 방향 |
|---|---|---|
| 홈, 쿠폰 링크 | `coupons` 를 코드로 직접 조회 (`select('*')`) | 필요한 열만 돌려주는 RPC |
| `/mypage` 고객 상태 | `funeral_cases` 를 localStorage ID 로 조회, `coupons` 조회/수정 | 고객 상태 RPC, 쿠폰 사용 RPC |
| `/delivery/:id` 배송기사 | 주문 -> 장례 정보 join, `notifications` insert | 배송 정보 RPC, 알림 RPC |
| 로그인의 "비밀번호 초기화 요청" | `profiles` 이름+전화 조회와 플래그 update | 요청 RPC (결과는 항상 같은 응답) |
| 홈 상품/하단 정보 | `system_config` 공개 읽기 | 공개 허용 키만 화이트리스트 |
| 고객 알림 | `notifications` 읽기/수정(Auth 없는 고객) | RPC 또는 고객 Auth 도입 |
| 파트너 가입(`/apply`) | `signUp` 직후 `profiles`/`partners` insert | 이메일 확인 설정 확인 후 본인 행 insert 정책 |

그다음에 `profiles`(본인/master의 하위/관리자), `funeral_cases`(딜러/팀장/master/관리자별), `partners` 정책을 쓴다.
팀장 화면이 요청 건을 DB 에서 전부 읽고 브라우저에서 거르는 부분, Realtime 구독도 함께 손봐야 한다.

## 별도로 급한 것 (12개 테이블 밖)

정책이 `USING true`(누구나 허용)인 테이블이 더 있다. 특히 **`commission_policies`: 누구나 UPDATE 가능**
(수수료 정책을 아무나 바꿀 수 있다). 그 밖에 `deliveries`, `orders`, `order_items`, `delivery_drivers`,
`vendor_products`, `vendors`, `custom_packages`, `additional_income_items`, `funeral_progress_reports`(읽기).
이번 12개 작업과 별개로 다음에 정리한다.

## 알려진 한계

- 이 초안은 **DB 에 실행해 보지 않았다.** 문법은 별도 검토(Codex 2회)로 확인했지만 실제 적용 전 테스트가 필요하다.
- `settlements` 의 열 제한 트리거는 "관리자가 아닌 직접 호출"만 막는다. 금액을 바꾸는 별도 DEFINER 함수가 있다면 그 경로는 막지 못한다.
- 모든 DEFINER 함수에 `search_path` 고정이 있는 것은 아니다(이 초안은 새로 만들거나 고친 함수에만 적용).
- `funeral_cases.status = 'settled'` 로 바꾸는 코드(`MyWallet.jsx:84`)가 있는데, DB 의 상태 CHECK 제약에 `settled` 가 없다(기존 버그로 보임). 이번 작업과 별개.

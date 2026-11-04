# 관리자·딜러 통합 DRYRUN

`node build_all_dryrun.mjs`는 `src` 파일명 순서대로 읽고, `-- @@INCLUDE 경로` 줄만 해당 SQL 원문으로 치환해 `ALL_DRYRUN.sql`을 만듭니다. 빌더는 SQL 본문을 JavaScript 문자열로 보유하지 않습니다.

실행본은 하나의 `DO $dry$ ... END $dry$;` 블록입니다. `BEGIN`/`COMMIT`/`ROLLBACK` 문장을 별도로 보내지 마십시오. 마지막 `RAISE EXCEPTION`의 첫 결과 줄이 PASS/FAIL/SKIP 합계이며, 예외로 끝나므로 블록에서 한 모든 DDL/DML과 알림 트리거 비활성화가 되돌아갑니다.

시작 직후 `funeral_cases`의 `funeral-case-alert`와 `profiles`의 `profile-signup-alert`를 비활성화하고 `pg_trigger.tgenabled` 값을 결과에 기록합니다. 따라서 실제 문자·푸시 발송을 막습니다. 실행 중 `partners`, `funeral_cases`, `profiles`에 수 초 단위의 DDL/DML 잠금이 있을 수 있습니다.

## 포함 범위

- P1a~P1f, P1i, P2a(계층/S 조회/RLS), P3a/P3b, P4 지역 알림과 마지막 P1d 기존 계좌 열 제거
- P1h는 승인되지 않은 제안 SQL을 적용하지 않고 현재 `profiles` RLS 정책 수를 기록합니다.
- 시험 데이터는 기존 customer/approved leader/partner 행만 재사용합니다. `profiles`나 `auth.users` 시험 행을 만들지 않습니다.
- 실제 흐름은 접수 INSERT → `in_progress` → `cancelled`까지 실행하며 정산 초안·취소를 확인합니다. 권한 시험은 `SET LOCAL ROLE authenticated`와 claims 설정 뒤 모든 정상/예외 경로에서 `RESET ROLE` 및 claims 초기화를 합니다.
- P4는 `off`의 기존 동작 보존과 `sigungu` 활성 경로를 실제 필터 함수로 확인합니다. 외부 호출은 이 DRYRUN에서 하지 않습니다.

P4 원본 `submit_emergency_case` 함수 본문에는 고객이 없을 때 `public.profiles`에 삽입하는 운영 경로가 있습니다. 이 DRYRUN은 그 RPC를 호출하지 않으며 시험 데이터 삽입은 0건입니다. 따라서 전체 생성본에서 해당 문자열이 발견되면 이는 P4 적용 원문의 비실행 함수 본문이며, 시험 데이터 생성 위반이 아닙니다.

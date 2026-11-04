# P3b 배정 후보 변경점

| 기준선 파일 줄 | 함수 | 기존 판정 | 변경 판정 | 영향 |
|---:|---|---|---|---|
| 178 | `is_master_leader` | `p.master_id IS NULL` | `p.grade IN ('Master','S')` | S 하위 Master 팀장도 마스터 팀장으로 판정 |
| 224 | `auto_assign_first_bidder` 비상 후보 | `p.master_id IS NULL` | `p.grade IN ('Master','S')` | 대기 후보가 없을 때 S 하위 Master 팀장도 후보 |
| 293 | `find_next_bidder` 3차 비상 후보 | `p.master_id IS NULL` | `p.grade IN ('Master','S')` | 다음 입찰자 비상 탐색에도 동일 적용 |

`submit_emergency_case`, `notify_emergency_dispatch`에는 기준선에서 `master_id IS NULL` 조건이 없어 변경하지 않았다. 일반 팀장(C)의 후보 규칙은 변경하지 않는다.

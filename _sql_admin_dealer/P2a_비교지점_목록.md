# P2a 비교 지점

- 가입 기본값은 C, 상위 없음이다.
- `is_my_report`는 재귀화하지 않는다. S 하위 조회는 별도 `s_downline_overview()`만 사용한다.
- `partners_select`의 직속 상위 조회는 P2a RLS 적용본에서 Master→S 행과 S 프로필을 제외한다.
- `13_fix_dispatch_hierarchy.sql`, `15_fix_dispatch_hierarchy_correctly.sql`, `calculate_settlements`는 수정하지 않는다.
- 운영 DB에는 S 사용자가 없고 기존 마스터는 Master라는 전제는 DRYRUN으로 재확인한다.

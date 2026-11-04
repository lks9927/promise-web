# P2a 상위 조회 점검

`partners_select` 초안은 본인, 직속 하위(`master_id = auth.uid()`), 직속 상위(`is_my_master(user_id)`)를 허용한다. C의 직속 Master 조회는 유지한다. Master는 S 직속 상위의 partner 행도 볼 수 있으므로 적용 SQL에서 그 행과 프로필 행을 제외한다.

`has_s_parent()`는 UI용 불리언만 반환한다. 적용 전 DRYRUN으로 실제 정책명이 `partners_select`/`profiles_select`인지 확인해야 한다. 추가 permissive profiles 정책이 있으면 별도 제한 없이는 차단이 무효다.

영향: Master 화면의 직속 C 조회, 배정, 알림, 정산은 이 파일이 직접 바꾸지 않는다. S의 프로필 조인을 하던 화면은 빈 표시가 될 수 있어 배포 전 확인이 필요하다.

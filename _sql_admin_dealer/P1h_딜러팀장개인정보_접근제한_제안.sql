-- profiles는 고객/업체 기능도 공유하므로 일괄 RLS 변경은 기존 동작을 깨뜨릴 수 있다.
-- p1h 본 적용은 프론트 조회 열을 team_leader_id로 축소했다.
-- 아래 SQL은 운영 RLS 정책을 DRYRUN으로 검토한 뒤 별도 승인에서만 구체화한다.
SELECT '프론트 조회 최소화 적용. profiles 공용 RLS 변경은 별도 설계 필요' AS note;

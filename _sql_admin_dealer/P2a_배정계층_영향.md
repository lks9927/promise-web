# P2a 배정 계층 영향

S는 `master_id IS NULL`인 최상위 등급이고 S 아래에는 Master 또는 C, Master 아래에는 C만 올 수 있다. `calculate_settlements`와 배정 SQL은 변경하지 않는다.

현행 비상 후보 판정은 `master_id IS NULL AND profiles.role = 'leader'` 중심이다. 따라서 S 팀장은 후보가 될 수 있고 S 아래 Master 팀장은 제외될 수 있다. 일반 순번도 현행 한 단계 구조를 유지한다.

S 팀장/딜러의 일반 순번, 비상 배정, 알림 대상을 운영 배포 전 별도 시험한다.

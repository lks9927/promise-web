
-- ==========================================
-- 테스트용 스토리지 RLS 정책 수정 (프로토타입용 익명 업로드 허용)
-- ==========================================
DROP POLICY IF EXISTS "Users can upload reports" ON storage.objects;
CREATE POLICY "Users can upload reports"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'reports' );

DROP POLICY IF EXISTS "Users can update their reports" ON storage.objects;
CREATE POLICY "Users can update their reports"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'reports' );

-- ==========================================
-- 테스트용 실제 데이터 생성
-- 관리자: 최고관리자, 운영관리자 (총 2명)
-- 고객: 정치인 10명
-- 팀장: 연예인 10명 (마스터 3, 딜러 7)
-- 딜러: 스포츠스타 10명 (마스터 3, 딜러 7)
-- ==========================================

DO $$
DECLARE
    -- 관리자 UUIDs
    ad01 UUID := '11000000-0000-0000-0000-000000000001';
    ad02 UUID := '11000000-0000-0000-0000-000000000002';

    -- 팀장 (연예인) UUIDs
    tl01 UUID := '21000000-0000-0000-0000-000000000001';
    tl02 UUID := '21000000-0000-0000-0000-000000000002';
    tl03 UUID := '21000000-0000-0000-0000-000000000003';
    tl04 UUID := '21000000-0000-0000-0000-000000000004';
    tl05 UUID := '21000000-0000-0000-0000-000000000005';
    tl06 UUID := '21000000-0000-0000-0000-000000000006';
    tl07 UUID := '21000000-0000-0000-0000-000000000007';
    tl08 UUID := '21000000-0000-0000-0000-000000000008';
    tl09 UUID := '21000000-0000-0000-0000-000000000009';
    tl10 UUID := '21000000-0000-0000-0000-000000000010';

    -- 딜러 (스포츠스타) UUIDs
    dl01 UUID := '41000000-0000-0000-0000-000000000001';
    dl02 UUID := '41000000-0000-0000-0000-000000000002';
    dl03 UUID := '41000000-0000-0000-0000-000000000003';
    dl04 UUID := '41000000-0000-0000-0000-000000000004';
    dl05 UUID := '41000000-0000-0000-0000-000000000005';
    dl06 UUID := '41000000-0000-0000-0000-000000000006';
    dl07 UUID := '41000000-0000-0000-0000-000000000007';
    dl08 UUID := '41000000-0000-0000-0000-000000000008';
    dl09 UUID := '41000000-0000-0000-0000-000000000009';
    dl10 UUID := '41000000-0000-0000-0000-000000000010';

    -- 고객 (정치인) UUIDs
    cu01 UUID := '51000000-0000-0000-0000-000000000001';
    cu02 UUID := '51000000-0000-0000-0000-000000000002';
    cu03 UUID := '51000000-0000-0000-0000-000000000003';
    cu04 UUID := '51000000-0000-0000-0000-000000000004';
    cu05 UUID := '51000000-0000-0000-0000-000000000005';
    cu06 UUID := '51000000-0000-0000-0000-000000000006';
    cu07 UUID := '51000000-0000-0000-0000-000000000007';
    cu08 UUID := '51000000-0000-0000-0000-000000000008';
    cu09 UUID := '51000000-0000-0000-0000-000000000009';
    cu10 UUID := '51000000-0000-0000-0000-000000000010';
BEGIN

    -- 0. 관리자 (총 2명으로 제한)
    INSERT INTO profiles (id, email, role, admin_level, name, phone, password)
    VALUES 
    (ad01, 'masteradmin@test.com', 'admin', 'super', '최고관리자', '010-0000-0001', '1234'),
    (ad02, 'manager@test.com', 'admin', 'operating', '운영관리자', '010-0000-0002', '1234');

    -- 1. 팀장 (연예인 10명) 

    INSERT INTO profiles (id, email, role, name, phone, password, introduction, experience_years)
    VALUES 
    -- 마스터 팀장 (3명)
    (tl01, 'tl1@test.com', 'leader', '하정우 팀장', '010-1000-0001', '1234', '10년의 약속을 책임지는 하정우 마스터입니다.', 15),
    (tl02, 'tl2@test.com', 'leader', '황정민 팀장', '010-1000-0002', '1234', '진심을 다해 모십니다.', 12),
    (tl03, 'tl3@test.com', 'leader', '이병헌 팀장', '010-1000-0003', '1234', '가장 슬픈 날, 가족처럼 함께하겠습니다.', 10),
    -- 일반 팀장 (7명)
    (tl04, 'tl4@test.com', 'leader', '송강호 팀장', '010-1000-0004', '1234', '따뜻한 위로와 완벽한 의전.', 8),
    (tl05, 'tl5@test.com', 'leader', '정우성 팀장', '010-1000-0005', '1234', '유가족의 마음을 먼저 생각합니다.', 7),
    (tl06, 'tl6@test.com', 'leader', '이정재 팀장', '010-1000-0006', '1234', '정성을 다하는 장례.', 6),
    (tl07, 'tl7@test.com', 'leader', '공유 팀장', '010-1000-0007', '1234', '정확하고 투명하게 진행합니다.', 5),
    (tl08, 'tl8@test.com', 'leader', '현빈 팀장', '010-1000-0008', '1234', '빈틈없는 장례 서비스.', 4),
    (tl09, 'tl9@test.com', 'leader', '박서준 팀장', '010-1000-0009', '1234', '끝까지 곁을 지키겠습니다.', 3),
    (tl10, 'tl10@test.com', 'leader', '김수현 팀장', '010-1000-0010', '1234', '정성껏 모시겠습니다.', 2);
    
    INSERT INTO partners (user_id, master_id, region, grade, bank_account, status)
    VALUES 
    -- 마스터 급은 자신 소속 (master_id = NULL 이거나 자기자신)
    (tl01, NULL, '서울/강남구', 'Master', '국민은행 111-111-111', 'approved'),
    (tl02, NULL, '서울/서초구', 'Master', '결제은행 222-222-222', 'approved'),
    (tl03, NULL, '서울/송파구', 'S', '신한은행 333-333-333', 'approved'),
    -- 일반 팀장들은 하정우(tl01)나 다른 마스터 팀장 소속
    (tl04, tl01, '부산/해운대구', 'A', '농협 444-444-444', 'approved'),
    (tl05, tl01, '대구/수성구', 'A', '카카오뱅크 555-555-555', 'approved'),
    (tl06, tl02, '인천/연수구', 'B', '토스뱅크 666-666-666', 'approved'),
    (tl07, tl02, '광주/서구', 'B', '우리은행 777-777-777', 'approved'),
    (tl08, tl03, '대전/유성구', 'B', '기업은행 888-888-888', 'approved'),
    (tl09, tl03, '울산/남구', 'C', '케이뱅크 999-999-999', 'approved'),
    (tl10, tl01, '경기/성남시', 'C', '외환은행 000-000-000', 'approved');

    -- 2. 딜러 (스포츠스타 10명)
    -- 손석구, 마동석은 특별히 요청하셨으므로 딜러에 포함
    INSERT INTO profiles (id, email, role, name, phone, password)
    VALUES 
    -- 마스터 딜러 (3명: master 권한 부여 시 마스터 딜러 대시보드 접근)
    (dl01, 'dl1@test.com', 'master', '손흥민 딜러', '010-2000-0001', '1234'),
    (dl02, 'dl2@test.com', 'master', '손석구 딜러', '010-2000-0002', '1234'),
    (dl03, 'dl3@test.com', 'dealer', '마동석 딜러', '010-2000-0003', '1234'),
    -- 일반 딜러 (7명)
    (dl04, 'dl4@test.com', 'dealer', '김연아 딜러', '010-2000-0004', '1234'),
    (dl05, 'dl5@test.com', 'dealer', '류현진 딜러', '010-2000-0005', '1234'),
    (dl06, 'dl6@test.com', 'dealer', '이강인 딜러', '010-2000-0006', '1234'),
    (dl07, 'dl7@test.com', 'dealer', '김민재 딜러', '010-2000-0007', '1234'),
    (dl08, 'dl8@test.com', 'dealer', '박지성 딜러', '010-2000-0008', '1234'),
    (dl09, 'dl9@test.com', 'dealer', '추신수 딜러', '010-2000-0009', '1234'),
    (dl10, 'dl10@test.com', 'dealer', '페이커 딜러', '010-2000-0010', '1234');
    
    INSERT INTO partners (user_id, master_id, region, grade, bank_account, status)
    VALUES 
    (dl01, NULL, '서울/강남구', 'Master', '하나은행 111-222', 'approved'),
    (dl02, NULL, '서울/종로구', 'Master', '국민은행 333-444', 'approved'),
    (dl03, dl01, '경기/수원시', 'S', '신한은행 555-666', 'approved'),
    (dl04, dl01, '인천/부평구', 'S', '우리은행 777-888', 'approved'),
    (dl05, dl01, '대전/서구', 'A', '기업은행 999-000', 'approved'),
    (dl06, dl02, '부산/수영구', 'A', '농협 111-333', 'approved'),
    (dl07, dl02, '대구/동구', 'B', '수협 444-555', 'approved'),
    (dl08, dl02, '광주/북구', 'B', '새마을 666-777', 'approved'),
    (dl09, dl02, '울산/중구', 'B', '우체국 888-999', 'approved'),
    (dl10, dl01, '제주/서귀포시', 'C', '신협 000-111', 'approved');

    -- 3. 고객 (정치인 10명)
    INSERT INTO profiles (id, email, role, name, phone, password)
    VALUES 
    (cu01, 'cu1@test.com', 'customer', '이재명 (상주)', '010-3000-0001', '1234'),
    (cu02, 'cu2@test.com', 'customer', '한동훈 (상주)', '010-3000-0002', '1234'),
    (cu03, 'cu3@test.com', 'customer', '조국 (상주)', '010-3000-0003', '1234'),
    (cu04, 'cu4@test.com', 'customer', '이준석 (상주)', '010-3000-0004', '1234'),
    (cu05, 'cu5@test.com', 'customer', '홍준표 (상주)', '010-3000-0005', '1234'),
    (cu06, 'cu6@test.com', 'customer', '오세훈 (상주)', '010-3000-0006', '1234'),
    (cu07, 'cu7@test.com', 'customer', '안철수 (상주)', '010-3000-0007', '1234'),
    (cu08, 'cu8@test.com', 'customer', '유승민 (상주)', '010-3000-0008', '1234'),
    (cu09, 'cu9@test.com', 'customer', '김동연 (상주)', '010-3000-0009', '1234'),
    (cu10, 'cu10@test.com', 'customer', '김종인 (상주)', '010-3000-0010', '1234');

    -- 4. 샘플 접수 건 생성
    INSERT INTO funeral_cases (id, customer_id, dealer_id, team_leader_id, status, location, package_name, final_price, funnel_type, coupon_code)
    VALUES 
    -- 1. 이재명 고객 (하정우 마스터팀장 담당, 손흥민 마스터딜러 모집)
    (gen_random_uuid(), cu01, dl01, tl01, 'in_progress', '서울아산병원 장례식장', '프리미엄 3일장', 4500000, 'partner_referral', 'WELCOME10'),
    -- 2. 한동훈 고객 (황정민 마스터팀장 담당, 본사유입)
    (gen_random_uuid(), cu02, NULL, tl02, 'team_settling', '삼성서울병원 장례식장', '노블레스 3일장', 6800000, 'organic_search', NULL),
    -- 3. 조국 고객 (송강호 팀장 담당, 김연아 딜러 모집)
    (gen_random_uuid(), cu03, dl04, tl04, 'completed', '세브란스병원 장례식장', '기본형 3일장', 3200000, 'partner_referral', NULL);

END $$;

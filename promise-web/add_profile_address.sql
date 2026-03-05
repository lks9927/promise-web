-- 팀장 자택주소 및 배송 특이사항 (공동현관 비밀번호 등) 추가
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS address_detail TEXT;

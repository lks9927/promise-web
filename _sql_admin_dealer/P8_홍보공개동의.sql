-- P8 팀장 본인 장례(기록용, is_private) 의 홍보 공개 동의 표시 칸 (사장님 결정 2026-11-04)
-- 유족이 보안(익명) 처리된 홍보 자료(진행 화면·블로그)로 쓰는 데 동의했는지 기록한다. 기본값 false(미동의).
-- 홍보 공개 기능 자체는 이번 범위 아님: 이 칸이 true 인 기록만 나중에 공개 후보가 된다.
-- 되돌리기: ALTER TABLE public.funeral_cases DROP COLUMN publicity_consent;
ALTER TABLE public.funeral_cases ADD COLUMN IF NOT EXISTS publicity_consent boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.funeral_cases.publicity_consent IS '유족의 홍보 자료 공개 동의(익명·보안 처리 전제). 팀장 본인 장례(is_private) 기록용에서 사용.';

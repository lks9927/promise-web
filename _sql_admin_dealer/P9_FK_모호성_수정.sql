-- P9 PostgREST 임베드 모호성(PGRST201) 수정 (2026-11-05)
-- 증상: partners 를 조회하며 profiles:user_id(...) 로 임베드하는 화면(관리자 파트너 목록 등)이 비어 보임.
-- 원인: 새로 만든 표(partner_grade_history, partner_bank_accounts, partner_alert_regions)가 partners(user_id) 를 FK 로 참조해
--       'user_id' 힌트가 여러 관계와 맞아 PostgREST 가 모호하다고 거부함.
-- 수정: 세 표의 FK 대상을 profiles(id) 로 바꾼다(의미는 같음: 파트너 id = 프로필 id, 삭제 동작 유지). partners(user_id) 를 참조하는 FK 가 없게 한다.
-- 되돌리기: 각 제약을 REFERENCES public.partners(user_id) 로 다시 만들면 되지만 같은 오류가 재발하므로 권장하지 않음.
ALTER TABLE public.partner_grade_history DROP CONSTRAINT IF EXISTS partner_grade_history_partner_id_fkey;
ALTER TABLE public.partner_grade_history ADD CONSTRAINT partner_grade_history_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id);
ALTER TABLE public.partner_bank_accounts DROP CONSTRAINT IF EXISTS partner_bank_accounts_partner_id_fkey;
ALTER TABLE public.partner_bank_accounts ADD CONSTRAINT partner_bank_accounts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.partner_alert_regions DROP CONSTRAINT IF EXISTS partner_alert_regions_partner_id_fkey;
ALTER TABLE public.partner_alert_regions ADD CONSTRAINT partner_alert_regions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

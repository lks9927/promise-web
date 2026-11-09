import { supabase } from './supabase';

/**
 * 대표마스터(S 등급) 하위 현황 조회
 * - 운영 DB에 s_downline_overview_v2() 가 있으면 v2 를 사용한다.
 * - v2 가 아직 없을 때(적용 전 배포)는 기존 s_downline_overview() 로 폴백하여
 *   화면이 깨지지 않게 한다.  폴백 시 v2 전용 열(소속마스터경로, 예비등록건수 등)은
 *   undefined 로 처리되므로 UI 에서 null-safe 렌더링 필요.
 *
 * 반환 데이터에는 고객·금액·연락처·사진 관련 열이 없다.
 */
export const fetchSDownlineOverview = async () => {
  // v2 먼저 시도
  const v2 = await supabase.rpc('s_downline_overview_v2');

  // 함수 미존재(42883) 또는 권한 없음(42501) 에러 → 기존 함수 폴백
  if (v2.error) {
    const code = v2.error.code;
    if (code === '42883' || code === 'PGRST202') {
      // v2 함수가 아직 없음 → 기존 함수 사용
      return supabase.rpc('s_downline_overview');
    }
    // 그 외 에러(예: 권한 없음)는 그대로 반환
    return v2;
  }

  return v2;
};

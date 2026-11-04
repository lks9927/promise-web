import { supabase } from './supabase';

/**
 * 대표마스터의 승격 요청 RPC 호출
 * @param {string} targetId 승격 대상 파트너 ID (UUID)
 * @param {string} reason 승격 사유
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function requestPromotion(targetId, reason) {
    return await supabase.rpc('request_partner_promotion', {
        p_target: targetId,
        p_reason: reason ?? '',
    });
}

/**
 * 관리자의 승격 심사(승인/거절) RPC 호출
 * @param {string} requestId 승격 요청 ID (UUID)
 * @param {boolean} approve 승인 여부 (true: 승인, false: 거절)
 * @param {string} [note=''] 심사 메모/사유
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function decidePromotion(requestId, approve, note = '') {
    return await supabase.rpc('decide_partner_promotion', {
        p_request: requestId,
        p_approve: approve,
        p_note: note ?? '',
    });
}

/**
 * 관리자의 승격 되돌리기(revert) RPC 호출
 * @param {string} requestId 승격 요청 ID (UUID)
 * @param {string} [note=''] 되돌리기 사유
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function revertPromotion(requestId, note = '') {
    return await supabase.rpc('revert_partner_promotion', {
        p_request: requestId,
        p_note: note ?? '',
    });
}

/**
 * 승격 요청 목록 조회 RPC 호출
 * @param {string|null} [status=null] 상태 필터 ('pending' | 'approved' | 'rejected' | 'reverted' | null)
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function listPromotionRequests(status = null) {
    const params = status && status !== 'all' ? { p_status: status } : { p_status: null };
    return await supabase.rpc('list_partner_promotion_requests', params);
}

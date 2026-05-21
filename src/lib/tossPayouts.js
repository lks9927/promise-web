/**
 * 토스 Payouts API를 통한 원천징수 송금
 * - 실제 연동 시 Supabase Edge Function으로 이동 필요 (secretKey 보호)
 * - 현재는 구조만 준비
 */

const TOSS_API_URL = 'https://api.tosspayments.com/v1/payouts';

export async function requestPayout({ 
    recipientName,      // 수령인 이름
    recipientAccount,   // 수령인 계좌번호
    bankCode,           // 은행코드
    amount,             // 실지급액 (3.3% 공제 후 금액)
    settlementId        // settlements 테이블 ID (참조용)
}) {
    // TODO: 토스 API 키 발급 후 활성화
    // 현재는 mock response 반환
    console.log('[Toss Payout] 준비됨 - API 키 미설정', { recipientName, amount, bankCode, recipientAccount, settlementId });
    
    return {
        success: false,
        message: '토스 API 키가 아직 설정되지 않았습니다.',
        mock: true
    };
    
    /* === 실제 연동 코드 (Edge Function에서 사용) ===
    const response = await fetch(TOSS_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${btoa(process.env.VITE_TOSS_SECRET_KEY + ':')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bankCode,
            accountNumber: recipientAccount,
            holderName: recipientName,
            amount,
            transferPurpose: '프리랜서_소득_지급'
        })
    });
    return await response.json();
    */
}

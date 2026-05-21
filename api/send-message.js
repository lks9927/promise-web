import { SolapiMessageService } from "solapi";

export default async function handler(req, res) {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { to, subject = '[10년의 약속 알림]', text, isAlimtalk = false } = req.body;

    if (!to || !text) {
        return res.status(400).json({ message: 'Missing "to" or "text" in request body' });
    }

    // 발송에 필요한 인증키 (보안상 Vercel 환경 변수에 입력 예정)
    const apiKey = process.env.VITE_SOLAPI_KEY || process.env.SOLAPI_KEY;
    const apiSecret = process.env.VITE_SOLAPI_SECRET || process.env.SOLAPI_SECRET;
    const fromNumber = process.env.VITE_SOLAPI_SENDER || process.env.SOLAPI_SENDER;

    if (!apiKey || !apiSecret || !fromNumber) {
        console.warn("SOLAPI 환경 변수가 세팅되지 않았습니다. 실발송 테스트 시 API 키를 넣어주세요.");
        // 환경 변수가 없을땐 에러를 던지기보단 200 OK와 로그를 남깁니다 (테스트 환경 호환성)
        return res.status(200).json({
            success: true,
            simulated: true,
            message: 'API Key missing. Simulated successful send.'
        });
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);

    try {
        const payload = {
            to: to.replace(/[^0-9]/g, ''), // 숫자만 추출 010-1234-5678 -> 01012345678
            from: fromNumber.replace(/[^0-9]/g, ''),
            subject,
            text,
            // 알림톡/문자 자동 판별을 위해 보통 LMS나 SMS로 전송 (알림톡은 kakaoOptions 필요)
            type: 'LMS'
            // 카카오 알림톡 템플릿 심사 후 아래 주석 해제하여 사용
            // kakaoOptions: isAlimtalk ? { pfId: '카카오톡채널아이디', templateId: '템플릿아이디' } : undefined
        };

        const response = await messageService.send(payload);

        return res.status(200).json({ success: true, result: response });
    } catch (error) {
        console.error("Solapi 발송 실패:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

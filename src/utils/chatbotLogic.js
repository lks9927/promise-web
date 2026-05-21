// src/utils/chatbotLogic.js

// 예상 질문-답변 및 매칭을 위한 형태소/키워드 데이터
const FAQ_DATA = [
    {
        id: "faq_settlement_date",
        intent: "정산 일정",
        keywords: ["정산", "언제", "입금", "돈", "들어와", "수수료", "지급", "날짜", "일정"],
        response: "정산은 [완료기안서 제출일] 기준으로 처리가 진행됩니다.\n• 1일~15일 제출 완료 → 당월 25일 지급\n• 16일~말일 제출 완료 → 익월 10일 지급\n\n지급일이 주말이거나 공휴일인 경우 다음 영업일에 지급됩니다."
    },
    {
        id: "faq_app_error",
        intent: "앱/오류 문의",
        keywords: ["오류", "에러", "안돼요", "작동", "멈춤", "버벅", "느림", "새로고침", "렉", "안눌러"],
        response: "이용에 불편을 드려 죄송합니다. \n일시적인 네트워크 오류이거나 브라우저 캐시 문제일 수 있습니다. \n먼저 화면 새로고침(F5)을 진행해 보시고, 계속 문제가 발생한다면 '상담원 연결'을 통해 관리자에게 화면 캡쳐와 함께 문의를 남겨주세요."
    },
    {
        id: "faq_branch_add",
        intent: "지점 추가 방법",
        keywords: ["하위", "지점", "딜러", "추가", "등록", "어떻게", "팀원", "가입", "초대"],
        response: "하위 지점(팀원) 추가는 '마스터' 등급 이상의 관리자만 가능합니다.\n하단 메뉴의 [지점 관리](또는 팀 관리) 메뉴로 들어가시면, 우측 상단에 [+ 딜러 추가] 버튼이 있습니다. 해당 버튼을 눌러 파트너의 이름과 연락처, 지역을 등록해 주세요."
    },
    {
        id: "faq_case_transfer",
        intent: "배정 취소/변경",
        keywords: ["배정", "취소", "변경", "거절", "못해", "다른", "사람", "이관", "잘못"],
        response: "이미 배정받은 접수 건을 취소하거나 다른 팀장님께 이관하셔야 할 경우, 앱 내에서는 임의 취소가 불가합니다.\n하단의 '상담원 연결' 버튼을 클릭하여 본사 관리자에게 [접수 번호]와 함께 배정 취소 사유를 남겨주시면 신속히 처리해 드리겠습니다."
    },
    {
        id: "faq_flower_order",
        intent: "근조화환 주문",
        keywords: ["꽃", "화환", "근조", "주문", "배달", "발송", "언제", "신청", "어디록"],
        response: "근조화환 주문은 [내 현황](마이 케이스) 탭에서 진행 중인 장례 건의 '화환 주문요청' 버튼을 통해 접수하실 수 있습니다.\n*배송을 위해 상가(장례식장)와 상주명 정보가 필수적으로 입력되어 있어야 합니다."
    }
];

// 가벼운 한글 조사 필터 (가중치 계산 방해 최소화)
const removeJosa = (text) => {
    // 매우 단순한 형태의 조사 치환 (현업용 라이브러리 대신 정규식 간이 체택)
    return text.replace(/(은|는|이|가|을|를|에|에서|부터|까지|에게|한테|와|과|도|면|잖아|요|다|까|되|안)\s/g, ' ');
};

export const getChatbotResponse = (userInput) => {
    if (!userInput || userInput.trim() === '') return null;

    // 1. 입력 문자열 정제 (특수문자 제거 및 소문자화, 띄어쓰기 기반 분리)
    const cleanedInput = userInput.replace(/[^\w\s가-힣]/g, ' ').toLowerCase();

    // 2. 입력된 텍스트에서 키워드 추출 (단순 띄어쓰기 기준 + 두글자 이상 토큰화)
    const rawTokens = cleanedInput.split(/\s+/).filter(t => t.length > 0);

    // 조사를 대충 잘라낸 토큰 추가 생성
    const refinedTokens = rawTokens.map(token => {
        if (token.length > 2) {
            return token.replace(/(은|는|이|가|을|를|에|로|으로|에서|도)$/, '');
        }
        return token;
    });

    const userTokens = [...new Set([...rawTokens, ...refinedTokens])];

    let bestMatch = null;
    let highestScore = 0;

    // 매칭 임계치 (최소한 키워드 1~2개 이상 겹치도록 점수 커트라인 설정)
    const THRESHOLD = 0.5;

    // 3. 각 FAQ 항목과 유사도 검사
    FAQ_DATA.forEach(faq => {
        let matchScore = 0;

        userTokens.forEach(token => {
            // FAQ의 keywords 배열 중 사용자의 토큰을 포함하고 있는 것이 있다면 점수 부여
            faq.keywords.forEach(keyword => {
                if (token.includes(keyword) || keyword.includes(token)) {
                    // 키워드 길이가 길수록(구체적일수록) 가중치 부여, 단 짧은 키워드(돈, 꽃)는 예외 처리
                    const weight = (keyword.length <= 2) ? 1.5 : 1.0;
                    matchScore += weight;
                }
            });
        });

        // 4. 최고 득점자 갱신
        if (matchScore > highestScore) {
            highestScore = matchScore;
            bestMatch = faq;
        }
    });

    if (bestMatch && highestScore >= THRESHOLD) {
        return {
            intent: bestMatch.intent,
            text: bestMatch.response,
            score: highestScore
        };
    }

    // 매칭 실패 시
    return null;
};

// 화면에 띄워줄 '기본 추천 버튼(카테고리)' 용 함수
export const getFAQCategories = () => {
    return FAQ_DATA.map(faq => faq.intent);
};

// 카테고리 버튼을 눌렀을 때의 확정 응답
export const getIntentResponse = (intentName) => {
    const match = FAQ_DATA.find(faq => faq.intent === intentName);
    return match ? match.response : "해당 카테고리를 찾을 수 없습니다.";
};

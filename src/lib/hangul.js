export const CHOSEONG = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 문자열에서 초성을 추출합니다.
 * @param {string} str - 입력 문자열
 * @returns {string} - 초성 문자열
 */
export function getChoseong(str) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 44032;
        if (code > -1 && code < 11172) {
            result += CHOSEONG[Math.floor(code / 588)];
        } else {
            result += str.charAt(i);
        }
    }
    return result;
}

/**
 * 검색어가 대상 문자열에 포함되는지 확인합니다 (초성 검색 지원).
 * @param {string} target - 대상 문자열 (예: "서울성모병원")
 * @param {string} search - 검색어 (예: "ㅅㅇㅅㅁ", "서울")
 * @returns {boolean} - 포함 여부
 */
export function matchHangul(target, search) {
    if (!target || !search) return false;

    // 공백 제거 및 정규화
    const t = target.replace(/\s+/g, '');
    const s = search.replace(/\s+/g, '');

    if (s.length === 0) return true;

    // 일반 검색 (문자열 포함 여부)
    if (t.includes(s)) return true;

    // 초성 검색
    const tCho = getChoseong(t);
    // 검색어에 한글 자음만 있는지 확인 (초성 검색 의도)
    const isChoseongSearch = /^[ㄱ-ㅎ]+$/.test(s);

    if (isChoseongSearch) {
        return tCho.includes(s);
    }

    return false;
}

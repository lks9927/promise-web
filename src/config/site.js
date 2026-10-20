// 사이트 주소의 단일 출처. 쿠폰/초대 링크와 화면 표시 주소가 모두 여기서 나온다.
// 한글 도메인(10년의약속.kr)으로 바꿀 때는 배포 환경변수 VITE_SITE_URL 값 하나만 바꾸면 된다.
// 문자(SMS) 링크는 일부 문자 앱이 한글 도메인을 링크로 인식하지 못할 수 있어 기본값은 영문 주소다.
export const SITE_URL = String(import.meta.env.VITE_SITE_URL || 'https://10promise.co.kr').replace(/\/+$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

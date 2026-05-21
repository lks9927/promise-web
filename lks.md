# lks.md — 10년의 약속 장기 메모리
> 이광수 전용 · 새 세션 시작 시 반드시 가장 먼저 읽을 것

---

## 🏗️ 확정된 기술 스택
- **프론트엔드**: React 19 + Vite + TailwindCSS + react-router-dom
- **백엔드/DB**: Supabase (PostgreSQL + Auth + Storage)
- **알림/문자**: Solapi (SMS 알림)
- **지도/주소**: 카카오 우편번호 서비스 (`react-daum-postcode`)
- **아이콘**: Lucide React
- **호스팅**: Vercel

---

## 🚨 절대 변경 불가 규칙

1. **`fee_settings` Hard-coding 절대 금지** — 모든 수수료/금액은 관리자 환경설정에서 입력
2. **물리적 DELETE 절대 금지** — 삭제 시 `is_deleted` 상태값으로 관리
3. **수수료 소급 적용 금지**
4. **새 파일/폴더 생성 전 반드시 먼저 물어보고 논의할 것**
5. **어려운 기술 용어 대신 알기 쉽게 설명할 것**

---

## 📌 직전 작업/진행 현황 (현재 상황)

1. **[완료] V1 런칭 전 필수 보안 자물쇠 적용 (미커밋 상태)**
   - 완전히 차단된 테스트 페이지 `/dev-login` (404 처리 완료).
   - 데이터베이스 RLS (Row Level Security) 설정 연동 완료. (모든 `profiles`, `funeral_cases` SELECT 접근을 `authenticated` 롤만 가능하도록 제한)
   - `Login.jsx`를 공식 Supabase JWT 로그인 체계로 전환 (아이디: 폰번호 입력 시 `@promise10.com` 변환).
   - 익명(로그인 전) 메인 홈페이지 긴급 접수 및 롤링 마퀴는 백엔드 보안 함수(RPC)로 동작하도록 연동.

2. **[다음 할 일] 맞춤형 상품(커스텀 패키지) 제안 시스템 개발**
   - **DB**: `02_packages.sql` 스크립트 작성 완료 (새 PC 혹은 기존 PC에서 Supabase에 런 해야 함).
   - **프론트엔드 액션 1 (팀장)**: `TeamLeaderDashboard.jsx` 내에 상품 제안(엑셀형 입력기 및 마진 입력) 팝업 모달 추가.
   - **프론트엔드 액션 2 (관리자)**: `AdminDashboard.jsx` 내에서 팀장 제안 패키지를 한눈에 보고 `[승인]` 버튼 생성.
   - **프론트엔드 액션 3 (딜러/마스터)**: 패키지 드롭다운 목록을 `custom_packages` DB에서 불러오도록 구조 개편 및 상세 내역(마진 제외) 예쁘게 브로셔식 노출.

---

## 🔄 워크플로우 가이드

### "퇴근할께" 라고 하면 수행
1. `lks.md` 진행률 및 남은 과제 업데이트
2. `git add -A` → `git commit -m "퇴근: [작업 요약]"` → `git push origin main`
3. Vercel 최신 배포 연동 확인

### "출근했어" 라고 하면 수행
1. `git pull origin main` (다른 PC에서 작업한 내역 동기화)
2. `lks.md` 읽고 맥락 파악 및 **절대 원칙 5가지 재확인**
3. 즉각적으로 다음 남은 작업 시작

---

## 💬 세션 시작 멘트 (Antigravity 복사용)
```text
안녕 안티. 이광수야. [10년의 약속] 작업 시작한다.
현재 프로젝트 폴더 최상단의 lks.md 꼼꼼히 읽어줘.

오늘 작업: [여기에 입력]

절대 원칙:
1. fee_settings Hard-coding 금지
2. DELETE 금지 (is_deleted로 관리)
3. 새 파일 만들기 전에 먼저 물어봐
4. 쉽게 설명해줘

준비되면 알려줘.
```

#!/usr/bin/env bash
# REST(PostgREST) 스모크 점검: 화면 코드의 partners/funeral_cases/settlements/coupons 조회 문자열을 공개 키로 호출해
# PGRST 오류(관계 모호성 등)가 없는지 확인한다. 데이터는 RLS 때문에 비어 있어도 되며 HTTP 200 이어야 한다.
# 사용: 프로젝트 루트에서 bash _sql_admin_dealer/_시험/rest_smoke.sh  (.env 의 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 사용)
K=$(grep -h "^VITE_SUPABASE_ANON_KEY" .env .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r')
U=$(grep -h "^VITE_SUPABASE_URL" .env .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r')
node _sql_admin_dealer/_시험/rest_extract.mjs > /tmp/sel.txt
bad=0
while IFS='|' read -r t s; do
  enc=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1].replace(/\\n/g, ' ')))" "$s")
  code=$(curl -s -o /tmp/o.txt -w "%{http_code}" -H "apikey: $K" -H "Authorization: Bearer $K" "$U/rest/v1/$t?select=$enc&limit=1")
  # 공개 키(anon)에 테이블 권한이 없는 경우(42501)는 정상(로그인 후에만 읽는 표)
  if [ "$code" = "401" ] && grep -q "42501" /tmp/o.txt; then continue; fi
  if [ "$code" != "200" ]; then bad=$((bad+1)); echo "FAIL $code $t | $s | $(head -c 120 /tmp/o.txt)"; fi
done < /tmp/sel.txt
echo "rest_smoke done: failures=$bad"

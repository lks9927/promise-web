#!/usr/bin/env bash
# 화면 컴포넌트 SSR 렌더 스모크(빌드는 통과해도 런타임에서 깨지는 '정의되지 않은 변수'를 잡는다). 프로젝트 루트에서 실행.
npx esbuild _sql_admin_dealer/_시험/ssr_smoke.jsx --bundle --platform=node --format=cjs --jsx=automatic --outfile=_ssr_smoke_out.cjs --loader:.js=jsx --external:react --external:react-dom --external:lucide-react --define:import.meta.env.VITE_SUPABASE_URL='"https://x.supabase.co"' --define:import.meta.env.VITE_SUPABASE_ANON_KEY='"abc"' --define:import.meta.env='{}' --log-level=error || exit 1
node _ssr_smoke_out.cjs; rc=$?
rm -f _ssr_smoke_out.cjs
exit $rc

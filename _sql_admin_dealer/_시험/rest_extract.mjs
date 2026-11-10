// rest_smoke.sh 용: src 의 .from('테이블') 뒤 .select('...') 문자열을 줄바꿈이 있어도 모두 추출해 "테이블|select" 로 출력한다.
import fs from 'node:fs'; import path from 'node:path';
const T = ['partners','funeral_cases','settlements','coupons','custom_packages','additional_income_items','pre_registrations','notifications','messages','orders','profiles'];
function walk(d, o = []) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, o); else if (/\.jsx?$/.test(f.name)) o.push(p); } return o; }
const seen = new Set();
for (const f of walk('src')) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\.from\('([a-z_]+)'\)\s*\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
    if (!T.includes(m[1]) || m[1] === 'profiles') continue; // profiles 는 anon 읽기 권한이 없어 별도(profile_select_audit)
    const s = m[2].slice(1, -1).replace(/\s+/g, ''); // supabase-js 도 공백을 모두 제거해 보낸다
    if (s.includes('${')) continue;
    seen.add(m[1] + '|' + s);
  }
}
console.log([...seen].sort().join('\n'));

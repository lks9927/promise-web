// P12 사전 점검: 화면/서버 코드가 profiles 에서 읽는 열이 모두 '공개 열 12개' 안에 있는지 정적으로 확인한다.
// 공개 열이 아닌 열을 select/embed/필터(.eq/.in/.neq/.not)에 쓰면 P12 적용 후 권한 오류(0명 표시 버그)가 난다.
// 사용: node _sql_admin_dealer/_시험/profile_select_audit.mjs  (프로젝트 루트에서)
import fs from 'node:fs';
import path from 'node:path';
const PUBLIC = new Set(['id','name','phone','role','avatar_url','introduction','experience_years','certificate_url','gallery_urls','business_license_url','has_business','created_at']);
const CONST = { PROFILE_COLUMNS: [...PUBLIC], PROFILE_PUBLIC_COLUMNS: [...PUBLIC] };
function walk(d, out = []) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === 'node_modules') continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(f.name)) out.push(p); } return out; }
const files = [...walk('src'), ...walk('api')];
let bad = 0, checked = 0;
const cols = s => s.split(',').map(x => x.trim()).filter(Boolean).map(x => x.replace(/^.*:/, '').replace(/\(.*$/, '').trim());
function check(file, line, list, where) { checked++; for (const c of list) { if (c === '*' || !PUBLIC.has(c)) { bad++; console.log(`FAIL ${file}:${line} [${where}] non-public column '${c}'`); } } }
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const lineOf = i => t.slice(0, i).split('\n').length;
  // 1) from('profiles') ... .select(...) (서비스 롤을 쓰는 api/ 는 제외)
  if (!f.startsWith('api')) {
    for (const m of t.matchAll(/\.from\('profiles'\)\s*\.select\(\s*([A-Z_]+|'[^']*'|`[^`]*`)/g)) {
      const a = m[1]; const list = /^[A-Z_]+$/.test(a) ? (CONST[a] || ['__UNKNOWN_' + a]) : cols(a.slice(1, -1));
      check(f, lineOf(m.index), list, 'select');
    }
    // 필터/정렬 열
    for (const m of t.matchAll(/\.from\('profiles'\)[\s\S]{0,300}?;/g)) {
      for (const k of m[0].matchAll(/\.(?:eq|neq|in|not|ilike|like|order|gt|lt|is)\(\s*'([a-z_]+)'/g)) { checked++; if (!PUBLIC.has(k[1])) { bad++; console.log(`FAIL ${f}:${lineOf(m.index)} [filter] non-public column '${k[1]}'`); } }
    }
  }
  // 2) embed: profiles(...), alias:profiles!fk(...), profiles:xxx_id(...), team_leader:team_leader_id(...)
  for (const m of t.matchAll(/(?:profiles[A-Za-z_!:]*|\w+:profiles[A-Za-z_!:]*|team_leader:team_leader_id)\(([^)]*)\)/g)) {
    const list = cols(m[1]); if (list.length === 0) continue;
    for (const c of list) { checked++; if (c === 'grade') { console.log(`NOTE ${f}:${lineOf(m.index)} embed uses 'grade' (not a profiles column; pre-existing)`); continue; } if (!PUBLIC.has(c)) { bad++; console.log(`FAIL ${f}:${lineOf(m.index)} [embed] non-public column '${c}'`); } }
  }
}
console.log(`profile_select_audit done: checked=${checked} failures=${bad}`);
process.exit(bad ? 1 : 0);

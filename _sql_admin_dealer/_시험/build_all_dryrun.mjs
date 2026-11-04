import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),src=resolve(here,'src'),out=resolve(here,'ALL_DRYRUN.sql');
const include=async(s,file)=>Promise.all([...s.matchAll(/^\s*--\s*@@INCLUDE\s+(.+)\s*$/gm)].map(async m=>[m[0],await readFile(resolve(dirname(file),m[1].trim()),'utf8')])).then(x=>x.reduce((a,[m,v])=>a.replace(m,()=>v),s));
const files=(await readdir(src)).filter(n=>n.endsWith('.sql')).sort();
const sql=await Promise.all(files.map(async n=>{const f=resolve(src,n);return include(await readFile(f,'utf8'),f)}));
await writeFile(out,sql.join('\n'),'utf8');
console.log('Generated '+out);

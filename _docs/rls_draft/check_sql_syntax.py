"""SQL 초안의 문법을 DB 없이 검사한다 (함수 본문의 PL/pgSQL 포함). 의미 오류(없는 열 이름 등)는 잡지 못한다.
사용: python -m venv v ; v/Scripts/pip install pglast ; v/Scripts/python _docs/rls_draft/check_sql_syntax.py
2026-10-20: 이 검사로 STAGE1 의 $$ 오타(01b)를 찾았다. SQL 을 고친 뒤에는 assemble_stages.sh 와 이 검사를 항상 실행한다."""
import glob, os, sys
from pglast import parse_sql, parse_plpgsql

here = os.path.dirname(os.path.abspath(__file__))

def check(path):
    text = open(path, encoding="utf-8").read()
    name = os.path.basename(path)
    try:
        stmts = parse_sql(text)
    except Exception as e:
        print("SQL SYNTAX ERROR", name, "->", e)
        return False
    bad = 0
    for s in stmts:
        node = s.stmt
        if node.__class__.__name__ == "CreateFunctionStmt":
            lang = body = None
            for o in node.options or []:
                if o.defname == "language": lang = o.arg.sval
                if o.defname == "as": body = o.arg[0].sval
            if lang == "plpgsql" and body:
                try:
                    parse_plpgsql("CREATE FUNCTION x() RETURNS integer LANGUAGE plpgsql AS $q$" + body + "$q$")
                except Exception as e:
                    bad += 1
                    print("   PLPGSQL ERROR", ".".join(x.sval for x in node.funcname), "->", str(e)[:160])
    print("OK " if bad == 0 else "ERR", name.ljust(46), len(stmts), "statements,", bad, "plpgsql errors")
    return bad == 0

ok = all([check(p) for p in sorted(glob.glob(os.path.join(here, "*.sql")))])
print("ALL FILES CLEAN" if ok else "PROBLEMS FOUND")
sys.exit(0 if ok else 1)

import csv
import json
import io

rows_out = []

with open('보건복지부_장례식장 현황_20250101.csv', 'rb') as f:
    raw = f.read()

# EUC-KR로 디코딩
text = raw.decode('euc-kr', errors='replace')
f_wrapped = io.StringIO(text)
reader = csv.reader(f_wrapped)
headers = next(reader)

# 0=시도, 1=시군구, 2=시설명, 3=주소, 4=전화번호, 7=주차, 9=빈소수
for row in reader:
    if len(row) < 5 or not row[2].strip():
        continue
    name = row[2].strip()
    address = row[3].strip().strip('"')
    phone = row[4].strip()
    try:
        rooms = int(row[9].strip()) if len(row) > 9 and row[9].strip().isdigit() else 0
    except:
        rooms = 0
    try:
        parking = int(row[7].strip()) if len(row) > 7 and row[7].strip().isdigit() else 0
    except:
        parking = 0

    rows_out.append({
        "name": name,
        "address": address,
        "phone": phone,
        "rooms": rooms,
        "parking": parking
    })

# JS 파일 생성
js_entries = []
for r in rows_out:
    name = r["name"].replace('"', '\\"').replace("'", "\\'")
    address = r["address"].replace('"', '\\"').replace("'", "\\'")
    phone = r["phone"]
    line = '    { name: "' + name + '", address: "' + address + '", phone: "' + phone + '", rooms: ' + str(r["rooms"]) + ', parking: ' + str(r["parking"]) + ' }'
    js_entries.append(line)

js_content = "// 보건복지부 장례식장 현황 (2025.01.01 기준) - 총 " + str(len(rows_out)) + "개소\n"
js_content += "export const FUNERAL_HOMES_FULL = [\n"
js_content += ",\n".join(js_entries)
js_content += "\n];\n\n"
js_content += "// 기존의 단순 배열 형태도 유지 (호환성용)\n"
js_content += "export const FUNERAL_HOMES = FUNERAL_HOMES_FULL.map(home => home.name);\n"

with open('src/data/funeralHomes.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print('OK: ' + str(len(rows_out)) + 'records saved to src/data/funeralHomes.js')

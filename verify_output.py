import json

with open('src/data/funeralHomes.js', 'r', encoding='utf-8') as f:
    content = f.read()

# count records
count = content.count('{ name:')
print('Records found:', count)

# extract first 3 names
lines = content.split('\n')
for line in lines[2:6]:
    if 'name:' in line:
        # extract name value
        start = line.index('name: "') + 7
        end = line.index('"', start)
        name = line[start:end]
        # write to file to avoid encoding issues
        with open('verify.txt', 'a', encoding='utf-8') as out:
            out.write(name + '\n')

print('Names written to verify.txt')

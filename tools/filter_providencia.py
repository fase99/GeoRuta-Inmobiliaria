import csv
from pathlib import Path

in_path = Path(r"c:\Users\Felipe\Desktop\ProyectoRuteo\web\data\Establecimientos_de_Salud.csv")
if not in_path.exists():
    print('ERROR: input file not found', in_path)
    raise SystemExit(1)

bak = in_path.with_suffix(in_path.suffix + '.bak')
# create backup if not exists
if not bak.exists():
    from shutil import copyfile
    copyfile(in_path, bak)

with bak.open('r', encoding='utf-8') as fr:
    text = fr.read().splitlines()
if not text:
    print('ERROR: empty file')
    raise SystemExit(1)

header = text[0]
cols = header.split('|')
try:
    nom_idx = cols.index('NOM_COM')
except ValueError:
    print('ERROR: NOM_COM not found in header')
    raise SystemExit(1)

out = [header]
for line in text[1:]:
    parts = line.split('|')
    if len(parts) <= nom_idx:
        continue
    if parts[nom_idx].strip().lower() == 'providencia':
        out.append(line)

with in_path.open('w', encoding='utf-8', newline='') as fw:
    fw.write('\n'.join(out))

print('BACKUP_CREATED=' + str(bak))
print('ROWS_AFTER=' + str(len(out)))
print('DATA_ROWS_AFTER=' + str(max(0, len(out)-1)))

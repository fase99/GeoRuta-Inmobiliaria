import csv
import json
import os

# Paths absolutos
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, 'web/data/Adm2025_PAES.csv')
JSON_PATH = os.path.join(BASE, 'web/data/Establecimientos_Educacionales_providencia.json')
OUTPUT_PATH = os.path.join(BASE, 'web/data/Establecimientos_Educacionales_providencia_con_paes.json')

# Cargar promedios PAES por RBD
def cargar_puntajes_paes(csv_path):
    paes_por_rbd = {}
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rbd = row['RBD'].strip()
            try:
                paes = float(row['PRO_PUNTAJE'])
            except Exception:
                paes = None
            paes_por_rbd[rbd] = paes
    return paes_por_rbd

# Unir datos al JSON
def unir_paes_a_colegios(json_path, paes_por_rbd, output_path):
    with open(json_path, encoding='utf-8') as f:
        colegios = json.load(f)
    for colegio in colegios:
        rbd = colegio.get('RBD') or colegio.get('RBD'.lower())
        if rbd:
            rbd_str = str(rbd).strip()
            colegio['PAES_PROMEDIO'] = paes_por_rbd.get(rbd_str)
        else:
            colegio['PAES_PROMEDIO'] = None
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(colegios, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    paes_por_rbd = cargar_puntajes_paes(CSV_PATH)
    unir_paes_a_colegios(JSON_PATH, paes_por_rbd, OUTPUT_PATH)
    print('Listo: datos combinados en', OUTPUT_PATH)

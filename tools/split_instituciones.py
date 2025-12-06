import json
import os
from pathlib import Path

# Obtener la ruta base del proyecto
base_dir = Path(__file__).parent.parent
# El archivo original ya fue dividido, este script es para referencia histórica
# input_file = base_dir / 'web' / 'data' / 'Instituciones_Educacion_Superior_providencia.json'
output_dir = base_dir / 'web' / 'data'

# Crear directorio de salida si no existe
os.makedirs(output_dir, exist_ok=True)

# Leer el archivo JSON original
with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Separar por tipo de institución
institutos = []
universidades_privadas = []
universidades_estatales = []

for institucion in data:
    tipo_inst = institucion.get('TIPO_INST', '')
    
    if 'Instituto' in tipo_inst:
        institutos.append(institucion)
    elif 'Privada' in tipo_inst:
        universidades_privadas.append(institucion)
    elif 'Estatal' in tipo_inst:
        universidades_estatales.append(institucion)

# Guardar los archivos separados
with open(os.path.join(output_dir, 'institutos_providencia.json'), 'w', encoding='utf-8') as f:
    json.dump(institutos, f, ensure_ascii=False, indent=2)

with open(os.path.join(output_dir, 'universidades_privadas_providencia.json'), 'w', encoding='utf-8') as f:
    json.dump(universidades_privadas, f, ensure_ascii=False, indent=2)

with open(os.path.join(output_dir, 'universidades_estatales_providencia.json'), 'w', encoding='utf-8') as f:
    json.dump(universidades_estatales, f, ensure_ascii=False, indent=2)

print(f"Institutos: {len(institutos)} registros")
print(f"Universidades Privadas: {len(universidades_privadas)} registros")
print(f"Universidades Estatales: {len(universidades_estatales)} registros")
print(f"Total: {len(data)} registros")

import csv
import json
import os

def separar_establecimientos_por_tipo(archivo_csv, directorio_salida):
    """
    Lee el archivo CSV y separa los establecimientos por tipo en archivos JSON individuales.
    
    Args:
        archivo_csv: Ruta al archivo CSV de entrada
        directorio_salida: Directorio donde se guardarán los archivos JSON
    """
    # Tipos de establecimientos a procesar
    tipos_objetivo = [
        "Centro Comunitario de Salud Familiar (CECOSF)",
        "Centro Comunitario de Salud Mental  (COSAM)",
        "Centro Corporación para la Nutrición Infantil (CONIN)",
        "Centro Médico y Dental",
        "Centro de Salud",
        "Centro de Salud Familiar (CESFAM)",
        "Clínica",
        "Clínica Dental",
        "Consultorio de Diagnóstico y Tratamiento (CDT)",
        "Dirección Servicio de Salud",
        "Hospital",
        "Laboratorio Clínico o Dental",
        "Programa de Reparación y Atención Integral de Salud",
        "Servicio de Atención Primaria de Urgencia (SAPU)",
        "Unidad de Salud Funcionarios",
        "Vacunatorio"
    ]
    
    # Crear directorio de salida si no existe
    os.makedirs(directorio_salida, exist_ok=True)
    
    # Diccionario para almacenar establecimientos por tipo
    establecimientos_por_tipo = {tipo: [] for tipo in tipos_objetivo}
    
    # Leer el archivo CSV
    print("Leyendo archivo CSV...")
    with open(archivo_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='|')
        
        for row in reader:
            tipo = row.get('TIPO', '').strip()
            
            # Si el tipo está en nuestra lista, agregar el registro
            if tipo in tipos_objetivo:
                # Convertir coordenadas a float si existen
                try:
                    if row.get('LATITUD'):
                        row['LATITUD'] = float(row['LATITUD'])
                    if row.get('LONGITUD'):
                        row['LONGITUD'] = float(row['LONGITUD'])
                    if row.get('COORD_X'):
                        row['COORD_X'] = float(row['COORD_X'])
                    if row.get('COORD_Y'):
                        row['COORD_Y'] = float(row['COORD_Y'])
                except (ValueError, TypeError):
                    pass  # Mantener como string si la conversión falla
                
                establecimientos_por_tipo[tipo].append(row)
    
    # Guardar cada tipo en un archivo JSON separado
    print("\nGenerando archivos JSON:")
    print("=" * 80)
    
    for tipo, establecimientos in establecimientos_por_tipo.items():
        if establecimientos:  # Solo crear archivo si hay establecimientos de ese tipo
            # Crear nombre de archivo seguro (sin caracteres especiales)
            nombre_archivo = tipo.replace('/', '-').replace('(', '').replace(')', '').replace('  ', ' ')
            nombre_archivo = nombre_archivo.replace(' ', '_') + '.json'
            ruta_archivo = os.path.join(directorio_salida, nombre_archivo)
            
            # Guardar como JSON con formato legible
            with open(ruta_archivo, 'w', encoding='utf-8') as f:
                json.dump(establecimientos, f, ensure_ascii=False, indent=2)
            
            print(f"✓ {tipo:<65} → {len(establecimientos):>3} establecimientos")
            print(f"  Archivo: {nombre_archivo}")
    
    print("=" * 80)
    print("\n✓ Proceso completado exitosamente")
    
    # Resumen
    total = sum(len(est) for est in establecimientos_por_tipo.values())
    archivos_creados = sum(1 for est in establecimientos_por_tipo.values() if est)
    
    print(f"\nResumen:")
    print(f"  • Total de establecimientos procesados: {total}")
    print(f"  • Archivos JSON creados: {archivos_creados}")
    print(f"  • Directorio de salida: {directorio_salida}")

if __name__ == "__main__":
    # Configurar rutas
    script_dir = os.path.dirname(os.path.abspath(__file__))
    proyecto_dir = os.path.dirname(script_dir)
    
    # Archivo CSV de entrada
    archivo_csv = os.path.join(proyecto_dir, "web", "data", "Establecimientos_de_Salud.csv")
    
    # Directorio de salida para los JSON
    directorio_salida = os.path.join(proyecto_dir, "web", "data", "establecimientos_por_tipo")
    
    # Ejecutar el proceso
    separar_establecimientos_por_tipo(archivo_csv, directorio_salida)

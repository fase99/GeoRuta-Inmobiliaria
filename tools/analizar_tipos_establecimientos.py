import csv
from collections import Counter

def analizar_tipos_establecimientos(archivo_csv):
    """
    Analiza los tipos de establecimientos en el archivo CSV.
    
    Args:
        archivo_csv: Ruta al archivo CSV
    """
    tipos = []
    
    # Leer el archivo CSV
    with open(archivo_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='|')
        
        for row in reader:
            tipo = row.get('TIPO', '').strip()
            if tipo:
                tipos.append(tipo)
    
    # Contar ocurrencias de cada tipo
    contador_tipos = Counter(tipos)
    
    # Mostrar resultados
    print("=" * 60)
    print("ANÁLISIS DE TIPOS DE ESTABLECIMIENTOS DE SALUD")
    print("=" * 60)
    print(f"\nTotal de establecimientos: {len(tipos)}")
    print(f"Tipos únicos encontrados: {len(contador_tipos)}\n")
    
    print("-" * 60)
    print(f"{'TIPO DE ESTABLECIMIENTO':<40} {'CANTIDAD':>10}")
    print("-" * 60)
    
    # Ordenar por cantidad (descendente)
    for tipo, cantidad in contador_tipos.most_common():
        print(f"{tipo:<40} {cantidad:>10}")
    
    print("-" * 60)
    
    # Mostrar lista simple de tipos únicos
    print("\nLista de tipos únicos:")
    for i, tipo in enumerate(sorted(contador_tipos.keys()), 1):
        print(f"{i}. {tipo}")

if __name__ == "__main__":
    import os
    
    # Obtener el directorio del script y construir la ruta al archivo CSV
    script_dir = os.path.dirname(os.path.abspath(__file__))
    proyecto_dir = os.path.dirname(script_dir)
    archivo = os.path.join(proyecto_dir, "web", "data", "Establecimientos_de_Salud.csv")
    
    analizar_tipos_establecimientos(archivo)

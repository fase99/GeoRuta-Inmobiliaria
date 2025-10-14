import os
import subprocess
import time

def run_script(path):
    print(f"--- Ejecutando: {path} ---")
    subprocess.run(["python", path], check=True)
    print(f"--- Finalizado: {path} ---\n")

if __name__ == "__main__":
    print("Iniciando Proceso ETL Completo...")
    print("Esperando que la base de datos esté lista...")
    time.sleep(10) # Simple espera para que el contenedor de la BD se inicie

    # Crear directorio de datos si no existe
    os.makedirs("web/data", exist_ok=True)

    # --- FASE 1: INFRAESTRUCTURA ---
    run_script("infraestructura/extract_infra.py")
    run_script("infraestructura/loaders/load_infra.py")

    # --- FASE 2: METADATA ---
    # Removed gas stations and traffic extraction/load as requested.
    # Instead, run the consolidated loader that imports existing web/data files into PostGIS.
    run_script("metadata/loaders/load_to_postgis.py")

    # --- FASE 4: RUTA DE EJEMPLO ---
    run_script("generate_dijkstra_route.py")

    print("--- PROCESO ETL Y RUTA DE EJEMPLO COMPLETADOS ---")
    print("El sitio web está disponible en http://localhost:8080")
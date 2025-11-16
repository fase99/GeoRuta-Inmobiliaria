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

    # --- FASE 4: AMENAZAS Y PROBABILIDADES ---
    print("\n=== FASE 4: PROCESANDO AMENAZAS ===")
    run_script("amenazas/extract_traffic_incidents.py")
    run_script("amenazas/generate_probabilities_enhanced.py")
    run_script("amenazas/simulate_threats.py")
    
    # --- FASE 5: RUTA DE EJEMPLO ---
    print("\n=== FASE 5: GENERANDO RUTA DE EJEMPLO ===")
    run_script("generate_dijkstra_route.py")
    
    # --- FASE 6: DEMOSTRACIÓN DE RUTA RESILIENTE ---
    print("\n=== FASE 6: CASO DEMOSTRATIVO ===")
    run_script("amenazas/demo_resilient_route.py")

    print("\n" + "="*60)
    print("✅ PROCESO ETL COMPLETADO EXITOSAMENTE")
    print("="*60)
    print("\n📊 Componentes disponibles:")
    print("   ✓ Infraestructura vial (nodos y aristas)")
    print("   ✓ Metadatos (propiedades, servicios, transporte)")
    print("   ✓ Amenazas (incidentes, probabilidades, simulación)")
    print("   ✓ Rutas optimizadas (Dijkstra + resiliente)")
    print("\n🌐 El sitio web está disponible en: http://localhost:8080")
    print("="*60)
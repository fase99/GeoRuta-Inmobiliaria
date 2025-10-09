import psycopg2
import geojson
import random
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def calculate_and_save_route():
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    # Obtener todos los IDs de nodos disponibles
    cur.execute("SELECT id FROM nodes;")
    node_ids = [row[0] for row in cur.fetchall()]
    
    if len(node_ids) < 2:
        print("No hay suficientes nodos para calcular una ruta.")
        return

    # Seleccionar origen y destino al azar
    start_node, end_node = random.sample(node_ids, 2)
    print(f"Calculando ruta desde el nodo {start_node} al {end_node}...")

    query = """
    SELECT ST_AsGeoJSON(geom)
    FROM pgr_dijkstra(
        'SELECT id, source, target, length_m as cost FROM edges',
        %s, %s,
        directed := false
    ) AS di
    JOIN edges ON di.edge = edges.id;
    """
    cur.execute(query, (start_node, end_node))
    
    features = []
    for row in cur.fetchall():
        geom = geojson.loads(row[0])
        features.append(geojson.Feature(geometry=geom))
        
    feature_collection = geojson.FeatureCollection(features)
    
    output_path = f"{DATA_DIR}/route.geojson"
    with open(output_path, 'w') as f:
        geojson.dump(feature_collection, f)
        
    print(f"Ruta de ejemplo guardada en {output_path}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    calculate_and_save_route()
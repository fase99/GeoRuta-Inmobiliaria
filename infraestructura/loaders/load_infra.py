import psycopg2
import geojson
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def load_data():
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    # Cargar Nodos
    with open(f"{DATA_DIR}/nodes.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            node_id = feat["properties"]["id"]
            geom_str = geojson.dumps(feat["geometry"])
            cur.execute(
                "INSERT INTO nodes (id, geom) VALUES (%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326));",
                (node_id, geom_str)
            )
    print(f"{len(features)} nodos cargados.")
    
    # Cargar Aristas
    with open(f"{DATA_DIR}/edges.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            source = feat["properties"]["u"]
            target = feat["properties"]["v"]
            length = feat["properties"]["length"]
            name = feat["properties"]["name"]
            geom_str = geojson.dumps(feat["geometry"])
            cur.execute(
                """
                INSERT INTO edges (source, target, length_m, name, geom)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326));
                """,
                (source, target, length, name, geom_str)
            )
    print(f"{len(features)} aristas cargadas.")

    conn.commit()

    # Crear topología de pgRouting
    print("Creando topología de pgRouting...")
    cur.execute("SELECT pgr_createTopology('edges', 0.00001, 'geom', 'id', 'source', 'target');")
    conn.commit()
    print("Topología creada exitosamente.")

    cur.close()
    conn.close()

if __name__ == "__main__":
    load_data()
    
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
import psycopg2
import geojson
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def load_data():
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    # Create tables if they don't exist (safe to run multiple times)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS nodes (
        id BIGINT PRIMARY KEY,
        geom geometry(Point,4326)
    );

    CREATE TABLE IF NOT EXISTS edges (
        id SERIAL PRIMARY KEY,
        source BIGINT,
        target BIGINT,
        length_m FLOAT,
        name VARCHAR(255),
        geom geometry(LineString,4326)
    );
    ''')
    conn.commit()

    # Cargar Nodos
    with open(f"{DATA_DIR}/nodes.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry")
            if not props or geom is None:
                print('Skipping invalid node feature', feat)
                continue
            node_id = props.get("id")
            if node_id is None:
                print('Skipping node without id', props)
                continue
            try:
                geom_str = geojson.dumps(geom)
                cur.execute(
                    "INSERT INTO nodes (id, geom) VALUES (%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)) ON CONFLICT (id) DO NOTHING;",
                    (node_id, geom_str)
                )
            except Exception as e:
                print('Failed to insert node', node_id, e)
    print(f"{len(features)} nodos cargados.")
    
    # Cargar Aristas
    with open(f"{DATA_DIR}/edges.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            props = feat.get('properties') or {}
            geom = feat.get('geometry')
            if not props or geom is None:
                print('Skipping invalid edge feature', feat)
                continue
            source = props.get('u')
            target = props.get('v')
            if source is None or target is None:
                print('Skipping edge without u/v', props)
                continue
            length = props.get('length')
            name = props.get('name')
            try:
                geom_str = geojson.dumps(geom)
                cur.execute(
                    """
                    INSERT INTO edges (source, target, length_m, name, geom)
                    VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326));
                    """,
                    (source, target, length, name, geom_str)
                )
            except Exception as e:
                print('Failed to insert edge', props.get('u'), props.get('v'), e)
    print(f"{len(features)} aristas cargadas.")

    conn.commit()

    # Crear índices espaciales
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_nodes_geom ON nodes USING GIST (geom);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_edges_geom ON edges USING GIST (geom);")
        conn.commit()
    except Exception as e:
        print('Warning creating spatial indexes', e)

    # Crear topología de pgRouting (si disponible)
    try:
        print("Creando topología de pgRouting...")
        cur.execute("SELECT pgr_createTopology('edges', 0.00001, 'geom', 'id', 'source', 'target');")
        conn.commit()
        print("Topología creada exitosamente.")
    except Exception as e:
        print('pgRouting topology creation failed or pgRouting not installed:', e)

    cur.close()
    conn.close()

if __name__ == "__main__":
    load_data()

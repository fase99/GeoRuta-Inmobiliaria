import argparse
import psycopg2
import geojson
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def find_nearest_node(cur, lon, lat):
    # Use KNN operator for fast nearest neighbor if available
    cur.execute(
        "SELECT id FROM nodes ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326) LIMIT 1;",
        (lon, lat)
    )
    row = cur.fetchone()
    return row[0] if row else None

def build_route_geojson(cur, start_node, end_node):
    sql = '''
    SELECT edges.id, ST_AsGeoJSON(edges.geom) AS geom_json
    FROM pgr_dijkstra(
        'SELECT id, source, target, length_m AS cost FROM edges',
        %s, %s,
        directed := false
    ) AS di
    JOIN edges ON di.edge = edges.id
    ORDER BY di.seq;
    '''
    cur.execute(sql, (start_node, end_node))
    features = []
    for row in cur.fetchall():
        geom_json = row[1]
        if geom_json:
            geom = geojson.loads(geom_json)
            features.append(geojson.Feature(geometry=geom, properties={"edge_id": row[0]}))
    return geojson.FeatureCollection(features)

def calculate_and_save_route(start_lat=None, start_lon=None, end_lat=None, end_lon=None, start_node=None, end_node=None):
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    # If coordinates provided, find nearest nodes
    if start_node is None and start_lat is not None and start_lon is not None:
        start_node = find_nearest_node(cur, start_lon, start_lat)
    if end_node is None and end_lat is not None and end_lon is not None:
        end_node = find_nearest_node(cur, end_lon, end_lat)

    # Fallback: pick two random nodes if none provided
    if start_node is None or end_node is None:
        cur.execute('SELECT id FROM nodes;')
        nodes = [r[0] for r in cur.fetchall()]
        if len(nodes) < 2:
            print('No hay suficientes nodos para calcular una ruta.')
            cur.close()
            conn.close()
            return
        import random
        start_node, end_node = random.sample(nodes, 2)

    print(f'Calculando ruta desde nodo {start_node} hasta nodo {end_node}...')

    route_fc = build_route_geojson(cur, start_node, end_node)

    out_path = f"{DATA_DIR}/route.geojson"
    with open(out_path, 'w', encoding='utf-8') as f:
        geojson.dump(route_fc, f)

    print(f'Ruta guardada en {out_path} (features: {len(route_fc.features)})')

    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Calcular ruta Dijkstra sobre la red OSM cargada en PostGIS')
    parser.add_argument('--start-lat', type=float)
    parser.add_argument('--start-lon', type=float)
    parser.add_argument('--end-lat', type=float)
    parser.add_argument('--end-lon', type=float)
    parser.add_argument('--start-node', type=int)
    parser.add_argument('--end-node', type=int)
    args = parser.parse_args()

    calculate_and_save_route(
        start_lat=args.start_lat,
        start_lon=args.start_lon,
        end_lat=args.end_lat,
        end_lon=args.end_lon,
        start_node=args.start_node,
        end_node=args.end_node,
    )


if __name__ == '__main__':
    main()
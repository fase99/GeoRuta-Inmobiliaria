import psycopg2
import geojson
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def load_data():
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    with open(f"{DATA_DIR}/live_incidents.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            inc_type = feat["properties"]["type"]
            desc = feat["properties"]["description"]
            geom_str = geojson.dumps(feat["geometry"])
            cur.execute(
                "INSERT INTO traffic_incidents (incident_type, description, geom) VALUES (%s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326));",
                (inc_type, desc, geom_str)
            )
    print(f"{len(features)} incidentes de tráfico cargados.")

    conn.commit()
    cur.close()
    conn.close()

if __name__ == "__main__":
    load_data()
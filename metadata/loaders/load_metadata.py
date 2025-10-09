import psycopg2
import geojson
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR

def load_data():
    conn = psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)
    cur = conn.cursor()

    # Cargar Bencineras
    with open(f"{DATA_DIR}/gas_stations.geojson") as f:
        features = geojson.load(f)["features"]
        for feat in features:
            name = feat["properties"]["name"]
            brand = feat["properties"]["brand"]
            geom_str = geojson.dumps(feat["geometry"])
            cur.execute(
                "INSERT INTO gas_stations (name, brand, geom) VALUES (%s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326));",
                (name, brand, geom_str)
            )
    print(f"{len(features)} bencineras cargadas.")
    
    # Aquí iría la carga de otros archivos de metadata (ej. congestión)
    
    conn.commit()
    cur.close()
    conn.close()

if __name__ == "__main__":
    load_data()
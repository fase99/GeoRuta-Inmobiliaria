import json
import csv
import psycopg2
from config import DB_HOST, DB_NAME, DB_USER, DB_PASS, DATA_DIR
from pathlib import Path

DATA_DIR = Path(DATA_DIR)

def connect():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASS)

def load_houses(conn):
    p1 = DATA_DIR / 'casas.json'
    p2 = DATA_DIR / 'casa-venta-toctoc.json'
    features = []
    for p in [p1, p2]:
        if p.exists():
            with p.open('r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    features.extend(data)
                except Exception as e:
                    print('Failed parse', p, e)
    cur = conn.cursor()
    inserted = 0
    for h in features:
        try:
            lat = float(h.get('lat') or h.get('latitude') or 0)
            lon = float(h.get('lon') or h.get('longitude') or 0)
        except Exception:
            continue
        title = h.get('titulo') or h.get('title') or ''
        price = h.get('precio_peso') or h.get('precio_uf') or None
        cur.execute("INSERT INTO houses (title, price, geom) VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326));", (title, price, lon, lat))
        inserted += 1
    conn.commit()
    # Map each house to the nearest network node (requires nodes table populated by infra loader)
    try:
        cur = conn.cursor()
        cur.execute("UPDATE houses SET nearest_node = (SELECT id FROM nodes ORDER BY nodes.geom <-> houses.geom LIMIT 1);")
        conn.commit()
        cur.close()
    except Exception as e:
        print('Warning: could not compute nearest_node for houses:', e)
    cur.close()
    print(f'Inserted {inserted} houses')

def load_health(conn):
    p = DATA_DIR / 'Establecimientos_de_Salud.csv'
    if not p.exists():
        print('health csv not found', p)
        return
    cur = conn.cursor()
    inserted = 0
    with p.open('r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='|')
        for row in reader:
            try:
                nom = row.get('NOMBRE') or row.get('NOM_COM') or ''
                lat = float(row.get('LATITUD') or 0)
                lon = float(row.get('LONGITUD') or 0)
            except Exception:
                continue
            cur.execute("INSERT INTO health_centers (name, comuna, geom) VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326));", (nom, row.get('NOM_COM'), lon, lat))
            inserted += 1
    conn.commit()
    cur.close()
    print(f'Inserted {inserted} health centers')

def load_metro(conn):
    p = DATA_DIR / 'Estaciones_actuales_Metro_de_Santiago.csv'
    if not p.exists():
        print('metro csv not found', p)
        return
    cur = conn.cursor()
    inserted = 0
    with p.open('r', encoding='utf-8') as f:
        # naive CSV parse: assume header contains X,Y,nombre,linea
        reader = csv.DictReader(f)
        for row in reader:
            try:
                x = float(row.get('X') or row.get('x') or 0)
                y = float(row.get('Y') or row.get('y') or 0)
                # assume X/Y are WebMercator (EPSG:3857); convert to lon/lat via PostGIS function
                name = row.get('nombre') or row.get('estacion') or row.get('NOMBRE') or ''
                cur.execute("INSERT INTO metro_stations (name, linea, geom) VALUES (%s, %s, ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s),3857),4326));", (name, row.get('linea'), x, y))
                inserted += 1
            except Exception:
                continue
    conn.commit()
    cur.close()
    print(f'Inserted {inserted} metro stations')

def create_tables(conn):
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS houses (
        id serial PRIMARY KEY,
        title text,
        price numeric,
        geom geometry(Point,4326)
    );
    CREATE TABLE IF NOT EXISTS health_centers (
        id serial PRIMARY KEY,
        name text,
        comuna text,
        geom geometry(Point,4326)
        nearest_node bigint
    );
    CREATE TABLE IF NOT EXISTS metro_stations (
        id serial PRIMARY KEY,
        name text,
        linea text,
        geom geometry(Point,4326)
    );
    ''')
    conn.commit()
    cur.close()

    # Create spatial indexes
    cur = conn.cursor()
    cur.execute("CREATE INDEX IF NOT EXISTS idx_houses_geom ON houses USING GIST (geom);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_health_geom ON health_centers USING GIST (geom);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_metro_geom ON metro_stations USING GIST (geom);")
    conn.commit()
    cur.close()

def main():
    conn = connect()
    create_tables(conn)
    load_houses(conn)
    load_health(conn)
    load_metro(conn)
    conn.close()

if __name__ == '__main__':
    main()

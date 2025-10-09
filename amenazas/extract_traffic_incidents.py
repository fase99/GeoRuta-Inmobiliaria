import geojson
import random
from config import DATA_DIR

# SIMULACIÓN: Genera incidentes de tráfico aleatorios en Providencia
incident_types = ["CONGESTION", "ACCIDENTE", "CIERRE VIAL"]
descriptions = {
    "CONGESTION": "Alta congestión vehicular",
    "ACCIDENTE": "Accidente menor, precaución",
    "CIERRE VIAL": "Calle cerrada por evento"
}
# Bounding box aproximado de Providencia
min_lon, max_lon = -70.625, -70.580
min_lat, max_lat = -33.440, -33.410

features = []
for _ in range(3): # Crear 3 incidentes
    inc_type = random.choice(incident_types)
    lon = random.uniform(min_lon, max_lon)
    lat = random.uniform(min_lat, max_lat)
    point = geojson.Point((lon, lat))
    features.append(geojson.Feature(geometry=point, properties={
        "type": inc_type,
        "description": f"{descriptions[inc_type]} en la zona."
    }))

feature_collection = geojson.FeatureCollection(features)
output_path = f"{DATA_DIR}/live_incidents.geojson"
with open(output_path, 'w') as f:
    geojson.dump(feature_collection, f)

print(f"Incidentes de tráfico simulados guardados en {output_path}")
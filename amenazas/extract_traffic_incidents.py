import geojson
import random
from pathlib import Path

# Configuración
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "web" / "data"

# SIMULACIÓN: Genera incidentes de tráfico aleatorios en Providencia
incident_types = ["CONGESTION", "ACCIDENTE", "CIERRE VIAL"]
severities = ["ALTA", "MEDIA", "BAJA"]
descriptions = {
    "CONGESTION": ["Alta congestión vehicular", "Tráfico denso", "Flujo lento de vehículos"],
    "ACCIDENTE": ["Accidente menor, precaución", "Colisión vehicular", "Accidente sin heridos"],
    "CIERRE VIAL": ["Calle cerrada por evento", "Mantención de vía", "Desvío temporal"]
}

# Bounding box aproximado de Providencia
min_lon, max_lon = -70.625, -70.580
min_lat, max_lat = -33.440, -33.410

features = []
num_incidents = 8  # Aumentado para tener más datos

for _ in range(num_incidents):
    inc_type = random.choice(incident_types)
    severity = random.choice(severities)
    lon = random.uniform(min_lon, max_lon)
    lat = random.uniform(min_lat, max_lat)
    point = geojson.Point((lon, lat))
    
    desc_options = descriptions[inc_type]
    desc = random.choice(desc_options)
    
    features.append(geojson.Feature(geometry=point, properties={
        "type": inc_type,
        "severity": severity,
        "description": f"{desc} en la zona.",
        "timestamp": "2025-11-16T12:00:00Z"
    }))

feature_collection = geojson.FeatureCollection(features)
output_path = DATA_DIR / "live_incidents.geojson"
output_path.parent.mkdir(parents=True, exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    geojson.dump(feature_collection, f, indent=2)

print(f"✅ {num_incidents} incidentes de tráfico simulados guardados en {output_path}")
print(f"\n📊 Resumen:")
for inc_type in incident_types:
    count = sum(1 for f in features if f["properties"]["type"] == inc_type)
    print(f"   - {inc_type}: {count} incidentes")
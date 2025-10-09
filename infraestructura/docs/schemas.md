# Esquemas de Archivos JSON/GeoJSON

## `infraestructura/nodes.geojson`
Contiene los nodos (intersecciones) de la red vial.
- `id`: (Integer) ID único del nodo, proveniente de OSM.
- `geometry`: (GeoJSON Point) Coordenadas [longitud, latitud].

## `infraestructura/edges.geojson`
Contiene las aristas (calles) de la red vial.
- `u`: (Integer) ID del nodo de origen.
- `v`: (Integer) ID del nodo de destino.
- `length`: (Float) Longitud de la calle en metros.
- `name`: (String|Null) Nombre de la calle.
- `geometry`: (GeoJSON LineString) Geometría de la calle.

## `metadata/gas_stations.geojson`
Contiene puntos de interés de bencineras.
- `name`: (String) Nombre de la estación.
- `brand`: (String) Marca (ej. Copec, Shell).
- `geometry`: (GeoJSON Point) Ubicación.

## `amenazas/live_incidents.geojson`
Contiene incidentes de tráfico reportados.
- `type`: (String) Tipo de incidente ('CIERRE', 'CONGESTION', 'ACCIDENTE').
- `description`: (String) Descripción del incidente.
- `geometry`: (GeoJSON Point) Ubicación aproximada.

## `route.geojson`
Contiene la ruta de ejemplo calculada con pgRouting. Es una colección de `features`, donde cada `feature` es un segmento de la ruta.
- `geometry`: (GeoJSON LineString) Geometría del segmento.
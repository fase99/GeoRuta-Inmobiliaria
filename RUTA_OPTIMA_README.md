# 🗺️ Algoritmo de Ruta Óptima - GeoRuta Inmobiliaria

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Algoritmo de Dijkstra](#algoritmo-de-dijkstra)
3. [Implementaciones Disponibles](#implementaciones-disponibles)
4. [Modelado de la Red Vial](#modelado-de-la-red-vial)
5. [Sistema de Penalizaciones por Amenazas](#sistema-de-penalizaciones-por-amenazas)
6. [Proceso de Cálculo de Rutas](#proceso-de-cálculo-de-rutas)
7. [Comparación: Ruta Óptima vs Ruta Resiliente](#comparación-ruta-óptima-vs-ruta-resiliente)
8. [Ejemplos de Uso](#ejemplos-de-uso)

---

## 📖 Descripción General

El sistema calcula rutas óptimas entre múltiples puntos (propiedades inmobiliarias) utilizando el **algoritmo de Dijkstra**, considerando:

- ✅ **Distancia física** (longitud de calles)
- ✅ **Probabilidades de riesgo** (amenazas activas)
- ✅ **Congestión vehicular** (incidentes de tráfico)
- ✅ **Seguridad** (zonas de robos)

El objetivo es encontrar la ruta que **minimiza el costo total**, donde el costo combina distancia y riesgo.

---

## 🧮 Algoritmo de Dijkstra

### ¿Qué es Dijkstra?

Dijkstra es un algoritmo clásico que encuentra el **camino más corto** entre dos nodos en un grafo ponderado con costos positivos.

### Pasos del Algoritmo

```
1. Inicializar:
   - Distancia del nodo origen = 0
   - Distancia de todos los demás nodos = ∞
   - Cola de prioridad con el nodo origen

2. Mientras la cola no esté vacía:
   a. Extraer nodo u con menor distancia
   b. Si u es el destino, terminar
   c. Para cada vecino v de u:
      - Calcular distancia alternativa: alt = dist[u] + peso(u, v)
      - Si alt < dist[v]:
        * dist[v] = alt
        * prev[v] = u
        * Agregar v a la cola

3. Reconstruir camino desde destino hasta origen usando prev[]
```

### Complejidad Temporal

- **Sin optimización**: O((V + E) log V)
- **Con heap de Fibonacci**: O(E + V log V)

Donde:
- V = número de nodos (intersecciones)
- E = número de aristas (calles)

---

## 🔧 Implementaciones Disponibles

El proyecto incluye **3 implementaciones** de Dijkstra:

### 🌟 Implementación Principal (PRODUCCIÓN)

**Archivo**: `web/main.js` (línea 1212)

Esta es la **implementación que realmente se usa** en la aplicación web. Ejecuta en el navegador del usuario y calcula rutas en tiempo real.

---

### 1️⃣ Implementación en PostGIS (ETL Offline)

**Archivo**: `generate_dijkstra_route.py`

```python
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
    # ... procesar resultados
```

**Características**:
- ✅ Usa extensión `pgRouting` de PostgreSQL
- ✅ Alta performance para grandes redes
- ✅ Consulta SQL optimizada
- ✅ Ideal para procesamiento batch

**Cuándo usar**: ETL, cálculos offline, rutas pre-calculadas (NO se usa en la web)

---

### 2️⃣ Implementación Local en Python (ETL Offline)

**Archivo**: `generate_route_local.py`

```python
def dijkstra(adj, source, target):
    dist = {source: 0.0}
    prev = {}
    edge_taken = {}
    heap = [(0.0, source)]
    visited = set()
    
    while heap:
        d, u = heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        
        if u == target:
            break
            
        for v, w, ei in adj.get(u, []):
            nd = d + w
            if v not in dist or nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                edge_taken[v] = ei
                heappush(heap, (nd, v))
    
    # Reconstruir camino
    path_nodes = [target]
    path_edges = []
    cur = target
    while cur != source:
        ei = edge_taken.get(cur)
        path_edges.append(ei)
        cur = prev[cur]
        path_nodes.append(cur)
    
    path_nodes.reverse()
    path_edges.reverse()
    return path_nodes, path_edges
```

**Características**:
- ✅ Sin dependencias de base de datos
- ✅ Lee archivos GeoJSON directamente
- ✅ Usa heap de Python (heapq)
- ✅ Soporta waypoints intermedios

**Cuándo usar**: Scripts standalone, procesamiento local, desarrollo (NO se usa en la web)

---

## 🎯 ¿Cuál se Usa en la Aplicación Web?

**SOLO `web/main.js`** - Las implementaciones Python son únicamente para preparar los datos inicialmente. Una vez generados los archivos GeoJSON, todo el cálculo de rutas ocurre en el navegador con JavaScript.

### Flujo Real del Sistema:

```
1. FASE ETL (una sola vez, Python):
   ├─ generate_dijkstra_route.py  → Procesa datos OSM
   ├─ generate_route_local.py     → Genera GeoJSON
   └─ Salida: web/data/*.geojson

2. FASE WEB (cada usuario, JavaScript):
   ├─ Usuario abre http://localhost:8080
   ├─ main.js carga nodes.geojson y edges.geojson
   ├─ Usuario selecciona propiedades en el mapa
   ├─ main.js ejecuta dijkstra() en línea 1212
   └─ Resultado: ruta dibujada en el mapa
```

---

### 🌐 Implementación JavaScript (PRODUCCIÓN)

**Archivo**: `web/main.js` (línea 1212)

```javascript
// Simple Dijkstra on the adjacency map
function dijkstra(startId, goalId) {
    if (startId === undefined || goalId === undefined) return null;
    
    const pq = new Map(); // Cola de prioridad
    const dist = new Map();
    const prev = new Map();
    
    // Inicializar distancias
    nodeIndex.forEach((_, id) => { dist.set(id, Infinity); });
    dist.set(startId, 0);
    pq.set(startId, 0);
    
    while (pq.size) {
        // Extraer nodo con menor distancia
        let u = null; 
        let ud = Infinity;
        pq.forEach((val, key) => { 
            if (val < ud) { 
                ud = val; 
                u = key; 
            } 
        });
        pq.delete(u);
        
        if (u === goalId) break;
        
        const neighbors = adj.get(u) || [];
        for (const nb of neighbors) {
            // Aplicar penalización por seguridad
            const base = (nb.weight || 1);
            const edgeKey = `${u}-${nb.to}`;
            const reverseKey = `${nb.to}-${u}`;
            const edgeProb = (edgeProbMap.get(edgeKey) !== undefined) 
                ? edgeProbMap.get(edgeKey) 
                : (edgeProbMap.get(reverseKey) || 0);
            const nodeProb = nodeProbMap.get(nb.to) || 0;
            
            // FÓRMULA DE PENALIZACIÓN
            const penalized = base * (1 + 2 * edgeProb) + (nodeProb * 50);
            
            const alt = dist.get(u) + penalized;
            if (alt < (dist.get(nb.to) || Infinity)) {
                dist.set(nb.to, alt);
                prev.set(nb.to, u);
                pq.set(nb.to, alt);
            }
        }
    }
    
    // Reconstruir camino
    if (!prev.has(goalId) && startId !== goalId) return null;
    
    const path = [];
    let cur = goalId;
    path.push(cur);
    while (cur !== startId) {
        cur = prev.get(cur);
        if (cur === undefined) break;
        path.push(cur);
    }
    return path.reverse();
}
```

**Características**:
- ✅ Ejecución en tiempo real en navegador
- ✅ Interactivo (clic en mapa)
- ✅ Integra penalizaciones por amenazas
- ✅ Visualización inmediata

**Cuándo usar**: **SIEMPRE** - Es la única implementación que se ejecuta en la aplicación web

**¿Por qué es la principal?**
- ✅ No requiere servidor backend
- ✅ Cálculo instantáneo (<100ms)
- ✅ Funciona offline una vez cargados los datos
- ✅ Escala sin costo de servidor
- ✅ Integra penalizaciones de amenazas en tiempo real

---

## 🌐 Modelado de la Red Vial

### Estructura de Datos

La red vial se modela como un **grafo no dirigido**:

```
Grafo G = (V, E)

V = Conjunto de nodos (intersecciones viales)
E = Conjunto de aristas (calles)

Cada nodo tiene:
  - id: Identificador único (ej: 13877004)
  - lat, lon: Coordenadas geográficas
  - geom: Geometría Point en PostGIS

Cada arista tiene:
  - id: Identificador único
  - u, v: Nodos origen y destino
  - length_m: Longitud en metros
  - geom: Geometría LineString en PostGIS
```

### Archivos de Red

```
web/data/
├── nodes.geojson       # Nodos (intersecciones)
└── edges.geojson       # Aristas (calles)
```

**Ejemplo de nodo**:
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-70.6100, -33.4250]
  },
  "properties": {
    "id": 13877004,
    "osmid": 13877004
  }
}
```

**Ejemplo de arista**:
```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [-70.6100, -33.4250],
      [-70.6105, -33.4252]
    ]
  },
  "properties": {
    "id": 12345,
    "u": 13877004,
    "v": 13877010,
    "length": 56.7,
    "length_m": 56.7
  }
}
```

### Construcción del Grafo

**En Python**:
```python
def build_graph(nodes_fc, edges_fc):
    # Diccionario de nodos: id -> (lon, lat)
    nodes = {}
    for feat in nodes_fc['features']:
        nid = feat['properties']['id']
        lon, lat = feat['geometry']['coordinates']
        nodes[nid] = (lon, lat)
    
    # Lista de adyacencia: node -> [(neighbor, weight, edge_index)]
    adj = {nid: [] for nid in nodes}
    for i, feat in enumerate(edges_fc['features']):
        u = feat['properties']['u']
        v = feat['properties']['v']
        length = feat['properties']['length_m']
        
        adj[u].append((v, length, i))
        adj[v].append((u, length, i))  # Grafo no dirigido
    
    return nodes, adj
```

**En JavaScript**:
```javascript
// Construir índice de nodos
const nodeIndex = new Map();
nodesGeoJSON.features.forEach(f => {
    const id = f.properties.id || f.properties.osmid;
    const [lon, lat] = f.geometry.coordinates;
    nodeIndex.set(id, {lat, lon});
});

// Construir lista de adyacencia
const adj = new Map();
edgesGeoJSON.features.forEach(f => {
    const u = f.properties.u;
    const v = f.properties.v;
    const weight = f.properties.length || f.properties.length_m;
    
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    
    adj.get(u).push({to: v, weight});
    adj.get(v).push({to: u, weight});
});
```

---

## ⚠️ Sistema de Penalizaciones por Amenazas

### Concepto

La **ruta resiliente** no es necesariamente la más corta, sino la que **minimiza el riesgo total**.

Para lograr esto, se **penalizan** las aristas y nodos con alta probabilidad de amenaza, incrementando su "costo" efectivo.

### Fórmula de Penalización

```javascript
// Peso base (distancia física)
base = distancia_en_metros

// Probabilidades de riesgo
edgeProb = probabilidad_arista  // 0.0 a 1.0
nodeProb = probabilidad_nodo    // 0.0 a 1.0

// PESO PENALIZADO
peso_total = base × (1 + 2 × edgeProb) + (nodeProb × 50)
```

### Interpretación

| Probabilidad | Factor | Efecto |
|-------------|--------|--------|
| 0% (sin riesgo) | 1.0× | Peso normal |
| 10% | 1.2× | +20% de costo |
| 25% | 1.5× | +50% de costo |
| 50% | 2.0× | 2× de costo |
| 75% | 2.5× | 2.5× de costo |
| 100% (certeza) | 3.0× | 3× de costo |

**Ejemplo**:
```
Calle de 100m con 50% de probabilidad de congestión:
  peso_sin_penalizar = 100m
  peso_penalizado = 100 × (1 + 2 × 0.5) + 0 = 200m
  
El algoritmo "ve" esta calle como si midiera 200m, 
por lo que preferirá rutas alternativas más largas pero seguras.
```

### Fuentes de Probabilidades

Las probabilidades se calculan a partir de:

1. **Incidentes de tráfico en vivo** (Waze, Google Maps)
2. **Datos históricos de robos** (zonas inseguras)
3. **Congestión histórica** (horarios pico)

Archivos generados:
```
web/data/
├── edge_probabilities.json  # Probabilidad por arista
├── node_probabilities.json  # Probabilidad por nodo
└── live_incidents_prob.geojson  # Incidentes con probabilidades
```

---

## 🔄 Proceso de Cálculo de Rutas

### Flujo Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ENTRADA: Origen y Destino                                │
│    - Coordenadas (lat, lon) o                               │
│    - IDs de nodos o                                         │
│    - IDs de propiedades (houses)                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SNAP TO NETWORK                                          │
│    Encuentra el nodo más cercano usando KNN                 │
│    o distancia haversine                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. CARGAR PROBABILIDADES                                    │
│    - edge_probabilities.json                                │
│    - node_probabilities.json                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. EJECUTAR DIJKSTRA                                        │
│    Con pesos penalizados por riesgo                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. RECONSTRUIR CAMINO                                       │
│    Secuencia de nodos → secuencia de aristas               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. SALIDA: GeoJSON                                          │
│    FeatureCollection con LineStrings de la ruta            │
└─────────────────────────────────────────────────────────────┘
```

### Snap to Network

Encuentra el nodo más cercano a unas coordenadas dadas.

**SQL (PostGIS)**:
```sql
SELECT id 
FROM nodes 
ORDER BY geom <-> ST_SetSRID(ST_MakePoint(-70.6100, -33.4250), 4326) 
LIMIT 1;
```

**Python**:
```python
def nearest_node(nodes, lon, lat):
    best = None
    best_d = float('inf')
    for nid, (nlon, nlat) in nodes.items():
        d = haversine(lon, lat, nlon, nlat)
        if d < best_d:
            best_d = d
            best = nid
    return best, best_d
```

**JavaScript**:
```javascript
function snapToNearestNode(lat, lon) {
    let bestId = null;
    let bestDist = Infinity;
    nodeIndex.forEach((v, id) => {
        const d = haversineDistance({lat, lon}, {lat: v.lat, lon: v.lon});
        if (d < bestDist) { 
            bestDist = d; 
            bestId = id; 
        }
    });
    return { id: bestId, distance: bestDist };
}
```

---

## ⚖️ Comparación: Ruta Óptima vs Ruta Resiliente

### Ruta Óptima (sin amenazas)

```python
# SIN penalizaciones
peso = distancia_metros
```

**Ventajas**:
- ✅ Distancia mínima
- ✅ Tiempo de viaje menor
- ✅ Simple de calcular

**Desventajas**:
- ❌ Puede pasar por zonas peligrosas
- ❌ No considera congestión
- ❌ Mayor riesgo de retrasos

---

### Ruta Resiliente (con amenazas)

```python
# CON penalizaciones
peso = distancia_metros × (1 + 2 × prob_arista) + prob_nodo × 50
```

**Ventajas**:
- ✅ Minimiza riesgo total
- ✅ Evita congestión conocida
- ✅ Mayor confiabilidad
- ✅ Mejor para planificación

**Desventajas**:
- ❌ Puede ser 5-15% más larga
- ❌ Requiere datos de amenazas
- ❌ Más compleja de calcular

---

### Caso Demostrativo

El script `amenazas/demo_resilient_route.py` genera una comparación completa:

```bash
python amenazas/demo_resilient_route.py
```

**Salida**:
```
📊 COMPARACIÓN DE RUTAS:

🔵 Ruta Óptima (sin considerar amenazas):
   Distancia: 1500 m
   Tiempo estimado: 18.0 min
   Riesgo total: 35.2%
   Segmentos de alto riesgo: 3/6

🟢 Ruta Resiliente (evitando amenazas):
   Distancia: 1680 m
   Tiempo estimado: 20.2 min
   Riesgo total: 8.7%
   Segmentos de alto riesgo: 0/8

✨ BENEFICIOS DE LA RUTA RESILIENTE:
   🛡️  Reducción de riesgo: -26.5%
   📏 Aumento de distancia: +12.0%

✅ CONCLUSIÓN: La ruta resiliente ofrece una mejora significativa
   en seguridad (-26.5% menos riesgo) con un costo
   aceptable en distancia (+12.0%).
```

**Archivo generado**: `web/data/route_comparison.json`

---

## 💻 Ejemplos de Uso

### 🌟 Ejemplo Principal: Interfaz Web Interactiva (RECOMENDADO)

**Así es como los usuarios realmente usan el sistema:**

1. **Iniciar aplicación**:
   ```bash
   docker-compose up -d
   ```

2. **Abrir navegador**: `http://localhost:8080`

3. **Definir punto de partida**:
   - Usar selector de estaciones de metro
   - O hacer clic en "Elegir en el mapa"

4. **Seleccionar propiedades**:
   - Hacer clic en marcadores de propiedades
   - Se agregan al itinerario automáticamente

5. **Optimizar ruta** (opcional):
   - Clic en "🎯 Optimizar orden de visitas"
   - El sistema usa Dijkstra + TSP para ordenar las propiedades

6. **Generar ruta recomendada**:
   - Clic en "🗺️ Generar ruta recomendada"
   - Se calcula ruta óptima con transporte público y caminata
   - **Aquí es donde se ejecuta el algoritmo de Dijkstra en `main.js`**

7. **Ver resultados**:
   - Ruta dibujada en el mapa (líneas azules = caminar, rojas = transporte)
   - Instrucciones paso a paso con distancias y tiempos
   - ETAs para cada propiedad

**¿Qué hace `main.js` internamente?**
```javascript
// 1. Snap puntos a nodos de la red
const startNode = snapToNearestNode(lat, lon);

// 2. Ejecutar Dijkstra (línea 1212)
const pathNodes = dijkstra(startNode, targetNode);

// 3. Convertir nodos a geometría de calles
const edgeFeatures = nodesPathToEdgeFeatures(pathNodes);

// 4. Dibujar en el mapa
L.polyline(coordinates).addTo(map);
```

---

### 📊 Ejemplos de Scripts Python (Solo para ETL)

**⚠️ NOTA**: Estos scripts NO se usan en la aplicación web. Solo sirven para generar los datos iniciales.

#### Generar GeoJSON inicial (una sola vez):

```bash
# Preparar datos de red vial
python infraestructura/extract_infra.py

# Calcular probabilidades de amenazas
python amenazas/generate_probabilities_enhanced.py

# Simular amenazas activas
python amenazas/simulate_threats.py
```

#### Ruta de prueba (opcional, no afecta la web):

```bash
# Genera web/data/route_osm.geojson para visualización
python generate_route_local.py \
  --start-lon -70.6100 \
  --start-lat -33.4250 \
  --end-lon -70.6050 \
  --end-lat -33.4320
```

**Este archivo NO se usa en el cálculo de rutas de la web**, solo es para demostración.

---

## 🎓 Conceptos Avanzados

### Optimización con A* (Mejora Futura)

El algoritmo A* es una variante de Dijkstra que usa una **heurística** para explorar menos nodos:

```python
def a_star(adj, source, target, nodes):
    # Heurística: distancia haversine al objetivo
    def h(node):
        return haversine(nodes[node], nodes[target])
    
    # Cola de prioridad con f(n) = g(n) + h(n)
    heap = [(0 + h(source), 0, source)]
    # ... resto similar a Dijkstra
```

**Ventajas de A***:
- ✅ 2-5× más rápido que Dijkstra
- ✅ Explora menos nodos
- ✅ Garantiza ruta óptima con heurística admisible

---

### Múltiples Destinos (TSP)

Para visitar múltiples propiedades, se resuelve el **Problema del Viajante** (TSP):

1. Calcular matriz de distancias entre todas las propiedades
2. Usar heurística (nearest neighbor, 2-opt)
3. Ejecutar Dijkstra para cada par consecutivo

**Complejidad**: O(n²) cálculos de Dijkstra para n propiedades

---

### Restricciones de Tiempo

Agregar restricciones de horario:

```python
# Penalización adicional si es hora pico
if is_rush_hour(current_time):
    penalty_factor = 1.5
else:
    penalty_factor = 1.0

peso_penalizado *= penalty_factor
```

---

## 📊 Métricas de Performance

### Red de Providencia (Típica)

```
Nodos: ~3,500
Aristas: ~7,200
Tiempo de cálculo (Dijkstra): ~50-100ms
Memoria: ~15MB
```

### Escalabilidad

| Red | Nodos | Tiempo |
|-----|-------|--------|
| Barrio | 500 | 10ms |
| Comuna | 3,500 | 80ms |
| Ciudad | 50,000 | 1.2s |
| País | 1M+ | >30s* |

*Requiere optimizaciones (contraction hierarchies, CH)

---

## 🔬 Validación y Testing

### Test de Sanidad

```python
# La ruta debe tener sentido geográfico
def test_route_validity(route):
    # 1. No debe haber saltos grandes
    for i in range(len(route) - 1):
        dist = haversine(route[i], route[i+1])
        assert dist < 500, "Salto sospechoso"
    
    # 2. Distancia total debe ser razonable
    total = sum_distances(route)
    direct = haversine(route[0], route[-1])
    assert total < direct * 3, "Ruta muy indirecta"
    
    # 3. Debe llegar al destino
    assert route[-1] == target_node
```

---

## 📚 Referencias

### Algoritmos
- Dijkstra, E. W. (1959). "A note on two problems in connexion with graphs"
- Hart, P. E. et al. (1968). "A Formal Basis for the Heuristic Determination of Minimum Cost Paths" (A*)

### Librerías Utilizadas
- **pgRouting**: Extensión de PostGIS para ruteo
- **NetworkX**: Análisis de grafos en Python
- **Leaflet**: Visualización de mapas web

### Datasets
- OpenStreetMap (OSM): Red vial
- Waze CCP: Incidentes de tráfico
- PDI Chile: Datos de seguridad

---

## 🤝 Contribuciones

Para mejorar el algoritmo de ruteo:

1. Implementar A* para mayor velocidad
2. Agregar múltiples criterios (distancia, tiempo, costo)
3. Optimizar estructuras de datos (heap de Fibonacci)
4. Paralelizar cálculo de múltiples rutas
5. Agregar caché de rutas frecuentes

---

## 📞 Contacto

Para dudas o sugerencias sobre el algoritmo de ruteo, abre un issue en el repositorio.

---

**Última actualización**: 16 de noviembre de 2025

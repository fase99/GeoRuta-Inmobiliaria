#!/usr/bin/env python3
"""
Optimización Exacta (CPLEX) - Modelo Lineal Entero Mixto (MILP)
Minimiza: ∑∑∑ c_{i,j,k} * x_{i,j,k} + 100 * ∑ AC_a[j] * u_j

Donde:
- c_{i,j,k}: costos de viaje según modo de transporte (caminata, micro, metro)
- x_{i,j,k}: variables binarias de decisión
- u_j: variables continuas para orden de visita (eliminación subtours MTZ)
- AC_a[j]: amenazas asociadas a cada propiedad

Utiliza la red real de calles de OSMnx (nodes.geojson, edges.geojson)
"""
import json
import os
import sys
import networkx as nx
from scipy.spatial import cKDTree
from docplex.mp.model import Model

# Configuración de parámetros
ALPHA = 2.0  # Peso de riesgo en aristas
BETA = 50.0  # Peso de riesgo en nodos
WALKING_SPEED = 5.0  # km/h
BUS_SPEED = 20.0  # km/h
METRO_SPEED = 35.0  # km/h
A_t = 0.5  # Amenaza temporal (congestión)
AC_m = 0  # Amenaza en metro
BigM = 100000  # Para restricciones MTZ

# Rutas de archivos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODES_FILE = os.path.join(BASE_DIR, 'web', 'data', 'nodes.geojson')
EDGES_FILE = os.path.join(BASE_DIR, 'web', 'data', 'edges.geojson')
EDGE_PROBS_FILE = os.path.join(BASE_DIR, 'web', 'data', 'edge_probabilities.json')
NODE_PROBS_FILE = os.path.join(BASE_DIR, 'web', 'data', 'node_probabilities.json')
INPUT_FILE = os.path.join(BASE_DIR, 'web', 'data', 'input_stops.json')
OUTPUT_FILE = os.path.join(BASE_DIR, 'web', 'data', 'docplex_route.json')

print("=" * 80)
print("CPLEX OPTIMIZATION - Routing with OSMnx Network")
print("=" * 80)

# 1. Cargar grafo de calles
print("\n[1/6] Loading street network...")
with open(NODES_FILE, 'r', encoding='utf-8') as f:
    nodes_data = json.load(f)
with open(EDGES_FILE, 'r', encoding='utf-8') as f:
    edges_data = json.load(f)

G = nx.DiGraph()
node_coords = {}

for feat in nodes_data['features']:
    nid = feat['properties']['id']
    coords = feat['geometry']['coordinates']
    G.add_node(nid, x=coords[0], y=coords[1])
    node_coords[nid] = (coords[1], coords[0])  # (lat, lon)

for feat in edges_data['features']:
    u = feat['properties']['u']
    v = feat['properties']['v']
    length = feat['properties']['length']
    G.add_edge(u, v, length=length)

print(f"   Nodes: {G.number_of_nodes()}, Edges: {G.number_of_edges()}")

# 2. Cargar probabilidades de riesgo
print("\n[2/6] Loading risk probabilities...")
with open(EDGE_PROBS_FILE, 'r', encoding='utf-8') as f:
    edge_probs_list = json.load(f)
with open(NODE_PROBS_FILE, 'r', encoding='utf-8') as f:
    node_probs_list = json.load(f)

# Convert to dictionaries for fast lookup
edge_probs = {}
for item in edge_probs_list:
    key = f"{item['u']}-{item['v']}"
    edge_probs[key] = item['probability']

node_probs = {}
for item in node_probs_list:
    node_probs[str(item['id'])] = item['probability']

print(f"   Loaded {len(edge_probs)} edge probabilities")
print(f"   Loaded {len(node_probs)} node probabilities")

# 3. Cargar propiedades seleccionadas
print("\n[3/6] Loading selected properties...")
with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    input_data = json.load(f)

properties = input_data.get('stops', [])
start_point = input_data.get('startPoint', None)

if not properties:
    print("ERROR: No properties selected")
    sys.exit(1)

if not start_point:
    print("ERROR: No start point defined")
    sys.exit(1)

print(f"   Start point: {start_point}")
print(f"   Properties to visit: {len(properties)}")

# 4. Snap propiedades al grafo
print("\n[4/6] Snapping properties to street network...")
tree = cKDTree(list(node_coords.values()))
snapped_nodes = {}

# Snap start point (propiedad 0)
start_coords = (start_point['lat'], start_point['lng'])
dist, idx = tree.query(start_coords)
node_list = list(node_coords.keys())
snapped_nodes[0] = node_list[idx]
print(f"   Property 0 (START): snapped to node {snapped_nodes[0]} (dist={dist:.2f}m)")

# Snap otras propiedades
for i, prop in enumerate(properties, start=1):
    prop_coords = (prop['lat'], prop['lng'])
    dist, idx = tree.query(prop_coords)
    snapped_nodes[i] = node_list[idx]
    print(f"   Property {i}: snapped to node {snapped_nodes[i]} (dist={dist:.2f}m)")

# 5. Calcular matriz de distancias entre propiedades usando Dijkstra
print("\n[5/6] Computing shortest paths matrix (Dijkstra)...")

# Aplicar pesos con penalización de riesgo
for u, v, data in G.edges(data=True):
    length = data['length']
    edge_key = f"{u}-{v}"
    p_edge = edge_probs.get(edge_key, 0.0)
    p_node_dest = node_probs.get(str(v), 0.0)
    
    # Fórmula: peso = distancia * (1 + ALPHA * p_edge) + BETA * p_node_dest
    penalized_weight = length * (1 + ALPHA * p_edge) + BETA * p_node_dest
    G[u][v]['weight'] = penalized_weight

# Calcular todas las distancias más cortas entre propiedades
num_props = len(snapped_nodes)
dist_matrix = {}

for i in range(num_props):
    source = snapped_nodes[i]
    lengths = nx.single_source_dijkstra_path_length(G, source, weight='weight')
    for j in range(num_props):
        if i != j:
            target = snapped_nodes[j]
            if target in lengths:
                dist_matrix[(i, j)] = lengths[target]
            else:
                dist_matrix[(i, j)] = BigM * 10  # No alcanzable
                print(f"   WARNING: No path from property {i} to {j}")

print(f"   Computed {len(dist_matrix)} pairwise distances")

# 6. Construir modelo CPLEX
print("\n[6/6] Building CPLEX optimization model...")

# Conjuntos
propiedades = list(range(num_props))
# Simplificado: solo caminata (las distancias ya incluyen penalizaciones de riesgo)
modos = ['caminata']

# Amenazas por propiedad (simuladas - puedes modificar según tus datos)
AC_a = {i: 0.0 for i in propiedades}
# Ejemplo: asignar amenaza alta a algunas propiedades
if len(propiedades) > 2:
    AC_a[1] = 0.8
    AC_a[2] = 0.3

print(f"   Properties: {propiedades}")
print(f"   Transport mode: walking only (distances already include risk penalties)")
print(f"   Risk penalties (AC_a): {AC_a}")

# Construir costos c_{i,j,k}
costos = {}
for i in propiedades:
    for j in propiedades:
        if i == j:
            continue
        
        base_dist = dist_matrix.get((i, j), BigM * 10)
        
        # Solo caminata: usar la distancia con riesgo ya calculada
        costos[(i, j, 'caminata')] = base_dist

print(f"   Generated {len(costos)} cost coefficients")

# Crear modelo
mdl = Model('GeoRuta_CPLEX_MILP')

# Variables de decisión
x = mdl.binary_var_dict(
    [(i, j, k) for i in propiedades for j in propiedades for k in modos if i != j], 
    name='x'
)
u = mdl.continuous_var_dict(propiedades, name='u', lb=0, ub=num_props)

print(f"   Binary variables (x): {len(x)}")
print(f"   Continuous variables (u): {len(u)}")

# Función objetivo
total_travel_cost = mdl.sum(costos[i, j, k] * x[i, j, k] for (i, j, k) in x.keys())
risk_penalty = mdl.sum(100 * AC_a[j] * u[j] for j in propiedades)
mdl.minimize(total_travel_cost + risk_penalty)

print("   Objective function: minimize travel_cost + 100 * risk_penalty")

# Restricciones de flujo
print("   Adding flow constraints...")
# Cada propiedad (excepto el inicio) debe tener exactamente una entrada y una salida
for j in propiedades[1:]:
    mdl.add_constraint(
        mdl.sum(x[i, j, k] for i in propiedades for k in modos if i != j) == 1,
        ctname=f'flow_in_{j}'
    )
    mdl.add_constraint(
        mdl.sum(x[j, i, k] for i in propiedades for k in modos if i != j) == 1,
        ctname=f'flow_out_{j}'
    )

# El nodo de inicio (0) tiene exactamente una salida
mdl.add_constraint(
    mdl.sum(x[0, j, k] for j in propiedades for k in modos if j != 0) == 1,
    ctname='start_out'
)

# El nodo de inicio (0) puede no tener entrada (si es un tour abierto)
# Si deseas un tour cerrado (volver al inicio), agrega esta restricción:
# mdl.add_constraint(
#     mdl.sum(x[i, 0, k] for i in propiedades for k in modos if i != 0) == 1,
#     ctname='start_in'
# )

# Restricciones MTZ (Miller-Tucker-Zemlin) para eliminar subtours
print("   Adding MTZ subtour elimination constraints...")
for i in propiedades[1:]:
    for j in propiedades[1:]:
        if i != j:
            mdl.add_constraint(
                u[j] >= u[i] + 1 - BigM * (1 - mdl.sum(x[i, j, k] for k in modos)),
                ctname=f'mtz_{i}_{j}'
            )

print(f"   Total constraints: {mdl.number_of_constraints}")

# Resolver modelo
print("\n" + "=" * 80)
print("SOLVING MODEL...")
print("=" * 80)
mdl.set_time_limit(300)  # 5 minutos límite
solution = mdl.solve(log_output=True)

# Procesar solución
output = {
    "feasible": False,
    "objective": None,
    "route": [],
    "order": [],
    "travel_times": {}
}

if solution:
    print("\n" + "=" * 80)
    print("SOLUTION FOUND")
    print("=" * 80)
    output['feasible'] = True
    output['objective'] = solution.objective_value
    
    print(f"   Objective value: {solution.objective_value:.2f}")
    
    # Reconstruir ruta
    current = 0
    visited = {0}
    order = [0]
    route_details = []
    
    max_iterations = num_props * 2
    iterations = 0
    
    while len(visited) < num_props and iterations < max_iterations:
        found = False
        for j in propiedades:
            if j == current or j in visited:
                continue
            for k in modos:
                var_key = (current, j, k)
                if var_key in x and solution.get_value(x[var_key]) > 0.5:
                    order.append(j)
                    visited.add(j)
                    route_details.append({
                        "from": current,
                        "to": j,
                        "mode": k,
                        "cost": costos.get((current, j, k), 0)
                    })
                    current = j
                    found = True
                    break
            if found:
                break
        
        if not found:
            break
        iterations += 1
    
    # Agregar propiedades no visitadas (fallback)
    for p in propiedades:
        if p not in order:
            order.append(p)
            print(f"   WARNING: Property {p} was not visited in optimal solution")
    
    output['order'] = order
    output['route'] = route_details
    
    # Mapear índices a coordenadas reales
    output['nodes'] = {i: snapped_nodes[i] for i in propiedades}
    
    print(f"\n   Visit order: {order}")
    print(f"   Route segments: {len(route_details)}")
    
    for seg in route_details:
        print(f"      {seg['from']} -> {seg['to']} via {seg['mode']} (cost={seg['cost']:.2f})")
    
else:
    print("\n" + "=" * 80)
    print("NO SOLUTION FOUND")
    print("=" * 80)
    print("   Model may be infeasible or time limit exceeded")

# Guardar resultado
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"\n[OUTPUT] Saved to: {OUTPUT_FILE}")
print("=" * 80)

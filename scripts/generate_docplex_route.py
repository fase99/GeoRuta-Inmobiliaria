#!/usr/bin/env python3
"""
Generador de ruta usando Docplex (modelo provisto por el usuario).
Salida: `web/data/docplex_route.json` con la lista ordenada de visitas y modos.
"""
import json
from docplex.mp.model import Model

# --- DATOS DE EJEMPLO ---
propiedades = [0, 1, 2, 3]
modos = ['caminata', 'micro', 'metro']

# Amenazas Globales
A_t = 0.5
AC_m = 0
BigM = 10000
AC_a = {1: 1, 2: 0, 3: 0, 0: 0}

# Tiempos (simulados)
T_rc = {(i,j): 10 for i in propiedades for j in propiedades if i!=j}
T_rmi = {(i,j): 5 for i in propiedades for j in propiedades if i!=j}
T_rme = {(i,j): 3 for i in propiedades for j in propiedades if i!=j}

# Construir modelo
mdl = Model('Geo_Ruta_Inmobiliaria')

# Variables
x = mdl.binary_var_dict([(i, j, k) for i in propiedades for j in propiedades for k in modos if i != j], name='x')
u = mdl.continuous_var_dict(propiedades, name='u')

# Costos
costos = {}
for i in propiedades:
    for j in propiedades:
        if i == j:
            continue
        costos[(i,j,'caminata')] = T_rc[i,j]
        costos[(i,j,'micro')] = T_rmi[i,j] * (1 + A_t)
        costos[(i,j,'metro')] = T_rme[i,j] + (BigM * AC_m)

# Objetivo
total_travel_cost = mdl.sum(costos[i,j,k] * x[i,j,k] for (i,j,k) in x.keys())
risk_penalty = mdl.sum(100 * AC_a[j] * u[j] for j in propiedades)
mdl.minimize(total_travel_cost + risk_penalty)

# Restricciones: entrar/salir
for j in propiedades[1:]:
    mdl.add_constraint(mdl.sum(x[i,j,k] for i in propiedades for k in modos if i!=j) == 1)
    mdl.add_constraint(mdl.sum(x[j,i,k] for i in propiedades for k in modos if i!=j) == 1)

# MTZ-like para evitar subtours (relajado con BigM)
for i in propiedades[1:]:
    for j in propiedades[1:]:
        if i != j:
            tiempo_elegido = mdl.sum(costos[i,j,k] * x[i,j,k] for k in modos)
            mdl.add_constraint(u[j] >= u[i] + tiempo_elegido - BigM * (1 - mdl.sum(x[i,j,k] for k in modos)))

# Resolver
solution = mdl.solve()

output = {
    "feasible": False,
    "objective": None,
    "route": []
}

if solution:
    output['feasible'] = True
    output['objective'] = solution.objective_value

    # Reconstruir ruta a partir de x: empezar en 0
    current = 0
    visited = {0}
    order = [0]
    max_steps = len(propiedades) * 2
    steps = 0
    while len(visited) < len(propiedades) and steps < max_steps:
        found = False
        for j in propiedades:
            if j == current:
                continue
            for k in modos:
                val = x.get((current,j,k))
                if val is not None and val.solution_value > 0.5:
                    order.append(j)
                    visited.add(j)
                    current = j
                    found = True
                    break
            if found:
                break
        if not found:
            # buscar cualquier arista entrante a un no visitado
            for i in propiedades:
                for j in propiedades:
                    if j in visited or i==j:
                        continue
                    for k in modos:
                        val = x.get((i,j,k))
                        if val is not None and val.solution_value > 0.5:
                            # intentar reconstruir desde 0 -> ... -> i -> j
                            order.append(j)
                            visited.add(j)
                            current = j
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
        steps += 1

    # Si alguna propiedad no visitada, agregar en orden natural (fallback)
    for p in propiedades:
        if p not in order:
            order.append(p)

    # Para cada salto en la ruta, extraer modo usado (si alguno)
    route = []
    for idx in range(len(order)-1):
        a = order[idx]
        b = order[idx+1]
        chosen_mode = None
        for k in modos:
            val = x.get((a,b,k))
            if val is not None and val.solution_value > 0.5:
                chosen_mode = k
                break
        route.append({"from": a, "to": b, "mode": chosen_mode or 'unknown', "travel_time": costos.get((a,b,chosen_mode), None)})

    output['route'] = route

# Escribir resultado en web/data/docplex_route.json
out_path = "../web/data/docplex_route.json" if __file__.startswith(".") else "web/data/docplex_route.json"
# normalize to repo relative path (scripts/ is sibling to web/)
import os
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_file = os.path.join(repo_root, 'web', 'data', 'docplex_route.json')
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"Wrote route to {out_file}, feasible={output['feasible']}, objective={output['objective']}")

#!/usr/bin/env python3
"""
Generate probabilities for incidents and propagate them to nearby edges and nodes.

Este script integra múltiples fuentes de amenazas:
1. Incidentes de tráfico en tiempo real (live_incidents.geojson)
2. Datos históricos de congestión (si existe)
3. Zonas de robos (Numero_Robos_en_Viviendas_providencia.json)

Outputs written to web/data/:
- live_incidents_prob.geojson (incidents with 'probability')
- edge_probabilities.json (list of {u,v,probability})
- node_probabilities.json (list of {id,probability})

Algoritmo mejorado:
- Asigna probabilidad base por severidad del incidente
- Integra datos históricos de tráfico si están disponibles
- Considera zonas de riesgo por robos
- Propaga probabilidades a aristas y nodos cercanos usando decaimiento gaussiano

Usage:
    python amenazas/generate_probabilities_enhanced.py

"""
import json
import math
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely.geometry import Point, shape
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "web" / "data"


def load_gdf(path, geom_type_hint=None):
    """Carga un archivo GeoJSON y asegura CRS"""
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    return gdf


def load_robbery_data():
    """
    Carga datos de robos en viviendas y retorna lista de puntos peligrosos.
    Cada punto tiene una probabilidad base de riesgo.
    """
    robbery_path = DATA_DIR / "Numero_Robos_en_Viviendas_providencia.json"
    if not robbery_path.exists():
        print(f"⚠️ No se encontró archivo de robos: {robbery_path}")
        return []
    
    try:
        with open(robbery_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        robbery_points = []
        if isinstance(data, dict) and 'features' in data:
            features = data['features']
        elif isinstance(data, list):
            features = data
        else:
            features = []
        
        for feat in features:
            if isinstance(feat, dict):
                geom = feat.get('geometry')
                props = feat.get('properties', {})
                
                if geom and geom.get('type') in ['Point', 'Polygon', 'MultiPolygon']:
                    # Calcular probabilidad basada en número de robos
                    num_robos = props.get('TOTAL', props.get('total', props.get('robos', 1)))
                    try:
                        num_robos = int(num_robos)
                    except:
                        num_robos = 1
                    
                    # Normalizar: 1-5 robos = baja (0.05), 6-15 = media (0.15), >15 = alta (0.30)
                    if num_robos <= 5:
                        prob = 0.05
                    elif num_robos <= 15:
                        prob = 0.15
                    else:
                        prob = 0.30
                    
                    # Obtener coordenadas (centro si es polígono)
                    geom_shape = shape(geom)
                    if geom['type'] == 'Point':
                        coords = geom['coordinates']
                    else:
                        # Usar centroide para polígonos
                        centroid = geom_shape.centroid
                        coords = [centroid.x, centroid.y]
                    
                    robbery_points.append({
                        'geometry': Point(coords),
                        'probability': prob,
                        'num_robos': num_robos
                    })
        
        print(f"✅ Cargados {len(robbery_points)} puntos de riesgo por robos")
        return robbery_points
    
    except Exception as e:
        print(f"⚠️ Error cargando datos de robos: {e}")
        return []


def assign_base_probability(props: dict, has_robbery_data=False) -> float:
    """
    Asigna probabilidad base a un incidente según su severidad.
    Si hay datos de robos, ajusta la probabilidad.
    """
    # Simple deterministic mapping based on a 'severity' or 'impact' property if present.
    sev = None
    for key in ("severity", "impact", "level"):
        if key in props:
            sev = props.get(key)
            break

    if sev is None:
        # fallback: if there's a 'type' like 'accident' give higher base
        t = props.get("type", "").lower() if props.get("type") else ""
        if "accident" in t or "collision" in t or "accidente" in t:
            return 0.30
        if "congestion" in t or "traffic" in t or "congesti" in t:
            return 0.20
        if "closure" in t or "cierre" in t:
            return 0.40
        return 0.15

    # normalize common textual severities
    if isinstance(sev, str):
        s = sev.lower()
        if s in ("high", "alta", "grave", "crítico", "critico"):
            return 0.45
        if s in ("medium", "med", "media", "moderado"):
            return 0.25
        if s in ("low", "baja", "leve"):
            return 0.10
        try:
            # if numeric string
            val = float(s)
            return max(0.0, min(1.0, val))
        except Exception:
            return 0.18

    try:
        v = float(sev)
        # if user passed 0-100 scale, map to 0-1
        if v > 1.0:
            v = v / 100.0
        return max(0.0, min(1.0, v))
    except Exception:
        return 0.15


def gaussian_weight(base_p, d, sigma):
    """Calcula peso gaussiano basado en distancia"""
    if d <= 0:
        return base_p
    w = base_p * math.exp(-(d * d) / (2 * sigma * sigma))
    return float(w)


def propagate(incidents_gdf, edges_gdf, nodes_gdf=None, robbery_points=None, search_radius=1000, sigma=200):
    """
    Propaga probabilidades de incidentes y zonas peligrosas a aristas y nodos cercanos.
    
    Args:
        incidents_gdf: GeoDataFrame con incidentes de tráfico
        edges_gdf: GeoDataFrame con aristas de la red vial
        nodes_gdf: GeoDataFrame con nodos de la red vial
        robbery_points: Lista de puntos de riesgo por robos
        search_radius: Radio de búsqueda en metros
        sigma: Parámetro de dispersión gaussiana
    """
    # Project to metric CRS (Web Mercator)
    incidents = incidents_gdf.to_crs(epsg=3857).copy()
    edges = edges_gdf.to_crs(epsg=3857).copy()
    nodes = nodes_gdf.to_crs(epsg=3857).copy() if nodes_gdf is not None else None

    # Convertir puntos de robos a GeoDataFrame
    robbery_gdf = None
    if robbery_points:
        robbery_gdf = gpd.GeoDataFrame(
            robbery_points,
            geometry='geometry',
            crs='EPSG:4326'
        ).to_crs(epsg=3857)
        print(f"✅ Procesando {len(robbery_gdf)} zonas de riesgo por robos")

    # prepare spatial index on edges
    edges_sindex = edges.sindex
    node_sindex = nodes.sindex if nodes is not None else None

    # per-edge contributions list
    edge_contribs = {idx: [] for idx in edges.index}
    node_contribs = {idx: [] for idx in nodes.index} if nodes is not None else {}

    incident_probs = []

    # Procesar incidentes de tráfico
    print(f"✅ Procesando {len(incidents)} incidentes de tráfico")
    for i, inc in incidents.iterrows():
        geom = inc.geometry
        # Get properties safely
        if hasattr(inc, 'properties'):
            props = inc.properties if isinstance(inc.properties, dict) else {}
        else:
            props = {k: v for k, v in inc.items() if k != 'geometry'}
        
        base_p = assign_base_probability(props, has_robbery_data=(robbery_gdf is not None))
        # store per-incident probability (base)
        incident_probs.append((i, float(base_p)))

        # buffer search in meters
        buf = geom.buffer(search_radius)
        candidate_edges_idx = list(edges_sindex.intersection(buf.bounds))
        for ei in candidate_edges_idx:
            edge_geom = edges.geometry.iloc[ei]
            d = geom.distance(edge_geom)  # meters
            if d <= search_radius:
                w = gaussian_weight(base_p, d, sigma)
                if w > 0:
                    edge_contribs[edges.index[ei]].append(w)

        if nodes is not None:
            candidate_nodes_idx = list(node_sindex.intersection(buf.bounds))
            for ni in candidate_nodes_idx:
                node_geom = nodes.geometry.iloc[ni]
                d = geom.distance(node_geom)
                if d <= search_radius:
                    w = gaussian_weight(base_p, d, sigma)
                    if w > 0:
                        node_contribs[nodes.index[ni]].append(w)

    # Procesar zonas de robos
    if robbery_gdf is not None:
        for i, rob in robbery_gdf.iterrows():
            geom = rob.geometry
            base_p = rob['probability']
            
            # Radio más pequeño para robos (500m)
            rob_radius = min(search_radius, 500)
            buf = geom.buffer(rob_radius)
            candidate_edges_idx = list(edges_sindex.intersection(buf.bounds))
            for ei in candidate_edges_idx:
                edge_geom = edges.geometry.iloc[ei]
                d = geom.distance(edge_geom)
                if d <= rob_radius:
                    # Usar sigma más pequeño para robos (más localizado)
                    w = gaussian_weight(base_p, d, sigma=150)
                    if w > 0:
                        edge_contribs[edges.index[ei]].append(w)
            
            if nodes is not None:
                candidate_nodes_idx = list(node_sindex.intersection(buf.bounds))
                for ni in candidate_nodes_idx:
                    node_geom = nodes.geometry.iloc[ni]
                    d = geom.distance(node_geom)
                    if d <= rob_radius:
                        w = gaussian_weight(base_p, d, sigma=150)
                        if w > 0:
                            node_contribs[nodes.index[ni]].append(w)

    # aggregate using 1 - prod(1 - w_i)
    edge_probs = {}
    for idx, contribs in edge_contribs.items():
        if not contribs:
            p = 0.0
        else:
            prod = 1.0
            for w in contribs:
                prod *= (1.0 - float(w))
            p = 1.0 - prod
        edge_probs[idx] = float(p)

    node_probs = None
    if nodes is not None:
        node_probs = {}
        for idx, contribs in node_contribs.items():
            if not contribs:
                p = 0.0
            else:
                prod = 1.0
                for w in contribs:
                    prod *= (1.0 - float(w))
                p = 1.0 - prod
            node_probs[idx] = float(p)

    return incident_probs, edge_probs, node_probs


def write_outputs(incidents_gdf, incident_probs, edges_gdf, edge_probs, nodes_gdf=None, node_probs=None, outdir=DATA_DIR):
    """Escribe archivos de salida con probabilidades"""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # write incidents with assigned base probability
    inc_copy = incidents_gdf.copy()
    prob_map = dict(incident_probs)
    inc_copy['probability'] = inc_copy.index.map(lambda i: float(prob_map.get(i, 0.0)))
    inc_copy.to_file(outdir / 'live_incidents_prob.geojson', driver='GeoJSON')
    print(f"✅ Escrito: {outdir / 'live_incidents_prob.geojson'}")

    # edges: write a json list with u,v and probability
    edges_out = []
    for idx, row in edges_gdf.iterrows():
        u = row.get('u')
        v = row.get('v')
        p = float(edge_probs.get(idx, 0.0))
        if p > 0:  # Solo guardar aristas con probabilidad > 0
            edges_out.append({'u': int(u), 'v': int(v), 'probability': round(p, 4)})

    with open(outdir / 'edge_probabilities.json', 'w', encoding='utf-8') as fh:
        json.dump(edges_out, fh, ensure_ascii=False, indent=2)
    print(f"✅ Escrito: {outdir / 'edge_probabilities.json'} ({len(edges_out)} aristas con riesgo)")

    if nodes_gdf is not None and node_probs is not None:
        nodes_out = []
        for idx, row in nodes_gdf.iterrows():
            nid = row.get('id') if 'id' in row else row.get('osmid', None)
            p = float(node_probs.get(idx, 0.0))
            if p > 0:  # Solo guardar nodos con probabilidad > 0
                nodes_out.append({'id': int(nid), 'probability': round(p, 4)})
        
        with open(outdir / 'node_probabilities.json', 'w', encoding='utf-8') as fh:
            json.dump(nodes_out, fh, ensure_ascii=False, indent=2)
        print(f"✅ Escrito: {outdir / 'node_probabilities.json'} ({len(nodes_out)} nodos con riesgo)")

    # Generar reporte de estadísticas
    print("\n📊 Resumen de Probabilidades:")
    print(f"   - Aristas en riesgo: {len(edges_out)} / {len(edges_gdf)} ({len(edges_out)/len(edges_gdf)*100:.1f}%)")
    if node_probs:
        print(f"   - Nodos en riesgo: {len(nodes_out)} / {len(nodes_gdf)} ({len(nodes_out)/len(nodes_gdf)*100:.1f}%)")
    
    if edges_out:
        probs = [e['probability'] for e in edges_out]
        print(f"   - Probabilidad promedio en aristas: {np.mean(probs):.3f}")
        print(f"   - Probabilidad máxima: {np.max(probs):.3f}")
        print(f"   - Probabilidad mínima: {np.min(probs):.3f}")


def main():
    """Función principal"""
    print("🚀 Iniciando generación de probabilidades de amenazas...")
    
    incidents_path = DATA_DIR / 'live_incidents.geojson'
    edges_path = DATA_DIR / 'edges.geojson'
    nodes_path = DATA_DIR / 'nodes.geojson'

    if not incidents_path.exists():
        print(f'⚠️ Archivo de incidentes no encontrado: {incidents_path}')
        print('   Generando incidentes de ejemplo...')
        # Crear incidentes de ejemplo
        from amenazas.extract_traffic_incidents import main as gen_incidents
        gen_incidents()
        
    if not edges_path.exists():
        print(f'❌ Archivo de aristas no encontrado: {edges_path}')
        print('   Ejecuta primero: python infraestructura/extract_infra.py')
        return

    print(f"📂 Cargando datos...")
    incidents = load_gdf(str(incidents_path))
    edges = load_gdf(str(edges_path))
    nodes = load_gdf(str(nodes_path)) if nodes_path.exists() else None
    robbery_points = load_robbery_data()

    print(f"\n🔄 Propagando probabilidades...")
    inc_probs, edge_probs, node_probs = propagate(
        incidents, 
        edges, 
        nodes_gdf=nodes, 
        robbery_points=robbery_points,
        search_radius=1000,
        sigma=200
    )

    print(f"\n💾 Escribiendo archivos de salida...")
    write_outputs(incidents, inc_probs, edges, edge_probs, nodes_gdf=nodes, node_probs=node_probs)
    
    print(f"\n✅ Proceso completado exitosamente!")


if __name__ == '__main__':
    main()

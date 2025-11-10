#!/usr/bin/env python3
"""
Generate probabilities for incidents and propagate them to nearby edges and nodes.

Outputs written to web/data/:
- live_incidents_prob.geojson (incidents with 'probability')
- edge_probabilities.json (list of {u,v,probability})
- node_probabilities.json (list of {id,probability})

This script uses GeoPandas / Shapely. It projects data to EPSG:3857 for metric distances.

Algorithm (simple, deterministic):
- Assign a base probability to each incident using its properties.severity if available.
- For each incident, find edges within SEARCH_RADIUS meters (using spatial index on projected geometries).
- For each nearby edge, compute distance d (meters) to incident point and contribution w = base_p * exp(-d^2/(2*sigma^2)).
- Aggregate contributions per edge as p_edge = 1 - prod(1 - w_i).
- Repeat similarly for nodes.

Usage:
    python amenazas/generate_probabilities.py

"""
import json
import math
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely.geometry import Point


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "web" / "data"


def load_gdf(path, geom_type_hint=None):
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    return gdf


def assign_base_probability(props: dict) -> float:
    # Simple deterministic mapping based on a 'severity' or 'impact' property if present.
    sev = None
    for key in ("severity", "impact", "level"):
        if key in props:
            sev = props.get(key)
            break

    if sev is None:
        # fallback: if there's a 'type' like 'accident' give higher base
        t = props.get("type", "").lower() if props.get("type") else ""
        if "accident" in t or "collision" in t:
            return 0.25
        if "congestion" in t or "traffic" in t:
            return 0.12
        return 0.1

    # normalize common textual severities
    if isinstance(sev, str):
        s = sev.lower()
        if s in ("high", "alta", "grave"):
            return 0.35
        if s in ("medium", "med", "media"):
            return 0.18
        if s in ("low", "baja", "leve"):
            return 0.06
        try:
            # if numeric string
            val = float(s)
            return max(0.0, min(1.0, val))
        except Exception:
            return 0.12

    try:
        v = float(sev)
        # if user passed 0-100 scale, map to 0-1
        if v > 1.0:
            v = v / 100.0
        return max(0.0, min(1.0, v))
    except Exception:
        return 0.1


def gaussian_weight(base_p, d, sigma):
    # d in meters
    if d <= 0:
        return base_p
    w = base_p * math.exp(-(d * d) / (2 * sigma * sigma))
    return float(w)


def propagate(incidents_gdf, edges_gdf, nodes_gdf=None, search_radius=1000, sigma=200):
    # Project to metric CRS (Web Mercator)
    incidents = incidents_gdf.to_crs(epsg=3857).copy()
    edges = edges_gdf.to_crs(epsg=3857).copy()
    nodes = nodes_gdf.to_crs(epsg=3857).copy() if nodes_gdf is not None else None

    # prepare spatial index on edges
    edges_sindex = edges.sindex
    node_sindex = nodes.sindex if nodes is not None else None

    # per-edge contributions list
    edge_contribs = {idx: [] for idx in edges.index}
    node_contribs = {idx: [] for idx in nodes.index} if nodes is not None else None

    incident_probs = []

    for i, inc in incidents.iterrows():
        geom = inc.geometry
        props = dict(inc) if hasattr(inc, 'items') else inc
        base_p = assign_base_probability(incidents_gdf.loc[i].get('properties', {}) if 'properties' in incidents_gdf.columns else inc.__dict__)
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
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # write incidents with assigned base probability
    inc_copy = incidents_gdf.copy()
    prob_map = dict(incident_probs)
    inc_copy['probability'] = inc_copy.index.map(lambda i: float(prob_map.get(i, 0.0)))
    inc_copy.to_file(outdir / 'live_incidents_prob.geojson', driver='GeoJSON')

    # edges: write a json list with u,v and probability
    edges_out = []
    for idx, row in edges_gdf.iterrows():
        u = row.get('u')
        v = row.get('v')
        p = float(edge_probs.get(idx, 0.0))
        edges_out.append({'u': u, 'v': v, 'probability': p})

    with open(outdir / 'edge_probabilities.json', 'w', encoding='utf-8') as fh:
        json.dump(edges_out, fh, ensure_ascii=False, indent=2)

    if nodes_gdf is not None and node_probs is not None:
        nodes_out = []
        for idx, row in nodes_gdf.iterrows():
            nid = row.get('id') if 'id' in row else row.get('osmid', None)
            p = float(node_probs.get(idx, 0.0))
            nodes_out.append({'id': nid, 'probability': p})
        with open(outdir / 'node_probabilities.json', 'w', encoding='utf-8') as fh:
            json.dump(nodes_out, fh, ensure_ascii=False, indent=2)

    print('Wrote:', outdir / 'live_incidents_prob.geojson', outdir / 'edge_probabilities.json', outdir / 'node_probabilities.json' if nodes_gdf is not None else '')


def main():
    incidents_path = DATA_DIR / 'live_incidents.geojson'
    edges_path = DATA_DIR / 'edges.geojson'
    nodes_path = DATA_DIR / 'nodes.geojson'

    if not incidents_path.exists():
        print('Incidents file not found:', incidents_path)
        return
    if not edges_path.exists():
        print('Edges file not found:', edges_path)
        return

    incidents = load_gdf(str(incidents_path))
    edges = load_gdf(str(edges_path))
    nodes = load_gdf(str(nodes_path)) if nodes_path.exists() else None

    inc_probs, edge_probs, node_probs = propagate(incidents, edges, nodes_gdf=nodes)

    write_outputs(incidents, inc_probs, edges, edge_probs, nodes_gdf=nodes, node_probs=node_probs)


if __name__ == '__main__':
    main()

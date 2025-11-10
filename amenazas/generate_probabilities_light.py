"""
Lightweight probability propagation without GeoPandas.

This reads GeoJSON files from `web/data` and computes simple distance-based
propagation of incident base probabilities to edges and nodes. It's intended
for environments where installing the full geospatial stack is difficult.

Outputs:
- web/data/live_incidents_prob.geojson
- web/data/edge_probabilities.json
- web/data/node_probabilities.json (if nodes file exists)

Notes:
- Distance is computed via Haversine to vertices (approx). This is a fast,
  pragmatic approximation for small areas.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'web' / 'data'


def haversine_meters(lon1, lat1, lon2, lat2):
    # Returns distance in meters between two WGS84 points
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    dphi = math.radians(lat2 - lat1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def assign_base_probability(props):
    t = (props.get('type') or '').lower()
    if 'accident' in t or 'accidente' in t:
        return 0.25
    if 'congestion' in t or 'congest' in t:
        return 0.12
    if 'cierre' in t:
        return 0.08
    return 0.1


def gaussian_weight(base_p, d, sigma=200.0):
    if d <= 0:
        return base_p
    return base_p * math.exp(-(d*d) / (2 * sigma * sigma))


def min_distance_point_linestring(pt_lon, pt_lat, coords):
    # Approximate by checking distance to vertices; fast but coarse.
    best = float('inf')
    for lon, lat in coords:
        d = haversine_meters(pt_lon, pt_lat, lon, lat)
        if d < best:
            best = d
    return best


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

    with open(incidents_path, 'r', encoding='utf-8') as fh:
        inc_fc = json.load(fh)

    with open(edges_path, 'r', encoding='utf-8') as fh:
        edges_fc = json.load(fh)

    nodes_fc = None
    if nodes_path.exists():
        with open(nodes_path, 'r', encoding='utf-8') as fh:
            nodes_fc = json.load(fh)

    # Prepare accumulators
    edge_contribs = [ [] for _ in edges_fc.get('features', []) ]
    node_contribs = [ [] for _ in (nodes_fc.get('features', []) if nodes_fc else []) ]

    incident_probs_out = []
    SEARCH_RADIUS = 1000.0
    SIGMA = 200.0

    for i, feat in enumerate(inc_fc.get('features', [])):
        geom = feat.get('geometry', {})
        if geom.get('type') != 'Point':
            continue
        lon, lat = geom.get('coordinates', [None, None])
        base_p = assign_base_probability(feat.get('properties', {}))
        incident_probs_out.append((i, base_p))

        # Edges
        for ei, edge in enumerate(edges_fc.get('features', [])):
            g = edge.get('geometry', {})
            if g.get('type') != 'LineString':
                continue
            coords = g.get('coordinates', [])
            d = min_distance_point_linestring(lon, lat, coords)
            if d <= SEARCH_RADIUS:
                w = gaussian_weight(base_p, d, sigma=SIGMA)
                if w > 0:
                    edge_contribs[ei].append(w)

        # Nodes
        if nodes_fc:
            for ni, node in enumerate(nodes_fc.get('features', [])):
                ng = node.get('geometry', {})
                if ng.get('type') != 'Point':
                    continue
                nlon, nlat = ng.get('coordinates', [None, None])
                d = haversine_meters(lon, lat, nlon, nlat)
                if d <= SEARCH_RADIUS:
                    w = gaussian_weight(base_p, d, sigma=SIGMA)
                    if w > 0:
                        node_contribs[ni].append(w)

    # Aggregate
    edge_probs_out = []
    for ei, contribs in enumerate(edge_contribs):
        if not contribs:
            p = 0.0
        else:
            prod = 1.0
            for w in contribs:
                prod *= (1.0 - w)
            p = 1.0 - prod
        props = edges_fc.get('features', [])[ei].get('properties', {})
        u = props.get('u')
        v = props.get('v')
        edge_probs_out.append({'u': u, 'v': v, 'probability': p})

    node_probs_out = []
    if nodes_fc:
        for ni, contribs in enumerate(node_contribs):
            if not contribs:
                p = 0.0
            else:
                prod = 1.0
                for w in contribs:
                    prod *= (1.0 - w)
                p = 1.0 - prod
            node_props = nodes_fc.get('features', [])[ni].get('properties', {})
            nid = node_props.get('id') if 'id' in node_props else node_props.get('osmid')
            node_probs_out.append({'id': nid, 'probability': p})

    # Write outputs
    # incidents with probability
    for idx, p in incident_probs_out:
        inc_fc['features'][idx].setdefault('properties', {})['probability'] = p

    out_inc = DATA_DIR / 'live_incidents_prob.geojson'
    with open(out_inc, 'w', encoding='utf-8') as fh:
        json.dump(inc_fc, fh, ensure_ascii=False, indent=2)

    out_edges = DATA_DIR / 'edge_probabilities.json'
    with open(out_edges, 'w', encoding='utf-8') as fh:
        json.dump(edge_probs_out, fh, ensure_ascii=False, indent=2)

    if nodes_fc:
        out_nodes = DATA_DIR / 'node_probabilities.json'
        with open(out_nodes, 'w', encoding='utf-8') as fh:
            json.dump(node_probs_out, fh, ensure_ascii=False, indent=2)

    print('Wrote:', out_inc)
    print('Wrote:', out_edges)
    if nodes_fc:
        print('Wrote node probabilities')


if __name__ == '__main__':
    main()

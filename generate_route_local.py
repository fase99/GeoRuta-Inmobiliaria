#!/usr/bin/env python3
"""
Compute shortest path over local OSM network (no PostGIS required).

Reads:
 - web/data/nodes.geojson (Point features with property 'id' or 'osmid')
 - web/data/edges.geojson (LineString features with properties 'u','v','length')

Writes:
 - web/data/route_osm.geojson (LineString features corresponding to edges along the route)

Usage examples:
  python generate_route_local.py --start-lon -70.610 --start-lat -33.436 --end-lon -70.605 --end-lat -33.420
  python generate_route_local.py --start-node 13877004 --end-node 13877404

Optional:
  --paraderos : snap nearest paraderos from web/data/Paraderos_Transantiago.geojson as intermediate waypoints
"""
import json
import math
import argparse
from heapq import heappush, heappop
from pathlib import Path

ROOT = Path(__file__).resolve().parents[0]
DATA_DIR = ROOT / 'web' / 'data'


def haversine(lon1, lat1, lon2, lat2):
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def load_geojson(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return json.load(fh)


def build_graph(nodes_fc, edges_fc):
    # Map node id -> (lon, lat)
    nodes = {}
    for feat in nodes_fc.get('features', []):
        props = feat.get('properties', {})
        nid = props.get('id') if 'id' in props else props.get('osmid')
        geom = feat.get('geometry', {})
        if geom.get('type') != 'Point' or nid is None:
            continue
        lon, lat = geom.get('coordinates', [None, None])
        nodes[nid] = (lon, lat)

    # Build adjacency: node -> list of (neighbor, weight, edge_index)
    adj = {nid: [] for nid in nodes}
    edges = []
    for i, feat in enumerate(edges_fc.get('features', [])):
        props = feat.get('properties', {})
        u = props.get('u')
        v = props.get('v')
        length = props.get('length') or props.get('length_m') or props.get('weight')
        try:
            w = float(length)
        except Exception:
            # fallback: compute length from geometry vertices
            coords = feat.get('geometry', {}).get('coordinates', [])
            w = 0.0
            for a, b in zip(coords[:-1], coords[1:]):
                w += haversine(a[0], a[1], b[0], b[1])
        edges.append(feat)
        if u in adj and v in adj:
            adj[u].append((v, w, i))
            adj[v].append((u, w, i))
        else:
            # allow edges whose nodes aren't found in nodes.geojson (skip)
            pass

    return nodes, adj, edges


def nearest_node(nodes, lon, lat):
    best = None
    best_d = float('inf')
    for nid, (nlon, nlat) in nodes.items():
        d = haversine(lon, lat, nlon, nlat)
        if d < best_d:
            best_d = d
            best = nid
    return best, best_d


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

    if target not in prev and target != source:
        return None, None

    # reconstruct path nodes and edge indices
    path_nodes = [target]
    path_edges = []
    cur = target
    while cur != source:
        ei = edge_taken.get(cur)
        if ei is None:
            break
        path_edges.append(ei)
        cur = prev[cur]
        path_nodes.append(cur)
    path_nodes.reverse()
    path_edges.reverse()
    return path_nodes, path_edges


def edges_to_featurecollection(edges_fc, edge_indices):
    feats = []
    for ei in edge_indices:
        feat = edges_fc.get('features', [])[ei]
        feats.append({
            'type': 'Feature',
            'geometry': feat.get('geometry'),
            'properties': feat.get('properties', {})
        })
    return {'type': 'FeatureCollection', 'features': feats}


def parse_waypoints(s):
    # expect semicolon-separated lon,lat pairs: lon1,lat1;lon2,lat2
    if not s:
        return []
    parts = s.split(';')
    out = []
    for p in parts:
        lon, lat = p.split(',')
        out.append((float(lon), float(lat)))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start-lon', type=float)
    parser.add_argument('--start-lat', type=float)
    parser.add_argument('--end-lon', type=float)
    parser.add_argument('--end-lat', type=float)
    parser.add_argument('--start-node', type=float)
    parser.add_argument('--end-node', type=float)
    parser.add_argument('--waypoints', type=str, help='semicolon-separated lon,lat pairs')
    parser.add_argument('--paraderos', action='store_true', help='include paraderos as intermediate waypoints (snapped)')
    args = parser.parse_args()

    nodes_fc = load_geojson(DATA_DIR / 'nodes.geojson')
    edges_fc = load_geojson(DATA_DIR / 'edges.geojson')
    nodes, adj, edges = build_graph(nodes_fc, edges_fc)

    # determine start/end nodes
    if args.start_node:
        start = args.start_node
    elif args.start_lon is not None and args.start_lat is not None:
        start, d = nearest_node(nodes, args.start_lon, args.start_lat)
    else:
        # pick a random node (first)
        start = next(iter(nodes))

    if args.end_node:
        end = args.end_node
    elif args.end_lon is not None and args.end_lat is not None:
        end, d = nearest_node(nodes, args.end_lon, args.end_lat)
    else:
        # pick another node (last)
        end = list(nodes.keys())[-1]

    waypoints = parse_waypoints(args.waypoints) if args.waypoints else []
    waypoint_nodes = []
    if args.paraderos:
        try:
            par = load_geojson(DATA_DIR / 'Paraderos_Transantiago.geojson')
            for feat in par.get('features', []):
                props = feat.get('properties', {})
                if props.get('comuna','').upper() != 'PROVIDENCIA':
                    continue
                lon, lat = feat.get('geometry', {}).get('coordinates', [None, None])
                nid, d = nearest_node(nodes, lon, lat)
                waypoint_nodes.append(nid)
        except Exception:
            pass

    for lon, lat in waypoints:
        nid, d = nearest_node(nodes, lon, lat)
        waypoint_nodes.append(nid)

    # Build full path: start -> wp1 -> wp2 -> ... -> end
    segments = []
    nodes_sequence = [start] + waypoint_nodes + [end]
    all_edge_indices = []
    for a, b in zip(nodes_sequence[:-1], nodes_sequence[1:]):
        pn, pe = dijkstra(adj, a, b)
        if pn is None:
            print(f'No path between {a} and {b}')
            return
        all_edge_indices.extend(pe)

    fc = edges_to_featurecollection(edges_fc, all_edge_indices)
    out_path = DATA_DIR / 'route_osm.geojson'
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(fc, fh, ensure_ascii=False, indent=2)

    print('Route written to', out_path, 'edges:', len(all_edge_indices))


if __name__ == '__main__':
    main()

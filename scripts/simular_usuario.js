// Simulación de usuario (Node): elige origen, 5 casas y genera 4 rutas
// Usa algoritmos desde web/algorithms.js

/*
Uso (PowerShell):
  node scripts/simular_usuario_node.js
  node scripts/simular_usuario_node.js "-33.45,-70.63"
  node scripts/simular_usuario_node.js "metro_nearest_to:-33.45,-70.63"
  node scripts/simular_usuario_node.js "metro:Baquedano"
*/

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const algorithms = require('../web/algorithms.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const WEB_DATA = path.join(PROJECT_ROOT, 'web', 'data');

function readJSON(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; }
}

function readCSV(fp) {
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj = {}; header.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
  return rows;
}

function mercatorToLatLon(x, y) {
  const lon = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return { lat, lon };
}

function loadMetroStations() {
  const csv = readCSV(path.join(WEB_DATA, 'Estaciones_actuales_Metro_de_Santiago.csv'));
  return csv.map(p => {
    const x = parseFloat(p.X); const y = parseFloat(p.Y);
    if (isNaN(x) || isNaN(y)) return null;
    const ll = mercatorToLatLon(x, y);
    return { name: p.nombre || p.estacion || p.nombre, lat: ll.lat, lon: ll.lon, linea: p.linea };
  }).filter(Boolean);
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2); const sinDlon = Math.sin(dLon / 2);
  const ah = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  const c = 2 * Math.atan2(Math.sqrt(ah), Math.sqrt(1 - ah));
  return R * c;
}

function parseOriginArg(arg) {
  if (!arg) return { lat: -33.4372, lon: -70.6342, label: 'Plaza Baquedano' };
  if (arg.startsWith('metro_nearest_to:')) {
    const coord = arg.split(':', 1)[1] || arg.slice('metro_nearest_to:'.length);
    const [latStr, lonStr] = coord.split(',');
    const ref = { lat: parseFloat(latStr), lon: parseFloat(lonStr) };
    const stations = loadMetroStations();
    let best = null; let bd = Infinity;
    stations.forEach(s => {
      const d = haversineMeters(ref, { lat: s.lat, lon: s.lon });
      if (d < bd) { bd = d; best = s; }
    });
    if (best) return { lat: best.lat, lon: best.lon, label: `Metro ${best.name}` };
    return { lat: -33.4372, lon: -70.6342, label: 'Plaza Baquedano' };
  } else if (arg.startsWith('metro:')) {
    const name = arg.split(':').slice(1).join(':').trim().toLowerCase();
    const stations = loadMetroStations();
    const st = stations.find(s => (s.name || '').toLowerCase().includes(name));
    if (st) return { lat: st.lat, lon: st.lon, label: `Metro ${st.name}` };
    return { lat: -33.4372, lon: -70.6342, label: 'Plaza Baquedano' };
  } else {
    const [latStr, lonStr] = arg.split(',');
    return { lat: parseFloat(latStr), lon: parseFloat(lonStr), label: 'Origen personalizado' };
  }
}

function loadHouses() {
  const files = ['casa-venta-toctoc.json','casas-arriendo-toctoc.json','depto-arriendo-toctoc.json','depto-venta-toctoc.json'];
  const props = [];
  files.forEach(f => {
    const data = readJSON(path.join(WEB_DATA, f));
    if (!data) return;
    if (Array.isArray(data)) props.push(...data);
    else if (data.items && Array.isArray(data.items)) props.push(...data.items);
  });
  return props.filter(p => p.lat && p.lon);
}

function pickFive(props) {
  const arr = props.slice();
  arr.sort(() => 0.5 - Math.random());
  return arr.slice(0, 5);
}

function buildGraph() {
  const nodesGj = readJSON(path.join(WEB_DATA, 'nodes.geojson'));
  const edgesGj = readJSON(path.join(WEB_DATA, 'edges.geojson'));
  const nodeIndex = new Map();
  const adj = new Map();
  const edgeLookup = new Map();
  (nodesGj.features || []).forEach(f => {
    const props = f.properties || {}; const id = props.id || props.osm_id || props.node_id || props.nid;
    const coords = f.geometry && f.geometry.coordinates; if (id !== undefined && coords) nodeIndex.set(Number(id), { lat: coords[1], lon: coords[0] });
  });
  (edgesGj.features || []).forEach(f => {
    const props = f.properties || {}; const u = props.u, v = props.v;
    const length = Number(props.length) || (() => {
      try { const coords = f.geometry.coordinates; const a = coords[0], b = coords[coords.length-1]; return haversineMeters({lat:a[1],lon:a[0]}, {lat:b[1],lon:b[0]}); } catch { return 1; }
    })();
    if (!adj.has(u)) adj.set(u, []); if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push({ to: v, weight: length }); adj.get(v).push({ to: u, weight: length });
    edgeLookup.set(`${u}-${v}`, f); edgeLookup.set(`${v}-${u}`, f);
  });
  return { nodeIndex, adj, edgeLookup };
}

function snapToNearestNode(lat, lon, nodeIndex) {
  let bestId = null; let bd = Infinity;
  nodeIndex.forEach((v, id) => {
    const d = haversineMeters({ lat, lon }, { lat: v.lat, lon: v.lon });
    if (d < bd) { bd = d; bestId = id; }
  });
  return { id: bestId, distance: bd };
}

function loadProbMaps() {
  const edgeProbData = readJSON(path.join(WEB_DATA, 'edge_probabilities.json')) || [];
  const nodeProbData = readJSON(path.join(WEB_DATA, 'node_probabilities.json')) || [];
  const edgeProbMap = new Map();
  const nodeProbMap = new Map();
  if (Array.isArray(edgeProbData)) edgeProbData.forEach(e => { if (e.u !== undefined && e.v !== undefined) edgeProbMap.set(`${e.u}-${e.v}`, Number(e.probability || e.prob || 0)); });
  if (Array.isArray(nodeProbData)) nodeProbData.forEach(n => { const id = n.node_id || n.id; if (id !== undefined) nodeProbMap.set(Number(id), Number(n.probability || n.prob || 0)); });
  return { edgeProbMap, nodeProbMap };
}

function computeDistanceMatrix(nodeIds, nodeIndex, adj) {
  const n = nodeIds.length; const mat = Array.from({ length: n }, () => Array(n).fill(Infinity));
  function distanceBetweenNodes(aId, bId) {
    if (aId === bId) return 0;
    const path = algorithms.dijkstraPuro({ nodeIndex, adj, startId: aId, goalId: bId });
    if (!path || path.length < 2) return Infinity;
    const coords = algorithms.nodesPathToCoords(path, nodeIndex);
    let sum = 0; for (let i = 0; i < coords.length - 1; i++) sum += haversineMeters({ lat: coords[i][0], lon: coords[i][1] }, { lat: coords[i+1][0], lon: coords[i+1][1] });
    return sum;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mat[i][j] = distanceBetweenNodes(nodeIds[i], nodeIds[j]);
  return mat;
}

function runCplexRoute() {
  // Prefer: leer web/data/docplex_route.json si existe; si no, intentar invocar Python
  const outPath = path.join(WEB_DATA, 'docplex_route.json');
  let start = performance.now();
  if (!fs.existsSync(outPath)) {
    try {
      const { spawnSync } = require('child_process');
      const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'generate_docplex_route.py');
      const py = spawnSync('python', [scriptPath], { encoding: 'utf-8' });
      if (py.status !== 0) throw new Error(py.stderr || 'Error ejecutando generate_docplex_route.py');
    } catch (e) { return { error: `CPLEX no disponible: ${e.message}` }; }
  }
  let data = null;
  try { data = JSON.parse(fs.readFileSync(outPath, 'utf-8')); } catch (e) { return { error: `docplex_route.json inválido: ${e.message}` }; }
  const end = performance.now();
  return { resultado: data, tiempo_ms: end - start };
}

function main() {
  const arg = process.argv[2];
  const origen = parseOriginArg(arg);
  console.log('Origen:', origen);

  const props = loadHouses();
  const selected = pickFive(props);
  selected.forEach((p, i) => console.log(`Propiedad ${i+1}: ${p.id} | destino: (${p.lat}, ${p.lon})`));

  const { nodeIndex, adj } = buildGraph();
  const { edgeProbMap, nodeProbMap } = loadProbMaps();
  const startSnap = snapToNearestNode(origen.lat, origen.lon, nodeIndex);
  // Preparar IDs de nodos: origen + destinos
  const startId = startSnap.id;
  const destIds = selected.map(p => snapToNearestNode(p.lat, p.lon, nodeIndex).id);

  // Matriz de distancias para el orden (origen + destinos)
  const allNodeIds = [startId, ...destIds];
  const distMat = computeDistanceMatrix(allNodeIds, nodeIndex, adj);

  // Orden de visita por ACO (sobre indices 0..n-1, donde 0 es origen)
  const tACO0 = performance.now();
  const acoTour = algorithms.antColonyTSP(distMat, { numAnts: 20, iterations: 100 });
  const tACO1 = performance.now();
  // Convertir tour a secuencia de nodos, asegurando ida y vuelta (cierra en origen)
  const acoOrderIdx = Array.isArray(acoTour) ? acoTour : [0, ...destIds.map((_, i) => i+1), 0];
  if (acoOrderIdx[acoOrderIdx.length-1] !== 0) acoOrderIdx.push(0);

  function measureTotalMsDijkstra(orderIdx, dynamic=false) {
    let t0 = performance.now();
    for (let i = 0; i < orderIdx.length - 1; i++) {
      const aId = allNodeIds[orderIdx[i]];
      const bId = allNodeIds[orderIdx[i+1]];
      if (dynamic) {
        algorithms.dijkstraDinamico({ nodeIndex, adj, edgeProbMap, nodeProbMap, startId: aId, goalId: bId });
      } else {
        algorithms.dijkstraPuro({ nodeIndex, adj, startId: aId, goalId: bId });
      }
    }
    let t1 = performance.now();
    return t1 - t0;
  }

  // Medir tiempos totales para ruta completa (ida y vuelta) en cada algoritmo
  const totalMsPuro = measureTotalMsDijkstra(acoOrderIdx, false);
  const totalMsDin = measureTotalMsDijkstra(acoOrderIdx, true);
  const totalMsACO = (tACO1 - tACO0); // tiempo de cómputo para obtener el orden

  // CPLEX (global)
  const cplex = runCplexRoute();
  const outDir = path.join(WEB_DATA, 'simulacion_usuario_node');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const resumen = {
    origen,
    propiedades: selected.map((p, i) => ({ etiqueta: p.id || p.titulo || `prop_${i+1}`, lat: p.lat, lon: p.lon })),
    orden_ACO_indices: acoOrderIdx,
    tiempos_ms: {
      dijkstra_puro_total: totalMsPuro,
      dijkstra_dinamico_total: totalMsDin,
      aco_total: totalMsACO,
      cplex_total: cplex.tiempo_ms || null,
    },
    cplex,
  };
  fs.writeFileSync(path.join(PROJECT_ROOT, 'simulacion_usuario_node_resumen.json'), JSON.stringify(resumen, null, 2), 'utf-8');
  console.log("\nArchivo 'simulacion_usuario_node_resumen.json' generado.");
}

main();

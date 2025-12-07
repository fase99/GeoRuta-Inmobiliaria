// algorithms.js
// Funciones de ruteo reutilizables para UI y simulaciones

// Utilidad Haversine (metros)
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const aHarv = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
  return R * c;
}

// dijkstraPuro: sin penalizaciones por amenazas
// Params: {nodeIndex(Map), adj(Map), startId(Number), goalId(Number)}
export function dijkstraPuro({ nodeIndex, adj, startId, goalId }) {
  if (startId === undefined || goalId === undefined) return null;
  const pq = new Map();
  const dist = new Map();
  const prev = new Map();
  nodeIndex.forEach((_, id) => { dist.set(id, Infinity); });
  dist.set(startId, 0);
  pq.set(startId, 0);
  while (pq.size) {
    let u = null; let ud = Infinity;
    pq.forEach((val, key) => { if (val < ud) { ud = val; u = key; } });
    pq.delete(u);
    if (u === goalId) break;
    const neighbors = adj.get(u) || [];
    for (const nb of neighbors) {
      const base = (nb.weight || 1);
      const alt = dist.get(u) + base;
      if (alt < (dist.get(nb.to) || Infinity)) {
        dist.set(nb.to, alt);
        prev.set(nb.to, u);
        pq.set(nb.to, alt);
      }
    }
  }
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

// dijkstraDinamico: con penalizaciones por probabilidades de aristas/nodos
// Params: {nodeIndex(Map), adj(Map), edgeProbMap(Map), nodeProbMap(Map), startId(Number), goalId(Number)}
export function dijkstraDinamico({ nodeIndex, adj, edgeProbMap, nodeProbMap, startId, goalId }) {
  if (startId === undefined || goalId === undefined) return null;
  const pq = new Map();
  const dist = new Map();
  const prev = new Map();
  nodeIndex.forEach((_, id) => { dist.set(id, Infinity); });
  dist.set(startId, 0);
  pq.set(startId, 0);
  while (pq.size) {
    let u = null; let ud = Infinity;
    pq.forEach((val, key) => { if (val < ud) { ud = val; u = key; } });
    pq.delete(u);
    if (u === goalId) break;
    const neighbors = adj.get(u) || [];
    for (const nb of neighbors) {
      const base = (nb.weight || 1);
      const edgeKey = `${u}-${nb.to}`;
      const reverseKey = `${nb.to}-${u}`;
      const edgeProb = (edgeProbMap && edgeProbMap.get(edgeKey) !== undefined) ? edgeProbMap.get(edgeKey) : ((edgeProbMap && edgeProbMap.get(reverseKey)) || 0);
      const nodeProb = (nodeProbMap && nodeProbMap.get(nb.to)) || 0;
      const penalized = base * (1 + 2 * edgeProb) + (nodeProb * 50);
      const alt = dist.get(u) + penalized;
      if (alt < (dist.get(nb.to) || Infinity)) {
        dist.set(nb.to, alt);
        prev.set(nb.to, u);
        pq.set(nb.to, alt);
      }
    }
  }
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

// Utilidad: convertir un path de nodos a arreglo de coordenadas [ [lat,lon], ... ]
export function nodesPathToCoords(path, nodeIndex) {
  if (!Array.isArray(path)) return [];
  return path.map(id => {
    const v = nodeIndex.get(id);
    return v ? [v.lat, v.lon] : null;
  }).filter(Boolean);
}

// Ant Colony Optimization (TSP parcial, sin retorno al inicio)
// Recibe matriz de distancias y parámetros (numAnts, iterations, alpha, beta, rho, Q)
export function antColonyTSP(distMat, opts = {}) {
  const n = distMat.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const numAnts = opts.numAnts || Math.max(10, n);
  const iterations = opts.iterations || 120;
  const alpha = opts.alpha || 1;
  const beta = opts.beta || 3;
  const rho = opts.rho || 0.12;
  const Q = opts.Q || 1.0;
  const eps = 1e-9;

  const tau = Array.from({ length: n }, () => Array(n).fill(1.0));
  const eta = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { eta[i][j] = 0; continue; }
      let d = distMat[i][j];
      if (!isFinite(d) || d <= 0) d = 1e9;
      eta[i][j] = 1.0 / (d + eps);
    }
  }

  let bestTour = null;
  let bestLen = Infinity;

  for (let iter = 0; iter < iterations; iter++) {
    const antsTours = [];
    const antsLens = [];

    for (let a = 0; a < numAnts; a++) {
      const visited = new Set([0]);
      const tour = [0];

      while (tour.length < n) {
        const last = tour[tour.length - 1];
        let denom = 0;
        const probs = Array(n).fill(0);
        for (let j = 1; j < n; j++) {
          if (visited.has(j)) { probs[j] = 0; continue; }
          const val = Math.pow(tau[last][j], alpha) * Math.pow(eta[last][j], beta);
          probs[j] = val;
          denom += val;
        }
        let chosen = null;
        if (denom <= 0) {
          const cand = [];
          for (let j = 1; j < n; j++) if (!visited.has(j)) cand.push(j);
          chosen = cand[Math.floor(Math.random() * cand.length)];
        } else {
          let r = Math.random() * denom;
          for (let j = 1; j < n; j++) {
            if (visited.has(j)) continue;
            r -= probs[j];
            if (r <= 0) { chosen = j; break; }
          }
          if (chosen === null) {
            for (let j = 1; j < n; j++) if (!visited.has(j)) { chosen = j; break; }
          }
        }
        tour.push(chosen); visited.add(chosen);
      }

      let L = 0;
      for (let i = 0; i < tour.length - 1; i++) {
        const a1 = tour[i], b1 = tour[i + 1];
        const d = distMat[a1][b1];
        L += (isFinite(d) ? d : 1e9);
      }
      antsTours.push(tour);
      antsLens.push(L);
      if (L < bestLen) { bestLen = L; bestTour = tour.slice(); }
    }

    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) tau[i][j] *= (1 - rho);

    for (let k = 0; k < antsTours.length; k++) {
      const tour = antsTours[k];
      const L = Math.max(antsLens[k], 1e-9);
      const deposit = Q / L;
      for (let i = 0; i < tour.length - 1; i++) {
        const a1 = tour[i], b1 = tour[i + 1];
        tau[a1][b1] += deposit;
        tau[b1][a1] += deposit;
      }
    }
  }

  return bestTour || Array.from({ length: n }, (_, i) => i);
}

// Placeholder CPLEX. Opciones:
// - Invocar backend/script Python para generar docplex_route.json y devolverlo
// - O usar una implementación JS si está disponible
export async function cplexSolver(params) {
  throw new Error('cplexSolver no implementado en algorithms.js. Puedes leer web/data/docplex_route.json o invocar el script Python.');
}

// CommonJS fallback for Node (si no hay soporte ES Modules)
// Detect environment and export accordingly
try {
  // eslint-disable-next-line no-undef
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      dijkstraPuro,
      dijkstraDinamico,
      nodesPathToCoords,
      antColonyTSP,
      cplexSolver,
    };
  }
} catch (_) {}

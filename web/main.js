    // Exclusividad visual de botones de ruta (solo uno activo a la vez)
    (function setupRouteButtonsToggle(){
        const ids = [
            'optimize-order-btn',
            'optimize-order-aco-btn',
            'generate-recommended-route-btn',
            'generate-docplex-route-btn'
        ];
        const btns = ids.map(id=>document.getElementById(id)).filter(Boolean);
        if (!btns.length) return;
        let activeBtn = null;
        const setPrimary = (btn)=>{ btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary'); btn.dataset.active = 'true'; };
        const setSecondary = (btn)=>{ btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary'); btn.dataset.active = 'false'; };
        btns.forEach(btn=>{
            setSecondary(btn);
            btn.addEventListener('click', (ev)=>{
                // If clicking the already active button, deactivate it
                if (activeBtn === btn){
                    setSecondary(btn);
                    activeBtn = null;
                    return; // allow any existing handler to run as well
                }
                // Deactivate previous active
                if (activeBtn){ setSecondary(activeBtn); activeBtn = null; }
                // Activate current
                setPrimary(btn);
                activeBtn = btn;
            }, { capture: true });
        });
    })();
// Execute immediately (IIFE) so dynamically injected script always runs
(function(){
        // --- Filtros de Preferencia de Pago (Colegios) ---
        const filtroPagoMatricula = document.getElementById('filtro-pago-matricula');
        const filtroPagoMensual = document.getElementById('filtro-pago-mensual');
        const filtroPaesPromedio = document.getElementById('filtro-paes-promedio');
        const aplicarFiltroPagoBtn = document.getElementById('aplicar-filtro-pago-btn');
        const limpiarFiltroPagoBtn = document.getElementById('limpiar-filtro-pago-btn');

        let filtroPagoMatriculaValor = '';
        let filtroPagoMensualValor = '';
        let filtroPaesPromedioValor = '';

        function aplicarFiltroPagoColegios() {
            filtroPagoMatriculaValor = filtroPagoMatricula ? filtroPagoMatricula.value : '';
            filtroPagoMensualValor = filtroPagoMensual ? filtroPagoMensual.value : '';
            filtroPaesPromedioValor = filtroPaesPromedio ? filtroPaesPromedio.value : '';
            renderColegiosFiltrados();
        }

// Load and render a route produced by the Docplex script (web/data/docplex_route.json).
// Assumption: the Docplex route references node indices where `0` is the office/start and
// positive integers 1..n map to the selectedProperties list in order (1 -> selectedProperties[0]).
// If counts mismatch the handler will try to do a best-effort mapping and show the route steps.
async function generateDocplexRoute(silent=false) {
    const startTime = performance.now();
    console.log(`[FLUJO] Iniciando carga de ruta CPLEX (optimización exacta)`);
    
    try {
        const res = await fetch('data/docplex_route.json', {cache: 'no-store'});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data || !data.order) {
            alert('docplex_route.json no contiene un campo "order" válido.');
            return;
        }

        if (!data.feasible) {
            if (!silent) alert('El modelo CPLEX devolvió una solución no factible.');
            return;
        }

        // Structure: { feasible: true, objective: ..., order: [0, 2, 1, ...], route: [...], nodes: {...} }
        const visitOrder = data.order;
        const routeSegments = data.route || [];
        const nodeMapping = data.nodes || {};

        if (!Array.isArray(selectedProperties) || selectedProperties.length === 0) {
            if (!silent) alert('No hay propiedades seleccionadas para mapear la ruta CPLEX.');
            return;
        }

        // Map visit order to properties
        // order[0] is start point (index 0), order[1+] are properties (index 1 = selectedProperties[0])
        const mappedStops = [];
        for (let i = 1; i < visitOrder.length; i++) {
            const propIdx = visitOrder[i] - 1; // 1 -> selectedProperties[0]
            if (propIdx >= 0 && propIdx < selectedProperties.length) {
                mappedStops.push(selectedProperties[propIdx]);
            } else {
                console.warn('CPLEX visit order out of range:', visitOrder[i]);
            }
        }

        if (mappedStops.length === 0) {
            if (!silent) alert('No se pudo mapear ninguna parada desde la ruta CPLEX.');
            return;
        }

        // Clear previous route layers
        if (recommendedRouteLayer) {
            map.removeLayer(recommendedRouteLayer);
            recommendedRouteLayer = null;
        }
        if (recommendedMarkers.length) {
            recommendedMarkers.forEach(m => map.removeLayer(m));
            recommendedMarkers = [];
        }

        // Create a layer group for all CPLEX route segments
        recommendedRouteLayer = L.layerGroup().addTo(map);

        console.log(`[CPLEX] Orden de visita: ${visitOrder.join(' -> ')}`);
        console.log(`[CPLEX] Propiedades mapeadas: ${mappedStops.length}`);

        // Render route following OSMnx streets for each segment
        let totalDistance = 0;
        const allCoords = [];
        const stepsContainer = document.getElementById('route-steps-container');
        if (stepsContainer) stepsContainer.innerHTML = '';

        for (let i = 0; i < visitOrder.length - 1; i++) {
            const fromPropIdx = visitOrder[i];
            const toPropIdx = visitOrder[i + 1];
            
            // Get snapped nodes from CPLEX output
            const fromNodeId = nodeMapping[fromPropIdx];
            const toNodeId = nodeMapping[toPropIdx];
            
            if (!fromNodeId || !toNodeId) {
                console.warn(`Missing node mapping for segment ${fromPropIdx} -> ${toPropIdx}`);
                continue;
            }

            // Find mode (if available)
            const segment = routeSegments.find(s => s.from === fromPropIdx && s.to === toPropIdx);
            const mode = segment ? segment.mode : 'caminata';
            const cost = segment ? segment.cost : 0;

            console.log(`[CPLEX] Segmento ${i+1}: ${fromPropIdx} -> ${toPropIdx} (modo: ${mode}, costo: ${cost.toFixed(2)})`);

            // Compute path using Dijkstra on OSMnx graph
            const path = dijkstra(fromNodeId, toNodeId);
            
            if (path && path.length > 1) {
                console.log(`[CPLEX] Path encontrado con ${path.length} nodos`);
                
                // Extract coordinates from node path (always follow streets)
                let segmentCoords = [];
                for (const nodeId of path) {
                    const node = nodeIndex.get(nodeId);
                    if (node) {
                        segmentCoords.push([node.lat, node.lon]);
                    }
                }
                
                if (segmentCoords.length < 2) {
                    console.error(`[CPLEX] Insuficientes coordenadas para segmento ${fromPropIdx} -> ${toPropIdx}`);
                    continue;
                }

                console.log(`[CPLEX] Renderizando con ${segmentCoords.length} coordenadas`);

                // Calculate segment distance
                let segmentDist = 0;
                for (let j = 0; j < path.length - 1; j++) {
                    const n1 = nodeIndex.get(path[j]);


                    const n2 = nodeIndex.get(path[j + 1]);
                    if (n1 && n2) {
                        segmentDist += haversineDistance(n1, n2);
                    }
                }
                totalDistance += segmentDist;

                // Determine color by mode
                let color = '#1E90FF'; // caminata (azul)
                let dashArray = '5, 10';
                if (mode === 'micro') {
                    color = '#FF4500'; // naranja
                    dashArray = null;
                } else if (mode === 'metro') {
                    color = '#6f42c1'; // morado
                    dashArray = null;
                }

                // Draw segment and add to layer group
                const polyline = L.polyline(segmentCoords, {
                    color: color,
                    weight: 5,
                    opacity: 0.8,
                    dashArray: dashArray
                });
                recommendedRouteLayer.addLayer(polyline);

                allCoords.push(...segmentCoords);

                // Add step to UI
                if (stepsContainer) {
                    const stepEl = document.createElement('div');
                    stepEl.className = 'route-step';
                    const fromName = fromPropIdx === 0 ? 'Punto de partida' : `Propiedad ${fromPropIdx}`;
                    const toName = toPropIdx === 0 ? 'Punto de partida' : `Propiedad ${toPropIdx}`;
                    stepEl.innerHTML = `<strong>${i + 1}.</strong> ${fromName} → ${toName}<br>` +
                                       `   Modo: ${mode}, Distancia: ${segmentDist.toFixed(0)}m, Costo: ${cost.toFixed(2)}`;
                    stepsContainer.appendChild(stepEl);
                }
            } else {
                console.warn(`No path found from node ${fromNodeId} to ${toNodeId}`);
            }
        }

        // Add markers for properties
        mappedStops.forEach((p, i) => {
            const m = L.marker([p.lat, p.lon], {
                title: p.title || `Parada ${i+1}`,
                icon: L.divIcon({
                    className: 'property-marker-cplex',
                    html: `<div style="background: #ff4500; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white;">${i+1}</div>`
                })
            });
            m.addTo(map);
            recommendedMarkers.push(m);
        });

        // Fit map to route bounds
        if (allCoords.length > 0) {
            const bounds = L.latLngBounds(allCoords);
            map.fitBounds(bounds, {padding: [40, 40]});
        }

        // Schedule appointments
        mappedStops.forEach((p, i) => scheduleAppointment(p));

        // Start monitoring
        startRouteRefresh();

        const computationTime = performance.now() - startTime;
        
        console.log(`[RUTA] Ruta CPLEX completada - Algoritmo: CPLEX (optimización exacta MILP)`);
        console.log(`[RUTA] Tiempo de renderizado: ${computationTime.toFixed(2)} ms`);
        console.log(`[RUTA] Distancia total: ${totalDistance.toFixed(2)} metros`);
        console.log(`[RUTA] Número de propiedades: ${mappedStops.length}`);
        console.log(`[RUTA] Óptimo: Sí (solución exacta garantizada)`);
        console.log(`[RUTA] Valor objetivo: ${data.objective.toFixed(2)}`);
        
        // Store metrics
        routeMetrics.docplex = {
            algorithm: 'CPLEX (MILP)',
            computationTime: computationTime,
            totalDistance: totalDistance,
            numProperties: mappedStops.length,
            isOptimal: true,
            optimality: 'Exacto',
            objective: data.objective
        };
        
        compareRoutes();

        if (!silent) {
            console.log(`Ruta CPLEX renderizada. Objetivo: ${data.objective.toFixed(2)}`);
            const legend = document.getElementById('legend-recommended-route');
            if (legend) legend.innerText = `CPLEX: objetivo=${data.objective.toFixed(2)}, distancia=${totalDistance.toFixed(0)}m`;
        }

    } catch (err) {
        console.error('Error loading CPLEX route:', err);
        if (!silent) alert('Error cargando docplex_route.json: ' + err.message);
    }
}

    // Function to compare routes and determine the best
    function compareRoutes() {
        const routes = Object.values(routeMetrics).filter(r => r !== null);
        if (routes.length === 0) return;
        
        console.log(`[COMPARACIÓN] === COMPARACIÓN DE RUTAS ===`);
        console.log(`[COMPARACIÓN] Total de rutas generadas: ${routes.length}`);
        
        // Find best by distance (for routing algorithms)
        const routingRoutes = routes.filter(r => r.algorithm !== 'Multimodal');
        if (routingRoutes.length > 0) {
            const bestByDistance = routingRoutes.reduce((best, current) => 
                (current.totalDistance < best.totalDistance) ? current : best
            );
            console.log(`[COMPARACIÓN] Mejor ruta por distancia: ${bestByDistance.algorithm} (${bestByDistance.totalDistance.toFixed(2)} m)`);
        }
        
        // Find best by time (for multimodal)
        const multimodalRoute = routes.find(r => r.algorithm === 'Multimodal');
        if (multimodalRoute) {
            console.log(`[COMPARACIÓN] Ruta multimodal: ${multimodalRoute.totalTime.toFixed(1)} min, ${multimodalRoute.totalDistance.toFixed(2)} m`);
        }
        
        // Find fastest computation
        const fastestComp = routes.reduce((fastest, current) => 
            (current.computationTime < fastest.computationTime) ? current : fastest
        );
        console.log(`[COMPARACIÓN] Algoritmo más rápido: ${fastestComp.algorithm} (${fastestComp.computationTime.toFixed(2)} ms)`);
        
        // Determine overall best
        let bestRoute = null;
        if (multimodalRoute) {
            // If multimodal exists, it's probably the most practical
            bestRoute = multimodalRoute;
            console.log(`[COMPARACIÓN] 🏆 MEJOR RUTA RECOMENDADA: ${bestRoute.algorithm} (considera transporte público)`);
        } else if (routingRoutes.length > 0) {
            // Otherwise, best by distance
            bestRoute = routingRoutes.reduce((best, current) => 
                (current.totalDistance < best.totalDistance) ? current : best
            );
            console.log(`[COMPARACIÓN] 🏆 MEJOR RUTA RECOMENDADA: ${bestRoute.algorithm} (menor distancia)`);
        }
        
        if (bestRoute) {
            console.log(`[COMPARACIÓN] Detalles:`);
            console.log(`[COMPARACIÓN]   - Algoritmo: ${bestRoute.algorithm}`);
            console.log(`[COMPARACIÓN]   - Tiempo de cómputo: ${bestRoute.computationTime.toFixed(2)} ms`);
            if (bestRoute.totalTime) {
                console.log(`[COMPARACIÓN]   - Tiempo total: ${bestRoute.totalTime.toFixed(1)} min`);
            }
            console.log(`[COMPARACIÓN]   - Distancia total: ${bestRoute.totalDistance.toFixed(2)} m`);
            console.log(`[COMPARACIÓN]   - Óptimo: ${bestRoute.optimality}`);
        }
        
        console.log(`[COMPARACIÓN] === FIN COMPARACIÓN ===`);
    }

        // Wire the Docplex button (if present) to the handler
        const genDocplexBtn = document.getElementById('generate-docplex-route-btn');
        if (genDocplexBtn) genDocplexBtn.addEventListener('click', async () => {
            console.log('[CPLEX] Botón presionado');
            
            // Execute CPLEX optimization on backend
            if (!selectedProperties.length) {
                alert('Selecciona propiedades primero antes de ejecutar CPLEX.');
                return;
            }
            
            if (!startPointMarker) {
                alert('Define un punto de partida antes de ejecutar CPLEX.');
                return;
            }
            
            const startLatLng = startPointMarker.getLatLng();
            
            // Prepare input data
            const inputData = {
                startPoint: {
                    lat: startLatLng.lat,
                    lng: startLatLng.lng
                },
                stops: selectedProperties.map(p => ({
                    id: p.id,
                    lat: p.lat,
                    lng: p.lon,
                    title: p.title || p.nombre || 'Propiedad'
                }))
            };
            
            console.log('[CPLEX] Enviando datos al backend:', inputData);
            
            try {
                // Show loading indicator
                genDocplexBtn.disabled = true;
                genDocplexBtn.textContent = '⏳ Optimizando...';
                
                // Call backend API
                const response = await fetch('http://localhost:5000/run-cplex', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(inputData)
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP ${response.status}`);
                }
                
                const result = await response.json();
                console.log('[CPLEX] Backend response:', result);
                
                // Wait a moment for file to be written
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Now load and render the route
                await generateDocplexRoute(false);
                
            } catch (error) {
                console.error('[CPLEX] Error ejecutando optimización:', error);
                alert(`Error ejecutando CPLEX: ${error.message}\n\nAsegúrate de que el servicio API esté corriendo (docker-compose up -d)`);
            } finally {
                // Restore button state
                genDocplexBtn.disabled = false;
                genDocplexBtn.textContent = '📐 Ciplex';
            }
        });

        function limpiarFiltroPagoColegios() {
            if (filtroPagoMatricula) filtroPagoMatricula.value = '';
            if (filtroPagoMensual) filtroPagoMensual.value = '';
            if (filtroPaesPromedio) filtroPaesPromedio.value = '';
            filtroPagoMatriculaValor = '';
            filtroPagoMensualValor = '';
            filtroPaesPromedioValor = '';
            renderColegiosFiltrados();
        }

        function renderColegiosFiltrados() {
            colegiosLayer.clearLayers();
            let filtrados = colegiosPois;
            if (filtroPagoMatriculaValor) {
                filtrados = filtrados.filter(c => (c.pago_matricula || '').toUpperCase() === filtroPagoMatriculaValor.toUpperCase());
            }
            if (filtroPagoMensualValor) {
                filtrados = filtrados.filter(c => (c.pago_mensual || '').toUpperCase() === filtroPagoMensualValor.toUpperCase());
            }
            if (filtroPaesPromedioValor) {
                filtrados = filtrados.filter(c => {
                    const paes = Number(c.paes_promedio);
                    if (isNaN(paes)) return false;
                    if (filtroPaesPromedioValor === '300-400') return paes >= 300 && paes < 400;
                    if (filtroPaesPromedioValor === '400-500') return paes >= 400 && paes < 500;
                    if (filtroPaesPromedioValor === '500-800') return paes >= 500 && paes <= 800;
                    return true;
                });
            }
            filtrados.forEach(p => {
                const popupContent = `
                    <div style="width:260px;">
                        <h4 style="margin:0 0 10px 0; color:#10B981; font-size:14px;">
                            🏫 ${p.nombre}
                        </h4>
                        <div style="font-size:12px; line-height:1.6;">
                            <p style="margin:4px 0;">
                                <b>🏷️ RBD:</b> ${p.rbd}<br/>
                                <b>📚 Niveles:</b> ${p.niveles}<br/>
                                <b>🎓 Tipo:</b> ${p.tipo}<br/>
                                <b>👥 Matrícula:</b> ${p.matricula} estudiantes<br/>
                                <b>📍 ${p.comuna}</b><br/>
                                <b>💵 Matrícula:</b> ${p.pago_matricula}<br/>
                                <b>💸 Mensualidad:</b> ${p.pago_mensual}<br/>
                                <b>📊 PAES promedio:</b> ${typeof p.paes_promedio === 'number' && !isNaN(p.paes_promedio) ? p.paes_promedio : 'N/D'}
                            </p>
                        </div>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.colegio }).bindPopup(popupContent);
                colegiosLayer.addLayer(m);
            });
            setText('debug-colegios', `colegios cargados: ${filtrados.length}`);
            setText('colegios-count', filtrados.length);
        }

        if (aplicarFiltroPagoBtn) aplicarFiltroPagoBtn.addEventListener('click', aplicarFiltroPagoColegios);
        if (limpiarFiltroPagoBtn) limpiarFiltroPagoBtn.addEventListener('click', limpiarFiltroPagoColegios);
    // Early guard: ensure Leaflet (L) is available to avoid uncaught ReferenceError
    const dmElem = document.getElementById('debug-mainjs');
    if (typeof L === 'undefined') {
        const msg = 'Leaflet no cargado (L undefined). Comprueba conexión a CDN o instala archivos locales en /web/vendor/';
        console.error(msg);
        if (dmElem) dmElem.textContent = msg;
        // Add a visible notice in the controls panel
        try {
            const controls = document.getElementById('controls');
            if (controls) {
                const alertBox = document.createElement('div');
                alertBox.style.background = '#ffdede';
                alertBox.style.border = '1px solid #ff8a8a';
                alertBox.style.padding = '8px';
                alertBox.style.marginBottom = '8px';
                alertBox.textContent = 'ERROR: La librería Leaflet no se cargó. Revisa conexión a Internet o coloca leaflet.js/leaflet.css en /web/vendor/';
                controls.insertBefore(alertBox, controls.firstChild);
            }
        } catch (e) { console.warn('Could not insert leaflet missing notice', e); }
        return; // stop initialization to avoid runtime exceptions
    }

    // Inicialización del mapa
    const map = L.map('map').setView([-33.43, -70.60], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Layers
    const housesLayer = L.layerGroup().addTo(map);
    const cecosfLayer = L.layerGroup().addTo(map);
    const cosamLayer = L.layerGroup().addTo(map);
    const coninLayer = L.layerGroup().addTo(map);
    const cesfamLayer = L.layerGroup().addTo(map);
    const centroSaludLayer = L.layerGroup().addTo(map);
    const centroMedicoLayer = L.layerGroup().addTo(map);
    const clinicaDentalLayer = L.layerGroup().addTo(map);
    const clinicaLayer = L.layerGroup().addTo(map);
    const cdtLayer = L.layerGroup().addTo(map);
    const direccionSaludLayer = L.layerGroup().addTo(map);
    const hospitalLayer = L.layerGroup().addTo(map);
    const laboratorioLayer = L.layerGroup().addTo(map);
    const praisLayer = L.layerGroup().addTo(map);
    const sapuLayer = L.layerGroup().addTo(map);
    const unidadSaludFuncionariosLayer = L.layerGroup().addTo(map);
    const vacunatorioLayer = L.layerGroup().addTo(map);
    const metroLayer = L.layerGroup().addTo(map);
    const paraderosLayer = L.layerGroup().addTo(map);
    const edgesLayer = L.layerGroup().addTo(map);
    const routeOSMLayer = L.layerGroup(); // not added by default
    let routeOSMGeoJson = null; // hold L.geoJSON layer when loaded
    const carabinerosLayer = L.layerGroup().addTo(map);
    const feriasLayer = L.layerGroup().addTo(map);
    const institutosLayer = L.layerGroup().addTo(map);
    const universidadesPrivadasLayer = L.layerGroup().addTo(map);
    const universidadesEstatalesLayer = L.layerGroup().addTo(map);
    const colegiosLayer = L.layerGroup().addTo(map);
    const jardinesLayer = L.layerGroup().addTo(map);
    
    // Amenazas layers
    const activeThreatsLayer = L.layerGroup(); // not added by default
    const threatProbabilitiesLayer = L.layerGroup(); // not added by default
    let activeThreatsData = null;
    let edgeProbabilitiesData = null;
    let nodeProbabilitiesData = null;

    // Graph data (loaded from data/nodes.geojson and data/edges.geojson)
    let nodesGeoJSON = null;
    let edgesGeoJSON = null;
    const nodeIndex = new Map(); // nodeId -> {lat, lon}
    const adj = new Map(); // nodeId -> Array<{to, weight}>
    const edgeLookup = new Map(); // "u-v" -> feature
    const edgeProbMap = new Map(); // "u-v" -> probability (0..1)
    const nodeProbMap = new Map(); // nodeId -> probability (0..1)

    // Icons
    const icons = {
        // Casas - Orange (tipo) + Red/Gold (operación)
        casaVenta: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FB8C00 50%, #E53935 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendo: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FB8C00 50%, #8E24AA 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Departamentos - Blue (tipo) + Red/Gold (operación)
        deptoVenta: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #039BE5 50%, #E53935 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendo: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #039BE5 50%, #8E24AA 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Iconos seleccionados (con borde verde)
        casaVentaSelected: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FB8C00 50%, #E53935 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendoSelected: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FB8C00 50%, #8E24AA 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoVentaSelected: L.divIcon({
            html: '<div style="width: 33px; height: 33px; background: linear-gradient(90deg, #039BE5 50%, #E53935 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendoSelected: L.divIcon({
            html: '<div style="width: 33px; height: 33px; background: linear-gradient(90deg, #039BE5 50%, #8E24AA 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Iconos auxiliares
        health: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        cecosf: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        cosam: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        conin: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        cesfam: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        centroSalud: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        centroMedico: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        clinicaDental: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        clinica: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        cdt: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        direccionSalud: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        hospital: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        laboratorio: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        prais: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        sapu: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        unidadSaludFuncionarios: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        vacunatorio: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold; font-size: 18px; font-family: Arial, sans-serif;">H</span></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        metro: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: white; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><img src="icon/metro_icon.png" style="width: 20px; height: 20px; object-fit: contain;"/></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        carabineros: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #E53935; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><img src="icon/police_pinlet.svg" style="width: 16px; height: 16px; object-fit: contain; filter: brightness(0) invert(1);"/></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        ferias: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        universidad: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #757575; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        universidadPrivada: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #9333EA; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        universidadEstatal: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #2563EB; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        colegio: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #757575; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        jardin: L.divIcon({
            html: '<div style="width: 28px; height: 28px; background: #757575; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.1.6 2.05 1.5 2.57V9H9.5C8.67 9 8 9.67 8 10.5v3c0 .83.67 1.5 1.5 1.5h1v7h3v-7h1c.83 0 1.5-.67 1.5-1.5v-3c0-.83-.67-1.5-1.5-1.5H13.5V7.57c.9-.52 1.5-1.47 1.5-2.57 0-1.66-1.34-3-3-3z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        })
    };
    icons.selectedHome = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    // paradero icon
    icons.paradero = L.divIcon({
        html: '<div style="width: 28px; height: 28px; background: #000000; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg></div>',
        className: 'custom-div-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24]
    });

    // State
    let housesData = [];
    let additionalHouses = [];
    let houseMarkers = [];
    let cecosfPois = [];
    let cosamPois = [];
    let coninPois = [];
    let cesfamPois = [];
    let centroSaludPois = [];
    let centroMedicoPois = [];
    let clinicaDentalPois = [];
    let clinicaPois = [];
    let cdtPois = [];
    let direccionSaludPois = [];
    let hospitalPois = [];
    let laboratorioPois = [];
    let praisPois = [];
    let sapuPois = [];
    let unidadSaludFuncionariosPois = [];
    let vacunatorioPois = [];
    let metroPois = [];
    let startPointMarker = null;
    let paraderos = [];
    let selectedProperties = [];
    let carabinerosPois = [];
    let feriasPois = [];
    let institutosPois = [];
    let universidadesPrivadasPois = [];
    let universidadesEstatalesPois = [];
    let colegiosPois = [];
    let jardinesPois = [];
    // Layers/markers for recommended route rendered from Docplex output
    let recommendedRouteLayer = null;
    let recommendedMarkers = [];
    
    // Route metrics storage for comparison
    let routeMetrics = {
        nearestNeighbor: null,
        aco: null,
        multimodal: null,
        docplex: null
    };
    
    // Scheduled appointments threat system
    let scheduledAppointments = new Map(); // houseId -> {houseData, scheduledTime, isCancelled, cancelProbability}
    let routeRefreshInterval = null;
    const CANCEL_PROBABILITY = 0.20; // 20% chance of cancellation
    const ROUTE_REFRESH_INTERVAL = 30000; // 30 seconds
    
    // Smart Search Filters State
    let smartSearchFilters = {
        enabled: false,
        tipoCasa: true,
        tipoDepto: true,
        opVenta: true,
        opArriendo: true,
        dormitoriosMin: 0,
        banosMin: 0,
        precioMin: 0,
        precioMax: null,
        m2ConstruidoMin: 0,
        m2TerrenoMin: 0,
        m2SuperficieMin: 0,
        conTerraza: false
    };
    
    // Filter UI elements (initialized after DOM queries)
    const filterTypeCasaCb = document.getElementById('search-type-casa');
    const filterTypeDeptoCb = document.getElementById('search-type-depto');
    const filterOpVentaCb = document.getElementById('search-op-venta');
    const filterOpArriendoCb = document.getElementById('search-op-arriendo');

    // Controls (some are optional depending on index.html version)
    // Controls
    const comunaFilter = null; // comuna filter removed from UI
    const startPointBtn = document.getElementById('start-point-btn');
    const filterByMetroCb = document.getElementById('filter-by-metro');
    const filterByCecosfCb = document.getElementById('filter-by-cecosf');
    const filterByCosamCb = document.getElementById('filter-by-cosam');
    const filterByConinCb = document.getElementById('filter-by-conin');
    const filterByCesfamCb = document.getElementById('filter-by-cesfam');
    const filterByCentroSaludCb = document.getElementById('filter-by-centro-salud');
    const filterByCentroMedicoCb = document.getElementById('filter-by-centro-medico');
    const filterByClinicaDentalCb = document.getElementById('filter-by-clinica-dental');
    const filterByClinicaCb = document.getElementById('filter-by-clinica');
    const filterByCdtCb = document.getElementById('filter-by-cdt');
    const filterByDireccionSaludCb = document.getElementById('filter-by-direccion-salud');
    const filterByHospitalCb = document.getElementById('filter-by-hospital');
    const filterByLaboratorioCb = document.getElementById('filter-by-laboratorio');
    const filterByPraisCb = document.getElementById('filter-by-prais');
    const filterBySapuCb = document.getElementById('filter-by-sapu');
    const filterByUnidadSaludFuncionariosCb = document.getElementById('filter-by-unidad-salud-funcionarios');
    const filterByVacunatorioCb = document.getElementById('filter-by-vacunatorio');
    const filterByParaderosCb = document.getElementById('filter-by-paraderos');
    const filterByCarabinerosCb = document.getElementById('filter-by-carabineros');
    const filterByFeriasCb = document.getElementById('filter-by-ferias');
    const filterByInstitutosCb = document.getElementById('filter-by-institutos');
    const filterByUniversidadesPrivadasCb = document.getElementById('filter-by-universidades-privadas');
    const filterByUniversidadesEstatalesCb = document.getElementById('filter-by-universidades-estatales');
    const filterByColegiosCb = document.getElementById('filter-by-colegios');
    const filterByJardinesCb = document.getElementById('filter-by-jardines');
    const metroRadiusInput = document.getElementById('metro-radius'); // legacy
    const proximityRadiusInput = document.getElementById('proximity-radius');
    const applyProximityFiltersBtn = document.getElementById('apply-proximity-filters-btn');
    const clearProximityFiltersBtn = document.getElementById('clear-proximity-filters-btn');
    const applyPoiFiltersBtn = document.getElementById('apply-poi-filters'); // optional
    const filterHealthCb = document.getElementById('filter-health'); // optional
    const filterMetroCb = document.getElementById('filter-metro'); // optional
    const showHealthCb = document.getElementById('show-health-layer'); // optional
    const showMetroCb = document.getElementById('show-metro-layer'); // optional
    const showHousesCb = document.getElementById('show-houses-layer'); // optional
    const poiRadiusInput = document.getElementById('poi-radius'); // optional

    // Smart Search Controls
    const applySmartSearchBtn = document.getElementById('apply-smart-search-btn');
    const clearSmartSearchBtn = document.getElementById('clear-smart-search-btn');
    const searchDormitoriosMin = document.getElementById('search-dormitorios-min');
    const searchBanosMin = document.getElementById('search-banos-min');
    const searchPrecioMin = document.getElementById('search-precio-min');
    const searchPrecioMax = document.getElementById('search-precio-max');
    const searchM2ConstruidoMin = document.getElementById('search-m2-construido-min');
    const searchM2TerrenoMin = document.getElementById('search-m2-terreno-min');
    const searchM2SuperficieMin = document.getElementById('search-m2-superficie-min');
    const searchConTerraza = document.getElementById('search-con-terraza');

    // Safe DOM helpers
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

    const debugMain = id => { const el = document.getElementById(id); return el; };

    // Helpers
    function haversineDistance(a, b) {
        const R = 6371000; // meters
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

    // Load and merge houses
    function loadHouses() {
        // Load multiple sources: casas arriendo + casa venta + depto venta + depto arriendo
        const casasArriendo = fetch('data/casas-arriendo-toctoc.json').then(r => r.json()).catch(e => { console.error('casas-arriendo-toctoc.json load error', e); return []; });
        const casasVenta = fetch('data/casa-venta-toctoc.json').then(r => r.json()).catch(e => { console.warn('casa-venta-toctoc.json missing', e); return []; });
        const deptoVenta = fetch('data/depto-venta-toctoc.json').then(r => r.json()).catch(e => { console.warn('depto-venta-toctoc.json missing', e); return []; });
        const deptoArriendo = fetch('data/depto-arriendo-toctoc.json').then(r => r.json()).catch(e => { console.warn('depto-arriendo-toctoc.json missing', e); return []; });

        return Promise.all([casasArriendo, casasVenta, deptoVenta, deptoArriendo]).then(([ca, cv, dv, da]) => {
            // annotate and merge all sources
            const annotateSource = (items, sourceName, propertyType, operation) => (items || []).map(item => {
                // prefer existing id or generate one
                if (!item.id && item._id) item.id = item._id;
                // annotate for filtering
                item._source = sourceName;
                if (propertyType) item._propertyType = propertyType; // 'casa'|'departamento'
                if (operation) item._operation = operation; // 'venta'|'arriendo'
                return item;
            });

            const caAnnotated = annotateSource(ca, 'casa-arriendo-toctoc', 'casa', 'arriendo');
            const cvAnnotated = annotateSource(cv, 'casa-venta-toctoc', 'casa', 'venta');
            const dvAnnotated = annotateSource(dv, 'depto-venta-toctoc', 'departamento', 'venta');
            const daAnnotated = annotateSource(da, 'depto-arriendo-toctoc', 'departamento', 'arriendo');

            // Merge all sources
            const byId = new Map();
            [...caAnnotated, ...cvAnnotated, ...dvAnnotated, ...daAnnotated].forEach(h => {
                if (!byId.has(h.id)) byId.set(h.id, h);
            });
            housesData = Array.from(byId.values());

            setText('debug-casas', `casas cargadas: ${housesData.length}`);
            populateComunas(housesData);
            displayHouses(housesData);
        });
    }

    function populateComunas(houses) {
        // comuna UI removed - no-op
    }

    // Determina el icono correcto según el tipo de propiedad y operación
    function getPropertyIcon(house, isSelected = false) {
        // Determinar tipo de propiedad
        let propType = (house._propertyType || house.tipo_inmueble || house.tipo || house.property_type || '').toString().toLowerCase();
        const isDepto = propType.includes('depart') || propType.includes('dpto') || propType.includes('depto') || propType === 'departamento';
        
        // Determinar operación
        const op = (house._operation || house.operacion || house.operation || house.tipo_anuncio || '').toString().toLowerCase();
        const isVenta = op.includes('venta') || op === 'venta';
        const isArriendo = op.includes('arri') || op === 'arriendo';
        
        // Retornar el icono apropiado
        if (isSelected) {
            if (isDepto) {
                return isArriendo ? icons.deptoArriendoSelected : icons.deptoVentaSelected;
            } else {
                return isArriendo ? icons.casaArriendoSelected : icons.casaVentaSelected;
            }
        } else {
            if (isDepto) {
                return isArriendo ? icons.deptoArriendo : icons.deptoVenta;
            } else {
                return isArriendo ? icons.casaArriendo : icons.casaVenta;
            }
        }
    }


    // Convierte la URL de imagen pequeña a grande
    function getHighQualityImageUrl(originalUrl) {
        if (!originalUrl) return null;
        
        // TocToc usa 's_wm_' para imágenes pequeñas y 'n_wm_' para imágenes grandes
        // También cambia la extensión de .jpg a .webp en algunos casos
        
        try {
            let highQualityUrl = originalUrl;
            
            // Reemplazar s_wm_ por n_wm_
            if (highQualityUrl.includes('/s_wm_')) {
                highQualityUrl = highQualityUrl.replace('/s_wm_', '/n_wm_');
                console.log('✨ URL de imagen mejorada (s_wm → n_wm):', highQualityUrl);
            }
            
            // Probar versión .webp si termina en .jpg
            if (highQualityUrl.endsWith('.jpg')) {
                const webpUrl = highQualityUrl.replace(/\.jpg$/, '.webp');
                console.log('✨ También disponible en WebP:', webpUrl);
                return webpUrl; // WebP es más moderna y ligera
            }
            
            return highQualityUrl;
        } catch (err) {
            console.warn('⚠️ Error mejorando URL de imagen:', err.message);
            return originalUrl;
        }
    }

    // Extrae la imagen real desde el HTML de TocToc usando múltiples proxies
    async function extractImageFromTocToc(url) {
        if (!url) return null;
        
        try {
            console.log('🔍 Intentando extraer imagen desde URL de TocToc:', url);
            
            // Lista de proxies CORS a intentar
            const proxies = [
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://thingproxy.freeboard.io/fetch/${url}`
            ];
            
            let html = null;
            let successProxy = null;
            
            // Intentar cada proxy hasta que uno funcione
            for (const proxyUrl of proxies) {
                try {
                    console.log('🔄 Intentando proxy:', proxyUrl.split('?')[0]);
                    
                    const resp = await fetch(proxyUrl, { 
                        signal: AbortSignal.timeout(8000) // timeout de 8 segundos
                    });
                    
                    if (resp.ok) {
                        html = await resp.text();
                        
                        // Verificar que no sea una página de error (AWS WAF, etc)
                        if (html.length > 5000 && !html.includes('window.gokuProps') && !html.includes('aws')) {
                            successProxy = proxyUrl.split('?')[0];
                            console.log('✅ HTML obtenido correctamente con proxy:', successProxy);
                            break;
                        } else {
                            console.warn('⚠️ Proxy retornó página de error o bloqueada');
                            html = null;
                        }
                    }
                } catch (err) {
                    console.warn('❌ Error con proxy:', err.message);
                    continue;
                }
            }
            
            if (!html) {
                console.warn('⚠️ Todos los proxies fallaron, no se pudo obtener el HTML');
                return null;
            }
            
            console.log('✅ HTML recibido, tamaño:', html.length, 'bytes');
            
            // Estrategia 1: Buscar img con clases específicas de galería (flexible con orden de atributos)
            const patterns = [
                // Buscar img-gal (con src antes o después de class)
                /<img[^>]*class="[^"]*img-gal[^"]*"[^>]*src=["']([^"']+)["']/i,
                /<img[^>]*src=["']([^"']+)["'][^>]*class="[^"]*img-gal[^"]*"/i,
                // Buscar bg-img-gal
                /<img[^>]*class="[^"]*bg-img-gal[^"]*"[^>]*src=["']([^"']+)["']/i,
                /<img[^>]*src=["']([^"']+)["'][^>]*class="[^"]*bg-img-gal[^"]*"/i,
                // Buscar cualquier img con "gal" en la clase
                /<img[^>]*class="[^"]*gal[^"]*"[^>]*src=["']([^"']+)["']/i,
                /<img[^>]*src=["']([^"']+)["'][^>]*class="[^"]*gal[^"]*"/i
            ];
            
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    console.log('🖼️ Imagen extraída con patrón de galería');
                    console.log('🖼️ URL:', match[1]);
                    return match[1];
                }
            }
            
            // Estrategia 2: Buscar dentro de cf-galeria
            const galeriaMatch = html.match(/<section[^>]*class=["']?[^"']*cf-galeria[^"']*["']?[^>]*>([\s\S]*?)<\/section>/i);
            
            if (galeriaMatch) {
                console.log('✅ Encontrada sección cf-galeria');
                const galeriaContent = galeriaMatch[1];
                
                // Buscar todas las imágenes dentro de la galería
                const imgMatches = galeriaContent.match(/<img[^>]*>/gi);
                
                if (imgMatches && imgMatches.length > 0) {
                    console.log(`✅ Encontradas ${imgMatches.length} imágenes en galería`);
                    
                    // Extraer el src de la primera imagen
                    for (const imgTag of imgMatches) {
                        const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
                        if (srcMatch && srcMatch[1] && srcMatch[1].includes('cloudfront')) {
                            console.log('🖼️ Imagen extraída desde galería:', srcMatch[1]);
                            return srcMatch[1];
                        }
                    }
                }
            }
            
            // Estrategia 3: Buscar cualquier imagen de cloudfront (CDN de TocToc)
            const cloudfrontMatches = html.match(/src=["'](https:\/\/d1cfu8v5n1wsm\.cloudfront\.net\/toctoc\/fotos[^"']+)["']/gi);
            if (cloudfrontMatches && cloudfrontMatches.length > 0) {
                // Extraer la primera URL
                const firstMatch = cloudfrontMatches[0].match(/src=["']([^"']+)["']/i);
                if (firstMatch && firstMatch[1]) {
                    console.log('🖼️ Imagen extraída de CloudFront:', firstMatch[1]);
                    return firstMatch[1];
                }
            }
            
            console.warn('⚠️ No se encontró imagen en el HTML de TocToc');
            console.log('Muestra del HTML (primeros 500 caracteres):', html.substring(0, 500));
            return null;
        } catch (err) {
            console.warn('❌ Error extrayendo imagen de TocToc:', err.message);
            return null;
        }
    }

    // Consulta tráfico TomTom y retorna promesa con resultado actual
    async function getTrafficLevelTomTomActual(lat, lon) {
        const apiKey = "pg1U3ZBt90bqfmOe4J6vTV2OegHIsz1X";
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${apiKey}`;
        try {
            const resp = await fetch(url);
            const data = await resp.json();
            if (data && data.flowSegmentData) {
                const currentSpeed = data.flowSegmentData.currentSpeed;
                const freeFlowSpeed = data.flowSegmentData.freeFlowSpeed;
                
                // Calcular nivel de congestión: 1 - (currentSpeed / freeFlowSpeed)
                let congestioRatio = 0;
                let nivel = "Desconocido";
                let emoji = "❓";
                
                if (freeFlowSpeed && currentSpeed) {
                    congestioRatio = 1 - (currentSpeed / freeFlowSpeed);
                    // Interpretar según rango
                    if (congestioRatio <= 0.25) {
                        nivel = "Bajo (Fluido)";
                        emoji = "🟢";
                    } else if (congestioRatio <= 0.50) {
                        nivel = "Moderado (Algo lento)";
                        emoji = "🟡";
                    } else if (congestioRatio <= 0.75) {
                        nivel = "Alto (Congestionado)";
                        emoji = "🔴";
                    } else {
                        nivel = "Crítico (Muy congestionado)";
                        emoji = "⚫";
                    }
                }
                
                return {
                    nivel,
                    emoji,
                    congestioRatio,
                    currentSpeed,
                    freeFlowSpeed
                };
            } else {
                return { nivel: "Sin datos" };
            }
        } catch (err) {
            return { nivel: "Error" };
        }
    }

    function displayHouses(houses) {
        housesLayer.clearLayers();
        houseMarkers = [];
        houses.forEach(house => {
            if (house.lat && house.lon) {
                // Apply type/operation filters (if UI present)
                if (typeof matchesTypeOperation === 'function' && !matchesTypeOperation(house)) return;

                // Determinar el icono según tipo y operación
                const icon = getPropertyIcon(house);
                const marker = L.marker([house.lat, house.lon], { icon: icon });
                
                // Determinar tipo de propiedad
                let propType = (house._propertyType || house.tipo_inmueble || house.tipo || house.property_type || '').toString().toLowerCase();
                const isDepto = propType.includes('depart') || propType.includes('dpto') || propType.includes('depto') || propType === 'departamento';
                const tipoPropiedad = isDepto ? 'Departamento' : 'Casa';
                
                // Determinar operación
                const op = (house._operation || house.operacion || house.operation || house.tipo_anuncio || '').toString().toLowerCase();
                const operacion = op.includes('venta') ? 'Venta' : 'Arriendo';
                
                // Formatear precios (detectar si están invertidos)
                // Lógica: precio_peso siempre debe ser mayor que precio_uf (millones vs miles)
                let precioEnPesos, precioEnUF;
                
                if (house.precio_uf && house.precio_peso) {
                    // Si precio_uf > precio_peso, están invertidos
                    if (house.precio_uf > house.precio_peso) {
                        // Están invertidos
                        precioEnPesos = house.precio_uf;
                        precioEnUF = house.precio_peso;
                    } else {
                        // Están correctos
                        precioEnPesos = house.precio_peso;
                        precioEnUF = house.precio_uf;
                    }
                } else {
                    // Si falta alguno, usar lo que haya
                    precioEnPesos = house.precio_peso || house.precio_uf || 0;
                    precioEnUF = house.precio_uf || house.precio_peso || 0;
                }
                
                const formattedPricePeso = precioEnPesos ? 
                    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(precioEnPesos) : 'N/A';
                const formattedPriceUF = precioEnUF ? 
                    `${precioEnUF.toFixed(2)} UF` : 'N/A';
                
                // Formatear fecha
                const fechaPublicacion = house.fecha_publicacion || 'N/A';
                
                // Preparar contenido inicial de la imagen
                const imgInitial = house.imagen ? 
                    `<img src="${house.imagen}" style="width:100%; height:100%; object-fit:cover;"/>` :
                    `<div style="text-align:center; color:#9CA3AF; font-size:10px;">
                        <div style="font-size:24px; margin-bottom:4px;">🖼️</div>
                        <div>Sin imagen</div>
                    </div>`;
                
                // Construir popup moderno horizontal compacto
                const popupBase = `
                    <div style="width:420px; max-width:90vw; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <!-- Header con imagen y título -->
                        <div style="display:flex; gap:12px; margin-bottom:10px;">
                            <div id="img-container-${house.id}" style="flex-shrink:0; width:200px; height:140px; overflow:hidden; border-radius:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); background:#F3F4F6; display:flex; align-items:center; justify-content:center;">
                                ${imgInitial}
                            </div>
                            <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
                                <div>
                                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                                        <span style="background:#7C3AED; color:white; padding:2px 8px; border-radius:12px; font-size:9px; font-weight:600; text-transform:uppercase;">${tipoPropiedad}</span>
                                        <span style="background:#10B981; color:white; padding:2px 8px; border-radius:12px; font-size:9px; font-weight:600; text-transform:uppercase;">${operacion}</span>
                                    </div>
                                    <h3 style="margin:0 0 4px 0; font-size:13px; font-weight:700; color:#1F2937; line-height:1.3; word-wrap:break-word; overflow-wrap:break-word;">${house.titulo || 'Propiedad sin título'}</h3>
                                    <p style="margin:0; font-size:11px; color:#6B7280;">📍 ${house.comuna || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Precio -->
                        <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:8px; border-radius:8px; margin-bottom:10px; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
                            <p style="margin:0; font-size:16px; font-weight:800; color:white;">${formattedPricePeso}</p>
                            <p style="margin:2px 0 0 0; font-size:11px; color:rgba(255,255,255,0.9); font-weight:500;">${formattedPriceUF}</p>
                        </div>
                        
                        <!-- Características en grid horizontal -->
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; padding:10px; background:#F9FAFB; border-radius:8px; margin-bottom:10px;">
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">🛏️</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${house.dormitorios || 'N/A'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">Dormitorios</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">🚿</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${house.baños || house.banos || 'N/A'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">Baños</div>
                            </div>
                            ${isDepto ? `
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">📏</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${house.m2_superficie || 'N/A'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">M² Superficie</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">🌿</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${(house.m2_terraza && house.m2_terraza > 0) ? house.m2_terraza : '-'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">M² Terraza</div>
                            </div>
                            ` : `
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">📐</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${house.m2_construido || 'N/A'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">M² Construido</div>
                            </div>
                            <div style="text-align:center;">
                                <div style="font-size:18px; margin-bottom:2px;">🏞️</div>
                                <div style="font-weight:700; font-size:14px; color:#1F2937;">${house.m2_terreno || 'N/A'}</div>
                                <div style="font-size:9px; color:#6B7280; text-transform:uppercase; font-weight:600; white-space:nowrap;">M² Terreno</div>
                            </div>
                            `}
                        </div>
                        
                        <!-- Información de tráfico -->
                        <div id="trafico-casa-${house.id}" style="padding:10px; background:#FEF3C7; border-radius:8px; margin-bottom:10px; border-left:3px solid #F59E0B;">
                            <p style="margin:0; font-size:11px; color:#92400E; font-weight:600;">🚦 Cargando información de tráfico...</p>
                        </div>
                        
                        <!-- Botones de acción -->
                        <div style="display:flex; gap:8px; margin-bottom:8px;">
                            <button id="add-itinerary-${house.id}" style="flex:1; background:#10B981; color:white; padding:8px 16px; border:none; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; transition: all 0.3s; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
                                ➕ Agregar al Itinerario
                            </button>
                        </div>
                        
                        <!-- Botón ver más -->
                        <a href="${house.url || '#'}" target="_blank" style="display:block; text-align:center; background:#7C3AED; color:white; padding:8px 16px; border-radius:8px; text-decoration:none; font-weight:700; font-size:12px; transition: all 0.3s; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);">
                            🔍 Ver Detalles & 📅 Agendar
                        </a>
                    </div>
                `;
                marker.bindPopup(popupBase, { maxWidth: 450 });
                
                // Manejar clic en el popup para cargar tráfico e imagen mejorada
                marker.on('popupopen', async function(e){
                    const imgContainerId = `img-container-${house.id}`;
                    const imgContainer = document.getElementById(imgContainerId);
                    
                    // Estrategia 1: Mejorar calidad de la imagen del JSON (s_wm → n_wm, .jpg → .webp)
                    let imageLoadSuccess = false;
                    
                    if (imgContainer && house.imagen) {
                        const highQualityUrl = getHighQualityImageUrl(house.imagen);
                        
                        if (highQualityUrl && highQualityUrl !== house.imagen) {
                            console.log('🔄 Estrategia 1: Cargando imagen mejorada del JSON');
                            const newImg = document.createElement('img');
                            newImg.src = highQualityUrl;
                            newImg.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                            
                            // Si falla, intentar extraer del HTML de TocToc
                            newImg.onerror = async function() {
                                console.warn('⚠️ Estrategia 1 falló, intentando Estrategia 2...');
                                
                                // Estrategia 2: Extraer imagen desde el HTML de TocToc
                                if (house.url) {
                                    try {
                                        const realImageSrc = await extractImageFromTocToc(house.url);
                                        
                                        if (realImageSrc && imgContainer) {
                                            console.log('🔄 Estrategia 2: Cargando imagen extraída de TocToc');
                                            const toctocImg = document.createElement('img');
                                            toctocImg.src = realImageSrc;
                                            toctocImg.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                                            
                                            toctocImg.onerror = function() {
                                                console.warn('⚠️ Estrategia 2 falló, usando imagen original del JSON');
                                                const fallbackImg = document.createElement('img');
                                                fallbackImg.src = house.imagen;
                                                fallbackImg.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                                                imgContainer.innerHTML = '';
                                                imgContainer.appendChild(fallbackImg);
                                            };
                                            
                                            toctocImg.onload = function() {
                                                console.log('✅ Imagen de TocToc cargada correctamente');
                                            };
                                            
                                            imgContainer.innerHTML = '';
                                            imgContainer.appendChild(toctocImg);
                                        } else {
                                            throw new Error('No se pudo extraer imagen del HTML');
                                        }
                                    } catch (err) {
                                        console.warn('⚠️ Todas las estrategias fallaron, usando imagen original');
                                        const fallbackImg = document.createElement('img');
                                        fallbackImg.src = house.imagen;
                                        fallbackImg.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                                        imgContainer.innerHTML = '';
                                        imgContainer.appendChild(fallbackImg);
                                    }
                                } else {
                                    // No hay URL de TocToc, usar imagen original
                                    console.warn('⚠️ No hay URL de TocToc, usando imagen original');
                                    const fallbackImg = document.createElement('img');
                                    fallbackImg.src = house.imagen;
                                    fallbackImg.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                                    imgContainer.innerHTML = '';
                                    imgContainer.appendChild(fallbackImg);
                                }
                            };
                            
                            newImg.onload = function() {
                                console.log('✅ Imagen mejorada cargada correctamente (Estrategia 1)');
                                imageLoadSuccess = true;
                            };
                            
                            imgContainer.innerHTML = '';
                            imgContainer.appendChild(newImg);
                        }
                    }
                    
                    // Consultar tráfico actual y mostrar en popup
                    const traficoDivId = `trafico-casa-${house.id}`;
                    const traficoDiv = document.getElementById(traficoDivId);
                    if (traficoDiv) {
                        traficoDiv.innerHTML = `<p style="margin:0; font-size:11px; color:#92400E; font-weight:600;">🚦 Consultando tráfico en tiempo real...</p>`;
                        const trafico = await getTrafficLevelTomTomActual(house.lat, house.lon);
                        
                        let html = `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">`;
                        
                        if (trafico.nivel) {
                            const congestioPercent = (trafico.congestioRatio * 100).toFixed(1);
                            const nivelColor = trafico.nivel === 'Fluido' ? '#10B981' : 
                                             trafico.nivel === 'Moderado' ? '#F59E0B' : 
                                             trafico.nivel === 'Denso' ? '#EF4444' : '#DC2626';
                            
                            html += `
                                <div style="background:white; padding:8px; border-radius:6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                                    <div style="font-size:16px; margin-bottom:2px;">${trafico.emoji}</div>
                                    <div style="font-size:9px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-bottom:2px;">Nivel</div>
                                    <div style="font-size:12px; font-weight:800; color:${nivelColor};">${trafico.nivel}</div>
                                </div>
                                <div style="background:white; padding:8px; border-radius:6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                                    <div style="font-size:16px; margin-bottom:2px;">📊</div>
                                    <div style="font-size:9px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-bottom:2px;">Congestión</div>
                                    <div style="font-size:12px; font-weight:800; color:#7C3AED;">${congestioPercent}%</div>
                                </div>
                            `;
                        }
                        
                        html += `
                            <div style="background:white; padding:8px; border-radius:6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                                <div style="font-size:16px; margin-bottom:2px;">🚗</div>
                                <div style="font-size:9px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-bottom:2px;">Vel. Actual</div>
                                <div style="font-size:12px; font-weight:800; color:#1F2937;">${trafico.currentSpeed||"-"} km/h</div>
                            </div>
                            <div style="background:white; padding:8px; border-radius:6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                                <div style="font-size:16px; margin-bottom:2px;">✓</div>
                                <div style="font-size:9px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-bottom:2px;">Vel. Libre</div>
                                <div style="font-size:12px; font-weight:800; color:#10B981;">${trafico.freeFlowSpeed||"-"} km/h</div>
                            </div>
                        `;
                        
                        html += `</div>`;
                        traficoDiv.innerHTML = html;
                    }
                    
                    // Configurar el botón de agregar al itinerario
                    const addBtn = document.getElementById(`add-itinerary-${house.id}`);
                    if (addBtn) {
                        // Verificar si ya está en el itinerario
                        const isInItinerary = selectedProperties.some(s => s.id === house.id);
                        
                        if (isInItinerary) {
                            addBtn.textContent = '✓ En el Itinerario';
                            addBtn.style.background = '#6B7280';
                            addBtn.disabled = true;
                        }
                        
                        addBtn.onclick = function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const idx = selectedProperties.findIndex(s => s.id === house.id);
                            if (idx === -1) {
                                // Agregar al itinerario
                                selectedProperties.push(house);
                                marker.setIcon(getPropertyIcon(house, true));
                                addBtn.textContent = '✓ En el Itinerario';
                                addBtn.style.background = '#6B7280';
                                addBtn.disabled = true;
                                updateItineraryUI();
                                
                                console.log(`[FLUJO] Propiedad seleccionada: ${house.titulo || 'Sin título'} (ID: ${house.id}) - Total seleccionadas: ${selectedProperties.length}`);
                                
                                // Nota: La agenda y monitoreo se activarán automáticamente al optimizar/calcular ruta
                            }
                        };
                    }
                });
                marker.houseData = house;
                houseMarkers.push(marker);
                housesLayer.addLayer(marker);
            }
        });
        setText('houses-filtered-count', houseMarkers.length);
    }

    function updateItineraryUI() {
        const container = document.getElementById('itinerary-list');
        if (!container) return;
        container.innerHTML = '';
        selectedProperties.forEach((h, i) => {
            const div = document.createElement('div');
            div.style.padding = '6px 4px';
            div.style.borderBottom = '1px solid #f0f0f0';
            
            // Check if this property is scheduled
            const isScheduled = scheduledAppointments.has(h.id);
            const appointment = scheduledAppointments.get(h.id);
            const isCancelled = appointment && appointment.isCancelled;
            
            // Add schedule indicator
            const scheduleIcon = isScheduled ? (isCancelled ? '❌' : '📅') : '';
            const scheduleText = isScheduled ? (isCancelled ? ' (Cancelada)' : ' (Agendada)') : '';
            
            div.innerHTML = `<b>${scheduleIcon} ${h.titulo || h.nombre || h.address || 'Propiedad'}${scheduleText}</b><br/><span class="small">${h.comuna || ''} — ${h._operation||''}</span>`;
            // remove button
            const rm = document.createElement('button');
            rm.textContent = 'Quitar'; rm.style.float='right'; rm.style.marginLeft='6px'; rm.style.background='#dc3545'; rm.style.color='#fff'; rm.style.border='none'; rm.style.padding='4px 6px';
            rm.onclick = function(){
                // deselect marker icon
                const m = houseMarkers.find(mk => mk.houseData && mk.houseData.id === h.id);
                if (m) m.setIcon(getPropertyIcon(h, false)); // Usar versión normal
                const idx = selectedProperties.findIndex(s => s.id === h.id);
                if (idx!==-1) selectedProperties.splice(idx,1);
                
                // Remove scheduled appointment if exists
                removeScheduledAppointment(h.id);
                
                updateItineraryUI();
            };
            div.appendChild(rm);
            container.appendChild(div);
        });
        // update counter
        // setText('houses-filtered-count', houseMarkers.filter(m => housesLayer.hasLayer(m)).length + ' (seleccionadas: ' + selectedProperties.length + ')');
    }

    function matchesTypeOperation(house) {
        // If no filter UI present, allow
        if (!filterTypeCasaCb && !filterTypeDeptoCb && !filterOpVentaCb && !filterOpArriendoCb) return true;

        const casaChecked = filterTypeCasaCb ? filterTypeCasaCb.checked : true;
        const deptoChecked = filterTypeDeptoCb ? filterTypeDeptoCb.checked : true;
        const ventaChecked = filterOpVentaCb ? filterOpVentaCb.checked : true;
        const arriendoChecked = filterOpArriendoCb ? filterOpArriendoCb.checked : true;

        // Determine property type
        let propType = (house._propertyType || house.tipo_inmueble || house.tipo || house.property_type || '').toString().toLowerCase();
        const isDepto = propType.includes('depart') || propType.includes('dpto') || propType.includes('depto') || propType === 'departamento';
        const isCasa = !isDepto;

        if ((isCasa && !casaChecked) || (isDepto && !deptoChecked)) return false;

        // Determine operation
        const op = (house._operation || house.operacion || house.operation || house.tipo_anuncio || '').toString().toLowerCase();
        if (op) {
            if ((op.includes('venta') || op === 'venta') && !ventaChecked) return false;
            if ((op.includes('arri') || op === 'arriendo' || op === 'arriendo') && !arriendoChecked) return false;
        } else {
            // If operation unknown, include if at least one operation checkbox is true
            if (!ventaChecked && !arriendoChecked) return false;
        }

        // Apply smart search filters if enabled
        if (smartSearchFilters.enabled) {
            // Check dormitorios
            const dormitorios = parseInt(house.dormitorios || 0);
            if (dormitorios < smartSearchFilters.dormitoriosMin) return false;

            // Check baños
            const banos = parseInt(house.baños || house.banos || 0);
            if (banos < smartSearchFilters.banosMin) return false;

            // Check precio (use precio_uf preferably)
            const precio = parseFloat(house.precio_uf || house.precio_peso || 0);
            if (precio < smartSearchFilters.precioMin) return false;
            if (smartSearchFilters.precioMax !== null && precio > smartSearchFilters.precioMax) return false;

            // Casa-specific filters
            if (isCasa) {
                const m2Construido = parseFloat(house.m2_construido || 0);
                if (m2Construido < smartSearchFilters.m2ConstruidoMin) return false;

                const m2Terreno = parseFloat(house.m2_terreno || 0);
                if (m2Terreno < smartSearchFilters.m2TerrenoMin) return false;
            }

            // Depto-specific filters
            if (isDepto) {
                const m2Superficie = parseFloat(house.m2_superficie || 0);
                if (m2Superficie < smartSearchFilters.m2SuperficieMin) return false;

                // Check terraza
                if (smartSearchFilters.conTerraza) {
                    const m2Terraza = parseFloat(house.m2_terraza || 0);
                    if (m2Terraza <= 0) return false;
                }
            }
        }

        return true;
    }

    // Unified proximity filtering: houses must satisfy all enabled proximity checks (AND logic)
    function applyProximityFilters() {
        const metroEnabled = filterByMetroCb && filterByMetroCb.checked;
        const cecosfEnabled = filterByCecosfCb && filterByCecosfCb.checked;
        const cosamEnabled = filterByCosamCb && filterByCosamCb.checked;
        const coninEnabled = filterByConinCb && filterByConinCb.checked;
        const cesfamEnabled = filterByCesfamCb && filterByCesfamCb.checked;
        const centroSaludEnabled = filterByCentroSaludCb && filterByCentroSaludCb.checked;
        const centroMedicoEnabled = filterByCentroMedicoCb && filterByCentroMedicoCb.checked;
        const clinicaDentalEnabled = filterByClinicaDentalCb && filterByClinicaDentalCb.checked;
        const clinicaEnabled = filterByClinicaCb && filterByClinicaCb.checked;
        const cdtEnabled = filterByCdtCb && filterByCdtCb.checked;
        const direccionSaludEnabled = filterByDireccionSaludCb && filterByDireccionSaludCb.checked;
        const hospitalEnabled = filterByHospitalCb && filterByHospitalCb.checked;
        const laboratorioEnabled = filterByLaboratorioCb && filterByLaboratorioCb.checked;
        const praisEnabled = filterByPraisCb && filterByPraisCb.checked;
        const sapuEnabled = filterBySapuCb && filterBySapuCb.checked;
        const unidadSaludFuncionariosEnabled = filterByUnidadSaludFuncionariosCb && filterByUnidadSaludFuncionariosCb.checked;
        const vacunatorioEnabled = filterByVacunatorioCb && filterByVacunatorioCb.checked;
        const paraderosEnabled = filterByParaderosCb && filterByParaderosCb.checked;
        const carabinerosEnabled = filterByCarabinerosCb && filterByCarabinerosCb.checked;
        const feriasEnabled = filterByFeriasCb && filterByFeriasCb.checked;
        const institutosEnabled = filterByInstitutosCb && filterByInstitutosCb.checked;
        const universidadesPrivadasEnabled = filterByUniversidadesPrivadasCb && filterByUniversidadesPrivadasCb.checked;
        const universidadesEstatalesEnabled = filterByUniversidadesEstatalesCb && filterByUniversidadesEstatalesCb.checked;
        const colegiosEnabled = filterByColegiosCb && filterByColegiosCb.checked;
        const jardinesEnabled = filterByJardinesCb && filterByJardinesCb.checked;
        
        // if no proximity filter enabled, redisplay all houses (respecting smart search filters)
        if (!metroEnabled && !cecosfEnabled && !cosamEnabled && !coninEnabled && !cesfamEnabled && !centroSaludEnabled && 
            !centroMedicoEnabled && !clinicaDentalEnabled && !clinicaEnabled && !cdtEnabled && !direccionSaludEnabled && !hospitalEnabled && !laboratorioEnabled && 
            !praisEnabled && !sapuEnabled && !unidadSaludFuncionariosEnabled && !vacunatorioEnabled &&
            !paraderosEnabled && !carabinerosEnabled && !feriasEnabled && !institutosEnabled && !universidadesPrivadasEnabled && !universidadesEstatalesEnabled && !colegiosEnabled && !jardinesEnabled) { 
            displayHouses(housesData); 
            return; 
        }

        // Get radius from the new proximity-radius input, fallback to legacy metro-radius
        const radius = proximityRadiusInput ? parseFloat(proximityRadiusInput.value) : 
                       (metroRadiusInput ? parseFloat(metroRadiusInput.value) : 500);
        
        console.log(`🔍 Aplicando filtros de proximidad con radio: ${radius}m`);
        
        // Prepare point arrays for each enabled filter
        const metroPoints = metroPois.map(m => ({ lat: m.lat, lon: m.lon }));
        const cecosfPoints = cecosfPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const cosamPoints = cosamPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const coninPoints = coninPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const cesfamPoints = cesfamPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const centroSaludPoints = centroSaludPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const centroMedicoPoints = centroMedicoPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const clinicaDentalPoints = clinicaDentalPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const clinicaPoints = clinicaPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const cdtPoints = cdtPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const direccionSaludPoints = direccionSaludPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const hospitalPoints = hospitalPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const laboratorioPoints = laboratorioPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const praisPoints = praisPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const sapuPoints = sapuPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const unidadSaludFuncionariosPoints = unidadSaludFuncionariosPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const vacunatorioPoints = vacunatorioPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const paraderosPoints = paraderos.map(p => ({ lat: p.lat, lon: p.lon }));
        const carabinerosPoints = carabinerosPois.map(c => ({ lat: c.lat, lon: c.lon }));
        const feriasPoints = feriasPois.map(f => ({ lat: f.lat, lon: f.lon }));
        const institutosPoints = institutosPois.map(u => ({ lat: u.lat, lon: u.lon }));
        const universidadesPrivadasPoints = universidadesPrivadasPois.map(u => ({ lat: u.lat, lon: u.lon }));
        const universidadesEstatalesPoints = universidadesEstatalesPois.map(u => ({ lat: u.lat, lon: u.lon }));
        const colegiosPoints = colegiosPois.map(c => ({ lat: c.lat, lon: c.lon }));
        const jardinesPoints = jardinesPois.map(j => ({ lat: j.lat, lon: j.lon }));

        // Filter houses based on proximity criteria AND smart search filters
        const filtered = housesData.filter(house => {
            // First check if house passes smart search filters
            if (!matchesTypeOperation(house)) return false;
            
            const point = { lat: house.lat, lon: house.lon };
            
            // Check each enabled proximity filter (all must pass)
            if (metroEnabled) {
                const nearMetro = metroPoints.some(mp => haversineDistance(point, mp) <= radius);
                if (!nearMetro) return false;
            }
            if (cecosfEnabled) {
                const nearCecosf = cecosfPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCecosf) return false;
            }
            if (cosamEnabled) {
                const nearCosam = cosamPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCosam) return false;
            }
            if (coninEnabled) {
                const nearConin = coninPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearConin) return false;
            }
            if (cesfamEnabled) {
                const nearCesfam = cesfamPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCesfam) return false;
            }
            if (centroSaludEnabled) {
                const nearCentroSalud = centroSaludPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCentroSalud) return false;
            }
            if (centroMedicoEnabled) {
                const nearCentroMedico = centroMedicoPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCentroMedico) return false;
            }
            if (clinicaDentalEnabled) {
                const nearClinicaDental = clinicaDentalPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearClinicaDental) return false;
            }
            if (clinicaEnabled) {
                const nearClinica = clinicaPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearClinica) return false;
            }
            if (cdtEnabled) {
                const nearCdt = cdtPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearCdt) return false;
            }
            if (direccionSaludEnabled) {
                const nearDireccionSalud = direccionSaludPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearDireccionSalud) return false;
            }
            if (hospitalEnabled) {
                const nearHospital = hospitalPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearHospital) return false;
            }
            if (laboratorioEnabled) {
                const nearLaboratorio = laboratorioPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearLaboratorio) return false;
            }
            if (praisEnabled) {
                const nearPrais = praisPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearPrais) return false;
            }
            if (sapuEnabled) {
                const nearSapu = sapuPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearSapu) return false;
            }
            if (unidadSaludFuncionariosEnabled) {
                const nearUnidadSaludFuncionarios = unidadSaludFuncionariosPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearUnidadSaludFuncionarios) return false;
            }
            if (vacunatorioEnabled) {
                const nearVacunatorio = vacunatorioPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearVacunatorio) return false;
            }
            if (paraderosEnabled) {
                const nearParaderos = paraderosPoints.some(pp => haversineDistance(point, pp) <= radius);
                if (!nearParaderos) return false;
            }
            if (carabinerosEnabled) {
                const nearCarabineros = carabinerosPoints.some(cp => haversineDistance(point, cp) <= radius);
                if (!nearCarabineros) return false;
            }
            if (feriasEnabled) {
                const nearFerias = feriasPoints.some(fp => haversineDistance(point, fp) <= radius);
                if (!nearFerias) return false;
            }
            if (institutosEnabled) {
                const nearInstitutos = institutosPoints.some(up => haversineDistance(point, up) <= radius);
                if (!nearInstitutos) return false;
            }
            if (universidadesPrivadasEnabled) {
                const nearUniversidadesPrivadas = universidadesPrivadasPoints.some(up => haversineDistance(point, up) <= radius);
                if (!nearUniversidadesPrivadas) return false;
            }
            if (universidadesEstatalesEnabled) {
                const nearUniversidadesEstatales = universidadesEstatalesPoints.some(up => haversineDistance(point, up) <= radius);
                if (!nearUniversidadesEstatales) return false;
            }
            if (colegiosEnabled) {
                const nearColegios = colegiosPoints.some(cp => haversineDistance(point, cp) <= radius);
                if (!nearColegios) return false;
            }
            if (jardinesEnabled) {
                const nearJardines = jardinesPoints.some(jp => haversineDistance(point, jp) <= radius);
                if (!nearJardines) return false;
            }
            
            return true;
        });

        // Display filtered houses
        displayHouses(filtered);
        console.log(`✅ Filtros de proximidad aplicados. ${filtered.length} propiedades coinciden.`);
    }

    if (filterByMetroCb) filterByMetroCb.addEventListener('change', applyProximityFilters);
    if (filterByCecosfCb) filterByCecosfCb.addEventListener('change', applyProximityFilters);
    if (filterByCosamCb) filterByCosamCb.addEventListener('change', applyProximityFilters);
    if (filterByConinCb) filterByConinCb.addEventListener('change', applyProximityFilters);
    if (filterByCesfamCb) filterByCesfamCb.addEventListener('change', applyProximityFilters);
    if (filterByCentroSaludCb) filterByCentroSaludCb.addEventListener('change', applyProximityFilters);
    if (filterByCentroMedicoCb) filterByCentroMedicoCb.addEventListener('change', applyProximityFilters);
    if (filterByClinicaDentalCb) filterByClinicaDentalCb.addEventListener('change', applyProximityFilters);
    if (filterByClinicaCb) filterByClinicaCb.addEventListener('change', applyProximityFilters);
    if (filterByCdtCb) filterByCdtCb.addEventListener('change', applyProximityFilters);
    if (filterByDireccionSaludCb) filterByDireccionSaludCb.addEventListener('change', applyProximityFilters);
    if (filterByHospitalCb) filterByHospitalCb.addEventListener('change', applyProximityFilters);
    if (filterByLaboratorioCb) filterByLaboratorioCb.addEventListener('change', applyProximityFilters);
    if (filterByPraisCb) filterByPraisCb.addEventListener('change', applyProximityFilters);
    if (filterBySapuCb) filterBySapuCb.addEventListener('change', applyProximityFilters);
    if (filterByUnidadSaludFuncionariosCb) filterByUnidadSaludFuncionariosCb.addEventListener('change', applyProximityFilters);
    if (filterByVacunatorioCb) filterByVacunatorioCb.addEventListener('change', applyProximityFilters);
    if (filterByParaderosCb) filterByParaderosCb.addEventListener('change', applyProximityFilters);
    if (filterByCarabinerosCb) filterByCarabinerosCb.addEventListener('change', applyProximityFilters);
    if (filterByFeriasCb) filterByFeriasCb.addEventListener('change', applyProximityFilters);
    if (filterByInstitutosCb) filterByInstitutosCb.addEventListener('change', applyProximityFilters);
    if (filterByUniversidadesPrivadasCb) filterByUniversidadesPrivadasCb.addEventListener('change', applyProximityFilters);
    if (filterByUniversidadesEstatalesCb) filterByUniversidadesEstatalesCb.addEventListener('change', applyProximityFilters);
    if (filterByColegiosCb) filterByColegiosCb.addEventListener('change', applyProximityFilters);
    if (filterByJardinesCb) filterByJardinesCb.addEventListener('change', applyProximityFilters);
    if (metroRadiusInput) metroRadiusInput.addEventListener('change', applyProximityFilters);
    if (proximityRadiusInput) proximityRadiusInput.addEventListener('change', applyProximityFilters);

    // Proximity filters buttons
    if (applyProximityFiltersBtn) {
        applyProximityFiltersBtn.addEventListener('click', () => {
            applyProximityFilters();
            console.log('🔍 Filtros de proximidad aplicados manualmente');
        });
    }

    if (clearProximityFiltersBtn) {
        clearProximityFiltersBtn.addEventListener('click', () => {
            // Uncheck all proximity filters
            if (filterByMetroCb) filterByMetroCb.checked = false;
            if (filterByCecosfCb) filterByCecosfCb.checked = false;
            if (filterByCosamCb) filterByCosamCb.checked = false;
            if (filterByConinCb) filterByConinCb.checked = false;
            if (filterByCesfamCb) filterByCesfamCb.checked = false;
            if (filterByCentroSaludCb) filterByCentroSaludCb.checked = false;
            if (filterByCentroMedicoCb) filterByCentroMedicoCb.checked = false;
            if (filterByClinicaDentalCb) filterByClinicaDentalCb.checked = false;
            if (filterByClinicaCb) filterByClinicaCb.checked = false;
            if (filterByCdtCb) filterByCdtCb.checked = false;
            if (filterByDireccionSaludCb) filterByDireccionSaludCb.checked = false;
            if (filterByHospitalCb) filterByHospitalCb.checked = false;
            if (filterByLaboratorioCb) filterByLaboratorioCb.checked = false;
      if (filterByPraisCb) filterByPraisCb.checked = false;
      if (filterBySapuCb) filterBySapuCb.checked = false;
      if (filterByUnidadSaludFuncionariosCb) filterByUnidadSaludFuncionariosCb.checked = false;
      if (filterByVacunatorioCb) filterByVacunatorioCb.checked = false;
            if (filterByParaderosCb) filterByParaderosCb.checked = false;
            if (filterByCarabinerosCb) filterByCarabinerosCb.checked = false;
            if (filterByFeriasCb) filterByFeriasCb.checked = false;
            if (filterByInstitutosCb) filterByInstitutosCb.checked = false;
            if (filterByUniversidadesPrivadasCb) filterByUniversidadesPrivadasCb.checked = false;
            if (filterByUniversidadesEstatalesCb) filterByUniversidadesEstatalesCb.checked = false;
            if (filterByColegiosCb) filterByColegiosCb.checked = false;
            if (filterByJardinesCb) filterByJardinesCb.checked = false;
            
            // Reset radius to default
            if (proximityRadiusInput) proximityRadiusInput.value = '500';
            
            // Reapply to show all properties
            applyProximityFilters();
            console.log('🔄 Filtros de proximidad limpiados');
        });
    }

    // Type/operation filters should re-run the current filtering pipeline
    if (filterTypeCasaCb) filterTypeCasaCb.addEventListener('change', () => applyProximityFilters());
    if (filterTypeDeptoCb) filterTypeDeptoCb.addEventListener('change', () => applyProximityFilters());
    if (filterOpVentaCb) filterOpVentaCb.addEventListener('change', () => applyProximityFilters());
    if (filterOpArriendoCb) filterOpArriendoCb.addEventListener('change', () => applyProximityFilters());

    // Smart Search Event Listeners
    if (applySmartSearchBtn) {
        applySmartSearchBtn.addEventListener('click', () => {
            smartSearchFilters.enabled = true;
            smartSearchFilters.tipoCasa = filterTypeCasaCb ? filterTypeCasaCb.checked : true;
            smartSearchFilters.tipoDepto = filterTypeDeptoCb ? filterTypeDeptoCb.checked : true;
            smartSearchFilters.opVenta = filterOpVentaCb ? filterOpVentaCb.checked : true;
            smartSearchFilters.opArriendo = filterOpArriendoCb ? filterOpArriendoCb.checked : true;
            smartSearchFilters.dormitoriosMin = parseInt(searchDormitoriosMin?.value || 0);
            smartSearchFilters.banosMin = parseInt(searchBanosMin?.value || 0);
            smartSearchFilters.precioMin = parseFloat(searchPrecioMin?.value || 0);
            smartSearchFilters.precioMax = searchPrecioMax?.value ? parseFloat(searchPrecioMax.value) : null;
            smartSearchFilters.m2ConstruidoMin = parseFloat(searchM2ConstruidoMin?.value || 0);
            smartSearchFilters.m2TerrenoMin = parseFloat(searchM2TerrenoMin?.value || 0);
            smartSearchFilters.m2SuperficieMin = parseFloat(searchM2SuperficieMin?.value || 0);
            smartSearchFilters.conTerraza = searchConTerraza ? searchConTerraza.checked : false;
            
            applyProximityFilters();
            console.log('Búsqueda inteligente aplicada:', smartSearchFilters);
        });
    }

    if (clearSmartSearchBtn) {
        clearSmartSearchBtn.addEventListener('click', () => {
            // Disable smart search filters
            smartSearchFilters.enabled = false;
            smartSearchFilters.tipoCasa = true;
            smartSearchFilters.tipoDepto = true;
            smartSearchFilters.opVenta = true;
            smartSearchFilters.opArriendo = true;
            smartSearchFilters.dormitoriosMin = 0;
            smartSearchFilters.banosMin = 0;
            smartSearchFilters.precioMin = 0;
            smartSearchFilters.precioMax = null;
            smartSearchFilters.m2ConstruidoMin = 0;
            smartSearchFilters.m2TerrenoMin = 0;
            smartSearchFilters.m2SuperficieMin = 0;
            smartSearchFilters.conTerraza = false;
            
            // Reset UI elements
            if (filterTypeCasaCb) filterTypeCasaCb.checked = true;
            if (filterTypeDeptoCb) filterTypeDeptoCb.checked = true;
            if (filterOpVentaCb) filterOpVentaCb.checked = true;
            if (filterOpArriendoCb) filterOpArriendoCb.checked = true;
            if (searchDormitoriosMin) searchDormitoriosMin.value = '0';
            if (searchBanosMin) searchBanosMin.value = '0';
            if (searchPrecioMin) searchPrecioMin.value = '0';
            if (searchPrecioMax) searchPrecioMax.value = '';
            if (searchM2ConstruidoMin) searchM2ConstruidoMin.value = '0';
            if (searchM2TerrenoMin) searchM2TerrenoMin.value = '0';
            if (searchM2SuperficieMin) searchM2SuperficieMin.value = '0';
            if (searchConTerraza) searchConTerraza.checked = false;
            
            // Reapply filters to show all properties
            applyProximityFilters();
            console.log('✅ Filtros de búsqueda inteligente limpiados. Mostrando todas las propiedades.');
        });
    }

    // CSV parsing (pipe-delimited)
    function parsePipeCSV(text) {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = lines[0].split('|').map(h => h.trim());
        const rows = lines.slice(1).map(line => {
            const cols = line.split('|');
            const obj = {};
            header.forEach((h, i) => obj[h] = cols[i]);
            return obj;
        });
        return rows;
    }

    // Metro CSV uses commas; we parse simple CSV by splitting line
    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => {
            const cols = line.split(',');
            const obj = {};
            header.forEach((h, i) => obj[h] = cols[i]);
            return obj;
        });
        return rows;
    }

    function loadCecosf() {
        return fetch('data/establecimientos_por_tipo/Centro_Comunitario_de_Salud_Familiar_CECOSF.json').then(r => r.json()).then(data => {
            cecosfPois = data.map(item => ({
                nombre: item.NOMBRE || 'CECOSF',
                tipo: item.TIPO || 'Centro Comunitario de Salud Familiar',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            cecosfPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.cecosf })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                cecosfLayer.addLayer(marker);
            });
            setText('debug-cecosf', `CECOSF cargados: ${cecosfPois.length}`);
            setText('cecosf-count', cecosfPois.length);
        }).catch(e => { console.warn('CECOSF load error', e); setText('cecosf-count', 0); });
    }

    function loadCosam() {
        return fetch('data/establecimientos_por_tipo/Centro_Comunitario_de_Salud_Mental_COSAM.json').then(r => r.json()).then(data => {
            cosamPois = data.map(item => ({
                nombre: item.NOMBRE || 'COSAM',
                tipo: item.TIPO || 'Centro Comunitario de Salud Mental',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            cosamPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.cosam })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                cosamLayer.addLayer(marker);
            });
            setText('debug-cosam', `COSAM cargados: ${cosamPois.length}`);
            setText('cosam-count', cosamPois.length);
        }).catch(e => { console.warn('COSAM load error', e); setText('cosam-count', 0); });
    }

    function loadConin() {
        return fetch('data/establecimientos_por_tipo/Centro_Corporación_para_la_Nutrición_Infantil_CONIN.json').then(r => r.json()).then(data => {
            coninPois = data.map(item => ({
                nombre: item.NOMBRE || 'CONIN',
                tipo: item.TIPO || 'Centro Corporación para la Nutrición Infantil',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            coninPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.conin })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                coninLayer.addLayer(marker);
            });
            setText('debug-conin', `CONIN cargados: ${coninPois.length}`);
            setText('conin-count', coninPois.length);
        }).catch(e => { console.warn('CONIN load error', e); setText('conin-count', 0); });
    }

    function loadCesfam() {
        return fetch('data/establecimientos_por_tipo/Centro_de_Salud_Familiar_CESFAM.json').then(r => r.json()).then(data => {
            cesfamPois = data.map(item => ({
                nombre: item.NOMBRE || 'CESFAM',
                tipo: item.TIPO || 'Centro de Salud Familiar',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            cesfamPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.cesfam })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                cesfamLayer.addLayer(marker);
            });
            setText('debug-cesfam', `CESFAM cargados: ${cesfamPois.length}`);
            setText('cesfam-count', cesfamPois.length);
        }).catch(e => { console.warn('CESFAM load error', e); setText('cesfam-count', 0); });
    }

    function loadCentroSalud() {
        return fetch('data/establecimientos_por_tipo/Centro_de_Salud.json').then(r => r.json()).then(data => {
            centroSaludPois = data.map(item => ({
                nombre: item.NOMBRE || 'Centro de Salud',
                tipo: item.TIPO || 'Centro de Salud',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            centroSaludPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.centroSalud })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                centroSaludLayer.addLayer(marker);
            });
            setText('debug-centro-salud', `Centros de Salud cargados: ${centroSaludPois.length}`);
            setText('centro-salud-count', centroSaludPois.length);
        }).catch(e => { console.warn('Centro de Salud load error', e); setText('centro-salud-count', 0); });
    }

    function loadCentroMedico() {
        return fetch('data/establecimientos_por_tipo/Centro_Médico_y_Dental.json').then(r => r.json()).then(data => {
            centroMedicoPois = data.map(item => ({
                nombre: item.NOMBRE || 'Centro Médico y Dental',
                tipo: item.TIPO || 'Centro Médico y Dental',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            centroMedicoPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.centroMedico })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                centroMedicoLayer.addLayer(marker);
            });
            setText('debug-centro-medico', `Centros Médicos cargados: ${centroMedicoPois.length}`);
            setText('centro-medico-count', centroMedicoPois.length);
        }).catch(e => { console.warn('Centro Médico load error', e); setText('centro-medico-count', 0); });
    }

    function loadClinicaDental() {
        return fetch('data/establecimientos_por_tipo/Clínica_Dental.json').then(r => r.json()).then(data => {
            clinicaDentalPois = data.map(item => ({
                nombre: item.NOMBRE || 'Clínica Dental',
                tipo: item.TIPO || 'Clínica Dental',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            clinicaDentalPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.clinicaDental })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                clinicaDentalLayer.addLayer(marker);
            });
            setText('debug-clinica-dental', `Clínicas Dentales cargadas: ${clinicaDentalPois.length}`);
            setText('clinica-dental-count', clinicaDentalPois.length);
        }).catch(e => { console.warn('Clínica Dental load error', e); setText('clinica-dental-count', 0); });
    }

    function loadClinica() {
        return fetch('data/establecimientos_por_tipo/Clínica.json').then(r => r.json()).then(data => {
            clinicaPois = data.map(item => ({
                nombre: item.NOMBRE || 'Clínica',
                tipo: item.TIPO || 'Clínica',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            clinicaPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.clinica })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                clinicaLayer.addLayer(marker);
            });
            setText('debug-clinica', `Clínicas cargadas: ${clinicaPois.length}`);
            setText('clinica-count', clinicaPois.length);
        }).catch(e => { console.warn('Clínica load error', e); setText('clinica-count', 0); });
    }

    function loadCdt() {
        return fetch('data/establecimientos_por_tipo/Consultorio_de_Diagnóstico_y_Tratamiento_CDT.json').then(r => r.json()).then(data => {
            cdtPois = data.map(item => ({
                nombre: item.NOMBRE || 'CDT',
                tipo: item.TIPO || 'Consultorio de Diagnóstico y Tratamiento',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            cdtPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.cdt })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                cdtLayer.addLayer(marker);
            });
            setText('debug-cdt', `CDT cargados: ${cdtPois.length}`);
            setText('cdt-count', cdtPois.length);
        }).catch(e => { console.warn('CDT load error', e); setText('cdt-count', 0); });
    }

    function loadDireccionSalud() {
        return fetch('data/establecimientos_por_tipo/Dirección_Servicio_de_Salud.json').then(r => r.json()).then(data => {
            direccionSaludPois = data.map(item => ({
                nombre: item.NOMBRE || 'Dirección Servicio de Salud',
                tipo: item.TIPO || 'Dirección Servicio de Salud',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            direccionSaludPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.direccionSalud })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                direccionSaludLayer.addLayer(marker);
            });
            setText('debug-direccion-salud', `Direcciones de Salud cargadas: ${direccionSaludPois.length}`);
            setText('direccion-salud-count', direccionSaludPois.length);
        }).catch(e => { console.warn('Dirección Salud load error', e); setText('direccion-salud-count', 0); });
    }

    function loadHospital() {
        return fetch('data/establecimientos_por_tipo/Hospital.json').then(r => r.json()).then(data => {
            hospitalPois = data.map(item => ({
                nombre: item.NOMBRE || 'Hospital',
                tipo: item.TIPO || 'Hospital',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            hospitalPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.hospital })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                hospitalLayer.addLayer(marker);
            });
            setText('debug-hospital', `Hospitales cargados: ${hospitalPois.length}`);
            setText('hospital-count', hospitalPois.length);
        }).catch(e => { console.warn('Hospital load error', e); setText('hospital-count', 0); });
    }

    function loadLaboratorio() {
        return fetch('data/establecimientos_por_tipo/Laboratorio_Clínico_o_Dental.json').then(r => r.json()).then(data => {
            laboratorioPois = data.map(item => ({
                nombre: item.NOMBRE || 'Laboratorio',
                tipo: item.TIPO || 'Laboratorio Clínico o Dental',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            laboratorioPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.laboratorio })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                laboratorioLayer.addLayer(marker);
            });
            setText('debug-laboratorio', `Laboratorios cargados: ${laboratorioPois.length}`);
            setText('laboratorio-count', laboratorioPois.length);
        }).catch(e => { console.warn('Laboratorio load error', e); setText('laboratorio-count', 0); });
    }

    function loadPrais() {
        return fetch('data/establecimientos_por_tipo/Programa_de_Reparación_y_Atención_Integral_de_Salud.json').then(r => r.json()).then(data => {
            praisPois = data.map(item => ({
                nombre: item.NOMBRE || 'PRAIS',
                tipo: item.TIPO || 'Programa de Reparación y Atención Integral de Salud',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            praisPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.prais })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                praisLayer.addLayer(marker);
            });
            setText('debug-prais', `PRAIS cargados: ${praisPois.length}`);
            setText('prais-count', praisPois.length);
        }).catch(e => { console.warn('PRAIS load error', e); setText('prais-count', 0); });
    }

    function loadSapu() {
        return fetch('data/establecimientos_por_tipo/Servicio_de_Atención_Primaria_de_Urgencia_SAPU.json').then(r => r.json()).then(data => {
            sapuPois = data.map(item => ({
                nombre: item.NOMBRE || 'SAPU',
                tipo: item.TIPO || 'Servicio de Atención Primaria de Urgencia',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            sapuPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.sapu })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                sapuLayer.addLayer(marker);
            });
            setText('debug-sapu', `SAPU cargados: ${sapuPois.length}`);
            setText('sapu-count', sapuPois.length);
        }).catch(e => { console.warn('SAPU load error', e); setText('sapu-count', 0); });
    }

    function loadUnidadSaludFuncionarios() {
        return fetch('data/establecimientos_por_tipo/Unidad_de_Salud_Funcionarios.json').then(r => r.json()).then(data => {
            unidadSaludFuncionariosPois = data.map(item => ({
                nombre: item.NOMBRE || 'Unidad de Salud',
                tipo: item.TIPO || 'Unidad de Salud Funcionarios',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            unidadSaludFuncionariosPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.unidadSaludFuncionarios })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                unidadSaludFuncionariosLayer.addLayer(marker);
            });
            setText('debug-unidad-salud-funcionarios', `Unidades de Salud Funcionarios cargadas: ${unidadSaludFuncionariosPois.length}`);
            setText('unidad-salud-funcionarios-count', unidadSaludFuncionariosPois.length);
        }).catch(e => { console.warn('Unidad Salud Funcionarios load error', e); setText('unidad-salud-funcionarios-count', 0); });
    }

    function loadVacunatorio() {
        return fetch('data/establecimientos_por_tipo/Vacunatorio.json').then(r => r.json()).then(data => {
            vacunatorioPois = data.map(item => ({
                nombre: item.NOMBRE || 'Vacunatorio',
                tipo: item.TIPO || 'Vacunatorio',
                lat: item.LATITUD,
                lon: item.LONGITUD,
                direccion: item.DIRECCION || '',
                numero: item.NUMERO || '',
                comuna: item.NOM_COM || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            vacunatorioPois.forEach(p => {
                const marker = L.marker([p.lat, p.lon], { icon: icons.vacunatorio })
                    .bindPopup(`<b>${p.nombre}</b><br>${p.tipo}<br>${p.direccion} ${p.numero}<br>${p.comuna}`);
                vacunatorioLayer.addLayer(marker);
            });
            setText('debug-vacunatorio', `Vacunatorios cargados: ${vacunatorioPois.length}`);
            setText('vacunatorio-count', vacunatorioPois.length);
        }).catch(e => { console.warn('Vacunatorio load error', e); setText('vacunatorio-count', 0); });
    }

    function loadParaderos() {
        // Load Paraderos geojson if present
        return fetch('data/Paraderos_Transantiago.geojson').then(r => {
            if (!r.ok) throw new Error('Paraderos not found');
            return r.json();
        }).then(gj => {
            const features = gj.features || [];
            // Filtrar por comuna: sólo paraderos dentro de la comuna PROVIDENCIA
            const targetComuna = 'PROVIDENCIA';
            const filtered = features.filter(f => {
                const props = f.properties || {};
                const comuna = (props.comuna || props.COMUNA || '').toString().toUpperCase();
                return comuna === targetComuna;
            });

            paraderos = filtered.map(f => {
                const props = f.properties || {};
                const coords = f.geometry && f.geometry.coordinates;
                if (!coords) return null;
                const lon = coords[0], lat = coords[1];
                const p = { codigo: props.codigo, nombre: props.nombre_ust || props.nombre || '', lat, lon, props };
                const marker = L.marker([lat, lon], { icon: icons.paradero }).bindPopup(`<b>${p.nombre}</b><br>${p.codigo || ''}`);
                paraderosLayer.addLayer(marker);
                return p;
            }).filter(Boolean);

            setText('debug-paraderos', `paraderos cargados (Providencia): ${paraderos.length} / ${features.length}`);
        }).catch(e => { console.warn('paraderos load error', e); const d=document.getElementById('debug-paraderos'); if(d)d.textContent='paraderos load error'; });
    }

    function mercatorToLatLon(x, y) {
        // input appears to be EPSG:3857 (Web Mercator) but negated; check signs -- file seems in meters with negative X/Y.
        // We'll assume these are WebMercator coordinates (x,y) and convert.
        const lon = (x / 20037508.34) * 180;
        let lat = (y / 20037508.34) * 180;
        lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
        return { lat, lon };
    }

    // Snap lat/lon to nearest graph node id
    function snapToNearestNode(lat, lon) {
        let bestId = null;
        let bestDist = Infinity;
        nodeIndex.forEach((v, id) => {
            const d = haversineDistance({lat, lon}, {lat: v.lat, lon: v.lon});
            if (d < bestDist) { bestDist = d; bestId = id; }
        });
        return { id: bestId, distance: bestDist };
    }

    // =====================
    // Scheduled Appointments Threat System
    // =====================
    
    // Add a property as a scheduled appointment
    function scheduleAppointment(house) {
        if (!house || !house.id) return false;
        
        const appointment = {
            houseData: house,
            scheduledTime: new Date(),
            isCancelled: false,
            cancelProbability: CANCEL_PROBABILITY
        };
        
        scheduledAppointments.set(house.id, appointment);
        console.log(`📅 Cita agendada para propiedad ${house.id} - Riesgo de cancelación: ${CANCEL_PROBABILITY * 100}%`);
        updateAppointmentUI();
        return true;
    }
    
    // Remove a scheduled appointment
    function removeScheduledAppointment(houseId) {
        if (scheduledAppointments.has(houseId)) {
            scheduledAppointments.delete(houseId);
            console.log(`🗑️ Cita eliminada para propiedad ${houseId}`);
            updateAppointmentUI();
            return true;
        }
        return false;
    }
    
    // Check if appointments should be cancelled (Monte Carlo simulation)
    function checkAppointmentCancellations() {
        let cancelled = false;
        const cancellations = [];
        
        scheduledAppointments.forEach((appointment, houseId) => {
            if (appointment.isCancelled) return;
            
            // Simulate cancellation with 20% probability
            const random = Math.random();
            if (random < appointment.cancelProbability) {
                appointment.isCancelled = true;
                cancelled = true;
                cancellations.push({
                    houseId: houseId,
                    houseName: appointment.houseData.titulo || appointment.houseData.nombre || 'Propiedad',
                    random: random.toFixed(3)
                });
                console.warn(`❌ CANCELACIÓN: Cita para propiedad ${houseId} cancelada (random=${random.toFixed(3)} < ${appointment.cancelProbability})`);
                
                // Remove from selected properties if present
                const idx = selectedProperties.findIndex(p => p.id === houseId);
                if (idx !== -1) {
                    selectedProperties.splice(idx, 1);
                    console.log(`🔄 Propiedad ${houseId} eliminada de la ruta seleccionada`);
                }
            }
        });
        
        if (cancelled) {
            updateAppointmentUI();
            showCancellationNotification(cancellations);
            // Automatically recalculate route when cancellations occur
            handleRouteCancellation();
        }
        
        return cancelled;
    }
    
    // Show notification when cancellations occur
    function showCancellationNotification(cancellations) {
        const message = cancellations.map(c => `• ${c.houseName} (ID: ${c.houseId})`).join('\n');
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #fee 0%, #fdd 100%);
            border: 2px solid #f44;
            border-radius: 8px;
            padding: 16px;
            max-width: 350px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;
        notification.innerHTML = `
            <div style="font-weight: bold; color: #c33; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">❌</span>
                <span>¡Citas Canceladas!</span>
            </div>
            <div style="color: #666; font-size: 13px; margin-bottom: 8px;">
                Las siguientes citas han sido canceladas:
            </div>
            <div style="color: #333; font-size: 12px; white-space: pre-line; margin-bottom: 12px;">${message}</div>
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 10px; border-radius: 4px; text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 8px;">
                🔄 Recalculando ruta automáticamente...
            </div>
            <button id="dismiss-notification-btn" style="
                width: 100%;
                padding: 8px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            ">Cerrar</button>
        `;
        
        document.body.appendChild(notification);
        
        // Add event listener for dismiss button
        const dismissBtn = document.getElementById('dismiss-notification-btn');
        
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                document.body.removeChild(notification);
            });
        }
        
        // Auto-dismiss after 10 seconds with fade-out
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.transition = 'opacity 0.5s';
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 500);
            }
        }, 10000);
    }
    
    // Handle route recalculation when cancellations occur
    async function handleRouteCancellation() {
        console.log('🔄 Recalculando ruta óptima debido a cancelaciones...');
        
        // Update UI
        updateItineraryUI();
        
        // Recalculate optimal route if there are still properties selected
        if (selectedProperties.length > 0 && startPointMarker) {
            try {
                // First optimize the order (silent mode - no alerts)
                await optimizeVisitOrder(true);
                
                // Then generate and display the recommended route on the map (silent mode - no alerts)
                await generateRecommendedRoute(true);
                
                console.log('✅ Ruta óptima recalculada y visualizada exitosamente');
                
                // Show success notification
                const successNotif = document.createElement('div');
                successNotif.style.cssText = `
                    position: fixed;
                    top: 150px;
                    right: 20px;
                    background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
                    border: 2px solid #28a745;
                    border-radius: 8px;
                    padding: 16px;
                    max-width: 320px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                `;
                successNotif.innerHTML = `
                    <div style="font-weight: bold; color: #28a745; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 24px;">✅</span>
                        <span>Ruta Recalculada</span>
                    </div>
                    <div style="color: #155724; font-size: 13px;">
                        La ruta ha sido optimizada y visualizada con las ${selectedProperties.length} propiedades restantes.
                    </div>
                `;
                document.body.appendChild(successNotif);
                setTimeout(() => {
                    if (document.body.contains(successNotif)) {
                        successNotif.style.transition = 'opacity 0.5s';
                        successNotif.style.opacity = '0';
                        setTimeout(() => {
                            if (document.body.contains(successNotif)) {
                                document.body.removeChild(successNotif);
                            }
                        }, 500);
                    }
                }, 5000);
            } catch (err) {
                console.error('❌ Error recalculando ruta:', err);
                alert('Error al recalcular la ruta. Por favor, intenta manualmente.');
            }
        } else {
            console.warn('⚠️ No hay propiedades suficientes para recalcular la ruta');
            
            // Show warning notification
            const warningNotif = document.createElement('div');
            warningNotif.style.cssText = `
                position: fixed;
                top: 150px;
                right: 20px;
                background: linear-gradient(135deg, #fff3cd 0%, #ffe69c 100%);
                border: 2px solid #ffc107;
                border-radius: 8px;
                padding: 16px;
                max-width: 320px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: Arial, sans-serif;
            `;
            warningNotif.innerHTML = `
                <div style="font-weight: bold; color: #856404; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 24px;">⚠️</span>
                    <span>Sin Propiedades</span>
                </div>
                <div style="color: #856404; font-size: 13px;">
                    No quedan propiedades en la ruta. Todas las citas han sido canceladas.
                </div>
            `;
            document.body.appendChild(warningNotif);
            setTimeout(() => {
                if (document.body.contains(warningNotif)) {
                    warningNotif.style.transition = 'opacity 0.5s';
                    warningNotif.style.opacity = '0';
                    setTimeout(() => {
                        if (document.body.contains(warningNotif)) {
                            document.body.removeChild(warningNotif);
                        }
                    }, 500);
                }
            }, 5000);
            
            // Stop monitoring if no properties left
            stopRouteRefresh();
        }
    }
    
    // Start automatic route refresh with cancellation checks
    function startRouteRefresh() {
        if (routeRefreshInterval) {
            clearInterval(routeRefreshInterval);
        }
        
        console.log(`🔄 Iniciando refresco automático de rutas cada ${ROUTE_REFRESH_INTERVAL/1000} segundos`);
        
        routeRefreshInterval = setInterval(() => {
            if (scheduledAppointments.size === 0) return;
            
            console.log('🔍 Verificando cancelaciones de citas agendadas...');
            const hadCancellations = checkAppointmentCancellations();
            
            if (!hadCancellations) {
                console.log('✓ No hubo cancelaciones en esta verificación');
            }
        }, ROUTE_REFRESH_INTERVAL);
    }
    
    // Stop automatic route refresh
    function stopRouteRefresh() {
        if (routeRefreshInterval) {
            clearInterval(routeRefreshInterval);
            routeRefreshInterval = null;
            console.log('⏹️ Refresco automático de rutas detenido');
        }
    }
    
    // Update UI to show scheduled appointments
    function updateAppointmentUI() {
        // Try to find or create appointments panel
        let panel = document.getElementById('scheduled-appointments-panel');
        
        if (!panel) {
            // Create panel if it doesn't exist
            const controls = document.getElementById('controls');
            if (controls) {
                panel = document.createElement('div');
                panel.id = 'scheduled-appointments-panel';
                panel.style.cssText = `
                    margin-top: 16px;
                    padding: 12px;
                    background: #fff3cd;
                    border: 2px solid #ffc107;
                    border-radius: 8px;
                `;
                controls.appendChild(panel);
            }
        }
        
        if (!panel) return;
        
        // Update panel content
        if (scheduledAppointments.size === 0) {
            panel.innerHTML = `
                <div style="font-weight: bold; color: #856404; margin-bottom: 4px;">📅 Citas Agendadas</div>
                <div style="color: #856404; font-size: 13px;">No hay citas agendadas actualmente.</div>
            `;
        } else {
            let html = `
                <div style="font-weight: bold; color: #856404; margin-bottom: 8px;">📅 Citas Agendadas (${scheduledAppointments.size})</div>
                <div style="font-size: 12px; color: #856404; margin-bottom: 8px;">⚠️ Cada cita tiene ${CANCEL_PROBABILITY * 100}% de probabilidad de cancelación</div>
            `;
            
            scheduledAppointments.forEach((appointment, houseId) => {
                const status = appointment.isCancelled ? '❌ Cancelada' : '✅ Activa';
                const statusColor = appointment.isCancelled ? '#dc3545' : '#28a745';
                const houseName = appointment.houseData.titulo || appointment.houseData.nombre || `Propiedad ${houseId}`;
                
                html += `
                    <div style="
                        margin: 8px 0;
                        padding: 8px;
                        background: white;
                        border-left: 4px solid ${statusColor};
                        border-radius: 4px;
                    ">
                        <div style="font-weight: bold; font-size: 13px; color: #333;">${houseName}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 4px;">Estado: <span style="color: ${statusColor};">${status}</span></div>
                        <div style="font-size: 11px; color: #666;">ID: ${houseId}</div>
                    </div>
                `;
            });
            
            panel.innerHTML = html;
        }
    }

    // Simple Dijkstra on the adjacency map. Returns array of node ids or null
    function dijkstra(startId, goalId) {
        if (startId === undefined || goalId === undefined) return null;
        const pq = new Map(); // id -> dist (we'll use naive map as PQ)
        const dist = new Map();
        const prev = new Map();
        // init
        nodeIndex.forEach((_, id) => { dist.set(id, Infinity); });
        dist.set(startId, 0);
        pq.set(startId, 0);
        while (pq.size) {
            // extract min
            let u = null; let ud = Infinity;
            pq.forEach((val, key) => { if (val < ud) { ud = val; u = key; } });
            pq.delete(u);
            if (u === goalId) break;
            const neighbors = adj.get(u) || [];
            for (const nb of neighbors) {
                // Apply safety penalty using loaded probabilities (edge + node)
                const base = (nb.weight || 1);
                const edgeKey = `${u}-${nb.to}`;
                const reverseKey = `${nb.to}-${u}`;
                const edgeProb = (edgeProbMap.get(edgeKey) !== undefined) ? edgeProbMap.get(edgeKey) : (edgeProbMap.get(reverseKey) || 0);
                const nodeProb = nodeProbMap.get(nb.to) || 0;
                // Penalty design: increase path length proportional to edge probability (more risk -> larger factor)
                // weight = base * (1 + 2 * edgeProb) + nodeProb * 50
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

    function nodesPathToEdgeFeatures(path) {
        const features = [];
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i+1];
            const key = `${a}-${b}`;
            const f = edgeLookup.get(key);
            if (f) features.push(f);
            else {
                // try to find any edge between a and b
                const found = (edgesGeoJSON && edgesGeoJSON.features || []).find(ff => {
                    const p = ff.properties || {}; return (p.u==a && p.v==b) || (p.u==b && p.v==a);
                });
                if (found) features.push(found);
            }
        }
        return features;
    }

    function loadMetro() {
        return fetch('data/Estaciones_actuales_Metro_de_Santiago.csv').then(r => r.text()).then(t => {
            const parsed = parseCSV(t);
            metroPois = parsed.map(p => {
                const x = parseFloat(p.X);
                const y = parseFloat(p.Y);
                if (isNaN(x) || isNaN(y)) return null;
                const ll = mercatorToLatLon(x, y);
                return { name: p.nombre || p.estacion || p.nombre, lat: ll.lat, lon: ll.lon, linea: p.linea };
            }).filter(Boolean);
            metroPois.forEach(p => {
                const m = L.marker([p.lat, p.lon], { icon: icons.metro }).bindPopup(`<b>${p.name}</b><br>${p.linea || ''}`);
                metroLayer.addLayer(m);
            });
            setText('debug-metro', `metro cargados: ${metroPois.length}`);
            setText('metro-count', metroPois.length);
            // populate start-select with stations inside Providencia bbox
            try {
                const startSelect = document.getElementById('start-select');
                if (startSelect) {
                    const minLon = -70.625, maxLon = -70.580, minLat = -33.440, maxLat = -33.410;
                    metroPois.filter(p => p.lon >= minLon && p.lon <= maxLon && p.lat >= minLat && p.lat <= maxLat).forEach((p, i) => {
                        const opt = document.createElement('option');
                        opt.value = JSON.stringify({lat:p.lat,lon:p.lon,name:p.name});
                        opt.text = p.name + (p.linea?(' ('+p.linea+')'):'');
                        startSelect.appendChild(opt);
                    });
                }
            } catch(e){console.warn('start-select populate failed', e)}
        }).catch(e => { console.error('failed parse metro csv', e); const d=document.getElementById('debug-metro'); if(d)d.textContent='metro load error'; });
    }

    function loadCarabineros() {
        return fetch('data/Carabineros_providencia.json').then(r => r.json()).then(data => {
            carabinerosPois = data.map(item => ({
                nombre: item.nombre || 'Carabineros',
                tipo: item.tipo || '',
                lat: item.lat,
                lon: item.lon,
                comuna: item.comuna || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            carabinerosPois.forEach(p => {
                const m = L.marker([p.lat, p.lon], { icon: icons.carabineros })
                    .bindPopup(`<b>🚓 ${p.nombre}</b><br/><span style="font-size:12px">${p.tipo}<br/>${p.comuna}</span>`);
                carabinerosLayer.addLayer(m);
            });
            setText('debug-carabineros', `carabineros cargados: ${carabinerosPois.length}`);
            setText('carabineros-count', carabinerosPois.length);
        }).catch(e => { console.warn('carabineros load error', e); const d=document.getElementById('debug-carabineros'); if(d)d.textContent='error'; });
    }

    function loadFerias() {
        return fetch('data/Ferias_libres_y_persas_providencia.json').then(r => r.json()).then(data => {
            // Calcular centroide de cada feria usando Shape__Length como referencia
            feriasPois = data.map(item => {
                // Usar las coordenadas aproximadas del centro de Providencia si no hay coords específicas
                // En este caso, usaremos datos de la feria para estimar ubicación
                return {
                    nombre: item.NOMBRE || item.c_n_feri || 'Feria',
                    dias: item.DIAS || item.Dia_1 || '',
                    calle: item.CALLE_0 || '',
                    desde: item.DESDE_0 || '',
                    hasta: item.HASTA_0 || '',
                    inicio: item.Inicio || '',
                    levante: item.Levante || '',
                    comuna: item.COMUNA || 'Providencia',
                    // Coordenadas aproximadas (deberían venir del shapefile original)
                    // Para efectos de demo, ubicamos en puntos cercanos conocidos
                    lat: item.NOMBRE === 'SANTA MARIA' ? -33.4280 : item.NOMBRE === 'LOS CONCILIOS' ? -33.4285 : -33.4250,
                    lon: item.NOMBRE === 'SANTA MARIA' ? -70.6230 : item.NOMBRE === 'LOS CONCILIOS' ? -70.6180 : -70.6200
                };
            });
            
            feriasPois.forEach(p => {
                const popupContent = `
                    <div style="width:200px">
                        <b>🛒 ${p.nombre}</b><br/>
                        <span style="font-size:12px">
                            <b>Días:</b> ${p.dias}<br/>
                            <b>Horario:</b> ${p.inicio} - ${p.levante}<br/>
                            <b>Ubicación:</b> ${p.calle}<br/>
                            ${p.desde ? `Desde ${p.desde}` : ''} ${p.hasta ? `hasta ${p.hasta}` : ''}
                        </span>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.ferias }).bindPopup(popupContent);
                feriasLayer.addLayer(m);
            });
            setText('debug-ferias', `ferias cargadas: ${feriasPois.length}`);
            setText('ferias-count', feriasPois.length);
        }).catch(e => { console.warn('ferias load error', e); const d=document.getElementById('debug-ferias'); if(d)d.textContent='error'; });
    }

    function loadInstitutos() {
        // Cargar solo el archivo JSON de institutos
        return fetch('data/institutos_providencia.json').then(r => r.json()).then(data => {
            // Agrupar por ubicación para evitar marcadores duplicados en la misma dirección
            const grouped = new Map();
            data.forEach(item => {
                const key = `${item.LATITUD}_${item.LONGITUD}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        instituciones: [],
                        lat: parseFloat(item.LATITUD),
                        lon: parseFloat(item.LONGITUD),
                        direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                        comuna: item.COMUNA
                    });
                }
                grouped.get(key).instituciones.push({
                    nombre: item.NOMBRE_INS,
                    tipo: item.TIPO_INST,
                    inmueble: item.NOMBRE_INM,
                    direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                    referencia: item.LUGAR_REFE
                });
            });
            
            institutosPois = Array.from(grouped.values()).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            institutosPois.forEach(p => {
                // Crear lista de instituciones en esta ubicación
                const instList = p.instituciones.map(inst => {
                    return `<div style="margin-bottom:8px; padding:6px; background:#f5f3ff; border-radius:4px;">
                        <b>${inst.nombre}</b><br/>
                        <span style="font-size:11px; color:#6D28D9;">
                            📚 ${inst.tipo}<br/>
                            🏢 ${inst.inmueble}${inst.referencia ? '<br/>📍 ' + inst.referencia : ''}
                        </span>
                    </div>`;
                }).join('');
                
                const popupContent = `
                    <div style="width:280px; max-height:300px; overflow-y:auto;">
                        <h4 style="margin:0 0 10px 0; color:#7C3AED; font-size:14px;">
                            🎓 Institutos de Educación Superior
                        </h4>
                        <p style="margin:0 0 10px 0; font-size:12px;">
                            <b>📍 ${p.direccion}</b><br/>
                            <span style="color:#666;">${p.comuna}</span>
                        </p>
                        <div style="font-size:12px;">
                            <b>${p.instituciones.length} Institución${p.instituciones.length > 1 ? 'es' : ''}:</b>
                        </div>
                        <div style="margin-top:8px; max-height:200px; overflow-y:auto;">
                            ${instList}
                        </div>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.universidad }).bindPopup(popupContent);
                institutosLayer.addLayer(m);
            });
            
            setText('debug-institutos', `institutos cargados: ${institutosPois.length} ubicaciones (${data.length} inmuebles)`);
            setText('institutos-count', institutosPois.length);
        }).catch(e => { console.warn('institutos load error', e); const d=document.getElementById('debug-institutos'); if(d)d.textContent='error'; });
    }

    function loadUniversidadesPrivadas() {
        // Cargar solo el archivo JSON de universidades privadas
        return fetch('data/universidades_privadas_providencia.json').then(r => r.json()).then(data => {
            // Agrupar por ubicación para evitar marcadores duplicados en la misma dirección
            const grouped = new Map();
            data.forEach(item => {
                const key = `${item.LATITUD}_${item.LONGITUD}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        instituciones: [],
                        lat: parseFloat(item.LATITUD),
                        lon: parseFloat(item.LONGITUD),
                        direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                        comuna: item.COMUNA
                    });
                }
                grouped.get(key).instituciones.push({
                    nombre: item.NOMBRE_INS,
                    tipo: item.TIPO_INST,
                    inmueble: item.NOMBRE_INM,
                    direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                    referencia: item.LUGAR_REFE
                });
            });
            
            universidadesPrivadasPois = Array.from(grouped.values()).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            universidadesPrivadasPois.forEach(p => {
                // Crear lista de instituciones en esta ubicación
                const instList = p.instituciones.map(inst => {
                    return `<div style="margin-bottom:8px; padding:6px; background:#f5f3ff; border-radius:4px;">
                        <b>${inst.nombre}</b><br/>
                        <span style="font-size:11px; color:#6D28D9;">
                            📚 ${inst.tipo}<br/>
                            🏢 ${inst.inmueble}${inst.referencia ? '<br/>📍 ' + inst.referencia : ''}
                        </span>
                    </div>`;
                }).join('');
                
                const popupContent = `
                    <div style="width:280px; max-height:300px; overflow-y:auto;">
                        <h4 style="margin:0 0 10px 0; color:#9333EA; font-size:14px;">
                            🏛️ Universidades Privadas
                        </h4>
                        <p style="margin:0 0 10px 0; font-size:12px;">
                            <b>📍 ${p.direccion}</b><br/>
                            <span style="color:#666;">${p.comuna}</span>
                        </p>
                        <div style="font-size:12px;">
                            <b>${p.instituciones.length} Institución${p.instituciones.length > 1 ? 'es' : ''}:</b>
                        </div>
                        <div style="margin-top:8px; max-height:200px; overflow-y:auto;">
                            ${instList}
                        </div>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.universidadPrivada }).bindPopup(popupContent);
                universidadesPrivadasLayer.addLayer(m);
            });
            
            setText('debug-universidades-privadas', `universidades privadas cargadas: ${universidadesPrivadasPois.length} ubicaciones (${data.length} inmuebles)`);
            setText('universidades-privadas-count', universidadesPrivadasPois.length);
        }).catch(e => { console.warn('universidades privadas load error', e); const d=document.getElementById('debug-universidades-privadas'); if(d)d.textContent='error'; });
    }

    function loadUniversidadesEstatales() {
        // Cargar solo el archivo JSON de universidades estatales
        return fetch('data/universidades_estatales_providencia.json').then(r => r.json()).then(data => {
            // Agrupar por ubicación para evitar marcadores duplicados en la misma dirección
            const grouped = new Map();
            data.forEach(item => {
                const key = `${item.LATITUD}_${item.LONGITUD}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        instituciones: [],
                        lat: parseFloat(item.LATITUD),
                        lon: parseFloat(item.LONGITUD),
                        direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                        comuna: item.COMUNA
                    });
                }
                grouped.get(key).instituciones.push({
                    nombre: item.NOMBRE_INS,
                    tipo: item.TIPO_INST,
                    inmueble: item.NOMBRE_INM,
                    direccion: `${item.DIRECCION} ${item.NUMERO_DI}`,
                    referencia: item.LUGAR_REFE
                });
            });
            
            universidadesEstatalesPois = Array.from(grouped.values()).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            universidadesEstatalesPois.forEach(p => {
                // Crear lista de instituciones en esta ubicación
                const instList = p.instituciones.map(inst => {
                    return `<div style="margin-bottom:8px; padding:6px; background:#eff6ff; border-radius:4px;">
                        <b>${inst.nombre}</b><br/>
                        <span style="font-size:11px; color:#1E40AF;">
                            📚 ${inst.tipo}<br/>
                            🏢 ${inst.inmueble}${inst.referencia ? '<br/>📍 ' + inst.referencia : ''}
                        </span>
                    </div>`;
                }).join('');
                
                const popupContent = `
                    <div style="width:280px; max-height:300px; overflow-y:auto;">
                        <h4 style="margin:0 0 10px 0; color:#2563EB; font-size:14px;">
                            🏛️ Universidades Estatales
                        </h4>
                        <p style="margin:0 0 10px 0; font-size:12px;">
                            <b>📍 ${p.direccion}</b><br/>
                            <span style="color:#666;">${p.comuna}</span>
                        </p>
                        <div style="font-size:12px;">
                            <b>${p.instituciones.length} Institución${p.instituciones.length > 1 ? 'es' : ''}:</b>
                        </div>
                        <div style="margin-top:8px; max-height:200px; overflow-y:auto;">
                            ${instList}
                        </div>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.universidadEstatal }).bindPopup(popupContent);
                universidadesEstatalesLayer.addLayer(m);
            });
            
            setText('debug-universidades-estatales', `universidades estatales cargadas: ${universidadesEstatalesPois.length} ubicaciones (${data.length} inmuebles)`);
            setText('universidades-estatales-count', universidadesEstatalesPois.length);
        }).catch(e => { console.warn('universidades estatales load error', e); const d=document.getElementById('debug-universidades-estatales'); if(d)d.textContent='error'; });
    }

    function loadColegios() {
        return fetch('data/Establecimientos_Educacionales_providencia_con_paes.json').then(r => r.json()).then(data => {
            colegiosPois = data.map(item => {
                // Convertir coordenadas con coma a punto
                const lat = parseFloat(item.LATITUD.replace(',', '.'));
                const lon = parseFloat(item.LONGITUD.replace(',', '.'));
                // Determinar tipo de establecimiento
                let tipoEstab = 'Establecimiento Educacional';
                if (item.COD_DEPE === '1' || item.COD_DEPE === '2') {
                    tipoEstab = 'Colegio Municipal/Público';
                } else if (item.COD_DEPE === '3') {
                    tipoEstab = 'Colegio Particular Subvencionado';
                } else if (item.COD_DEPE === '4') {
                    tipoEstab = 'Colegio Particular Pagado';
                } else if (item.COD_DEPE === '5') {
                    tipoEstab = 'Corporación de Administración Delegada';
                }
                // Determinar niveles educativos
                const niveles = [];
                const tieneBasica = item.ENS_02 && item.ENS_02 !== '0';
                const tieneMedia = item.ENS_03 && item.ENS_03 !== '0';
                
                if (item.ENS_01 && item.ENS_01 !== '0') niveles.push('Parvularia');
                if (tieneBasica) niveles.push('Básica');
                if (tieneMedia) niveles.push('Media');
                
                return {
                    nombre: item.NOM_RBD,
                    rbd: item.RBD,
                    lat: lat,
                    lon: lon,
                    comuna: item.NOM_COM_RBD,
                    tipo: tipoEstab,
                    niveles: niveles.join(', ') || 'N/D',
                    matricula: item.MAT_TOTAL || '0',
                    religiosa: item.ORI_RELIGIOSA === '1' ? 'Sí' : 'No',
                    rural: item.RURAL_RBD === '1' ? 'Rural' : 'Urbano',
                    estado: item.ESTADO_ESTAB === '1' ? 'Activo' : 'Inactivo',
                    pago_matricula: item.PAGO_MATRICULA || 'SIN INFORMACION',
                    pago_mensual: item.PAGO_MENSUAL || 'SIN INFORMACION',
                    paes_promedio: item.PAES_PROMEDIO,
                    tieneBasica: tieneBasica,
                    tieneMedia: tieneMedia
                };
            }).filter(p => !isNaN(p.lat) && !isNaN(p.lon) && p.estado === 'Activo' && (p.tieneBasica || p.tieneMedia));
            renderColegiosFiltrados();
        }).catch(e => { console.warn('colegios load error', e); const d=document.getElementById('debug-colegios'); if(d)d.textContent='error'; });
    }

    function loadJardines() {
        return fetch('data/jardines_sala_cuna_providencia.json').then(r => r.json()).then(data => {
            jardinesPois = [];
            const grouped = new Map();
            data.forEach(item => {
                const lat = parseFloat(item.LATITUD?.replace(',', '.') || 0);
                const lon = parseFloat(item.LONGITUD?.replace(',', '.') || 0);
                if (!lat || !lon) return;
                const key = `${lat.toFixed(6)}_${lon.toFixed(6)}`;
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(item);
            });
            grouped.forEach((items, key) => {
                const lat = parseFloat(key.split('_')[0]);
                const lon = parseFloat(key.split('_')[1]);
                jardinesPois.push({ lat, lon });
                const marker = L.marker([lat, lon], { icon: icons.jardin });
                const popupHtml = items.map(p => `<strong>${p.NOM_RBD || 'Sin nombre'}</strong><br>RBD: ${p.RBD || 'N/A'}<br>Comuna: ${p.NOM_COM_RBD || 'N/A'}`).join('<hr>');
                marker.bindPopup(popupHtml);
                jardinesLayer.addLayer(marker);
            });
            setText('jardines-count', jardinesPois.length);
        }).catch(e => { 
            console.warn('jardines load error', e); 
            setText('jardines-count', 0);
        });
    }

    function loadEdges() {
        // Load edges geojson (linestrings) if generated by ETL
        return fetch('data/edges.geojson').then(r => {
            if (!r.ok) throw new Error('edges not found');
            return r.json();
        }).then(gj => {
            // keep copy for routing
            edgesGeoJSON = gj;

            // Build adjacency and edge lookup for quick path finding
            try {
                (gj.features || []).forEach(f => {
                    const props = f.properties || {};
                    const u = props.u, v = props.v;
                    // length fallback
                    const length = (props.length && Number(props.length)) || (() => {
                        // attempt to compute from geometry's coordinates last-first
                        try {
                            const coords = f.geometry && f.geometry.coordinates;
                            if (coords && coords.length) {
                                const a = coords[0], b = coords[coords.length-1];
                                return haversineDistance({lat: a[1], lon: a[0]}, {lat: b[1], lon: b[0]});
                            }
                        } catch(e){}
                        return 1;
                    })();
                    if (u !== undefined && v !== undefined) {
                        if (!adj.has(u)) adj.set(u, []);
                        if (!adj.has(v)) adj.set(v, []);
                                adj.get(u).push({ to: v, weight: Number(length) });
                                adj.get(v).push({ to: u, weight: Number(length) });
                        edgeLookup.set(`${u}-${v}`, f);
                        edgeLookup.set(`${v}-${u}`, f);
                    }
                });
            } catch(e) { console.warn('build adjacency failed', e); }

            const geojsonLayer = L.geoJSON(gj, {
                style: function(feature) {
                    return { color: '#3388ff', weight: 2, opacity: 0.6 };
                },
                onEachFeature: function(feature, layer) {
                    const props = feature.properties || {};
                    if (props && props.name) layer.bindPopup(`<b>${props.name}</b>`);
                }
            });
            edgesLayer.clearLayers();
            edgesLayer.addLayer(geojsonLayer);
            setText('debug-edges', `aristas cargadas: ${ (gj.features && gj.features.length) || 0}`);
        }).catch(e => { console.warn('edges load error', e); const d=document.getElementById('debug-edges'); if(d)d.textContent='edges load error'; });
    }

    // Load edge/node probabilities (optional files produced by amenazas generator)
    async function loadProbabilities() {
        try {
            const [eResp, nResp] = await Promise.all([
                fetch('data/edge_probabilities.json').catch(_=>null),
                fetch('data/node_probabilities.json').catch(_=>null)
            ]);
            if (eResp && eResp.ok) {
                const eJson = await eResp.json();
                // support either object map {"u-v": prob} or array [{u:..., v:..., prob:...}]
                if (Array.isArray(eJson)) {
                    eJson.forEach(it => {
                        if (it.u !== undefined && it.v !== undefined) edgeProbMap.set(`${it.u}-${it.v}`, Number(it.prob || it.p || 0));
                        else if (it.key) edgeProbMap.set(it.key, Number(it.prob || it.p || 0));
                    });
                } else if (typeof eJson === 'object' && eJson !== null) {
                    Object.keys(eJson).forEach(k => { edgeProbMap.set(k, Number(eJson[k] || 0)); });
                }
            }
            if (nResp && nResp.ok) {
                const nJson = await nResp.json();
                if (Array.isArray(nJson)) {
                    nJson.forEach(it => { if (it.id !== undefined) nodeProbMap.set(Number(it.id), Number(it.prob || it.p || 0)); });
                } else if (typeof nJson === 'object' && nJson !== null) {
                    Object.keys(nJson).forEach(k => { nodeProbMap.set(Number(k), Number(nJson[k] || 0)); });
                }
            }
            console.log('probabilities loaded', edgeProbMap.size, nodeProbMap.size);
        } catch (e) { console.warn('loadProbabilities failed', e); }
    }

    function loadNodes() {
        return fetch('data/nodes.geojson').then(r => {
            if (!r.ok) throw new Error('nodes not found');
            return r.json();
        }).then(gj => {
            nodesGeoJSON = gj;
            try {
                (gj.features || []).forEach(f => {
                    const props = f.properties || {};
                    const id = props.id || props.osm_id || props.node_id || props.nid;
                    const coords = f.geometry && f.geometry.coordinates;
                    if (id !== undefined && coords && coords.length) {
                        nodeIndex.set(Number(id), { lat: coords[1], lon: coords[0] });
                    }
                });
            } catch(e) { console.warn('build node index failed', e); }
            setText('debug-nodes', `nodos cargados: ${(gj.features && gj.features.length) || 0}`);
        }).catch(e => { console.warn('nodes load error', e); const d=document.getElementById('debug-nodes'); if(d)d.textContent='nodes load error'; });
    }

    // Load active threats from Monte Carlo simulation
    async function loadActiveThreats() {
        try {
            const res = await fetch('data/active_threats.json');
            if (!res.ok) throw new Error('active_threats.json not found');
            activeThreatsData = await res.json();
            console.log('Amenazas activas cargadas:', activeThreatsData);
            renderActiveThreats();
        } catch (err) {
            console.warn('No se pudieron cargar las amenazas activas:', err);
        }
    }

    // Render active threats on map
    function renderActiveThreats() {
        activeThreatsLayer.clearLayers();
        if (!activeThreatsData) return;

        let count = 0;

        // Render active edges
        if (activeThreatsData.edges && activeThreatsData.edges.length > 0) {
            activeThreatsData.edges.forEach(edge => {
                const edgeId = `${edge.u}-${edge.v}`;
                const edgeFeature = edgeLookup.get(edgeId);
                if (edgeFeature) {
                    const prob = edge.probability || 0;
                    const color = prob > 0.3 ? '#FF0000' : prob > 0.15 ? '#FFA500' : '#FFD700';
                    L.geoJSON(edgeFeature, {
                        style: { color: color, weight: 4, opacity: 0.8 }
                    }).bindPopup(`⚠️ Amenaza activa en arista<br>Nodos: ${edge.u} → ${edge.v}<br>Probabilidad: ${(prob * 100).toFixed(1)}%<br>Severidad: ${edge.severity}`).addTo(activeThreatsLayer);
                    count++;
                }
            });
        }

        // Render active nodes
        if (activeThreatsData.nodes && activeThreatsData.nodes.length > 0) {
            activeThreatsData.nodes.forEach(node => {
                const nodeCoords = nodeIndex.get(Number(node.node_id));
                if (nodeCoords) {
                    const prob = node.probability || 0;
                    const color = prob > 0.3 ? '#FF0000' : prob > 0.15 ? '#FFA500' : '#FFD700';
                    L.circleMarker([nodeCoords.lat, nodeCoords.lon], {
                        radius: 6,
                        fillColor: color,
                        color: '#000',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).bindPopup(`⚠️ Amenaza activa en nodo<br>ID: ${node.node_id}<br>Probabilidad: ${(prob * 100).toFixed(1)}%<br>Severidad: ${node.severity}`).addTo(activeThreatsLayer);
                    count++;
                }
            });
        }

        // Render active incidents
        if (activeThreatsData.incidents && activeThreatsData.incidents.length > 0) {
            activeThreatsData.incidents.forEach(incident => {
                if (incident.coordinates && incident.coordinates.length === 2) {
                    const lon = incident.coordinates[0];
                    const lat = incident.coordinates[1];
                    L.marker([lat, lon], {
                        icon: L.divIcon({
                            className: 'threat-incident-icon',
                            html: '<div style="background-color: #FF0000; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid #000;">🚨</div>',
                            iconSize: [24, 24]
                        })
                    }).bindPopup(`🚨 Incidente activo<br>Tipo: ${incident.type || 'Desconocido'}<br>Descripción: ${incident.description || ''}<br>Severidad: ${incident.severity || 'N/A'}`).addTo(activeThreatsLayer);
                    count++;
                }
            });
        }

        console.log(`Renderizadas ${count} amenazas activas en el mapa`);
    }

    // Load threat probabilities
    async function loadThreatProbabilities() {
        try {
            const [edgeRes, nodeRes] = await Promise.all([
                fetch('data/edge_probabilities.json'),
                fetch('data/node_probabilities.json')
            ]);
            
            if (edgeRes.ok) edgeProbabilitiesData = await edgeRes.json();
            if (nodeRes.ok) nodeProbabilitiesData = await nodeRes.json();
            
            console.log('Probabilidades de amenazas cargadas:', {
                edges: edgeProbabilitiesData ? edgeProbabilitiesData.length : 0,
                nodes: nodeProbabilitiesData ? nodeProbabilitiesData.length : 0
            });
            renderThreatProbabilities();
        } catch (err) {
            console.warn('No se pudieron cargar las probabilidades de amenazas:', err);
        }
    }

    // Render threat probabilities on map
    function renderThreatProbabilities() {
        threatProbabilitiesLayer.clearLayers();
        
        let count = 0;
        
        // Render edge probabilities
        if (edgeProbabilitiesData && Array.isArray(edgeProbabilitiesData)) {
            edgeProbabilitiesData.forEach(edge => {
                if (edge.probability > 0.05) {
                    const edgeId = `${edge.u}-${edge.v}`;
                    const edgeFeature = edgeLookup.get(edgeId);
                    if (edgeFeature) {
                        const prob = edge.probability;
                        const color = prob > 0.3 ? '#FF6B6B' : prob > 0.15 ? '#FFB347' : '#FFE66D';
                        L.geoJSON(edgeFeature, {
                            style: { color: color, weight: 3, opacity: 0.6 }
                        }).bindPopup(`Probabilidad de riesgo: ${(prob * 100).toFixed(1)}%<br>Arista: ${edge.u} → ${edge.v}`).addTo(threatProbabilitiesLayer);
                        count++;
                    }
                }
            });
        }

        // Render node probabilities
        if (nodeProbabilitiesData && Array.isArray(nodeProbabilitiesData)) {
            nodeProbabilitiesData.forEach(node => {
                if (node.probability > 0.05) {
                    const nodeId = node.node_id || node.id;
                    const nodeCoords = nodeIndex.get(Number(nodeId));
                    if (nodeCoords) {
                        const prob = node.probability;
                        const color = prob > 0.3 ? '#FF6B6B' : prob > 0.15 ? '#FFB347' : '#FFE66D';
                        L.circleMarker([nodeCoords.lat, nodeCoords.lon], {
                            radius: 4,
                            fillColor: color,
                            color: '#000',
                            weight: 1,
                            opacity: 0.6,
                            fillOpacity: 0.5
                        }).bindPopup(`Probabilidad de riesgo: ${(prob * 100).toFixed(1)}%<br>Nodo: ${nodeId}`).addTo(threatProbabilitiesLayer);
                        count++;
                    }
                }
            });
        }
        
        console.log(`Renderizadas ${count} probabilidades de riesgo en el mapa`);
    }

    // Apply POI filters
    function applyPoiFilters() {
        const radius = (poiRadiusInput && parseFloat(poiRadiusInput.value)) ? parseFloat(poiRadiusInput.value) : 500;
        let nearbyCount = 0;
        // Build list of selected POIs
        const selectedPois = [];
        if (filterHealthCb && filterHealthCb.checked) selectedPois.push(...healthPois.map(p => ({ lat: p.lat, lon: p.lon })));
        if (filterMetroCb && filterMetroCb.checked) selectedPois.push(...metroPois.map(p => ({ lat: p.lat, lon: p.lon })));

        // For each house marker check distance to any selected poi
        const matched = [];
        houseMarkers.forEach(marker => {
            const h = marker.houseData;
            const point = { lat: h.lat, lon: h.lon };
            const near = selectedPois.some(p => haversineDistance(point, p) <= radius);
            if (near) { matched.push(h); nearbyCount++; marker.addTo(housesLayer); }
            else { housesLayer.removeLayer(marker); }
        });
        setText('nearby-pois-count', nearbyCount);
        setText('houses-filtered-count', matched.length);
    }

    // Toggle layers (only attach if control exists)
    const showCecosfCb = document.getElementById('show-cecosf-layer');
    const showCosamCb = document.getElementById('show-cosam-layer');
    const showConinCb = document.getElementById('show-conin-layer');
    const showCesfamCb = document.getElementById('show-cesfam-layer');
    const showCentroSaludCb = document.getElementById('show-centro-salud-layer');
    const showCentroMedicoCb = document.getElementById('show-centro-medico-layer');
    const showClinicaDentalCb = document.getElementById('show-clinica-dental-layer');
    const showClinicaCb = document.getElementById('show-clinica-layer');
    const showCdtCb = document.getElementById('show-cdt-layer');
    const showDireccionSaludCb = document.getElementById('show-direccion-salud-layer');
    const showHospitalCb = document.getElementById('show-hospital-layer');
    const showLaboratorioCb = document.getElementById('show-laboratorio-layer');
    const showPraisCb = document.getElementById('show-prais-layer');
    const showSapuCb = document.getElementById('show-sapu-layer');
    const showUnidadSaludFuncionariosCb = document.getElementById('show-unidad-salud-funcionarios-layer');
    const showVacunatorioCb = document.getElementById('show-vacunatorio-layer');
    if (showCecosfCb) showCecosfCb.addEventListener('change', e => { if (e.target.checked) cecosfLayer.addTo(map); else map.removeLayer(cecosfLayer); });
    if (showCosamCb) showCosamCb.addEventListener('change', e => { if (e.target.checked) cosamLayer.addTo(map); else map.removeLayer(cosamLayer); });
    if (showConinCb) showConinCb.addEventListener('change', e => { if (e.target.checked) coninLayer.addTo(map); else map.removeLayer(coninLayer); });
    if (showCesfamCb) showCesfamCb.addEventListener('change', e => { if (e.target.checked) cesfamLayer.addTo(map); else map.removeLayer(cesfamLayer); });
    if (showCentroSaludCb) showCentroSaludCb.addEventListener('change', e => { if (e.target.checked) centroSaludLayer.addTo(map); else map.removeLayer(centroSaludLayer); });
    if (showCentroMedicoCb) showCentroMedicoCb.addEventListener('change', e => { if (e.target.checked) centroMedicoLayer.addTo(map); else map.removeLayer(centroMedicoLayer); });
    if (showClinicaDentalCb) showClinicaDentalCb.addEventListener('change', e => { if (e.target.checked) clinicaDentalLayer.addTo(map); else map.removeLayer(clinicaDentalLayer); });
    if (showClinicaCb) showClinicaCb.addEventListener('change', e => { if (e.target.checked) clinicaLayer.addTo(map); else map.removeLayer(clinicaLayer); });
    if (showCdtCb) showCdtCb.addEventListener('change', e => { if (e.target.checked) cdtLayer.addTo(map); else map.removeLayer(cdtLayer); });
    if (showDireccionSaludCb) showDireccionSaludCb.addEventListener('change', e => { if (e.target.checked) direccionSaludLayer.addTo(map); else map.removeLayer(direccionSaludLayer); });
    if (showHospitalCb) showHospitalCb.addEventListener('change', e => { if (e.target.checked) hospitalLayer.addTo(map); else map.removeLayer(hospitalLayer); });
    if (showLaboratorioCb) showLaboratorioCb.addEventListener('change', e => { if (e.target.checked) laboratorioLayer.addTo(map); else map.removeLayer(laboratorioLayer); });
    if (showPraisCb) showPraisCb.addEventListener('change', e => { if (e.target.checked) praisLayer.addTo(map); else map.removeLayer(praisLayer); });
    if (showSapuCb) showSapuCb.addEventListener('change', e => { if (e.target.checked) sapuLayer.addTo(map); else map.removeLayer(sapuLayer); });
    if (showUnidadSaludFuncionariosCb) showUnidadSaludFuncionariosCb.addEventListener('change', e => { if (e.target.checked) unidadSaludFuncionariosLayer.addTo(map); else map.removeLayer(unidadSaludFuncionariosLayer); });
    if (showVacunatorioCb) showVacunatorioCb.addEventListener('change', e => { if (e.target.checked) vacunatorioLayer.addTo(map); else map.removeLayer(vacunatorioLayer); });
    if (showMetroCb) showMetroCb.addEventListener('change', e => { if (e.target.checked) metroLayer.addTo(map); else map.removeLayer(metroLayer); });
    if (showHousesCb) showHousesCb.addEventListener('change', e => { if (e.target.checked) housesLayer.addTo(map); else map.removeLayer(housesLayer); });

    const showParaderosCb = document.getElementById('show-paraderos-layer');
    const showEdgesCb = document.getElementById('show-edges-layer');
    const showCarabinerosCb = document.getElementById('show-carabineros-layer');
    const showFeriasCb = document.getElementById('show-ferias-layer');
    const showInstitutosCb = document.getElementById('show-institutos-layer');
    const showUniversidadesPrivadasCb = document.getElementById('show-universidades-privadas-layer');
    const showUniversidadesEstatalesCb = document.getElementById('show-universidades-estatales-layer');
    const showColegiosCb = document.getElementById('show-colegios-layer');
    const showJardinesCb = document.getElementById('show-jardines-layer');
    
    if (showParaderosCb) showParaderosCb.addEventListener('change', e => { if (e.target.checked) paraderosLayer.addTo(map); else map.removeLayer(paraderosLayer); });
    if (showEdgesCb) showEdgesCb.addEventListener('change', e => { if (e.target.checked) edgesLayer.addTo(map); else map.removeLayer(edgesLayer); });
    if (showCarabinerosCb) showCarabinerosCb.addEventListener('change', e => { if (e.target.checked) carabinerosLayer.addTo(map); else map.removeLayer(carabinerosLayer); });
    if (showFeriasCb) showFeriasCb.addEventListener('change', e => { if (e.target.checked) feriasLayer.addTo(map); else map.removeLayer(feriasLayer); });
    if (showInstitutosCb) showInstitutosCb.addEventListener('change', e => { if (e.target.checked) institutosLayer.addTo(map); else map.removeLayer(institutosLayer); });
    if (showUniversidadesPrivadasCb) showUniversidadesPrivadasCb.addEventListener('change', e => { if (e.target.checked) universidadesPrivadasLayer.addTo(map); else map.removeLayer(universidadesPrivadasLayer); });
    if (showUniversidadesEstatalesCb) showUniversidadesEstatalesCb.addEventListener('change', e => { if (e.target.checked) universidadesEstatalesLayer.addTo(map); else map.removeLayer(universidadesEstatalesLayer); });
    if (showColegiosCb) showColegiosCb.addEventListener('change', e => { if (e.target.checked) colegiosLayer.addTo(map); else map.removeLayer(colegiosLayer); });
    if (showJardinesCb) showJardinesCb.addEventListener('change', e => { if (e.target.checked) jardinesLayer.addTo(map); else map.removeLayer(jardinesLayer); });

    // Amenazas toggles
    const showActiveThreats = document.getElementById('show-active-threats');
    const showThreatProbabilities = document.getElementById('show-threat-probabilities');
    
    if (showActiveThreats) {
        showActiveThreats.addEventListener('change', e => {
            if (e.target.checked) {
                if (!activeThreatsData) {
                    loadActiveThreats().then(() => activeThreatsLayer.addTo(map));
                } else {
                    activeThreatsLayer.addTo(map);
                }
            } else {
                map.removeLayer(activeThreatsLayer);
            }
        });
    }

    if (showThreatProbabilities) {
        showThreatProbabilities.addEventListener('change', e => {
            if (e.target.checked) {
                if (!edgeProbabilitiesData && !nodeProbabilitiesData) {
                    loadThreatProbabilities().then(() => threatProbabilitiesLayer.addTo(map));
                } else {
                    threatProbabilitiesLayer.addTo(map);
                }
            } else {
                map.removeLayer(threatProbabilitiesLayer);
            }
        });
    }

    // Route OSM toggle
    const showRouteOSMCb = document.getElementById('show-route-osm');
    async function loadRouteOSM() {
        const debugEl = document.getElementById('debug-route');
        try {
            const res = await fetch('data/route_osm.geojson');
            if (!res.ok) throw new Error('route_osm.geojson not found');
            const gj = await res.json();
            // remove previous if exists
            if (routeOSMGeoJson) routeOSMLayer.removeLayer(routeOSMGeoJson);
            routeOSMGeoJson = L.geoJSON(gj, {
                style: function(feature) {
                    return { color: '#7C3AED', weight: 4, opacity: 0.9 };
                },
                onEachFeature: function(feature, layer) {
                    const props = feature.properties || {};
                    const info = [];
                    if (props && props.u !== undefined && props.v !== undefined) info.push('u:'+props.u+' v:'+props.v);
                    if (props && props.length) info.push('len:'+Math.round(props.length)+'m');
                    if (info.length) layer.bindPopup(info.join(' — '));
                }
            });
            routeOSMLayer.clearLayers();
            routeOSMLayer.addLayer(routeOSMGeoJson);
            if (showRouteOSMCb && showRouteOSMCb.checked) routeOSMLayer.addTo(map);
            if (debugEl) debugEl.textContent = (gj.features && gj.features.length) || 0;
        } catch (err) {
            console.warn('loadRouteOSM error', err);
            if (debugEl) debugEl.textContent = 'error';
        }
    }
    if (showRouteOSMCb) {
        showRouteOSMCb.addEventListener('change', e => {
            if (e.target.checked) {
                // ensure layer loaded
                if (!routeOSMGeoJson) loadRouteOSM().then(() => routeOSMLayer.addTo(map));
                else routeOSMLayer.addTo(map);
            } else {
                map.removeLayer(routeOSMLayer);
            }
        });
    }

    // Activar capa de jardines por defecto
    if (showJardinesCb) {
        showJardinesCb.checked = true;
        if (map.hasLayer(jardinesLayer)) {
            // already added
        } else {
            jardinesLayer.addTo(map);
        }
    }

    // Ensure additional layers are ON on startup: check controls and add layers
    try {
        const layerCheckboxIds = [
            'show-cecosf-layer',
            'show-cosam-layer',
            'show-conin-layer',
            'show-cesfam-layer',
            'show-centro-salud-layer',
            'show-centro-medico-layer',
            'show-clinica-dental-layer',
            'show-clinica-layer',
            'show-cdt-layer',
            'show-direccion-salud-layer',
            'show-hospital-layer',
            'show-laboratorio-layer',
        'show-prais-layer',
        'show-sapu-layer',
        'show-unidad-salud-funcionarios-layer',
        'show-vacunatorio-layer',
            'show-health-layer',
            'show-metro-layer',
            'show-paraderos-layer',
            'show-carabineros-layer',
            'show-ferias-layer',
            'show-institutos-layer',
            'show-universidades-privadas-layer',
            'show-universidades-estatales-layer',
            'show-colegios-layer',
            'show-edges-layer'
        ];

        layerCheckboxIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = true;
        });

        // add layers to map
        try { if (!map.hasLayer(cecosfLayer)) map.addLayer(cecosfLayer); } catch(e) {}
        try { if (!map.hasLayer(cosamLayer)) map.addLayer(cosamLayer); } catch(e) {}
        try { if (!map.hasLayer(coninLayer)) map.addLayer(coninLayer); } catch(e) {}
        try { if (!map.hasLayer(cesfamLayer)) map.addLayer(cesfamLayer); } catch(e) {}
        try { if (!map.hasLayer(centroSaludLayer)) map.addLayer(centroSaludLayer); } catch(e) {}
        try { if (!map.hasLayer(centroMedicoLayer)) map.addLayer(centroMedicoLayer); } catch(e) {}
        try { if (!map.hasLayer(clinicaDentalLayer)) map.addLayer(clinicaDentalLayer); } catch(e) {}
        try { if (!map.hasLayer(clinicaLayer)) map.addLayer(clinicaLayer); } catch(e) {}
        try { if (!map.hasLayer(cdtLayer)) map.addLayer(cdtLayer); } catch(e) {}
        try { if (!map.hasLayer(direccionSaludLayer)) map.addLayer(direccionSaludLayer); } catch(e) {}
        try { if (!map.hasLayer(hospitalLayer)) map.addLayer(hospitalLayer); } catch(e) {}
        try { if (!map.hasLayer(laboratorioLayer)) map.addLayer(laboratorioLayer); } catch(e) {}
        try { if (!map.hasLayer(praisLayer)) map.addLayer(praisLayer); } catch(e) {}
        try { if (!map.hasLayer(sapuLayer)) map.addLayer(sapuLayer); } catch(e) {}
        try { if (!map.hasLayer(unidadSaludFuncionariosLayer)) map.addLayer(unidadSaludFuncionariosLayer); } catch(e) {}
        try { if (!map.hasLayer(vacunatorioLayer)) map.addLayer(vacunatorioLayer); } catch(e) {}
        try { if (!map.hasLayer(healthLayer)) map.addLayer(healthLayer); } catch(e) {}
        try { if (!map.hasLayer(metroLayer)) map.addLayer(metroLayer); } catch(e) {}
        try { if (!map.hasLayer(paraderosLayer)) map.addLayer(paraderosLayer); } catch(e) {}
        try { if (!map.hasLayer(carabinerosLayer)) map.addLayer(carabinerosLayer); } catch(e) {}
        try { if (!map.hasLayer(feriasLayer)) map.addLayer(feriasLayer); } catch(e) {}
        try { if (!map.hasLayer(institutosLayer)) map.addLayer(institutosLayer); } catch(e) {}
        try { if (!map.hasLayer(universidadesPrivadasLayer)) map.addLayer(universidadesPrivadasLayer); } catch(e) {}
        try { if (!map.hasLayer(universidadesEstatalesLayer)) map.addLayer(universidadesEstatalesLayer); } catch(e) {}
        try { if (!map.hasLayer(colegiosLayer)) map.addLayer(colegiosLayer); } catch(e) {}
        try { if (!map.hasLayer(jardinesLayer)) map.addLayer(jardinesLayer); } catch(e) {}
        try { if (!map.hasLayer(edgesLayer)) map.addLayer(edgesLayer); } catch(e) {}
    } catch (e) { console.warn('startup layer enable failed', e); }

    // Provide a button to disable/uncheck all additional layers at runtime
    const disableAllBtn = document.getElementById('disable-all-layers-btn');
    let allLayersDisabled = false;
    if (disableAllBtn) disableAllBtn.addEventListener('click', () => {
        const mapping = [
            {id: 'show-cecosf-layer', layer: cecosfLayer},
            {id: 'show-cosam-layer', layer: cosamLayer},
            {id: 'show-conin-layer', layer: coninLayer},
            {id: 'show-cesfam-layer', layer: cesfamLayer},
            {id: 'show-centro-salud-layer', layer: centroSaludLayer},
            {id: 'show-centro-medico-layer', layer: centroMedicoLayer},
            {id: 'show-clinica-dental-layer', layer: clinicaDentalLayer},
            {id: 'show-clinica-layer', layer: clinicaLayer},
            {id: 'show-cdt-layer', layer: cdtLayer},
            {id: 'show-direccion-salud-layer', layer: direccionSaludLayer},
            {id: 'show-hospital-layer', layer: hospitalLayer},
            {id: 'show-laboratorio-layer', layer: laboratorioLayer},
            {id: 'show-prais-layer', layer: praisLayer},
            {id: 'show-sapu-layer', layer: sapuLayer},
            {id: 'show-unidad-salud-funcionarios-layer', layer: unidadSaludFuncionariosLayer},
            {id: 'show-vacunatorio-layer', layer: vacunatorioLayer},
            {id: 'show-metro-layer', layer: metroLayer},
            {id: 'show-paraderos-layer', layer: paraderosLayer},
            {id: 'show-carabineros-layer', layer: carabinerosLayer},
            {id: 'show-ferias-layer', layer: feriasLayer},
            {id: 'show-institutos-layer', layer: institutosLayer},
            {id: 'show-universidades-privadas-layer', layer: universidadesPrivadasLayer},
            {id: 'show-universidades-estatales-layer', layer: universidadesEstatalesLayer},
            {id: 'show-colegios-layer', layer: colegiosLayer},
            {id: 'show-jardines-layer', layer: jardinesLayer},
            {id: 'show-edges-layer', layer: edgesLayer},
            {id: 'show-route-osm', layer: routeOSMLayer}
        ];

        if (!allLayersDisabled) {
            // Desactivar todas las capas
            mapping.forEach(item => {
                try {
                    const el = document.getElementById(item.id);
                    if (el) el.checked = false;
                } catch (e) {}
                try { if (item.layer && map.hasLayer(item.layer)) map.removeLayer(item.layer); } catch (e) {}
            });

            // also hide any active threat layers or probability overlays
            try { if (map.hasLayer(activeThreatsLayer)) map.removeLayer(activeThreatsLayer); } catch(e) {}
            try { if (map.hasLayer(threatProbabilitiesLayer)) map.removeLayer(threatProbabilitiesLayer); } catch(e) {}

            // update any debug UI counters
            try { setText('debug-edges', '0'); } catch(e) {}
            try { setText('debug-metro', '0'); } catch(e) {}

            disableAllBtn.textContent = '✅ Activar todas las capas';
            allLayersDisabled = true;
        } else {
            // Activar todas las capas
            mapping.forEach(item => {
                try {
                    const el = document.getElementById(item.id);
                    if (el) el.checked = true;
                } catch (e) {}
                try { if (item.layer && !map.hasLayer(item.layer)) map.addLayer(item.layer); } catch (e) {}
            });

            disableAllBtn.textContent = '🚫 Desactivar todas las capas';
            allLayersDisabled = false;
        }
    });

    if (applyPoiFiltersBtn) applyPoiFiltersBtn.addEventListener('click', () => applyPoiFilters());

    // Start point
    // Use start-select value or geolocation
    const startSelectEl = document.getElementById('start-select');
    const pickStartBtn = document.getElementById('pick-start-btn');
    if (startPointBtn) startPointBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            setStartPoint(latitude, longitude, 'Tu ubicación');
        }, err => { console.error('geolocation err', err); alert('No se pudo obtener ubicación.'); });
    });

    if (startSelectEl) startSelectEl.addEventListener('change', (e) => {
        const v = e.target.value;
        if (!v || v === 'user') return; // user handled by button
        try {
            const obj = JSON.parse(v);
            setStartPoint(obj.lat, obj.lon, obj.name || 'Estación');
        } catch(ex){ console.warn('invalid start select', ex); }
    });

    if (pickStartBtn) {
        let picking = false;
        pickStartBtn.addEventListener('click', () => {
            picking = !picking;
            pickStartBtn.textContent = picking ? 'Clic en mapa para fijar' : 'Elegir en el mapa';
            if (picking) {
                map.once('click', function(ev){ setStartPoint(ev.latlng.lat, ev.latlng.lng, 'Punto elegido'); picking=false; pickStartBtn.textContent='Elegir en el mapa'; });
            }
        });
    }

    function setStartPoint(lat, lon, label) {
        if (startPointMarker) map.removeLayer(startPointMarker);
        startPointMarker = L.marker([lat, lon], { icon: L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25,41], iconAnchor:[12,41] }) }).addTo(map);
        startPointMarker.bindPopup('<b>' + (label||'Inicio') + '</b>').openPopup();
        map.setView([lat, lon], 14);
        console.log(`[FLUJO] Origen establecido: ${label} en (${lat.toFixed(6)}, ${lon.toFixed(6)})`);
        
        // Reset route metrics when origin changes
        routeMetrics = { nearestNeighbor: null, aco: null, multimodal: null, docplex: null };
        console.log(`[FLUJO] Métricas de rutas reiniciadas`);
    }

    // Clear selection button
    const clearSelBtn = document.getElementById('clear-selection-btn');
    if (clearSelBtn) clearSelBtn.addEventListener('click', () => {
        selectedProperties = [];
        houseMarkers.forEach(m => {
            if (m.houseData) {
                m.setIcon(getPropertyIcon(m.houseData, false)); // Usar versión normal
            }
        });
        updateItineraryUI();
    });

    // Completar selección: ocultar todas las propiedades no seleccionadas
    const completeSelBtn = document.getElementById('complete-selection-btn');
    if (completeSelBtn) {
        completeSelBtn.addEventListener('click', () => {
            const selIds = new Set(selectedProperties.map(s => s.id));
            houseMarkers.forEach(m => {
                const id = m.houseData && m.houseData.id;
                if (!selIds.has(id)) {
                    try { housesLayer.removeLayer(m); } catch(e) {}
                } else {
                    if (!housesLayer.hasLayer(m)) housesLayer.addLayer(m);
                    // keep the icon as it was at selection time; do not force-change it here
                }
            });
            // update counters and UI
            updateItineraryUI();
            // setText('houses-filtered-count', houseMarkers.filter(m => housesLayer.hasLayer(m)).length + ' (seleccionadas: ' + selectedProperties.length + ')');
            // disable the button after completing selection to avoid accidental repeats
            completeSelBtn.disabled = true;
            completeSelBtn.textContent = '✅ Selección completada';
        });
    }

    // Restaurar todo: volver a mostrar todas las propiedades ocultas
    const restoreSelBtn = document.getElementById('restore-selection-btn');
    if (restoreSelBtn) {
        restoreSelBtn.addEventListener('click', () => {
            // Add back all markers to the housesLayer
            houseMarkers.forEach(m => {
                try { if (!housesLayer.hasLayer(m)) housesLayer.addLayer(m); } catch(e) { console.warn('restore layer add failed', e); }
            });
            // Re-enable the complete button and reset its text
            if (completeSelBtn) {
                completeSelBtn.disabled = false;
                completeSelBtn.textContent = '☑️ Mostrar selección';
            }
            // Update UI counters
            updateItineraryUI();
            setText('houses-filtered-count', houseMarkers.filter(m => housesLayer.hasLayer(m)).length + ' (seleccionadas: ' + selectedProperties.length + ')');
        });
    }

    // =====================
    // Orden óptimo (TSP heurístico)
    // =====================
    function pathLengthFromNodes(pathNodes) {
        if (!pathNodes || pathNodes.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < pathNodes.length - 1; i++) {
            const a = pathNodes[i], b = pathNodes[i+1];
            const f = edgeLookup.get(`${a}-${b}`) || edgeLookup.get(`${b}-${a}`);
            if (f && f.properties && f.properties.length) total += Number(f.properties.length);
            else {
                const na = nodeIndex.get(a), nb = nodeIndex.get(b);
                if (na && nb) total += haversineDistance({lat: na.lat, lon: na.lon}, {lat: nb.lat, lon: nb.lon});
            }
        }
        return total;
    }

    function distanceBetweenNodes(a, b) {
        // compute dijkstra path then length
        const path = dijkstra(a, b);
        if (!path) return Infinity;
        return pathLengthFromNodes(path);
    }

    async function computeDistanceMatrix(nodeIds) {
        const n = nodeIds.length;
        const mat = Array.from({length:n}, () => Array(n).fill(Infinity));
        for (let i=0;i<n;i++) {
            for (let j=0;j<n;j++) {
                if (i===j) { mat[i][j]=0; continue; }
                mat[i][j] = distanceBetweenNodes(nodeIds[i], nodeIds[j]);
            }
        }
        return mat;
    }

    function nearestNeighborOrder(distMat) {
        const n = distMat.length;
        const visited = Array(n).fill(false);
        const order = [0]; // assume 0 is start
        visited[0]=true;
        for (let k=1;k<n;k++) {
            const last = order[order.length-1];
            let best = -1, bd = Infinity;
            for (let j=1;j<n;j++) if (!visited[j]) {
                if (distMat[last][j] < bd) { bd = distMat[last][j]; best=j; }
            }
            if (best===-1) break;
            order.push(best); visited[best]=true;
        }
        return order;
    }

    function twoOpt(order, distMat) {
        const n = order.length;
        let improved = true;
        while (improved) {
            improved = false;
            for (let i=1;i<n-2;i++) {
                for (let k=i+1;k<n-1;k++) {
                    const a = order[i-1], b = order[i];
                    const c = order[k], d = order[k+1];
                    const delta = (distMat[a][c] + distMat[b][d]) - (distMat[a][b] + distMat[c][d]);
                    if (delta < -1e-6) {
                        // reverse segment [i..k]
                        const newSeg = order.slice(i, k+1).reverse();
                        order.splice(i, k-i+1, ...newSeg);
                        improved = true;
                    }
                    if (improved) break;
                }
                if (improved) break;
            }
        }
        return order;
    }

    // =====================
    // Ant Colony Optimization (metaheurística) para TSP parcial (no retorno a inicio)
    // =====================
    function antColonyTSP(distMat, opts = {}) {
        const n = distMat.length;
        if (n <= 2) return Array.from({ length: n }, (_, i) => i);
        const numAnts = opts.numAnts || Math.max(10, n);
        const iterations = opts.iterations || 120;
        const alpha = opts.alpha || 1; // pheromone importance
        const beta = opts.beta || 3;  // heuristic importance
        const rho = opts.rho || 0.12; // evaporation
        const Q = opts.Q || 1.0;
        const eps = 1e-9;

        // initialize pheromone and heuristic
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
                const visited = new Set([0]); // start fixed at index 0
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
                        // fallback: pick random unvisited
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
                            // numeric fallback
                            for (let j = 1; j < n; j++) if (!visited.has(j)) { chosen = j; break; }
                        }
                    }
                    tour.push(chosen); visited.add(chosen);
                }

                // compute length (no return to start)
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

            // pheromone evaporation
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) tau[i][j] *= (1 - rho);

            // deposits
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

    async function optimizeVisitOrderACO(silent = false, opts = {}) {
        const startTime = performance.now();
        console.log(`[FLUJO] Iniciando optimización de orden (ACO - Ant Colony Optimization)`);
        
        if (!startPointMarker) {
            console.warn('No hay punto de partida definido');
            if (!silent) return alert('Define punto de partida antes de optimizar');
            return false;
        }
        if (selectedProperties.length < 1) {
            console.warn('No hay propiedades seleccionadas');
            if (!silent) return alert('Selecciona al menos una propiedad');
            return false;
        }
        // ensure graph loaded
        if (!nodesGeoJSON) await loadNodes();
        if (!edgesGeoJSON) await loadEdges();

        const startLatLng = startPointMarker.getLatLng();
        const startSnap = snapToNearestNode(startLatLng.lat, startLatLng.lng);
        if (!startSnap || startSnap.id === null) {
            if (!silent) return alert('No se pudo snapear el punto de inicio a la red');
            return false;
        }
        const startNode = startSnap.id;

        // snap each property to nearest node
        const waypoints = selectedProperties.map(h => ({ house: h, snap: snapToNearestNode(h.lat, h.lon) }));
        const nodeIds = [startNode].concat(waypoints.map(w => w.snap.id));

        const distMat = await computeDistanceMatrix(nodeIds);

        // run ACO on distance matrix
        const acoOpts = Object.assign({ numAnts: Math.max(10, nodeIds.length), iterations: 150, alpha: 1, beta: 3, rho: 0.12 }, opts);
        const bestTour = antColonyTSP(distMat, acoOpts);

        // bestTour is an array of indices with 0 as start
        const orderedProps = [];
        for (let idx = 1; idx < bestTour.length; idx++) {
            const wpIdx = bestTour[idx] - 1; // waypoints start at pos 1
            if (wpIdx >= 0 && waypoints[wpIdx]) orderedProps.push(waypoints[wpIdx].house);
        }

        // replace selectedProperties with ordered version
        selectedProperties = orderedProps;

        // Calculate total distance
        let totalDistance = 0;
        for (let i = 0; i < bestTour.length - 1; i++) {
            totalDistance += distMat[bestTour[i]][bestTour[i + 1]];
        }
        
        const computationTime = performance.now() - startTime;
        
        console.log(`[RUTA] Optimización completada - Algoritmo: ACO`);
        console.log(`[RUTA] Tiempo de cómputo: ${computationTime.toFixed(2)} ms`);
        console.log(`[RUTA] Distancia total: ${totalDistance.toFixed(2)} metros`);
        console.log(`[RUTA] Número de propiedades: ${orderedProps.length}`);
        console.log(`[RUTA] Óptimo: Metaheurístico (aproximadamente óptimo)`);
        
        // Store metrics
        routeMetrics.aco = {
            algorithm: 'ACO',
            computationTime: computationTime,
            totalDistance: totalDistance,
            numProperties: orderedProps.length,
            isOptimal: false,
            optimality: 'Metaheurístico'
        };
        
        compareRoutes();

        // schedule appointments automatically
        console.log('🔄 Agendando automáticamente todas las propiedades (ACO)...');
        orderedProps.forEach(house => {
            if (!scheduledAppointments.has(house.id)) scheduleAppointment(house);
        });

        // start monitoring if not already
        if (!routeRefreshInterval) startRouteRefresh();

        // Render the full route using multimodal logic (streets via OSMnx, paraderos/metro)
        try {
            await generateRecommendedRoute(true);
        } catch (e) {
            console.warn('No se pudo generar la ruta recomendada tras ACO:', e);
        }

        updateItineraryUI();
        if (!silent) alert('✅ Orden optimizado con ACO exitosamente.');
        return true;
    }

    async function optimizeVisitOrder(silent = false) {
        const startTime = performance.now();
        console.log(`[FLUJO] Iniciando optimización de orden (Nearest Neighbor + 2-Opt)`);
        
        if (!startPointMarker) {
            console.warn('No hay punto de partida definido');
            if (!silent) return alert('Define punto de partida antes de optimizar');
            return false;
        }
        if (selectedProperties.length < 1) {
            console.warn('No hay propiedades seleccionadas');
            if (!silent) return alert('Selecciona al menos una propiedad');
            return false;
        }
        // ensure graph loaded
        if (!nodesGeoJSON) await loadNodes();
        if (!edgesGeoJSON) await loadEdges();

        const startLatLng = startPointMarker.getLatLng();
        const startSnap = snapToNearestNode(startLatLng.lat, startLatLng.lng);
        if (!startSnap || startSnap.id===null) {
            if (!silent) return alert('No se pudo snapear el punto de inicio a la red');
            return false;
        }
        const startNode = startSnap.id;

        // snap each property to nearest node
        const waypoints = selectedProperties.map(h => ({ house: h, snap: snapToNearestNode(h.lat, h.lon) }));
        const nodeIds = [startNode].concat(waypoints.map(w => w.snap.id));

        const distMat = await computeDistanceMatrix(nodeIds);
        let order = nearestNeighborOrder(distMat);
        order = twoOpt(order, distMat);

        // order[0] is start index 0; subsequent indices correspond to waypoints array indexes
        const orderedProps = [];
        for (let idx=1; idx<order.length; idx++) {
            const wpIdx = order[idx]-1; // because waypoints start at position 1
            if (wpIdx>=0 && waypoints[wpIdx]) orderedProps.push(waypoints[wpIdx].house);
        }
        // replace selectedProperties with ordered version
        selectedProperties = orderedProps;
        
        // Calculate total distance
        let totalDistance = 0;
        for (let i = 0; i < order.length - 1; i++) {
            totalDistance += distMat[order[i]][order[i + 1]];
        }
        
        const computationTime = performance.now() - startTime;
        
        console.log(`[RUTA] Optimización completada - Algoritmo: Nearest Neighbor + 2-Opt`);
        console.log(`[RUTA] Tiempo de cómputo: ${computationTime.toFixed(2)} ms`);
        console.log(`[RUTA] Distancia total: ${totalDistance.toFixed(2)} metros`);
        console.log(`[RUTA] Número de propiedades: ${orderedProps.length}`);
        console.log(`[RUTA] Óptimo: Heurístico (no garantizado óptimo global)`);
        
        // Store metrics
        routeMetrics.nearestNeighbor = {
            algorithm: 'Nearest Neighbor + 2-Opt',
            computationTime: computationTime,
            totalDistance: totalDistance,
            numProperties: orderedProps.length,
            isOptimal: false,
            optimality: 'Heurístico'
        };
        
        compareRoutes();
        
        // Automatically schedule all selected properties as appointments
        console.log('🔄 Agendando automáticamente todas las propiedades seleccionadas...');
        orderedProps.forEach(house => {
            if (!scheduledAppointments.has(house.id)) {
                scheduleAppointment(house);
            }
        });
        
        // Automatically start threat monitoring
        if (!routeRefreshInterval) {
            console.log('▶️ Activando monitoreo automático de amenazas...');
            startRouteRefresh();
            
            // Show activation notification
            const activationNotif = document.createElement('div');
            activationNotif.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                border: 2px solid #047857;
                border-radius: 8px;
                padding: 16px;
                max-width: 320px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: Arial, sans-serif;
                color: white;
            `;
            activationNotif.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 24px;">🛡️</span>
                    <span>Sistema de Amenazas Activado</span>
                </div>
                <div style="font-size: 13px; margin-bottom: 8px; opacity: 0.95;">
                    ✅ ${orderedProps.length} propiedades agendadas<br/>
                    🔍 Monitoreo cada 30 segundos<br/>
                    ⚠️ 20% probabilidad de cancelación por cita
                </div>
                <div style="font-size: 11px; opacity: 0.85; font-style: italic; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                    El sistema recalculará automáticamente la ruta si hay cancelaciones.
                </div>
            `;
            document.body.appendChild(activationNotif);
            setTimeout(() => {
                if (document.body.contains(activationNotif)) {
                    activationNotif.style.transition = 'opacity 0.5s';
                    activationNotif.style.opacity = '0';
                    setTimeout(() => document.body.removeChild(activationNotif), 500);
                }
            }, 6000);
        }
        
        // Render the full route using multimodal logic (streets via OSMnx, paraderos/metro)
        try {
            await generateRecommendedRoute(true);
        } catch (e) {
            console.warn('No se pudo generar la ruta recomendada tras optimización:', e);
        }
        
        updateItineraryUI();
        if (!silent) {
            alert('✅ Orden optimizado exitosamente.\n\n🛡️ Sistema de monitoreo de amenazas activado automáticamente.');
        }
        return true;
    }

    // =====================
    // Ruta recomendada: combinar paraderos + caminar
    // =====================
    const recommendedLayer = L.layerGroup().addTo(map);
    function nodesToLatLngs(pathNodes) {
        const coords = [];
        if (!Array.isArray(pathNodes)) return coords;
        for (let i = 0; i < pathNodes.length; i++) {
            const nid = pathNodes[i];
            const n = nodeIndex.get(nid);
            if (n) coords.push([n.lat, n.lon]);
        }
        return coords;
    }
    function nearestParadero(lat, lon) {
        if (!paraderos || paraderos.length===0) return null;
        let best = null; let bd = Infinity;
        paraderos.forEach(p => {
            const d = haversineDistance({lat, lon}, {lat: p.lat, lon: p.lon});
            if (d < bd) { bd = d; best = p; }
        });
        return { paradero: best, distance: bd };
    }

    async function generateRecommendedRoute(silent = false) {
        const startTime = performance.now();
        console.log(`[FLUJO] Iniciando generación de ruta recomendada (con transporte público)`);
        
        if (!startPointMarker) {
            if (!silent) return alert('Define punto de partida');
            return false;
        }
        if (selectedProperties.length === 0) {
            if (!silent) return alert('Selecciona propiedades primero');
            return false;
        }
        // ensure graph loaded
        if (!nodesGeoJSON) await loadNodes();
        if (!edgesGeoJSON) await loadEdges();

        recommendedLayer.clearLayers();
        const instrContainer = document.getElementById('instructions-content');
        const placeholder = document.getElementById('instructions-placeholder');
        if (instrContainer) instrContainer.innerHTML = '';
        if (placeholder) placeholder.style.display = 'none';

        const walkSpeed = 83.333; // m per min (~5km/h)
        const busSpeed = 416.667; // m per min (~25km/h)

    let currentLatLng = startPointMarker.getLatLng();
    const legs = []; // sequence of {type:'walk'|'transit', distanceM, timeMin, desc, from:{lat,lon,name}, to:{lat,lon,name}, transport}
    const destLegIndices = []; // end index in legs[] for each destination (used to compute ETAs)
    const startTimeRoute = new Date();

        function stopLatLon(s) {
            if (!s) return null;
            if (s.lat !== undefined && s.lon !== undefined) return { lat: s.lat, lon: s.lon };
            if (s.station && s.station.lat !== undefined && s.station.lon !== undefined) return { lat: s.station.lat, lon: s.station.lon };
            if (s.paradero && s.paradero.lat !== undefined && s.paradero.lon !== undefined) return { lat: s.paradero.lat, lon: s.paradero.lon };
            return null;
        }

        for (let i = 0; i < selectedProperties.length; i++) {
            const target = selectedProperties[i];

            // If no paraderos loaded, fallback to walking via graph
            if (!paraderos || paraderos.length === 0) {
                const startSnap = snapToNearestNode(currentLatLng.lat, currentLatLng.lng);
                const endSnap = snapToNearestNode(target.lat, target.lon);
                let walkM = 0;
                let edgeFeats = [];
                if (startSnap && endSnap && startSnap.id !== undefined && endSnap.id !== undefined) {
                    const pathNodes = dijkstra(startSnap.id, endSnap.id);
                    if (pathNodes && pathNodes.length >= 2) {
                        walkM = pathLengthFromNodes(pathNodes);
                        edgeFeats = nodesPathToEdgeFeatures(pathNodes);
                    }
                }
                if (walkM === 0) walkM = haversineDistance({ lat: currentLatLng.lat, lon: currentLatLng.lng }, { lat: target.lat, lon: target.lon });
                const timeMin = walkM / walkSpeed;
                legs.push({ type: 'walk', distanceM: walkM, timeMin, desc: `Camina ${Math.round(walkM)} m hasta la propiedad: ${target.titulo || ''}`, from: { lat: currentLatLng.lat, lon: currentLatLng.lng }, to: { lat: target.lat, lon: target.lon } });
                if (edgeFeats.length > 0) {
                    recommendedLayer.addLayer(L.geoJSON({ type: 'FeatureCollection', features: edgeFeats }, { style: { color: '#07192bff', dashArray: '6 6', weight: 3, opacity: 0.8 } }));
                } else {
                    recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [target.lat, target.lon]], { color: '#0b2136ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                }
                currentLatLng = L.latLng(target.lat, target.lon);
                continue;
            }

            // candidate paraderos and metro stations: nearest K to origin and target
            const K = 6;
            function nearestKParaderos(lat, lon, k) {
                if (!paraderos) return [];
                return paraderos.map(p => ({ p, d: haversineDistance({ lat, lon }, { lat: p.lat, lon: p.lon }) })).sort((a, b) => a.d - b.d).slice(0, k).map(x => ({ paradero: x.p, distance: x.d }));
            }
            function nearestKMetro(lat, lon, k) {
                if (!metroPois) return [];
                return metroPois.map(s => ({ s, d: haversineDistance({ lat, lon }, { lat: s.lat, lon: s.lon }) })).sort((a, b) => a.d - b.d).slice(0, k).map(x => ({ station: x.s, distance: x.d }));
            }
            const fromParCandidates = nearestKParaderos(currentLatLng.lat, currentLatLng.lng, K);
            const toParCandidates = nearestKParaderos(target.lat, target.lon, K);
            const fromMetroCandidates = nearestKMetro(currentLatLng.lat, currentLatLng.lng, K);
            const toMetroCandidates = nearestKMetro(target.lat, target.lon, K);

            let bestOption = { type: 'walk', timeMin: Infinity, details: null };

            const walkOnlyM = haversineDistance({ lat: currentLatLng.lat, lon: currentLatLng.lng }, { lat: target.lat, lon: target.lon });
            const walkOnlyTime = walkOnlyM / walkSpeed;
            bestOption = { type: 'walk', timeMin: walkOnlyTime, details: { walkM: walkOnlyM } };

            // evaluar pares paradero-paradero (bus) usando Dijkstra en calles
            for (const f of fromParCandidates) {
                for (const t of toParCandidates) {
                    const walkFrom = f.distance;
                    const walkTo = t.distance;
                    const fromNode = snapToNearestNode(f.paradero.lat, f.paradero.lon).id;
                    const toNode = snapToNearestNode(t.paradero.lat, t.paradero.lon).id;
                    if (fromNode === undefined || toNode === undefined) continue;
                    const pathNodes = dijkstra(fromNode, toNode);
                    if (!pathNodes) continue;
                    const busMeters = pathLengthFromNodes(pathNodes);
                    const timeMin = (walkFrom / walkSpeed) + (busMeters / busSpeed) + (walkTo / walkSpeed);
                    if (timeMin < bestOption.timeMin) {
                        bestOption = { type: 'transit', timeMin, details: { transport: 'bus', from: f.paradero, to: t.paradero, walkFrom, walkTo, transitMeters: busMeters, pathNodes } };
                    }
                }
            }

            // evaluar pares metro-metro (trayecto sobre calles entre estaciones)
            for (const f of fromMetroCandidates) {
                for (const t of toMetroCandidates) {
                    const walkFrom = f.distance;
                    const walkTo = t.distance;
                    const fromNode = snapToNearestNode(f.station.lat, f.station.lon).id;
                    const toNode = snapToNearestNode(t.station.lat, t.station.lon).id;
                    if (fromNode === undefined || toNode === undefined) continue;
                    const pathNodes = dijkstra(fromNode, toNode);
                    if (!pathNodes) continue;
                    const metroMeters = pathLengthFromNodes(pathNodes);
                    const timeMin = (walkFrom / walkSpeed) + (metroMeters / busSpeed) + (walkTo / walkSpeed);
                    if (timeMin < bestOption.timeMin) {
                        bestOption = { type: 'transit', timeMin, details: { transport: 'metro', from: f.station, to: t.station, walkFrom, walkTo, transitMeters: metroMeters, pathNodes } };
                    }
                }
            }

            // evaluar combos mixtos: paradero -> metro (calle entre puntos)
            for (const f of fromParCandidates) {
                for (const t of toMetroCandidates) {
                    const walkFrom = f.distance;
                    const walkTo = t.distance;
                    const fromNode = snapToNearestNode(f.paradero.lat, f.paradero.lon).id;
                    const toNode = snapToNearestNode(t.station.lat, t.station.lon).id;
                    if (fromNode === undefined || toNode === undefined) continue;
                    const pathNodes = dijkstra(fromNode, toNode);
                    if (!pathNodes) continue;
                    const meters = pathLengthFromNodes(pathNodes);
                    const timeMin = (walkFrom / walkSpeed) + (meters / busSpeed) + (walkTo / walkSpeed);
                    if (timeMin < bestOption.timeMin) {
                        bestOption = { type: 'transit', timeMin, details: { transport: 'bus', from: f.paradero, to: t.station, walkFrom, walkTo, transitMeters: meters, pathNodes } };
                    }
                }
            }

            // mixed combos: metro -> paradero
            for (const f of fromMetroCandidates) {
                for (const t of toParCandidates) {
                    const walkFrom = f.distance;
                    const walkTo = t.distance;
                    const fromNode = snapToNearestNode(f.station.lat, f.station.lon).id;
                    const toNode = snapToNearestNode(t.paradero.lat, t.paradero.lon).id;
                    if (fromNode === undefined || toNode === undefined) continue;
                    const pathNodes = dijkstra(fromNode, toNode);
                    if (!pathNodes) continue;
                    const meters = pathLengthFromNodes(pathNodes);
                    const timeMin = (walkFrom / walkSpeed) + (meters / busSpeed) + (walkTo / walkSpeed);
                    if (timeMin < bestOption.timeMin) {
                        bestOption = { type: 'transit', timeMin, details: { transport: 'bus', from: f.station, to: t.paradero, walkFrom, walkTo, transitMeters: meters, pathNodes } };
                    }
                }
            }

            // Build legs & layers based on bestOption
            if (bestOption.type === 'walk') {
                const m = Math.round(bestOption.details.walkM);
                const timeMin = bestOption.details.walkM / walkSpeed;
                legs.push({ type: 'walk', distanceM: bestOption.details.walkM, timeMin, desc: `Camina ${Math.round(bestOption.details.walkM)} m hasta la propiedad: ${target.titulo || ''}`, from: { lat: currentLatLng.lat, lon: currentLatLng.lng }, to: { lat: target.lat, lon: target.lon } });
                // Render walk via graph
                const sSnap = snapToNearestNode(currentLatLng.lat, currentLatLng.lng);
                const eSnap = snapToNearestNode(target.lat, target.lon);
                if (sSnap && eSnap && sSnap.id !== undefined && eSnap.id !== undefined) {
                    const pNodes = dijkstra(sSnap.id, eSnap.id);
                    const edgeFeats = nodesPathToEdgeFeatures(pNodes || []);
                    if (edgeFeats.length > 0) {
                        recommendedLayer.addLayer(L.geoJSON({ type: 'FeatureCollection', features: edgeFeats }, { style: { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 } }));
                    } else {
                        recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [target.lat, target.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                    }
                } else {
                    recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [target.lat, target.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                }
            } else if (bestOption.type === 'transit') {
                const d = bestOption.details;
                const transport = d.transport || 'bus';

                // walk to origin stop
                const fromCoords = stopLatLon(d.from) || { lat: (d.from && d.from.lat) || 0, lon: (d.from && d.from.lon) || 0 };
                const toCoords = stopLatLon(d.to) || { lat: (d.to && d.to.lat) || 0, lon: (d.to && d.to.lon) || 0 };
                const walkToFromM = d.walkFrom;
                const walkToFromMin = walkToFromM / walkSpeed;
                legs.push({ type: 'walk', distanceM: walkToFromM, timeMin: walkToFromMin, desc: `Camina ${Math.round(walkToFromM)} m hasta el ${transport === 'metro' ? 'andén/estación' : 'paradero'}: ${ (d.from && (d.from.nombre || d.from.codigo)) || '' }`, from: { lat: currentLatLng.lat, lon: currentLatLng.lng }, to: { lat: fromCoords.lat, lon: fromCoords.lon }, transport: transport });
                // Render walk to stop via graph
                const w1Snap = snapToNearestNode(currentLatLng.lat, currentLatLng.lng);
                const w1Stop = snapToNearestNode(fromCoords.lat, fromCoords.lon);
                if (w1Snap && w1Stop && w1Snap.id !== undefined && w1Stop.id !== undefined) {
                    const w1Path = dijkstra(w1Snap.id, w1Stop.id);
                    const w1Feats = nodesPathToEdgeFeatures(w1Path || []);
                    if (w1Feats.length > 0) {
                        recommendedLayer.addLayer(L.geoJSON({ type: 'FeatureCollection', features: w1Feats }, { style: { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 } }));
                    } else {
                        recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [fromCoords.lat, fromCoords.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                    }
                } else {
                    recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [fromCoords.lat, fromCoords.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                }
                L.marker([fromCoords.lat, fromCoords.lon], { icon: transport === 'metro' ? icons.metro : icons.paradero }).bindPopup(`Toma aquí (${transport})`).addTo(recommendedLayer);

                // transit leg along graph
                const edgeFeats = nodesPathToEdgeFeatures(d.pathNodes || []);
                const transitMeters = (d.transitMeters !== undefined) ? d.transitMeters : (edgeFeats && edgeFeats.length ? pathLengthFromNodes(d.pathNodes) : haversineDistance(fromCoords, toCoords));
                const transitMin = transitMeters / busSpeed;
                if (edgeFeats && edgeFeats.length) {
                    const color = transport === 'metro' ? '#6f42c1' : '#FF4500';
                    recommendedLayer.addLayer(L.geoJSON({ type: 'FeatureCollection', features: edgeFeats }, { style: { color: color, weight: 5, opacity: 0.9 } }));
                    legs.push({ type: 'transit', transport: transport, distanceM: transitMeters, timeMin: transitMin, desc: `Toma ${transport} aprox. ${Math.round(transitMin)} min (${Math.round(transitMeters)} m) desde ${(d.from.nombre || '')} hasta ${(d.to.nombre || '')}`, from: { lat: fromCoords.lat, lon: fromCoords.lon, name: d.from && (d.from.nombre || d.from.codigo) }, to: { lat: toCoords.lat, lon: toCoords.lon, name: d.to && (d.to.nombre || d.to.codigo) } });
                } else {
                    const color = transport === 'metro' ? '#6f42c1' : '#FF4500';
                    recommendedLayer.addLayer(L.polyline([[fromCoords.lat, fromCoords.lon], [toCoords.lat, toCoords.lon]], { color: color, weight: 4, opacity: 0.7 }));
                    legs.push({ type: 'transit', transport: transport, distanceM: transitMeters, timeMin: transitMin, desc: `Toma ${transport} desde ${(d.from.nombre || '')} hasta ${(d.to.nombre || '')} (trayecto aproximado)`, from: { lat: fromCoords.lat, lon: fromCoords.lon }, to: { lat: toCoords.lat, lon: toCoords.lon } });
                }
                L.marker([toCoords.lat, toCoords.lon], { icon: transport === 'metro' ? icons.metro : icons.paradero }).bindPopup('Bájate aquí').addTo(recommendedLayer);

                // walk from stop to property
                const walkFromDestM = d.walkTo;
                const walkFromDestMin = walkFromDestM / walkSpeed;
                legs.push({ type: 'walk', distanceM: walkFromDestM, timeMin: walkFromDestMin, desc: `Camina ${Math.round(walkFromDestM)} m desde ${(d.to.nombre || '')} hasta la propiedad`, from: { lat: toCoords.lat, lon: toCoords.lon }, to: { lat: target.lat, lon: target.lon } });
                // Render walk from stop via graph
                const w2Stop = snapToNearestNode(toCoords.lat, toCoords.lon);
                const w2Dest = snapToNearestNode(target.lat, target.lon);
                if (w2Stop && w2Dest && w2Stop.id !== undefined && w2Dest.id !== undefined) {
                    const w2Path = dijkstra(w2Stop.id, w2Dest.id);
                    const w2Feats = nodesPathToEdgeFeatures(w2Path || []);
                    if (w2Feats.length > 0) {
                        recommendedLayer.addLayer(L.geoJSON({ type: 'FeatureCollection', features: w2Feats }, { style: { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 } }));
                    } else {
                        recommendedLayer.addLayer(L.polyline([[toCoords.lat, toCoords.lon], [target.lat, target.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                    }
                } else {
                    recommendedLayer.addLayer(L.polyline([[toCoords.lat, toCoords.lon], [target.lat, target.lon]], { color: '#061627ff', dashArray: '6 6', weight: 3, opacity: 0.8 }));
                }
            }

            // mark property
            recommendedLayer.addLayer(L.circleMarker([target.lat, target.lon], { radius: 6, color: '#2E8B57', fillColor: '#2E8B57', fillOpacity: 0.9 }).bindPopup(`<b>${target.titulo || 'Propiedad'}</b><br/>${target.comuna || ''}`));

            // Remember where this destination's legs end
            destLegIndices.push(legs.length);

            currentLatLng = L.latLng(target.lat, target.lon);
        }
        // compute totals, per-destination ETAs and render instructions with per-leg metrics
        let totalMeters = 0, totalMinutes = 0;
        const destSummaries = []; // { target, eta:Date, cumMinutes, cumMeters }
        let legIdx = 0;
        for (let i = 0; i < legs.length; i++) {
            const l = legs[i];
            totalMeters += (l.distanceM || 0);
            totalMinutes += (l.timeMin || 0);
            legIdx = i + 1; // 1-based end index
            // check whether this leg index marks the end of a destination
            for (let d = 0; d < destLegIndices.length; d++) {
                if (destLegIndices[d] === legIdx && !destSummaries[d]) {
                    // compute cumulative up to this point
                    const cumMinutes = legs.slice(0, legIdx).reduce((s, x) => s + (x.timeMin || 0), 0);
                    const cumMeters = legs.slice(0, legIdx).reduce((s, x) => s + (x.distanceM || 0), 0);
                    const eta = new Date(startTimeRoute.getTime() + Math.round(cumMinutes * 60000));
                    // target corresponding is selectedProperties[d]
                    const target = selectedProperties[d];
                    destSummaries[d] = { target, eta, cumMinutes, cumMeters };
                }
            }
        }

        if (instrContainer) {
            const summary = document.createElement('div');
            summary.style.padding = '6px';
            summary.style.borderBottom = '1px solid #eee';
            summary.innerHTML = `<b>Total estimado:</b> ${Math.round(totalMinutes)} min — ${Math.round(totalMeters)} m`;
            instrContainer.appendChild(summary);

            // Show per-destination ETAs first
            const destDiv = document.createElement('div');
            destDiv.style.marginBottom = '8px';
            destDiv.style.fontSize = '13px';
            destDiv.style.color = '#374151';
            destSummaries.forEach((ds, idx) => {
                if (!ds) return;
                const hhmm = ds.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const txt = `Llegada estimada a ${ds.target.titulo || 'propiedad'}: ${hhmm} (acumulado: ${Math.round(ds.cumMinutes)} min — ${Math.round(ds.cumMeters)} m)`;
                const p = document.createElement('div'); p.textContent = txt; p.style.marginBottom = '4px'; destDiv.appendChild(p);
            });
            instrContainer.appendChild(destDiv);

            // Full legs list
            const ol = document.createElement('ol');
            legs.forEach(l => {
                const li = document.createElement('li');
                let txt = '';
                if (l.type === 'walk') {
                    txt = `${l.desc} (${Math.round(l.distanceM)} m — ${Math.round(l.timeMin)} min)`;
                } else if (l.type === 'transit') {
                    txt = `${l.desc} (${Math.round(l.distanceM)} m — ${Math.round(l.timeMin)} min)`;
                }
                li.textContent = txt;
                ol.appendChild(li);
            });
            instrContainer.appendChild(ol);
        }

        // Populate the professional route panel
        try {
            const legendEl = document.getElementById('legend-recommended-route');
            const routePlaceholder = document.getElementById('route-placeholder');
            const routeStepsContainer = document.getElementById('route-steps-container');
            const routeEmptyMessage = document.getElementById('route-empty-message');
            
            if (legendEl && routePlaceholder && routeStepsContainer) {
                // Hide placeholder, show route panel
                routePlaceholder.style.display = 'none';
                legendEl.style.display = 'block';
                
                // Update summary statistics
                const totalTimeEl = document.getElementById('route-total-time');
                const totalDistanceEl = document.getElementById('route-total-distance');
                const totalStopsEl = document.getElementById('route-total-stops');
                
                if (totalTimeEl) totalTimeEl.textContent = `${Math.round(totalMinutes)} min`;
                if (totalDistanceEl) totalDistanceEl.textContent = totalMeters >= 1000 
                    ? `${(totalMeters / 1000).toFixed(1)} km` 
                    : `${Math.round(totalMeters)} m`;
                if (totalStopsEl) totalStopsEl.textContent = selectedProperties.length;
                
                // Clear previous steps
                routeStepsContainer.innerHTML = '';
                
                // Hide empty message
                if (routeEmptyMessage) routeEmptyMessage.style.display = 'none';
                
                // Associate properties with their corresponding legs
                let propertyIndex = 0;
                
                // Build professional step-by-step route
                legs.forEach((leg, index) => {
                    const stepDiv = document.createElement('div');
                    stepDiv.className = 'route-step';
                    
                    // Detect if this is the last leg to a property
                    const isPropertyArrival = leg.desc && leg.desc.toLowerCase().includes('propiedad');
                    const currentProperty = isPropertyArrival && propertyIndex < selectedProperties.length 
                        ? selectedProperties[propertyIndex++] 
                        : null;
                    
                    // Add step number
                    const stepNumber = document.createElement('div');
                    stepNumber.className = 'step-number';
                    stepNumber.textContent = index + 1;
                    stepDiv.appendChild(stepNumber);
                    
                    // Determine transport mode and icon
                    const isWalking = leg.type === 'walk' || (leg.desc && leg.desc.toLowerCase().includes('camina'));
                    const isBus = leg.type === 'transit' && leg.transport === 'bus';
                    const isMetro = leg.type === 'transit' && leg.transport === 'metro';
                    
                    let transportIcon = '🚶🏻‍♂️';
                    let transportMode = 'Caminar';
                    
                    if (isBus) {
                        transportIcon = '🚌';
                        transportMode = 'Tomar Bus';
                    } else if (isMetro) {
                        transportIcon = '🚇';
                        transportMode = 'Tomar Metro';
                    }
                    
                    // Step header
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'step-header';
                    headerDiv.innerHTML = `
                        <span class="step-icon">${transportIcon}</span>
                        <span class="step-mode">${transportMode}</span>
                        <span class="step-duration">${Math.round(leg.timeMin)} min</span>
                    `;
                    stepDiv.appendChild(headerDiv);
                    
                    // Step details
                    const detailsDiv = document.createElement('div');
                    detailsDiv.className = 'step-details';
                    
                    // Distance
                    const distanceDiv = document.createElement('div');
                    distanceDiv.className = 'step-distance';
                    distanceDiv.textContent = leg.distanceM >= 1000 
                        ? `${(leg.distanceM / 1000).toFixed(1)} km` 
                        : `${Math.round(leg.distanceM)} m`;
                    detailsDiv.appendChild(distanceDiv);
                    
                    // Destination
                    const destDiv = document.createElement('div');
                    destDiv.className = 'step-destination';
                    destDiv.textContent = leg.desc || 'Siguiente punto';
                    detailsDiv.appendChild(destDiv);
                    
                    // Risk level - Calculate from edge/node probabilities if available
                    if (leg.pathNodes && leg.pathNodes.length > 0) {
                        // Calculate average risk from path nodes
                        let totalRisk = 0;
                        let riskCount = 0;
                        
                        for (let i = 0; i < leg.pathNodes.length - 1; i++) {
                            const edgeKey = `${leg.pathNodes[i]}-${leg.pathNodes[i+1]}`;
                            const reverseKey = `${leg.pathNodes[i+1]}-${leg.pathNodes[i]}`;
                            const edgeProb = edgeProbMap.get(edgeKey) || edgeProbMap.get(reverseKey) || 0;
                            totalRisk += edgeProb;
                            riskCount++;
                        }
                        
                        if (riskCount > 0) {
                            const avgRisk = totalRisk / riskCount;
                            const riskPercent = Math.round(avgRisk * 100);
                            let riskClass = 'risk-low';
                            let riskIcon = '🟢';
                            let riskLabel = 'Riesgo bajo';
                            
                            if (riskPercent > 30) {
                                riskClass = 'risk-medium';
                                riskIcon = '🟡';
                                riskLabel = 'Riesgo medio';
                            }
                            if (riskPercent > 60) {
                                riskClass = 'risk-high';
                                riskIcon = '🔴';
                                riskLabel = 'Riesgo alto';
                            }
                            
                            const riskDiv = document.createElement('div');
                            riskDiv.className = `step-risk ${riskClass}`;
                            riskDiv.textContent = `${riskIcon} ${riskLabel} (${riskPercent}%)`;
                            detailsDiv.appendChild(riskDiv);
                        }
                    }
                    
                    // Property info (if this step leads to a property)
                    if (currentProperty) {
                        const propInfoDiv = document.createElement('div');
                        propInfoDiv.className = 'step-property-info';
                        
                        let propDetails = '';
                        if (currentProperty.precio) propDetails += `<div class="step-property-detail"><strong>💰</strong> ${currentProperty.precio} UF</div>`;
                        if (currentProperty.dormitorios) propDetails += `<div class="step-property-detail"><strong>🛏️</strong> ${currentProperty.dormitorios} dorm</div>`;
                        if (currentProperty.banos) propDetails += `<div class="step-property-detail"><strong>🚿</strong> ${currentProperty.banos} baños</div>`;
                        if (currentProperty.m2_construidos) propDetails += `<div class="step-property-detail"><strong>📐</strong> ${currentProperty.m2_construidos} m²</div>`;
                        else if (currentProperty.m2_superficie) propDetails += `<div class="step-property-detail"><strong>📐</strong> ${currentProperty.m2_superficie} m²</div>`;
                        
                        if (propDetails) {
                            propInfoDiv.innerHTML = propDetails;
                            detailsDiv.appendChild(propInfoDiv);
                        }
                    }
                    
                    stepDiv.appendChild(detailsDiv);
                    routeStepsContainer.appendChild(stepDiv);
                });
                
                // Scroll to route panel
                setTimeout(() => {
                    legendEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 300);
            }
        } catch (e) { console.warn('could not populate professional route panel', e); }

        // small helper to escape HTML when injecting text
        function escapeHtml(str) {
            return (str || '').toString().replace(/[&"'<>]/g, function (m) { return ({'&':'&amp;','"':'&quot;','\'':'&#39;','<':'&lt;','>':'&gt;'})[m]; });
        }

        try { map.fitBounds(recommendedLayer.getBounds(), { padding: [20, 20] }); } catch (e) { }
        
        const computationTime = performance.now() - startTime;
        
        console.log(`[RUTA] Ruta recomendada completada - Algoritmo: Búsqueda multimodal (caminar + transporte público)`);
        console.log(`[RUTA] Tiempo de cómputo: ${computationTime.toFixed(2)} ms`);
        console.log(`[RUTA] Tiempo total estimado: ${Math.round(totalMinutes)} minutos`);
        console.log(`[RUTA] Distancia total: ${Math.round(totalMeters)} metros`);
        console.log(`[RUTA] Número de propiedades: ${selectedProperties.length}`);
        console.log(`[RUTA] Óptimo: Heurístico (minimiza tiempo considerando transporte público)`);
        
        // Store metrics
        routeMetrics.multimodal = {
            algorithm: 'Multimodal',
            computationTime: computationTime,
            totalTime: totalMinutes,
            totalDistance: totalMeters,
            numProperties: selectedProperties.length,
            isOptimal: false,
            optimality: 'Heurístico'
        };
        
        compareRoutes();
        
        // Automatically schedule all selected properties as appointments
        console.log('🔄 Agendando automáticamente todas las propiedades en la ruta...');
        selectedProperties.forEach(house => {
            if (!scheduledAppointments.has(house.id)) {
                scheduleAppointment(house);
            }
        });
        
        // Automatically start threat monitoring
        if (!routeRefreshInterval) {
            console.log('▶️ Activando monitoreo automático de amenazas...');
            startRouteRefresh();
            
            // Show notification
            const monitorNotif = document.createElement('div');
            monitorNotif.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                border: 2px solid #047857;
                border-radius: 8px;
                padding: 16px;
                max-width: 320px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: Arial, sans-serif;
                color: white;
            `;
            monitorNotif.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 24px;">🛡️</span>
                    <span>Sistema de Amenazas Activado</span>
                </div>
                <div style="font-size: 13px; margin-bottom: 8px; opacity: 0.95;">
                    ✅ ${selectedProperties.length} propiedades agendadas<br/>
                    🔍 Monitoreo cada 30 segundos<br/>
                    ⚠️ 20% probabilidad de cancelación por cita
                </div>
                <div style="font-size: 11px; opacity: 0.85; font-style: italic; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                    El sistema es resiliente y recalculará rutas automáticamente si detecta cancelaciones.
                </div>
            `;
            document.body.appendChild(monitorNotif);
            setTimeout(() => {
                if (document.body.contains(monitorNotif)) {
                    monitorNotif.style.transition = 'opacity 0.5s';
                    monitorNotif.style.opacity = '0';
                    setTimeout(() => document.body.removeChild(monitorNotif), 500);
                }
            }, 6000);
        }
    }

    // Wire up optimize & recommended buttons
    const optimizeBtn = document.getElementById('optimize-order-btn');
    if (optimizeBtn) optimizeBtn.addEventListener('click', () => { optimizeVisitOrder(); });
    const optimizeAcoBtn = document.getElementById('optimize-order-aco-btn');
    if (optimizeAcoBtn) optimizeAcoBtn.addEventListener('click', () => { optimizeVisitOrderACO(); });
    const genRecBtn = document.getElementById('generate-recommended-route-btn');
    if (genRecBtn) genRecBtn.addEventListener('click', () => { generateRecommendedRoute(); });

    // Note: Manual threat monitoring buttons are removed from UI
    // The system activates automatically when calculating optimal routes

    // Load everything (including paraderos, nodes and edges if present)
    Promise.all([
        loadHouses(), 
        loadCecosf(),
        loadCosam(),
        loadConin(),
        loadCesfam(),
        loadCentroSalud(),
        loadCentroMedico(),
        loadClinicaDental(),
        loadClinica(),
        loadCdt(),
        loadDireccionSalud(),
        loadHospital(),
        loadLaboratorio(),
        loadPrais(),
        loadSapu(),
        loadUnidadSaludFuncionarios(),
        loadVacunatorio(),
        loadMetro(), 
        loadParaderos(), 
        loadCarabineros(),
        loadFerias(),
        loadInstitutos(),
        loadUniversidadesPrivadas(),
        loadUniversidadesEstatales(),
        loadColegios(),
        loadJardines(),
        loadNodes(), 
        loadEdges()
        // load edge/node probabilities (optional)
    ]).then(() => loadProbabilities()).then(() => {
        // Load amenazas data after probabilities are loaded
        loadActiveThreats();
        loadThreatProbabilities();
        const dm = debugMain('debug-mainjs'); if (dm) dm.textContent = 'main.js ejecutado';
    });

    // Inline Map Search Control (floating label-like input)
    function addMapInlineSearchControl() {
        const SearchControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function () {
                const container = L.DomUtil.create('div', 'map-inline-search');
                container.style.background = 'white';
                container.style.padding = '6px';
                container.style.borderRadius = '6px';
                container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                container.style.width = '300px';
                container.style.maxWidth = '40vw';

                const input = document.createElement('input');
                input.type = 'search';
                input.placeholder = 'Buscar propiedades (título, dirección, comuna)...';
                input.style.width = '100%';
                input.style.padding = '6px 8px';
                input.style.border = '1px solid #e5e7eb';
                input.style.borderRadius = '4px';
                input.style.boxSizing = 'border-box';
                input.id = 'map-inline-search-input';

                const results = document.createElement('div');
                results.id = 'map-inline-search-results';
                results.style.maxHeight = '260px';
                results.style.overflow = 'auto';
                results.style.marginTop = '6px';

                // geocode button (fallback)
                const geocodeBtn = document.createElement('button');
                geocodeBtn.id = 'map-inline-geocode-btn';
                geocodeBtn.textContent = 'Buscar dirección (Nominatim)';
                geocodeBtn.title = 'Buscar la cadena como dirección en Nominatim y encontrar propiedades cercanas';
                geocodeBtn.style.marginTop = '6px';
                geocodeBtn.style.width = '100%';
                geocodeBtn.style.padding = '6px 8px';
                geocodeBtn.style.background = '#6b7280';
                geocodeBtn.style.color = '#fff';
                geocodeBtn.style.border = 'none';
                geocodeBtn.style.borderRadius = '4px';
                geocodeBtn.style.cursor = 'pointer';

                container.appendChild(geocodeBtn);

                geocodeBtn.addEventListener('click', function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    const q = (input.value || '').trim();
                    if (!q || q.length < 3) {
                        renderInlineResults([]);
                        const resultsEl = document.getElementById('map-inline-search-results');
                        if (resultsEl) {
                            resultsEl.innerHTML = '<div style="padding:6px;color:#9ca3af">Escribe al menos 3 caracteres para geocodificar.</div>';
                        }
                        return;
                    }
                    geocodeBtn.disabled = true;
                    geocodeBtn.textContent = 'Buscando...';
                    doGeocode(q).finally(() => {
                        setTimeout(() => { geocodeBtn.disabled = false; geocodeBtn.textContent = 'Buscar dirección (Nominatim)'; }, 900);
                    });
                });

                container.appendChild(input);
                container.appendChild(results);

                // prevent map interactions when typing
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                // events
                let timer = null;
                input.addEventListener('input', function (e) {
                    const q = (e.target.value || '').trim();
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => doInlineSearch(q), 180);
                });

                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape') {
                        input.value = '';
                        renderInlineResults([]);
                        input.blur();
                    }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const q = (e.target.value || '').trim();
                        doInlineSearch(q);
                    }
                });

                // expose for testing
                this._container = container;
                this._input = input;
                this._results = results;
                return container;
            }
        });
        const ctrl = new SearchControl();
        map.addControl(ctrl);
    }

    function doInlineSearch(query) {
        const resultsEl = document.getElementById('map-inline-search-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '';
        if (!query || query.length < 2) {
            resultsEl.style.display = 'none';
            return;
        }
        // show results container when performing a search
        resultsEl.style.display = 'block';
        const q = query.toLowerCase();
        // search through housesData (title, direccion, comuna, nombre)
        const matches = (housesData || []).filter(h => {
            const titulo = (h.titulo || h.title || h.nombre || '').toString().toLowerCase();
            const direccion = (h.direccion || h.direccion_completa || h.address || '').toString().toLowerCase();
            const comuna = (h.comuna || '').toString().toLowerCase();
            return (titulo.includes(q) || direccion.includes(q) || comuna.includes(q));
        }).slice(0, 12);
        if (matches.length > 0) {
            renderInlineResults(matches);
        } else {
            // If no local matches, show help and allow user to geocode using the button
            const resultsEl = document.getElementById('map-inline-search-results');
            if (resultsEl) {
                resultsEl.innerHTML = `<div style="padding:6px;color:#6b7280">No se encontraron propiedades locales. Usa \"Buscar dirección (Nominatim)\" para buscar direcciones y luego propiedades cercanas.</div>`;
                resultsEl.style.display = 'block';
            }
        }
    }

    // Geocode a free-text query using Nominatim and render results + nearby properties
    async function doGeocode(query) {
        const resultsEl = document.getElementById('map-inline-search-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div style="padding:6px;color:#6b7280">Consultando Nominatim…</div>';
        try {
            const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&accept-language=es&q=' + encodeURIComponent(query);
            const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!resp.ok) throw new Error('Nominatim returned ' + resp.status);
            const arr = await resp.json();
            if (!Array.isArray(arr) || arr.length === 0) {
                resultsEl.innerHTML = '<div style="padding:6px;color:#9ca3af">No se encontraron coincidencias en Nominatim.</div>';
                return;
            }

            // render top results with actions
            resultsEl.innerHTML = '';
            for (const r of arr) {
                const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
                const row = document.createElement('div');
                row.style.padding = '6px';
                row.style.borderBottom = '1px solid #f3f4f6';
                const name = document.createElement('div'); name.style.fontWeight = '700'; name.style.fontSize = '13px'; name.textContent = r.display_name;
                const meta = document.createElement('div'); meta.style.color = '#6b7280'; meta.style.fontSize = '12px'; meta.textContent = `Coordenadas: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
                const actions = document.createElement('div'); actions.style.marginTop = '6px'; actions.style.display = 'flex'; actions.style.gap = '6px';
                const gotoBtn = document.createElement('button'); gotoBtn.textContent = 'Ir al punto'; gotoBtn.style.background = '#3b82f6'; gotoBtn.style.color='#fff'; gotoBtn.style.border='none'; gotoBtn.style.padding='6px'; gotoBtn.style.borderRadius='4px'; gotoBtn.onclick = () => { map.setView([lat, lon], 17); };
                const nearbyBtn = document.createElement('button'); nearbyBtn.textContent = 'Propiedades cercanas'; nearbyBtn.style.background = '#10b981'; nearbyBtn.style.color='#fff'; nearbyBtn.style.border='none'; nearbyBtn.style.padding='6px'; nearbyBtn.style.borderRadius='4px'; nearbyBtn.onclick = () => { const nearby = findNearestPropertiesByCoords(lat, lon, 800, 12); if (nearby && nearby.length) renderInlineResults(nearby); else { resultsEl.innerHTML = '<div style="padding:6px;color:#9ca3af">No se encontraron propiedades cerca de este punto.</div>'; } };
                actions.appendChild(gotoBtn); actions.appendChild(nearbyBtn);
                row.appendChild(name); row.appendChild(meta); row.appendChild(actions);
                resultsEl.appendChild(row);
            }
        } catch (err) {
            console.warn('Nominatim error', err);
            resultsEl.innerHTML = '<div style="padding:6px;color:#f43f5e">Error consultando Nominatim.</div>';
        }
    }

    function findNearestPropertiesByCoords(lat, lon, radiusMeters = 800, limit = 12) {
        if (!housesData || housesData.length === 0) return [];
        const origin = { lat: lat, lon: lon };
        const scored = housesData.map(h => {
            const d = (h.lat && h.lon) ? haversineDistance(origin, { lat: h.lat, lon: h.lon }) : Infinity;
            return { house: h, d };
        }).filter(x => x.d <= radiusMeters).sort((a,b) => a.d - b.d).slice(0, limit).map(x => {
            // annotate with distance for potential UI use
            x.house._search_distance = Math.round(x.d);
            return x.house;
        });
        return scored;
    }

    function renderInlineResults(items) {
        const resultsEl = document.getElementById('map-inline-search-results');
        if (!resultsEl) return;
        resultsEl.innerHTML = '';
        if (!items || items.length === 0) {
            // hide results container when there are no items to show
            resultsEl.style.display = 'none';
            return;
        }
        // show results container when rendering items
        resultsEl.style.display = 'block';
        items.forEach(h => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.padding = '6px';
            row.style.borderBottom = '1px solid #f3f4f6';

            const left = document.createElement('div');
            left.style.flex = '1';
            left.style.marginRight = '8px';
            const title = document.createElement('div');
            title.style.fontSize = '13px';
            title.style.fontWeight = '700';
            title.textContent = h.titulo || h.nombre || h.title || 'Propiedad';
            const meta = document.createElement('div');
            meta.style.fontSize = '12px';
            meta.style.color = '#6b7280';
            meta.textContent = `${h.comuna || ''} — ${h._operation || ''}`;
            left.appendChild(title);
            left.appendChild(meta);

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '6px';

            const gotoBtn = document.createElement('button');
            gotoBtn.textContent = 'Ir';
            gotoBtn.style.background = '#3b82f6';
            gotoBtn.style.color = '#fff';
            gotoBtn.style.border = 'none';
            gotoBtn.style.padding = '6px 8px';
            gotoBtn.style.borderRadius = '4px';
            gotoBtn.style.cursor = 'pointer';
            gotoBtn.onclick = function (e) {
                e.preventDefault(); e.stopPropagation();
                const marker = houseMarkers.find(m => m.houseData && m.houseData.id === h.id);
                if (marker) {
                    map.setView(marker.getLatLng(), 17);
                    marker.openPopup();
                } else if (h.lat && h.lon) {
                    map.setView([h.lat, h.lon], 17);
                }
            };

            const addBtn = document.createElement('button');
            addBtn.textContent = 'Agregar';
            addBtn.style.background = '#10b981';
            addBtn.style.color = '#fff';
            addBtn.style.border = 'none';
            addBtn.style.padding = '6px 8px';
            addBtn.style.borderRadius = '4px';
            addBtn.style.cursor = 'pointer';
            addBtn.onclick = function (e) {
                e.preventDefault(); e.stopPropagation();
                const exists = selectedProperties.find(s => s.id === h.id);
                if (!exists) {
                    selectedProperties.push(h);
                    const marker = houseMarkers.find(m => m.houseData && m.houseData.id === h.id);
                    if (marker) marker.setIcon(getPropertyIcon(h, true));
                    updateItineraryUI();
                }
            };

            actions.appendChild(gotoBtn);
            actions.appendChild(addBtn);

            row.appendChild(left);
            row.appendChild(actions);
            resultsEl.appendChild(row);
        });
    }

    // Initialize the inline search UI: prefer HTML markup (index.html). Fallback to injected control.
    function setupInlineSearchFromHTML() {
        const wrapper = document.getElementById('map-inline-search-wrapper');
        if (!wrapper) {
            try { addMapInlineSearchControl(); } catch (e) { console.warn('inline search control init failed', e); }
            return;
        }

        const input = document.getElementById('map-inline-search-input');
        const searchBtn = document.getElementById('map-inline-search-button');
        const geocodeBtn = document.getElementById('map-inline-geocode-btn');
        const resultsEl = document.getElementById('map-inline-search-results');
        if (resultsEl) {
            // hide results by default to avoid an empty dark bar when nothing searched
            resultsEl.style.display = 'none';
        }
        const opSelect = document.getElementById('map-op-select');
        const typeSelect = document.getElementById('map-type-select');

        // debounce helper
        let timer = null;

        function doInlineSearchWithFilters(q) {
            if (!resultsEl) return;
            resultsEl.innerHTML = '';
            if (!q || q.length < 2) {
                resultsEl.style.display = 'none';
                return;
            }
            // ensure results container is visible when searching
            resultsEl.style.display = 'block';
            const ql = q.toLowerCase();
            const op = opSelect ? opSelect.value : 'any';
            const type = typeSelect ? typeSelect.value : 'any';

            const matches = (housesData || []).filter(h => {
                // type filter
                const propType = (h._propertyType || h.tipo_inmueble || h.tipo || h.property_type || '').toString().toLowerCase();
                const isDepto = propType.includes('depart') || propType.includes('dpto') || propType.includes('depto') || propType === 'departamento';
                if (type === 'casa' && isDepto) return false;
                if (type === 'departamento' && !isDepto) return false;

                // operation filter
                const opField = (h._operation || h.operacion || h.operation || h.tipo_anuncio || '').toString().toLowerCase();
                if (op === 'venta' && !opField.includes('venta')) return false;
                if (op === 'arriendo' && !opField.includes('arri')) return false;

                const titulo = (h.titulo || h.title || h.nombre || '').toString().toLowerCase();
                const direccion = (h.direccion || h.direccion_completa || h.address || '').toString().toLowerCase();
                const comuna = (h.comuna || '').toString().toLowerCase();
                return (titulo.includes(ql) || direccion.includes(ql) || comuna.includes(ql));
            }).slice(0, 12);

            if (matches.length > 0) renderInlineResults(matches);
            else if (resultsEl) resultsEl.innerHTML = `<div style="padding:6px;color:#6b7280">No se encontraron propiedades locales. Usa "Buscar dirección (Nominatim)" para buscar direcciones y luego propiedades cercanas.</div>`;
        }

        if (input) {
            input.addEventListener('input', function (e) {
                const q = (e.target.value || '').trim();
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => doInlineSearchWithFilters(q), 180);
            });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { input.value = ''; renderInlineResults([]); input.blur(); }
                if (e.key === 'Enter') { e.preventDefault(); doInlineSearchWithFilters((e.target.value || '').trim()); }
            });
        }

        if (searchBtn) searchBtn.addEventListener('click', () => { const q = (input ? input.value.trim() : ''); doInlineSearchWithFilters(q); });

        if (geocodeBtn) {
            geocodeBtn.addEventListener('click', function (ev) {
                ev.preventDefault(); ev.stopPropagation();
                const q = (input ? (input.value || '').trim() : '');
                if (!q || q.length < 3) {
                    if (resultsEl) {
                        resultsEl.innerHTML = '<div style="padding:6px;color:#9ca3af">Escribe al menos 3 caracteres para geocodificar.</div>';
                        resultsEl.style.display = 'block';
                    }
                    return;
                }
                geocodeBtn.disabled = true;
                const previous = geocodeBtn.textContent;
                geocodeBtn.textContent = 'Buscando...';
                doGeocode(q).finally(() => {
                    setTimeout(() => { geocodeBtn.disabled = false; geocodeBtn.textContent = previous || 'Buscar dirección (Nominatim)'; }, 900);
                });
            });
        }
    }

    // initialize
    try { setupInlineSearchFromHTML(); } catch (e) { console.warn('inline search setup failed', e); }

    // Close search results when clicking on the map
    map.on('click', function() {
        const resultsEl = document.getElementById('map-inline-search-results');
        if (resultsEl && resultsEl.style.display !== 'none') {
            resultsEl.style.display = 'none';
            resultsEl.innerHTML = '';
        }
    });

    // Legend Modal Control
    const legendButton = document.getElementById('legend-button');
    const legendModal = document.getElementById('legend-modal');
    const closeModalBtn = document.getElementById('close-modal');

    if (legendButton && legendModal) {
        // Open modal
        legendButton.addEventListener('click', () => {
            legendModal.classList.add('show');
            legendModal.style.display = 'flex';
        });

        // Close modal with X button
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                legendModal.classList.remove('show');
                setTimeout(() => {
                    legendModal.style.display = 'none';
                }, 300);
            });
        }

        // Close modal when clicking outside
        legendModal.addEventListener('click', (e) => {
            if (e.target === legendModal) {
                legendModal.classList.remove('show');
                setTimeout(() => {
                    legendModal.style.display = 'none';
                }, 300);
            }
        });

        // Close modal with ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && legendModal.classList.contains('show')) {
                legendModal.classList.remove('show');
                setTimeout(() => {
                    legendModal.style.display = 'none';
                }, 300);
            }
        });
    }

    // Info Modal Control
    const infoButton = document.getElementById('info-button');
    const infoModal = document.getElementById('info-modal');
    const closeInfoModalBtn = document.getElementById('close-info-modal');

    console.log('=== INFO MODAL SETUP ===');
    console.log('Info Button:', infoButton);
    console.log('Info Modal:', infoModal);
    console.log('Close Button:', closeInfoModalBtn);

    if (infoButton && infoModal) {
        console.log('✅ Configurando event listeners para modal de información');
        
        // Open info modal
        infoButton.addEventListener('click', (e) => {
            console.log('🖱️ Click en botón de información detectado');
            e.preventDefault();
            e.stopPropagation();
            infoModal.classList.add('show');
            infoModal.style.display = 'flex';
            console.log('Modal display:', infoModal.style.display);
            console.log('Modal classes:', infoModal.className);
        });

        // Close modal with X button
        if (closeInfoModalBtn) {
            closeInfoModalBtn.addEventListener('click', (e) => {
                console.log('🖱️ Click en cerrar modal');
                e.preventDefault();
                e.stopPropagation();
                infoModal.classList.remove('show');
                setTimeout(() => {
                    infoModal.style.display = 'none';
                }, 300);
            });
        }

        // Close modal when clicking outside
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                console.log('🖱️ Click fuera del modal');
                infoModal.classList.remove('show');
                setTimeout(() => {
                    infoModal.style.display = 'none';
                }, 300);
            }
        });

        // Close modal with ESC key (handle both modals)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (infoModal.classList.contains('show')) {
                    console.log('⌨️ ESC presionado - cerrando modal info');
                    infoModal.classList.remove('show');
                    setTimeout(() => {
                        infoModal.style.display = 'none';
                    }, 300);
                }
                if (legendModal && legendModal.classList.contains('show')) {
                    legendModal.classList.remove('show');
                    setTimeout(() => {
                        legendModal.style.display = 'none';
                    }, 300);
                }
            }
        });
    }
})();
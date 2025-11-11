// Execute immediately (IIFE) so dynamically injected script always runs
(function(){
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
    const healthLayer = L.layerGroup().addTo(map);
    const metroLayer = L.layerGroup().addTo(map);
    const paraderosLayer = L.layerGroup().addTo(map);
    const edgesLayer = L.layerGroup().addTo(map);
    const routeOSMLayer = L.layerGroup(); // not added by default
    let routeOSMGeoJson = null; // hold L.geoJSON layer when loaded
    const carabinerosLayer = L.layerGroup().addTo(map);
    const feriasLayer = L.layerGroup().addTo(map);
    const bomberosLayer = L.layerGroup().addTo(map);
    const universidadesLayer = L.layerGroup().addTo(map);
    const colegiosLayer = L.layerGroup().addTo(map);

    // Graph data (loaded from data/nodes.geojson and data/edges.geojson)
    let nodesGeoJSON = null;
    let edgesGeoJSON = null;
    const nodeIndex = new Map(); // nodeId -> {lat, lon}
    const adj = new Map(); // nodeId -> Array<{to, weight}>
    const edgeLookup = new Map(); // "u-v" -> feature

    // Icons
    const icons = {
        // Casas - Orange (tipo) + Red/Gold (operación)
        casaVenta: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #FFA500 50%, #DC143C 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendo: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #FFA500 50%, #FFD700 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Departamentos - Blue (tipo) + Red/Gold (operación)
        deptoVenta: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #2A81CB 50%, #DC143C 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendo: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #2A81CB 50%, #FFD700 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Iconos seleccionados (con borde verde)
        casaVentaSelected: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #FFA500 50%, #DC143C 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendoSelected: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #FFA500 50%, #FFD700 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoVentaSelected: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #2A81CB 50%, #DC143C 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendoSelected: L.divIcon({
            html: '<div style="width: 24px; height: 24px; background: linear-gradient(90deg, #2A81CB 50%, #FFD700 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Iconos auxiliares
        health: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        metro: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        carabineros: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-black.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        ferias: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        bomberos: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        universidad: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        colegio: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        })
    };
    icons.selectedHome = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    // paradero icon
    icons.paradero = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    // State
    let housesData = [];
    let additionalHouses = [];
    let houseMarkers = [];
    let healthPois = [];
    let metroPois = [];
    let startPointMarker = null;
    let paraderos = [];
    let selectedProperties = [];
    let carabinerosPois = [];
    let feriasPois = [];
    let bomberosPois = [];
    let universidadesPois = [];
    let colegiosPois = [];
    
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
    const calculateRouteBtn = document.getElementById('calculate-route-btn');
    const filterByMetroCb = document.getElementById('filter-by-metro');
    const filterByHealthCb = document.getElementById('filter-by-health');
    const metroRadiusInput = document.getElementById('metro-radius');
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
        // Load multiple sources: primary casas + toctoc casas + depto venta + depto arriendo
        const primary = fetch('data/casas.json').then(r => r.json()).catch(e => { console.error('casas.json load error', e); return []; });
        const secondary = fetch('data/casa-venta-toctoc.json').then(r => r.json()).catch(e => { console.warn('casa-venta-toctoc.json missing', e); return []; });
        const deptoVenta = fetch('data/depto-venta-toctoc.json').then(r => r.json()).catch(e => { console.warn('depto-venta-toctoc.json missing', e); return []; });
        const deptoArriendo = fetch('data/depto-arriendo-toctoc.json').then(r => r.json()).catch(e => { console.warn('depto-arriendo-toctoc.json missing', e); return []; });

        return Promise.all([primary, secondary, deptoVenta, deptoArriendo]).then(([p, s, dv, da]) => {
            housesData = p || [];
            // annotate and merge additional sources
            const annotateSource = (items, sourceName, propertyType, operation) => (items || []).map(item => {
                // prefer existing id or generate one
                if (!item.id && item._id) item.id = item._id;
                // annotate for filtering
                item._source = sourceName;
                if (propertyType) item._propertyType = propertyType; // 'casa'|'departamento'
                if (operation) item._operation = operation; // 'venta'|'arriendo'
                return item;
            });

            const sAnnotated = annotateSource(s, 'casa-toctoc', 'casa', 'venta');
            const dvAnnotated = annotateSource(dv, 'depto-venta-toctoc', 'departamento', 'venta');
            const daAnnotated = annotateSource(da, 'depto-arriendo-toctoc', 'departamento', 'arriendo');

            additionalHouses = [].concat(sAnnotated, dvAnnotated, daAnnotated);

            // Merge by id, prefer primary
            const byId = new Map();
            housesData.forEach(h => byId.set(h.id, h));
            additionalHouses.forEach(h => { if (!byId.has(h.id)) byId.set(h.id, h); });
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
                
                // Construir información específica según tipo
                let detailsHTML = '';
                if (isDepto) {
                    // Información para departamentos
                    detailsHTML = `
                        <p style="margin:2px 0"><b>🛏️ Dormitorios:</b> ${house.dormitorios || 'N/A'}</p>
                        <p style="margin:2px 0"><b>🚿 Baños:</b> ${house.baños || house.banos || 'N/A'}</p>
                        <p style="margin:2px 0"><b>📏 M² Superficie:</b> ${house.m2_superficie || 'N/A'} m²</p>
                        <p style="margin:2px 0"><b>🌿 Terraza:</b> ${(house.m2_terraza && house.m2_terraza > 0) ? house.m2_terraza + ' m²' : 'No tiene'}</p>
                    `;
                } else {
                    // Información para casas
                    detailsHTML = `
                        <p style="margin:2px 0"><b>🛏️ Dormitorios:</b> ${house.dormitorios || 'N/A'}</p>
                        <p style="margin:2px 0"><b>🚿 Baños:</b> ${house.baños || house.banos || 'N/A'}</p>
                        <p style="margin:2px 0"><b>📐 M² Construidos:</b> ${house.m2_construido || 'N/A'} m²</p>
                        <p style="margin:2px 0"><b>🏞️ M² Terreno:</b> ${house.m2_terreno || 'N/A'} m²</p>
                    `;
                }
                
                const formattedPrice = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(house.precio_peso || house.precio_uf || 0);
                const popupBase = `
                    <div style="width:240px">
                        <img src="${house.imagen || ''}" style="width:100%;height:auto;border-radius:4px"/>
                        <h4 style="margin:6px 0">${house.titulo || ''}</h4>
                        <p style="margin:2px 0"><b>💰 Precio:</b> ${formattedPrice}</p>
                        <p style="margin:2px 0"><b>📍 Comuna:</b> ${house.comuna || ''}</p>
                        ${detailsHTML}
                        <a href="${house.url || '#'}" target="_blank" style="display:inline-block;margin-top:8px;color:#7C3AED;font-weight:600;">Ver más detalles →</a>
                        <div id="trafico-casa-${house.id}" style="margin-top:8px;font-size:13px;color:#333">Cargando tráfico...</div>
                    </div>
                `;
                marker.bindPopup(popupBase);
                // toggle selection on click
                marker.on('click', async function(e){
                    // toggle selected state
                    const idx = selectedProperties.findIndex(s => s.id === house.id);
                    if (idx === -1) {
                        selectedProperties.push(house);
                        marker.setIcon(getPropertyIcon(house, true)); // Usar versión seleccionada
                    } else {
                        selectedProperties.splice(idx,1);
                        marker.setIcon(getPropertyIcon(house, false)); // Usar versión normal
                    }
                    updateItineraryUI();

                    // Consultar tráfico actual y mostrar en popup
                    marker.openPopup();
                    const traficoDivId = `trafico-casa-${house.id}`;
                    const traficoDiv = document.getElementById(traficoDivId);
                    if (traficoDiv) {
                        traficoDiv.textContent = "Consultando tráfico actual...";
                        const trafico = await getTrafficLevelTomTomActual(house.lat, house.lon);
                        let html = `<div style='font-size:12px; line-height:1.6;'>`;
                        
                        if (trafico.nivel) {
                            const congestioPercent = (trafico.congestioRatio * 100).toFixed(1);
                            html += `<p style='margin:4px 0;'><b>${trafico.emoji} Nivel de tráfico:</b> ${trafico.nivel}</p>`;
                            html += `<p style='margin:4px 0;'><b>📊 Congestión:</b> ${congestioPercent}%</p>`;
                        }
                        
                        html += `<p style='margin:4px 0;'><b>🚗 Velocidad actual:</b> ${trafico.currentSpeed||"-"} km/h</p>`;
                        html += `<p style='margin:4px 0;'><b>✓ Velocidad sin congestión:</b> ${trafico.freeFlowSpeed||"-"} km/h</p>`;
                        html += `</div>`;
                        traficoDiv.innerHTML = html;
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
            div.innerHTML = `<b>${h.titulo || h.nombre || h.address || 'Propiedad'}</b><br/><span class="small">${h.comuna || ''} — ${h._operation||''}</span>`;
            // remove button
            const rm = document.createElement('button');
            rm.textContent = 'Quitar'; rm.style.float='right'; rm.style.marginLeft='6px'; rm.style.background='#dc3545'; rm.style.color='#fff'; rm.style.border='none'; rm.style.padding='4px 6px';
            rm.onclick = function(){
                // deselect marker icon
                const m = houseMarkers.find(mk => mk.houseData && mk.houseData.id === h.id);
                if (m) m.setIcon(getPropertyIcon(h, false)); // Usar versión normal
                const idx = selectedProperties.findIndex(s => s.id === h.id);
                if (idx!==-1) selectedProperties.splice(idx,1);
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
        const healthEnabled = filterByHealthCb && filterByHealthCb.checked;
        
        // if neither proximity filter enabled, redisplay all houses (respecting smart search filters)
        if (!metroEnabled && !healthEnabled) { 
            displayHouses(housesData); 
            return; 
        }

        const radius = metroRadiusInput ? parseFloat(metroRadiusInput.value) : 500;
        const metroPoints = metroPois.map(m => ({ lat: m.lat, lon: m.lon }));
        const healthPoints = healthPois.map(h => ({ lat: h.lat, lon: h.lon }));

        // First, regenerate all markers with current filters
        displayHouses(housesData);

        // Then apply proximity filtering
        const matched = [];
        housesLayer.clearLayers();
        houseMarkers.forEach(marker => {
            const h = marker.houseData;
            if (!h) return; // skip if no data
            const point = { lat: h.lat, lon: h.lon };
            let ok = true;
            if (metroEnabled) {
                const nearMetro = metroPoints.some(mp => haversineDistance(point, mp) <= radius);
                if (!nearMetro) ok = false;
            }
            if (healthEnabled) {
                const nearHealth = healthPoints.some(hp => haversineDistance(point, hp) <= radius);
                if (!nearHealth) ok = false;
            }
            if (ok) { matched.push(h); housesLayer.addLayer(marker); }
        });
        setText('houses-filtered-count', matched.length);
    }

    if (filterByMetroCb) filterByMetroCb.addEventListener('change', applyProximityFilters);
    if (filterByHealthCb) filterByHealthCb.addEventListener('change', applyProximityFilters);
    if (metroRadiusInput) metroRadiusInput.addEventListener('change', applyProximityFilters);

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

    function loadHealth() {
        return fetch('data/Establecimientos_de_Salud.csv').then(r => r.text()).then(t => {
            const parsed = parsePipeCSV(t);
            healthPois = parsed.map(p => ({
                name: p.NOMBRE || p.NOM_COM || p.DIRECCION || '',
                lat: parseFloat(p.LATITUD),
                lon: parseFloat(p.LONGITUD),
                tipo: p.TIPO || ''
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            healthPois.forEach(p => {
                const m = L.marker([p.lat, p.lon], { icon: icons.health }).bindPopup(`<b>${p.name}</b><br>${p.tipo}`);
                healthLayer.addLayer(m);
            });
            setText('debug-health', `salud cargados: ${healthPois.length}`);
            setText('health-count', healthPois.length);
        }).catch(e => { console.error('failed parse health csv', e); const d=document.getElementById('debug-health'); if(d)d.textContent='salud load error'; });
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
                const alt = dist.get(u) + (nb.weight || 1);
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

    function loadBomberos() {
        return fetch('data/Bombero.json').then(r => r.json()).then(data => {
            // El archivo puede ser un objeto único o un array
            const items = Array.isArray(data) ? data : [data];
            bomberosPois = items.map(item => ({
                ciudad: item.ciudad || '',
                direccion: item.direccion || '',
                telefono: item.telefono || '',
                comunas_servidas: item.comunas_servidas || '',
                lat: item.latitud || item.lat,
                lon: item.longitud || item.lon
            })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            bomberosPois.forEach(p => {
                const popupContent = `
                    <div style="width:220px">
                        <b>🚒 Bomberos ${p.ciudad}</b><br/>
                        <span style="font-size:12px">
                            <b>Dirección:</b> ${p.direccion}<br/>
                            <b>Teléfono:</b> ${p.telefono}<br/>
                            <b>Comunas servidas:</b><br/>${p.comunas_servidas}
                        </span>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.bomberos }).bindPopup(popupContent);
                bomberosLayer.addLayer(m);
            });
            setText('debug-bomberos', `bomberos cargados: ${bomberosPois.length}`);
            setText('bomberos-count', bomberosPois.length);
        }).catch(e => { console.warn('bomberos load error', e); const d=document.getElementById('debug-bomberos'); if(d)d.textContent='error'; });
    }

    function loadUniversidades() {
        return fetch('data/Instituciones_Educacion_Superior_providencia.json').then(r => r.json()).then(data => {
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
            
            universidadesPois = Array.from(grouped.values()).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
            
            universidadesPois.forEach(p => {
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
                            🎓 Educación Superior
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
                universidadesLayer.addLayer(m);
            });
            
            setText('debug-universidades', `universidades cargadas: ${universidadesPois.length} ubicaciones (${data.length} inmuebles)`);
            setText('universidades-count', universidadesPois.length);
        }).catch(e => { console.warn('universidades load error', e); const d=document.getElementById('debug-universidades'); if(d)d.textContent='error'; });
    }

    function loadColegios() {
        return fetch('data/Establecimientos_Educacionales_providencia.json').then(r => r.json()).then(data => {
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
                if (item.ENS_01 && item.ENS_01 !== '0') niveles.push('Parvularia');
                if (item.ENS_02 && item.ENS_02 !== '0') niveles.push('Básica');
                if (item.ENS_03 && item.ENS_03 !== '0') niveles.push('Media');
                
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
                    estado: item.ESTADO_ESTAB === '1' ? 'Activo' : 'Inactivo'
                };
            }).filter(p => !isNaN(p.lat) && !isNaN(p.lon) && p.estado === 'Activo');
            
            colegiosPois.forEach(p => {
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
                                <b>📍 ${p.comuna}</b>
                            </p>
                        </div>
                    </div>
                `;
                const m = L.marker([p.lat, p.lon], { icon: icons.colegio }).bindPopup(popupContent);
                colegiosLayer.addLayer(m);
            });
            
            setText('debug-colegios', `colegios cargados: ${colegiosPois.length}`);
            setText('colegios-count', colegiosPois.length);
        }).catch(e => { console.warn('colegios load error', e); const d=document.getElementById('debug-colegios'); if(d)d.textContent='error'; });
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
    if (showHealthCb) showHealthCb.addEventListener('change', e => { if (e.target.checked) healthLayer.addTo(map); else map.removeLayer(healthLayer); });
    if (showMetroCb) showMetroCb.addEventListener('change', e => { if (e.target.checked) metroLayer.addTo(map); else map.removeLayer(metroLayer); });
    if (showHousesCb) showHousesCb.addEventListener('change', e => { if (e.target.checked) housesLayer.addTo(map); else map.removeLayer(housesLayer); });

    const showParaderosCb = document.getElementById('show-paraderos-layer');
    const showEdgesCb = document.getElementById('show-edges-layer');
    const showCarabinerosCb = document.getElementById('show-carabineros-layer');
    const showFeriasCb = document.getElementById('show-ferias-layer');
    const showBomberosCb = document.getElementById('show-bomberos-layer');
    const showUniversidadesCb = document.getElementById('show-universidades-layer');
    const showColegiosCb = document.getElementById('show-colegios-layer');
    
    if (showParaderosCb) showParaderosCb.addEventListener('change', e => { if (e.target.checked) paraderosLayer.addTo(map); else map.removeLayer(paraderosLayer); });
    if (showEdgesCb) showEdgesCb.addEventListener('change', e => { if (e.target.checked) edgesLayer.addTo(map); else map.removeLayer(edgesLayer); });
    if (showCarabinerosCb) showCarabinerosCb.addEventListener('change', e => { if (e.target.checked) carabinerosLayer.addTo(map); else map.removeLayer(carabinerosLayer); });
    if (showFeriasCb) showFeriasCb.addEventListener('change', e => { if (e.target.checked) feriasLayer.addTo(map); else map.removeLayer(feriasLayer); });
    if (showBomberosCb) showBomberosCb.addEventListener('change', e => { if (e.target.checked) bomberosLayer.addTo(map); else map.removeLayer(bomberosLayer); });
    if (showUniversidadesCb) showUniversidadesCb.addEventListener('change', e => { if (e.target.checked) universidadesLayer.addTo(map); else map.removeLayer(universidadesLayer); });
    if (showColegiosCb) showColegiosCb.addEventListener('change', e => { if (e.target.checked) colegiosLayer.addTo(map); else map.removeLayer(colegiosLayer); });


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
    }

    // Placeholder for route calculation button
    calculateRouteBtn.addEventListener('click', async () => {
        // Graph-aware routing: snap start & waypoints to nearest graph node and compute shortest path across edges
        if (!startPointMarker) return alert('Define punto de partida');
        const toVisit = selectedProperties.length ? selectedProperties : houseMarkers.filter(m => housesLayer.hasLayer(m)).map(m => m.houseData);
        if (toVisit.length === 0) return alert('No hay propiedades seleccionadas o visibles para calcular ruta');

        // ensure graph loaded
        if (!nodesGeoJSON) await loadNodes();
        if (!edgesGeoJSON) await loadEdges();

        // snap start & each target to node
        const start = startPointMarker.getLatLng();
        const snapped = snapToNearestNode(start.lat, start.lng);
        if (!snapped || snapped.id === null) return alert('No se pudo ubicar nodo cercano al inicio');
        const startNode = snapped.id;

        // collect waypoint node ids (preserve order)
        const waypointNodes = [];
        for (const h of toVisit) {
            const s = snapToNearestNode(h.lat, h.lon);
            if (!s || s.id===null) {
                console.warn('could not snap', h); continue;
            }
            waypointNodes.push({ house: h, nodeId: s.id });
        }
        if (waypointNodes.length === 0) return alert('No se pudo snapear ninguna propiedad a la red');

        // compute concatenated path across sequence: start -> wp1 -> wp2 -> ...
        let current = startNode;
        let allEdgeFeatures = [];
        for (const wp of waypointNodes) {
            const pathNodes = dijkstra(current, wp.nodeId);
            if (!pathNodes) { console.warn('no path between', current, wp.nodeId); continue; }
            const feats = nodesPathToEdgeFeatures(pathNodes);
            allEdgeFeatures = allEdgeFeatures.concat(feats);
            current = wp.nodeId;
        }

        if (allEdgeFeatures.length === 0) return alert('No se pudo generar la ruta en la red (revisa aristas/nodos)');

        // render
        if (window._generatedRouteLayer) map.removeLayer(window._generatedRouteLayer);
        const fc = { type: 'FeatureCollection', features: allEdgeFeatures };
        window._generatedRouteLayer = L.geoJSON(fc, { style: { color: '#28a745', weight: 4, opacity: 0.9 } }).addTo(map);
        // zoom to route
        try { map.fitBounds(window._generatedRouteLayer.getBounds(), { padding: [20,20] }); } catch(e){}
        setText('debug-route', (allEdgeFeatures && allEdgeFeatures.length) || 0);
    });

    // Clear selection and calculate selected buttons
    const clearSelBtn = document.getElementById('clear-selection-btn');
    const calcSelBtn = document.getElementById('calc-route-selected-btn');
    if (clearSelBtn) clearSelBtn.addEventListener('click', () => {
        selectedProperties = [];
        houseMarkers.forEach(m => {
            if (m.houseData) {
                m.setIcon(getPropertyIcon(m.houseData, false)); // Usar versión normal
            }
        });
        updateItineraryUI();
    });
    if (calcSelBtn) calcSelBtn.addEventListener('click', () => {
        if (!startPointMarker) return alert('Define punto de partida');
        if (selectedProperties.length === 0) return alert('No hay propiedades seleccionadas');
        const start = startPointMarker.getLatLng();
        const latlngs = [start].concat(selectedProperties.map(h => L.latLng(h.lat, h.lon)));
        L.polyline(latlngs, { color: '#7C3AED', weight: 4, opacity: 0.8 }).addTo(map);
        alert('Ruta para selección dibujada (temporal)');
    });

    // Load everything (including paraderos, nodes and edges if present)
    Promise.all([
        loadHouses(), 
        loadHealth(), 
        loadMetro(), 
        loadParaderos(), 
        loadCarabineros(),
        loadFerias(),
        loadBomberos(),
        loadUniversidades(),
        loadColegios(),
        loadNodes(), 
        loadEdges()
    ]).then(() => {
        const dm = debugMain('debug-mainjs'); if (dm) dm.textContent = 'main.js ejecutado';
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
})();
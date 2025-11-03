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

    // Icons
    const icons = {
        home: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        health: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        metro: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        })
    };
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
        const primary = fetch('data/casas.json').then(r => r.json()).catch(e => { console.error('casas.json load error', e); return []; });
        const secondary = fetch('data/casa-venta-toctoc.json').then(r => r.json()).catch(e => { console.warn('casa-venta-toctoc.json missing', e); return []; });
        return Promise.all([primary, secondary]).then(([p, s]) => {
            housesData = p || [];
            additionalHouses = s || [];
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

    function displayHouses(houses) {
        housesLayer.clearLayers();
        houseMarkers = [];
        houses.forEach(house => {
            if (house.lat && house.lon) {
                const marker = L.marker([house.lat, house.lon], { icon: icons.home });
                const formattedPrice = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(house.precio_peso || house.precio_uf || 0);
                const popup = `\n                    <div style="width:220px">\n                        <img src="${house.imagen || ''}" style="width:100%;height:auto;border-radius:4px"/>\n                        <h4 style="margin:6px 0">${house.titulo || ''}</h4>\n                        <p style="margin:2px 0"><b>Precio:</b> ${formattedPrice}</p>\n                        <p style="margin:2px 0"><b>Comuna:</b> ${house.comuna || ''}</p>\n                        <a href="${house.url || '#'}" target="_blank">Ver</a>\n                    </div>\n                `;
                marker.bindPopup(popup);
                marker.houseData = house;
                houseMarkers.push(marker);
                housesLayer.addLayer(marker);
            }
        });
        setText('houses-filtered-count', houseMarkers.length);
    }

    // Unified proximity filtering: houses must satisfy all enabled proximity checks (AND logic)
    function applyProximityFilters() {
        const metroEnabled = filterByMetroCb && filterByMetroCb.checked;
        const healthEnabled = filterByHealthCb && filterByHealthCb.checked;
        // if neither enabled, show all
        if (!metroEnabled && !healthEnabled) { displayHouses(housesData); return; }

        const radius = metroRadiusInput ? parseFloat(metroRadiusInput.value) : 500;
        const metroPoints = metroPois.map(m => ({ lat: m.lat, lon: m.lon }));
        const healthPoints = healthPois.map(h => ({ lat: h.lat, lon: h.lon }));

        const matched = [];
        housesLayer.clearLayers();
        houseMarkers.forEach(marker => {
            const h = marker.houseData;
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
        }).catch(e => { console.error('failed parse metro csv', e); const d=document.getElementById('debug-metro'); if(d)d.textContent='metro load error'; });
    }

    function loadEdges() {
        // Load edges geojson (linestrings) if generated by ETL
        return fetch('data/edges.geojson').then(r => {
            if (!r.ok) throw new Error('edges not found');
            return r.json();
        }).then(gj => {
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
    if (showParaderosCb) showParaderosCb.addEventListener('change', e => { if (e.target.checked) paraderosLayer.addTo(map); else map.removeLayer(paraderosLayer); });
    if (showEdgesCb) showEdgesCb.addEventListener('change', e => { if (e.target.checked) edgesLayer.addTo(map); else map.removeLayer(edgesLayer); });

    if (applyPoiFiltersBtn) applyPoiFiltersBtn.addEventListener('click', () => applyPoiFilters());

    // Start point
    startPointBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            if (startPointMarker) map.removeLayer(startPointMarker);
            startPointMarker = L.marker([latitude, longitude], { icon: L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25,41], iconAnchor:[12,41] }) }).addTo(map);
            startPointMarker.bindPopup('<b>Tu ubicación</b>').openPopup();
            map.setView([latitude, longitude], 14);
        }, err => { console.error('geolocation err', err); alert('No se pudo obtener ubicación.'); });
    });

    // Placeholder for route calculation button
    calculateRouteBtn.addEventListener('click', () => {
        if (!startPointMarker) return alert('Define punto de partida');
        const visible = houseMarkers.filter(m => housesLayer.hasLayer(m));
        if (visible.length === 0) return alert('No hay casas visibles para calcular ruta');
        // For now just draw polylines connecting start -> houses in order
        const start = startPointMarker.getLatLng();
        const latlngs = [start].concat(visible.map(m => m.getLatLng()));
        L.polyline(latlngs, { color: 'green' }).addTo(map);
        alert('Ruta dibujada en orden de visualización (temporal)');
    });

    // Load everything (including paraderos and edges if present)
    Promise.all([loadHouses(), loadHealth(), loadMetro(), loadParaderos(), loadEdges()]).then(() => {
        const dm = debugMain('debug-mainjs'); if (dm) dm.textContent = 'main.js ejecutado';
    });
})();
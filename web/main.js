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
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FFA500 50%, #DC143C 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendo: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FFA500 50%, #FFD700 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Departamentos - Blue (tipo) + Red/Gold (operación)
        deptoVenta: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #2A81CB 50%, #DC143C 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendo: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #2A81CB 50%, #FFD700 50%); border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        // Iconos seleccionados (con borde verde)
        casaVentaSelected: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FFA500 50%, #DC143C 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        casaArriendoSelected: L.divIcon({
            html: '<div style="width: 30px; height: 30px; background: linear-gradient(90deg, #FFA500 50%, #FFD700 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoVentaSelected: L.divIcon({
            html: '<div style="width: 33px; height: 33px; background: linear-gradient(90deg, #2A81CB 50%, #DC143C 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
            className: 'custom-div-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
            popupAnchor: [0, -24]
        }),
        deptoArriendoSelected: L.divIcon({
            html: '<div style="width: 33px; height: 33px; background: linear-gradient(90deg, #2A81CB 50%, #FFD700 50%); border-radius: 50%; border: 4px solid #28a745; box-shadow: 0 0 10px rgba(40,167,69,0.6), 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg></div>',
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
    const filterByHealthCb = document.getElementById('filter-by-health');
    const filterByParaderosCb = document.getElementById('filter-by-paraderos');
    const filterByCarabinerosCb = document.getElementById('filter-by-carabineros');
    const filterByFeriasCb = document.getElementById('filter-by-ferias');
    const filterByBomberosCb = document.getElementById('filter-by-bomberos');
    const filterByUniversidadesCb = document.getElementById('filter-by-universidades');
    const filterByColegiosCb = document.getElementById('filter-by-colegios');
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
        const healthEnabled = filterByHealthCb && filterByHealthCb.checked;
        const paraderosEnabled = filterByParaderosCb && filterByParaderosCb.checked;
        const carabinerosEnabled = filterByCarabinerosCb && filterByCarabinerosCb.checked;
        const feriasEnabled = filterByFeriasCb && filterByFeriasCb.checked;
        const bomberosEnabled = filterByBomberosCb && filterByBomberosCb.checked;
        const universidadesEnabled = filterByUniversidadesCb && filterByUniversidadesCb.checked;
        const colegiosEnabled = filterByColegiosCb && filterByColegiosCb.checked;
        
        // if no proximity filter enabled, redisplay all houses (respecting smart search filters)
        if (!metroEnabled && !healthEnabled && !paraderosEnabled && !carabinerosEnabled && 
            !feriasEnabled && !bomberosEnabled && !universidadesEnabled && !colegiosEnabled) { 
            displayHouses(housesData); 
            return; 
        }

        // Get radius from the new proximity-radius input, fallback to legacy metro-radius
        const radius = proximityRadiusInput ? parseFloat(proximityRadiusInput.value) : 
                       (metroRadiusInput ? parseFloat(metroRadiusInput.value) : 500);
        
        // Prepare point arrays for each enabled filter
        const metroPoints = metroPois.map(m => ({ lat: m.lat, lon: m.lon }));
        const healthPoints = healthPois.map(h => ({ lat: h.lat, lon: h.lon }));
        const paraderosPoints = paraderos.map(p => ({ lat: p.lat, lon: p.lon }));
        const carabinerosPoints = carabinerosPois.map(c => ({ lat: c.lat, lon: c.lon }));
        const feriasPoints = feriasPois.map(f => ({ lat: f.lat, lon: f.lon }));
        const bomberosPoints = bomberosPois.map(b => ({ lat: b.lat, lon: b.lon }));
        const universidadesPoints = universidadesPois.map(u => ({ lat: u.lat, lon: u.lon }));
        const colegiosPoints = colegiosPois.map(c => ({ lat: c.lat, lon: c.lon }));

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
            if (paraderosEnabled) {
                const nearParaderos = paraderosPoints.some(pp => haversineDistance(point, pp) <= radius);
                if (!nearParaderos) ok = false;
            }
            if (carabinerosEnabled) {
                const nearCarabineros = carabinerosPoints.some(cp => haversineDistance(point, cp) <= radius);
                if (!nearCarabineros) ok = false;
            }
            if (feriasEnabled) {
                const nearFerias = feriasPoints.some(fp => haversineDistance(point, fp) <= radius);
                if (!nearFerias) ok = false;
            }
            if (bomberosEnabled) {
                const nearBomberos = bomberosPoints.some(bp => haversineDistance(point, bp) <= radius);
                if (!nearBomberos) ok = false;
            }
            if (universidadesEnabled) {
                const nearUniversidades = universidadesPoints.some(up => haversineDistance(point, up) <= radius);
                if (!nearUniversidades) ok = false;
            }
            if (colegiosEnabled) {
                const nearColegios = colegiosPoints.some(cp => haversineDistance(point, cp) <= radius);
                if (!nearColegios) ok = false;
            }
            
            if (ok) { matched.push(h); housesLayer.addLayer(marker); }
        });
        setText('houses-filtered-count', matched.length);
        console.log(`✅ Filtros de proximidad aplicados. ${matched.length} propiedades coinciden.`);
    }

    if (filterByMetroCb) filterByMetroCb.addEventListener('change', applyProximityFilters);
    if (filterByHealthCb) filterByHealthCb.addEventListener('change', applyProximityFilters);
    if (filterByParaderosCb) filterByParaderosCb.addEventListener('change', applyProximityFilters);
    if (filterByCarabinerosCb) filterByCarabinerosCb.addEventListener('change', applyProximityFilters);
    if (filterByFeriasCb) filterByFeriasCb.addEventListener('change', applyProximityFilters);
    if (filterByBomberosCb) filterByBomberosCb.addEventListener('change', applyProximityFilters);
    if (filterByUniversidadesCb) filterByUniversidadesCb.addEventListener('change', applyProximityFilters);
    if (filterByColegiosCb) filterByColegiosCb.addEventListener('change', applyProximityFilters);
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
            if (filterByHealthCb) filterByHealthCb.checked = false;
            if (filterByParaderosCb) filterByParaderosCb.checked = false;
            if (filterByCarabinerosCb) filterByCarabinerosCb.checked = false;
            if (filterByFeriasCb) filterByFeriasCb.checked = false;
            if (filterByBomberosCb) filterByBomberosCb.checked = false;
            if (filterByUniversidadesCb) filterByUniversidadesCb.checked = false;
            if (filterByColegiosCb) filterByColegiosCb.checked = false;
            
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

        // schedule appointments automatically
        console.log('🔄 Agendando automáticamente todas las propiedades (ACO)...');
        orderedProps.forEach(house => {
            if (!scheduledAppointments.has(house.id)) scheduleAppointment(house);
        });

        // start monitoring if not already
        if (!routeRefreshInterval) startRouteRefresh();

        updateItineraryUI();
        if (!silent) alert('✅ Orden optimizado con ACO exitosamente.');
        return true;
    }

    async function optimizeVisitOrder(silent = false) {
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
    const startTime = new Date();

        function stopLatLon(s) {
            if (!s) return null;
            if (s.lat !== undefined && s.lon !== undefined) return { lat: s.lat, lon: s.lon };
            if (s.station && s.station.lat !== undefined && s.station.lon !== undefined) return { lat: s.station.lat, lon: s.station.lon };
            if (s.paradero && s.paradero.lat !== undefined && s.paradero.lon !== undefined) return { lat: s.paradero.lat, lon: s.paradero.lon };
            return null;
        }

        for (let i = 0; i < selectedProperties.length; i++) {
            const target = selectedProperties[i];

            // If no paraderos loaded, fallback to walking
            if (!paraderos || paraderos.length === 0) {
                const walkM = haversineDistance({ lat: currentLatLng.lat, lon: currentLatLng.lng }, { lat: target.lat, lon: target.lon });
                const timeMin = walkM / walkSpeed;
                legs.push({ type: 'walk', distanceM: walkM, timeMin, desc: `Camina ${Math.round(walkM)} m hasta la propiedad: ${target.titulo || ''}`, from: { lat: currentLatLng.lat, lon: currentLatLng.lng }, to: { lat: target.lat, lon: target.lon } });
                recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [target.lat, target.lon]], { color: '#1E90FF', dashArray: '6 6', weight: 3, opacity: 0.8 }));
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

            // evaluate paradero-paradero (bus) pairs
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

            // evaluate metro-metro pairs (metro ride)
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

            // evaluate mixed combos: paradero -> metro
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
                recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [target.lat, target.lon]], { color: '#1E90FF', dashArray: '6 6', weight: 3, opacity: 0.8 }));
            } else if (bestOption.type === 'transit') {
                const d = bestOption.details;
                const transport = d.transport || 'bus';

                // walk to origin stop
                const fromCoords = stopLatLon(d.from) || { lat: (d.from && d.from.lat) || 0, lon: (d.from && d.from.lon) || 0 };
                const toCoords = stopLatLon(d.to) || { lat: (d.to && d.to.lat) || 0, lon: (d.to && d.to.lon) || 0 };
                const walkToFromM = d.walkFrom;
                const walkToFromMin = walkToFromM / walkSpeed;
                legs.push({ type: 'walk', distanceM: walkToFromM, timeMin: walkToFromMin, desc: `Camina ${Math.round(walkToFromM)} m hasta el ${transport === 'metro' ? 'andén/estación' : 'paradero'}: ${ (d.from && (d.from.nombre || d.from.codigo)) || '' }`, from: { lat: currentLatLng.lat, lon: currentLatLng.lng }, to: { lat: fromCoords.lat, lon: fromCoords.lon }, transport: transport });
                recommendedLayer.addLayer(L.polyline([[currentLatLng.lat, currentLatLng.lng], [fromCoords.lat, fromCoords.lon]], { color: '#1E90FF', dashArray: '6 6', weight: 3, opacity: 0.8 }));
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
                recommendedLayer.addLayer(L.polyline([[toCoords.lat, toCoords.lon], [target.lat, target.lon]], { color: '#1E90FF', dashArray: '6 6', weight: 3, opacity: 0.8 }));
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
                    const eta = new Date(startTime.getTime() + Math.round(cumMinutes * 60000));
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
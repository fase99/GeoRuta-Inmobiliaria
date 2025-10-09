// Inicializar el mapa centrado en Providencia
const map = L.map('map').setView([-33.425, -70.60], 14);

// Capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// --- ESTILOS PARA LAS CAPAS ---
const edgeStyle = { color: "#555", weight: 2, opacity: 0.6 };
const routeStyle = { color: "#007bff", weight: 5, opacity: 0.8 };
const incidentStyle = { color: "#dc3545", fillColor: "#dc3545", weight: 1, radius: 8, fillOpacity: 0.8 };
const gasStationStyle = { color: "#28a745", fillColor: "#28a745", weight: 1, radius: 6, fillOpacity: 0.8 };


// --- FUNCIÓN PARA CARGAR Y MOSTRAR DATOS GEOJSON ---
async function addGeoJsonLayer(url, style, onEachFeatureCallback) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok for ${url}`);
        const data = await response.json();
        L.geoJSON(data, { 
            style: style,
            onEachFeature: onEachFeatureCallback,
            pointToLayer: (feature, latlng) => { // Para datos de puntos, usa un círculo
                return L.circleMarker(latlng, style);
            }
        }).addTo(map);
    } catch (error) {
        console.error('Error cargando la capa GeoJSON:', error);
    }
}

// --- CALLBACKS PARA POPUPS ---
function onEachIncident(feature, layer) {
    if (feature.properties) {
        layer.bindPopup(`<b>${feature.properties.type}</b><br>${feature.properties.description}`);
    }
}

function onEachGasStation(feature, layer) {
    if (feature.properties) {
        layer.bindPopup(`<b>${feature.properties.brand}</b><br>${feature.properties.name}`);
    }
}

// --- CARGAR TODAS LAS CAPAS ---
document.addEventListener('DOMContentLoaded', () => {
    addGeoJsonLayer('data/edges.geojson', edgeStyle);
    addGeoJsonLayer('data/gas_stations.geojson', gasStationStyle, onEachGasStation);
    addGeoJsonLayer('data/live_incidents.geojson', incidentStyle, onEachIncident);
    addGeoJsonLayer('data/route.geojson', routeStyle);
});
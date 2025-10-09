document.addEventListener('DOMContentLoaded', function () {
    // 1. Inicialización del mapa
    const map = L.map('map').setView([-33.43, -70.60], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Variables para almacenar datos y marcadores
    let housesData = [];
    let houseMarkers = [];
    let startPointMarker = null;

    const comunaFilter = document.getElementById('comuna-filter');
    const startPointBtn = document.getElementById('start-point-btn');
    const calculateRouteBtn = document.getElementById('calculate-route-btn');

    // 2. Cargar datos de las casas desde el JSON
    fetch('data/casas.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            housesData = data;
            populateComunas(housesData);
            displayHouses(housesData);
        })
        .catch(error => console.error('Error al cargar los datos de las casas:', error));

    // 3. Poblar el filtro de comunas
    function populateComunas(houses) {
        const comunas = [...new Set(houses.map(house => house.comuna))];
        comunas.forEach(comuna => {
            const option = document.createElement('option');
            option.value = comuna;
            option.textContent = comuna;
            comunaFilter.appendChild(option);
        });
    }

    // 4. Mostrar/actualizar marcadores de casas en el mapa
    function displayHouses(houses) {
        // Limpiar marcadores existentes
        houseMarkers.forEach(marker => map.removeLayer(marker));
        houseMarkers = [];

        houses.forEach(house => {
            if (house.lat && house.lon) {
                const marker = L.marker([house.lat, house.lon]).addTo(map);
                
                // Formatear precio a CLP
                const formattedPrice = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(house.precio_uf > 1000 ? house.precio_uf : house.precio_peso);

                const popupContent = `
                    <div style="width: 200px;">
                        <img src="${house.imagen}" alt="imagen casa" style="width:100%; height:auto; border-radius: 4px;">
                        <h4 style="margin: 5px 0;">${house.titulo}</h4>
                        <p style="margin: 2px 0;"><b>Precio:</b> ${formattedPrice}</p>
                        <p style="margin: 2px 0;"><b>Dorms:</b> ${house.dormitorios} | <b>Baños:</b> ${house.baños}</p>
                        <a href="${house.url}" target="_blank">Ver más detalles</a>
                    </div>
                `;
                marker.bindPopup(popupContent);
                marker.houseData = house; // Guardar datos en el marcador
                houseMarkers.push(marker);
            }
        });
    }

    // 5. Event Listener para el filtro de comuna
    comunaFilter.addEventListener('change', (e) => {
        const selectedComuna = e.target.value;
        let filteredHouses;

        if (selectedComuna === 'todos') {
            filteredHouses = housesData;
        } else {
            filteredHouses = housesData.filter(house => house.comuna === selectedComuna);
        }
        displayHouses(filteredHouses);
    });

    // 6. Event Listener para el botón de punto de partida
    startPointBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            
            if (startPointMarker) {
                map.removeLayer(startPointMarker);
            }

            startPointMarker = L.marker([latitude, longitude], {
                icon: L.icon({ // Icono diferente para el punto de partida
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(map);
            
            startPointMarker.bindPopup('<b>Tu ubicación</b><br>Punto de partida').openPopup();
            map.setView([latitude, longitude], 15);

        }, error => {
            console.error('Error al obtener la ubicación:', error);
            alert('No se pudo obtener tu ubicación. Asegúrate de haber concedido los permisos.');
        });
    });

    // 7. Event Listener para calcular la ruta (lógica futura)
    calculateRouteBtn.addEventListener('click', () => {
        if (!startPointMarker) {
            alert('Por favor, define un punto de partida usando "Usar mi ubicación".');
            return;
        }

        const visibleHouses = houseMarkers.filter(marker => map.hasLayer(marker));
        if (visibleHouses.length === 0) {
            alert('No hay casas seleccionadas en el mapa para calcular la ruta.');
            return;
        }

        const startPoint = startPointMarker.getLatLng();
        const housePoints = visibleHouses.map(marker => marker.getLatLng());

        console.log("Punto de partida:", startPoint);
        console.log("Casas seleccionadas:", housePoints);

        // Lógica futura:
        // Aquí se haría una llamada (fetch) a un endpoint del backend (ej. /calculate_route)
        // enviando el punto de partida y las coordenadas de las casas.
        // El backend, con los scripts de Python, calcularía la ruta óptima
        // y la devolvería para ser dibujada en el mapa.
        alert('Funcionalidad de cálculo de ruta en desarrollo.\nLos puntos seleccionados se han mostrado en la consola.');
    });
});
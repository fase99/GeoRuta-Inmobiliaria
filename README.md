# GeoRuta Inmobiliaria - Sistema de Ruteo Resiliente

Este proyecto implementa una plataforma avanzada de georuteo diseñada para optimizar la planificación de visitas a propiedades inmobiliarias. El sistema no solo calcula la ruta más eficiente en términos de distancia y tiempo, sino que también integra un análisis de "resiliencia", considerando amenazas en tiempo real, infraestructura urbana y datos históricos para garantizar recorridos seguros y predecibles.

## 🌟 Funcionalidades Principales

1.  **Visualización Geoespacial**: Mapa interactivo con capas de propiedades, infraestructura y amenazas.
2.  **Ruteo Resiliente**: Cálculo de rutas que evitan zonas de alto riesgo o congestión.
3.  **Filtrado Avanzado**: Búsqueda de propiedades y colegios basada en criterios específicos (precio, puntaje PAES, mensualidad).
4.  **Simulación de Escenarios**: Evaluación de rutas bajo condiciones de incidentes simulados (accidentes, cierres viales).

## 📊 Variables del Sistema

El sistema integra múltiples fuentes de datos que interactúan para determinar la mejor ruta y evaluar el entorno de cada propiedad.

### 1. Variables Inmobiliarias
Datos provenientes de portales inmobiliarios (ej. TocToc) para la oferta de viviendas.
*   **Tipo de Propiedad**: Casa, Departamento.
*   **Operación**: Venta, Arriendo.
*   **Económicas**:
    *   Precio (UF y Pesos).
    *   Gastos Comunes.
*   **Físicas**: Ubicación (Latitud/Longitud), Superficie, Dormitorios, Baños.

### 2. Variables de Infraestructura (POIs)
Puntos de interés que enriquecen el contexto de cada propiedad.
*   **Educación**:
    *   **Colegios**: Nombre, RBD, Niveles, Tipo de enseñanza.
    *   **Métricas Educativas**: Promedio PAES, Costo de Matrícula, Mensualidad.
    *   **Educación Superior**: Universidades e Institutos.
*   **Seguridad y Emergencia**:
    *   **Carabineros**: Comisarías y retenes.
    *   **Bomberos**: Compañías de bomberos.
    *   **Salud**: Hospitales, clínicas y centros de salud.
*   **Transporte y Servicios**:
    *   **Metro**: Estaciones de Metro de Santiago.
    *   **Transantiago**: Paraderos de buses.
    *   **Comercio**: Ferias libres y persas.

### 3. Variables de Ruteo y Grafo
Elementos utilizados para el cálculo matemático de las rutas.
*   **Nodos y Aristas**: Representación de la red vial (basado en OpenStreetMap).
*   **Probabilidad de Fallo**: Probabilidad asignada a cada arista (calle) de estar bloqueada o congestionada.
*   **Costos**: Distancia (metros) y Tiempo (minutos).

---

## ⚠️ Amenazas y Riesgos

El sistema monitorea y simula diversos tipos de incidentes que pueden afectar la planificación de la ruta. Estas amenazas se clasifican por tipo y severidad.

### Tipos de Amenazas
*   **🚗 Accidente**: Colisiones vehiculares que pueden reducir la velocidad o bloquear vías.
*   **🚦 Congestión**: Flujo vehicular lento o detenido (tacos).
*   **🚧 Cierre Vial**: Bloqueos por obras, eventos o mantenimiento.
*   **🏠 Robos**: Datos históricos de robos en viviendas (utilizados para mapas de calor de seguridad).

### Clasificación de Severidad
Cada amenaza tiene un nivel de impacto asociado:
*   **BAJA**: Impacto menor en el tiempo de viaje (ej. accidente leve).
*   **MEDIA**: Retrasos considerables (ej. congestión moderada).
*   **ALTA**: Bloqueo total o retrasos críticos (ej. cierre vial, accidente grave).

### Probabilidad
*   Se asigna un valor entre **0.0 y 1.0** a los incidentes para modelar la incertidumbre de que un evento afecte la ruta en un momento dado.

---

## ⏱️ Tiempos y Simulación

El factor tiempo es crítico tanto para la logística de las visitas como para la simulación de eventos.

### Tiempos de Viaje
*   **Cálculo Dinámico**: El sistema estima la duración de los traslados (caminata, transporte público, vehículo) basándose en la distancia y la velocidad promedio de la vía.
*   **Penalización por Amenazas**: Los incidentes aumentan el "costo" temporal de las aristas afectadas, forzando al algoritmo a buscar alternativas más rápidas.

### Tiempos de Simulación
*   **Ventanas de Tiempo**: Los datos de incidentes están asociados a marcas de tiempo específicas (ej. `2025-11-16T12:00:00Z`), permitiendo simular condiciones de tráfico en horas punta o momentos específicos del día.
*   **Timeouts de Respuesta**: El sistema web tiene configurados tiempos de espera (ej. 8 segundos) para consultas de datos en tiempo real, garantizando que la interfaz no se congele si un servicio externo falla.
*   **Agenda de Visitas**: El sistema gestiona una agenda (`scheduledAppointments`) donde se calculan los tiempos de llegada y duración de las visitas a las propiedades.

## 🏗️ Arquitectura Técnica

*   **Frontend**: HTML5, CSS3, JavaScript (Leaflet para mapas).
*   **Backend/ETL**: Python (Scripts de carga y procesamiento).
*   **Base de Datos**: PostgreSQL con extensión PostGIS para consultas espaciales.
*   **Contenedores**: Docker y Docker Compose para orquestación.

## 🚀 Cómo ejecutar la aplicación

Para desplegar y ejecutar el proyecto en tu entorno local, sigue estos pasos.

### Prerrequisitos

*   [Docker](https://www.docker.com/get-started)
*   [Docker Compose](https://docs.docker.com/compose/install/)

### Pasos de Ejecución

1.  **Clona el repositorio** (si aún no lo has hecho):
    ```sh
    git clone <URL-del-repositorio>
    cd <nombre-del-directorio>
    ```

2.  **Construye y levanta los contenedores**:
    Abre una terminal en la raíz del proyecto y ejecuta el siguiente comando. Este comando construirá las imágenes de Docker necesarias y pondrá en marcha todos los servicios en segundo plano (`-d`).
    ```sh
    docker-compose up --build -d
    ```

## Desarrollo y ejecución

### Generador Docplex (ruta optimizada)

Hay un script Python que construye el modelo Docplex y escribe la salida en `web/data/docplex_route.json`:

- `scripts/generate_docplex_route.py` — construye y resuelve el modelo, y escribe `web/data/docplex_route.json`.

Notas rápidas para ejecutar localmente (PowerShell):

1) Crear/activar el virtualenv (opcional):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2) Instalar la dependencia `docplex`:

```powershell
pip install docplex
```

3) Ejecutar el script para generar el JSON:

```powershell
python scripts/generate_docplex_route.py
```

Si no tienes `docplex` o no quieres instalarlo, hay un archivo de respaldo `web/data/docplex_route.json` con una ruta de ejemplo para evitar un HTTP 404 desde la UI.

3.  **Accede a la aplicación web**:
    Una vez que los contenedores estén en funcionamiento, abre tu navegador web y navega a la siguiente dirección:
    
    👉 **[http://localhost:8080](http://localhost:8080)**

    Deberías ver la interfaz de la aplicación de ruteo.

## 📁 Estructura del Proyecto

```
.
├── amenazas/             # Scripts para extraer datos de amenazas (ej. tráfico).
├── infraestructura/      # Scripts para extraer datos de infraestructura vial.
├── metadata/             # Scripts para extraer metadatos (ej. gasolineras).
├── web/                  # Contiene el frontend (HTML, JS, CSS).
├── config.py             # Configuraciones para los scripts de Python.
├── database.sql          # Script SQL inicial para crear las tablas en la BD.
├── docker-compose.yml    # Orquesta los servicios de Docker.
├── Dockerfile            # Define el entorno para el contenedor ETL.
├── main.py               # Script principal que ejecuta el proceso ETL.
└── requirements.txt      # Dependencias de Python.
```
# Proyecto de Ruteo Inmobiliario Resiliente

Este proyecto implementa una aplicación de georuteo para determinar la ruta más óptima y resiliente para visitar propiedades inmobiliarias en una zona específica, considerando posibles amenazas o incidentes en tiempo real.

## 📜 Descripción

La aplicación calcula rutas eficientes entre múltiples puntos (propiedades) y ajusta estas rutas dinámicamente basándose en datos de amenazas, como congestión vehicular, accidentes o cualquier otro incidente que pueda afectar el recorrido. El objetivo es proporcionar una "ruta resiliente" que minimice el tiempo de viaje y evite interrupciones.

## 🏗️ Arquitectura

El sistema está containerizado usando Docker y se compone de los siguientes servicios orquestados por `docker-compose`:

1.  **Base de Datos (`db`)**:
    *   **Imagen**: `postgis/postgis`
    *   **Propósito**: Almacena todos los datos geoespaciales, incluyendo la infraestructura vial, ubicaciones de propiedades, estaciones de servicio y datos de amenazas. Se utiliza PostGIS por su capacidad para manejar consultas espaciales complejas.

2.  **Proceso ETL (`etl`)**:
    *   **Imagen**: Construida a partir del `Dockerfile` local.
    *   **Propósito**: Contenedor responsable de la Extracción, Transformación y Carga (ETL) de datos. Ejecuta los scripts de Python (`main.py`) para poblar la base de datos a partir de diversas fuentes. Este proceso se ejecuta una vez y finaliza.

3.  **Servidor Web (`web`)**:
    *   **Imagen**: `nginx:alpine`
    *   **Propósito**: Sirve la aplicación web frontend al usuario. Está configurado para mostrar el contenido de la carpeta `web/`, que incluye el `index.html` y la lógica de JavaScript para la visualización del mapa y las rutas.

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

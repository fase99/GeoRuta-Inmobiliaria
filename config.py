import os

# Configuración de la Base de Datos (leída desde variables de entorno de Docker)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "resilient_routing_db")
DB_USER = os.getenv("DB_USER", "user")
DB_PASS = os.getenv("DB_PASS", "password")

# Ubicación para los archivos de datos generados
DATA_DIR = "sitio_web/data"
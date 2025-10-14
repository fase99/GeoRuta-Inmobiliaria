FROM python:3.9.18-slim-bullseye

WORKDIR /app

# Install system packages required by geopandas/osmnx and psycopg2
RUN apt-get update && \
	apt-get install -y --no-install-recommends \
		build-essential \
		gdal-bin libgdal-dev \
		libpq-dev \
		libgeos-dev \
		libproj-dev \
		pkg-config \
		curl && \
	apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Comando que se ejecutará al iniciar el contenedor `etl`
CMD ["python", "main.py"]
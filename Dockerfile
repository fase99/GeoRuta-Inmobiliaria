FROM python:3.9.18-slim-bullseye

WORKDIR /app

# Update system packages to reduce vulnerabilities
RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Comando que se ejecutará al iniciar el contenedor `etl`
CMD ["python", "main.py"]
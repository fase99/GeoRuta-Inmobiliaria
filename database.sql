CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

DROP TABLE IF EXISTS traffic_incidents, historical_congestion, gas_stations, edges, nodes CASCADE;

CREATE TABLE nodes (
    id BIGINT PRIMARY KEY,
    geom GEOMETRY(Point, 4326)
);

CREATE TABLE edges (
    id SERIAL PRIMARY KEY,
    source BIGINT,
    target BIGINT,
    length_m FLOAT,
    name VARCHAR(255),
    geom GEOMETRY(LineString, 4326)
);

CREATE TABLE gas_stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    brand VARCHAR(100),
    geom GEOMETRY(Point, 4326)
);

CREATE TABLE historical_congestion (
    edge_id INT,
    day_of_week INT,
    hour_of_day INT,
    avg_speed_kmh FLOAT,
    PRIMARY KEY (edge_id, day_of_week, hour_of_day)
);

CREATE TABLE traffic_incidents (
    id SERIAL PRIMARY KEY,
    description TEXT,
    incident_type VARCHAR(100),
    report_time TIMESTAMPTZ DEFAULT NOW(),
    geom GEOMETRY(Point, 4326)
);
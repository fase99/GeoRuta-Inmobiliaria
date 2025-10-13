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



-- Tables for web datasets
CREATE TABLE IF NOT EXISTS houses (
    id SERIAL PRIMARY KEY,
    title TEXT,
    price NUMERIC,
    geom GEOMETRY(Point,4326)
);

CREATE TABLE IF NOT EXISTS health_centers (
    id SERIAL PRIMARY KEY,
    name TEXT,
    comuna TEXT,
    geom GEOMETRY(Point,4326)
);

CREATE TABLE IF NOT EXISTS metro_stations (
    id SERIAL PRIMARY KEY,
    name TEXT,
    linea TEXT,
    geom GEOMETRY(Point,4326)
);
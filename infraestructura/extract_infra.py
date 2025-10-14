import osmnx as ox
import geopandas as gpd
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from config import DATA_DIR

print("Descargando red vial de Providencia desde OpenStreetMap...")
place = "Providencia, Santiago, Chile"
G = ox.graph_from_place(place, network_type="drive")

print("Transformando grafo a GeoDataFrames...")
nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)

# Asegurar que el índice (ID del nodo) sea una columna
nodes_gdf.reset_index(inplace=True)
nodes_gdf = nodes_gdf.rename(columns={'osmid': 'id'})

# Reset index for edges to make u, v columns
edges_gdf.reset_index(inplace=True)

# Guardar como GeoJSON
nodes_output_path = f"{DATA_DIR}/nodes.geojson"
edges_output_path = f"{DATA_DIR}/edges.geojson"

nodes_gdf[['id', 'geometry']].to_file(nodes_output_path, driver='GeoJSON')
edges_gdf[['u', 'v', 'length', 'name', 'geometry']].to_file(edges_output_path, driver='GeoJSON')

print(f"Nodos guardados en {nodes_output_path}")
print(f"Aristas guardadas en {edges_output_path}")
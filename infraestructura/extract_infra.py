import osmnx as ox
import geopandas as gpd
from config import DATA_DIR

print("Descargando red vial de Providencia desde OpenStreetMap...")
place = "Providencia, Santiago, Chile"
G = ox.graph_from_place(place, network_type="drive")

print("Transformando grafo a GeoDataFrames...")
nodes_gdf, edges_gdf = ox.graph_to_gdfs(G)

# Asegurar que el índice (ID del nodo) sea una columna
nodes_gdf.reset_index(inplace=True)
nodes_gdf = nodes_gdf.rename(columns={'osmid': 'id'})

# Guardar como GeoJSON
nodes_output_path = f"{DATA_DIR}/nodes.geojson"
edges_output_path = f"{DATA_DIR}/edges.geojson"

nodes_gdf[['id', 'geometry']].to_file(nodes_output_path, driver='GeoJSON')
edges_gdf[['u', 'v', 'length', 'name', 'geometry']].to_file(edges_output_path, driver='GeoJSON')

print(f"Nodos guardados en {nodes_output_path}")
print(f"Aristas guardadas en {edges_output_path}")
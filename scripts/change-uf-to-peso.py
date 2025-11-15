import json

# --- Configuración ---
# Nombre del archivo JSON de entrada
archivo_entrada = '../web/data/depto-venta-toctoc.json'

# Nombre para el nuevo archivo JSON con los valores corregidos
archivo_salida = 'depto-venta-toctoc.json'

# --- Lógica del Script ---

# Agregamos un contador para saber cuántos registros se modificaron
registros_modificados = 0

try:
    # 1. Leer el archivo JSON original
    with open(archivo_entrada, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 2. Recorrer cada objeto (propiedad) en la lista
    for propiedad in data:
        # Verificamos si las claves existen para evitar errores
        if 'precio_uf' in propiedad and 'precio_peso' in propiedad:
            
            # --- LA NUEVA CONDICIÓN ---
            # Si el precio en UF es mayor que el precio en pesos, es señal de que están invertidos.
            if propiedad['precio_uf'] > propiedad['precio_peso']:
                # Intercambia los valores usando una asignación de tupla.
                propiedad['precio_uf'], propiedad['precio_peso'] = propiedad['precio_peso'], propiedad['precio_uf']
                # Incrementamos el contador
                registros_modificados += 1
            
            # Si la condición no se cumple (los precios ya están en el orden correcto),
            # no se hace nada y el script continúa con el siguiente elemento.

    # 3. Guardar los datos corregidos en un nuevo archivo JSON
    with open(archivo_salida, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print("¡Proceso completado con éxito!")
    print(f"Total de propiedades procesadas: {len(data)}")
    print(f"Propiedades con precios corregidos: {registros_modificados}")
    print(f"Los datos actualizados se han guardado en el archivo: '{archivo_salida}'")

except FileNotFoundError:
    print(f"Error: No se pudo encontrar el archivo '{archivo_entrada}'. Asegúrate de que el nombre es correcto y está en la misma carpeta que el script.")
except json.JSONDecodeError:
    print(f"Error: El archivo '{archivo_entrada}' no tiene un formato JSON válido.")
except TypeError:
    print("Error de tipo: Asegúrate de que los valores de 'precio_uf' y 'precio_peso' sean numéricos (no texto) en tu JSON para poder compararlos.")
except Exception as e:
    print(f"Ocurrió un error inesperado: {e}")
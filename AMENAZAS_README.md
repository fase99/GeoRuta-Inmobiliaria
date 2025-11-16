# 🛡️ Sistema de Amenazas y Resiliencia - GeoRuta Inmobiliaria

## 📋 Descripción General

El sistema de amenazas integra múltiples fuentes de datos para calcular probabilidades de riesgo en la red vial y generar rutas resilientes que minimizan la exposición a amenazas.

## 🎯 Objetivos Cumplidos

### ✅ Punto 4: Modelado de Probabilidades de Fallo
Cada amenaza se modela como una probabilidad de fallo (0-1) que se propaga a aristas y nodos cercanos:

- **Incidentes de tráfico**: Congestiones, accidentes, cierres viales
- **Zonas de inseguridad**: Basadas en datos históricos de robos
- **Congestión histórica**: Patrones de tráfico por horario y día

#### Archivos Generados:
```
web/data/
├── live_incidents_prob.geojson     # Incidentes con probabilidades
├── edge_probabilities.json         # Probabilidad de fallo por arista
└── node_probabilities.json         # Probabilidad de fallo por nodo
```

### ✅ Punto 6: Simulación Monte Carlo de Amenazas
Sistema que genera números aleatorios (0-100) y determina si una amenaza ocurre comparando con el umbral de probabilidad.

#### Funcionamiento:
```python
# Para cada amenaza con probabilidad p:
random_value = random(0, 100)
threshold = p * 100

if random_value <= threshold:
    amenaza_ocurre = True  # ¡Fallo!
else:
    amenaza_ocurre = False  # Sin problemas
```

#### Archivos Generados:
```
web/data/
├── active_threats.json            # Amenazas que ocurren en esta simulación
└── simulation_log.json            # Log detallado de la simulación
```

### ✅ Punto 7: Visualización de Amenazas Activas
Checkbox en la interfaz web que permite mostrar/ocultar amenazas activas basadas en la simulación del punto 6.

#### Características:
- 🔴 **Amenazas Activas**: Se muestran solo las que "ocurrieron" en la simulación
- 🟡 **Probabilidades**: Cada amenaza muestra su nivel de riesgo
- 🔵 **Filtrado**: Activar/desactivar visualización de amenazas

### ✅ Punto 8: Caso Demostrativo de Ruta Resiliente
Ejemplo completo que evidencia cómo el sistema genera rutas alternativas ante amenazas.

#### Escenario Demostrativo:
1. **Ruta Óptima** (sin considerar amenazas)
   - Más corta en distancia
   - Puede pasar por zonas de riesgo
   
2. **Ruta Resiliente** (evitando amenazas)
   - Ligeramente más larga
   - Minimiza exposición a riesgos
   - Cumple objetivos de seguridad

#### Métricas de Comparación:
```
📊 COMPARACIÓN:
   Reducción de riesgo: -45.3%
   Aumento de distancia: +12.5%
   Recomendación: Ruta resiliente ✅
```

## 🚀 Uso del Sistema

### 1. Generar Probabilidades de Amenazas

```bash
python amenazas/generate_probabilities_enhanced.py
```

**Salida:**
- Calcula probabilidades para aristas y nodos
- Integra datos de robos, tráfico e incidentes
- Genera archivos JSON con probabilidades

**Ejemplo de salida:**
```
✅ Procesando 15 incidentes de tráfico
✅ Cargados 42 puntos de riesgo por robos
📊 Resumen de Probabilidades:
   - Aristas en riesgo: 234 / 1250 (18.7%)
   - Probabilidad promedio: 0.187
   - Probabilidad máxima: 0.452
```

### 2. Ejecutar Simulación de Amenazas

```bash
# Simulación con semilla aleatoria
python amenazas/simulate_threats.py

# Reproducir simulación específica
python amenazas/simulate_threats.py --seed 42857
```

**Salida:**
- Determina qué amenazas ocurren
- Genera archivo `active_threats.json`
- Registra log completo de la simulación

**Ejemplo de salida:**
```
🎲 Semilla generada: 42857
🔄 Simulando amenazas en aristas...
   Aristas afectadas: 47 / 234
🔄 Simulando amenazas en nodos...
   Nodos afectados: 12 / 89
📊 Resumen:
   ⚠️  Total amenazas activas: 59
```

### 3. Ejecutar Caso Demostrativo

```bash
python amenazas/demo_resilient_route.py
```

**Salida:**
- Compara ruta óptima vs ruta resiliente
- Calcula métricas de riesgo y distancia
- Genera `route_comparison.json`

**Ejemplo de salida:**
```
🔵 Ruta Óptima:
   Distancia: 1500 m
   Riesgo total: 28.5%
   Segmentos de alto riesgo: 3/6

🟢 Ruta Resiliente:
   Distancia: 1680 m (+12%)
   Riesgo total: 8.2%
   Segmentos de alto riesgo: 0/8

✨ Reducción de riesgo: 20.3%
```

### 4. Visualizar en la Web

1. Abre http://localhost:8080
2. Activa el checkbox **"⚠️ Mostrar amenazas activas"**
3. Selecciona propiedades en el mapa
4. Haz clic en **"🎯 Calcular Ruta Óptima"**
5. Observa cómo la ruta evita zonas de riesgo

## 📁 Estructura de Archivos

```
amenazas/
├── extract_traffic_incidents.py      # Genera incidentes de tráfico simulados
├── generate_probabilities_enhanced.py # Calcula probabilidades (Punto 4)
├── simulate_threats.py                # Simulación Monte Carlo (Punto 6)
├── demo_resilient_route.py           # Caso demostrativo (Punto 8)
└── loaders/
    └── load_amenazas.py              # Carga amenazas a PostGIS

web/data/
├── live_incidents.geojson            # Incidentes sin procesar
├── live_incidents_prob.geojson       # Incidentes con probabilidades
├── edge_probabilities.json           # Probabilidades de aristas
├── node_probabilities.json           # Probabilidades de nodos
├── active_threats.json               # Amenazas activas (simulación)
├── simulation_log.json               # Log detallado de simulación
└── route_comparison.json             # Comparación de rutas
```

## 🧮 Algoritmo de Propagación

### Paso 1: Asignación de Probabilidad Base

```python
def assign_base_probability(incident):
    if severity == "ALTA":
        return 0.45  # 45% de probabilidad de fallo
    elif severity == "MEDIA":
        return 0.25  # 25% de probabilidad de fallo
    else:
        return 0.10  # 10% de probabilidad de fallo
```

### Paso 2: Propagación Gaussiana

Para cada arista/nodo dentro del radio de búsqueda:

```python
weight = base_probability * exp(-(distance^2) / (2 * sigma^2))
```

- **distance**: Distancia en metros entre amenaza y arista/nodo
- **sigma**: Parámetro de dispersión (200m por defecto)

### Paso 3: Agregación de Contribuciones

Si múltiples amenazas afectan la misma arista:

```python
p_edge = 1 - ∏(1 - w_i)

# Ejemplo:
# Amenaza 1 contribuye w1 = 0.20
# Amenaza 2 contribuye w2 = 0.15
# p_edge = 1 - (1 - 0.20) * (1 - 0.15)
#        = 1 - 0.80 * 0.85
#        = 1 - 0.68
#        = 0.32 (32% de probabilidad de fallo)
```

## 🎲 Simulación Monte Carlo

### Metodología

Para cada amenaza con probabilidad `p`:

1. Generar número aleatorio `r` entre 0 y 100
2. Calcular umbral: `threshold = p * 100`
3. Determinar ocurrencia:
   ```python
   if r <= threshold:
       amenaza_ocurre = True
   else:
       amenaza_ocurre = False
   ```

### Ejemplo Práctico

```
Arista A-B tiene p = 0.35 (35%)
Umbral = 35

Simulación 1: random = 28  →  28 <= 35  →  ¡OCURRE! ❌
Simulación 2: random = 67  →  67 > 35   →  No ocurre ✅
Simulación 3: random = 35  →  35 <= 35  →  ¡OCURRE! ❌
```

### Reproducibilidad

Usar semilla fija para reproducir resultados:

```bash
python amenazas/simulate_threats.py --seed 42857
```

## 📊 Visualización en la Web

### Checkbox de Amenazas (Punto 7)

```html
<label class="checkbox-label">
  <input type="checkbox" id="show-active-threats" />
  <span>⚠️ Mostrar amenazas activas</span>
</label>
```

**Comportamiento:**
- ✅ **Activado**: Muestra solo amenazas que "ocurrieron" en la simulación
- ❌ **Desactivado**: Oculta todas las amenazas

### Capas de Visualización

| Capa | Color | Significado |
|------|-------|-------------|
| 🔴 Riesgo Alto | Rojo | Probabilidad > 30% |
| 🟡 Riesgo Medio | Amarillo | Probabilidad 15-30% |
| 🟢 Riesgo Bajo | Verde | Probabilidad < 15% |

## 🔧 Integración en el ETL

El proceso completo se ejecuta automáticamente con:

```bash
docker-compose up --build
```

### Secuencia de Ejecución:

```
1. Infraestructura (nodos, aristas)
2. Metadatos (propiedades, servicios)
3. Amenazas:
   a. Extraer incidentes
   b. Calcular probabilidades ← Punto 4
   c. Ejecutar simulación ← Punto 6
4. Generar ruta de ejemplo
5. Caso demostrativo ← Punto 8
```

## 🧪 Testing

### Verificar Probabilidades

```bash
# Deben existir archivos con probabilidades
ls -lh web/data/*prob*.json
ls -lh web/data/*prob*.geojson
```

### Verificar Simulación

```bash
# Debe existir archivo de amenazas activas
cat web/data/active_threats.json | jq '.summary'
```

**Salida esperada:**
```json
{
  "total_active": 59,
  "edges": 47,
  "nodes": 12,
  "incidents": 0
}
```

### Verificar Caso Demostrativo

```bash
# Debe existir comparación de rutas
cat web/data/route_comparison.json | jq '.comparison'
```

**Salida esperada:**
```json
{
  "risk_reduction_percentage": 20.3,
  "distance_increase_percentage": 12.0,
  "recommendation": "resilient"
}
```

## 📈 Métricas de Éxito

### Punto 4: Modelado de Probabilidades
- ✅ Probabilidades asignadas a todas las aristas y nodos
- ✅ Integración de múltiples fuentes de amenazas
- ✅ Propagación gaussiana funcionando correctamente

### Punto 6: Simulación Monte Carlo
- ✅ Sistema determinista con semillas
- ✅ Distribución estadística correcta
- ✅ Amenazas activas identificadas

### Punto 7: Visualización Web
- ✅ Checkbox de control implementado
- ✅ Amenazas mostradas/ocultas dinámicamente
- ✅ Colores según nivel de riesgo

### Punto 8: Caso Demostrativo
- ✅ Comparación cuantitativa de rutas
- ✅ Evidencia de mitigación de riesgos
- ✅ Cumplimiento de objetivos de resiliencia

## 🔮 Mejoras Futuras

1. **Datos en Tiempo Real**:
   - Integrar API de Waze/Google Traffic
   - Actualización automática de incidentes

2. **Machine Learning**:
   - Predicción de congestión basada en históricos
   - Clasificación automática de severidad

3. **Análisis Temporal**:
   - Probabilidades variables por hora del día
   - Patrones de riesgo por día de la semana

4. **Optimización Avanzada**:
   - Algoritmos genéticos para rutas multi-objetivo
   - Equilibrio dinámico riesgo/distancia/tiempo

## 📚 Referencias

- **Dijkstra con Penalización**: Algoritmo clásico adaptado con pesos de riesgo
- **Propagación Gaussiana**: Modelo de difusión espacial
- **Monte Carlo**: Simulación estocástica para análisis de riesgo
- **TSP Resiliente**: Problema del vendedor viajero con restricciones de riesgo

## 👥 Autores

- [fase99](https://github.com/fase99)
- [tiagomedi](https://github.com/tiagomedi)
- [Pipeemendez](https://github.com/Pipeemendez)

## 📄 Licencia

Universidad - Proyecto Académico de Ruteo y Optimización

---

**🎯 Sistema de Amenazas Completo e Integrado**

*La resiliencia te guía hacia tu propiedad perfecta*

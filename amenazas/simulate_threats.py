#!/usr/bin/env python3
"""
Sistema de Simulación de Amenazas (Punto 6)

Este script realiza simulaciones Monte Carlo para determinar qué amenazas ocurren
basándose en las probabilidades calculadas previamente.

Genera números aleatorios (0-100) y compara con el umbral de probabilidad:
- Si random() <= probabilidad*100: La amenaza ocurre
- Si random() > probabilidad*100: La amenaza NO ocurre

Outputs:
- web/data/active_threats.json: Amenazas que ocurren en esta simulación
- web/data/simulation_log.json: Log detallado de la simulación

Usage:
    python amenazas/simulate_threats.py [--seed SEED]
"""
import json
import random
import sys
from pathlib import Path
from datetime import datetime
import argparse

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "web" / "data"


def load_probabilities():
    """Carga archivos de probabilidades"""
    edge_probs = []
    node_probs = []
    incident_probs = []
    
    # Cargar probabilidades de aristas
    edge_file = DATA_DIR / "edge_probabilities.json"
    if edge_file.exists():
        with open(edge_file, 'r') as f:
            edge_probs = json.load(f)
        print(f"✅ Cargadas {len(edge_probs)} probabilidades de aristas")
    
    # Cargar probabilidades de nodos
    node_file = DATA_DIR / "node_probabilities.json"
    if node_file.exists():
        with open(node_file, 'r') as f:
            node_probs = json.load(f)
        print(f"✅ Cargadas {len(node_probs)} probabilidades de nodos")
    
    # Cargar incidentes con probabilidades
    incident_file = DATA_DIR / "live_incidents_prob.geojson"
    if incident_file.exists():
        with open(incident_file, 'r') as f:
            data = json.load(f)
            incident_probs = data.get('features', [])
        print(f"✅ Cargados {len(incident_probs)} incidentes con probabilidades")
    
    return edge_probs, node_probs, incident_probs


def simulate_event(probability, random_value):
    """
    Determina si un evento ocurre basándose en su probabilidad.
    
    Args:
        probability: float entre 0 y 1
        random_value: int entre 0 y 100
    
    Returns:
        bool: True si el evento ocurre
    """
    threshold = probability * 100
    return random_value <= threshold


def run_simulation(edge_probs, node_probs, incident_probs, seed=None):
    """
    Ejecuta una simulación Monte Carlo de amenazas.
    
    Args:
        edge_probs: Lista de probabilidades de aristas
        node_probs: Lista de probabilidades de nodos
        incident_probs: Lista de incidentes con probabilidades
        seed: Semilla para reproducibilidad
    
    Returns:
        dict: Resultado de la simulación
    """
    if seed is not None:
        random.seed(seed)
        print(f"🎲 Usando semilla: {seed}")
    else:
        seed = random.randint(1, 100000)
        random.seed(seed)
        print(f"🎲 Semilla generada: {seed}")
    
    simulation_result = {
        'timestamp': datetime.now().isoformat(),
        'seed': seed,
        'active_edges': [],
        'active_nodes': [],
        'active_incidents': [],
        'statistics': {
            'total_edges_evaluated': len(edge_probs),
            'total_nodes_evaluated': len(node_probs),
            'total_incidents_evaluated': len(incident_probs),
            'edges_activated': 0,
            'nodes_activated': 0,
            'incidents_activated': 0
        },
        'details': []
    }
    
    print(f"\n🔄 Simulando amenazas en aristas...")
    for edge in edge_probs:
        u, v = edge['u'], edge['v']
        prob = edge['probability']
        random_val = random.randint(0, 100)
        
        occurs = simulate_event(prob, random_val)
        
        detail = {
            'type': 'edge',
            'id': f"{u}-{v}",
            'probability': prob,
            'threshold': prob * 100,
            'random_value': random_val,
            'occurs': occurs
        }
        simulation_result['details'].append(detail)
        
        if occurs:
            simulation_result['active_edges'].append({
                'u': u,
                'v': v,
                'probability': prob,
                'severity': 'alta' if prob > 0.3 else 'media' if prob > 0.15 else 'baja'
            })
            simulation_result['statistics']['edges_activated'] += 1
    
    print(f"   Aristas afectadas: {simulation_result['statistics']['edges_activated']} / {len(edge_probs)}")
    
    print(f"\n🔄 Simulando amenazas en nodos...")
    for node in node_probs:
        nid = node['id']
        prob = node['probability']
        random_val = random.randint(0, 100)
        
        occurs = simulate_event(prob, random_val)
        
        detail = {
            'type': 'node',
            'id': nid,
            'probability': prob,
            'threshold': prob * 100,
            'random_value': random_val,
            'occurs': occurs
        }
        simulation_result['details'].append(detail)
        
        if occurs:
            simulation_result['active_nodes'].append({
                'id': nid,
                'probability': prob,
                'severity': 'alta' if prob > 0.3 else 'media' if prob > 0.15 else 'baja'
            })
            simulation_result['statistics']['nodes_activated'] += 1
    
    print(f"   Nodos afectados: {simulation_result['statistics']['nodes_activated']} / {len(node_probs)}")
    
    print(f"\n🔄 Simulando incidentes...")
    for i, incident in enumerate(incident_probs):
        props = incident.get('properties', {})
        prob = props.get('probability', 0)
        random_val = random.randint(0, 100)
        
        occurs = simulate_event(prob, random_val)
        
        detail = {
            'type': 'incident',
            'id': i,
            'probability': prob,
            'threshold': prob * 100,
            'random_value': random_val,
            'occurs': occurs,
            'incident_type': props.get('type', 'unknown')
        }
        simulation_result['details'].append(detail)
        
        if occurs:
            simulation_result['active_incidents'].append({
                'id': i,
                'type': props.get('type', 'unknown'),
                'description': props.get('description', ''),
                'coordinates': incident['geometry']['coordinates'],
                'probability': prob,
                'severity': 'alta' if prob > 0.3 else 'media' if prob > 0.15 else 'baja'
            })
            simulation_result['statistics']['incidents_activated'] += 1
    
    print(f"   Incidentes activos: {simulation_result['statistics']['incidents_activated']} / {len(incident_probs)}")
    
    return simulation_result


def write_outputs(simulation_result):
    """Escribe resultados de la simulación"""
    outdir = Path(DATA_DIR)
    outdir.mkdir(parents=True, exist_ok=True)
    
    # Archivo con amenazas activas (para visualización)
    active_threats = {
        'timestamp': simulation_result['timestamp'],
        'seed': simulation_result['seed'],
        'edges': simulation_result['active_edges'],
        'nodes': simulation_result['active_nodes'],
        'incidents': simulation_result['active_incidents'],
        'summary': {
            'total_active': (
                len(simulation_result['active_edges']) +
                len(simulation_result['active_nodes']) +
                len(simulation_result['active_incidents'])
            ),
            'edges': len(simulation_result['active_edges']),
            'nodes': len(simulation_result['active_nodes']),
            'incidents': len(simulation_result['active_incidents'])
        }
    }
    
    with open(outdir / 'active_threats.json', 'w', encoding='utf-8') as f:
        json.dump(active_threats, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Escrito: {outdir / 'active_threats.json'}")
    
    # Log completo de simulación
    with open(outdir / 'simulation_log.json', 'w', encoding='utf-8') as f:
        json.dump(simulation_result, f, ensure_ascii=False, indent=2)
    print(f"✅ Escrito: {outdir / 'simulation_log.json'}")
    
    # Mostrar resumen
    print(f"\n📊 Resumen de Simulación:")
    print(f"   🎲 Semilla: {simulation_result['seed']}")
    print(f"   ⚠️  Total amenazas activas: {active_threats['summary']['total_active']}")
    print(f"      - Aristas afectadas: {active_threats['summary']['edges']}")
    print(f"      - Nodos afectados: {active_threats['summary']['nodes']}")
    print(f"      - Incidentes activos: {active_threats['summary']['incidents']}")
    
    # Severidades
    high_severity = sum(1 for e in active_threats['edges'] if e['severity'] == 'alta')
    high_severity += sum(1 for n in active_threats['nodes'] if n['severity'] == 'alta')
    high_severity += sum(1 for i in active_threats['incidents'] if i['severity'] == 'alta')
    
    print(f"\n   🔴 Severidad alta: {high_severity}")
    print(f"   🟡 Severidad media: {active_threats['summary']['total_active'] - high_severity}")


def main():
    """Función principal"""
    parser = argparse.ArgumentParser(description='Simular amenazas basadas en probabilidades')
    parser.add_argument('--seed', type=int, help='Semilla para reproducibilidad', default=None)
    args = parser.parse_args()
    
    print("🚀 Iniciando simulación de amenazas...")
    
    # Verificar que existan archivos de probabilidades
    if not (DATA_DIR / "edge_probabilities.json").exists():
        print("❌ Error: No se encontraron probabilidades.")
        print("   Ejecuta primero: python amenazas/generate_probabilities_enhanced.py")
        sys.exit(1)
    
    # Cargar datos
    edge_probs, node_probs, incident_probs = load_probabilities()
    
    if not edge_probs and not node_probs and not incident_probs:
        print("❌ Error: No hay datos de probabilidades para simular")
        sys.exit(1)
    
    # Ejecutar simulación
    result = run_simulation(edge_probs, node_probs, incident_probs, seed=args.seed)
    
    # Guardar resultados
    write_outputs(result)
    
    print(f"\n✅ Simulación completada exitosamente!")
    print(f"   Para ejecutar otra simulación con diferentes resultados:")
    print(f"   python amenazas/simulate_threats.py")
    print(f"   Para reproducir esta simulación:")
    print(f"   python amenazas/simulate_threats.py --seed {result['seed']}")


if __name__ == '__main__':
    main()

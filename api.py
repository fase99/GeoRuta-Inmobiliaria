from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import os
import sys
import json

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, 'web')
DATA_DIR = os.path.join(WEB_DIR, 'data')

@app.route('/run-cplex', methods=['POST'])
def run_cplex():
    try:
        data = request.json
        
        # Save input_stops.json
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR)
            
        input_file = os.path.join(DATA_DIR, 'input_stops.json')
        with open(input_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        
        print(f"[API] Saved input data to {input_file}")
        print(f"[API] Start point: {data.get('startPoint')}")
        print(f"[API] Number of stops: {len(data.get('stops', []))}")
        
        # Run the python script
        script_path = os.path.join(BASE_DIR, 'scripts', 'generate_docplex_route.py')
        
        print(f"[API] Running script: {script_path}")
        result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("[API] Script executed successfully")
            print(result.stdout)
            return jsonify({"status": "success", "message": "Route generated successfully"})
        else:
            print("[API] Script failed")
            print(result.stderr)
            return jsonify({"status": "error", "message": result.stderr}), 500
            
    except Exception as e:
        print(f"[API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "CPLEX API"})

if __name__ == '__main__':
    print("=" * 80)
    print("CPLEX API Server Starting...")
    print("=" * 80)
    app.run(host='0.0.0.0', port=5000, debug=True)

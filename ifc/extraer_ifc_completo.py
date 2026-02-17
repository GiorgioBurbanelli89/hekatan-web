# -*- coding: utf-8 -*-
"""
EXTRACTOR IFC COMPLETO A VISOR THREE.JS
=======================================
Extrae TODOS los elementos del archivo IFC y genera un visor HTML interactivo.
Compatible con IFC exportado desde BIMx (IFC2X3)
"""

import re
import os
import json
from collections import defaultdict

# Ruta del archivo IFC
IFC_PATH = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\Vivienda_Silvia Cedeño - BIMx_A1.ifc"
OUTPUT_HTML = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\visor_ifc_completo.html"

print("=" * 70)
print("EXTRACTOR IFC COMPLETO")
print("=" * 70)

# Leer archivo IFC
print("\n[INFO] Leyendo archivo IFC...")
with open(IFC_PATH, 'r', encoding='utf-8') as f:
    ifc_content = f.read()

lines = ifc_content.split('\n')
print("[OK] Lineas leidas: {}".format(len(lines)))

# Diccionario para almacenar entidades por ID
entities = {}

# Parsear todas las entidades
print("\n[INFO] Parseando entidades IFC...")
entity_pattern = re.compile(r'^#(\d+)=(\w+)\((.*)\);?\s*$')

for line in lines:
    line = line.strip()
    match = entity_pattern.match(line)
    if match:
        entity_id = int(match.group(1))
        entity_type = match.group(2)
        entity_data = match.group(3)
        entities[entity_id] = {
            'type': entity_type,
            'data': entity_data,
            'raw': line
        }

print("[OK] Entidades parseadas: {}".format(len(entities)))

# Encontrar niveles (IFCBUILDINGSTOREY)
print("\n[INFO] Extrayendo niveles...")
levels = {}
level_pattern = re.compile(r"IFCBUILDINGSTOREY\('([^']*)',#\d+,'([^']*)'.*?,([0-9.-]+)\)")

for eid, entity in entities.items():
    if entity['type'] == 'IFCBUILDINGSTOREY':
        match = re.search(r"'([^']*)',#\d+,'([^']*)'", entity['data'])
        elev_match = re.search(r',([0-9.-]+)\)?\s*$', entity['data'])
        if match:
            level_name = match.group(2)
            elevation = float(elev_match.group(1)) if elev_match else 0.0
            levels[eid] = {
                'name': level_name,
                'elevation': elevation
            }
            print("  Nivel #{}: {} (Z={:.1f}m)".format(eid, level_name, elevation))

# Encontrar IFCLOCALPLACEMENT y sus referencias
print("\n[INFO] Mapeando ubicaciones...")
placements = {}
placement_pattern = re.compile(r'IFCLOCALPLACEMENT\(#(\d+),')

for eid, entity in entities.items():
    if entity['type'] == 'IFCLOCALPLACEMENT':
        match = placement_pattern.match(entity['type'] + '(' + entity['data'])
        if match:
            parent_ref = int(match.group(1))
            placements[eid] = parent_ref

# Mapear placement a nivel
def get_level_for_placement(placement_id, depth=0):
    if depth > 10:
        return None
    if placement_id in levels:
        return levels[placement_id]
    if placement_id in placements:
        parent = placements[placement_id]
        return get_level_for_placement(parent, depth + 1)
    # Buscar en la entidad
    if placement_id in entities:
        entity = entities[placement_id]
        # Buscar referencia a nivel en el data
        ref_match = re.search(r'#(\d+)', entity['data'])
        if ref_match:
            ref_id = int(ref_match.group(1))
            if ref_id in levels:
                return levels[ref_id]
    return None

# Extraer elementos estructurales
print("\n[INFO] Extrayendo elementos estructurales...")

# Tipos de elementos a extraer
ELEMENT_TYPES = [
    'IFCCOLUMN', 'IFCBEAM', 'IFCWALL', 'IFCWALLSTANDARDCASE',
    'IFCSLAB', 'IFCROOF', 'IFCSTAIR', 'IFCSTAIRFLIGHT',
    'IFCRAILING', 'IFCDOOR', 'IFCWINDOW', 'IFCCURTAINWALL',
    'IFCFURNISHINGELEMENT', 'IFCBUILDINGPROXY', 'IFCMEMBER'
]

elements = []
element_counts = defaultdict(int)

for eid, entity in entities.items():
    etype = entity['type']

    # Verificar si es un tipo de elemento
    is_element = False
    for et in ELEMENT_TYPES:
        if etype.startswith(et):
            is_element = True
            break

    if not is_element:
        continue

    # Extraer nombre
    name_match = re.search(r"'([^']*)'", entity['data'])
    name = name_match.group(1) if name_match else 'Sin nombre'

    # Buscar referencia a placement
    placement_match = re.search(r',#(\d+),', entity['data'])
    level_info = None
    if placement_match:
        placement_id = int(placement_match.group(1))
        # Buscar en el placement la referencia al nivel
        if placement_id in entities:
            placement_entity = entities[placement_id]
            level_ref_match = re.search(r'#(\d+)', placement_entity['data'])
            if level_ref_match:
                level_ref = int(level_ref_match.group(1))
                if level_ref in levels:
                    level_info = levels[level_ref]

    # Simplificar tipo
    simple_type = etype.replace('IFC', '').replace('STANDARDCASE', '')

    elements.append({
        'id': eid,
        'type': simple_type,
        'name': name,
        'level': level_info['name'] if level_info else 'Desconocido',
        'elevation': level_info['elevation'] if level_info else 0.0
    })

    element_counts[simple_type] += 1

print("\n[OK] Elementos extraidos:")
for etype, count in sorted(element_counts.items()):
    print("  {}: {}".format(etype, count))

print("\nTotal elementos: {}".format(len(elements)))

# Generar HTML con visor Three.js
print("\n[INFO] Generando visor HTML...")

# Convertir elementos a JSON
elements_json = json.dumps(elements, indent=2)

html_content = '''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visor IFC Completo - Vivienda Silvia Cedeno</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            overflow: hidden;
            background: #0d1117;
        }
        #container { width: 100vw; height: 100vh; }
        #info {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(13,17,23,0.95);
            color: #c9d1d9;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            max-width: 300px;
            z-index: 100;
            border: 1px solid #30363d;
            max-height: 90vh;
            overflow-y: auto;
        }
        #info h2 {
            color: #58a6ff;
            margin-bottom: 8px;
            font-size: 16px;
        }
        #info h3 {
            color: #7ee787;
            margin: 12px 0 6px 0;
            font-size: 13px;
        }
        .control-group {
            margin: 6px 0;
            padding: 8px;
            background: rgba(48,54,61,0.5);
            border-radius: 4px;
        }
        .control-group label {
            display: flex;
            align-items: center;
            cursor: pointer;
            margin: 4px 0;
            font-size: 11px;
        }
        .control-group input[type="checkbox"] {
            margin-right: 8px;
            accent-color: #58a6ff;
        }
        .color-box {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 3px;
            margin-right: 8px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .stats {
            font-size: 10px;
            color: #8b949e;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #30363d;
        }
        #levelBtns {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 8px;
        }
        .level-btn {
            background: #21262d;
            border: 1px solid #30363d;
            color: #c9d1d9;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            transition: all 0.2s;
        }
        .level-btn:hover {
            background: #30363d;
            border-color: #58a6ff;
        }
        .level-btn.active {
            background: #58a6ff;
            color: #0d1117;
            border-color: #58a6ff;
        }
        #tooltip {
            position: absolute;
            background: rgba(13,17,23,0.95);
            color: #c9d1d9;
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 12px;
            pointer-events: none;
            display: none;
            z-index: 1000;
            border: 1px solid #58a6ff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #58a6ff;
            font-size: 18px;
            z-index: 200;
        }
        .spinner {
            border: 3px solid #30363d;
            border-top: 3px solid #58a6ff;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        #elementList {
            max-height: 150px;
            overflow-y: auto;
            font-size: 10px;
            background: #161b22;
            border-radius: 4px;
            padding: 6px;
            margin-top: 8px;
        }
        #elementList div {
            padding: 2px 4px;
            cursor: pointer;
            border-radius: 2px;
        }
        #elementList div:hover {
            background: #30363d;
        }
    </style>
</head>
<body>
    <div id="container"></div>
    <div id="loading">
        <div class="spinner"></div>
        Cargando modelo IFC...
    </div>
    <div id="info">
        <h2>Vivienda Silvia Cedeno</h2>
        <p style="color:#8b949e;font-size:10px;margin-bottom:10px;">IFC2X3 - BIMx Export</p>

        <h3>Tipos de Elemento</h3>
        <div class="control-group" id="typeControls"></div>

        <h3>Niveles</h3>
        <div id="levelBtns"></div>

        <h3>Elementos Visibles</h3>
        <div id="elementList"></div>

        <div class="stats">
            <strong>Controles:</strong><br>
            Click + Arrastrar: Rotar<br>
            Scroll: Zoom<br>
            Click derecho: Pan<br>
            Doble click: Centrar
        </div>
    </div>
    <div id="tooltip"></div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>

    <script>
        // Datos extraidos del IFC
        const IFC_ELEMENTS = ''' + elements_json + ''';

        // Colores por tipo
        const TYPE_COLORS = {
            'COLUMN': 0xff6b35,
            'BEAM': 0x3498db,
            'WALL': 0x9b59b6,
            'SLAB': 0x795548,
            'ROOF': 0x607d8b,
            'STAIR': 0x27ae60,
            'STAIRFLIGHT': 0x2ecc71,
            'RAILING': 0xf39c12,
            'DOOR': 0xe74c3c,
            'WINDOW': 0x00bcd4,
            'CURTAINWALL': 0x00acc1,
            'FURNISHINGELEMENT': 0xe91e63,
            'MEMBER': 0x8e44ad
        };

        // Niveles unicos
        const UNIQUE_LEVELS = [...new Set(IFC_ELEMENTS.map(e => e.level))].sort();

        // Variables Three.js
        let scene, camera, renderer, controls;
        let meshes = [];
        let typeGroups = {};
        let currentLevel = 'all';
        let visibleTypes = new Set(Object.keys(TYPE_COLORS));

        function init() {
            // Scene
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0d1117);
            scene.fog = new THREE.Fog(0x0d1117, 50, 100);

            // Camera
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
            camera.position.set(20, 15, 20);

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.getElementById('container').appendChild(renderer.domElement);

            // Controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.target.set(0, 5, 0);
            controls.maxPolarAngle = Math.PI * 0.9;

            // Lights
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(30, 50, 30);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            dirLight.shadow.camera.near = 1;
            dirLight.shadow.camera.far = 100;
            dirLight.shadow.camera.left = -30;
            dirLight.shadow.camera.right = 30;
            dirLight.shadow.camera.top = 30;
            dirLight.shadow.camera.bottom = -30;
            scene.add(dirLight);

            const fillLight = new THREE.DirectionalLight(0x8ec8ff, 0.3);
            fillLight.position.set(-20, 20, -20);
            scene.add(fillLight);

            // Ground
            const groundGeometry = new THREE.PlaneGeometry(100, 100);
            const groundMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a1a2e,
                roughness: 0.9
            });
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -0.1;
            ground.receiveShadow = true;
            scene.add(ground);

            // Grid
            const gridHelper = new THREE.GridHelper(50, 50, 0x30363d, 0x21262d);
            scene.add(gridHelper);

            // Create elements
            createElements();

            // Setup UI
            setupUI();

            // Events
            setupEvents();

            // Hide loading
            document.getElementById('loading').style.display = 'none';

            // Animate
            animate();
        }

        function seededRandom(seed) {
            const x = Math.sin(seed * 9999) * 10000;
            return x - Math.floor(x);
        }

        function createElements() {
            // Initialize type groups
            Object.keys(TYPE_COLORS).forEach(type => {
                typeGroups[type] = new THREE.Group();
                scene.add(typeGroups[type]);
            });

            // Building layout grid
            const gridSize = 4;
            const spacing = 3;

            // Count elements per level per type
            const levelTypeCounts = {};
            IFC_ELEMENTS.forEach(el => {
                const key = el.level + '_' + el.type;
                levelTypeCounts[key] = (levelTypeCounts[key] || 0) + 1;
            });

            // Track position indices
            const positionIndices = {};

            IFC_ELEMENTS.forEach((element, idx) => {
                const color = TYPE_COLORS[element.type] || 0xcccccc;
                const elevation = element.elevation || 0;

                // Generate position based on element index within its level/type
                const key = element.level + '_' + element.type;
                positionIndices[key] = (positionIndices[key] || 0) + 1;
                const posIdx = positionIndices[key];

                // Distribute elements in a grid pattern
                const seed = element.id;
                const gridX = (posIdx % gridSize) - gridSize/2;
                const gridZ = Math.floor(posIdx / gridSize) % gridSize - gridSize/2;

                const x = gridX * spacing + (seededRandom(seed) - 0.5) * 2;
                const z = gridZ * spacing + (seededRandom(seed * 2) - 0.5) * 2;

                let mesh;

                switch(element.type) {
                    case 'COLUMN':
                        mesh = createColumnMesh(x, elevation, z, color);
                        break;
                    case 'BEAM':
                        mesh = createBeamMesh(x, elevation + 2.7, z, color, seed);
                        break;
                    case 'WALL':
                        mesh = createWallMesh(x, elevation, z, color, seed);
                        break;
                    case 'SLAB':
                        mesh = createSlabMesh(x, elevation, z, color);
                        break;
                    case 'STAIR':
                    case 'STAIRFLIGHT':
                        mesh = createStairMesh(x, elevation + posIdx * 0.18, z, color);
                        break;
                    case 'RAILING':
                        mesh = createRailingMesh(x, elevation + 1, z, color, seed);
                        break;
                    case 'CURTAINWALL':
                        mesh = createCurtainWallMesh(x, elevation, z, color, seed);
                        break;
                    case 'DOOR':
                        mesh = createDoorMesh(x, elevation, z, color);
                        break;
                    case 'WINDOW':
                        mesh = createWindowMesh(x, elevation + 1, z, color);
                        break;
                    default:
                        mesh = createGenericMesh(x, elevation + 1, z, color);
                }

                if (mesh) {
                    mesh.userData = {
                        id: element.id,
                        type: element.type,
                        name: element.name,
                        level: element.level,
                        elevation: elevation
                    };

                    if (typeGroups[element.type]) {
                        typeGroups[element.type].add(mesh);
                    }
                    meshes.push(mesh);
                }
            });
        }

        function createColumnMesh(x, y, z, color) {
            const geometry = new THREE.BoxGeometry(0.3, 3, 0.3);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y + 1.5, z);
            mesh.castShadow = true;
            return mesh;
        }

        function createBeamMesh(x, y, z, color, seed) {
            const geometry = new THREE.BoxGeometry(2.5, 0.3, 0.25);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.rotation.y = seededRandom(seed * 3) * Math.PI;
            mesh.castShadow = true;
            return mesh;
        }

        function createWallMesh(x, y, z, color, seed) {
            const geometry = new THREE.BoxGeometry(2, 2.8, 0.15);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y + 1.4, z);
            mesh.rotation.y = seededRandom(seed * 4) * Math.PI;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        }

        function createSlabMesh(x, y, z, color) {
            const geometry = new THREE.BoxGeometry(3, 0.2, 3);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.receiveShadow = true;
            return mesh;
        }

        function createStairMesh(x, y, z, color) {
            const geometry = new THREE.BoxGeometry(1, 0.15, 0.28);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            return mesh;
        }

        function createRailingMesh(x, y, z, color, seed) {
            const group = new THREE.Group();
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.3 });

            // Posts
            for (let i = 0; i < 4; i++) {
                const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
                const post = new THREE.Mesh(postGeo, material);
                post.position.set(i * 0.3 - 0.45, 0.5, 0);
                post.castShadow = true;
                group.add(post);
            }

            // Top rail
            const railGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8);
            const rail = new THREE.Mesh(railGeo, material);
            rail.rotation.z = Math.PI / 2;
            rail.position.y = 1;
            rail.castShadow = true;
            group.add(rail);

            group.position.set(x, y, z);
            group.rotation.y = seededRandom(seed * 5) * Math.PI;
            return group;
        }

        function createCurtainWallMesh(x, y, z, color, seed) {
            const group = new THREE.Group();

            // Glass
            const glassGeo = new THREE.BoxGeometry(1.8, 2.5, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({
                color: color,
                transparent: true,
                opacity: 0.4,
                roughness: 0.1,
                metalness: 0.9
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.y = 1.25;
            group.add(glass);

            // Frame
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.7 });
            const frameGeo = new THREE.BoxGeometry(1.9, 0.04, 0.04);

            const topFrame = new THREE.Mesh(frameGeo, frameMat);
            topFrame.position.y = 2.5;
            group.add(topFrame);

            const bottomFrame = new THREE.Mesh(frameGeo, frameMat);
            bottomFrame.position.y = 0;
            group.add(bottomFrame);

            group.position.set(x, y, z);
            group.rotation.y = seededRandom(seed * 6) * Math.PI;
            return group;
        }

        function createDoorMesh(x, y, z, color) {
            const group = new THREE.Group();

            // Door panel
            const doorGeo = new THREE.BoxGeometry(0.9, 2.1, 0.05);
            const doorMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
            const door = new THREE.Mesh(doorGeo, doorMat);
            door.position.y = 1.05;
            door.castShadow = true;
            group.add(door);

            // Handle
            const handleGeo = new THREE.SphereGeometry(0.03, 8, 8);
            const handleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(0.35, 1, 0.03);
            group.add(handle);

            group.position.set(x, y, z);
            return group;
        }

        function createWindowMesh(x, y, z, color) {
            const group = new THREE.Group();

            // Glass
            const glassGeo = new THREE.BoxGeometry(0.8, 0.8, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({
                color: color,
                transparent: true,
                opacity: 0.5
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            group.add(glass);

            // Frame
            const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
            const frameGeo = new THREE.BoxGeometry(0.85, 0.03, 0.03);

            const top = new THREE.Mesh(frameGeo, frameMat);
            top.position.y = 0.4;
            group.add(top);

            const bottom = new THREE.Mesh(frameGeo, frameMat);
            bottom.position.y = -0.4;
            group.add(bottom);

            group.position.set(x, y, z);
            return group;
        }

        function createGenericMesh(x, y, z, color) {
            const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            return mesh;
        }

        function setupUI() {
            // Type controls
            const typeControlsDiv = document.getElementById('typeControls');
            const typeCounts = {};
            IFC_ELEMENTS.forEach(e => {
                typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
            });

            Object.keys(TYPE_COLORS).forEach(type => {
                if (typeCounts[type]) {
                    const color = '#' + TYPE_COLORS[type].toString(16).padStart(6, '0');
                    const label = document.createElement('label');
                    label.innerHTML = `
                        <input type="checkbox" checked data-type="${type}">
                        <span class="color-box" style="background:${color}"></span>
                        ${type} (${typeCounts[type]})
                    `;
                    typeControlsDiv.appendChild(label);
                }
            });

            // Level buttons
            const levelBtnsDiv = document.getElementById('levelBtns');
            const allBtn = document.createElement('button');
            allBtn.className = 'level-btn active';
            allBtn.textContent = 'Todos';
            allBtn.dataset.level = 'all';
            levelBtnsDiv.appendChild(allBtn);

            UNIQUE_LEVELS.forEach(level => {
                const btn = document.createElement('button');
                btn.className = 'level-btn';
                btn.textContent = level;
                btn.dataset.level = level;
                levelBtnsDiv.appendChild(btn);
            });

            updateElementList();
        }

        function updateElementList() {
            const listDiv = document.getElementById('elementList');
            listDiv.innerHTML = '';

            let visibleCount = 0;
            meshes.forEach(mesh => {
                if (mesh.visible) {
                    visibleCount++;
                    if (visibleCount <= 50) {
                        const div = document.createElement('div');
                        div.textContent = `${mesh.userData.type}: ${mesh.userData.name}`;
                        div.onclick = () => focusOnElement(mesh);
                        listDiv.appendChild(div);
                    }
                }
            });

            if (visibleCount > 50) {
                const more = document.createElement('div');
                more.style.color = '#8b949e';
                more.textContent = `... y ${visibleCount - 50} mas`;
                listDiv.appendChild(more);
            }
        }

        function focusOnElement(mesh) {
            const pos = new THREE.Vector3();
            mesh.getWorldPosition(pos);
            controls.target.copy(pos);
            camera.position.set(pos.x + 5, pos.y + 5, pos.z + 5);
        }

        function setupEvents() {
            // Type checkboxes
            document.querySelectorAll('#typeControls input').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const type = e.target.dataset.type;
                    if (e.target.checked) {
                        visibleTypes.add(type);
                    } else {
                        visibleTypes.delete(type);
                    }
                    updateVisibility();
                });
            });

            // Level buttons
            document.querySelectorAll('.level-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    currentLevel = e.target.dataset.level;
                    updateVisibility();
                });
            });

            // Tooltip
            const tooltip = document.getElementById('tooltip');
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            renderer.domElement.addEventListener('mousemove', (e) => {
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(meshes, true);

                if (intersects.length > 0) {
                    let obj = intersects[0].object;
                    while (obj && !obj.userData.type) obj = obj.parent;

                    if (obj && obj.userData.type) {
                        tooltip.style.display = 'block';
                        tooltip.style.left = e.clientX + 15 + 'px';
                        tooltip.style.top = e.clientY + 15 + 'px';
                        tooltip.innerHTML = `
                            <strong style="color:#58a6ff">${obj.userData.type}</strong><br>
                            <span style="color:#7ee787">${obj.userData.name}</span><br>
                            Nivel: ${obj.userData.level}<br>
                            Elevacion: ${obj.userData.elevation.toFixed(2)}m
                        `;
                    }
                } else {
                    tooltip.style.display = 'none';
                }
            });

            // Double click to focus
            renderer.domElement.addEventListener('dblclick', (e) => {
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(meshes, true);

                if (intersects.length > 0) {
                    const point = intersects[0].point;
                    controls.target.copy(point);
                }
            });

            // Resize
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
        }

        function updateVisibility() {
            meshes.forEach(mesh => {
                let obj = mesh;
                while (obj && !obj.userData.type) obj = obj.parent;

                if (obj && obj.userData) {
                    const typeVisible = visibleTypes.has(obj.userData.type);
                    const levelVisible = currentLevel === 'all' || obj.userData.level === currentLevel;
                    mesh.visible = typeVisible && levelVisible;
                }
            });
            updateElementList();
        }

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }

        init();
    </script>
</body>
</html>
'''

with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
    f.write(html_content)

print("\n[OK] Visor HTML generado: {}".format(OUTPUT_HTML))
print("\n" + "=" * 70)
print("EXTRACCION COMPLETADA")
print("=" * 70)
print("\nAbra el archivo HTML en un navegador para ver el modelo 3D.")

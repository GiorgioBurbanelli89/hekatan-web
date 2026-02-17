# -*- coding: utf-8 -*-
"""
Script para extraer informacion de archivo IFC y generar reporte HTML
Vivienda Silvia Cedeno - BIMx
"""

import re
import os
from collections import defaultdict
from datetime import datetime

# Ruta del archivo IFC
IFC_PATH = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\Vivienda_Silvia Cedeño - BIMx_A1.ifc"
HTML_OUTPUT = r"C:\Users\j-b-j\Documents\Calcpad-7.5.7\ifc\reporte_ifc_vivienda.html"

def parse_ifc_file(filepath):
    """Lee y parsea el archivo IFC"""

    data = {
        'header': {},
        'project': None,
        'site': None,
        'building': None,
        'storeys': [],
        'columns': [],
        'beams': [],
        'walls': [],
        'slabs': [],
        'stairs': [],
        'railings': [],
        'doors': [],
        'windows': [],
        'curtain_walls': [],
        'furnishings': [],
        'other_elements': [],
        'raw_lines': []
    }

    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    lines = content.split('\n')
    data['raw_lines'] = lines

    # Extraer informacion del header
    header_match = re.search(r"FILE_NAME\('([^']*)'", content)
    if header_match:
        data['header']['filename'] = header_match.group(1)

    date_match = re.search(r"FILE_NAME\('[^']*','([^']*)'", content)
    if date_match:
        data['header']['date'] = date_match.group(1)

    schema_match = re.search(r"FILE_SCHEMA\(\('([^']*)'\)\)", content)
    if schema_match:
        data['header']['schema'] = schema_match.group(1)

    # Parsear entidades
    entity_pattern = re.compile(r"#(\d+)=(\w+)\(([^;]*)\);", re.MULTILINE)

    storeys_dict = {}

    for match in entity_pattern.finditer(content):
        entity_id = match.group(1)
        entity_type = match.group(2)
        entity_data = match.group(3)

        # Extraer nombre si existe
        name_match = re.search(r",'([^']*)'", entity_data)
        name = name_match.group(1) if name_match else ""

        # Procesar segun tipo de entidad
        if entity_type == 'IFCPROJECT':
            data['project'] = {
                'id': entity_id,
                'name': name,
                'raw': entity_data
            }

        elif entity_type == 'IFCSITE':
            data['site'] = {
                'id': entity_id,
                'name': name,
                'raw': entity_data
            }

        elif entity_type == 'IFCBUILDING':
            data['building'] = {
                'id': entity_id,
                'name': name,
                'raw': entity_data
            }

        elif entity_type == 'IFCBUILDINGSTOREY':
            # Extraer elevacion
            elev_match = re.search(r',(\d+\.?\d*)$', entity_data)
            elevation = float(elev_match.group(1)) if elev_match else 0

            storey_info = {
                'id': entity_id,
                'name': name,
                'elevation': elevation,
                'raw': entity_data
            }
            data['storeys'].append(storey_info)
            storeys_dict['#' + entity_id] = storey_info

        elif entity_type == 'IFCCOLUMN':
            data['columns'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCBEAM':
            data['beams'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type in ['IFCWALL', 'IFCWALLSTANDARDCASE']:
            data['walls'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCSLAB':
            data['slabs'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type in ['IFCSTAIR', 'IFCSTAIRFLIGHT']:
            data['stairs'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCRAILING':
            data['railings'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCDOOR':
            data['doors'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCWINDOW':
            data['windows'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCCURTAINWALL':
            data['curtain_walls'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

        elif entity_type == 'IFCFURNISHINGELEMENT':
            data['furnishings'].append({
                'id': entity_id,
                'name': name,
                'type': entity_type,
                'raw': entity_data
            })

    # Ordenar niveles por elevacion
    data['storeys'].sort(key=lambda x: x['elevation'])

    return data

def generate_html_report(data, output_path):
    """Genera un reporte HTML del archivo IFC"""

    # Contar elementos por tipo
    element_counts = {
        'Columnas (IFCCOLUMN)': len(data['columns']),
        'Vigas (IFCBEAM)': len(data['beams']),
        'Muros (IFCWALL)': len(data['walls']),
        'Losas (IFCSLAB)': len(data['slabs']),
        'Escaleras (IFCSTAIR)': len(data['stairs']),
        'Barandillas (IFCRAILING)': len(data['railings']),
        'Puertas (IFCDOOR)': len(data['doors']),
        'Ventanas (IFCWINDOW)': len(data['windows']),
        'Muros Cortina (IFCCURTAINWALL)': len(data['curtain_walls']),
        'Mobiliario (IFCFURNISHING)': len(data['furnishings'])
    }

    # Agrupar columnas por tipo
    column_types = defaultdict(int)
    for col in data['columns']:
        column_types[col['name']] += 1

    # Agrupar vigas por tipo
    beam_types = defaultdict(int)
    for beam in data['beams']:
        beam_types[beam['name']] += 1

    # Agrupar muros por tipo
    wall_types = defaultdict(int)
    for wall in data['walls']:
        wall_types[wall['name']] += 1

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte IFC - Vivienda Silvia Cedeno</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 30px;
        }}
        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }}
        h2 {{
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
            padding: 10px;
            background: #ecf0f1;
            border-left: 4px solid #3498db;
        }}
        h3 {{
            color: #2980b9;
            margin-top: 20px;
            margin-bottom: 10px;
        }}
        .info-box {{
            background: #e8f4fd;
            border: 1px solid #3498db;
            border-radius: 5px;
            padding: 15px;
            margin: 15px 0;
        }}
        .warning-box {{
            background: #fef9e7;
            border: 1px solid #f1c40f;
            border-radius: 5px;
            padding: 15px;
            margin: 15px 0;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            background: white;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }}
        th {{
            background: #3498db;
            color: white;
            font-weight: 600;
        }}
        tr:nth-child(even) {{
            background: #f9f9f9;
        }}
        tr:hover {{
            background: #f1f1f1;
        }}
        .count {{
            font-size: 24px;
            font-weight: bold;
            color: #2980b9;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }}
        .summary-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }}
        .summary-card h4 {{
            font-size: 14px;
            margin-bottom: 10px;
            opacity: 0.9;
        }}
        .summary-card .number {{
            font-size: 32px;
            font-weight: bold;
        }}
        .structural {{
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
        }}
        .architectural {{
            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
        }}
        .storey-list {{
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 15px 0;
        }}
        .storey-badge {{
            background: #3498db;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-weight: 500;
        }}
        .element-list {{
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 5px;
        }}
        .collapsible {{
            background: #f1f1f1;
            cursor: pointer;
            padding: 15px;
            border: none;
            width: 100%;
            text-align: left;
            outline: none;
            font-size: 16px;
            font-weight: 600;
            border-radius: 5px;
            margin-top: 10px;
        }}
        .collapsible:hover {{
            background: #e1e1e1;
        }}
        .collapsible:after {{
            content: '+';
            float: right;
            font-weight: bold;
        }}
        .collapsible.active:after {{
            content: '-';
        }}
        .content {{
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            background: #fafafa;
        }}
        .content.show {{
            max-height: 500px;
            overflow-y: auto;
        }}
        .footer {{
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #666;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Reporte IFC - Vivienda Silvia Cedeno</h1>

        <div class="info-box">
            <strong>Archivo:</strong> {data['header'].get('filename', 'N/A')}<br>
            <strong>Fecha de creacion:</strong> {data['header'].get('date', 'N/A')}<br>
            <strong>Esquema IFC:</strong> {data['header'].get('schema', 'N/A')}<br>
            <strong>Lineas totales:</strong> {len(data['raw_lines'])}
        </div>

        <h2>Informacion del Proyecto</h2>
        <table>
            <tr>
                <th>Elemento</th>
                <th>ID</th>
                <th>Nombre</th>
            </tr>
            <tr>
                <td>Proyecto</td>
                <td>#{data['project']['id'] if data['project'] else 'N/A'}</td>
                <td>{data['project']['name'] if data['project'] else 'N/A'}</td>
            </tr>
            <tr>
                <td>Sitio</td>
                <td>#{data['site']['id'] if data['site'] else 'N/A'}</td>
                <td>{data['site']['name'] if data['site'] else 'N/A'}</td>
            </tr>
            <tr>
                <td>Edificio</td>
                <td>#{data['building']['id'] if data['building'] else 'N/A'}</td>
                <td>{data['building']['name'] if data['building'] else 'N/A'}</td>
            </tr>
        </table>

        <h2>Niveles del Edificio</h2>
        <div class="storey-list">
"""

    for storey in data['storeys']:
        html += f'            <div class="storey-badge">{storey["name"]} (Z = {storey["elevation"]:.2f} m)</div>\n'

    html += """        </div>

        <h2>Resumen de Elementos</h2>
        <div class="summary-grid">
"""

    # Tarjetas de resumen - Estructurales
    structural_count = len(data['columns']) + len(data['beams']) + len(data['walls']) + len(data['slabs'])
    html += f"""            <div class="summary-card structural">
                <h4>ELEMENTOS ESTRUCTURALES</h4>
                <div class="number">{structural_count}</div>
            </div>
            <div class="summary-card structural">
                <h4>COLUMNAS</h4>
                <div class="number">{len(data['columns'])}</div>
            </div>
            <div class="summary-card structural">
                <h4>VIGAS</h4>
                <div class="number">{len(data['beams'])}</div>
            </div>
            <div class="summary-card structural">
                <h4>MUROS</h4>
                <div class="number">{len(data['walls'])}</div>
            </div>
"""

    # Tarjetas - Arquitectonicos
    arch_count = len(data['stairs']) + len(data['railings']) + len(data['doors']) + len(data['windows']) + len(data['curtain_walls'])
    html += f"""            <div class="summary-card architectural">
                <h4>ELEMENTOS ARQUITECTONICOS</h4>
                <div class="number">{arch_count}</div>
            </div>
            <div class="summary-card architectural">
                <h4>ESCALERAS</h4>
                <div class="number">{len(data['stairs'])}</div>
            </div>
            <div class="summary-card architectural">
                <h4>BARANDILLAS</h4>
                <div class="number">{len(data['railings'])}</div>
            </div>
            <div class="summary-card architectural">
                <h4>MUROS CORTINA</h4>
                <div class="number">{len(data['curtain_walls'])}</div>
            </div>
        </div>

        <h2>Detalle de Elementos Estructurales</h2>

        <h3>Columnas por Tipo</h3>
        <table>
            <tr>
                <th>Tipo de Columna</th>
                <th>Cantidad</th>
            </tr>
"""

    for col_type, count in sorted(column_types.items(), key=lambda x: -x[1]):
        html += f"""            <tr>
                <td>{col_type or 'Sin nombre'}</td>
                <td>{count}</td>
            </tr>
"""

    html += """        </table>

        <h3>Vigas por Tipo</h3>
        <table>
            <tr>
                <th>Tipo de Viga</th>
                <th>Cantidad</th>
            </tr>
"""

    for beam_type, count in sorted(beam_types.items(), key=lambda x: -x[1]):
        html += f"""            <tr>
                <td>{beam_type or 'Sin nombre'}</td>
                <td>{count}</td>
            </tr>
"""

    html += """        </table>

        <h3>Muros por Tipo</h3>
        <table>
            <tr>
                <th>Tipo de Muro</th>
                <th>Cantidad</th>
            </tr>
"""

    for wall_type, count in sorted(wall_types.items(), key=lambda x: -x[1]):
        html += f"""            <tr>
                <td>{wall_type or 'Sin nombre'}</td>
                <td>{count}</td>
            </tr>
"""

    html += """        </table>

        <h2>Lista Completa de Elementos</h2>

        <button class="collapsible">Columnas ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th></tr>
""".format(len(data['columns']))

    for col in data['columns'][:100]:  # Limitar a 100
        html += f'                <tr><td>#{col["id"]}</td><td>{col["name"]}</td></tr>\n'

    if len(data['columns']) > 100:
        html += f'                <tr><td colspan="2">... y {len(data["columns"]) - 100} mas</td></tr>\n'

    html += """            </table>
        </div>

        <button class="collapsible">Vigas ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th></tr>
""".format(len(data['beams']))

    for beam in data['beams'][:100]:
        html += f'                <tr><td>#{beam["id"]}</td><td>{beam["name"]}</td></tr>\n'

    html += """            </table>
        </div>

        <button class="collapsible">Muros ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th></tr>
""".format(len(data['walls']))

    for wall in data['walls'][:100]:
        html += f'                <tr><td>#{wall["id"]}</td><td>{wall["name"]}</td></tr>\n'

    html += """            </table>
        </div>

        <button class="collapsible">Escaleras ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th><th>Tipo</th></tr>
""".format(len(data['stairs']))

    for stair in data['stairs'][:100]:
        html += f'                <tr><td>#{stair["id"]}</td><td>{stair["name"]}</td><td>{stair["type"]}</td></tr>\n'

    html += """            </table>
        </div>

        <button class="collapsible">Barandillas ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th></tr>
""".format(len(data['railings']))

    for rail in data['railings'][:100]:
        html += f'                <tr><td>#{rail["id"]}</td><td>{rail["name"]}</td></tr>\n'

    html += """            </table>
        </div>

        <button class="collapsible">Muros Cortina ({} elementos)</button>
        <div class="content">
            <table>
                <tr><th>ID</th><th>Nombre</th></tr>
""".format(len(data['curtain_walls']))

    for cw in data['curtain_walls'][:100]:
        html += f'                <tr><td>#{cw["id"]}</td><td>{cw["name"]}</td></tr>\n'

    html += """            </table>
        </div>

        <div class="footer">
            <p>Reporte generado automaticamente desde archivo IFC</p>
            <p>Fecha de generacion: """ + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + """</p>
        </div>
    </div>

    <script>
        // Funcionalidad de colapsar/expandir
        var coll = document.getElementsByClassName("collapsible");
        for (var i = 0; i < coll.length; i++) {
            coll[i].addEventListener("click", function() {
                this.classList.toggle("active");
                var content = this.nextElementSibling;
                content.classList.toggle("show");
            });
        }
    </script>
</body>
</html>
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    return output_path

# Ejecutar
print("=" * 60)
print("EXTRACCION DE ARCHIVO IFC A HTML")
print("=" * 60)

print("\n[INFO] Leyendo archivo IFC...")
print(f"  Archivo: {IFC_PATH}")

data = parse_ifc_file(IFC_PATH)

print("\n[OK] Archivo parseado correctamente")
print(f"\n[INFO] Resumen del modelo:")
print(f"  - Proyecto: {data['project']['name'] if data['project'] else 'N/A'}")
print(f"  - Edificio: {data['building']['name'] if data['building'] else 'N/A'}")
print(f"  - Niveles: {len(data['storeys'])}")
print(f"  - Columnas: {len(data['columns'])}")
print(f"  - Vigas: {len(data['beams'])}")
print(f"  - Muros: {len(data['walls'])}")
print(f"  - Losas: {len(data['slabs'])}")
print(f"  - Escaleras: {len(data['stairs'])}")
print(f"  - Barandillas: {len(data['railings'])}")
print(f"  - Muros Cortina: {len(data['curtain_walls'])}")

print("\n[INFO] Generando reporte HTML...")
output = generate_html_report(data, HTML_OUTPUT)

print(f"\n[OK] Reporte generado: {output}")
print("\n" + "=" * 60)

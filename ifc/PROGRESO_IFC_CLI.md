# Progreso IFC CLI - Extracción de Geometría y Persistencia

## Fecha: 2026-02-10

## Objetivo
1. **Extraer geometría/coordenadas** del modelo IFC para replicarlo programáticamente
2. **Persistir cambios CLI** - que comandos ejecutados se guarden en el HTML

---

## Paso 1: Investigación del código existente

### Archivos analizados:
- `ifc/ifc-cli.html` - Visor principal (Three.js + web-ifc)
- `Examples/server-mimetypes.py` - Servidor Python puerto 8888
- `Calcpad.IfcCli/Program.cs` - CLI C#
- `Calcpad.IfcCli/IfcParser.cs` - Parser IFC
- `Calcpad.IfcCli/IfcModifier.cs` - Modificador
- `Calcpad.IfcCli/IfcHtmlExporter.cs` - Exportador HTML

### Estado actual del visor (ifc-cli.html):
- Carga IFC via web-ifc WASM
- Extrae geometría: vértices (x,y,z), normales (nx,ny,nz), índices, colores RGBA
- Stride de vértices = 6: [x, y, z, nx, ny, nz]
- Matrices de transformación 4x4 por geometría
- Almacena en `ifcModel.entities` y `ifcMeshes`
- CLI commands: load, merge, save, meta, fit, view, wireframe, etc.
- **NO tiene**: exportar geometría, ni persistir cambios en HTML

### Datos disponibles en runtime (JavaScript):
```
ifcModel = {
  entities: { [expressID]: { id, type, args } },
  typeIndex: { "IFCWALL": [id1, id2, ...] },
  buffer: ArrayBuffer (IFC crudo),
  mergeBuffer, mergeOffset, etc.
}
ifcMeshes = { "IFCWALL": [THREE.Mesh, ...] }
```

Cada mesh tiene:
```
mesh.geometry.attributes.position  → Float32Array (x,y,z por vértice)
mesh.geometry.attributes.normal    → Float32Array
mesh.geometry.index               → Uint32Array (triángulos)
mesh.material.color               → THREE.Color
mesh.material.opacity             → float
mesh.matrix / mesh.matrixWorld    → Matrix4x4
mesh.userData.ifcType             → "IFCBEAM", etc.
mesh.userData.expressID           → número
```

---

## Paso 2: Plan de implementación

### Feature A: Extraer Geometría (`extract` / `extraer`)
Nuevo comando CLI en el visor que exporta geometría en formato JSON/CSV:

```
ifc> extract json          → JSON con toda la geometría
ifc> extract obj           → formato OBJ (Wavefront)
ifc> extract csv           → CSV con coordenadas
ifc> extract selected      → solo elemento seleccionado
ifc> extract type IFCBEAM  → solo vigas
```

**Formato JSON propuesto:**
```json
{
  "model": "vivienda_Silvia_con_escalera.ifc",
  "units": "m",
  "elements": [
    {
      "id": 5139,
      "type": "IFCBEAM",
      "name": "Hormigón-Viga rectangular:V25X25:1169265",
      "color": [0.8, 0.8, 0.8, 1.0],
      "transform": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
      "geometry": {
        "vertices": [x1,y1,z1, x2,y2,z2, ...],
        "normals": [nx1,ny1,nz1, ...],
        "indices": [0,1,2, 3,4,5, ...],
        "vertexCount": 24,
        "triangleCount": 12
      },
      "boundingBox": {
        "min": [x,y,z],
        "max": [x,y,z],
        "center": [x,y,z],
        "size": [w,h,d]
      }
    }
  ],
  "summary": {
    "totalElements": 150549,
    "totalVertices": 9731896,
    "totalTriangles": 3247964,
    "types": { "IFCBEAM": 397, "IFCCOLUMN": 11, ... }
  }
}
```

### Feature B: Persistir cambios en HTML (`autosave`)
Cuando se ejecuta un comando CLI que modifica el estado visual:
- Guardar historial de comandos en el HTML
- Al recargar, re-ejecutar los comandos guardados
- Usar `<script id="ifc-state">` embebido en el HTML

**Mecanismo:**
1. Array `commandHistory[]` registra cada comando ejecutado
2. Comando `autosave` activa/desactiva persistencia
3. Comando `savehtml` guarda el HTML actual con el estado
4. Al cargar, busca `window.__ifcSavedState` y lo restaura

---

## Paso 3: Implementación (en curso)

### 3a. Comando `extract` en ifc-cli.html ✅
- [x] Función `extractGeometry(format, filterType)` — línea 1395
- [x] Extraer vértices/índices de cada mesh con world-space transform
- [x] Calcular bounding box por elemento (min, max, center, size)
- [x] Formato JSON descargable (completo con vértices/índices)
- [x] Formato OBJ descargable (Wavefront con objetos separados)
- [x] Formato CSV descargable (tabla de elementos con posiciones)
- [x] Formato clipboard (resumen al portapapeles)
- [x] Filtro por tipo IFC: `extract json IFCBEAM`
- [x] Filtro por selección: `extract selected`
- [x] Botón "Extraer" en toolbar

### 3b. Persistencia de estado en HTML ✅
- [x] Array `stateHistory` global — línea 1296
- [x] `trackCommand()` registra comandos que cambian estado visual
- [x] Hook en `exec()` llama `trackCommand()` antes de ejecutar
- [x] `saveHtmlWithState()` — clona HTML, inyecta `__ifcSavedState`, descarga
- [x] `restoreState()` — lee `__ifcSavedState`, re-ejecuta comandos guardados
- [x] Comando `savehtml` / `guardarhtml`
- [x] Comando `history` / `historial`
- [x] Comando `restore` / `restaurar`
- [x] Comando `clearhistory` / `limpiarhistorial`
- [x] Auto-detección de estado guardado en `init()`
- [x] Botón "Guardar HTML" en toolbar

### Archivos modificados:
- `ifc/ifc-cli.html` — 2050 → 2434 líneas (+384 líneas nuevas)

### Nuevas líneas de código:
| Función | Línea | Descripción |
|---------|-------|-------------|
| `trackCommand()` | 1300 | Registra comandos state-changing |
| `saveHtmlWithState()` | 1309 | Clona HTML + inyecta estado |
| `restoreState()` | 1366 | Lee __ifcSavedState y re-ejecuta |
| `extractGeometry()` | 1395 | Extrae geometría 3D en JSON/OBJ/CSV |

---

## Paso 4: Prueba de comandos CLI (2026-02-10)

### Comandos ejecutados en orden:

```bash
# 1. Recargar página limpia
http://127.0.0.1:8888/ifc/ifc-cli.html

# 2. Cargar modelo base (vivienda SIN escalera)
loadurl http://127.0.0.1:8888/ifc/vivienda%20Silvia%20sin%20escalera.ifc
# → 9,728,740 vértices, 3,245,396 triángulos, 4 tipos, 145942 entidades

# 3. Fusionar escalera del segundo modelo
merge escalera http://127.0.0.1:8888/ifc/Silvia_Cedeno_escalera.ifc
# → Auto-alineación XZ(columnas) Y(vigas-tope): offset (49.32, 4.06, 6.57)
# → +31 meshes (escalera), +3,156 vértices, +1,976 triángulos

# 4. Extraer geometría
extract csv
# → 2796 filas exportadas a vivienda%20Silvia%20sin%20escalera_elements.csv

extract json IFCCOLUMN
# → 11 elementos, 374 vértices, 0.0 MB

extract json IFCBEAM
# → 307 elementos, 23,286 vértices, 2.1 MB

extract json IFCSLAB
# → 11 elementos, 374 vértices, 0.0 MB

extract json   (TODOS - FALLÓ: "Invalid string length" - modelo demasiado grande 9.7M vértices)

# 5. Guardar HTML con estado
savehtml
# → vivienda%20Silvia%20sin%20escalera_viewer.html (111 KB)
# → 2 comandos guardados en el HTML
# → Al abrir: window.ifc.exec('restore') para re-aplicar
```

### Archivos generados (descargados al navegador):
| Archivo | Contenido |
|---------|-----------|
| `vivienda%20Silvia%20sin%20escalera_elements.csv` | CSV con 2796 elementos (posición, tamaño, vértices) |
| `vivienda%20Silvia%20sin%20escalera_geometry.json` | JSON con geometría IFCCOLUMN (11 elem) |
| `vivienda%20Silvia%20sin%20escalera_geometry.json` | JSON con geometría IFCBEAM (307 elem) |
| `vivienda%20Silvia%20sin%20escalera_geometry.json` | JSON con geometría IFCSLAB (11 elem) |
| `vivienda%20Silvia%20sin%20escalera.obj` | OBJ Wavefront (IFCCOLUMN, 22 objetos) |
| `vivienda%20Silvia%20sin%20escalera_viewer.html` | HTML con estado guardado (2 comandos) |

### Bug encontrado:
- `extract json` (sin filtro) falla con "Invalid string length" cuando el modelo tiene ~9.7M vértices
- **Solución**: usar filtro por tipo: `extract json IFCBEAM`, `extract json IFCCOLUMN`, etc.

---

## Notas técnicas
- Three.js v0.128.0 (UMD, no ES modules)
- web-ifc v0.0.66 (WASM)
- Servidor Python en puerto 8888
- IFC usa Z-up, Three.js usa Y-up → transformación en carga

## Modelos IFC disponibles en `ifc/`:
| Archivo | Descripción |
|---------|-------------|
| `vivienda Silvia sin escalera.ifc` | Modelo base - vivienda SIN escalera |
| `Silvia_Cedeno_escalera.ifc` | Solo la escalera (para merge) |
| `vivienda_Silvia_con_escalera.ifc` | Vivienda + escalera ya fusionadas |
| `Vivienda_Silvia_Cedeno_3D.ifc` | Versión 3D completa |

## Comandos para reproducir el estado completo:
```
loadurl http://127.0.0.1:8888/ifc/vivienda%20Silvia%20sin%20escalera.ifc
merge escalera http://127.0.0.1:8888/ifc/Silvia_Cedeno_escalera.ifc
mmove 0 -0.70 0
```

---

## Paso 5: Ajuste de posición de escalera (2026-02-11)

### Problema:
La escalera fusionada quedaba con su base en Y=0.900 en vez de Y=0.200 (nivel Contrapiso).
El auto-merge aplicó offset (49.32, 4.06, 6.57) + offsetY manual -3.26, pero faltaba -0.70 adicional.

### Solución:
```bash
# Después de cargar base + merge escalera (auto-carga desde savehtml):
mmove 0 -0.70 0
# → Movidos 31 meshes merge: dx=0, dy=-0.70, dz=0
# → Base escalera: Y=0.200 (nivel Contrapiso ✅)
# → Tope escalera: Y=4.240
```

### Verificación por bounding box (JavaScript):
```javascript
// Base de escalera (meshes merged)
minY = 0.200  // ✅ Nivel Contrapiso
maxY = 4.240  // Tope de la escalera
count = 31    // meshes de la escalera
```

### Estado guardado:
- `savehtml` → HTML con 2 comandos guardados + mmove pendiente
- La auto-carga del visor ya incluye: load base + merge escalera + offsetY -3.26
- El mmove -0.70 adicional se debe aplicar manualmente o agregarse a la auto-carga

### Limitación conocida:
- `mmove` solo mueve meshes Three.js visualmente, NO modifica el IFC real
- `save` no persiste los movimientos de mesh al archivo IFC
- Para persistir en IFC se necesita: modificar IFCLOCALPLACEMENT via web-ifc API (Opción B)

### Offset total acumulado de la escalera:
| Componente | Valor | Descripción |
|------------|-------|-------------|
| Auto-alineación XZ | (49.32, -, 6.57) | Alineación por columnas |
| Auto-alineación Y | 4.06 | Alineación por vigas-tope |
| offsetY manual | -3.26 | Ajuste base escalera → ~0.90 |
| mmove adicional | -0.70 | Ajuste fino → 0.20 |
| **Total Y** | **0.10** | **4.06 - 3.26 - 0.70 = 0.10** |

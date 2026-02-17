# Hekatan CAD Editor - Arquitectura del Sistema

## Resumen

Editor CAD 2D/3D construido con **JavaScript vanilla**, **Canvas 2D** y **Three.js**.
~4,500 lineas de codigo en 14 modulos ES independientes, sin framework ni build system.
Estilo AutoCAD: snaps, ortho, dynamic input, window/crossing selection.

---

## Archivos (18 total)

| Archivo | Lineas | Rol |
|---------|--------|-----|
| `index.html` | 226 | Layout HTML + iconos SVG inline |
| `cad.css` | ~300 | Tema oscuro estilo VS Code |
| `state.js` | 151 | Estado mutable centralizado (singleton) |
| `math.js` | 38 | Funciones puras: distancia, angulo, formato |
| `dom.js` | 66 | Referencias DOM cacheadas |
| `projection.js` | 65 | Transformaciones world/screen/3D |
| `snap.js` | 343 | Sistema de snaps tipo AutoCAD + tracking |
| `render.js` | 185 | Dibujo Canvas 2D: grid, formas, seleccion |
| `panels.js` | 156 | Arbol de objetos + panel de propiedades |
| `history.js` | 29 | Undo/redo via deep clone JSON |
| `export.js` | 103 | Exportacion Hekatan (.cpd) y SVG |
| `dynamic-input.js` | 275 | Input flotante tipo AutoCAD cerca del cursor |
| `three-view.js` | 240 | Vista 3D con Three.js + OrbitControls |
| `input.js` | 842 | Eventos mouse/teclado, hit testing, seleccion |
| `cli.js` | 906 | API programatica `window.cad.*` + CLI texto |
| `app.js` | 253 | Inicializacion, toolbar, callbacks |
| `serve.py` | 12 | Servidor de desarrollo Python |

---

## Arquitectura por Capas

```
Capa 7: app.js (Init)  +  cli.js (API externa window.cad.*)
         |
Capa 6: input.js (Mouse, teclado, hit test, seleccion)
         |
Capa 5: panels.js  export.js  history.js  three-view.js  dynamic-input.js
         |
Capa 4: render.js (Dibujo Canvas 2D)
         |
Capa 3: snap.js (Snaps + tracking)  +  projection.js (Coordenadas)
         |
Capa 2: dom.js (Elementos DOM)
         |
Capa 1: math.js (Funciones puras)
         |
Capa 0: state.js (Estado central - sin imports)
```

Cada capa solo importa de capas inferiores. Nunca hacia arriba.

---

## Estado Central (`state.js`)

Todo el estado mutable vive en un solo archivo. Sin imports.

```javascript
// Camara/viewport
export var cam = {x, y, zoom, minZoom, maxZoom}

// Formas (shapes) - array principal
export var formas = []

// Historial undo/redo
export var historial = [], histPos = -1

// Modo actual de dibujo
export var modo = "select"     // "linea", "rectangulo", "circulo", etc.

// Punto inicial del dibujo en curso
export var pIni = null

// Seleccion
export var formaSel = -1
export var selectedShapes = []

// Toggles
export var snapOn, orthoOn, gridOn, sgridOn

// Callbacks (para romper dependencias circulares)
export var callbacks = { setMode, zoomFit, redraw, flash, updTree, ... }

// Setter generico
export function set(key, val) { ... }
```

### Estructura de una Forma

Cada forma en `formas[]` es un objeto plano:

```javascript
{
  tipo: "linea" | "rectangulo" | "circulo" | "elipse" |
        "polilinea" | "arco" | "arco_circular" | "mano",
  color: "#ffffff",
  z: 0,              // elevacion
  hidden: false,
  lw: 2,             // line width (opcional)
  fill: null,        // color relleno (opcional)

  // Segun tipo:
  // linea:           x1, y1, z1, x2, y2, z2
  // rectangulo:      x, y, w, h
  // circulo:         cx, cy, r
  // elipse:          cx, cy, rx, ry
  // polilinea/mano:  pts: [{x, y, z}, ...]
  // arco:            x1, y1, cx, cy, x2, y2
  // arco_circular:   cx, cy, r, startAngle, endAngle
}
```

---

## Modulos Clave

### `render.js` - Dibujo 2D

- `redraw()` - Ciclo completo: limpiar, grid, origen, formas, seleccion
- `drawGrid()` - Grid adaptativo segun zoom
- `drawShape(f, sel)` - Dibuja forma individual con dimensiones
- `drawSelectionBox()` - Rectangulo window/crossing

Usa `w2s()` y `s2w()` de projection.js para convertir coordenadas.

### `input.js` - Interaccion

- `hitTest(wx, wy)` - Busca forma bajo el cursor (tolerancia 8px/zoom)
- `zoomFit()` - Ajusta vista a todas las formas
- Mouse: click dibuja, drag para pan o seleccion box
- Teclado: V(select), L(linea), R(rect), C(circulo), Ctrl+Z(undo), etc.
- Seleccion Window (izq-der) = solo formas completamente dentro
- Seleccion Crossing (der-izq) = formas que toquen el rectangulo

### `snap.js` - Snaps AutoCAD

8 tipos de snap con cache:
- **endpoint**: extremos de lineas/arcos
- **midpoint**: puntos medios
- **center**: centros de circulos/elipses
- **quadrant**: 0/90/180/270 de circulos
- **intersection**: cruces de lineas
- **perpendicular**: proyeccion perpendicular
- **nearest**: punto mas cercano en forma
- **extension**: lineas de extension implicitas

Cache invalidado cuando cambian las formas.

### `cli.js` - API Programatica

Expone `window.cad` con funciones de dibujo:

```javascript
cad.line(x1, y1, x2, y2, color)
cad.rect(x, y, w, h, color)
cad.circle(cx, cy, r, color)
cad.ellipse(cx, cy, rx, ry, color)
cad.pline([x1,y1, x2,y2, ...], color)
cad.carc(cx, cy, r, startAng, endAng, color)
cad.rrect(x, y, w, h, r, color)      // Rectangulo redondeado
cad.stirrup(x, y, w, h, r, hook, c)  // Estribo con gancho
cad.columnSection(cx,cy, bw,bh, rec, dS, dL, nx, ny, bendR)
```

Funciones de edicion:
```javascript
cad.move(idx, dx, dy)
cad.copy(idx, dx, dy)
cad.mirror(idx, ax1,ay1, ax2,ay2)
cad.rotate(idx, cx, cy, angle)
cad.scaleShape(idx, factor, cx, cy)
cad.array(idx, nx, ny, dx, dy)       // Array rectangular
cad.polarArray(idx, n, cx, cy, ang)  // Array polar
cad.arrayPath(idx, n, x1,y1, x2,y2) // Array en trayectoria
cad.offset(idx, dist, color)         // Offset paralelo
```

Utilidades:
```javascript
cad.clear()
cad.undo()
cad.zoomfit()
cad.del(idx)
cad.list()
cad.help()
cad.scale(s)
cad.unit('cm')
cad.beginBatch() / cad.endBatch()    // Suprimir redibujado
```

### `dynamic-input.js` - Input Flotante

Caja de coordenadas flotante junto al cursor (como AutoCAD):
- Modo `cmd`: entrada de comando + X/Y/Z
- Modo `coord`: solo coordenadas X/Y/Z
- Modo `dist`: distancia + angulo (para segundo punto)
- Autocompletado de comandos

### `three-view.js` - Vista 3D

- WebGL via Three.js r128 (CDN)
- OrbitControls para navegacion
- Sincroniza `formas[]` con scene Three.js
- Formas como wireframes (no meshes solidos)
- Raycasting para seleccion en 3D

---

## Flujo de Trabajo: Dibujar un Rectangulo

```
1. Usuario click boton "Rect"
   -> app.js: setMode("rectangulo")
   -> state.modo = "rectangulo"

2. Click en canvas (primer punto)
   -> input.js: mousedown
   -> snap.js: findSnap() busca snap cercano
   -> state.pIni = {x, y} (primera esquina)

3. Mouse move (preview)
   -> snap.js: calcula snap + tracking
   -> dynamic-input.js: actualiza X/Y/Z
   -> render.js: dibuja rectangulo temporal

4. Click en canvas (segundo punto)
   -> Crea forma: {tipo:"rectangulo", x, y, w, h, color, z}
   -> formas.push(forma)
   -> history.js: saveHist()
   -> snap.js: invalidateSnapCache()
   -> render.js: redraw()
   -> panels.js: updTree()
   -> state.pIni = null (listo para siguiente)
```

---

## Patron de Callbacks

Para romper dependencias circulares, `app.js` registra callbacks en `state.js`:

```javascript
// app.js (init)
state.callbacks.redraw = render.redraw;
state.callbacks.updTree = panels.updTree;
state.callbacks.flash = flash;
// ...

// Cualquier modulo puede llamar:
S.callbacks.redraw?.();
```

Esto permite que `cli.js` llame `redraw()` sin importar `render.js` directamente.

---

## Exportacion

### Hekatan (.cpd)
Genera codigo Hekatan con propiedades calculadas:
```
'--- Linea 1 ---
L = 100 'cm |Longitud
ang = 45 |Angulo (grados)
```

### SVG
Genera SVG con coordenadas de pantalla, fondo oscuro.

---

## Atajos de Teclado

| Tecla | Accion |
|-------|--------|
| V | Seleccionar |
| H | Pan |
| L | Linea |
| P | Polylinea |
| R | Rectangulo |
| C | Circulo |
| E | Elipse |
| A | Arco |
| F | Mano libre |
| M | Mover seleccion |
| T | Recortar (Trim) |
| X | Escalar |
| Ctrl+C | Copiar |
| Ctrl+V | Pegar |
| Ctrl+D | Duplicar |
| Ctrl+Z | Undo |
| Delete | Eliminar |
| Escape | Cancelar |
| F3 | Toggle Snap |
| F8 | Toggle Ortho |
| F11 | Toggle Object Tracking |
| Z | Zoom Fit |

---

## Dependencias Externas

- **Three.js r128** (CDN) - Vista 3D
- **OrbitControls** (CDN) - Navegacion 3D
- **Ninguna** via npm/node - todo ES modules nativos del navegador

## Servidor de Desarrollo

```bash
python serve.py
# Abre http://localhost:8080/
```

---

## Limitaciones Actuales

1. No hay capas (layers) - todas las formas en un solo array
2. No hay grupos/bloques - cada forma es independiente
3. No hay restricciones parametricas
4. No importa/exporta DWG/DXF
5. Undo usa JSON clone (OK hasta ~1000 formas)
6. 3D solo wireframe (no meshes solidos)
7. Sin sistema de cotas/dimensionamiento automatico

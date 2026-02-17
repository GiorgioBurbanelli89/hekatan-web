# Integracion CAD CLI + IFC Viewer

## Estado Actual del Proyecto

### Lo que existe HOY

#### 1. Visor IFC CLI (`ifc/ifc-cli.html`)
- Visor 3D completo con Three.js WebGL
- Carga archivos IFC, muestra meshes, seleccion, visibilidad
- CLI de comandos: 80+ comandos (load, hide, isolate, clip, etc.)
- 13 archivos JS, ~8,000 LOC total
- Versiones actuales: ifc-three.js v77, ifc-commands.js v23

#### 2. Sistema Corte 2D (`corte2d`)
Implementado en `ifc-three.js`. Genera vista tecnica 2D cortando meshes IFC con un plano.

**Comandos:**
```
corte2d z -9.29 #3428    → Corte en plano Z, solo mesh #3428
corte2d x -10.5           → Corte en plano X, todos los meshes
```

**Funcionalidad:**
- Interseccion plano-triangulo para cada mesh visible
- Genera segmentos de linea (THREE.LineSegments, color negro)
- Genera nodos snap (THREE.Points, color rojo)
- Vista ortografica, fondo blanco, camara ajustada
- Snap a nodos por proximidad (umbral 0.04 NDC)
- Marcador verde (esfera) en nodo snapeado

#### 3. Mini-CAD de Seccion (basico)
Comandos disponibles en vista de seccion:

| Comando | Descripcion |
|---------|-------------|
| `slinea` / `sline` | Dibujar linea entre 2 nodos |
| `sdim` / `scota` | Medir y anotar distancia |
| `smedir` / `smeasure` | Medir (solo consola) |
| `sborrar` / `sclear` | Borrar dibujos |
| `snodos` / `snodes` | Listar nodos |
| `srampa` / `sramp` | Preview rampa escalera |
| `saplicar` / `sapply` | Aplicar rampa |
| `sundo` / `sdeshacer` | Deshacer rampa |

**Limitaciones del mini-CAD:**
- Solo snap a endpoint (nodos de interseccion)
- Sin undo/redo para lineas/cotas
- Sin rectangulos, circulos, polylines
- Sin export SVG
- Sin seleccion de formas dibujadas
- Sin edicion (move, copy, mirror, etc.)

#### 4. srampa — Modificacion de escalera (v77)
Modifica la geometria de una escalera para crear fondo de losa recto:
1. `srampa` → click nariz1, click nariz2 → preview (lineas gris/azul)
2. `saplicar` → modifica vertices del mesh
3. `sundo` → restaura geometria original

**Caracteristicas v77:**
- Rango estricto P1→P2 (no extiende a descanso ni base)
- Auto-deteccion de espesor de losa
- Propagacion por triangulos (hasta 10 pasadas)
- Backup de posiciones para undo
- Preview antes de modificar

#### 5. CAD CLI Completo (`Calcpad.Wpf/doc/cad/`)
Sistema CAD independiente con 10 archivos JS (~4,300 LOC):

| Archivo | LOC | Funcion |
|---------|-----|---------|
| cli.js | 1,348 | API: 50+ metodos (`cad.line()`, `cad.rect()`, `cad.dim()`, etc.) |
| state.js | 152 | Estado centralizado (formas, camara, modo, snap config) |
| snap.js | 352 | 8 tipos de snap (endpoint, midpoint, center, quadrant, intersection, perpendicular, nearest, extension) |
| render.js | 300 | Canvas 2D rendering (11+ tipos de forma) |
| input.js | 965 | Mouse/teclado, hit test, edit ops (move, copy, trim, scale) |
| export.js | 128 | Export SVG y Calcpad CPD |
| math.js | 39 | Utilidades geometricas |
| dom.js | 67 | Referencias DOM |
| projection.js | 66 | Transformaciones 2D/3D/pantalla |
| history.js | ~100 | Undo/redo (40 niveles) |
| app.js | 259 | Inicializacion y UI |

**Capacidades del CAD CLI:**
- Dibujo: line, rect, circle, ellipse, arc, polyline, freehand
- Edicion: move, copy, mirror, rotate, scale, offset, trim
- Arrays: rectangular, polar, path
- Cotas: horizontal, vertical, alineada, angular
- Grupos: group, ungroup
- Seleccion: click, window (azul), crossing (verde)
- Snap: 8 tipos con marcadores visuales y tracking
- Undo/redo: 40 niveles de historia
- Serialization: JSON save/load
- Export: SVG, Calcpad CPD
- Estructural: stirrup, columnSection (ACI 318)

---

## Plan de Integracion

### Objetivo
Copiar el CAD CLI completo al visor IFC y combinarlo para que funcione
directamente en la vista de corte 2D. Cuando el usuario haga `corte2d`,
el CAD completo se activa sobre la seccion con todos sus comandos.

### Diferencia Arquitectural

| Aspecto | CAD CLI (cad/) | IFC Viewer (ifc/) |
|---------|----------------|-------------------|
| Rendering | Canvas 2D | Three.js WebGL |
| Coordenadas | 2D world (x,y) | 3D world (Vector3) |
| Modules | ES6 import/export | Script tags globales |
| Snap | 8 tipos sobre formas | Solo endpoint nodos 3D |
| Estado | state.js singleton | window._S global |

### Estrategia: Canvas 2D overlay

1. **Canvas superpuesto**: `<canvas id="cadCanvas">` encima del viewport Three.js
2. **Copiar archivos**: `Calcpad.Wpf/doc/cad/` → `ifc/js/cad/`
3. **Convertir modulos**: ES6 modules → script tags con namespace `CAD.*`
4. **Activacion**: `corte2d` activa el CAD overlay
5. **Importar geometria**: segmentos del corte → polylines CAD
6. **Snap combinado**: nodos IFC + snap CAD (8 tipos)

### Mapeo de Coordenadas

Los segmentos del corte son Vector3 en 3D. El CAD trabaja en 2D.

| Eje corte | CAD.x = | CAD.y = |
|-----------|---------|---------|
| Z | World.X | World.Y |
| X | World.Z | World.Y |
| Y | World.X | World.Z |

### Fases de Implementacion

#### Fase 1: Copiar y adaptar
- Crear `ifc/js/cad/`
- Copiar 10 archivos con prefijo `cad-`
- Convertir ES6 imports → globales `CAD.*`
- Agregar `<canvas id="cadCanvas">` oculto
- Script tags en ifc-cli.html

#### Fase 2: Puente corte2d → CAD
- `_sectionActivateCAD()`: muestra canvas, importa segmentos, activa snap
- `_sectionDeactivateCAD()`: oculta canvas, guarda estado
- Sincronizar zoom/pan entre Three.js y Canvas 2D

#### Fase 3: Comandos integrados
- Registrar comandos CAD en ifc-commands.js
- Teclas rapidas en modo seccion (L, D, R, C, etc.)
- Reemplazar mini-CAD actual con CAD completo

#### Fase 4: Export
- `sexport svg` → SVG del corte + dibujos
- `sexport cpd` → Calcpad con geometria y cotas

### Resultado Final
```
corte2d z -9.29 #3428     → Genera corte, activa CAD overlay
L                          → Modo linea con 8 tipos de snap
D                          → Modo cota con flechas y texto
R                          → Rectangulo
C                          → Circulo
Ctrl+Z                     → Deshacer
sexport svg                → Exportar todo a SVG
Esc                        → Salir, restaurar 3D
```

---

## Historial de Versiones

### v70 — Corte 2D basico
- Interseccion plano-triangulo
- LineSegments + Points
- Snap a nodos (endpoint only)
- Mini-CAD: slinea, sdim, smedir, sborrar, snodos

### v71 — Propagacion multi-pasada
- srampa: multi-pass vertex propagation
- Si 2/3 vertices en rampa, mover el 3ro

### v72 — Tolerancia aumentada
- onRamp tolerance 0.005 → 0.02 (2cm)

### v73-v74 — Rediseno srampa
- Linea de narices + paralela inferior
- Auto-deteccion de espesor (dist vertical minima)
- Click en narices en vez de puntos arbitrarios

### v75 — Rango extendido
- Rango de modificacion cubre todo el mesh (hExt1→hExt2)
- 113 vertices movidos, 9 pasadas propagacion

### v76 — Limitar al descanso
- Rango limitado: izquierda extendida, derecha hasta P2
- Descanso (landing) no se modifica

### v77 — Rango estricto + preview + undo
- Rango estrictamente P1→P2 (sin extension)
- Preview: `srampa` dibuja lineas sin modificar
- `saplicar`: ejecuta la modificacion
- `sundo`: restaura posiciones originales (backup)
- Registrado `saplicar`/`sapply`, `sundo`/`sdeshacer`

---

## Archivos Actuales

### Visor IFC
| Archivo | Version | Funcion |
|---------|---------|---------|
| `ifc/ifc-cli.html` | v77/v23 | HTML principal, cache bust |
| `ifc/js/ifc-three.js` | v77 | Rendering, corte2d, srampa, snap |
| `ifc/js/ifc-commands.js` | v23 | Dispatcher de comandos |
| `ifc/js/ifc-state.js` | v20 | Estado global S |
| `ifc/js/ifc-core.js` | v20 | Operaciones sobre meshes |
| `ifc/js/ifc-viewport.js` | v20 | Camara ortho/persp |
| `ifc/js/ifc-ui.js` | v20 | Actualizaciones DOM |
| + 6 archivos mas | v20 | Parser, extractors, levels, persist, report, merge, io |

### CAD CLI (a copiar)
| Archivo origen | Destino | Adaptacion |
|---------------|---------|------------|
| `doc/cad/cli.js` | `ifc/js/cad/cad-cli.js` | Namespace CAD.*, registrar en ifc-commands |
| `doc/cad/state.js` | `ifc/js/cad/cad-state.js` | Renombrar vars, evitar colision con S |
| `doc/cad/snap.js` | `ifc/js/cad/cad-snap.js` | Agregar snap a nodos IFC |
| `doc/cad/render.js` | `ifc/js/cad/cad-render.js` | Renderizar en cadCanvas overlay |
| `doc/cad/input.js` | `ifc/js/cad/cad-input.js` | Compartir eventos con visor |
| `doc/cad/export.js` | `ifc/js/cad/cad-export.js` | Copiar |
| `doc/cad/math.js` | `ifc/js/cad/cad-math.js` | Copiar |
| `doc/cad/dom.js` | `ifc/js/cad/cad-dom.js` | Reescribir para IFC DOM |
| `doc/cad/projection.js` | `ifc/js/cad/cad-projection.js` | Adaptar mapeo corte→2D |
| `doc/cad/history.js` | `ifc/js/cad/cad-history.js` | Copiar |

---

## Pendiente
- [x] corte2d: interseccion plano-triangulo
- [x] Snap a nodos (endpoint)
- [x] Mini-CAD: slinea, sdim, smedir
- [x] srampa: preview + aplicar + undo
- [x] **Fase 1**: Copiar CAD CLI a ifc/js/cad/, convertir modules
- [x] **Fase 2**: Canvas overlay + puente corte2d→CAD
- [x] **Fase 3**: Comandos integrados (L, D, R, C, etc.)
- [x] **Fase 4**: Export SVG/CPD (sexport svg / sexport cpd)
- [ ] Cotas automaticas de peldanos
- [ ] Acotado de pendiente
- [ ] Probar integracion completa en navegador

---

## Detalle Implementacion Fases 1-4

### Fase 1: Completada
- 10 archivos copiados a `ifc/js/cad/` con prefijo `cad-`
- ES6 modules convertidos a globales `CAD.*`
- Script tags agregados en `ifc-cli.html` (lineas 466-477)

### Fase 2: Completada
- Canvas overlay `#cadOverlay` con `#lienzo` en `ifc-cli.html`
- CSS: `z-index:15`, `pointer-events:none` → `:auto` cuando `.active`
- `activateCAD()` / `deactivateCAD()` en `ifc-cli.html`
- `_sectionActivateCAD()` en `ifc-three.js`: importa segmentos como lineas CAD, mapea 3D→2D
- Escala: 1m IFC = 100 unidades CAD (cm)
- Nodos IFC importados como snap endpoints via `CAD.addSectionNodes()`

### Fase 3: Completada
- `ifc-commands.js`: `default:` case reenvía a `cad.exec()` cuando `_cadActive`
- Comandos CAD disponibles: L, R, C, D, E, A, PL, move, copy, mirror, etc.
- `cad-cli.js`: `CAD.initCLI()` simplificado (sin listeners duplicados)
- Help muestra comandos CAD disponibles
- Snap IFC desactivado cuando CAD activo (`_sectionSnapDisable()`)
- OrbitControls desactivado cuando CAD activo (`S.controls.enabled=false`)
- Al desactivar CAD: restaura controles + re-activa snap seccion

### Fase 4: Completada
- `sexport svg` → descarga SVG con segmentos seccion + dibujos usuario
- `sexport cpd` → descarga Calcpad CPD

### Archivos Modificados (Fases 1-4)
| Archivo | Cambio |
|---------|--------|
| `ifc/ifc-cli.html` | Canvas overlay, script tags, activateCAD/deactivateCAD |
| `ifc/js/ifc-commands.js` | CAD help, cad2d case, sexport case, default→cad forwarding |
| `ifc/js/ifc-three.js` | _sectionActivateCAD(), exponer snap fns en S |
| `ifc/js/ifc-io.js` | Exponer S via `window.ifc._state` |
| `ifc/js/cad/cad-snap.js` | CAD.addSectionNodes(), CAD.clearSectionNodes() |
| `ifc/js/cad/cad-cli.js` | CAD.initCLI() simplificado |

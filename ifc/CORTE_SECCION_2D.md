# Corte de Seccion 2D - Documentacion

## Resumen
Sistema de corte 2D por plano que intersecta triangulos de meshes IFC y genera
una vista tecnica limpia con nodos snap y mini-CAD integrado.

## Archivos Modificados
- `ifc/js/ifc-three.js` — Funciones principales (v70)
- `ifc/js/ifc-commands.js` — Registro de comandos (v22)
- `ifc/ifc-cli.html` — Cache bust version

## Comando Principal
```
corte2d z -9.29 #3428    → Corte en plano Z, solo mesh #3428
corte2d x -10.5           → Corte en plano X, todos los meshes
corte2d y 1.0 #100 #200   → Corte en plano Y, meshes #100 y #200
```

## Funciones en ifc-three.js

### sectionCut2D(args)
Funcion principal. Flujo:
1. Parsea eje (x/y/z), valor del plano, IDs opcionales
2. Guarda camara/bg ANTES de limpiar (`_origCamPos`, etc.)
3. Llama `_sectionCutCleanup()` para limpiar corte anterior
4. Recopila meshes visibles (filtrados por ID si hay)
5. Para cada triangulo de cada mesh:
   - Transforma vertices a mundo con `matrixWorld`
   - Clasifica vertices como above/below del plano
   - Si hay vertices a ambos lados: interpola interseccion en aristas
   - Genera segmento de interseccion (2 puntos)
6. Crea `THREE.LineSegments` con todos los segmentos (color 0x111111)
7. Crea nodos unicos (`THREE.Points`, color rojo, size 3) en vertices de interseccion
8. Guarda nodos en `S._sectionNodes[]` para snap
9. Oculta TODO en la escena excepto las lineas de corte
10. Fondo blanco, camara ajustada por FOV/aspect/bounding box
11. Activa snap handler con `_sectionSnapEnable(axis)`

### _sectionCutCleanup()
Limpia todo el estado de seccion:
- Desactiva snap handler (`_sectionSnapDisable()`)
- Remueve objetos con `userData._sectionCut` (dispose geometria/material)
- Limpia `S._sectionNodes`, `S._sectionSegments`, `S._sectionDrawings`
- Remueve `S._secSnapMarker`
- Restaura visibilidad de todos los objetos ocultos
- Restaura grid, axes, background, camara

### _sectionSnapEnable(axis) / _sectionSnapDisable()
Snap handler para la vista de seccion:
- `mousemove`: Proyecta todos los nodos a pantalla, busca el mas cercano al cursor
- Umbral: 0.04 en NDC (~20px)
- Muestra marcador verde (`S._secSnapMarker`, esfera r=0.008) sobre el nodo
- Tooltip con coordenadas segun el eje del corte
- `click`: Si hay comando pendiente (`_secSnapPending`), captura puntos P1/P2

### _sectionDrawLine(p1, p2, color, lw)
Dibuja una linea sobre la vista de seccion como `THREE.LineSegments`.
Marcada con `userData._sectionDrawing = true`.

### _sectionDrawDim(p1, p2, dist)
Dibuja cota (dimension) usando un `THREE.Sprite` con canvas de texto.
Posicionado en el punto medio con offset perpendicular.

### sectionCAD(args)
Mini-CAD para la vista de seccion. Comandos:

| Comando | Alias | Descripcion |
|---------|-------|-------------|
| `slinea` | `sline` | Dibujar linea entre 2 nodos (click-click) |
| `sdim` | `scota` | Medir y anotar distancia entre 2 nodos |
| `smedir` | `smeasure` | Medir distancia (solo consola, sin dibujar) |
| `sborrar` | `sclear` | Borrar todos los dibujos del usuario |
| `snodos` | `snodes` | Listar todos los nodos con coordenadas |
| `srampa` | `sramp` | Trazar linea de narices → genera paralela inferior y modifica mesh |
| `srampa 0.15` | `sramp 0.15` | Igual pero con espesor de losa explicito (0.15m) |

## Estado Global (S.*)

| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `S._sectionState` | Object | {bgColor, hidden[], gridWas, axesWas, camPos, camTarget} |
| `S._sectionNodes` | Vector3[] | Nodos unicos de interseccion (para snap) |
| `S._sectionSegments` | Array | Pares [p1,p2] de segmentos de interseccion |
| `S._sectionDrawings` | Object3D[] | Lineas/cotas dibujadas por el usuario |
| `S._sectionAxis` | String | "x", "y", o "z" |
| `S._sectionPlane` | Number | Valor del plano de corte |
| `S._secSnapMarker` | Mesh | Esfera verde de snap (r=0.008) |
| `S._secSnapCurrent` | Vector3 | Nodo actualmente snapeado |
| `S._sectionFilterIds` | Number[] | IDs de meshes filtrados (para srampa) |

## Geometria de Escalera #3428
- Bounding box: X=[-11.359,-7.949], Y=[0.200,3.515], Z=[-11.640,-8.740]
- Escalera avanza en X, Z es el ancho (~1.1m)
- Peldanos Z: -9.84 a -8.74
- Mejor plano para perfil: **Z=-9.29** (79 segmentos)
- Seccion transversal: **X=-10.5** (47 segmentos)

## CAD CLI Existente
Ubicacion: `Calcpad.Wpf/doc/cad/`
- 18 archivos JS (ES modules), arquitectura 8 capas
- `cli.js` — API programatica: `cad.line()`, `cad.rect()`, `cad.dim()`, etc.
- `snap.js` — 8 tipos de snap (endpoint, midpoint, center, quadrant, intersection, perpendicular, nearest, extension)
- `render.js` — Canvas 2D rendering
- `export.js` — Export SVG y Calcpad
- Sistema completo estilo AutoCAD con undo/redo, arrays, mirror, etc.

### Integracion Futura CAD CLI ↔ Corte Seccion
- Los segmentos del corte se pueden exportar como polylines al formato del CAD
- El snap del CAD (8 tipos) es mucho mas completo que el snap del visor IFC
- Posible workflow: corte2d → exportar a CAD → editar con todas las herramientas → re-importar

## srampa — Algoritmo (v77)

### Concepto
El usuario traza la **linea de narices** (2 clicks en las puntas de peldanos).
El sistema calcula una **paralela inferior** a distancia = espesor de losa.
Vertices del mesh debajo de la paralela se mueven a ella, **solo entre P1 y P2**.
Zonas fuera de los clicks (descanso, base) NO se modifican.
Se guarda backup de posiciones para `sundo`.

### Flujo
1. `srampa` o `srampa 0.15` (espesor explicito en metros)
2. Click en nariz del primer peldano (P1)
3. Click en nariz del ultimo peldano (P2)
4. Auto-deteccion de espesor: minima distancia vertical desde linea de narices
   hasta cualquier vertice debajo (excluyendo extremos)
5. Paralela inferior: desplazar linea de narices hacia abajo por espesor/cos(angulo)
6. Backup: se guardan posiciones originales en `S._rampBackup`
7. Rango de modificacion: estrictamente h1 → h2 (narices clickeadas)
8. Pasada 1: mover vertices debajo de la paralela (+ tolerancia 2cm)
9. Pasada 2: propagacion por triangulos (si 2/3 vertices en rampa, mover el 3ro)
   Hasta 10 pasadas iterativas
10. Regenerar corte de seccion con los mismos filterIds

### sundo — Deshacer rampa
Restaura las posiciones originales del mesh desde `S._rampBackup` y regenera el corte.
Permite comparar antes/despues sin recargar el IFC.

### Resultado esperado
- Zona inclinada (P1-P2): peldanos escalonados arriba, linea diagonal recta abajo
- Zonas fuera de P1-P2: geometria original sin modificar
- Linea gris dibujada = linea de narices (P1 a P2)
- Linea azul dibujada = paralela inferior (fondo de losa inclinada)

### Ejemplo
```
corte2d z -9.29 #3428          → Perfil de escalera (79 segmentos, 79 nodos)
srampa                         → Click nariz1, click nariz8
                                 Espesor auto: 15.4cm, pendiente 31°
                                 Resultado: fondo de losa recto entre narices
sundo                          → Restaurar geometria original
```

## Pendiente
- [x] `srampa`: Trazar linea de narices → paralela inferior → modificar mesh
- [ ] Integrar exportacion de corte al CAD CLI (format JSON)
- [ ] Cotas automaticas de peldanos (huella/contrahuella)
- [ ] Acotado de pendiente (angulo + porcentaje)

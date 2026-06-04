# Hekatan Struct en Calcpad puro — librería de funciones `#def`

> Documentación completa de la sesión. Replicar la interfaz gráfica de **awatif / Hekatan
> Struct** (modelo 3D orbitable, shell results, frame results, contornos 2D, hover con valores)
> **dentro de Calcpad WPF**, sin modificar el código fuente de Calcpad ni de Hekatan — usando
> **únicamente archivos `.cpd` con macros `#def`** incluidos vía `#include`.

---

## 0. Idea central

```
#include hekatan_lib.cpd        ← engine FEM (deform.wasm) embebido + macros de modelado
#val
hekatan_begin$(id)              ← abre <div> + <script>, carga el solver
hk_mesa$(6; 6; 4; 5; ...)       ← construye el modelo (geometría, secciones, cargas, apoyos)
hekatan_end3d_results$(id)      ← resuelve con el WASM y dibuja el viewer interactivo
#equ
```

Calcpad expande los `#def`, emite HTML+JS, y el **WebView2 (Chromium)** del WPF ejecuta el
script: descomprime el WASM, resuelve el FEM y renderiza el viewer 3D/2D. Todo el cómputo es
el **solver real `deform.wasm` de Hekatan Struct**, embebido en el `.cpd`.

---

## 1. Arquitectura

| Pieza | Qué hace |
|---|---|
| `hekatan_begin$(id)` | Emite `<div id>` + `<script>` que abre una IIFE `async`, descomprime y carga `deform.wasm` (engine). |
| Macros de modelado | Pueblan `nodes`, `elements`, `supdat`, `loaddat`, `mat`, `self.emat` (estado **local a la IIFE**). |
| `hekatan_end*$(id)` | Marshalling a `mod._deform(...)`, recoge desplazamientos/reacciones, y renderiza. |

- El **engine** (`deform.js` glue + `deform.wasm`, ~715 KB) va **gzip + base64** embebido en
  el `.cpd` (~422 KB) y se descomprime en runtime con `DecompressionStream("gzip")`.
- Cada par `begin…end` corre en su **propia IIFE** → el estado (`nodes`, `U6`, `SH`, `FF`…)
  es **local**, así que se pueden poner **varios viewers en una misma hoja sin colisión**.

### Generador

Todo `hekatan_lib.cpd` se genera con:

```
hekatan-struct/hekatan-fem/src/cpp/built/gen_hekatan_cpd.py
```

Lee `deform.js` + `deform.wasm`, los gzipea+base64, y ensambla los macros. Salida:

```
calcpad-draw/hekatan_lib.cpd   (422.882 bytes)
```

---

## 2. Macros de modelado

| Macro | Firma | Uso |
|---|---|---|
| `hk_material$` | `(E; A; I; G; J)` | material de frames genérico |
| `hk_node$` | `(i; x; y; z)` | nodo i |
| `hk_elem$` | `(i; n1; n2)` | frame i (2 nodos) |
| `hk_support$` | `(n)` | empotrar nodo n |
| `hk_load$` | `(n; fx; fy; fz)` | carga nodal |
| `hk_plate_material$` | `(E; nu; t; plate)` | material de shells |
| `hk_shell$` | `(i; n1; n2; n3; n4)` | shell Q4 i |
| `hk_plate_ss$` | `(a; N; E; nu; t; q)` | placa NxN simplemente apoyada (benchmark Kirchhoff) |
| **`hk_mesa$`** | `(Lx; Ly; H; nMesh; E; nu; tLosa; bCol; hCol; bViga; hViga; q)` | **mesa a torsión** |

### `hk_mesa$` — parámetros (números literales en SI)

| # | Parámetro | Unidad | Ejemplo |
|---|---|---|---|
| 1 | `Lx` largo losa en X | m | 6 |
| 2 | `Ly` largo losa en Y | m | 6 |
| 3 | `H` altura columnas | m | 4 |
| 4 | `nMesh` divisiones (nMesh² shells) | — | 5 |
| 5 | `E` módulo de elasticidad | Pa | 24.85e9 |
| 6 | `nu` Poisson | — | 0.20 |
| 7 | `tLosa` espesor losa | m | 0.10 |
| 8 | `bCol` ancho columna | m | 0.40 |
| 9 | `hCol` peralte columna | m | 0.40 |
| 10 | `bViga` ancho viga | m | 0.30 |
| 11 | `hViga` peralte viga | m | 0.50 |
| 12 | `q` carga vertical losa | N/m² | 6000 |

Construye: 4 nodos base (z=0) + losa (nMesh+1)² nodos (z=H), `nMesh²` shells, 4 columnas,
vigas perimetrales subdivididas, apoyos empotrados en la base, carga `q` consistente.
**Secciones por elemento** (`self.emat`): columnas `bCol×hCol`, vigas `bViga×hViga`, con
`Iz`/`Iy` separados (eje fuerte/débil) y `J` de Saint-Venant (Roark, cubo del lado corto).

---

## 3. Macros de visualización (`hekatan_end*`)

| Macro | Motor | Qué muestra | Interactivo |
|---|---|---|---|
| `hekatan_end$` | SVG | deformada 2D (frames) o contorno banda (shells, estilo Mathcad) | — |
| `hekatan_end3d$` | Three.js r145 | modelo 3D orbitable estilo awatif, deformada + colormap uz | orbit |
| `hekatan_end3d_plotly$` | Plotly mesh3d | superficie 3D con **barra de color + hover automáticos** | orbit + hover |
| `hekatan_end3d_forces$` | Three.js | diagramas de fuerzas internas de frames (N/Vy/Vz/T/My/Mz) + tabla | selector |
| **`hekatan_end3d_results$`** | Three.js | **viewer COMPLETO Hekatan Struct** (ver abajo) | todo |
| **`hekatan_end2d$`** | canvas puro | **planta 2D de la losa** (offline, sin CDN) | selector + hover |

### `hekatan_end3d_results$` — viewer completo

- **Selector** agrupado: *Shell results* (uz, von Mises, Mxx, Myy, Mxy) + *Frame results*
  (N, Vy, Vz, T, My, Mz).
- **Shells**: malla coloreada (jet) + **barra de color** + etiquetas de **máx (rojo) /
  mín (azul) / cero (verde)** con sus valores.
- **Frames**: diagramas de cinta 3D coloreados por tipo, con etiquetas máx/mín/cero (incluido
  el punto de momento nulo interpolado).
- **Tooltip al pasar el cursor** (raycasting): shells por interpolación baricéntrica del
  triángulo, frames por proyección sobre el eje del elemento.
- **Toggle "deformada"**: redibuja toda la geometría sobre `nodo + U·escala`.
- **Tabla** de fuerzas internas de los 24 frames (N,V en kN; T,M en kNm; valores en i / j).

### `hekatan_end2d$` — planta 2D (canvas puro, offline)

- **Sin Three.js ni CDN** → carga instantánea y funciona sin internet.
- Raster de la losa por **interpolación bilineal** del campo nodal + colormap jet.
- **Líneas de contorno** (marching squares) con su valor escrito (estilo Mathcad).
- Marcadores **máx/mín/cero** + **barra de color**.
- **Hover**: crosshair + tooltip con valor interpolado **y coordenadas** `@(x,y)`.

---

## 4. El solver real embebido (`deform.wasm`)

Port a JS del marshalling de `deformCpp.ts` (60 args, NO 63 — sin rigidOffsets):

```
mod._deform(nodes, elements, elemSizes, supports(k/v/len), loads(k/v/len),
  elasticities, areas, moiZ, moiY, shearMod, torsion, thickness, poisson,
  elasticitiesOrthogonal, shearAreasY, shearAreasZ, springs, plateForm,
  drillType, drillScale, dOut, dSz, rOut, rSz)
```

Salida: `deformations` (7 floats/nodo: idx, ux, uy, uz, rx, ry, rz) + `reactions`.

### Post-proceso portado de Hekatan (`analyze.ts`)

- **Frame forces**: `fLocal = K_local(12×12) · T · u_global` (Timoshenko + transformación con
  caso especial para columnas verticales n=±1). Da N, Vy, Vz, T, My, Mz en ambos extremos.
- **Shell stress recovery** (`computeQ4ShellStresses`): 2×2 puntos de Gauss interiores +
  **extrapolación bilineal a los nodos** (estilo CSI / SAP-ETABS), promediado inter-elemento.
  Da Mxx, Myy, Mxy, von Mises por nodo.

---

## 5. Validación física (mesa 6×6, q=6 kN/m²)

| Resultado | Valor | Verificación |
|---|---|---|
| Axial por columna | **−54 kN** | 6·36 = 216 kN ÷ 4 = 54 kN **exacto** ✓ |
| uz máx (losa) | −7.29 mm | centro de la losa |
| Mxx (shell) | 5.13 / −3.04 kNm/m | máx centro |
| Mxy (torsor losa) | ±1.96 kNm/m | efecto torsor |
| My viga (eje fuerte) | 34.7 kNm | flexión vertical |
| T viga (torsión) | 14.3 kNm | **núcleo de la "mesa a torsión"** |
| von Mises | 3.14 / 0.92 MPa | — |

Geometría: 40 nodos (4 base + 36 losa), 49 elementos (25 shells + 4 columnas + 20 vigas).

Refinamiento `Iz`/`Iy` separados: columnas cuadradas iguales; vigas 0.30×0.50 con eje fuerte
`Iy = b·h³/12` (flexión vertical) y eje débil `Iz = h·b³/12` (flexión lateral, ahora más
flexible). My y T se mantienen; Mz débil baja (correcto).

---

## 6. Gotchas técnicos (REGLAS para escribir `#def` con JS embebido)

1. **Calcpad colapsa todo el JS a UNA sola línea** (`.replace("\n","")`).
   → **NUNCA usar comentarios `//`** (comentarían el resto del script → `SyntaxError:
   Unexpected end of input`). Usar **`/* */`**. Las URLs `https://` dentro de strings son OK.
2. **Calcpad escapa `\"` y `""` a `&quot;`** → rompe el JS. Para strings con comillas usar
   **template literals con backticks** `` `...` ``. Chequear siempre `grep -c "&quot;"` = 0.
3. **Notación científica en toggle-eval rompe** (`2.1e11` → "Error in 2.1e11"). Pasar los
   args como **substitución de texto plana** (números literales), no como variable evaluada.
4. **WebView2 (null-origin) bloquea módulos ES** (`import`, importmap). → Three.js debe ser el
   **build UMD clásico r0.145** (`<script src>`), no las versiones solo-ESM.
5. **Block `#def` emite líneas literales numeradas** → usar siempre la forma **inline**
   `#def name$(args) = '...'`.
6. **Engine por `eval`**: `deform.js` tiene `import.meta` (×3) e `import()`. Neutralizar
   `import.meta` → `({url:"https://localhost/x.js"})` y `export default Module;` →
   `;self.__hekModule=Module;`, luego `eval`. (El `import(blob:)` está bloqueado en el WPF.)
7. **Placeholder único** para el id: usar `__ID__` (no `"ID"`, que aparece en el alfabeto
   base64 y corrompería el gzip).
8. **Loop de animación** (`requestAnimationFrame`) bloquea la captura CDP de screenshots; la
   captura del WPF se hace con **`PrintWindow` (flag 2 = PW_RENDERFULLCONTENT)**, que toma la
   ventana aunque no tenga foco (hay foreground-lock por sesiones concurrentes).

---

## 7. Verificación / herramientas

- **CLI**: usar el build del repo `Calcpad/Calcpad.Cli/bin/Release/net10.0/Cli.exe`
  (el instalado en `C:\Program Files\Calcpad\Cli.exe` está roto — falta runtime .NET 10 x64).
  `Cli.exe archivo.cpd html -s`
- **Validar JS**: extraer el `<script>` del HTML y `node --check`.
- **Chequear escaping**: `grep -c "&quot;"` debe dar 0.
- **WPF**: `Calcpad/Calcpad.Wpf/bin/Release/net10.0-windows/Calcpad.exe archivo.cpd`.

---

## 8. Archivos

### Librería y generador
- `calcpad-draw/hekatan_lib.cpd` — **librería principal** (engine + 7 macros `hekatan_end*`).
- `hekatan-struct/hekatan-fem/src/cpp/built/gen_hekatan_cpd.py` — **generador**.

### Ejemplos
- `mesa_torsion_3d.cpd` — viewer 3D (Three.js) + leyenda de parámetros de `hk_mesa`.
- `mesa_torsion_plotly.cpd` — alternativa Plotly mesh3d.
- `mesa_torsion_forces.cpd` — diagramas de fuerzas de frames + tabla.
- `mesa_torsion_results.cpd` — viewer completo (shell+frame, hover, deformada).
- `mesa_torsion_2d.cpd` — planta 2D interactiva (canvas puro).
- **`mesa_torsion_3d2d.cpd`** — **3D (WASM) arriba + 2D (Calcpad) abajo**, ambos con cursor.

### Otras librerías `#def` (replican Calcpad-Symbolic, portables)
- `draw_lib.cpd` (`$Draw` 2D), `three_draw.cpd` (3D), `web_lib.cpd` (`#plotly`, `#chart`),
  `struct_lib.cpd`, `fem_lib.cpd` (malla/contorno FEM colormap Rainbow), `python_lib.cpd`
  (Pyodide: Python, matplotlib, SymPy CAS vía `#include`).

---

## 9. Alternativas 3D evaluadas (como `#def`)

Requisito: build **UMD/script clásico** (por el null-origin del WPF).

| Librería | Global | Fuerte en | Estado |
|---|---|---|---|
| **Three.js r145** | `THREE` | modelo estructural, control fino | ✅ usado |
| **Plotly.js** | `Plotly` | surface/mesh3d + colorbar + hover automáticos | ✅ usado |
| ECharts-GL | `echarts` | surface3D + visualMap (jet + leyenda) | candidato |
| Babylon.js | `BABYLON` | motor completo (PBR, picking, GUI) | candidato |
| vis.js Graph3d / Zdog / x3dom | varios | ligeros / declarativos | candidatos |
| VTK.js | (ESM) | FEM serio — requiere embeber/neutralizar como `deform.js` | riesgoso |
| **SVG isométrico** (`fem_lib`) | — | **único 100% offline (Calcpad puro)** | disponible |

---

## 10. Pendiente

- **Periodos modales vs ETABS** (T1=T2=0.343 s, T3=0.288 s torsión Rz) → embeber `modal.wasm`
  + marshalling de `modalAnalysis` (autovalores).
- Validación fina de momentos vs ETABS (picks por combinación de carga).
- Promediado por centroides vecinos (2º stage de `analyze.ts`) para igualar shell results al pixel.

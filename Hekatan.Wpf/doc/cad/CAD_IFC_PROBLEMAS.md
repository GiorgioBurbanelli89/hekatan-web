# Hekatan CAD+IFC - Problemas y Estado Actual

## Arquitectura

**Directorio:** `Hekatan.Wpf/doc/cad/`

**15 archivos JS (ES modules):**
| Capa | Archivo | Funcion |
|------|---------|---------|
| L0 | `state.js` | Estado centralizado, `set(key,val)`, Three.js refs |
| L1 | `math.js` | toPx, toU, F, D - conversion unidades |
| L2 | `dom.js` | initDOM, refs a elementos del DOM |
| L3 | `render.js` | redraw() - dibuja 2D canvas |
| L4 | `history.js` | saveHist, undo |
| L4 | `snap.js` | snapping geometrico |
| L5 | `panels.js` | updTree, selectShape, showProps |
| L5 | `projection.js` | proyeccion 2D front/side |
| L5 | `export.js` | genCpd, genSVG |
| L6 | `input.js` | eventos mouse, teclado, hitTest, zoomFit |
| L6 | `dynamic-input.js` | input flotante tipo AutoCAD |
| L6 | `three-view.js` | initThree, switchTo3D, syncThreeShapes |
| L7 | `app.js` | Init principal, toolbar, toggles |
| L7b | `cli.js` | CAD API completa (window.cad) + CLI panel |
| L8 | `ifc-viewer.js` | **NUEVO** - Visor IFC en Three.js |

**Dependencias externas (CDN):**
- Three.js r128 (UMD) + OrbitControls
- web-ifc 0.0.66 (IIFE) - WASM para parseo IFC

**Punto de entrada:** `index.html` carga `app.js` como `<script type="module">`

---

## Estado de Implementacion

### Completado
- [x] `ifc-viewer.js` creado (~550 lineas)
  - Carga IFC via web-ifc WASM → geometria Three.js
  - Parser texto ISO-10303-21 para metadata
  - Panel lateral: info, arbol de tipos, toggle visibilidad
  - Comandos CLI: load, meta, types, stats, hide/show, fit, view, entity, clear
  - Drag & drop de archivos .ifc
  - API en `window.ifc` y bridge `window._ifcExec`
- [x] `index.html` modificado: CDN web-ifc, boton IFC toolbar, panel IFC sidebar
- [x] `app.js` modificado: import initIFC, bindCollapse, call initIFC()
- [x] `cli.js` modificado: comando `ifc` ruteado via `window._ifcExec`, help actualizado
- [x] `cad.css` modificado: `.tree-item.dim { opacity: 0.4; }`

### NO Probado
- [ ] Carga real de archivo IFC en el navegador
- [ ] WASM de web-ifc (inicializacion `IfcAPI.Init()`)
- [ ] Renderizado de geometria IFC en Three.js
- [ ] Coexistencia CAD shapes + IFC model en misma escena 3D
- [ ] Toggle visibilidad por tipo IFC
- [ ] Drag & drop
- [ ] Comandos IFC desde CLI
- [ ] Panel IFC interactivo

---

## Problemas Conocidos y Potenciales

### P1: ES Modules requieren servidor HTTP
**Severidad:** CRITICA
**Detalle:** `<script type="module">` no funciona con `file://` por CORS.
**Solucion:** Abrir con `python -m http.server 8080` o cualquier servidor local.
**Estado:** Conocido, no es bug sino requisito.

### P2: web-ifc WASM puede fallar al inicializar
**Severidad:** ALTA
**Detalle:** `IfcAPI.Init()` necesita descargar y compilar `web-ifc.wasm` (~1.5MB). Si la CDN falla o hay timeout, la carga IFC no funciona. El script tiene `onerror` en el `<script>` tag pero no maneja el caso donde el JS carga pero el WASM no.
**Posible fix:** Verificar `WebIFC.IfcAPI` existe antes de `new WebIFC.IfcAPI()`. Agregar try/catch mas robusto en `loadIfcBuffer()`.

### P3: ensure3D() puede fallar si Three.js no esta listo
**Severidad:** ALTA
**Detalle:** `ensure3D()` en ifc-viewer.js llama a `switchTo3D()` pero no espera a que Three.js se inicialice completamente. Si `initThree()` (en three-view.js) falla o no ha creado `S.threeScene`, la geometria IFC se agrega a `null`.
**Posible fix:** Agregar verificacion: `if(!S.threeScene) { log("ERROR: 3D scene not available"); return; }` antes de `S.threeScene.add(modelGroup)`.

### P4: Extraccion de vertices web-ifc puede tener formato incorrecto
**Severidad:** MEDIA
**Detalle:** El codigo asume `vData` tiene formato `[x,y,z,nx,ny,nz, x,y,z,nx,ny,nz, ...]` (6 floats por vertice), pero versiones diferentes de web-ifc pueden usar formato diferente. La linea:
```js
vertices[k/6*3] = vData[k];      // x
vertices[k/6*3+1] = vData[k+1];  // y
vertices[k/6*3+2] = vData[k+2];  // z
```
necesita verificarse con la version 0.0.66 especifica.
**Posible fix:** Verificar el `GetVertexDataSize()` y calcular stride dinamicamente.

### P5: Emojis en panel IFC (visibility toggle)
**Severidad:** BAJA
**Detalle:** El arbol IFC usa `&#128065;` (ojo) y `&#128064;` (ojos) como iconos de visibilidad. Estos emojis pueden no renderizarse bien en todas las plataformas (especialmente WPF WebView2).
**Posible fix:** Reemplazar con SVG icons como los del arbol CAD existente.

### P6: No hay luces adecuadas para IFC
**Severidad:** MEDIA
**Detalle:** Se agregan AmbientLight(0.5) y DirectionalLight(0.8) pero no hay HemisphereLight ni sombras. Modelos arquitectonicos pueden verse planos.
**Posible fix:** Agregar HemisphereLight y/o ajustar intensidades.

### P7: Camera no se adapta bien a escala IFC
**Severidad:** MEDIA
**Detalle:** Los modelos IFC usan metros como unidad. La camara CAD usa pixeles/cm. `fitIfcView()` calcula bounding box pero el far plane de la camara (en three-view.js `initThree()`) puede ser muy corto para edificios grandes.
**Posible fix:** En `fitIfcView()` ajustar `camera.far` basado en el tamano del modelo.

### P8: Memoria - No se liberan recursos al limpiar
**Severidad:** MEDIA
**Detalle:** `clearIfc()` hace dispose de geometrias y materiales, pero no llama `ifcAPI.CloseModel()` porque la API se pierde despues de `loadIfcBuffer`. El `ifcAPI` es local a esa funcion.
**Posible fix:** Guardar referencia a `ifcAPI` en el modulo para poder cerrar el modelo despues.

### P9: Version string desactualizada
**Severidad:** BAJA
**Detalle:** `app.js` linea 24 muestra `"v0.7"` en flash(), pero el console.log dice `"v0.8"`.
**Posible fix:** Unificar a `"v0.8"` o crear constante de version.

### P10: Archivos IFC grandes (>100MB) pueden congelar el navegador
**Severidad:** MEDIA
**Detalle:** `loadIfcBuffer()` es async pero el parseo de texto (`parseIfcText`) es sincrono y usa regex sobre el buffer completo. Para archivos grandes esto bloquea el UI thread.
**Posible fix:** Mover parseo de texto a Web Worker, o hacerlo lazy (solo parsear al pedir `ifc meta`/`ifc entity`).

---

## Archivos Modificados (diff vs upstream)

| Archivo | Tipo cambio | Lineas |
|---------|------------|--------|
| `ifc-viewer.js` | NUEVO | 552 |
| `index.html` | Modificado | +15 lineas (CDN, boton, panel) |
| `app.js` | Modificado | +4 lineas (import, collapse, init) |
| `cli.js` | Modificado | +8 lineas (ifc cmd, help) |
| `cad.css` | Modificado | +1 linea (.tree-item.dim) |

---

## Prompt para Continuar

```
Estoy continuando el desarrollo de Hekatan CAD+IFC.

CONTEXTO:
- Directorio: Hekatan.Wpf/doc/cad/
- Arquitectura: 15 archivos JS como ES modules
- Se creo ifc-viewer.js (L8) que integra web-ifc con Three.js
- index.html, app.js, cli.js y cad.css ya fueron modificados
- La integracion CAD+IFC NO HA SIDO PROBADA en el navegador

LEE PRIMERO estos archivos para entender el estado actual:
1. Hekatan.Wpf/doc/cad/CAD_IFC_PROBLEMAS.md (este archivo)
2. Hekatan.Wpf/doc/cad/ifc-viewer.js (modulo IFC completo)
3. Hekatan.Wpf/doc/cad/index.html (HTML con CDN web-ifc)
4. Hekatan.Wpf/doc/cad/app.js (init principal)
5. Hekatan.Wpf/doc/cad/cli.js (CLI con comando ifc)
6. Hekatan.Wpf/doc/cad/three-view.js (Three.js scene)
7. Hekatan.Wpf/doc/cad/state.js (estado compartido)

PROBLEMAS PRIORITARIOS A RESOLVER:
1. P3: ensure3D() puede crashear si Three.js no esta listo
2. P2: web-ifc WASM init necesita mejor manejo de errores
3. P4: Verificar formato vertices web-ifc 0.0.66
4. P7: Camera far plane puede ser muy corto para IFC
5. P8: ifcAPI no se guarda para cleanup

DESPUES DE CORREGIR, PROBAR:
- Iniciar servidor: python -m http.server 8080
- Abrir http://localhost:8080/Hekatan.Wpf/doc/cad/index.html
- Verificar que el CAD 2D funciona normal
- Cargar un archivo .ifc (boton IFC o drag&drop)
- Verificar render 3D del IFC
- Probar comandos: ifc meta, ifc types, ifc hide IFCWALL, ifc fit
- Verificar que CAD shapes y modelo IFC coexisten en 3D

REGLAS:
- Siempre responde en espanol
- Todo unido en una sola app (NO separar CAD e IFC)
- Desde el CLI se puede importar el IFC
- Debe funcionar 2D y 3D
```

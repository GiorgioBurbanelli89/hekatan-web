# Hekatan MathEditor & CAS — Changelog

## Resumen

Este documento describe todos los cambios realizados en el subsistema **hekatan-web** desde el commit `9a36b52f` (Add MathEditor web). Incluye el MathEditor canvas WYSIWYG, el sistema de evaluacion integrado, soporte CAS, y la correccion del ejemplo Grid Frame.

---

## 1. MathEditor — Editor Canvas WYSIWYG (`MathEditor.ts`)

### 1.1 Arquitectura Grid 2D (antes: lista de lineas)

- **Antes**: `lines: MathElement[][]` — cada linea era un array de elementos.
- **Ahora**: `grid: MathElement[][][]` — grid `[row][col][elements]` que soporta multiples celdas por fila.
- Nuevas propiedades: `currentRow`, `currentCol` (antes `currentLineIndex`).
- Propiedad `cellsRowFlags: Set<number>` para rastrear filas `@{cells}`.

### 1.2 Evaluacion integrada (estilo Mathcad)

- Integra `HekatanEvaluator` (wrapper de math.js) directamente en el canvas.
- Metodo `evaluateAll()`: evalua cada celda secuencialmente, almacena resultados.
- Renderiza resultados al lado de cada expresion con `= valor`.
- Formato especial para matrices y vectores (renderizado tabular).
- Propiedades: `cellResults[][]`, `cellResultValues[][]`, `needsEval`.

### 1.3 Soporte @{cells}

- **Parsing**: `loadFromText()` detecta `@{cells} |expr1|expr2|expr3|`.
- **Serialization**: `toHekatan()` reconstruye la directiva `@{cells} |...|...|`.
- **Rendering**: Celdas se dibujan lado a lado con separadores visuales.

### 1.4 AST → Elementos (fixes de roundtrip)

- **`case "range"`** agregado a `_astToText()`: `4:6` ya no devuelve `"?"`.
- **`case "range"`** agregado a `_astToElements()`: genera texto correcto.
- **`case "index"`** corregido en `_astToElements()`: preserva sintaxis `[...]` en vez de crear MathSubscript (para que `k[4:6,4:6]` no se convierta en `k_{?,?}`).

### 1.5 Letras griegas

- `MathStyles.ts`: Mapa `GREEK_MAP` (alpha→α, beta→β, ..., Omega→Ω).
- `transformOperatorsForDisplay()` ahora convierte nombres griegos a Unicode.
- Ejemplo: `theta_x` se muestra como `θ_x` en el canvas.

---

## 2. MathElement — Nuevas clases y fixes (`MathElement.ts`)

### 2.1 MathGroup (nueva clase)

- Contenedor horizontal de multiples `MathElement`.
- Metodos: `measure()`, `render()`, `toHekatan()`, `hitTest()`.
- Usado por el parser AST cuando una expresion produce multiples elementos.

### 2.2 MathMatrix — Fix de serializacion

- **Antes**: `toHekatan()` generaba `[row1; row2|row3; row4]` (sintaxis Hekatan).
- **Ahora**: genera `[[1, 2], [3, 4]]` (sintaxis math.js compatible).
- Necesario para que `evaluateAll()` pueda evaluar matrices con math.js.

---

## 3. Evaluator — Parser de expresiones (`evaluator.ts`)

### 3.1 Soporte de rangos (`:`)

- Nuevo token type: `"colon"`.
- Nuevo AST node: `{ type: "range", start, end }`.
- Metodo `parseIndexSlot()`: parsea `expr:expr` dentro de brackets.
- Permite: `k[4:6, 4:6]`, `Q_b1[4:6]`, etc.

### 3.2 Sintaxis bracket `[...]` para vectores/matrices

- Parser ahora reconoce `[1, 2, 3]` como vector.
- Parser reconoce `[[1,2],[3,4]]` como matriz.
- Soporta tanto comas como punto y coma como separadores.

### 3.3 Dependencia math.js

- `package.json`: agregada dependencia `"mathjs": "^13.2.3"`.
- `HekatanEvaluator` usa `math.evaluate()` para evaluacion numerica completa.

---

## 4. Parser HTML — Nuevas directivas (`parser.ts`)

### 4.1 Headings Markdown

- Soporte `# Titulo`, `## Subtitulo`, ..., `###### H6`.
- Excluye keywords de control: `#for`, `#if`, `#else`, `#end`, `#while`, etc.

### 4.2 Texto descriptivo `>`

- Lineas que comienzan con `>` se renderizan como `<p class="comment">`.

### 4.3 @{cells} en HTML

- Parsea `@{cells} |expr1|expr2|expr3|`.
- Genera `<div class="cells-row">` con `<div class="cell">` por cada celda.
- CSS: layout flex con gap, min-width 120px, separador derecho.

---

## 5. Grid Frame — Ejemplo 5.1 de Mario Paz (corregido)

### 5.1 Contexto

Ejemplo del libro *Matrix Structural Analysis and Dynamics* de Mario Paz (Cap. 5, Ejemplo 5.1). Grid frame con 2 elementos, 3 nodos, 9 DOF. Miembros W14x82, E=29000 ksi, G=11600 ksi.

### 5.2 Archivos corregidos

- `hekatan-web/hekatan-ui/src/mathcanvas/main.ts` (ejemplo MathCanvas)
- `hekatan-web/hekatan-ui/src/editor/examples/gridframe.ts` (ejemplo editor Code)

### 5.3 Errores encontrados y corregidos

#### Error 1 — Matriz de rigidez `k` (signos de b_6)

Los terminos de acoplamiento flexion-corte tenian todos los signos invertidos. Al reordenar los DOF de viga estandar `[v, θ]` a DOF de grid `[θ, v]`, los signos del acoplamiento cambian.

```
Incorrecto: [0, a_4, -b_6, 0, a_2,  b_6]  (fila 2)
Correcto:   [0, a_4,  b_6, 0, a_2, -b_6]  (fila 2)
```

#### Error 2 — Matriz de transformacion `T_2` (signos de sin 90°)

La submatriz de rotacion 3x3 para θ=90° estaba mal:

```
Incorrecto: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
Correcto:   [[0,-1, 0], [ 1, 0, 0], [0, 0, 1]]
```

#### Error 3 — Fuerzas de empotramiento `Q_b1`

Para momento concentrado M₀=200 kip·in en L/2:

```
Incorrecto: col(0,  50,  3, 0,  50, -3)
Correcto:   col(0, -50, -3, 0, -50,  3)
```

#### Error 4 — Fuerzas locales `Q_2L` del Elemento 2

```
Incorrecto: col(-5, -83.33, -5, 5, 83.33, -5)
Correcto:   col( 0,  83.33,  5, 0,-83.33,  5)
```

### 5.4 Resultados verificados

```
u = [0.001, -0.0012, -0.0748]
```

Coinciden con los valores del libro:
- u₁ = 1.040×10⁻³ rad (torsion)
- u₂ = -1.170×10⁻³ rad (flexion)
- u₃ = -0.0748 in (desplazamiento vertical)

---

## 6. Configuracion del proyecto

### 6.1 Vite — Nuevo entry point

- `vite.config.ts`: agregado `mathcanvas: resolve("src/mathcanvas/index.html")`.

### 6.2 Editor — Nuevo ejemplo

- `getEditor.ts`: importa `GRID_FRAME_CODE` desde `./examples/gridframe.js`.
- Nuevo entry en `EXAMPLES`: `grid_frame: { name: "Grid Frame (Paz 5.1)", code: GRID_FRAME_CODE }`.

### 6.3 CSS — Estilos @{cells}

```css
.cells-row { display: flex; gap: 4px; margin: 2px 0; flex-wrap: wrap; }
.cells-row .cell { flex: 1 1 0; min-width: 120px; padding: 2px 6px; border-right: 1px solid #e0e0e0; }
```

---

## Archivos modificados (resumen)

| Archivo | Cambios |
|---------|---------|
| `hekatan-math/src/matheditor/MathEditor.ts` | Grid 2D, evaluacion, @{cells}, AST fixes |
| `hekatan-math/src/matheditor/MathElement.ts` | MathGroup, MathMatrix serialization fix |
| `hekatan-math/src/matheditor/MathStyles.ts` | Letras griegas Unicode |
| `hekatan-math/src/evaluator.ts` | Rangos, brackets, math.js |
| `hekatan-math/src/parser.ts` | Headings, >, @{cells} |
| `hekatan-math/package.json` | Dependencia mathjs |
| `hekatan-ui/src/editor/getEditor.ts` | Ejemplo Grid Frame |
| `hekatan-ui/src/editor/examples/gridframe.ts` | Ejemplo corregido |
| `hekatan-ui/src/editor/styles.css` | CSS @{cells} |
| `hekatan-ui/vite.config.ts` | Entry point mathcanvas |
| `hekatan-ui/src/mathcanvas/main.ts` | Ejemplo Grid Frame corregido |

---

*Generado: 2026-02-24*

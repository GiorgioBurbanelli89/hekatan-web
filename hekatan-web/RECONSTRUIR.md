# Hekatan Web - Plan de Reconstruccion

## Que paso?

Entre sesiones de Claude Code, los archivos fuente del **editor principal de Hekatan Web**
se perdieron. La carpeta `hekatan-web/` nunca se hizo `git commit` (estaba como `??` untracked),
asi que no hay historial de git para recuperar.

**Lo que se perdio:**
- `hekatan-math/src/parser.ts` - Parser principal del lenguaje Hekatan (.hcalc)
- `hekatan-math/src/renderer.ts` - Renderer HTML (ecuaciones, inline math, fracciones, N-ary)
- `hekatan-math/src/evaluator.ts` - Evaluador de expresiones matematicas
- `hekatan-math/src/index.ts` - Exportaba parser + renderer + evaluator + CAS
- `hekatan-ui/src/editor/getEditor.ts` - Editor con CodeMirror, ejemplos, menu
- CSS adicional con estilos `.dvr`, `.nary`, `.dvc`, `.dvl`

**Lo que sobrevivio:**
- `hekatan-math/src/cas/` - 4 motores CAS (giac, sympy, maxima, symengine) intactos
- `hekatan-ui/editor/main.ts` - Editor CAS basico (derivadas, integrales simbolicas)
- `node_modules/` - Dependencias instaladas
- `boost-1.87.0/` - Fuentes de Boost descargadas
- `CHANGELOG.md` - Historial de cambios (si sobrevivio)

---

## Arquitectura que tenia

```
hekatan-web/
  hekatan-math/                    # Paquete NPM: motor matematico
    src/
      index.ts                     # Exporta todo: parser, renderer, evaluator, CAS
      parser.ts                    # Parser del lenguaje Hekatan
      renderer.ts                  # Renderer HTML de expresiones
      evaluator.ts                 # Evaluador numerico
      cas/                         # [INTACTO] Motores CAS
        index.ts
        types.ts
        casManager.ts
        giacEngine.ts
        sympyEngine.ts
        maximaEngine.ts
        symengineEngine.ts
    package.json

  hekatan-ui/                      # Paquete NPM: interfaz web
    src/
      editor/
        getEditor.ts               # Editor principal con ejemplos
        styles.css                  # Estilos (incluye .dvr, .nary, .dvc, .dvl)
    editor/
      index.html                   # HTML del editor CAS [INTACTO]
      main.ts                      # Editor CAS [INTACTO]
    index.html
    vite.config.ts
    tsconfig.json
    package.json
```

---

## 1. parser.ts - Que hacia

El parser procesaba texto `.hcalc` linea por linea y generaba HTML.

### Funcionalidades implementadas:

#### Control de flujo
- `#for i = 1 to N` ... `#next` (ciclos con paso opcional `#for i = 0 to 10 : 2`)
- `#if condicion` ... `#else if` ... `#else` ... `#end if`
- `#while condicion` ... `#loop`
- `#repeat` ... `#until condicion`

#### Asignacion indexada
- `A[i] = expr` renderizado con subindice
- `M[i;j] = expr` para matrices

#### Bloques directiva `@{...}`
- `@{plot}` ... `@{end plot}` - Graficos SVG
- `@{plotly}` ... `@{end plotly}` - Graficos Plotly.js
- `@{svg}` ... `@{end svg}` - Dibujos SVG
- `@{three}` ... `@{end three}` - 3D con Three.js
- `@{eq}` ... `@{end eq}` - Ecuaciones formateadas (centro/left/right)

#### Regex clave
```typescript
const BLOCK_OPEN_RE = /^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i;
const BLOCK_CLOSE_RE = /^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;
```

#### Lineas de calculo
- `variable = expresion` → evalua y renderiza con `renderNode()`
- Comentarios con `'` al inicio
- Markdown con `'` seguido de marcado
- Lineas vacias → espaciado

#### Funciones
- `handlePlotBlock(lines)` - Genera SVG puro (no Plotly)
- `handlePlotlyBlock(lines)` - Genera Plotly.js
- `handleSvgBlock(lines)` - Genera SVG
- `handleThreeBlock(lines)` - Genera Three.js
- `handleEqBlock(lines, args)` - Ecuaciones formateadas
- `parseDirectiveBlock(type, lines, args)` - Router de bloques

---

## 2. renderer.ts - Que hacia

Generaba HTML formateado para expresiones matematicas.

### Funciones principales:

#### `renderNode(node)` → string
- Renderiza un nodo AST a HTML
- Fracciones: `<span class="dvc">num<span class="dvl"></span>den</span>`
- Potencias: `base<sup>exp</sup>`
- Subindices: `base<sub>idx</sub>`
- Raices: simbolo radical con vinculum
- Funciones: nombre en bold + argumentos

#### `renderValue(value, units?)` → string
- Formatea numero con unidades
- Precision configurable con `setDecimals()`/`getDecimals()`

#### `renderInlineText(text)` → string
- Procesa texto inline con formato matematico
- Detecta `^(...)` para superindices
- Detecta `_(...)` para subindices
- N-ary operators: ∫, ∬, ∭, ∑, ∏ con limites apilados
- Parcial ∂/∂x como fraccion
- Letras griegas: alpha→α, beta→β, etc.

#### `renderEquationText(text)` → string (~300 lineas)
Parser caracter por caracter para bloques `@{eq}`:

- **N-ary con limites apilados**: `∫_a^b`, `∑_{n=0}^{∞}`, `∏_{k=1}^{N}`
  - HTML: `<span class="dvr"><small>sup</small><span class="nary">∫</span><small>sub</small></span>`
- **Aliases**: `Int` → ∫, `Sum` → ∑, `Prod` → ∏
- **Limites**: `lim_{x->0}` con subscript
- **Derivadas**: `d/dx` como fraccion, `d²/dx²` orden superior
- **Parciales**: `∂/∂x`, `∂²/∂x²`
- **Fracciones**: `{num}/{den}` o `(num)/(den)`
- **Subindices**: `_x` o `_{expr}`
- **Superindices**: `^x` o `^{expr}`
- **Flechas**: `->` → →
- **Comparaciones**: `>=` → ≥, `<=` → ≤, `!=` → ≠, `~=` → ≈
- **Letras griegas**: alpha, beta, gamma, delta, epsilon, etc.
- **Funciones**: sin, cos, tan, ln, log, exp, etc. (bold)
- **Infinito**: `inf` → ∞

#### Helpers:
- `buildNary(text, startIdx, symbol)` → `{html, end}`
- `extractGroup(text, idx)` → `{content, end}`
- `findMatchingBrace(text, idx)` → number
- `findMatchingParen(text, idx)` → number
- `escapeHtmlInline(s)` → string

#### Constante:
```typescript
const EQ_FN_NAMES = new Set([
  "sin","cos","tan","cot","sec","csc",
  "asin","acos","atan","acot","asec","acsc",
  "sinh","cosh","tanh","coth","sech","csch",
  "ln","log","exp","sqrt","abs","sgn","sign",
  "min","max","sum","prod","det","tr","rank"
]);
```

#### `renderMatrixOperation(...)` → string
- Renderiza matrices en formato tabla HTML

#### `renderVectorOperation(...)` → string
- Renderiza vectores como fila o columna

---

## 3. evaluator.ts - Que hacia

Motor de evaluacion numerica puro (sin CAS).

### Funcionalidades:
- Parsing de expresiones a AST (tokenizer + parser recursivo descendente)
- Operadores: `+`, `-`, `*`, `/`, `^`, `%`
- Comparacion: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logicos: `and`, `or`, `not`
- Funciones built-in: sin, cos, tan, sqrt, abs, ln, log, exp, etc.
- Constantes: pi, e, g (gravedad)
- Variables: almacenamiento y lookup
- Unidades fisicas (SI)
- Cell arrays: `{val1; val2; val3}` con acceso `arr[idx]`
- Vectores y matrices con operaciones
- Funciones de usuario: `f(x) = expr`
- Funciones multilinea: `$f(x)` ... `$end`

---

## 4. getEditor.ts - Que hacia

Editor web con CodeMirror, menu de ejemplos, split view.

### Ejemplos que tenia (constantes):

```
CALCULO_CODE      - Calculo basico con variables y funciones
PLOT_CODE         - @{plot} con anotaciones SVG (rect, text, eq, line, point, arrow, etc.)
EQ_DEMO_CODE      - @{eq} con 15 ecuaciones (∫, ∑, ∏, lim, d/dx, ∂/∂x, series Taylor)
FEM_ASSEMBLY_CODE - Ensamblaje FEA con matrices de rigidez
VECTOR_CODE       - Operaciones con vectores
MATRIX_CODE       - Operaciones con matrices
CONTROL_FLOW_CODE - #for, #if, #while, #repeat
THREE_CODE        - @{three} 3D
SVG_CODE          - @{svg} dibujos
```

### Record EXAMPLES:
```typescript
const EXAMPLES: Record<string, {name: string, code: string}> = {
  calculo:      { name: "Calculo Basico",           code: CALCULO_CODE },
  plot:         { name: "@{plot} - Graficos SVG",   code: PLOT_CODE },
  eq_demo:      { name: "@{eq} - Ecuaciones",       code: EQ_DEMO_CODE },
  fem_assembly: { name: "FEM Assembly",             code: FEM_ASSEMBLY_CODE },
  vectores:     { name: "Vectores",                 code: VECTOR_CODE },
  matrices:     { name: "Matrices",                 code: MATRIX_CODE },
  control_flow: { name: "Control de Flujo",         code: CONTROL_FLOW_CODE },
  three:        { name: "@{three} 3D",              code: THREE_CODE },
  svg:          { name: "@{svg} Dibujo",            code: SVG_CODE },
};
```

---

## 5. CSS clases criticas (styles.css)

```css
/* Fraccion */
.dvc { display: inline-flex; flex-direction: column; align-items: center;
       vertical-align: middle; margin: 0 2px; }

/* Linea de fraccion */
.dvl { border-bottom: solid 1pt black; min-width: 1em; text-align: center; }

/* Contenedor N-ary con limites apilados */
.dvr { display: inline-flex; flex-direction: column; align-items: center;
       vertical-align: middle; margin: 0 1px; line-height: 1; }

/* Simbolo grande (∫, ∑, ∏) */
.nary { font-size: 240%; color: #C080F0; font-family: 'Georgia Pro Light', Georgia, serif;
        line-height: 0.8; }

/* Integral inclinada */
.nary em { font-style: normal; display: inline-block;
           transform: scaleX(0.7) rotate(7deg); }
```

---

## 6. @{plot} SVG - Que generaba

Renderer SVG puro (NO Plotly) que replicaba el comportamiento de C# Hekatan.

### Comandos soportados:
| Comando | Sintaxis | Descripcion |
|---------|----------|-------------|
| Funcion | `y = sin(x)` | Grafica funcion |
| Rango X | `x = -5 : 5` | Rango horizontal |
| Rango Y | `y = -2 : 2` | Rango vertical |
| `rect` | `rect x1 y1 x2 y2 color` | Rectangulo relleno |
| `text` | `text x y "texto" [size] [color]` | Texto en coordenadas |
| `eq` | `eq x y "ecuacion"` | Texto ecuacion (italic) |
| `line` | `line x1 y1 x2 y2 [color] [width]` | Linea |
| `point` | `point x y [color] [size]` | Punto |
| `arrow` | `arrow x1 y1 x2 y2 [color]` | Flecha |
| `proj` | `proj x y [color]` | Proyeccion (lineas punteadas a ejes) |
| `hline` | `hline y [color]` | Linea horizontal |
| `vline` | `vline x [color]` | Linea vertical |
| `dim` | `dim x1 y1 x2 y2 "texto"` | Cota dimensional |

### Atributos de funcion:
```
y = sin(x) | color: #FF0000 | width: 2 | label: "f(x)"
```

---

## 7. @{eq} Block - Ejemplo que tenia

```
@{eq}
∫_0^1 x^2 dx = 1/3                                    (1)
∑_{n=0}^{∞} {1}/{n!} = e                              (2)
∏_{k=1}^{N} k = N!                                     (3)
lim_{x->0} {sin(x)}/{x} = 1                           (4)
d/dx [x^n] = n·x^{n-1}                                (5)
∂/∂x [x^2·y + y^3] = 2·x·y                            (6)
∫_0^{∞} e^{-x^2} dx = {sqrt(pi)}/{2}                  (7)
∑_{n=1}^{∞} {1}/{n^2} = {pi^2}/{6}                    (8)
∂²/∂x² u + ∂²/∂y² u = 0                               (9)
d²y/dx² + omega^2·y = 0                               (10)
@{end eq}
```

---

## 8. Pasos para reconstruir

### Paso 1: Recrear `hekatan-math/src/evaluator.ts`
- Tokenizer de expresiones
- Parser recursivo descendente → AST
- Evaluador numerico con variables, funciones, unidades
- Cell arrays, vectores, matrices
- ~800-1000 lineas

### Paso 2: Recrear `hekatan-math/src/renderer.ts`
- `renderNode()` - AST a HTML
- `renderValue()` - numeros formateados
- `renderInlineText()` - texto con math inline
- `renderEquationText()` - ecuaciones @{eq} (~300 lineas)
- Helpers: `buildNary`, `extractGroup`, `findMatchingBrace/Paren`
- `renderMatrixOperation()`, `renderVectorOperation()`
- ~1200 lineas total

### Paso 3: Recrear `hekatan-math/src/parser.ts`
- Parser linea por linea de .hcalc
- Control de flujo: #for, #if, #while, #repeat
- Bloques directiva: @{plot}, @{eq}, @{svg}, @{three}, @{plotly}
- handlePlotBlock() - SVG renderer con anotaciones
- handleEqBlock() - ecuaciones formateadas
- Asignacion indexada
- Import de renderer y evaluator
- ~600-800 lineas

### Paso 4: Actualizar `hekatan-math/src/index.ts`
```typescript
// Agregar exports del parser, renderer, evaluator
export { parse } from "./parser.js";
export { renderNode, renderValue, renderInlineText, renderEquationText,
         setDecimals, getDecimals, renderMatrixOperation,
         renderVectorOperation } from "./renderer.js";
export { evaluate, HekatanEnvironment } from "./evaluator.js";
// CAS exports existentes
export { casManager, ... } from "./cas/index.js";
```

### Paso 5: Recrear `hekatan-ui/src/editor/getEditor.ts`
- Editor con CodeMirror o textarea
- Split view: codigo | output
- Menu de ejemplos (EXAMPLES record)
- Todos los ejemplos: CALCULO, PLOT, EQ, FEM, VECTOR, MATRIX, etc.
- Boton Run, Ctrl+Enter
- ~400-500 lineas

### Paso 6: Actualizar `hekatan-ui/src/editor/styles.css`
- Verificar clases .dvr, .nary, .dvc, .dvl
- Estilos del editor split view
- Estilos de output

### Paso 7: Compilar y probar
```bash
cd hekatan-web/hekatan-math && npx tsc --noEmit
cd hekatan-web/hekatan-ui && npx vite
```

### Paso 8: HACER GIT COMMIT INMEDIATAMENTE
```bash
cd hekatan-web
git add -A
git commit -m "Reconstruccion completa de hekatan-web editor"
```

---

## 9. Leccion aprendida

**SIEMPRE hacer `git add` y `git commit` despues de cada sesion de trabajo.**
Los archivos no commiteados se pueden perder entre sesiones de Claude Code.

---

## 10. Referencia: Archivos C# equivalentes

Para replicar comportamiento exacto del parser/renderer, consultar:
- `Hekatan.Common/MultLangCode/MultLangProcessor.cs` - N-ary operators, CSS classes
- `Hekatan.Core/Parsers/ExpressionParser/ExpressionParser.cs` - Parser de expresiones
- `Hekatan.Core/Parsers/ExpressionParser/ExpressionParser.Tokens.cs` - Tokenizer
- `Hekatan.Common/HekatanOutputProcessor.cs` - Output HTML
- `Hekatan.Common/HekatanProcessor.cs` - Procesador principal
- `Hekatan.Common/HekatanReader.cs` - Lector de archivos .hcalc

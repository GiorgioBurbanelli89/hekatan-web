/**
 * Hekatan Calc — WPF-Style Web Editor
 * Menu bar, toolbar, split pane, keypad, rulers, status bar
 */
import { parse } from "hekatan-math/parser.js";
import { GRID_FRAME_CODE } from "./examples/gridframe.js";
import { MODAL_CODE } from "./examples/modal.js";
import { VECTOR_TRIG_CODE } from "./examples/vector_trig.js";
import { MAMPOSTERIA_CODE } from "./examples/mamposteria.js";
import { FEM_ASSEMBLY_CODE } from "./examples/fem_assembly.js";
import { CELL_ARRAYS_CODE } from "./examples/cell_arrays.js";
import { PORTICO_CODE } from "./examples/portico.js";
import { UNITS_VECTORS_CODE } from "./examples/units_vectors.js";
import { UNITS_ENGINEERING_CODE } from "./examples/units_engineering.js";

// ─── Examples ────────────────────────────────────────────
const CALCULO_CODE = `# Calculo - Integrales y Derivadas
> Visualizacion grafica con @{plot} - anotaciones, cotas y ecuaciones

## 1. Integral Definida - Area bajo la curva
> La integral definida es el area bajo la curva entre a y b

f(x) = x^2
a = 0
b = 4

> Resultado exacto: b^3/3 - a^3/3
Area = b^3/3 - a^3/3

## 1.1 Suma de Riemann Izquierda (n=8)

@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: 0, 4
ylim: -1, 17
width: 700
height: 450
title: Suma de Riemann Izquierda - f(x) = x^2
xlabel: x
ylabel: f(x)

rect: 0, 0, 0.5, 0, #3366CC, fill
rect: 0.5, 0, 0.5, 0.25, #3366CC, fill
rect: 1.0, 0, 0.5, 1.0, #3366CC, fill
rect: 1.5, 0, 0.5, 2.25, #3366CC, fill
rect: 2.0, 0, 0.5, 4.0, #3366CC, fill
rect: 2.5, 0, 0.5, 6.25, #3366CC, fill
rect: 3.0, 0, 0.5, 9.0, #3366CC, fill
rect: 3.5, 0, 0.5, 12.25, #3366CC, fill

eq: 0.5, 15, "S_8 = 17.5", #CC0000, 13
eq: 0.5, 13.5, "Integral x^2 dx = 64/3 = 21.33", #003366, 12
text: 2.5, -0.7, "dx = 0.5", #666666, 11

dim: 0, -0.5, 4, -0.5, "a=0 a b=4", #333333
@{end plot}

## 2. Derivada - Pendiente de la Tangente
> f'(a) = pendiente de la recta tangente en (a, f(a))

## 2.1 Derivada de f(x) = x^2 en x=1.5

@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: -0.5, 4
ylim: -2, 14
width: 700
height: 450
title: Derivada de f(x)=x^2 en x=1.5
xlabel: x
ylabel: f(x)

line: -0.5, -3.75, 3.5, 8.25, #CC0000
point: 1.5, 2.25, #CC0000, 7, filled

proj: 1.5, 2.25, #999999
eq: 2.2, 1.5, "f'(1.5) = 2*1.5 = 3", #CC0000, 12
eq: 2.2, 0.5, "Pendiente m = 3", #003366, 11
text: 1.6, 2.5, "(1.5, 2.25)", #333333, 10
text: 2.5, 6, "Tangente", #CC0000, 11
@{end plot}

## 3. Comparacion Numerica
> Suma de Riemann con N=100 vs resultado exacto
N_r = 100
dx = (b - a) / N_r
g_R(i) = f(a + (i - 0.5)*dx) * dx
Area_R = summation(g_R, 1, N_r)
Area_exacta = b^3/3 - a^3/3

> Regla de Simpson 1/3
h_s = (b - a) / 2
m = (a + b) / 2
Simpson = (h_s/3) * (f(a) + 4*f(m) + f(b))

@{cells} |Area_R| |Area_exacta| |Simpson|`;

const PLOT_CODE = `# Graficas con @{plot}
> Graficas SVG - sintaxis compatible con Hekatan Calc C#

## 1. Funcion Simple (function:)
@{plot}
function: sin(x)
color: #0033CC
linewidth: 2.5
legend: sin(x)
xlim: -6.28, 6.28
ylim: -1.5, 1.5
title: Funcion Seno
xlabel: x
ylabel: y
grid: true
@{end plot}

## 2. Multiples Series (numbered)
@{plot}
title: Funciones Trigonometricas
xlabel: x
ylabel: y
xlim: -6.28, 6.28
ylim: -1.5, 1.5
grid: true

function: sin(x)
color: #0033CC
legend: sin(x)
linewidth: 2.5

function2: cos(x)
color2: #CC0000
legend2: cos(x)
linewidth2: 2
style2: dashed

function3: sin(2*x)/2
color3: #006600
legend3: sin(2x)/2
linewidth3: 1.5
style3: dot
@{end plot}

## 3. Con Anotaciones
@{plot}
function: x^2
color: #0033CC
linewidth: 2.5
legend: f(x) = x^2
xlim: -1, 4
ylim: -2, 16
title: Derivada en x=2
xlabel: x
ylabel: f(x)
width: 650
height: 420
grid: true

line: -0.5, -4, 3.5, 12, #CC0000
point: 2, 4, #CC0000, 6, filled
proj: 2, 4, #AAAAAA
eq: 2.3, 3, "f'(2) = 2*2 = 4", #CC0000, 12
text: 2.8, 9, "Tangente", #CC0000, 11
@{end plot}

## 4. Con Variables del Scope
A_p = 2
w_p = 3
@{plot}
title: Amplitud y Frecuencia
xlabel: x
ylabel: y
xlim: 0, 6.28
ylim: -2.5, 2.5
grid: true

function: A_p*sin(w_p*x)
color: #0033CC
legend: A*sin(w*x)
linewidth: 2

function2: A_p*cos(w_p*x)
color2: #CC0000
legend2: A*cos(w*x)
linewidth2: 2
style2: dashed

hline: 0, #999999
@{end plot}

## 5. Sintaxis Inline (y =)
@{plot}
x = -3.14 : 3.14
y = -1.5 : 1.5
y = sin(x) | color: #2196f3 | width: 2 | label: "sin(x)"
y = cos(x) | color: #f44336 | width: 2 | label: "cos(x)" | style: dashed
point 0 0 #333
hline 1 #4caf50
hline -1 #4caf50
vline 0 #999
@{end plot}`;

const EQ_DEMO_CODE = `# Ecuaciones Formateadas
@{eq}
∫_0^1 x^2 dx = {1}/{3}                              (1)
∑_{n=0}^{∞} {1}/{n!} = e                             (2)
∏_{k=1}^{N} k = N!                                    (3)
lim_{x->0} {sin(x)}/{x} = 1                          (4)
d/dx [x^n] = n·x^{n-1}                               (5)
∂/∂x [x^2·y + y^3] = 2·x·y                           (6)

∫_0^{∞} e^{-x^2} dx = {sqrt(pi)}/{2}                 (7)
∑_{n=1}^{∞} {1}/{n^2} = {pi^2}/{6}                   (8)

∂²/∂x² u + ∂²/∂y² u = 0                              (9)
d²y/dx² + omega^2·y = 0                              (10)
@{end eq}`;

const FEM_CODE = `# FEM Assembly
> Propiedades del elemento
E = 200000
A = 100
L = 1000

> Rigidez axial
k = E*A/L

> Matriz de rigidez local 2x2
K11 = k
K12 = -k
K21 = -k
K22 = k

> Ensamblaje 3 elementos en serie
K_global_22 = k + k
K_global_33 = k + k

> Fuerza aplicada en nodo 3
F3 = 1000
u3 = F3/k`;

const VECTOR_CODE = `# Operaciones con Vectores
> Definicion
v1 = {3; 4; 0}
v2 = {1; -2; 5}

> Magnitud
mag_v1 = sqrt(3^2 + 4^2 + 0^2)

> Producto punto
dot_v = 3*1 + 4*(-2) + 0*5

> Suma
sx = 3 + 1
sy = 4 + (-2)
sz = 0 + 5`;

const SVG_CODE = `# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`;

const THREE_CODE = `# Escena 3D con Three.js
@{three}
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshPhongMaterial({color: 0x2196f3});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshPhongMaterial({color: 0xf44336})
);
sphere.position.set(3, 0, 0);
scene.add(sphere);

scene.add(new THREE.GridHelper(10, 10));
@{end three}`;

const CONTROL_CODE = `# Funciones y Operaciones Avanzadas
> Funciones de usuario, sumatorias, productos

## 1. Funciones de Usuario
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
f(3)

g(x,y) = x^2 + y^2
g(3, 4)

## 2. Sumatoria Numerica
> summation(f, a, b) = Σ f(i) para i = a hasta b
h(i) = i^2
S_10 = summation(h, 1, 10)

> Factorial via producto
p(k) = k
fact_6 = nproduct(p, 1, 6)

## 3. Derivada Numerica
> nderivative(f, x) calcula f'(x) numericamente
df_1 = nderivative(f, 1)
df_2 = nderivative(f, 2)

## 4. Integral Numerica
> integral(f, a, b) calcula la integral definida
Area = integral(f, 0, 3)

## 5. Matrices con Funciones
k_col(ei, l) = [[12*ei/l^3, -6*ei/l^2], [-6*ei/l^2, 4*ei/l]]
EI = 2100000 * (0.30 * 0.40^3 / 12)
h = 3.0
K = k_col(EI, h)

## 6. Operaciones con Vectores
v = [1, 4, 9, 16, 25]
v_sqrt = sqrt(v)
v_sum = sum(v)
v_norm = norm(v)`;

const INTEGRAL_CODE = `# Integracion Numerica (Gauss-Legendre)
> Cuadratura de Gauss para integrales simples, dobles y triples

## Integral Simple

> Area bajo sin(x) de 0 a pi
f(x) = sin(x)
I_1 = integral(f, 0, pi)

> Integral de polinomio
g(x) = x^3 - 2*x + 1
I_2 = integral(g, -1, 2)

@{plot}
x = -1 : 2
y = -2 : 5
y = x^3 - 2*x + 1 | color: #2196f3 | width: 2 | label: "g(x) = x^3 - 2x + 1"
hline 0 #999
@{end plot}

## Integral Doble

> Volumen bajo paraboloide z = x^2 + y^2 en [0,1] x [0,1]
h(x,y) = x^2 + y^2
I_3 = integral2(h, 0, 1, 0, 1)

> Integral de sin(x)*cos(y) en [0,pi] x [0,pi/2]
p(x,y) = sin(x)*cos(y)
I_4 = integral2(p, 0, pi, 0, pi/2)

## Integral Triple

> Densidad r = x + y + z en cubo unitario
r(x,y,z) = x + y + z
I_5 = integral3(r, 0, 1, 0, 1, 0, 1)

> Integral de x*y*z en [0,2]^3
q(x,y,z) = x*y*z
I_6 = integral3(q, 0, 2, 0, 2, 0, 2)`;

const EXAMPLES: Record<string, { name: string; code: string }> = {
  calculo:      { name: "Calculo - Integrales/Derivadas",code: CALCULO_CODE },
  plot:         { name: "@{plot} Graficas 2D",     code: PLOT_CODE },
  eq_demo:      { name: "@{eq} Ecuaciones",        code: EQ_DEMO_CODE },
  integral:     { name: "Integrales (Gauss)",      code: INTEGRAL_CODE },
  vectores:     { name: "Vectores y Trig",         code: VECTOR_TRIG_CODE },
  control:      { name: "Control de Flujo (#for, #if)", code: CONTROL_CODE },
  cell_arrays:  { name: "Cell Arrays",             code: CELL_ARRAYS_CODE },
  fem:          { name: "FEM Basico",              code: FEM_CODE },
  fem_assembly: { name: "FEM Ensamblaje",          code: FEM_ASSEMBLY_CODE },
  portico:      { name: "Portico k{i} (Aguiar)",   code: PORTICO_CODE },
  mamposteria:  { name: "Mamposteria (Aguiar)",    code: MAMPOSTERIA_CODE },
  modal:        { name: "Analisis Modal (Eigen WASM)", code: MODAL_CODE },
  grid_frame:   { name: "Grid Frame (Paz 5.1)",   code: GRID_FRAME_CODE },
  three:        { name: "@{three} 3D",             code: THREE_CODE },
  svg:          { name: "@{svg} Dibujo",           code: SVG_CODE },
  units_vec:    { name: "Vectores con Unidades",   code: UNITS_VECTORS_CODE },
  units_eng:    { name: "Ingenieria Estructural (&)", code: UNITS_ENGINEERING_CODE },
};

// ─── DOM ─────────────────────────────────────────────────
const codeInput = document.getElementById("codeInput") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const btnRun = document.getElementById("btnRun") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const exampleSelect = document.getElementById("exampleSelect") as HTMLSelectElement;
const chkAutoRun = document.getElementById("chkAutoRun") as HTMLInputElement;
const splitter = document.getElementById("splitter") as HTMLDivElement;
const inputFrame = document.getElementById("inputFrame") as HTMLDivElement;
const outputFrame = document.getElementById("outputFrame") as HTMLDivElement;
const rulerH = document.getElementById("rulerH") as HTMLCanvasElement;
const rulerV = document.getElementById("rulerV") as HTMLCanvasElement;
const keypadContent = document.getElementById("keypadContent") as HTMLDivElement;
const lineNumbers = document.getElementById("lineNumbers") as HTMLDivElement;
const syntaxLayer = document.getElementById("syntaxLayer") as HTMLDivElement;
const findBar = document.getElementById("findBar") as HTMLDivElement;
const findInput = document.getElementById("findInput") as HTMLInputElement;
const replaceInput = document.getElementById("replaceInput") as HTMLInputElement;
const findCount = document.getElementById("findCount") as HTMLSpanElement;
const acPopup = document.getElementById("acPopup") as HTMLDivElement;

// ─── Populate examples ────────────────────────────────────
for (const [key, ex] of Object.entries(EXAMPLES)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = ex.name;
  exampleSelect.appendChild(opt);
}
exampleSelect.addEventListener("change", () => {
  const ex = EXAMPLES[exampleSelect.value];
  if (ex) {
    codeInput.value = ex.code;
    updateLineNumbers();
    updateSyntax();
    runCode();
  }
});

// ─── Run ─────────────────────────────────────────────────
let autoRunTimeout: ReturnType<typeof setTimeout> | null = null;

function runCode(): void {
  const code = codeInput.value;
  if (!code.trim()) { output.innerHTML = ""; return; }

  statusText.textContent = "Procesando...";
  btnRun.disabled = true;

  try {
    const result = parse(code);
    output.innerHTML = `<div class="output-page">${result.html}</div>`;
    statusText.textContent = "Listo";
    drawRulers();
  } catch (e: any) {
    output.innerHTML = `<div class="output-page"><div class="line error">Error: ${e.message}</div></div>`;
    statusText.textContent = "Error";
  }

  btnRun.disabled = false;
}

btnRun.addEventListener("click", runCode);

// Keyboard shortcuts
codeInput.addEventListener("keydown", (e) => {
  // Autocomplete navigation
  if (acPopup.classList.contains("open")) {
    if (e.key === "ArrowDown") { e.preventDefault(); acSelected = (acSelected + 1) % acFiltered.length; renderAcPopup(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); acSelected = (acSelected - 1 + acFiltered.length) % acFiltered.length; renderAcPopup(); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); acceptAutocomplete(); return; }
    if (e.key === "Escape") { hideAutocomplete(); return; }
  }

  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); return; }
  if (e.key === "F5") { e.preventDefault(); runCode(); return; }

  // Find & Replace shortcuts
  if (e.key === "f" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openFind(false); return; }
  if (e.key === "h" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openFind(true); return; }
  if (e.key === "Escape" && findBar.classList.contains("open")) { closeFind(); return; }

  // Comment toggle (Ctrl+Q)
  if (e.key === "q" && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); commentLines(); return; }
  if (e.key === "q" && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); uncommentLines(); return; }

  // Tab
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, start) + "  " + codeInput.value.substring(end);
    codeInput.selectionStart = codeInput.selectionEnd = start + 2;
  }
});

// AutoRun (siempre activo) + auto-complete trigger
codeInput.addEventListener("input", () => {
  showAutocomplete();
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(runCode, 400);
});

// ─── Line numbers ───────────────────────────────────────
function updateLineNumbers() {
  const text = codeInput.value;
  const count = text.split("\n").length;
  // Find active line
  const pos = codeInput.selectionStart;
  const activeLine = text.substring(0, pos).split("\n").length;
  let html = "";
  for (let i = 1; i <= count; i++) {
    html += `<div${i === activeLine ? ' class="active"' : ''}>${i}</div>`;
  }
  lineNumbers.innerHTML = html;
}

function syncLineNumbersScroll() {
  lineNumbers.scrollTop = codeInput.scrollTop;
}

codeInput.addEventListener("scroll", syncLineNumbersScroll);
codeInput.addEventListener("input", updateLineNumbers);
codeInput.addEventListener("click", updateLineNumbers);
codeInput.addEventListener("keyup", updateLineNumbers);

// ─── Syntax highlighting ────────────────────────────────
function updateSyntax() {
  const text = codeInput.value;
  const lines = text.split("\n");
  let inBlock = false;
  const htmlParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    // Track @{} blocks
    if (/^@\{(?!end)/.test(trimmed)) inBlock = true;
    if (/^@\{end\s/.test(trimmed)) { htmlParts.push(hl(line, "syn-block")); inBlock = false; continue; }
    if (/^@\{/.test(trimmed)) { htmlParts.push(hl(line, "syn-block")); continue; }

    if (inBlock) { htmlParts.push(escHtml(line)); continue; }

    // Markdown headings: # heading, ## heading, etc.
    if (/^#{1,6}\s/.test(trimmed)) { htmlParts.push(hl(line, "syn-heading")); continue; }
    // Description text: > text
    if (trimmed.startsWith(">")) { htmlParts.push(hl(line, "syn-comment")); continue; }
    // Legacy comments with apostrophe
    if (trimmed.startsWith("'")) { htmlParts.push(hl(line, "syn-comment")); continue; }

    // Keywords: for, if, next, else, end if, repeat, while, do (also legacy #for etc.)
    if (/^#?(for|next|if|else|end if|repeat|loop|break|continue|while|do)\b/i.test(trimmed)) {
      htmlParts.push(hl(line, "syn-keyword")); continue;
    }

    // Default: highlight numbers and functions inline
    htmlParts.push(highlightLine(line));
  }

  syntaxLayer.innerHTML = htmlParts.join("\n");
  // Sync scroll
  syntaxLayer.scrollTop = codeInput.scrollTop;
  syntaxLayer.scrollLeft = codeInput.scrollLeft;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function hl(text: string, cls: string): string {
  return `<span class="${cls}">${escHtml(text)}</span>`;
}
function highlightLine(line: string): string {
  // Simple token-based highlighting
  return escHtml(line)
    .replace(/\b(\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="syn-number">$1</span>')
    .replace(/\b(sin|cos|tan|asin|acos|atan|atan2|sqrt|cbrt|ln|log|exp|abs|round|floor|ceiling|min|max|mod|gcd|lcm|sum|product|integral|transpose|lsolve|det|inv|identity|matrix)\b/g, '<span class="syn-function">$1</span>');
}

codeInput.addEventListener("input", updateSyntax);
codeInput.addEventListener("scroll", () => {
  syntaxLayer.scrollTop = codeInput.scrollTop;
  syntaxLayer.scrollLeft = codeInput.scrollLeft;
});

// ─── Find & Replace ─────────────────────────────────────
let findMatches: { start: number; end: number }[] = [];
let findIdx = -1;

function openFind(showReplace = false) {
  findBar.classList.add("open");
  const replaceRow = document.getElementById("replaceRow")!;
  replaceRow.style.display = showReplace ? "flex" : "none";
  findInput.focus();
  // Pre-fill with selection
  const sel = codeInput.value.substring(codeInput.selectionStart, codeInput.selectionEnd);
  if (sel && !sel.includes("\n")) findInput.value = sel;
  findInput.select();
  doFind();
}

function closeFind() {
  findBar.classList.remove("open");
  findMatches = [];
  findIdx = -1;
  findCount.textContent = "";
  codeInput.focus();
}

function doFind() {
  const query = findInput.value;
  if (!query) { findMatches = []; findIdx = -1; findCount.textContent = ""; return; }

  const caseSensitive = (document.getElementById("findCase") as HTMLInputElement).checked;
  const useRegex = (document.getElementById("findRegex") as HTMLInputElement).checked;

  findMatches = [];
  const text = codeInput.value;

  try {
    if (useRegex) {
      const flags = caseSensitive ? "g" : "gi";
      const re = new RegExp(query, flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        findMatches.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++; // avoid infinite loop
      }
    } else {
      const searchText = caseSensitive ? text : text.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      let idx = 0;
      while ((idx = searchText.indexOf(searchQuery, idx)) !== -1) {
        findMatches.push({ start: idx, end: idx + query.length });
        idx += query.length;
      }
    }
  } catch { /* invalid regex */ }

  if (findMatches.length > 0) {
    // Find nearest match to current cursor
    const cursor = codeInput.selectionStart;
    findIdx = findMatches.findIndex(m => m.start >= cursor);
    if (findIdx === -1) findIdx = 0;
    selectMatch();
  } else {
    findIdx = -1;
  }
  updateFindCount();
}

function selectMatch() {
  if (findIdx < 0 || findIdx >= findMatches.length) return;
  const m = findMatches[findIdx];
  codeInput.selectionStart = m.start;
  codeInput.selectionEnd = m.end;
  codeInput.focus();
  // Scroll into view
  const linesBefore = codeInput.value.substring(0, m.start).split("\n").length;
  const lineH = parseFloat(getComputedStyle(codeInput).lineHeight) || 20;
  codeInput.scrollTop = Math.max(0, (linesBefore - 5) * lineH);
}

function updateFindCount() {
  if (findMatches.length === 0) {
    findCount.textContent = findInput.value ? "0/0" : "";
  } else {
    findCount.textContent = `${findIdx + 1}/${findMatches.length}`;
  }
}

function findNextMatch() {
  if (findMatches.length === 0) return;
  findIdx = (findIdx + 1) % findMatches.length;
  selectMatch();
  updateFindCount();
}

function findPrevMatch() {
  if (findMatches.length === 0) return;
  findIdx = (findIdx - 1 + findMatches.length) % findMatches.length;
  selectMatch();
  updateFindCount();
}

function replaceOne() {
  if (findIdx < 0 || findIdx >= findMatches.length) return;
  const m = findMatches[findIdx];
  const text = codeInput.value;
  codeInput.value = text.substring(0, m.start) + replaceInput.value + text.substring(m.end);
  doFind();
  updateLineNumbers();
  updateSyntax();
}

function replaceAllMatches() {
  if (findMatches.length === 0) return;
  // Replace from end to start to preserve indices
  let text = codeInput.value;
  for (let i = findMatches.length - 1; i >= 0; i--) {
    const m = findMatches[i];
    text = text.substring(0, m.start) + replaceInput.value + text.substring(m.end);
  }
  codeInput.value = text;
  doFind();
  updateLineNumbers();
  updateSyntax();
}

// Wire up find bar events
findInput.addEventListener("input", doFind);
document.getElementById("findNext")!.addEventListener("click", findNextMatch);
document.getElementById("findPrev")!.addEventListener("click", findPrevMatch);
document.getElementById("replaceOne")!.addEventListener("click", replaceOne);
document.getElementById("replaceAll")!.addEventListener("click", replaceAllMatches);
document.getElementById("findClose")!.addEventListener("click", closeFind);
document.getElementById("findCase")!.addEventListener("change", doFind);
document.getElementById("findRegex")!.addEventListener("change", doFind);

findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? findPrevMatch() : findNextMatch(); }
  if (e.key === "Escape") closeFind();
});
replaceInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFind();
});

// ─── Auto-complete ──────────────────────────────────────
const AC_WORDS: { word: string; kind: string }[] = [
  // Functions
  ...["sin","cos","tan","asin","acos","atan","atan2","sqrt","cbrt","ln","log","log2",
     "exp","abs","round","floor","ceiling","min","max","mod","gcd","lcm",
     "sum","product","integral","transpose","lsolve","det","inv","identity","matrix",
     "sign","fact","comb","perm"].map(w => ({ word: w + "(", kind: "fn" })),
  // Constants
  ...["pi","e","inf"].map(w => ({ word: w, kind: "const" })),
  // Keywords (Hekatan uses keywords WITHOUT # prefix; # is reserved for markdown headings)
  ...["for","next","if","else","end if","repeat","loop","break","continue",
     "while","do"].map(w => ({ word: w, kind: "kw" })),
  // Blocks
  ...["@{eq}","@{end eq}","@{plot}","@{end plot}","@{svg}","@{end svg}",
     "@{three}","@{end three}","@{draw}","@{end draw}","@{html}","@{end html}",
     "@{css}","@{end css}","@{markdown}","@{end markdown}","@{python}","@{end python}",
     "@{bash}","@{end bash}","@{js}","@{end js}","@{columns 2}","@{end columns}",
     "@{table}","@{end table}","@{function}","@{end function}",
     "@{pagebreak}"].map(w => ({ word: w, kind: "block" })),
  // Greek
  ...["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","lambda","mu",
     "nu","xi","rho","sigma","tau","phi","psi","omega",
     "Gamma","Delta","Theta","Lambda","Sigma","Phi","Psi","Omega"].map(w => ({ word: w, kind: "greek" })),
];

let acSelected = 0;
let acFiltered: typeof AC_WORDS = [];

function getWordAtCursor(): { word: string; start: number } {
  const pos = codeInput.selectionStart;
  const text = codeInput.value;
  let start = pos;
  while (start > 0 && /[\w@{#.]/.test(text[start - 1])) start--;
  return { word: text.substring(start, pos), start };
}

function showAutocomplete() {
  const { word, start } = getWordAtCursor();
  if (word.length < 2) { hideAutocomplete(); return; }

  const lower = word.toLowerCase();
  acFiltered = AC_WORDS.filter(w => w.word.toLowerCase().startsWith(lower) && w.word !== word);

  if (acFiltered.length === 0) { hideAutocomplete(); return; }

  acSelected = 0;
  renderAcPopup();

  // Position popup
  const textareaRect = codeInput.getBoundingClientRect();
  const text = codeInput.value.substring(0, start);
  const lines = text.split("\n");
  const lineH = parseFloat(getComputedStyle(codeInput).lineHeight) || 20;
  const lineNum = lines.length;
  const colNum = lines[lines.length - 1].length;
  const charW = 7.8; // approx monospace char width at 13px

  const top = (lineNum * lineH) - codeInput.scrollTop + 2;
  const left = (colNum * charW) - codeInput.scrollLeft + 50; // 50 = line numbers width + padding

  acPopup.style.top = `${top}px`;
  acPopup.style.left = `${left}px`;
  acPopup.classList.add("open");
}

function renderAcPopup() {
  acPopup.innerHTML = acFiltered.map((item, i) =>
    `<div class="ac-item${i === acSelected ? " selected" : ""}" data-idx="${i}">
      <span>${escHtml(item.word)}</span>
      <span class="ac-kind">${item.kind}</span>
    </div>`
  ).join("");
}

function hideAutocomplete() {
  acPopup.classList.remove("open");
  acFiltered = [];
}

function acceptAutocomplete() {
  if (acFiltered.length === 0) return;
  const item = acFiltered[acSelected];
  const { word, start } = getWordAtCursor();
  const text = codeInput.value;
  const pos = codeInput.selectionStart;
  codeInput.value = text.substring(0, start) + item.word + text.substring(pos);
  codeInput.selectionStart = codeInput.selectionEnd = start + item.word.length;
  hideAutocomplete();
  updateLineNumbers();
  updateSyntax();
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(runCode, 400);
}

acPopup.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest(".ac-item") as HTMLElement | null;
  if (item) {
    acSelected = parseInt(item.dataset.idx!);
    acceptAutocomplete();
  }
});

// ─── Insert helpers ──────────────────────────────────────
function insertText(text: string) {
  const t = text.replace(/\\n/g, "\n");
  const start = codeInput.selectionStart;
  const end = codeInput.selectionEnd;
  codeInput.value = codeInput.value.substring(0, start) + t + codeInput.value.substring(end);
  codeInput.selectionStart = codeInput.selectionEnd = start + t.length;
  codeInput.focus();
  updateLineNumbers();
  updateSyntax();
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(runCode, 400);
}

// Wire up all data-insert buttons (menu + toolbar + keypad)
document.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-insert]") as HTMLElement | null;
  if (btn) {
    insertText(btn.dataset.insert!);
  }
});

// ─── Menu bar logic ──────────────────────────────────────
// Close menus when clicking outside
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".menu-item")) {
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("open"));
  }
});

// Menu actions
document.querySelectorAll<HTMLButtonElement>(".menu-dropdown button[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("open"));
    switch (action) {
      case "new": codeInput.value = ""; output.innerHTML = ""; break;
      case "save": downloadFile(codeInput.value, "document.hcalc", "text/plain"); break;
      case "saveas": downloadFile(codeInput.value, "document.hcalc", "text/plain"); break;
      case "open": openFile(); break;
      case "export-html": downloadFile(output.innerHTML, "output.html", "text/html"); break;
      case "undo": document.execCommand("undo"); break;
      case "redo": document.execCommand("redo"); break;
      case "selectall": codeInput.select(); break;
      case "comment": commentLines(); break;
      case "uncomment": uncommentLines(); break;
    }
  });
});

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function openFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".hcalc,.cpd,.txt";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      codeInput.value = reader.result as string;
      if (chkAutoRun.checked) runCode();
    };
    reader.readAsText(file);
  };
  input.click();
}

function commentLines() {
  const start = codeInput.selectionStart;
  const end = codeInput.selectionEnd;
  const text = codeInput.value;
  const before = text.substring(0, start);
  const lineStart = before.lastIndexOf("\n") + 1;
  const afterEnd = text.indexOf("\n", end);
  const blockEnd = afterEnd === -1 ? text.length : afterEnd;
  const block = text.substring(lineStart, blockEnd);
  const commented = block.split("\n").map(l => "'" + l).join("\n");
  codeInput.value = text.substring(0, lineStart) + commented + text.substring(blockEnd);
  codeInput.selectionStart = lineStart;
  codeInput.selectionEnd = lineStart + commented.length;
}

function uncommentLines() {
  const start = codeInput.selectionStart;
  const end = codeInput.selectionEnd;
  const text = codeInput.value;
  const before = text.substring(0, start);
  const lineStart = before.lastIndexOf("\n") + 1;
  const afterEnd = text.indexOf("\n", end);
  const blockEnd = afterEnd === -1 ? text.length : afterEnd;
  const block = text.substring(lineStart, blockEnd);
  const uncommented = block.split("\n").map(l => l.startsWith("'") ? l.slice(1) : l).join("\n");
  codeInput.value = text.substring(0, lineStart) + uncommented + text.substring(blockEnd);
  codeInput.selectionStart = lineStart;
  codeInput.selectionEnd = lineStart + uncommented.length;
}

// ─── Splitter drag ───────────────────────────────────────
let isDragging = false;
splitter.addEventListener("mousedown", (e) => {
  isDragging = true;
  splitter.classList.add("dragging");
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const container = inputFrame.parentElement!;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const total = rect.width - 6; // splitter width
  const pct = Math.max(15, Math.min(85, (x / total) * 100));
  inputFrame.style.flex = `0 0 ${pct}%`;
  outputFrame.style.flex = `0 0 ${100 - pct}%`;
  drawRulers();
});
document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    splitter.classList.remove("dragging");
  }
});

// ─── Rulers ──────────────────────────────────────────────
const DPI = 96; // CSS pixels per inch
const CM_PX = DPI / 2.54;

function drawRulers() {
  drawRulerH();
  drawRulerV();
}

function drawRulerH() {
  const canvas = rulerH;
  const parent = canvas.parentElement!;
  canvas.width = parent.clientWidth - 18; // minus ruler-v width
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#F5F5F5";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#AAA";
  ctx.fillStyle = "#888";
  ctx.font = "9px Segoe UI";
  ctx.textAlign = "center";

  // Scroll offset from output
  const scrollEl = output;
  const scrollLeft = scrollEl.scrollLeft || 0;

  const step = CM_PX; // 1 cm
  const startCm = Math.floor(scrollLeft / step);
  const endCm = Math.ceil((scrollLeft + w) / step);

  for (let cm = startCm; cm <= endCm; cm++) {
    const x = cm * step - scrollLeft;
    if (x < 0 || x > w) continue;

    ctx.beginPath();
    if (cm % 5 === 0) {
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
      ctx.fillText(`${cm}`, x, 10);
    } else {
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - 5);
      ctx.stroke();
    }
  }

  // Bottom line
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(w, h - 0.5);
  ctx.stroke();
}

function drawRulerV() {
  const canvas = rulerV;
  const parent = canvas.parentElement!;
  canvas.height = parent.clientHeight - 18; // minus ruler-h height
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#F5F5F5";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#AAA";
  ctx.fillStyle = "#888";
  ctx.font = "9px Segoe UI";
  ctx.textAlign = "center";

  const scrollTop = output.scrollTop || 0;

  const step = CM_PX;
  const startCm = Math.floor(scrollTop / step);
  const endCm = Math.ceil((scrollTop + h) / step);

  for (let cm = startCm; cm <= endCm; cm++) {
    const y = cm * step - scrollTop;
    if (y < 0 || y > h) continue;

    ctx.beginPath();
    if (cm % 5 === 0) {
      ctx.moveTo(w, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      ctx.save();
      ctx.translate(9, y);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${cm}`, 0, 0);
      ctx.restore();
    } else {
      ctx.moveTo(w, y);
      ctx.lineTo(w - 5, y);
      ctx.stroke();
    }
  }

  // Right line
  ctx.beginPath();
  ctx.moveTo(w - 0.5, 0);
  ctx.lineTo(w - 0.5, h);
  ctx.stroke();
}

// Redraw rulers on scroll/resize
output.addEventListener("scroll", drawRulers);
window.addEventListener("resize", drawRulers);
setTimeout(drawRulers, 100);

// ─── Keypad ──────────────────────────────────────────────
const KEYPAD_DATA: Record<string, { label: string; insert: string }[]> = {
  greek: [
    { label: "\u03B1", insert: "alpha" }, { label: "\u03B2", insert: "beta" },
    { label: "\u03B3", insert: "gamma" }, { label: "\u03B4", insert: "delta" },
    { label: "\u03B5", insert: "epsilon" }, { label: "\u03B6", insert: "zeta" },
    { label: "\u03B7", insert: "eta" }, { label: "\u03B8", insert: "theta" },
    { label: "\u03BB", insert: "lambda" }, { label: "\u03BC", insert: "mu" },
    { label: "\u03BD", insert: "nu" }, { label: "\u03BE", insert: "xi" },
    { label: "\u03C0", insert: "pi" }, { label: "\u03C1", insert: "rho" },
    { label: "\u03C3", insert: "sigma" }, { label: "\u03C4", insert: "tau" },
    { label: "\u03C6", insert: "phi" }, { label: "\u03C8", insert: "psi" },
    { label: "\u03C9", insert: "omega" },
    { label: "\u0393", insert: "Gamma" }, { label: "\u0394", insert: "Delta" },
    { label: "\u0398", insert: "Theta" }, { label: "\u039B", insert: "Lambda" },
    { label: "\u03A3", insert: "Sigma" }, { label: "\u03A6", insert: "Phi" },
    { label: "\u03A8", insert: "Psi" }, { label: "\u03A9", insert: "Omega" },
  ],
  operators: [
    { label: "+", insert: " + " }, { label: "\u2212", insert: " - " },
    { label: "\u00D7", insert: "*" }, { label: "\u00F7", insert: "/" },
    { label: "^", insert: "^" }, { label: "!", insert: "!" },
    { label: "\u221A", insert: "sqrt(" }, { label: "\u221B", insert: "cbrt(" },
    { label: "\u2261", insert: " == " }, { label: "\u2260", insert: " != " },
    { label: "<", insert: " < " }, { label: ">", insert: " > " },
    { label: "\u2264", insert: " <= " }, { label: "\u2265", insert: " >= " },
    { label: "\u2227", insert: " && " }, { label: "\u2228", insert: " || " },
    { label: "\u2211", insert: "sum(" }, { label: "\u220F", insert: "product(" },
    { label: "\u222B", insert: "integral(" },
  ],
  functions: [
    { label: "sin", insert: "sin(" }, { label: "cos", insert: "cos(" },
    { label: "tan", insert: "tan(" }, { label: "asin", insert: "asin(" },
    { label: "acos", insert: "acos(" }, { label: "atan", insert: "atan(" },
    { label: "ln", insert: "ln(" }, { label: "log", insert: "log(" },
    { label: "exp", insert: "exp(" }, { label: "abs", insert: "abs(" },
    { label: "sqrt", insert: "sqrt(" }, { label: "cbrt", insert: "cbrt(" },
    { label: "round", insert: "round(" }, { label: "floor", insert: "floor(" },
    { label: "ceil", insert: "ceiling(" }, { label: "min", insert: "min(" },
    { label: "max", insert: "max(" }, { label: "mod", insert: "mod(" },
    { label: "gcd", insert: "gcd(" }, { label: "lcm", insert: "lcm(" },
  ],
  blocks: [
    { label: "@{eq}", insert: "@{eq}\\n\\n@{end eq}" },
    { label: "@{plot}", insert: "@{plot}\\n\\n@{end plot}" },
    { label: "@{svg}", insert: "@{svg}\\n\\n@{end svg}" },
    { label: "@{three}", insert: "@{three}\\n\\n@{end three}" },
    { label: "@{draw}", insert: "@{draw}\\n\\n@{end draw}" },
    { label: "@{html}", insert: "@{html}\\n\\n@{end html}" },
    { label: "@{python}", insert: "@{python}\\n\\n@{end python}" },
    { label: "@{bash}", insert: "@{bash}\\n\\n@{end bash}" },
    { label: "@{js}", insert: "@{js}\\n\\n@{end js}" },
    { label: "@{columns}", insert: "@{columns 2}\\n\\n@{end columns}" },
    { label: "for", insert: "for i = 1 to 10\\n\\nnext" },
    { label: "if", insert: "if x > 0\\n\\nelse\\n\\nend if" },
  ],
  matrices: [
    // MATLAB syntax
    { label: "[1,2,3]", insert: "v = [1, 2, 3]" },
    { label: "[1;2;3]", insert: "v = [1; 2; 3]" },
    { label: "[;|]", insert: "M = [1, 2; 3, 4]" },
    // Python syntax
    { label: "[[r]]", insert: "v = [[1, 2, 3]]" },
    { label: "[[M]]", insert: "M = [[1, 2], [3, 4]]" },
    // Calcpad syntax
    { label: "[|]cp", insert: "M = [1; 2| 3; 4]" },
    // Operations
    { label: "det", insert: "det(" },
    { label: "transp", insert: "transpose(" },
    { label: "lsolve", insert: "lsolve(" },
    { label: "M[i,j]", insert: "M[1,1]" },
    { label: "zeros", insert: "matrix(3; 3)" },
    { label: "ident", insert: "identity(3)" },
  ],
};

function renderKeypad(tabName: string) {
  keypadContent.innerHTML = "";
  const items = KEYPAD_DATA[tabName] || [];
  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = item.label.length > 3 ? "key-btn wide" : "key-btn";
    btn.textContent = item.label;
    btn.dataset.insert = item.insert;
    btn.title = item.insert.replace(/\\n/g, "\u21B5");
    keypadContent.appendChild(btn);
  }
}

// Tab switching
document.querySelectorAll<HTMLButtonElement>(".keypad-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".keypad-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderKeypad(tab.dataset.tab!);
  });
});

// Initial keypad
renderKeypad("greek");

// ─── Print ───────────────────────────────────────────────
document.getElementById("btnPrint")?.addEventListener("click", () => {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Hekatan Calc Output</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:30px 40px;}</style></head>
    <body>${output.innerHTML}</body></html>`);
  win.document.close();
  win.print();
});

// ─── Init ────────────────────────────────────────────────
codeInput.value = EXAMPLES.calculo.code;
exampleSelect.value = "calculo";
updateLineNumbers();
updateSyntax();
runCode();

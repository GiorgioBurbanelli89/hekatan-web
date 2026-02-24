/**
 * Hekatan Editor — Main editor with examples, split view, CAS integration
 */
import { parse } from "hekatan-math/parser.js";
import { casManager } from "hekatan-math/cas/index.js";
import type { CASEngineName } from "hekatan-math/cas/index.js";

// ─── Examples ────────────────────────────────────────────
const CALCULO_CODE = `'# Calculo Basico
'Definicion de variables
a = 3
b = 4
c = sqrt(a^2 + b^2)

'Funciones trigonometricas
alpha = atan(b/a)
sin_a = sin(alpha)
cos_a = cos(alpha)

'Funcion de usuario
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)

'Area de circulo
r = 5
A = pi*r^2`;

const PLOT_CODE = `'# Grafico con anotaciones
@{plot}
x = -3.14 : 3.14
y = -1.5 : 1.5
y = sin(x) | color: #2196f3 | width: 2 | label: "sin(x)"
y = cos(x) | color: #f44336 | width: 2 | label: "cos(x)"
point 0 0 #333
point 1.5708 1 #2196f3 5
text 1.7 1.1 "pi/2, 1"
hline 1 #4caf50
hline -1 #4caf50
vline 0 #999
@{end plot}`;

const EQ_DEMO_CODE = `'# Ecuaciones Formateadas
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

const FEM_ASSEMBLY_CODE = `'# FEM Assembly - Ensamblaje de Rigidez
'Propiedades del elemento
E = 200000
A = 100
L = 1000

'Rigidez axial
k = E*A/L

'Matriz de rigidez local 2x2
K11 = k
K12 = -k
K21 = -k
K22 = k

'Ensamblaje 3 elementos en serie
'Nodo 1-2
K_global_11 = k
K_global_12 = -k
'Nodo 2 (contribucion de elem 1 y 2)
K_global_22 = k + k
K_global_23 = -k
'Nodo 3 (contribucion de elem 2 y 3)
K_global_33 = k + k
K_global_34 = -k
'Nodo 4
K_global_44 = k

'Fuerza aplicada en nodo 3
F3 = 1000
'Con nodo 1 fijo: u1=0
'Desplazamiento
u3 = F3/k`;

const VECTOR_CODE = `'# Operaciones con Vectores
'Definicion
v1 = {3; 4; 0}
v2 = {1; -2; 5}

'Magnitud
mag_v1 = sqrt(3^2 + 4^2 + 0^2)

'Producto punto
dot = 3*1 + 4*(-2) + 0*5

'Componentes
v1x = 3
v1y = 4
v1z = 0

'Suma de vectores
sx = v1x + 1
sy = v1y + (-2)
sz = v1z + 5`;

const MATRIX_CODE = `'# Operaciones con Matrices
'Matriz 3x3
a11 = 2
a12 = 1
a13 = 0
a21 = 1
a22 = 3
a23 = -1
a31 = 0
a32 = -1
a33 = 4

'Traza (suma diagonal)
traza = a11 + a22 + a33

'Determinante 2x2
det2 = a11*a22 - a12*a21

'Determinante 3x3 (expansion cofactores)
det3 = a11*(a22*a33 - a23*a32) - a12*(a21*a33 - a23*a31) + a13*(a21*a32 - a22*a31)

'Inversa 2x2 de submatriz
inv11 = a22/det2
inv12 = -a12/det2
inv21 = -a21/det2
inv22 = a11/det2`;

const CONTROL_FLOW_CODE = `'# Control de Flujo
'--- Ciclo #for ---
#for i = 1 to 5
x = i^2
#next

'--- Condicional #if ---
valor = 42
#if valor > 100
resultado = 1
#else if valor > 10
resultado = 2
#else
resultado = 3
#end if

'--- Ciclo #while ---
n = 1
suma = 0
#while n <= 10
suma = suma + n
n = n + 1
#loop

'--- Sumatoria ---
S = 0
#for k = 1 to 100
S = S + 1/k^2
#next`;

const THREE_CODE = `'# Escena 3D con Three.js
@{three}
// Cubo
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshPhongMaterial({color: 0x2196f3});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Esfera
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.8, 32, 32),
  new THREE.MeshPhongMaterial({color: 0xf44336})
);
sphere.position.set(3, 0, 0);
scene.add(sphere);

// Piso
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshPhongMaterial({color: 0xeeeeee, side: THREE.DoubleSide})
);
floor.rotation.x = Math.PI / 2;
floor.position.y = -1.5;
scene.add(floor);

// Grid
scene.add(new THREE.GridHelper(10, 10));
@{end three}`;

const SVG_CODE = `'# Dibujo SVG
@{svg}
<svg viewBox="0 0 400 300" style="max-width:400px;background:#fff;border:1px solid #ddd;">
  <rect x="50" y="50" width="300" height="200" fill="none" stroke="#333" stroke-width="2"/>
  <circle cx="200" cy="150" r="60" fill="#e3f2fd" stroke="#2196f3" stroke-width="2"/>
  <line x1="50" y1="150" x2="350" y2="150" stroke="#999" stroke-dasharray="5,3"/>
  <line x1="200" y1="50" x2="200" y2="250" stroke="#999" stroke-dasharray="5,3"/>
  <text x="200" y="30" text-anchor="middle" font-size="14" fill="#333">Dibujo SVG</text>
</svg>
@{end svg}`;

const CAS_CODE = `'# Calculo Simbolico (CAS)
'Para usar el editor CAS completo,
'ir a: /editor/index.html
'
'Operaciones soportadas:
' diff(sin(x)*x^2, x)     - Derivadas
' integrate(x^2, x)        - Integrales
' solve(x^2-4, x)          - Ecuaciones
' limit(sin(x)/x, x, 0)    - Limites
' series(exp(x), x, 0, 6)  - Series
' det([[1,2],[3,4]])        - Matrices
' dsolve(...)               - EDO
' laplace(sin(t), t, s)     - Laplace`;

const EXAMPLES: Record<string, { name: string; code: string }> = {
  calculo:      { name: "Calculo Basico",              code: CALCULO_CODE },
  plot:         { name: "@{plot} Graficos SVG",        code: PLOT_CODE },
  eq_demo:      { name: "@{eq} Ecuaciones",            code: EQ_DEMO_CODE },
  fem_assembly: { name: "FEM Assembly",                code: FEM_ASSEMBLY_CODE },
  vectores:     { name: "Vectores",                    code: VECTOR_CODE },
  matrices:     { name: "Matrices",                    code: MATRIX_CODE },
  control_flow: { name: "Control de Flujo",            code: CONTROL_FLOW_CODE },
  three:        { name: "@{three} 3D",                 code: THREE_CODE },
  svg:          { name: "@{svg} Dibujo",               code: SVG_CODE },
  cas:          { name: "CAS Simbolico (info)",        code: CAS_CODE },
};

// ─── DOM Setup ───────────────────────────────────────────
const codeInput = document.getElementById("codeInput") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const btnRun = document.getElementById("btnRun") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const exampleList = document.getElementById("exampleList") as HTMLUListElement;

// Populate examples
for (const [key, ex] of Object.entries(EXAMPLES)) {
  const li = document.createElement("li");
  li.textContent = ex.name;
  li.dataset.key = key;
  li.addEventListener("click", () => {
    codeInput.value = ex.code;
    document.querySelectorAll(".example-list li").forEach(el => el.classList.remove("active"));
    li.classList.add("active");
  });
  exampleList.appendChild(li);
}

// ─── Run ─────────────────────────────────────────────────
function runCode(): void {
  const code = codeInput.value;
  if (!code.trim()) { output.innerHTML = ""; return; }

  statusText.textContent = "Procesando...";
  btnRun.disabled = true;

  try {
    const result = parse(code);
    output.innerHTML = result.html;
    statusText.textContent = "Listo";
  } catch (e: any) {
    output.innerHTML = `<div class="line error">Error: ${e.message}</div>`;
    statusText.textContent = "Error";
  }

  btnRun.disabled = false;
}

btnRun.addEventListener("click", runCode);
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
  // Tab key
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, start) + "  " + codeInput.value.substring(end);
    codeInput.selectionStart = codeInput.selectionEnd = start + 2;
  }
});

// Load default
codeInput.value = EXAMPLES.calculo.code;
const firstLi = exampleList.querySelector("li");
if (firstLi) firstLi.classList.add("active");

statusText.textContent = "Listo — Ctrl+Enter para ejecutar";

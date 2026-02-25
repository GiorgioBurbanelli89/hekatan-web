/**
 * main.ts - Hekatan Math Editor
 * Dos modos:
 *   - Calculate: textarea + output HTML (split view)
 *   - MathCanvas: WYSIWYG canvas editor (como MathCAD)
 */
import { HekatanEvaluator, math } from "hekatan-math/mathEngine.js";
import type { LineResult, CellResult } from "hekatan-math/mathEngine.js";
import { MathEditor } from "hekatan-math/matheditor/MathEditor.js";
import { hitTest } from "hekatan-math/matheditor/CadInput.js";
import type { SnapPoint } from "hekatan-math/matheditor/CadSnap.js";

// ─── Ejemplos ───────────────────────────────────────────
const EXAMPLES: Record<string, { name: string; code: string }> = {
  basico: {
    name: "Basico",
    code: `# Hekatan Math Editor
> Ejemplo basico de ecuaciones

a = 3
b = 4
c = sqrt(a^2 + b^2)

d = (a + b) / (a - b)

M = [[1, 2], [3, 4]]
det(M)`,
  },
  svgdemo: {
    name: "SVG Drawing Demo",
    code: `# SVG Drawing DSL
> Ejemplo del lenguaje de dibujo vectorial @{svg}

## Viga simplemente apoyada
@{svg 550 180}
background #f0f8ff
rect 10 10 530 160 fill:#e3f2fd stroke:#1565c0 width:2 rx:8
line 80 110 470 110 stroke:#333 width:3
circle 80 110 6 fill:#1565c0 stroke:#0d47a1 width:2
circle 470 110 6 fill:#c62828 stroke:#b71c1c width:2
arrow 275 50 275 105 stroke:#e65100 width:2
text 275 40 "P = 10 kN" size:13 bold color:#e65100 anchor:middle
text 80 135 "A" size:14 bold color:#1565c0 anchor:middle
text 470 135 "B" size:14 bold color:#c62828 anchor:middle
text 275 135 "L/2" size:12 italic color:#555 anchor:middle
polygon 72,120 80,110 88,120 fill:#1565c0
polygon 462,120 470,110 478,120 fill:#c62828
line 462 120 478 120 stroke:#c62828 width:2
@{end svg}

## Datos
L = 6
P = 10
R_A = P/2
R_B = P/2
M_max = P*L/4`,
  },
  gridframe: {
    name: "Ej 5.1 - Grid Frame (Paz)",
    code: `# 5.5 Analisis de Grid Frames
> El analisis estructural de grid frames es matematicamente identico al
> analisis de vigas o porticos planos presentado en los capitulos 1 y 4.
> Estos analisis difieren solamente en la seleccion de coordenadas nodales
> y las expresiones correspondientes a la matriz de rigidez para los
> elementos de cada estructura.

## Ejemplo Ilustrativo 5.1
> Para el grid frame mostrado en la Figura 5.4, realizar el analisis
> estructural para determinar lo siguiente:
> (a) Desplazamientos en las juntas entre elementos
> (b) Fuerzas internas en los elementos
> (c) Reacciones en los apoyos
> Ref: Mario Paz - Matrix Structural Analysis, 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

@{draw 580 380}
# Fig 5.4 - Diagrama Estructural (3D oblicuo)
grid off
bg #ffffff
proj oblique 45 0.5
# Ejes de referencia
color #cc3333
arrow3d -4 0 0 -1 0 0
text3d -0.5 0 0 X
color #33aa33
arrow3d -4 0 0 -4 3 0
text3d -4 3.5 0 Y
color #3333cc
arrow3d -4 0 0 -4 0 3
text3d -4 0 3.5 Z
# Elem 1: Node1(0,0,0) to Node2(20,0,0) along X
color #333
line3d 0 0 0 20 0 0
# Elem 2: Node1(0,0,0) to Node3(0,20,0) along Y
line3d 0 0 0 0 20 0
# Nodos (circulos pequenos)
circle3d 0 0 0 0.15 #333
circle3d 20 0 0 0.15 #333
circle3d 0 20 0 0.15 #333
# Carga distribuida peine sobre Elem 2 (lineas cortas perpendiculares -Z)
color #cc0000
line3d 0 2 0 0 18 0
line3d 0 2 0 0 2 -2.5
line3d 0 4 0 0 4 -2.5
line3d 0 6 0 0 6 -2.5
line3d 0 8 0 0 8 -2.5
line3d 0 10 0 0 10 -2.5
line3d 0 12 0 0 12 -2.5
line3d 0 14 0 0 14 -2.5
line3d 0 16 0 0 16 -2.5
line3d 0 18 0 0 18 -2.5
line3d 0 2 -2.5 0 18 -2.5
text3d 0 11 -4 w = 0.1 k/in
# Fuerza puntual en Node 1 hacia -Z
arrow3d 0 0 5 0 0 0.5
text3d 1 0 5.5 10 k
# Momento en L/2 del Elem 1
color #9900cc
carc3d 10 0 0 1.5 0.3 5.2
text3d 10 0 2.5 200 k-in
# Apoyo empotrado en Node 2 (muro + rayado)
color #333
line3d 20 0 -1.5 20 0 1.5
line3d 20 0 1.5 21 0 1
line3d 20 0 1 21 0 0.5
line3d 20 0 0.5 21 0 0
line3d 20 0 0 21 0 -0.5
line3d 20 0 -0.5 21 0 -1
line3d 20 0 -1 21 0 -1.5
# Apoyo empotrado en Node 3 (muro + rayado)
line3d 0 20 -1.5 0 20 1.5
line3d 0 20 1.5 0 21 1
line3d 0 20 1 0 21 0.5
line3d 0 20 0.5 0 21 0
line3d 0 20 0 0 21 -0.5
line3d 0 20 -0.5 0 21 -1
line3d 0 20 -1 0 21 -1.5
# Labels nodos
color #333
text3d -1.5 0 -1 1
text3d 20.5 0 -1 2
text3d 0.5 21 0.5 3
# Labels elementos
color #0066cc
text3d 10 0 1.5 Elem 1
text3d 0 10 1.5 Elem 2
# Propiedades
color #666
text3d 12 0 -6 I=100 in^4, J=50 in^4
text3d 12 0 -7.5 E=30000, G=12000 ksi
text3d 12 0 -9 L1=L2=20 ft
fit
@{end draw}
> **Fig. 5.4** Grid frame - Ejemplo Ilustrativo 5.1

@{draw 580 380}
# Fig 5.5 - Grados de Libertad (DOF)
grid off
bg #ffffff
proj oblique 45 0.5
# Elementos (lineas finas)
color #aaa
line3d 0 0 0 20 0 0
line3d 0 0 0 0 20 0
# Nodos
color #333
circle3d 0 0 0 0.2
circle3d 20 0 0 0.2
circle3d 0 20 0 0.2
text3d 0 0 -2 Node 1
text3d 20 0 -2 Node 2
text3d 0 20.5 -1.5 Node 3
# Angulo 90
color #999
line3d 2.5 0 0 2.5 2.5 0
line3d 0 2.5 0 2.5 2.5 0
text3d 3.5 3 0 90
# DOFs Node 1 (u1=theta_x, u2=theta_y, u3=w)
color #cc0000
arrow3d 0 0 0 0 0 5
text3d 0.5 0 5.5 u3
arrow3d 0 0 0 4 0 0
text3d 4.5 0 0.5 u1
arrow3d 0 0 0 0 4 0
text3d 0.3 4.5 0 u2
# DOFs Node 2 (u4=theta_x, u5=theta_y, u6=w)
color #0066cc
arrow3d 20 0 0 20 0 5
text3d 20.5 0 5.5 u6
arrow3d 20 0 0 24 0 0
text3d 24.5 0 0.5 u4
arrow3d 20 0 0 20 4 0
text3d 20.3 4.5 0 u5
# DOFs Node 3 (u7=theta_x, u8=theta_y, u9=w)
color #33aa33
arrow3d 0 20 0 0 20 5
text3d 0.5 20 5.5 u9
arrow3d 0 20 0 4 20 0
text3d 4.5 20 0.5 u7
arrow3d 0 20 0 0 24 0
text3d 0.3 24.5 0 u8
# Apoyo empotrado Node 2
color #333
line3d 20 0 -1.5 20 0 1.5
line3d 20 0 1.5 21 0 1
line3d 20 0 1 21 0 0.5
line3d 20 0 0.5 21 0 0
line3d 20 0 0 21 0 -0.5
line3d 20 0 -0.5 21 0 -1
line3d 20 0 -1 21 0 -1.5
# Apoyo empotrado Node 3
line3d 0 20 -1.5 0 20 1.5
line3d 0 20 1.5 0 21 1
line3d 0 20 1 0 21 0.5
line3d 0 20 0.5 0 21 0
line3d 0 20 0 0 21 -0.5
line3d 0 20 -0.5 0 21 -1
line3d 0 20 -1 0 21 -1.5
# Ejes
color #cc3333
arrow3d -4 0 0 -1 0 0
text3d -0.5 0 0 X
color #33aa33
arrow3d -4 0 0 -4 3 0
text3d -4 3.5 0 Y
color #3333cc
arrow3d -4 0 0 -4 0 3
text3d -4 0 3.5 Z
# Titulo
color #333
text3d 10 0 -6 Fig 5.5 - DOFs del Grid Frame
fit
@{end draw}
> **Fig. 5.5** Grid frame modelado con coordenadas nodales u_1 a u_9

## 1. Propiedades
> W 14 x 82 - Todos los miembros
@{cells} |L = 100|I_z = 882|J_t = 5.08|
@{cells} |E_s = 29000|G_s = 11600|

## 2. Coeficientes de Rigidez
@{cells} |t_1 = G_s*J_t/L|a_4 = 4*E_s*I_z/L|a_2 = 2*E_s*I_z/L|
@{cells} |b_6 = 6*E_s*I_z/L^2|c_12 = 12*E_s*I_z/L^3|

## 3. Matriz de Rigidez Local [k] (eq 5.7)
> DOF: [theta_x, theta_z, delta_y] por nodo
k = [[t_1,0,0,-t_1,0,0],[0,a_4,b_6,0,a_2,-b_6],[0,b_6,c_12,0,b_6,-c_12],[-t_1,0,0,t_1,0,0],[0,a_2,b_6,0,a_4,-b_6],[0,-b_6,-c_12,0,-b_6,c_12]]

## 4. Transformacion Elemento 2
> Elem 2: theta=90 grados (eq 5.11)
T_2 = [[0,-1,0,0,0,0],[1,0,0,0,0,0],[0,0,1,0,0,0],[0,0,0,0,-1,0],[0,0,0,1,0,0],[0,0,0,0,0,1]]

## 5. Rigidez Global Elemento 2
> kb2 = T2' * k * T2 (eq 5.15)
kb2 = transpose(T_2) * k * T_2

## 6. Ensamblaje [K]_R
> Nodo 2 (libre) = extremo j Elem 1 (DOFs 4:6) + extremo i Elem 2 (DOFs 1:3)
k1R = k[4:6, 4:6]
k2R = kb2[1:3, 1:3]
K_R = k1R + k2R

## 7. Fuerzas de Empotramiento
> Elem 1: M_0=200 kip*in a L/2, Apendice I Caso (b) (eq e)
@{cells} |L_1 = L/2|L_2 = L/2|M_0 = 200|
> Q_1=6*M_0*L_1*L_2/L^3, Q_2=M_0*L_2*(2*L_1-L_2)/L^2, Q_3=-Q_1, Q_4=M_0*L_1*(2*L_2-L_1)/L^2
@{cells} |Q_1 = 6*M_0*L_1*L_2/L^3|Q_2 = M_0*L_2*(2*L_1 - L_2)/L^2|
@{cells} |Q_3 = -Q_1|Q_4 = M_0*L_1*(2*L_2 - L_1)/L^2|
> DOF grid [theta_x, theta_z, delta_y]: Q_f = [0, Q2, Q1, 0, Q4, Q3]
Q_f1 = [[0], [Q_2], [Q_1], [0], [Q_4], [Q_3]]
> Elem 2: w=0.1 kip/in, Apendice I Caso (a) (eq f)
@{cells} |w_0 = 0.1|
> M_i=wL^2/12, V_i=wL/2, M_j=-wL^2/12, V_j=wL/2
Q_f2L = [[0], [w_0*L^2/12], [w_0*L/2], [0], [-w_0*L^2/12], [w_0*L/2]]
> Q_f global via T_2'
Q_f2 = transpose(T_2) * Q_f2L

## 8. Vector de Fuerzas Reducido
> {F}_R = P - Q_f1(4:6) - Q_f2(1:3) (eq g)
P_d = [[0], [0], [-10]]
F_R = P_d - Q_f1[4:6, 1:1] - Q_f2[1:3, 1:1]

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R
u = lusolve(K_R, F_R)

## 10. Desplazamientos Locales
> Componentes: theta_x, theta_z, delta_y
@{cells} |u_1 = u[1,1]|u_2 = u[2,1]|u_3 = u[3,1]|
> Elem 1 (T_1=I): nodo 2 libre, nodo 1 empotrado
d_1 = [[u_1], [u_2], [u_3], [0], [0], [0]]
> Elem 2: d_2 = T_2 * d_1 (T_1=I, mismo vector global)
d_2 = T_2 * d_1

## 11. Fuerzas en Elementos (eq 4.20)
> {P} = [k]{d} + {Q_f}
P_1 = k * d_1 + Q_f1
> Elem 2 (Q_f en locales):
P_2 = k * d_2 + Q_f2L

## 12. Reacciones en Apoyos
> Nodo 1 (empotrado):
@{cells} |R_1 = P_1[4,1]|R_2 = P_1[5,1]|R_3 = P_1[6,1]|
> Nodo 3 (empotrado):
Pb2 = transpose(T_2) * P_2
@{cells} |R_7 = Pb2[4,1]|R_8 = Pb2[5,1]|R_9 = Pb2[6,1]|`,
  },
  vectores: {
    name: "Vectores y Matrices",
    code: `# Vectores y Matrices

## Vectores
v1 = [3, 4, 0]
v2 = [1, -2, 5]

> Producto punto
d = dot(v1, v2)

> Norma
n = norm(v1)

## Matrices
A = [[2, 1], [5, 3]]
B = [[1, 0], [0, 1]]

> Multiplicacion
C = multiply(A, B)

> Determinante
det_A = det(A)

> Inversa
A_inv = inv(A)

> Sistema lineal: A*x = b
b_vec = [[7], [19]]
x = lusolve(A, b_vec)`,
  },
  drawdemo: {
    name: "Draw / CAD",
    code: `# CAD Drawing Demo
> Bloques @{draw} para dibujo tecnico con comandos CLI

## Seccion transversal de viga

@{draw 500 350}
rect 0 0 30 50
rect 2.5 2.5 25 45
circle 5 5 1.2
circle 25 5 1.2
circle 5 45 1.2
circle 25 45 1.2
circle 15 25 1.2
hdim 0 0 30 0 -5
vdim 30 0 30 50 5
@{end draw}

## Planta de columnas

@{draw 500 300}
rect 0 0 20 8
rect 0 12 20 8
rect 0 0 8 20
rect 12 0 8 20
circle 4 4 1
circle 16 4 1
circle 4 16 1
circle 16 16 1
hdim 0 0 20 0 -3
vdim 20 0 20 20 3
@{end draw}

b = 30
h = 50
A_s = pi * 1.2^2 * 4`,
  },
  calculo: {
    name: "Calculo",
    code: `# Calculo Basico
> Operaciones aritmeticas y funciones

a = 3
b = 4
c = sqrt(a^2 + b^2)

> Trigonometria
alpha = atan2(b, a)
sin_a = sin(alpha)
cos_a = cos(alpha)

> Funcion personalizada
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
f(3)

> Area de circulo
r = 5
A = pi * r^2`,
  },
};

// ─── DOM ────────────────────────────────────────────────
const codeInput = document.getElementById("codeInput") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const exampleSelect = document.getElementById("exampleSelect") as HTMLSelectElement;
const chkAutoRun = document.getElementById("chkAutoRun") as HTMLInputElement;
const tabCode = document.getElementById("tabCode") as HTMLButtonElement;
const tabCanvas = document.getElementById("tabCanvas") as HTMLButtonElement;
const btnRun = document.getElementById("btnRun") as HTMLButtonElement;
const btnCad = document.getElementById("btnCad") as HTMLButtonElement;
const themeSelect = document.getElementById("themeSelect") as HTMLSelectElement;
const codeMode = document.getElementById("codeMode") as HTMLDivElement;
const canvasMode = document.getElementById("canvasMode") as HTMLDivElement;
const mathCanvasEl = document.getElementById("mathCanvas") as HTMLCanvasElement;

// ─── MathEditor (WYSIWYG canvas) ────────────────────────
const editor = new MathEditor(mathCanvasEl);

// ─── CAD Floating Toolbar + Interactive Drawing ──────────
let activeDrawBlock: any = null;
let cadToolbarVisible = false;

// ── Drawing state machine ──
type DrawTool = "line" | "rect" | "rrect" | "circle" | "ellipse" | "arc" | "pline" | "dim" | "hdim" | "vdim" | null;
let drawTool: DrawTool = null;
let drawPoints: { wx: number; wy: number }[] = [];
let drawMouseWorld: { wx: number; wy: number } | null = null;
let currentSnap: SnapPoint | null = null;  // snap activo bajo cursor

// Interactive tools that use mouse clicks on canvas
const INTERACTIVE_TOOLS = new Set<string>([
  "line", "rect", "rrect", "circle", "ellipse", "arc", "pline",
  "dim", "hdim", "vdim",
]);
// Commands that need CLI parameters (non-interactive)
const CLI_PARAM_CMDS = new Set([
  "move", "copy", "mirror", "rotate",
  "color", "scale", "unit", "bg", "stirrup", "colsection",
]);

// Create floating toolbar DOM
const cadToolbar = document.createElement("div");
cadToolbar.className = "cad-toolbar hidden";
cadToolbar.innerHTML = `
  <span class="drag-handle" title="Arrastrar">⠿</span>
  <button class="tool-draw" data-cmd="line" title="Linea (L)">Linea</button>
  <button class="tool-draw" data-cmd="rect" title="Rectangulo (R)">Rect</button>
  <button class="tool-draw" data-cmd="rrect" title="Rect redondeado">RRect</button>
  <button class="tool-draw" data-cmd="circle" title="Circulo (C)">Circulo</button>
  <button class="tool-draw" data-cmd="ellipse" title="Elipse (E)">Elipse</button>
  <button class="tool-draw" data-cmd="arc" title="Arco (A)">Arco</button>
  <button class="tool-draw" data-cmd="pline" title="Polilinea (PL)">PLine</button>
  <span class="sep">|</span>
  <button class="tool-dim" data-cmd="dim" title="Cota alineada">Cota</button>
  <button class="tool-dim" data-cmd="hdim" title="Cota horizontal">H-Cota</button>
  <button class="tool-dim" data-cmd="vdim" title="Cota vertical">V-Cota</button>
  <span class="sep">|</span>
  <button class="tool-edit" data-cmd="move" title="Mover (MV)">Mover</button>
  <button class="tool-edit" data-cmd="copy" title="Copiar (CP)">Copiar</button>
  <button class="tool-edit" data-cmd="mirror" title="Espejo (MI)">Espejo</button>
  <button class="tool-edit" data-cmd="rotate" title="Rotar (RO)">Rotar</button>
  <span class="sep">|</span>
  <button class="tool-view" data-cmd="fit" title="Encuadrar (ZF)">Encuadrar</button>
  <button class="tool-view" data-cmd="grid" title="Toggle grid">Grid</button>
  <button class="tool-view" data-cmd="labels on" title="Mostrar cotas auto">Labels</button>
  <span class="sep">|</span>
  <button class="tool-danger" data-cmd="undo" title="Deshacer (U)">↺ Undo</button>
  <button class="tool-danger" data-cmd="del" title="Eliminar ultimo">✕ Del</button>
  <button class="tool-danger" data-cmd="clear" title="Borrar todo">Clear</button>
  <span class="sep">|</span>
  <button class="tool-toggle snap-on" data-toggle="snap" title="Snap (F3)">Snap</button>
  <button class="tool-toggle" data-toggle="ortho" title="Ortho (F8)">Ortho</button>
  <button class="tool-toggle" data-toggle="track" title="Tracking (F11)">Track</button>
  <span class="sep">|</span>
  <input type="text" class="cad-cli" placeholder="Comando CLI..." title="Escribir comando y Enter">
  <span class="sep">|</span>
  <span class="coord-display" id="coordDisplay">X: — Y: —</span>
  <span class="sep">|</span>
  <button class="tool-close" data-action="close" title="Cerrar toolbar">✕</button>
`;
const canvasContainer = canvasMode.querySelector(".canvas-container")!;
canvasContainer.appendChild(cadToolbar);

const coordDisplay = cadToolbar.querySelector("#coordDisplay") as HTMLSpanElement;

// ── Overlay canvas for interactive drawing ──
const cadOverlay = document.createElement("canvas");
cadOverlay.className = "cad-overlay hidden";
cadOverlay.tabIndex = -1;  // focusable for keyboard events
canvasContainer.appendChild(cadOverlay);

// ─── Prevent toolbar clicks from propagating to canvas/editor ──
cadToolbar.addEventListener("mousedown", (e) => { e.stopPropagation(); });
cadToolbar.addEventListener("pointerdown", (e) => { e.stopPropagation(); });

// ─── Drag logic ──────────────────────────────────────────
{
  const handle = cadToolbar.querySelector(".drag-handle") as HTMLElement;
  let dragging = false, dragX = 0, dragY = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    dragX = e.clientX - cadToolbar.offsetLeft;
    dragY = e.clientY - cadToolbar.offsetTop;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const parent = cadToolbar.parentElement!;
    const maxX = parent.clientWidth - cadToolbar.offsetWidth;
    const maxY = parent.clientHeight - cadToolbar.offsetHeight;
    cadToolbar.style.left = Math.max(0, Math.min(maxX, e.clientX - dragX)) + "px";
    cadToolbar.style.top = Math.max(0, Math.min(maxY, e.clientY - dragY)) + "px";
  });

  document.addEventListener("mouseup", () => { dragging = false; });
}

// ─── Activate a drawing tool ─────────────────────────────
function activateDrawTool(tool: DrawTool) {
  // Deactivate previous
  cadToolbar.querySelectorAll("button.tool-active").forEach(b => b.classList.remove("tool-active"));

  drawTool = tool;
  drawPoints = [];
  drawMouseWorld = null;

  if (tool) {
    // Highlight active button
    const btn = cadToolbar.querySelector(`button[data-cmd="${tool}"]`);
    if (btn) btn.classList.add("tool-active");
    showOverlay();
  } else {
    hideOverlay();
  }
}

// ─── Show/hide overlay positioned over active draw block ──
function showOverlay() {
  if (!activeDrawBlock) return;
  const block = activeDrawBlock;
  const scrollY = editor.scrollOffset;

  cadOverlay.width = block.drawW;
  cadOverlay.height = block.drawH;
  cadOverlay.style.left = (block.x + 2) + "px";
  cadOverlay.style.top = (block.y + 2 - scrollY) + "px";
  cadOverlay.style.width = block.drawW + "px";
  cadOverlay.style.height = block.drawH + "px";
  cadOverlay.classList.remove("hidden");
  cadOverlay.focus();
}

function hideOverlay() {
  cadOverlay.classList.add("hidden");
  drawTool = null;
  drawPoints = [];
  drawMouseWorld = null;
  cadToolbar.querySelectorAll("button.tool-active").forEach(b => b.classList.remove("tool-active"));
  clearOverlay();
}

function clearOverlay() {
  const ctx = cadOverlay.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, cadOverlay.width, cadOverlay.height);
}

// ─── Check if shape has enough points to commit ──────────
function isShapeComplete(tool: string, pts: { wx: number; wy: number }[]): boolean {
  switch (tool) {
    case "line": return pts.length >= 2;
    case "rect": case "rrect": return pts.length >= 2;
    case "circle": return pts.length >= 2;
    case "ellipse": return pts.length >= 2;
    case "arc": return pts.length >= 3;
    case "dim": case "hdim": case "vdim": return pts.length >= 2;
    // pline: never auto-complete, right-click to finish
    default: return false;
  }
}

// ─── Commit shape to CadEngine ───────────────────────────
function commitShape(tool: string, pts: { wx: number; wy: number }[]) {
  if (!activeDrawBlock) return;
  const engine = activeDrawBlock.cadEngine;
  const u = (v: number) => engine.toU(v);
  let cmd = "";

  switch (tool) {
    case "line": {
      cmd = `line ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "rect": {
      const x = Math.min(pts[0].wx, pts[1].wx);
      const y = Math.min(pts[0].wy, pts[1].wy);
      const w = Math.abs(pts[1].wx - pts[0].wx);
      const h = Math.abs(pts[1].wy - pts[0].wy);
      cmd = `rect ${u(x)} ${u(y)} ${u(w)} ${u(h)}`;
      break;
    }
    case "rrect": {
      const x = Math.min(pts[0].wx, pts[1].wx);
      const y = Math.min(pts[0].wy, pts[1].wy);
      const w = Math.abs(pts[1].wx - pts[0].wx);
      const h = Math.abs(pts[1].wy - pts[0].wy);
      const r = Math.min(w, h) * 0.15;
      cmd = `rrect ${u(x)} ${u(y)} ${u(w)} ${u(h)} ${u(r)}`;
      break;
    }
    case "circle": {
      const r = engine.D(pts[0].wx, pts[0].wy, pts[1].wx, pts[1].wy);
      cmd = `circle ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(r)}`;
      break;
    }
    case "ellipse": {
      const rx = Math.abs(pts[1].wx - pts[0].wx);
      const ry = Math.abs(pts[1].wy - pts[0].wy);
      cmd = `ellipse ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(rx)} ${u(ry)}`;
      break;
    }
    case "arc": {
      cmd = `arc ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)} ${u(pts[2].wx)} ${u(pts[2].wy)}`;
      break;
    }
    case "pline": {
      if (pts.length < 2) return;
      const coords = pts.map(p => `${u(p.wx)} ${u(p.wy)}`).join(" ");
      cmd = `pline ${coords}`;
      break;
    }
    case "dim": {
      cmd = `dim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "hdim": {
      cmd = `hdim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
    case "vdim": {
      cmd = `vdim ${u(pts[0].wx)} ${u(pts[0].wy)} ${u(pts[1].wx)} ${u(pts[1].wy)}`;
      break;
    }
  }

  if (cmd) {
    engine.exec(cmd);
    activeDrawBlock.code += (activeDrawBlock.code ? "\n" : "") + cmd;
    editor.render();
    // Reposition overlay after re-render
    showOverlay();
  }
}

// ─── Render preview on overlay ───────────────────────────
function renderOverlayPreview() {
  const ctx = cadOverlay.getContext("2d");
  if (!ctx || !activeDrawBlock) return;
  ctx.clearRect(0, 0, cadOverlay.width, cadOverlay.height);

  if (!drawTool || drawPoints.length === 0 || !drawMouseWorld) return;

  const engine = activeDrawBlock.cadEngine;

  ctx.save();
  ctx.strokeStyle = "#0088ff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);

  const p = drawPoints;
  const m = drawMouseWorld;

  switch (drawTool) {
    case "line": case "dim": case "hdim": case "vdim": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      }
      break;
    }
    case "rect": case "rrect": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath();
        ctx.rect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
        ctx.stroke();
      }
      break;
    }
    case "circle": {
      if (p.length === 1) {
        const sc = engine.w2s(p[0].wx, p[0].wy);
        const se = engine.w2s(m.wx, m.wy);
        const r = Math.sqrt((se.x - sc.x) ** 2 + (se.y - sc.y) ** 2);
        ctx.beginPath(); ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "ellipse": {
      if (p.length === 1) {
        const sc = engine.w2s(p[0].wx, p[0].wy);
        const se = engine.w2s(m.wx, m.wy);
        const rx = Math.abs(se.x - sc.x);
        const ry = Math.abs(se.y - sc.y);
        ctx.beginPath(); ctx.ellipse(sc.x, sc.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case "arc": {
      if (p.length === 1) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      } else if (p.length === 2) {
        const s1 = engine.w2s(p[0].wx, p[0].wy);
        const sc = engine.w2s(p[1].wx, p[1].wy);
        const s2 = engine.w2s(m.wx, m.wy);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y);
        ctx.quadraticCurveTo(sc.x, sc.y, s2.x, s2.y); ctx.stroke();
      }
      break;
    }
    case "pline": {
      // Draw all segments so far + line to mouse
      if (p.length >= 1) {
        const s0 = engine.w2s(p[0].wx, p[0].wy);
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < p.length; i++) {
          const si = engine.w2s(p[i].wx, p[i].wy);
          ctx.lineTo(si.x, si.y);
        }
        const sm = engine.w2s(m.wx, m.wy);
        ctx.lineTo(sm.x, sm.y);
        ctx.stroke();
      }
      break;
    }
  }

  // Draw collected points as markers
  ctx.setLineDash([]);
  ctx.fillStyle = "#0088ff";
  for (const pt of p) {
    const s = engine.w2s(pt.wx, pt.wy);
    ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  // Draw crosshair at mouse
  const ms = engine.w2s(m.wx, m.wy);
  ctx.strokeStyle = "rgba(0,136,255,0.3)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(ms.x, 0); ctx.lineTo(ms.x, cadOverlay.height);
  ctx.moveTo(0, ms.y); ctx.lineTo(cadOverlay.width, ms.y);
  ctx.stroke();

  ctx.restore();

  // Draw tracking lines (fuera del save/restore del preview)
  const trackLines = engine.snap.getTrackingLines(engine, m.wx, m.wy);
  if (trackLines.length > 0) {
    engine.snap.drawTrackingLines(ctx, engine, trackLines);
  }

  // Draw snap marker
  if (currentSnap) {
    engine.snap.drawSnapMarker(ctx, engine, currentSnap.x, currentSnap.y, currentSnap.t, currentSnap.c);
  }
}

// ─── Overlay mouse handlers ──────────────────────────────
cadOverlay.addEventListener("mousemove", (e) => {
  if (!activeDrawBlock) return;
  const rect = cadOverlay.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const engine = activeDrawBlock.cadEngine;
  let w = engine.s2w(sx, sy);
  let wx = w.x, wy = w.y;

  // 1) Object snap (F3)
  currentSnap = engine.snap.findSnap(engine, wx, wy);
  if (currentSnap) { wx = currentSnap.x; wy = currentSnap.y; }

  // 2) Grid snap (if no object snap)
  if (!currentSnap && engine.gridOn) {
    const gs = engine.snap.gridSnap(engine, wx, wy);
    wx = gs.x; wy = gs.y;
  }

  // 3) Ortho constraint (F8) - only when drawing with at least 1 point
  if (engine.snap.orthoOn && drawPoints.length > 0) {
    const last = drawPoints[drawPoints.length - 1];
    const ort = engine.snap.orthoSnap(last.wx, last.wy, wx, wy);
    wx = ort.x; wy = ort.y;
  }

  drawMouseWorld = { wx, wy };

  // Update coordinate display
  const ux = engine.toU(wx), uy = engine.toU(wy);
  coordDisplay.textContent = `X: ${engine.F(ux)}  Y: ${engine.F(uy)}`;

  if (drawTool) renderOverlayPreview();
});

cadOverlay.addEventListener("mousedown", (e) => {
  if (!activeDrawBlock || e.button !== 0) return;
  const engine = activeDrawBlock.cadEngine;

  // Si no hay herramienta activa: hit test para seleccion
  if (!drawTool) {
    const rect = cadOverlay.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = engine.s2w(sx, sy);
    const idx = hitTest(engine, w.x, w.y);
    if (idx >= 0) {
      engine.formaSel = idx;
      engine.selectedShapes = [idx];
    } else {
      engine.formaSel = -1;
      engine.selectedShapes = [];
    }
    editor.render();
    showOverlay();
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Usa las coordenadas ya snapped del mousemove
  const wx = drawMouseWorld ? drawMouseWorld.wx : 0;
  const wy = drawMouseWorld ? drawMouseWorld.wy : 0;

  drawPoints.push({ wx, wy });

  // Actualizar pIni para perpendicular/tracking
  if (drawPoints.length === 1) {
    engine.snap.pIni = { x: wx, y: wy };
  }

  if (isShapeComplete(drawTool, drawPoints)) {
    const savedTool = drawTool;
    commitShape(drawTool, drawPoints);
    drawPoints = [];
    engine.snap.pIni = null;
    engine.snap.invalidateCache();
    // Stay in same tool for continuous drawing
    drawTool = savedTool;
  }

  renderOverlayPreview();
  e.preventDefault();
  e.stopPropagation();
});

// Right-click: finish pline or cancel current shape
cadOverlay.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (drawTool === "pline" && drawPoints.length >= 2) {
    commitShape("pline", drawPoints);
    drawPoints = [];
    renderOverlayPreview();
  } else if (drawPoints.length > 0) {
    drawPoints = [];
    renderOverlayPreview();
  } else {
    activateDrawTool(null);
  }
});

// Keyboard on overlay: Escape to cancel, F3/F8/F11 toggles
cadOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (drawPoints.length > 0) {
      drawPoints = [];
      renderOverlayPreview();
    } else {
      activateDrawTool(null);
    }
    e.preventDefault();
    e.stopPropagation();
  } else if (e.key === "F3" && activeDrawBlock) {
    toggleSnapOrtho("snap");
    e.preventDefault();
  } else if (e.key === "F8" && activeDrawBlock) {
    toggleSnapOrtho("ortho");
    e.preventDefault();
  } else if (e.key === "F11" && activeDrawBlock) {
    toggleSnapOrtho("track");
    e.preventDefault();
  } else if (e.key === "Delete" && activeDrawBlock) {
    const engine = activeDrawBlock.cadEngine;
    if (engine.selectedShapes.length > 0) {
      // Delete selected shapes (reverse order)
      const sorted = [...engine.selectedShapes].sort((a, b) => b - a);
      for (const idx of sorted) engine.formas.splice(idx, 1);
      engine.selectedShapes = [];
      engine.formaSel = -1;
      engine.saveHist();
      engine.snap.invalidateCache();
      editor.render();
      showOverlay();
    }
    e.preventDefault();
  }
});

// Mouse wheel on overlay: zoom in/out
cadOverlay.addEventListener("wheel", (e) => {
  if (!activeDrawBlock) return;
  e.preventDefault();
  const engine = activeDrawBlock.cadEngine;
  const rect = cadOverlay.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // World position under cursor before zoom
  const wBefore = engine.s2w(sx, sy);

  // Zoom factor
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  engine.cam.zoom = Math.max(engine.cam.minZoom, Math.min(engine.cam.maxZoom, engine.cam.zoom * factor));

  // World position under cursor after zoom
  const wAfter = engine.s2w(sx, sy);

  // Pan to keep point under cursor
  engine.cam.x += wBefore.x - wAfter.x;
  engine.cam.y += wBefore.y - wAfter.y;

  // Re-render
  editor.render();
  showOverlay();
  if (drawTool) renderOverlayPreview();
}, { passive: false });

// Middle mouse button drag: pan
{
  let panning = false, panStartX = 0, panStartY = 0, panStartCamX = 0, panStartCamY = 0;

  cadOverlay.addEventListener("mousedown", (e) => {
    if (e.button === 1 && activeDrawBlock) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartCamX = activeDrawBlock.cadEngine.cam.x;
      panStartCamY = activeDrawBlock.cadEngine.cam.y;
      cadOverlay.style.cursor = "grabbing";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!panning || !activeDrawBlock) return;
    const engine = activeDrawBlock.cadEngine;
    const dx = (e.clientX - panStartX) / engine.cam.zoom;
    const dy = (e.clientY - panStartY) / engine.cam.zoom;
    engine.cam.x = panStartCamX - dx;
    engine.cam.y = panStartCamY + dy;  // Y inverted
    editor.render();
    showOverlay();
    if (drawTool) renderOverlayPreview();
  });

  document.addEventListener("mouseup", (e) => {
    if (panning) {
      panning = false;
      cadOverlay.style.cursor = "crosshair";
    }
  });
}

// ─── Toggle snap/ortho/track ─────────────────────────────
function toggleSnapOrtho(which: "snap" | "ortho" | "track") {
  if (!activeDrawBlock) return;
  const snap = activeDrawBlock.cadEngine.snap;
  if (which === "snap") snap.snapOn = !snap.snapOn;
  else if (which === "ortho") snap.orthoOn = !snap.orthoOn;
  else if (which === "track") snap.trackingOn = !snap.trackingOn;
  updateToggleButtons();
}

function updateToggleButtons() {
  if (!activeDrawBlock) return;
  const snap = activeDrawBlock.cadEngine.snap;
  cadToolbar.querySelectorAll("button[data-toggle]").forEach((btn) => {
    const t = (btn as HTMLElement).dataset.toggle;
    const on = t === "snap" ? snap.snapOn : t === "ortho" ? snap.orthoOn : snap.trackingOn;
    btn.classList.toggle("snap-on", on);
  });
}

// ─── Button click handler ────────────────────────────────
cadToolbar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "close") {
    toggleCadToolbar(false);
    return;
  }

  // Toggle buttons (snap/ortho/track)
  const toggle = btn.dataset.toggle;
  if (toggle) {
    toggleSnapOrtho(toggle as "snap" | "ortho" | "track");
    return;
  }

  const cmd = btn.dataset.cmd;
  if (!cmd || !activeDrawBlock) return;

  if (INTERACTIVE_TOOLS.has(cmd)) {
    // Interactive drawing tool → activate overlay
    activateDrawTool(cmd as DrawTool);
  } else if (CLI_PARAM_CMDS.has(cmd)) {
    // Pre-fill CLI input with command and focus
    cliInput.value = cmd + " ";
    cliInput.focus();
    cliInput.setSelectionRange(cliInput.value.length, cliInput.value.length);
  } else {
    // Immediate command (fit, grid, undo, del, clear, labels)
    activeDrawBlock.cadEngine.exec(cmd);
    editor.render();
    if (drawTool) showOverlay();  // reposition if overlay active
  }
});

// ─── CLI input ───────────────────────────────────────────
const cliInput = cadToolbar.querySelector(".cad-cli") as HTMLInputElement;
cliInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && activeDrawBlock) {
    const cmd = cliInput.value.trim();
    if (cmd) {
      activeDrawBlock.cadEngine.exec(cmd);
      activeDrawBlock.code += (activeDrawBlock.code ? "\n" : "") + cmd;
      editor.render();
      cliInput.value = "";
      if (drawTool) showOverlay();
    }
    e.preventDefault();
    e.stopPropagation();
  }
  // Prevent canvas from capturing these keys
  e.stopPropagation();
});

// ─── Toggle toolbar visibility ───────────────────────────
function toggleCadToolbar(show: boolean) {
  cadToolbarVisible = show;
  cadToolbar.classList.toggle("hidden", !show);
  btnCad.classList.toggle("active", show);
  if (!show) {
    activateDrawTool(null);
  } else {
    updateToggleButtons();
  }
}

// ─── CAD button: enable when cursor is on a @{draw} block ──
editor.onDrawBlockFocus = (draw) => {
  activeDrawBlock = draw;
  btnCad.disabled = !draw;
  if (!draw && cadToolbarVisible) {
    toggleCadToolbar(false);
  }
};

btnCad.addEventListener("click", () => {
  if (!activeDrawBlock) return;
  toggleCadToolbar(!cadToolbarVisible);
});

// Populate examples dropdown
for (const [key, ex] of Object.entries(EXAMPLES)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = ex.name;
  exampleSelect.appendChild(opt);
}

// ─── Mode switching ─────────────────────────────────────
let currentMode: "code" | "canvas" = "canvas";

function setMode(mode: "code" | "canvas") {
  const wasCanvas = currentMode === "canvas";
  currentMode = mode;
  tabCode.classList.toggle("active", mode === "code");
  tabCanvas.classList.toggle("active", mode === "canvas");

  if (mode === "code") {
    codeMode.style.display = "flex";
    canvasMode.style.display = "none";
    // Only sync from canvas if we were in canvas mode
    if (wasCanvas) {
      codeInput.value = editor.toHekatan();
    }
    runCode();
  } else {
    codeMode.style.display = "none";
    canvasMode.style.display = "flex";
    // Sync textarea content to canvas
    editor.loadFromText(codeInput.value);
    mathCanvasEl.focus();
  }
}

tabCode.addEventListener("click", () => setMode("code"));
tabCanvas.addEventListener("click", () => setMode("canvas"));
btnRun.addEventListener("click", () => {
  if (currentMode === "canvas") {
    codeInput.value = editor.toHekatan();
  }
  setMode("code");
  runCode();
});

// ─── Example selection ──────────────────────────────────
exampleSelect.addEventListener("change", () => {
  const ex = EXAMPLES[exampleSelect.value];
  if (!ex) return;
  codeInput.value = ex.code;
  editor.loadFromText(ex.code);
  if (currentMode === "canvas") {
    mathCanvasEl.focus();
  } else {
    runCode();
  }
});

// ─── AutoRun checkbox → MathEditor ──────────────────────
chkAutoRun.addEventListener("change", () => {
  editor.setAutoRun(chkAutoRun.checked);
});

// ─── MathEditor callbacks ───────────────────────────────
editor.onContentChanged = (code: string) => {
  // AutoRun: evaluate and could show results (future: inline results on canvas)
  // For now, just keep textarea synced
  codeInput.value = code;
};

editor.onExecute = (code: string) => {
  // F5 / Ctrl+Enter: switch to code mode to see results
  codeInput.value = code;
  setMode("code");
  runCode();
};

// ─── Theme toggle (only affects Calculate mode HTML output) ──
themeSelect.addEventListener("change", () => {
  output.classList.toggle("theme-hekatan", themeSelect.value === "hekatan");
  if (currentMode === "code") runCode();
});

// ─── Evaluator ──────────────────────────────────────────
const evaluator = new HekatanEvaluator();

function runCode() {
  const code = codeInput.value;
  if (!code.trim()) { output.innerHTML = `<div class="output-page"></div>`; return; }

  try {
    const results = evaluator.evalDocument(code);
    output.innerHTML = `<div class="output-page">${renderResults(results, code)}</div>`;
  } catch (e: any) {
    output.innerHTML = `<div class="output-page"><div class="out-error">Error: ${escHtml(e.message)}</div></div>`;
  }
}

// ─── Keyboard (Calculate mode textarea) ─────────────────
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "F5") { e.preventDefault(); runCode(); return; }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); return; }
  if (e.key === "Tab") {
    e.preventDefault();
    const s = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, s) + "  " + codeInput.value.substring(end);
    codeInput.selectionStart = codeInput.selectionEnd = s + 2;
  }
});

// AutoRun on input (Calculate mode)
let autoRunTimer: number | null = null;
codeInput.addEventListener("input", () => {
  if (!chkAutoRun.checked) return;
  if (autoRunTimer) clearTimeout(autoRunTimer);
  autoRunTimer = window.setTimeout(runCode, 400);
});

// ─── HTML escaping ──────────────────────────────────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ═══════════════════════════════════════════════════════════
// RENDERER - Genera HTML con clases de template.html
// ═══════════════════════════════════════════════════════════

function renderResults(results: LineResult[], sourceCode: string): string {
  const html: string[] = [];
  let inColumns = false;
  let columnCount = 0;
  let columnItems: string[] = [];
  const sourceLines = sourceCode.split("\n");

  for (const r of results) {
    const srcLine = sourceLines[r.lineIndex]?.trim() ?? "";

    // Detect @{columns N} start
    const colMatch = srcLine.match(/^@\{columns\s+(\d+)\}/i);
    if (colMatch) {
      inColumns = true;
      columnCount = parseInt(colMatch[1]);
      columnItems = [];
      continue;
    }

    // Empty line or heading/comment exits columns mode
    if (inColumns && (r.type === "empty" || r.type === "heading" || r.type === "comment")) {
      if (columnItems.length > 0) {
        html.push(renderColumnsGrid(columnItems, columnCount));
        columnItems = [];
      }
      inColumns = false;
    }

    if (inColumns && (r.type === "assignment" || r.type === "expression")) {
      columnItems.push(renderLineEq(r, srcLine));
      continue;
    }

    // Flush remaining columns
    if (inColumns && columnItems.length > 0 && r.type !== "assignment" && r.type !== "expression") {
      html.push(renderColumnsGrid(columnItems, columnCount));
      columnItems = [];
      inColumns = false;
    }

    switch (r.type) {
      case "heading": {
        const match = r.display!.match(/^(#{1,6})\s+(.*)/);
        if (match) {
          const level = match[1].length;
          html.push(`<h${level}>${escHtml(match[2])}</h${level}>`);
        }
        break;
      }
      case "comment":
        html.push(`<p class="out-comment">${renderCommentMath(r.display!)}</p>`);
        break;
      case "empty":
        html.push(`<div class="out-empty"></div>`);
        break;
      case "assignment":
        html.push(`<p class="eq out-line">${renderLineEq(r, srcLine)}</p>`);
        break;
      case "expression":
        html.push(`<p class="eq out-line">${renderExprResult(r)}</p>`);
        break;
      case "cells":
        html.push(renderCells(r));
        break;
      case "error":
        html.push(`<div class="out-error">${escHtml(r.error!)}</div>`);
        break;
      case "directive":
        break;
    }
  }

  if (inColumns && columnItems.length > 0) {
    html.push(renderColumnsGrid(columnItems, columnCount));
  }

  return html.join("\n");
}

/** Renderiza columnas como grid CSS */
function renderColumnsGrid(items: string[], cols: number): string {
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px 24px;margin:0.3em 0;">
    ${items.map(item => `<p class="eq out-line">${item}</p>`).join("\n")}
  </div>`;
}

// ═══════════════════════════════════════════════════════════
// EQUATION RENDERING - Using .eq var, .eq sub, .eq sup, etc.
// ═══════════════════════════════════════════════════════════

/** Renderiza una linea de asignacion: var = expr = valor */
function renderLineEq(r: LineResult, srcLine: string): string {
  const varName = r.varName ?? "";
  const value = r.value;

  // Extraer la expresion original del source
  const assignMatch = srcLine.match(/^([a-zA-Z_][\w]*(?:\([^)]*\))?)\s*=\s*(.+)$/);
  const exprText = assignMatch ? assignMatch[2].trim() : "";

  // Nombre de variable con <var> y subindices
  const nameHTML = renderVarName(varName);

  // Si es una funcion definida, solo mostrar la definicion
  if (typeof value === "function" || value === undefined) {
    if (exprText) {
      return `${nameHTML} = ${renderMathExpr(exprText)}`;
    }
    return nameHTML;
  }

  const scope = evaluator.getScope();

  // Si es una matriz, mostrar nombre = expr simbolica = matriz numerica
  if (evaluator.isMatrix(value)) {
    if (exprText && /[a-zA-Z]/.test(exprText)) {
      const substituted = substituteValues(exprText, scope);
      if (substituted) {
        return `${nameHTML} = ${renderMathExpr(exprText)} = ${renderMathExpr(substituted)} = ${renderMatrixHTML(value)}`;
      }
      return `${nameHTML} = ${renderMathExpr(exprText)} = ${renderMatrixHTML(value)}`;
    }
    return `${nameHTML} = ${renderMatrixHTML(value)}`;
  }

  // Renderizar valor
  const valueHTML = renderValueSpan(value);

  // Si la expresion es simple (solo un numero o variable), solo var = valor
  if (!exprText || exprText === String(value) || /^[\d.]+$/.test(exprText)) {
    return `${nameHTML} = ${valueHTML}`;
  }

  // Procedimiento: nombre = expr simbolica = expr con valores = resultado
  const substituted = substituteValues(exprText, scope);
  if (substituted && substituted !== fmtNum(value)) {
    return `${nameHTML} = ${renderMathExpr(exprText)} = ${renderMathExpr(substituted)} = ${valueHTML}`;
  }
  return `${nameHTML} = ${renderMathExpr(exprText)} = ${valueHTML}`;
}

/** Renderiza una expresion pura (sin asignacion) */
function renderExprResult(r: LineResult): string {
  return renderValueSpan(r.value);
}

/** Renderiza celdas @{cells} */
function renderCells(r: LineResult): string {
  if (!r.cells || r.cells.length === 0) return "";
  const scope = evaluator.getScope();
  const cellsHTML = r.cells.map(c => {
    const nameHTML = c.varName ? renderVarName(c.varName) : "";
    const valueHTML = renderValueSpan(c.value);
    const exprHTML = c.expr ? renderMathExpr(c.expr) : "";

    if (c.varName) {
      if (!c.expr || c.expr === String(c.value) || /^[\d.]+$/.test(c.expr)) {
        return `<span class="eq">${nameHTML} = ${valueHTML}</span>`;
      }
      // Procedimiento: nombre = simbolico = con valores = resultado
      const substituted = substituteValues(c.expr, scope);
      if (substituted && substituted !== fmtNum(c.value)) {
        return `<span class="eq">${nameHTML} = ${exprHTML} = ${renderMathExpr(substituted)} = ${valueHTML}</span>`;
      }
      return `<span class="eq">${nameHTML} = ${exprHTML} = ${valueHTML}</span>`;
    }
    return `<span class="eq">${valueHTML}</span>`;
  });
  return `<div class="out-cells">${cellsHTML.join("")}</div>`;
}

// ═══════════════════════════════════════════════════════════
// SUBSTITUCION DE VALORES (procedimiento)
// ═══════════════════════════════════════════════════════════

/** Palabras reservadas de math.js que NO son variables */
const MATH_KEYWORDS = new Set([
  'sqrt', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'log', 'ln', 'exp', 'abs',
  'det', 'inv', 'norm', 'dot', 'cross', 'transpose',
  'multiply', 'lusolve', 'add', 'subset', 'index', 'range',
  'matrix', 'col', 'row', 'pi', 'e', 'inf', 'true', 'false',
  'ceil', 'floor', 'round', 'sign', 'mod', 'min', 'max',
  'sum', 'prod', 'mean', 'trace', 'diag', 'zeros', 'ones', 'eye',
  'size', 'length', 'concat', 'flatten', 'reshape', 'sort',
]);

/**
 * Sustituye nombres de variables por sus valores numericos en una expresion.
 * Retorna null si no se sustituyo nada.
 */
function substituteValues(expr: string, scope: Record<string, any>): string | null {
  // Obtener variables escalares del scope, ordenadas por longitud (mas larga primero)
  const varNames = Object.keys(scope)
    .filter(v => !MATH_KEYWORDS.has(v) && typeof scope[v] === 'number')
    .sort((a, b) => b.length - a.length);

  let result = expr;
  let anyReplaced = false;

  for (const varName of varNames) {
    const value = scope[varName] as number;
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    const before = result;
    const numStr = fmtNum(value);
    // Parentizar negativos para evitar ambiguedad: a*-3 -> a*(-3)
    const replacement = value < 0 ? `(${numStr})` : numStr;
    result = result.replace(regex, replacement);
    if (result !== before) anyReplaced = true;
  }

  return anyReplaced ? result : null;
}

// ═══════════════════════════════════════════════════════════
// GREEK LETTERS
// ═══════════════════════════════════════════════════════════

const GREEK: Record<string, string> = {
  alpha: "\u03B1", beta: "\u03B2", gamma: "\u03B3", delta: "\u03B4",
  epsilon: "\u03B5", zeta: "\u03B6", eta: "\u03B7", theta: "\u03B8",
  iota: "\u03B9", kappa: "\u03BA", lambda: "\u03BB", mu: "\u03BC",
  nu: "\u03BD", xi: "\u03BE", omicron: "\u03BF", pi: "\u03C0",
  rho: "\u03C1", sigma: "\u03C3", tau: "\u03C4", upsilon: "\u03C5",
  phi: "\u03C6", chi: "\u03C7", psi: "\u03C8", omega: "\u03C9",
  Alpha: "\u0391", Beta: "\u0392", Gamma: "\u0393", Delta: "\u0394",
  Epsilon: "\u0395", Zeta: "\u0396", Eta: "\u0397", Theta: "\u0398",
  Iota: "\u0399", Kappa: "\u039A", Lambda: "\u039B", Mu: "\u039C",
  Nu: "\u039D", Xi: "\u039E", Omicron: "\u039F", Pi: "\u03A0",
  Rho: "\u03A1", Sigma: "\u03A3", Tau: "\u03A4", Upsilon: "\u03A5",
  Phi: "\u03A6", Chi: "\u03A7", Psi: "\u03A8", Omega: "\u03A9",
};

/** Convierte nombre griego a su caracter Unicode */
function greekify(s: string): string {
  return GREEK[s] ?? s;
}

// ═══════════════════════════════════════════════════════════
// VARIABLE NAMES - <var> with <sub> for subscripts
// ═══════════════════════════════════════════════════════════

/** Renderiza nombre de variable: alpha_2 -> <var>α</var><sub>2</sub> */
function renderVarName(name: string): string {
  if (!name) return "";
  const parts = name.split("_");
  const base = greekify(parts[0]);
  if (parts.length === 1) {
    return `<var>${escHtml(base)}</var>`;
  }
  const sub = parts.slice(1).map(p => greekify(p)).join("_");
  return `<var>${escHtml(base)}</var><sub>${escHtml(sub)}</sub>`;
}

// ═══════════════════════════════════════════════════════════
// MATH EXPRESSION RENDERING
// ═══════════════════════════════════════════════════════════

/** Renderiza una expresion de matriz simbolica [[a],[b],[c]] como tabla vertical */
function renderSymbolicMatrix(expr: string): string | null {
  const t = expr.trim();
  if (!t.startsWith('[[') || !t.endsWith(']]')) return null;

  // Parsear filas respetando profundidad de brackets
  const inner = t.slice(1, -1); // quitar [ ] externo
  const rows: string[] = [];
  let depth = 0, current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    current += ch;
    if (depth === 0 && current.trim()) {
      const row = current.trim();
      if (row.startsWith('[') && row.endsWith(']')) {
        rows.push(row.slice(1, -1).trim());
      }
      current = '';
      // saltar coma despues de ]
      if (i + 1 < inner.length && inner[i + 1] === ',') i++;
    }
  }
  if (rows.length === 0) return null;

  // Detectar si es vector columna (1 elemento por fila) o matriz
  const isCol = rows.every(r => !r.includes(','));
  const cols = isCol ? 1 : (rows[0].split(',').length);

  let html = `<span class="matrix" style="--mat-cols:${cols}">`;
  for (const row of rows) {
    html += `<span class="tr"><span class="td"></span>`;
    if (isCol) {
      html += `<span class="td">${renderMathExpr(row)}</span>`;
    } else {
      for (const cell of row.split(',')) {
        html += `<span class="td">${renderMathExpr(cell.trim())}</span>`;
      }
    }
    html += `<span class="td"></span></span>`;
  }
  html += `</span>`;
  return html;
}

/** Renderiza una expresion matematica con formato visual */
function renderMathExpr(expr: string): string {
  // Detectar matrices [[...],[...]] y renderizar como tabla vertical
  const matHTML = renderSymbolicMatrix(expr);
  if (matHTML) return matHTML;

  let result = expr;

  // 1. sqrt(expr) -> radical con clase .r0 + .o0 (SVG)
  result = result.replace(/sqrt\(([^)]+)\)/g, (_, inner) => {
    return `<span class="radical-wrap"><span class="r0"></span><span class="o0">${renderMathExpr(inner)}</span></span>`;
  });

  // 2. (a+b)/(c-d) -> fraccion con .dvc / .dvl
  result = result.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, (_, num, den) => {
    return `<span class="dvc"><span class="dvl">${renderMathExpr(num)}</span><span>${renderMathExpr(den)}</span></span>`;
  });

  // 3. Funciones conocidas: sin, cos, etc -> <i>func</i>
  result = result.replace(/\b(sin|cos|tan|cot|sec|csc|asin|acos|atan|log|ln|exp|sqrt|abs|det|inv|norm|dot|cross|transpose|multiply|lusolve|add|subset|index|range|matrix)\b/g,
    '<i>$1</i>');

  // 4. Greek letter words -> Unicode (before splitting into single chars)
  result = result.replace(/\b(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)\b/g,
    (m) => `<var>${greekify(m)}</var>`);

  // 5. Variables con subindice: a_xyz -> <var>a</var><sub>xyz</sub>
  result = result.replace(/\b([a-zA-Z])_(\w+)\b/g, (_, base, sub) => {
    return `<var>${greekify(base)}</var><sub>${greekify(sub)}</sub>`;
  });

  // 6. Variables simples (letras solas que no son parte de tags HTML) -> <var>
  result = result.replace(/\b([a-zA-Z])\b(?![(<\/])/g, '<var>$1</var>');

  // 6. * -> ·  (middle dot)
  result = result.replace(/\*/g, ' \u00B7 ');

  // 7. ^N -> <sup>N</sup>  (AFTER variables para que <var>a</var>^2 funcione)
  result = result.replace(/\^(\d+)/g, '<sup>$1</sup>');
  result = result.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');

  return result;
}

/** Renderiza texto de comentario con formato math (subscripts, superscripts, griego) */
function renderCommentMath(text: string): string {
  let result = escHtml(text);

  // Greek letter words -> Unicode
  result = result.replace(/\b(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega)\b/g,
    (m) => greekify(m));

  // Variables con subindice: X_abc -> X<sub>abc</sub>
  result = result.replace(/([a-zA-Z\u0370-\u03FF])_(\w+)/g, (_, base, sub) => {
    return `${base}<sub>${greekify(sub)}</sub>`;
  });

  // Superscripts: ^2, ^{n+1}
  result = result.replace(/\^(\d+)/g, '<sup>$1</sup>');
  result = result.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');

  // * -> · (middle dot)
  result = result.replace(/\*/g, '\u00B7');

  return result;
}

// ═══════════════════════════════════════════════════════════
// VALUE RENDERING
// ═══════════════════════════════════════════════════════════

/** Renderiza un valor numerico/escalar como span */
function renderValueSpan(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "function") return "";

  if (evaluator.isMatrix(value)) {
    return renderMatrixHTML(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(v => renderValueSpan(v)).join(", ")}]`;
  }

  if (typeof value === "number") {
    return fmtNum(value);
  }

  return escHtml(String(value));
}

/** Renderiza una matriz math.js usando clases .matrix .tr .td de template.html */
function renderMatrixHTML(m: any): string {
  const arr = m.toArray() as any[];

  // Vector 1D: [a, b, c]
  if (!Array.isArray(arr[0])) {
    return `[${(arr as number[]).map(v => fmtNum(v)).join(", ")}]`;
  }

  const rows = arr as any[][];
  const cols = rows[0]?.length ?? 1;

  let html = `<span class="matrix" style="--mat-cols:${cols}">`;
  for (const row of rows) {
    html += `<span class="tr">`;
    html += `<span class="td"></span>`;
    for (const v of row) {
      html += `<span class="td">${fmtNum(v)}</span>`;
    }
    html += `<span class="td"></span>`;
    html += `</span>`;
  }
  html += `</span>`;
  return html;
}

/** Formatea un numero */
function fmtNum(v: any): string {
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    if (Math.abs(v) < 0.001 || Math.abs(v) > 1e6) return v.toPrecision(6);
    return (Math.round(v * 10000) / 10000).toString();
  }
  return escHtml(String(v));
}

// ─── Pinch-to-zoom en output (trackpad Ctrl+wheel) ───────
output.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const currentSize = parseFloat(getComputedStyle(output).fontSize);
    const newSize = Math.max(8, Math.min(24, currentSize + delta * currentSize));
    output.style.fontSize = `${newSize}px`;
  }
}, { passive: false });

// ─── Splitter drag to resize ─────────────────────────────
const splitter = document.getElementById("splitter") as HTMLDivElement;
const editorPanel = document.querySelector(".editor-panel") as HTMLDivElement;

splitter.addEventListener("mousedown", (e) => {
  e.preventDefault();
  splitter.classList.add("dragging");
  const parent = splitter.parentElement!;

  const onMove = (ev: MouseEvent) => {
    const rect = parent.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.max(15, Math.min(85, (x / rect.width) * 100));
    editorPanel.style.flexBasis = `${pct}%`;
  };

  const onUp = () => {
    splitter.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
});

// ─── Init ───────────────────────────────────────────────
exampleSelect.value = "basico";
codeInput.value = EXAMPLES.basico.code;
editor.loadFromText(EXAMPLES.basico.code);
setMode("canvas"); // MathCanvas mode by default

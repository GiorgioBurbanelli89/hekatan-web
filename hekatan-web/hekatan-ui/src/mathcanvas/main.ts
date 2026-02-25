/**
 * main.ts - Hekatan Math Editor
 * Dos modos:
 *   - Calculate: textarea + output HTML (split view)
 *   - MathCanvas: WYSIWYG canvas editor (como MathCAD)
 */
import { HekatanEvaluator, math } from "hekatan-math/mathEngine.js";
import type { LineResult, CellResult } from "hekatan-math/mathEngine.js";
import { MathEditor } from "hekatan-math/matheditor/MathEditor.js";

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
  gridframe: {
    name: "Ej 5.1 - Grid Frame (Paz)",
    code: `# Ejemplo 5.1 - Analisis de Grid Frame
> Mario Paz - Matrix Structural Analysis
> 2 elementos, 3 nodos, 9 GDL
> Unidades: kip, inch, rad

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

## 7. Fuerzas Nodales Equivalentes
> Elem 1: M_0=200 kip*in a L/2
Q_b1 = [[0], [-50], [-3], [0], [-50], [3]]
> Elem 2: w=0.1 kip/in distribuida
Q_b2 = [[-83.33], [0], [-5], [83.33], [0], [-5]]

## 8. Vector de Fuerzas Reducido
> Incluye P = -10 kip en delta_y (coord 3)
P_d = [[0], [0], [-10]]
F_R = Q_b1[4:6, 1:1] + Q_b2[1:3, 1:1] + P_d

## 9. Solucion de Desplazamientos
> [K]_R {u} = {F}_R
u = lusolve(K_R, F_R)

## 10. Desplazamientos Locales
d_1 = [[u[1,1]], [u[2,1]], [u[3,1]], [0], [0], [0]]
d_b2 = [[u[1,1]], [u[2,1]], [u[3,1]], [0], [0], [0]]
d_2 = T_2 * d_b2

## 11. Fuerzas en Elementos
> {P} = [k]{d} - {Q}
P_1 = k * d_1 - Q_b1
Q_2L = [[0], [83.33], [5], [0], [-83.33], [5]]
P_2 = k * d_2 - Q_2L

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
const themeSelect = document.getElementById("themeSelect") as HTMLSelectElement;
const codeMode = document.getElementById("codeMode") as HTMLDivElement;
const canvasMode = document.getElementById("canvasMode") as HTMLDivElement;
const mathCanvasEl = document.getElementById("mathCanvas") as HTMLCanvasElement;

// ─── MathEditor (WYSIWYG canvas) ────────────────────────
const editor = new MathEditor(mathCanvasEl);

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
  if (!code.trim()) { output.innerHTML = ""; return; }

  try {
    const results = evaluator.evalDocument(code);
    output.innerHTML = renderResults(results, code);
  } catch (e: any) {
    output.innerHTML = `<div class="out-error">Error: ${escHtml(e.message)}</div>`;
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
        html.push(`<p class="out-comment">${escHtml(r.display!)}</p>`);
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

  // Si es una matriz, solo mostrar nombre = matriz
  if (evaluator.isMatrix(value)) {
    return `${nameHTML} = ${renderMatrixHTML(value)}`;
  }

  // Renderizar valor
  const valueHTML = renderValueSpan(value);

  // Si la expresion es simple (solo un numero o variable), solo var = valor
  if (!exprText || exprText === String(value) || /^[\d.]+$/.test(exprText)) {
    return `${nameHTML} = ${valueHTML}`;
  }

  // Mostrar: nombre = expr = valor
  return `${nameHTML} = ${renderMathExpr(exprText)} = ${valueHTML}`;
}

/** Renderiza una expresion pura (sin asignacion) */
function renderExprResult(r: LineResult): string {
  return renderValueSpan(r.value);
}

/** Renderiza celdas @{cells} */
function renderCells(r: LineResult): string {
  if (!r.cells || r.cells.length === 0) return "";
  const cellsHTML = r.cells.map(c => {
    const nameHTML = c.varName ? renderVarName(c.varName) : "";
    const valueHTML = renderValueSpan(c.value);
    const exprHTML = c.expr ? renderMathExpr(c.expr) : "";

    if (c.varName) {
      if (!c.expr || c.expr === String(c.value) || /^[\d.]+$/.test(c.expr)) {
        return `<span class="eq">${nameHTML} = ${valueHTML}</span>`;
      }
      return `<span class="eq">${nameHTML} = ${exprHTML} = ${valueHTML}</span>`;
    }
    return `<span class="eq">${valueHTML}</span>`;
  });
  return `<div class="out-cells">${cellsHTML.join("")}</div>`;
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

/** Renderiza una expresion matematica con formato visual */
function renderMathExpr(expr: string): string {
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

// ─── Init ───────────────────────────────────────────────
exampleSelect.value = "basico";
codeInput.value = EXAMPLES.basico.code;
editor.loadFromText(EXAMPLES.basico.code);
setMode("canvas"); // MathCanvas mode by default

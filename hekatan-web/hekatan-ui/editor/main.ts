/**
 * Hekatan CAS Editor — main entry point
 *
 * Integrates with the 4 CAS engines via casManager cascade.
 */

import { casManager } from "hekatan-math/cas/index.js";
import type { CASEngineName } from "hekatan-math/cas/index.js";

// --------------- DOM refs ---------------
const codeInput = document.getElementById("codeInput") as HTMLTextAreaElement;
const output = document.getElementById("output") as HTMLDivElement;
const btnRun = document.getElementById("btnRun") as HTMLButtonElement;
const btnInitAll = document.getElementById("btnInitAll") as HTMLButtonElement;
const engineSelect = document.getElementById("engineSelect") as HTMLSelectElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const exampleList = document.getElementById("exampleList") as HTMLUListElement;

// --------------- KaTeX lazy load ---------------
let katexLoaded = false;
async function ensureKaTeX(): Promise<void> {
  if (katexLoaded) return;
  if ((window as any).katex) { katexLoaded = true; return; }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js";
    script.onload = () => { katexLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load KaTeX"));
    document.head.appendChild(script);
  });
}

function renderLatex(latex: string, el: HTMLElement): void {
  try {
    (window as any).katex.render(latex, el, { throwOnError: false, displayMode: true });
  } catch {
    el.textContent = latex;
  }
}

// --------------- Engine status dots ---------------
function updateDots(): void {
  const engines = casManager.engines;
  for (const name of ["giac", "sympy", "maxima", "symengine"] as CASEngineName[]) {
    const dot = document.getElementById(`dot-${name}`);
    if (dot) {
      dot.className = `engine-dot ${engines[name].isReady() ? "on" : "off"}`;
    }
  }
}

// --------------- Examples ---------------
const EXAMPLES: Record<string, string> = {
  "Derivadas": `# Derivadas
diff(sin(x)*x^2, x)
diff(ln(x^2+1), x)
diff(exp(x)*cos(x), x, x)`,

  "Integrales": `# Integrales
integrate(x^2*sin(x), x)
integrate(1/(1+x^2), x)
integrate(exp(-x^2), x, -oo, oo)`,

  "Ecuaciones": `# Resolver ecuaciones
solve(x^3 - 6*x^2 + 11*x - 6, x)
solve(x^2 + 2*x - 3 = 0, x)`,

  "Limites": `# Limites
limit(sin(x)/x, x, 0)
limit((1+1/n)^n, n, oo)
limit(x*ln(x), x, 0, '+')`,

  "Series": `# Series de Taylor
series(sin(x), x, 0, 10)
series(exp(x), x, 0, 8)
series(1/(1-x), x, 0, 6)`,

  "Matrices": `# Matrices
det([[1,2,3],[4,5,6],[7,8,10]])
eigenvals([[2,1],[1,3]])`,

  "Simplificar": `# Simplificacion
simplify(sin(x)^2 + cos(x)^2)
expand((x+1)^4)
factor(x^4 - 1)`,

  "EDO": `# Ecuaciones diferenciales
dsolve(diff(y(x),x) + y(x) - x, y(x))
dsolve(diff(y(x),x,x) + y(x), y(x))`,

  "Laplace": `# Transformada de Laplace
laplace(sin(t), t, s)
laplace(exp(-a*t)*cos(b*t), t, s)`,

  "Todas las operaciones": `# Demo completo - Hekatan CAS
> Derivada
diff(x^3*sin(x), x)

> Integral definida
integrate(x*exp(-x), x, 0, oo)

> Limite
limit((1+1/n)^n, n, oo)

> Ecuacion cubica
solve(x^3 - 1, x)

> Serie de Taylor
series(cos(x), x, 0, 8)

> Simplificar
simplify((x^2-1)/(x-1))

> Expandir
expand((a+b)^3)

> Factorizar
factor(x^4 - 16)

> Determinante
det([[a,b],[c,d]])`,
};

// Populate example list
for (const [name, code] of Object.entries(EXAMPLES)) {
  const li = document.createElement("li");
  li.textContent = name;
  li.addEventListener("click", () => {
    codeInput.value = code;
    document.querySelectorAll(".example-list li").forEach((el) => el.classList.remove("active"));
    li.classList.add("active");
  });
  exampleList.appendChild(li);
}

// --------------- Parse & Run ---------------
interface ParsedLine {
  type: "comment" | "text" | "expr";
  content: string;
}

function parseInput(code: string): ParsedLine[] {
  return code.split("\n").filter((l) => l.trim().length > 0).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return { type: "comment", content: trimmed.slice(1).trim() };
    if (trimmed.startsWith(">")) return { type: "text", content: trimmed.slice(1).trim() };
    return { type: "expr", content: trimmed };
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function runCode(): Promise<void> {
  const code = codeInput.value.trim();
  if (!code) return;

  output.innerHTML = "";
  const lines = parseInput(code);
  const preferred = (engineSelect.value || undefined) as CASEngineName | undefined;

  statusText.textContent = "Ejecutando...";
  btnRun.disabled = true;

  await ensureKaTeX();

  for (const line of lines) {
    if (line.type === "comment") {
      const div = document.createElement("div");
      div.className = "cas-comment";
      div.textContent = line.content;
      output.appendChild(div);
      continue;
    }

    if (line.type === "text") {
      const div = document.createElement("div");
      div.className = "cas-text";
      div.innerHTML = `<strong>${escapeHtml(line.content)}</strong>`;
      output.appendChild(div);
      continue;
    }

    // Expression — evaluate with CAS
    const resultDiv = document.createElement("div");
    resultDiv.className = "cas-result loading";
    resultDiv.innerHTML = `
      <div class="expr-input">${escapeHtml(line.content)}</div>
      <div class="expr-output">Evaluando...</div>
    `;
    output.appendChild(resultDiv);

    try {
      const result = await casManager.evaluate(line.content, preferred);
      resultDiv.className = "cas-result";

      const outputEl = resultDiv.querySelector(".expr-output") as HTMLDivElement;

      if (result.latex) {
        renderLatex(result.latex, outputEl);
      } else {
        outputEl.textContent = result.text;
      }

      // Engine badge + timing
      const badge = document.createElement("span");
      badge.className = "engine-badge";
      badge.textContent = result.engine;
      resultDiv.appendChild(badge);

      const timing = document.createElement("span");
      timing.className = "timing";
      timing.textContent = `${result.timeMs.toFixed(1)} ms`;
      resultDiv.appendChild(timing);

      updateDots();
    } catch (e: any) {
      resultDiv.className = "cas-result error";
      const outputEl = resultDiv.querySelector(".expr-output") as HTMLDivElement;
      outputEl.textContent = e.message;
    }
  }

  statusText.textContent = "Listo";
  btnRun.disabled = false;
}

// --------------- Event handlers ---------------
btnRun.addEventListener("click", runCode);

codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runCode();
  }
});

btnInitAll.addEventListener("click", async () => {
  statusText.textContent = "Cargando todos los motores...";
  btnInitAll.disabled = true;

  // Update dots to loading
  for (const name of ["giac", "sympy", "maxima", "symengine"]) {
    const dot = document.getElementById(`dot-${name}`);
    if (dot && !dot.classList.contains("on")) {
      dot.className = "engine-dot loading";
    }
  }

  const loaded = await casManager.initAll();
  updateDots();
  statusText.textContent = `${loaded.length} motores cargados: ${loaded.join(", ")}`;
  btnInitAll.disabled = false;
});

// Click on engine in sidebar to load it
document.getElementById("engineList")?.addEventListener("click", async (e) => {
  const li = (e.target as HTMLElement).closest("li");
  if (!li) return;
  const name = li.dataset.engine as CASEngineName;
  if (!name) return;

  const dot = document.getElementById(`dot-${name}`);
  if (dot) dot.className = "engine-dot loading";
  statusText.textContent = `Cargando ${name}...`;

  try {
    await casManager.initEngine(name);
    statusText.textContent = `${name} cargado`;
  } catch (e: any) {
    statusText.textContent = `Error: ${e.message}`;
  }
  updateDots();
});

// Load default example
codeInput.value = EXAMPLES["Todas las operaciones"];
document.querySelectorAll(".example-list li").forEach((li) => {
  if (li.textContent === "Todas las operaciones") li.classList.add("active");
});

// Init status
updateDots();
statusText.textContent = "Listo — Ctrl+Enter para ejecutar";

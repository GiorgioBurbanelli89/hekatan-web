#!/usr/bin/env tsx
/**
 * Tutorial interactivo: Ecuaciones Diferenciales desde cero
 * Genera HTML con matematicas formateadas (fracciones, superindices, simbolos)
 */

import {
  parse, print, simplify, expand, diff, integrate, solve,
  dsolve, taylor, num, sym, type Expr, isNum, isSym
} from "./miniCAS.js";
import { writeFileSync } from "fs";

// ═══════════════════════════════════════════════════════════
// AST → HTML Math Renderer (fracciones, superindices, etc.)
// ═══════════════════════════════════════════════════════════

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ",
  omega: "ω", Omega: "Ω", phi: "φ", psi: "ψ", tau: "τ", rho: "ρ",
};

/** Render an AST expression as formatted HTML math */
function mathHtml(e: Expr, parentPrec = 0): string {
  if (e.tag === "num") {
    const v = e.val;
    if (Math.abs(v - Math.PI) < 1e-12) return '<var class="const">π</var>';
    if (Math.abs(v - Math.E) < 1e-12) return '<var class="const">e</var>';
    if (Number.isInteger(v)) return `<span class="num">${v}</span>`;
    return `<span class="num">${v.toPrecision(6)}</span>`;
  }

  if (e.tag === "sym") {
    const n = e.name;
    if (GREEK[n]) return `<var>${GREEK[n]}</var>`;
    // Subscript: C1 → C₁, C2 → C₂
    const sub = n.match(/^([A-Za-z]+)(\d+)$/);
    if (sub) return `<var>${sub[1]}<sub>${sub[2]}</sub></var>`;
    // y' y''
    if (n === "y'") return "<var>y</var><span class='prime'>′</span>";
    if (n === "y''") return "<var>y</var><span class='prime'>″</span>";
    return `<var>${n}</var>`;
  }

  if (e.tag === "eq") {
    return `${mathHtml(e.lhs)} <span class="op">=</span> ${mathHtml(e.rhs)}`;
  }

  // ─── ADD ───────────────────────────────────────────────
  if (e.tag === "add") {
    let parts: string[] = [];
    for (let i = 0; i < e.terms.length; i++) {
      const t = e.terms[i];
      if (i === 0) {
        parts.push(mathHtml(t, 1));
        continue;
      }
      // Check if term is negative
      const neg = extractNeg(t);
      if (neg) {
        parts.push(` <span class="op">−</span> ${mathHtml(neg, 1)}`);
      } else {
        parts.push(` <span class="op">+</span> ${mathHtml(t, 1)}`);
      }
    }
    const inner = parts.join("");
    return parentPrec > 1 ? `(${inner})` : inner;
  }

  // ─── MUL ───────────────────────────────────────────────
  if (e.tag === "mul") {
    // Separate numerator and denominator
    let coeff = 1;
    const numer: Expr[] = [];
    const denom: Expr[] = [];
    for (const f of e.factors) {
      if (f.tag === "num") { coeff *= f.val; }
      else if (f.tag === "pow" && f.exp.tag === "num" && f.exp.val === -1) {
        denom.push(f.base);
      } else if (f.tag === "pow" && f.exp.tag === "num" && f.exp.val < -1) {
        denom.push({ tag: "pow", base: f.base, exp: num(-f.exp.val) });
      } else {
        numer.push(f);
      }
    }

    // Fraction: a/b
    if (denom.length > 0) {
      const numHtml = renderMulGroup(coeff, numer);
      const denHtml = denom.length === 1 ? mathHtml(denom[0]) : denom.map(d => mathHtml(d, 3)).join(`<span class="op">·</span>`);
      return `<span class="frac"><span class="frac-num">${numHtml}</span><span class="frac-bar"></span><span class="frac-den">${denHtml}</span></span>`;
    }

    // Regular multiplication
    const result = renderMulGroup(coeff, numer);
    return parentPrec > 2 ? `(${result})` : result;
  }

  // ─── POW ───────────────────────────────────────────────
  if (e.tag === "pow") {
    // sqrt: x^(1/2) or x^0.5
    if (e.exp.tag === "num" && Math.abs(e.exp.val - 0.5) < 1e-12) {
      return `<span class="sqrt">√<span class="sqrt-inner">${mathHtml(e.base)}</span></span>`;
    }
    if (e.exp.tag === "pow" && isNum(e.exp.base, 2) && isNum(e.exp.exp, -1)) {
      return `<span class="sqrt">√<span class="sqrt-inner">${mathHtml(e.base)}</span></span>`;
    }
    // x^(-1) → 1/x
    if (isNum(e.exp, -1)) {
      return `<span class="frac"><span class="frac-num"><span class="num">1</span></span><span class="frac-bar"></span><span class="frac-den">${mathHtml(e.base)}</span></span>`;
    }
    const base = mathHtml(e.base, 4);
    const exp = mathHtml(e.exp);
    return `${base}<sup>${exp}</sup>`;
  }

  // ─── FUNCTION CALL ─────────────────────────────────────
  if (e.tag === "fn") {
    const name = e.name;
    const args = e.args;

    // Special rendering for common functions
    if (name === "sqrt") {
      return `<span class="sqrt">√<span class="sqrt-inner">${mathHtml(args[0])}</span></span>`;
    }
    if (name === "abs") {
      return `|${mathHtml(args[0])}|`;
    }
    if (name === "exp") {
      // e^(arg)
      const arg = mathHtml(args[0]);
      return `<var class="const">e</var><sup>${arg}</sup>`;
    }
    if (name === "ln" || name === "log") {
      return `<span class="fn">ln</span>(${mathHtml(args[0])})`;
    }
    if (name === "integral") {
      return `∫${mathHtml(args[0])}<span class="fn"> d</span>${mathHtml(args[1])}`;
    }
    // sin, cos, tan, etc.
    const fnName = `<span class="fn">${name}</span>`;
    // For simple args, no parens needed visually if single var/num
    if (args.length === 1 && (args[0].tag === "sym" || args[0].tag === "num")) {
      return `${fnName} ${mathHtml(args[0])}`;
    }
    return `${fnName}(${args.map(a => mathHtml(a)).join(", ")})`;
  }

  return "?";
}

/** Extract negation: mul(-1, x) → x, or num(-n) → num(n) */
function extractNeg(e: Expr): Expr | null {
  if (e.tag === "num" && e.val < 0) return num(-e.val);
  if (e.tag === "mul" && e.factors.length >= 1 && e.factors[0].tag === "num" && e.factors[0].val < 0) {
    const rest = e.factors.slice(1);
    const absCoeff = -e.factors[0].val;
    if (absCoeff === 1 && rest.length === 1) return rest[0];
    if (absCoeff === 1) return { tag: "mul", factors: rest };
    return { tag: "mul", factors: [num(absCoeff), ...rest] };
  }
  return null;
}

/** Render coefficient * factors as HTML */
function renderMulGroup(coeff: number, factors: Expr[]): string {
  const parts: string[] = [];
  if (factors.length === 0) return `<span class="num">${coeff}</span>`;
  if (coeff === -1) parts.push(`<span class="op">−</span>`);
  else if (coeff !== 1) parts.push(`<span class="num">${coeff}</span>`);

  for (let i = 0; i < factors.length; i++) {
    const f = factors[i];
    if (i > 0 || (coeff !== 1 && coeff !== -1)) {
      // Decide: implicit multiplication (juxtaposition) or explicit dot
      const prev = i > 0 ? factors[i - 1] : null;
      const needsDot = prev && (prev.tag === "num" || f.tag === "num");
      if (needsDot || (coeff !== 1 && coeff !== -1 && i === 0)) {
        parts.push(`<span class="op">·</span>`);
      }
    }
    parts.push(mathHtml(f, 3));
  }
  return parts.join("");
}

// ═══════════════════════════════════════════════════════════
// PROCESS CAS COMMANDS → return AST result
// ═══════════════════════════════════════════════════════════

/** Recursively evaluate a parsed CAS expression (handles nested diff/integrate) */
function evalCasExpr(e: Expr): Expr {
  if (e.tag === "fn" && e.name === "diff" && e.args.length === 2 && e.args[1].tag === "sym") {
    const inner = evalCasExpr(e.args[0]); // recursively evaluate inner
    return simplify(diff(inner, e.args[1].name));
  }
  if (e.tag === "fn" && e.name === "integrate" && e.args.length === 2 && e.args[1].tag === "sym") {
    const inner = evalCasExpr(e.args[0]);
    return simplify(integrate(inner, e.args[1].name));
  }
  return e;
}

function processToAst(input: string): { inputAst: Expr | null; resultAst: Expr | Expr[] | null; label: string } {
  input = input.trim();
  try {
    let m = input.match(/^diff\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      const eEvaled = evalCasExpr(e); // evaluate inner diff/integrate first
      const r = simplify(diff(eEvaled, m[2]));
      return { inputAst: e, resultAst: r, label: `d/d${m[2]}` };
    }
    m = input.match(/^integrate\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      const r = simplify(integrate(e, m[2]));
      return { inputAst: e, resultAst: r, label: `∫ d${m[2]}` };
    }
    m = input.match(/^solve\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      const roots = solve(e, m[2]);
      return { inputAst: e, resultAst: roots, label: "solve" };
    }
    m = input.match(/^expand\((.+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return { inputAst: e, resultAst: expand(e), label: "expand" };
    }
    m = input.match(/^taylor\((.+),\s*(\w+),\s*(.+),\s*(\d+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return { inputAst: e, resultAst: taylor(e, m[2], parse(m[3]), parseInt(m[4])), label: "taylor" };
    }
    m = input.match(/^dsolve\((.+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return { inputAst: e, resultAst: simplify(dsolve(e)), label: "dsolve" };
    }
    m = input.match(/^simplify\((.+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return { inputAst: e, resultAst: simplify(e), label: "simplify" };
    }
    const e = parse(input);
    return { inputAst: e, resultAst: simplify(e), label: "" };
  } catch (err: any) {
    return { inputAst: null, resultAst: null, label: `Error: ${err.message}` };
  }
}

function renderCalc(input: string, comment: string): string {
  const { inputAst, resultAst, label } = processToAst(input);

  let inputHtml = "";
  let resultHtml = "";

  if (label === "dsolve" && inputAst) {
    inputHtml = mathHtml(inputAst);
    resultHtml = resultAst ? mathHtml(resultAst as Expr) : "?";
  } else if (label.startsWith("d/d") && inputAst) {
    const v = label.slice(3);
    inputHtml = `<span class="deriv"><span class="frac"><span class="frac-num">d</span><span class="frac-bar"></span><span class="frac-den">d<var>${v}</var></span></span></span> ${mathHtml(inputAst)}`;
    resultHtml = resultAst ? mathHtml(resultAst as Expr) : "?";
  } else if (label.startsWith("∫") && inputAst) {
    const v = label.slice(3);
    inputHtml = `<span class="integral">∫</span> ${mathHtml(inputAst)} <span class="fn">d</span><var>${v}</var>`;
    resultHtml = resultAst ? mathHtml(resultAst as Expr) : "?";
  } else if (label === "solve" && inputAst && Array.isArray(resultAst)) {
    inputHtml = mathHtml(inputAst) + ` <span class="op">=</span> <span class="num">0</span>`;
    resultHtml = (resultAst as Expr[]).map((r, i) => {
      return `<var>x</var><sub>${i + 1}</sub> <span class="op">=</span> ${mathHtml(r)}`;
    }).join(`, &nbsp; `);
  } else if (inputAst) {
    inputHtml = mathHtml(inputAst);
    resultHtml = resultAst ? mathHtml(resultAst as Expr) : "?";
  }

  return `<div class="calc">
    <div class="calc-comment">${escHtml(comment)}</div>
    <div class="calc-box">
      <div class="calc-input">${inputHtml}</div>
      <div class="calc-eq"><span class="op">=</span></div>
      <div class="calc-result">${resultHtml}</div>
    </div>
  </div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Render inline math from a text string like "$x^2 + 1$"
function renderInlineMath(text: string): string {
  return text.replace(/\$([^$]+)\$/g, (_, expr) => {
    try {
      return `<span class="inline-math">${mathHtml(parse(expr))}</span>`;
    } catch { return expr; }
  });
}

// ═══════════════════════════════════════════════════════════
// TUTORIAL CONTENT
// ═══════════════════════════════════════════════════════════

interface Section {
  type: "h1" | "h2" | "h3" | "text" | "note" | "key" | "calc" | "space" | "hr" | "table" | "steps" | "mathblock";
  content?: string;
  input?: string;
  rows?: string[][];
  items?: string[];
  exprs?: string[]; // for mathblock: array of expressions to render as math
}

const tutorial: Section[] = [
  { type: "h1", content: "Ecuaciones Diferenciales — Desde Cero" },
  { type: "text", content: "Si sabes resolver $x + 3 = 0$, ya tienes la base para aprender esto." },
  { type: "hr" },

  // ─── PARTE 1 ───────────────────────────────────────────
  { type: "h2", content: "Parte 1: Lo que ya sabes" },
  { type: "text", content: "Una ecuacion normal busca un <b>numero</b>:" },
  { type: "calc", input: "solve(x + 3, x)", content: "Resolver x + 3 = 0" },
  { type: "calc", input: "solve(x^2 - 4, x)", content: "Resolver x² − 4 = 0" },
  { type: "calc", input: "solve(x^2 - 5*x + 6, x)", content: "Resolver x² − 5x + 6 = 0" },
  { type: "key", content: "La respuesta es un <b>numero</b>: x = −3, x = 2, etc." },
  { type: "space" },

  // ─── PARTE 2 ───────────────────────────────────────────
  { type: "h2", content: "Parte 2: La derivada (velocidad de cambio)" },
  { type: "text", content: "La derivada $f'(x)$ mide <b>que tan rapido cambia</b> la funcion. Si tu posicion es $x^2$, tu velocidad es $2*x$." },
  { type: "text", content: "Las reglas fundamentales:" },
  { type: "calc", input: "diff(x^3, x)", content: "Potencia: bajar exponente, restar 1" },
  { type: "calc", input: "diff(sin(x), x)", content: "Seno se convierte en coseno" },
  { type: "calc", input: "diff(cos(x), x)", content: "Coseno se convierte en −seno" },
  { type: "calc", input: "diff(exp(x), x)", content: "e^x se deriva a si misma (!)" },
  { type: "calc", input: "diff(ln(x), x)", content: "Logaritmo natural" },
  { type: "key", content: "La derivada de $exp(x)$ es $exp(x)$. Esta propiedad magica es la razon por la que $exp(x)$ aparece en TODAS las ecuaciones diferenciales." },

  { type: "text", content: "Reglas compuestas (cadena y producto):" },
  { type: "calc", input: "diff(sin(2*x), x)", content: "Regla de la cadena: d/dx sin(2x)" },
  { type: "calc", input: "diff(exp(x^2), x)", content: "Regla de la cadena: d/dx e^(x²)" },
  { type: "calc", input: "diff(x*sin(x), x)", content: "Regla del producto: d/dx (x·sin x)" },
  { type: "calc", input: "diff(diff(sin(x), x), x)", content: "Segunda derivada: d²/dx² sin(x)" },
  { type: "space" },

  // ─── PARTE 3 ───────────────────────────────────────────
  { type: "h2", content: "Parte 3: La integral (la operacion inversa)" },
  { type: "text", content: "Integrar es <b>deshacer</b> la derivada. Si $f'(x) = 2x$, entonces $f(x) = x^2 + C$." },
  { type: "note", content: "La C es la \"constante de integracion\". Al derivar, las constantes desaparecen, asi que al integrar no sabes que constante habia." },
  { type: "calc", input: "integrate(x^2, x)", content: "∫ x² dx" },
  { type: "calc", input: "integrate(cos(x), x)", content: "∫ cos(x) dx" },
  { type: "calc", input: "integrate(exp(x), x)", content: "∫ eˣ dx" },
  { type: "calc", input: "integrate(3*x^2, x)", content: "∫ 3x² dx = x³ (las constantes salen)" },
  { type: "calc", input: "integrate(ln(x), x)", content: "∫ ln(x) dx (integracion por partes)" },
  { type: "space" },

  // ─── PARTE 4 ───────────────────────────────────────────
  { type: "h2", content: "Parte 4: La Ecuacion Diferencial" },
  { type: "text", content: "Ahora lo importante. Compara los dos tipos de ecuacion:" },
  { type: "note", content: "<b>Ecuacion normal:</b> $x^2 - 4 = 0$ → buscas un NUMERO (x = 2)<br><b>Ecuacion diferencial:</b> $y' = 2*y$ → buscas una FUNCION (y = C₁·e²ˣ)" },
  { type: "key", content: "En una ED, la incognita no es un numero — es una <b>funcion entera</b>. Buscas y(x)." },
  { type: "text", content: "La ecuacion $y' = 2*y$ pregunta: \"¿que funcion, al derivarla, da el doble de si misma?\"" },
  { type: "text", content: "Ya vimos que $exp(x)$ se deriva a si misma. Entonces $exp(2*x)$ se deriva a $2*exp(2*x)$ = 2 veces ella misma:" },
  { type: "calc", input: "diff(exp(2*x), x)", content: "Verificacion: d/dx e^(2x) = 2·e^(2x) = 2·y  ✓" },
  { type: "calc", input: "dsolve(y' = 2*y)", content: "El CAS confirma: y' = 2y" },
  { type: "text", content: "La $C1$ es arbitraria — hay infinitas soluciones (una familia de curvas). Para elegir UNA necesitas una condicion inicial como y(0) = 5." },
  { type: "space" },

  // ─── PARTE 5 ───────────────────────────────────────────
  { type: "h2", content: "Parte 5: Los 3 tipos fundamentales" },

  { type: "h3", content: "Tipo 1: y' = f(x) — Solo integrar" },
  { type: "text", content: "Si el lado derecho solo tiene $x$ (no $y$), simplemente integras:" },
  { type: "calc", input: "dsolve(y' = x^2)", content: "y' = x² → integrar ambos lados" },
  { type: "calc", input: "dsolve(y' = sin(x))", content: "y' = sin(x) → integrar" },

  { type: "h3", content: "Tipo 2: y' = a·y — Exponencial" },
  { type: "text", content: "\"La velocidad de cambio es proporcional a cuanto hay\". Modela poblaciones, radioactividad, interes compuesto:" },
  { type: "calc", input: "dsolve(y' = y)", content: "y' = y → crecimiento (a = 1)" },
  { type: "calc", input: "dsolve(y' = 3*y)", content: "y' = 3y → crecimiento rapido" },
  { type: "calc", input: "dsolve(y' = -2*y)", content: "y' = −2y → decaimiento (radioactividad)" },
  { type: "note", content: "a &gt; 0 → crece exponencialmente (poblacion, virus)<br>a &lt; 0 → decae exponencialmente (radioactividad, enfriamiento)" },

  { type: "h3", content: "Tipo 3: y'' = −ω²·y — Oscilaciones" },
  { type: "text", content: "\"La aceleracion es opuesta a la posicion\" → oscila. Es la ecuacion del resorte, pendulo, ondas, circuitos:" },
  { type: "calc", input: "dsolve(y'' = -y)", content: "y'' = −y (ω = 1)" },
  { type: "calc", input: "dsolve(y'' = -4*y)", content: "y'' = −4y (ω = 2, oscila mas rapido)" },
  { type: "calc", input: "dsolve(y'' = -9*y)", content: "y'' = −9y (ω = 3)" },
  { type: "text", content: "¿Por que sin y cos? Porque sus segundas derivadas son el negativo de si mismas:" },
  { type: "calc", input: "diff(diff(sin(x), x), x)", content: "d²/dx² sin(x) = −sin(x) ← ¡cumple y'' = −y!" },
  { type: "calc", input: "diff(diff(cos(x), x), x)", content: "d²/dx² cos(x) = −cos(x) ← ¡tambien!" },
  { type: "space" },

  // ─── PARTE 6 ───────────────────────────────────────────
  { type: "h2", content: "Parte 6: El truco — Ecuacion Caracteristica" },
  { type: "text", content: "Para resolver $y'' + a*y' + b*y = 0$, el truco es <b>suponer</b> que la solucion es $exp(r*x)$ y ver que pasa:" },
  { type: "steps", items: [
    "Suponer: y = e^(r·x)",
    "Entonces: y' = r·e^(r·x), y'' = r²·e^(r·x)",
    "Sustituir: r²·e^(rx) + a·r·e^(rx) + b·e^(rx) = 0",
    "Factorizar: (r² + a·r + b)·e^(rx) = 0",
    "Como e^(rx) ≠ 0, dividir: r² + a·r + b = 0",
    "¡Una ecuacion cuadratica normal!",
  ]},
  { type: "key", content: "Convertiste una ecuacion diferencial en una cuadratica. Las raices r determinan todo." },

  { type: "text", content: "Ejemplo: $y'' - 5*y' + 6*y = 0$ → ecuacion caracteristica: $r^2 - 5*r + 6 = 0$" },
  { type: "calc", input: "solve(r^2 - 5*r + 6, r)", content: "Resolver la ecuacion caracteristica" },
  { type: "text", content: "Raices $r = 2$ y $r = 3$ → la solucion es:" },
  { type: "calc", input: "dsolve(y'' = 5*y' - 6*y)", content: "y = C₁·e^(2x) + C₂·e^(3x)" },

  { type: "text", content: "Si las raices son <b>complejas</b> $α ± β*i$, la solucion tiene sin y cos:" },
  { type: "calc", input: "dsolve(y'' = -4*y)", content: "r² + 4 = 0 → r = ±2i → sin y cos" },
  { type: "note", content: "Raices reales distintas → dos exponenciales<br>Raiz doble → exponencial × lineal<br>Raices complejas α±βi → e^(αx)·(sin + cos) → oscilacion" },
  { type: "space" },

  // ─── PARTE 7 ───────────────────────────────────────────
  { type: "h2", content: "Parte 7: Ejemplos fisicos" },

  { type: "h3", content: "Enfriamiento de Newton" },
  { type: "text", content: "Un cafe a 90°C en una habitacion a 20°C. La velocidad de enfriamiento es proporcional a la diferencia:" },
  { type: "steps", items: [
    "T' = −k·(T − 20)",
    "Si u = T − 20 → u' = −k·u",
    "Solucion: u = C·e^(−kt)",
    "T(t) = 20 + 70·e^(−kt)",
    "→ Baja exponencialmente hacia 20°C",
  ]},
  { type: "calc", input: "dsolve(y' = -y)", content: "u' = −u (forma basica)" },

  { type: "h3", content: "Masa-Resorte" },
  { type: "text", content: "Ley de Hooke: $F = -k*x$. Con $F = m*a = m*x''$:" },
  { type: "steps", items: [
    "m·x'' = −k·x",
    "x'' = −(k/m)·x = −ω²·x",
    "Solucion: x(t) = A·cos(ωt) + B·sin(ωt)",
    "ω = √(k/m) = frecuencia natural",
  ]},
  { type: "calc", input: "dsolve(y'' = -4*y)", content: "ω² = 4 → oscila con frecuencia ω = 2" },

  { type: "h3", content: "Circuito RLC" },
  { type: "text", content: "Misma ecuacion que el resorte: $L*q'' + R*q' + q/C = 0$" },
  { type: "steps", items: [
    "R bajo → oscila (corriente alterna)",
    "R alto → se amortigua (muere)",
    "¡Misma matematica, distinta fisica!",
  ]},
  { type: "space" },

  // ─── RESUMEN ───────────────────────────────────────────
  { type: "h2", content: "Resumen" },
  { type: "key", content: "1. Derivar es facil (son reglas mecanicas)<br>2. $exp(x)$ se deriva a si misma → aparece en toda solucion exponencial<br>3. $sin(x)$ y $cos(x)$ se derivan en ciclo → aparecen en oscilaciones<br>4. Para EDO de 2do orden: sustituir $y = exp(r*x)$ → ecuacion cuadratica en r<br>5. Raices reales → exponenciales, raices complejas → sin/cos" },
];

// ═══════════════════════════════════════════════════════════
// RENDER HTML PAGE
// ═══════════════════════════════════════════════════════════

function render(): string {
  const body: string[] = [];

  for (const s of tutorial) {
    switch (s.type) {
      case "h1": body.push(`<h1>${s.content}</h1>`); break;
      case "h2": body.push(`<h2>${s.content}</h2>`); break;
      case "h3": body.push(`<h3>${s.content}</h3>`); break;
      case "text": body.push(`<p class="text">${renderInlineMath(s.content!)}</p>`); break;
      case "note": body.push(`<div class="note">${renderInlineMath(s.content!)}</div>`); break;
      case "key": body.push(`<div class="key">${renderInlineMath(s.content!)}</div>`); break;
      case "space": body.push('<div class="spacer"></div>'); break;
      case "hr": body.push('<hr>'); break;
      case "calc": body.push(renderCalc(s.input!, s.content || "")); break;

      case "steps": {
        body.push(`<div class="steps">${s.items!.map((item, i) => {
          const last = i === s.items!.length - 1;
          return `<div class="step${last ? " step-final" : ""}">${renderInlineMath(item)}</div>`;
        }).join("")}</div>`);
        break;
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Tutorial: Ecuaciones Diferenciales</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #11111b; color: #cdd6f4;
    font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 15px;
    display: flex; justify-content: center; padding: 40px 20px;
  }
  .page {
    background: #1e1e2e; width: 880px; padding: 48px 56px;
    border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  h1 { font-size: 30px; font-weight: 700; color: #cba6f7;
       padding-bottom: 14px; border-bottom: 2px solid #313244; margin: 0 0 8px; }
  h2 { font-size: 21px; font-weight: 600; color: #89b4fa;
       margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #313244; }
  h3 { font-size: 17px; font-weight: 600; color: #74c7ec; margin: 22px 0 8px; }
  hr { border: none; border-top: 1px solid #313244; margin: 16px 0; }

  .text { font-size: 15px; line-height: 1.75; margin: 6px 0; }
  .text b { color: #f5c2e7; font-weight: 600; }
  .spacer { height: 14px; }

  .note {
    background: #1a1a2e; border-left: 3px solid #f9e2af;
    padding: 12px 18px; margin: 10px 0; border-radius: 0 6px 6px 0;
    font-size: 14px; color: #f9e2af; line-height: 1.7;
  }
  .note b { color: #fab387; }

  .key {
    background: #162016; border-left: 4px solid #a6e3a1;
    padding: 14px 20px; margin: 12px 0; border-radius: 0 6px 6px 0;
    font-size: 15px; color: #a6e3a1; line-height: 1.7; font-weight: 500;
  }
  .key b { color: #f5e0dc; }

  /* ─── Calc blocks ─── */
  .calc { margin: 8px 0; }
  .calc-comment { font-size: 12px; color: #6c7086; margin-bottom: 3px; padding-left: 16px; }
  .calc-box {
    display: flex; align-items: center; gap: 16px;
    padding: 10px 18px; background: #181825; border-radius: 8px;
    border-left: 3px solid #45475a; min-height: 44px;
    font-family: 'Georgia', 'Times New Roman', serif; font-size: 17px;
  }
  .calc-input { color: #bac2de; flex: 1; }
  .calc-eq { color: #f9e2af; font-size: 20px; font-weight: bold; flex-shrink: 0; }
  .calc-result { color: #a6e3a1; font-weight: 600; flex: 1; }

  /* ─── Math styles ─── */
  var { color: #f5c2e7; font-style: italic; font-family: 'Georgia', 'Times New Roman', serif; }
  var.const { color: #fab387; font-style: normal; font-weight: 600; }
  .fn { color: #89b4fa; font-style: normal; font-family: 'Inter', sans-serif; font-size: 0.88em; font-weight: 500; }
  .op { color: #f9e2af; font-style: normal; padding: 0 2px; }
  .num { color: #cdd6f4; font-style: normal; }
  .prime { color: #f5c2e7; font-size: 1.1em; }
  sup { font-size: 0.68em; vertical-align: super; line-height: 0; }
  sub { font-size: 0.68em; vertical-align: sub; line-height: 0; }

  /* Fractions */
  .frac {
    display: inline-flex; flex-direction: column; align-items: center;
    vertical-align: middle; margin: 0 3px; line-height: 1;
  }
  .frac-num { padding: 0 4px 2px; font-size: 0.88em; }
  .frac-bar { width: 100%; height: 1px; background: #9399b2; }
  .frac-den { padding: 2px 4px 0; font-size: 0.88em; }

  /* Square root */
  .sqrt { position: relative; display: inline-flex; align-items: center; }
  .sqrt::before {
    content: "√"; color: #89b4fa; font-size: 1.1em; margin-right: 1px;
  }
  .sqrt-inner {
    border-top: 1px solid #9399b2; padding: 0 3px; margin-left: -2px;
  }

  /* Integral symbol */
  .integral { font-size: 1.5em; color: #89b4fa; vertical-align: middle; line-height: 0.8; }

  /* Derivative d/dx block */
  .deriv { display: inline-flex; align-items: center; margin-right: 6px; }
  .deriv .frac { font-size: 0.9em; }

  /* Inline math in text */
  .inline-math {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 1.05em; padding: 0 2px;
  }

  /* Steps */
  .steps { margin: 8px 0 8px 14px; }
  .step {
    padding: 6px 16px; margin: 3px 0; border-left: 2px solid #45475a;
    font-family: 'Georgia', 'Times New Roman', serif; font-size: 15px;
    color: #bac2de; position: relative; line-height: 1.6;
  }
  .step::before {
    content: ""; position: absolute; left: -5px; top: 12px;
    width: 8px; height: 8px; background: #45475a; border-radius: 50%;
  }
  .step-final { border-left-color: #a6e3a1; color: #a6e3a1; font-weight: 600; }
  .step-final::before { background: #a6e3a1; }

  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #11111b; }
  ::-webkit-scrollbar-thumb { background: #45475a; border-radius: 4px; }
</style>
</head>
<body>
<div class="page">
${body.join("\n")}
</div>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────
const html = render();
const outPath = process.cwd() + "/tutorial-edo.html";
writeFileSync(outPath, html, "utf-8");
console.log(`\x1b[32m✓\x1b[0m Tutorial generado: ${outPath}`);

/**
 * Hekatan Renderer — AST to HTML, inline math, equation blocks
 */
import type { ASTNode } from "./evaluator.js";

let _decimals = 4;
export function setDecimals(n: number): void { _decimals = n; }
export function getDecimals(): number { return _decimals; }

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── renderNode: AST → HTML ──────────────────────────────
export function renderNode(node: ASTNode): string {
  switch (node.type) {
    case "number": return formatNum(node.value);
    case "variable": return `<var>${esc(node.name)}</var>`;
    case "assign": {
      let lhs = `<var>${esc(node.name)}</var>`;
      if (node.indices) lhs += `<sub>${node.indices.map(renderNode).join(",")}</sub>`;
      return `${lhs} = ${renderNode(node.expr)}`;
    }
    case "binary": {
      const { op, left, right } = node as Extract<ASTNode, { type: "binary" }>;
      if (op === "/") {
        // Wrap numerator and denominator in <span> so they stay as single flex items
        return `<span class="dvc"><span>${renderNode(left)}</span><span class="dvl"></span><span>${renderNode(right)}</span></span>`;
      }
      // Implicit multiplication: 2*x → 2x, number*variable or number*call
      if (op === "*" && left.type === "number" && (right.type === "variable" || right.type === "call" || right.type === "binary")) {
        return `${renderNode(left)}${renderNode(right)}`;
      }
      return `${renderNode(left)} ${opSymbol(op)} ${renderNode(right)}`;
    }
    case "unary":
      if (node.op === "-") return `−${renderNode(node.operand)}`;
      return `${node.op}${renderNode(node.operand)}`;
    case "call": {
      const args = node.args.map(renderNode).join("; ");
      return `<b>${esc(node.name)}</b>(${args})`;
    }
    case "index": {
      const idx = node.indices.map(renderNode).join(",");
      return `${renderNode(node.target)}<sub>${idx}</sub>`;
    }
    case "cellarray":
    case "vector":
      return `{${node.elements.map(renderNode).join("; ")}}`;
    case "matrix":
      return renderMatrixNode(node.rows);
    default:
      return esc(String((node as any).value || "?"));
  }
}

function isSimpleNode(n: ASTNode): boolean {
  return n.type === "number" || n.type === "variable";
}

function opSymbol(op: string): string {
  switch (op) {
    case "*": return "·";
    case "<=": return "≤";
    case ">=": return "≥";
    case "!=": return "≠";
    default: return op;
  }
}

function formatNum(v: number): string {
  if (typeof v !== "number") return String(v);
  if (!isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "NaN";
  const s = v.toFixed(_decimals);
  return s.replace(/\.?0+$/, "") || "0";
}

function renderMatrixNode(rows: ASTNode[][]): string {
  let html = '<table class="mat"><tbody>';
  for (const row of rows) {
    html += "<tr>";
    for (const cell of row) html += `<td>${renderNode(cell)}</td>`;
    html += "</tr>";
  }
  return html + "</tbody></table>";
}

// ─── renderValue: number → HTML ──────────────────────────
export function renderValue(val: number | number[] | number[][], units?: string): string {
  // Handle math.js DenseMatrix objects
  if (val && typeof val === "object" && typeof (val as any).toArray === "function") {
    val = (val as any).toArray();
  }
  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) return renderMatrix(val as number[][]);
    return renderVector(val as number[]);
  }
  let s = formatNum(val as number);
  if (units) s += ` <span class="units">${esc(units)}</span>`;
  return s;
}

export function renderMatrix(m: number[][]): string {
  let html = '<table class="mat"><tbody>';
  for (const row of m) {
    html += "<tr>";
    for (const v of row) html += `<td>${formatNum(v)}</td>`;
    html += "</tr>";
  }
  return html + "</tbody></table>";
}

export function renderVector(v: number[]): string {
  return `{${v.map(formatNum).join("; ")}}`;
}

/** row() display: render any matrix/vector as a single horizontal line */
export function renderValueRow(val: number | number[] | number[][]): string {
  if (val && typeof val === "object" && typeof (val as any).toArray === "function") val = (val as any).toArray();
  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) {
      const m = val as number[][];
      if (m.length === 1) return `[${m[0].map(formatNum).join("&ensp;")}]`;
      return `[${m.map(row => row.map(formatNum).join("&ensp;")).join(";&ensp;")}]`;
    }
    return `[${(val as number[]).map(formatNum).join("&ensp;")}]`;
  }
  return formatNum(val);
}

/** col() display: render any matrix/vector as a vertical column table */
export function renderValueCol(val: number | number[] | number[][]): string {
  if (val && typeof val === "object" && typeof (val as any).toArray === "function") val = (val as any).toArray();
  if (Array.isArray(val)) {
    if (Array.isArray(val[0])) return renderMatrix(val as number[][]);
    // 1D vector → vertical column
    const v = val as number[];
    let html = '<table class="mat"><tbody>';
    for (const x of v) html += `<tr><td>${formatNum(x)}</td></tr>`;
    return html + "</tbody></table>";
  }
  return formatNum(val);
}

export function renderMatrixOperation(label: string, m: number[][]): string {
  return `<div class="mat-op"><span class="mat-label">${esc(label)}</span> = ${renderMatrix(m)}</div>`;
}

export function renderVectorOperation(label: string, v: number[]): string {
  return `<div class="vec-op"><span class="vec-label">${esc(label)}</span> = ${renderVector(v)}</div>`;
}

// ─── renderInlineText: text with inline math ─────────────
export function renderInlineText(text: string): string {
  let html = "";
  // Replace Unicode operators first
  let processed = text
    .replace(/≤/g, "≤").replace(/≥/g, "≥")
    .replace(/·/g, "·").replace(/×/g, "×");

  let i = 0;
  while (i < processed.length) {
    const ch = processed[i];

    // N-ary operators: ∫ ∬ ∭ ∑ ∏
    if ("\u222B\u222C\u222D\u2211\u220F\u03A3\u03A0".includes(ch)) {
      const sym = ch === "\u03A3" ? "\u2211" : ch === "\u03A0" ? "\u220F" : ch;
      const r = buildNary(processed, i + 1, sym);
      html += r.html; i = r.end; continue;
    }

    // Partial ∂
    if (ch === "\u2202") {
      const rest = processed.slice(i);
      const pMatch = rest.match(/^∂([²³]?)\/∂([A-Za-z])\1/);
      if (pMatch) {
        const order = pMatch[1]; const v = pMatch[2];
        const top = order ? `∂${order}` : "∂";
        const bot = `∂${v}${order}`;
        html += `<span class="dvc">${top}<span class="dvl"></span>${bot}</span>`;
        i += pMatch[0].length; continue;
      }
      html += "∂"; i++; continue;
    }

    // Superscript
    if (ch === "^" && i > 0) {
      const g = extractGroup(processed, i + 1);
      if (g) { html += `<sup>${esc(g.content)}</sup>`; i = g.end; continue; }
    }

    // Subscript
    if (ch === "_" && i > 0) {
      const g = extractGroup(processed, i + 1);
      if (g) { html += `<sub>${esc(g.content)}</sub>`; i = g.end; continue; }
    }

    html += esc(ch);
    i++;
  }
  return html;
}

// ─── renderEquationText: @{eq} block content → HTML ──────
const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", omicron: "ο", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ",
  Eta: "Η", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Sigma: "Σ", Phi: "Φ",
  Psi: "Ψ", Omega: "Ω",
};

const EQ_FN_NAMES = new Set([
  "sin","cos","tan","cot","sec","csc","asin","acos","atan","acot",
  "sinh","cosh","tanh","coth","ln","log","exp","sqrt","abs","sgn","sign",
  "min","max","sum","prod","det","tr","rank","dim","ker","Im","Re",
]);

export function renderEquationText(text: string): string {
  let html = "";
  let i = 0;
  const len = text.length;
  let lastTokenStart = 0;

  while (i < len) {
    const ch = text[i];

    // N-ary Unicode: ∫ ∬ ∭ ∑ ∏
    if ("\u222B\u222C\u222D\u2211\u220F".includes(ch)) {
      const r = buildNary(text, i + 1, ch);
      html += r.html; i = r.end; continue;
    }
    // Σ Π (Greek)
    if (ch === "\u03A3" || ch === "\u03A0") {
      const sym = ch === "\u03A3" ? "\u2211" : "\u220F";
      const r = buildNary(text, i + 1, sym);
      html += r.html; i = r.end; continue;
    }

    // Partial ∂
    if (ch === "\u2202") {
      const rest = text.slice(i);
      const m2 = rest.match(/^∂([²³⁴]?)\/∂([A-Za-z])([²³⁴]?)/);
      if (m2) {
        const ord = m2[1] || m2[3];
        const v = m2[2];
        const top = ord ? `∂${ord}` : "∂";
        const bot = `∂${v}${ord}`;
        html += `<span class="dvc">${top}<span class="dvl"></span>${bot}</span>`;
        i += m2[0].length; continue;
      }
      html += "∂"; i++; continue;
    }

    // Subscript
    if (ch === "_") {
      const g = extractGroup(text, i + 1);
      if (g) {
        // Simple word/number → plain text with Greek; complex → full render
        const sub = /^[A-Za-z0-9]+$/.test(g.content) ? (GREEK[g.content] || esc(g.content)) : renderEquationText(g.content);
        html += `<sub>${sub}</sub>`;
        i = g.end; continue;
      }
    }

    // Superscript
    if (ch === "^") {
      const g = extractGroup(text, i + 1);
      if (g) {
        const sup = /^[A-Za-z0-9]+$/.test(g.content) ? (GREEK[g.content] || esc(g.content)) : renderEquationText(g.content);
        html += `<sup>${sup}</sup>`;
        i = g.end; continue;
      }
    }

    // Fraction {num}/{den}
    if (ch === "{") {
      const close = findMatchingBrace(text, i);
      if (close > 0 && close + 1 < len && text[close + 1] === "/") {
        const num = text.slice(i + 1, close);
        const afterSlash = close + 2;
        if (afterSlash < len && text[afterSlash] === "{") {
          const close2 = findMatchingBrace(text, afterSlash);
          if (close2 > 0) {
            const den = text.slice(afterSlash + 1, close2);
            html += `<span class="dvc">${renderEquationText(num)}<span class="dvl"></span>${renderEquationText(den)}</span>`;
            i = close2 + 1; continue;
          }
        }
      }
      // Not a fraction, just output brace content
      const close2 = findMatchingBrace(text, i);
      if (close2 > 0) {
        html += renderEquationText(text.slice(i + 1, close2));
        i = close2 + 1; continue;
      }
    }

    // Fraction (num)/(den)
    if (ch === "(") {
      const close = findMatchingParen(text, i);
      if (close > 0 && close + 1 < len && text[close + 1] === "/") {
        const afterSlash = close + 2;
        if (afterSlash < len && text[afterSlash] === "(") {
          const close2 = findMatchingParen(text, afterSlash);
          if (close2 > 0) {
            const num = text.slice(i + 1, close);
            const den = text.slice(afterSlash + 1, close2);
            html += `<span class="dvc">${renderEquationText(num)}<span class="dvl"></span>${renderEquationText(den)}</span>`;
            i = close2 + 1; continue;
          }
        }
      }
      // Normal parens
      const close2 = findMatchingParen(text, i);
      if (close2 > 0) {
        html += `(${renderEquationText(text.slice(i + 1, close2))})`;
        i = close2 + 1; continue;
      }
    }

    // Arrow ->
    if (ch === "-" && i + 1 < len && text[i + 1] === ">") {
      html += "→"; i += 2; continue;
    }
    // Comparison shortcuts
    if (ch === ">" && i + 1 < len && text[i + 1] === "=") { html += "≥"; i += 2; continue; }
    if (ch === "<" && i + 1 < len && text[i + 1] === "=") { html += "≤"; i += 2; continue; }
    if (ch === "!" && i + 1 < len && text[i + 1] === "=") { html += "≠"; i += 2; continue; }
    if (ch === "~" && i + 1 < len && text[i + 1] === "=") { html += "≈"; i += 2; continue; }

    // Word tokens
    if (/[A-Za-z]/.test(ch)) {
      lastTokenStart = html.length;
      let word = "";
      let j = i;
      while (j < len && /[A-Za-z0-9]/.test(text[j])) { word += text[j]; j++; }

      // N-ary aliases
      if (word === "Int" || word === "int") {
        const r = buildNary(text, j, "\u222B"); html += r.html; i = r.end; continue;
      }
      if (word === "Sum") {
        const r = buildNary(text, j, "\u2211"); html += r.html; i = r.end; continue;
      }
      if (word === "Prod") {
        const r = buildNary(text, j, "\u220F"); html += r.html; i = r.end; continue;
      }

      // lim
      if (word === "lim") {
        let limHtml = '<span style="font-style:normal;font-weight:bold;">lim</span>';
        if (j < len && text[j] === "_") {
          const g = extractGroup(text, j + 1);
          if (g) { limHtml = `<span class="dvr">${limHtml}<small>${renderEquationText(g.content)}</small></span>`; j = g.end; }
        }
        html += limHtml; i = j; continue;
      }

      // d/dx derivative
      if (word === "d" && j < len && text[j] === "/") {
        const dMatch = text.slice(i).match(/^d([²³]?)\/d([A-Za-z])([²³]?)/);
        if (dMatch) {
          const ord = dMatch[1] || dMatch[3];
          const v = dMatch[2];
          const top = ord ? `d${ord}` : "d";
          const bot = `d${v}${ord}`;
          html += `<span class="dvc">${top}<span class="dvl"></span>${bot}</span>`;
          i += dMatch[0].length; continue;
        }
      }

      // Greek letters
      if (GREEK[word]) { html += GREEK[word]; i = j; continue; }

      // Function names
      if (EQ_FN_NAMES.has(word)) {
        html += `<b>${word}</b>`; i = j; continue;
      }

      // inf → ∞
      if (word === "inf" || word === "infty" || word === "infinity") {
        html += "∞"; i = j; continue;
      }

      // Regular variable
      html += `<var>${esc(word)}</var>`;
      i = j; continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      lastTokenStart = html.length;
      let num = "";
      let j = i;
      while (j < len && /[0-9.]/.test(text[j])) { num += text[j]; j++; }
      html += num; i = j; continue;
    }

    // Unicode math pass-through
    if (/[\u2200-\u22FF\u2100-\u214F]/.test(ch)) { html += ch; i++; continue; }

    // Multiplication: * → · between numbers, juxtaposition between variables
    if (ch === "*") {
      const prevIsNum = /\d/.test(html.slice(-1));
      const nextIsNum = i + 1 < len && /[0-9]/.test(text[i + 1]);
      html += (prevIsNum && nextIsNum) ? "·" : "";
      i++; continue;
    }

    // Operators with spacing
    if ("+-=<>".includes(ch)) { html += ` ${esc(ch)} `; i++; continue; }

    // Dot product
    if (ch === "·") { html += " · "; i++; continue; }

    // Bare fraction: a/b (no spaces around /)
    if (ch === "/") {
      if (i > 0 && text[i - 1] !== " " && i + 1 < len && text[i + 1] !== " " && html.length > lastTokenStart) {
        const numHtml = html.slice(lastTokenStart);
        html = html.slice(0, lastTokenStart);
        i++; // skip /
        let denHtml = "";
        // Capture denominator token
        if (i < len && text[i] === "(") {
          const close = findMatchingParen(text, i);
          if (close > 0) { denHtml = renderEquationText(text.slice(i + 1, close)); i = close + 1; }
        } else if (i < len && text[i] === "{") {
          const close = findMatchingBrace(text, i);
          if (close > 0) { denHtml = renderEquationText(text.slice(i + 1, close)); i = close + 1; }
        } else if (i < len && text[i] === "\u221A") {
          // √ followed by group or token
          denHtml = "\u221A";
          i++;
          if (i < len && text[i] === "(") {
            const close = findMatchingParen(text, i);
            if (close > 0) { denHtml += `(${renderEquationText(text.slice(i + 1, close))})`; i = close + 1; }
          } else if (i < len && /[A-Za-z]/.test(text[i])) {
            let w = "", j = i; while (j < len && /[A-Za-z0-9]/.test(text[j])) { w += text[j]; j++; }
            denHtml += GREEK[w] || `<var>${esc(w)}</var>`; i = j;
          } else if (i < len && /[0-9]/.test(text[i])) {
            let n = "", j = i; while (j < len && /[0-9.]/.test(text[j])) { n += text[j]; j++; }
            denHtml += n; i = j;
          }
        } else if (i < len && /[A-Za-z]/.test(text[i])) {
          let word = "", j = i;
          while (j < len && /[A-Za-z0-9]/.test(text[j])) { word += text[j]; j++; }
          i = j;
          if (i < len && text[i] === "(") {
            const close = findMatchingParen(text, i);
            if (close > 0) {
              const fn = EQ_FN_NAMES.has(word) ? `<b>${word}</b>` : (GREEK[word] || `<var>${esc(word)}</var>`);
              denHtml = `${fn}(${renderEquationText(text.slice(i + 1, close))})`; i = close + 1;
            } else { denHtml = GREEK[word] || (EQ_FN_NAMES.has(word) ? `<b>${word}</b>` : `<var>${esc(word)}</var>`); }
          } else { denHtml = GREEK[word] || (EQ_FN_NAMES.has(word) ? `<b>${word}</b>` : `<var>${esc(word)}</var>`); }
        } else if (i < len && /[0-9]/.test(text[i])) {
          let num = "", j = i; while (j < len && /[0-9.]/.test(text[j])) { num += text[j]; j++; }
          denHtml = num; i = j;
        } else if (i < len) { denHtml = esc(text[i]); i++; }
        // Subscript/superscript on denominator
        while (i < len && (text[i] === "_" || text[i] === "^")) {
          const tag = text[i] === "_" ? "sub" : "sup";
          const g = extractGroup(text, i + 1);
          if (g) {
            const inner = /^[A-Za-z0-9]+$/.test(g.content) ? (GREEK[g.content] || esc(g.content)) : renderEquationText(g.content);
            denHtml += `<${tag}>${inner}</${tag}>`; i = g.end;
          } else break;
        }
        lastTokenStart = html.length;
        html += `<span class="dvc"><span>${numHtml}</span><span class="dvl"></span><span>${denHtml}</span></span>`;
        continue;
      }
      html += " / "; i++; continue;
    }

    // Space → thin space
    if (ch === " ") { html += "&thinsp;"; i++; continue; }

    html += esc(ch);
    i++;
  }
  return html;
}

// ─── Helpers ─────────────────────────────────────────────
function buildNary(text: string, startIdx: number, symbol: string): { html: string; end: number } {
  let i = startIdx;
  let sub = "", sup = "";

  // Parse _sub and ^sup in any order
  for (let pass = 0; pass < 2; pass++) {
    if (i < text.length && text[i] === "_") {
      const g = extractGroup(text, i + 1);
      if (g) { sub = g.content; i = g.end; }
    } else if (i < text.length && text[i] === "^") {
      const g = extractGroup(text, i + 1);
      if (g) { sup = g.content; i = g.end; }
    }
  }

  let html = '<span class="dvr">';
  if (sup) html += `<small>${renderEquationText(sup)}</small>`;
  html += `<span class="nary">${symbol === "\u222B" || symbol === "\u222C" || symbol === "\u222D" ? `<em>${symbol}</em>` : symbol}</span>`;
  if (sub) html += `<small>${renderEquationText(sub)}</small>`;
  html += '</span>';
  return { html, end: i };
}

function extractGroup(text: string, idx: number): { content: string; end: number } | null {
  if (idx >= text.length) return null;
  if (text[idx] === "{") {
    const close = findMatchingBrace(text, idx);
    if (close > 0) return { content: text.slice(idx + 1, close), end: close + 1 };
    return null;
  }
  // Letters: capture full word (e.g. _max → "max")
  if (/[A-Za-zα-ωΑ-Ω]/.test(text[idx])) {
    let j = idx;
    while (j < text.length && /[A-Za-z0-9α-ωΑ-Ω]/.test(text[j])) j++;
    return { content: text.slice(idx, j), end: j };
  }
  // Digits: capture full number (e.g. ^23 → "23")
  if (/[0-9]/.test(text[idx])) {
    let j = idx;
    while (j < text.length && /[0-9]/.test(text[j])) j++;
    return { content: text.slice(idx, j), end: j };
  }
  if (text[idx] === "∞") return { content: "∞", end: idx + 1 };
  return null;
}

function findMatchingBrace(text: string, idx: number): number {
  let depth = 1;
  for (let i = idx + 1; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function findMatchingParen(text: string, idx: number): number {
  let depth = 1;
  for (let i = idx + 1; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

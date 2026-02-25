/**
 * MathStyles - Estilos visuales para el MathEditor web
 * Idénticos al template.html de Hekatan y MathStyles.cs del WPF
 */

// ============================================================================
// FUENTES - Exactamente como template.html
// ============================================================================
export const EquationFont = "'Georgia Pro', 'Century Schoolbook', 'Times New Roman', Times, serif";
export const SubscriptFont = "Calibri, Candara, Corbel, sans-serif";
export const SymbolFont = "'Cambria Math'";
export const UIFont = "'Segoe UI', 'Arial Nova', Helvetica, sans-serif";
export const CodeFont = "Consolas, 'Courier New', monospace";

// ============================================================================
// COLORES - Exactamente como template.html
// ============================================================================
export const VariableColor = "#06d";    // .eq var { color: #06d; }
export const FunctionColor = "#086";    // .eq i { color: #086; }
export const UnitColor = "#043";        // i.unit { color: #043; }
export const NumberColor = "#000";
export const OperatorColor = "#000";
export const TextColor = "#000";
export const SelectionColor = "#00f";
export const CursorColor = "#06d";
export const LineColor = "#666";
export const BracketColor = "#000";

// Colores de fondo
export const EditorBackground = "#fff";
export const LineNumberBackground = "#f5f5f5";
export const SelectionBackground = "rgba(0, 102, 221, 0.2)";

// ============================================================================
// TAMAÑOS RELATIVOS - Exactamente como template.html
// ============================================================================
export const VariableSizeRatio = 1.05;     // .eq var { font-size: 105%; }
export const FunctionSizeRatio = 0.90;     // .eq i { font-size: 90%; }
export const SubscriptSizeRatio = 0.80;    // .eq sub { font-size: 80%; }
export const SuperscriptSizeRatio = 0.75;  // .eq sup { font-size: 75%; }
export const SmallSizeRatio = 0.70;        // .eq small { font-size: 70%; }
export const UnitSupSizeRatio = 0.70;      // sup.unit { font-size: 70%; }
export const FractionSizeRatio = 0.85;

// ============================================================================
// POSICIONAMIENTO
// ============================================================================
export const SubscriptVerticalAlign = -0.18;
export const SuperscriptMarginTop = -3.0;
export const SuperscriptMarginLeft = 1.0;

// Espaciado
export const LineHeight = 1.5;
export const ElementSpacing = 4.0;
export const FractionLineThickness = 1.0;
export const BracketThickness = 1.5;

// Tamaños del heading (h1-h6)
export const HeadingSizeRatios = [1, 2.0, 1.5, 1.17, 1.0, 0.83, 0.67];

// ============================================================================
// DRAW / CAD - Estilos para bloques @{draw}
// ============================================================================
export const DrawBackground = "#ffffff";
export const DrawBorderColor = "#bbb";
export const DrawGridColor = "rgba(0,0,0,0.06)";
export const DrawOriginColor = "rgba(0,0,0,0.15)";
export const DrawLabelColor = "rgba(0,0,0,0.3)";

// ============================================================================
// FUNCIONES HELPER
// ============================================================================

const KNOWN_FUNCTIONS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "asin", "acos", "atan", "acot", "asec", "acsc",
  "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "asinh", "acosh", "atanh", "acoth", "asech", "acsch",
  "log", "ln", "exp", "sqrt", "cbrt", "root",
  "abs", "sign", "floor", "ceiling", "round", "trunc",
  "min", "max", "sum", "product", "average",
  "if", "switch", "not", "and", "or", "xor",
  "vector", "matrix", "len", "size", "det", "inv", "transpose",
]);

const OPERATOR_CHARS = new Set([
  "+", "-", "*", "/", "^", "=", "<", ">",
  "(", ")", "[", "]", "{", "}", "|",
  ",", ";", ":", ".", " ",
  "≤", "≥", "≠", "≡", "∧", "∨", "⊕",
]);

export function isKnownFunction(text: string): boolean {
  return KNOWN_FUNCTIONS.has(text.toLowerCase());
}

export function isOperator(text: string): boolean {
  return text === "+" || text === "-" || text === "*" || text === "/" ||
    text === "^" || text === "=" || text === "<" || text === ">" ||
    text === "≤" || text === "≥" || text === "≠";
}

export function isOperatorChar(c: string): boolean {
  return OPERATOR_CHARS.has(c);
}

export function getColorForContent(text: string): string {
  if (!text) return TextColor;
  if (/^\d/.test(text) || (text[0] === "-" && text.length > 1 && /\d/.test(text[1])))
    return NumberColor;
  if (isKnownFunction(text)) return FunctionColor;
  if (isOperator(text)) return OperatorColor;
  return VariableColor;
}

/** Tokeniza texto para syntax highlighting */
export interface HighlightToken {
  text: string;
  type: "number" | "operator" | "function" | "variable";
}

export function tokenize(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  if (!text) return tokens;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\d/.test(c) || (c === "." && i + 1 < text.length && /\d/.test(text[i + 1]))) {
      const start = i;
      while (i < text.length && (/\d/.test(text[i]) || text[i] === ".")) i++;
      tokens.push({ text: text.slice(start, i), type: "number" });
    } else if (isOperatorChar(c)) {
      tokens.push({ text: c, type: "operator" });
      i++;
    } else if (/[a-zA-Zα-ωΑ-Ω_]/.test(c)) {
      const start = i;
      while (i < text.length && /[\w_]/.test(text[i])) i++;
      const word = text.slice(start, i);
      tokens.push({ text: word, type: isKnownFunction(word) ? "function" : "variable" });
    } else {
      tokens.push({ text: c, type: "operator" });
      i++;
    }
  }
  return tokens;
}

// ─── Greek letter display map ─────────────────────────────────
const GREEK_MAP: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε",
  Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ",
  Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο",
  Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ",
  Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
};

/** Replace Greek letter names with Unicode symbols for display */
function replaceGreekNames(text: string): string {
  // Match whole words only (Greek names that are standalone identifiers)
  return text.replace(/\b([A-Za-z]+)\b/g, (m) => GREEK_MAP[m] ?? m);
}

/** Transforma operadores para visualizacion mejorada (* → · , espacios alrededor de =) */
export function transformOperatorsForDisplay(text: string): string {
  if (!text) return text;
  // First replace Greek names → Unicode symbols
  text = replaceGreekNames(text);
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "*") {
      if (result.length > 0 && result[result.length - 1] !== " ") result += " ";
      result += "·";
      if (i + 1 < text.length && text[i + 1] !== " ") result += " ";
    } else if (c === "=") {
      if (result.length > 0 && result[result.length - 1] !== " ") result += " ";
      result += c;
      if (i + 1 < text.length && text[i + 1] !== " ") result += " ";
    } else if (c === ",") {
      result += c;
      if (i + 1 < text.length && text[i + 1] !== " ") result += " ";
    } else {
      result += c;
    }
  }
  return result;
}

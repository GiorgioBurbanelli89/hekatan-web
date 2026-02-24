/**
 * Hekatan Evaluator — Numeric expression engine
 *
 * Tokenizer → Parser (recursive descent) → AST → Evaluate
 * Supports: variables, functions, units, cell arrays, vectors, matrices
 */

// ─── AST Node types ───────────────────────────────────────
export type ASTNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "binary"; op: string; left: ASTNode; right: ASTNode }
  | { type: "unary"; op: string; operand: ASTNode }
  | { type: "call"; name: string; args: ASTNode[] }
  | { type: "index"; target: ASTNode; indices: ASTNode[] }
  | { type: "assign"; name: string; expr: ASTNode; indices?: ASTNode[] }
  | { type: "vector"; elements: ASTNode[] }
  | { type: "matrix"; rows: ASTNode[][] }
  | { type: "cellarray"; elements: ASTNode[] }
  | { type: "conditional"; cond: ASTNode; ifTrue: ASTNode; ifFalse: ASTNode };

// ─── Token types ──────────────────────────────────────────
interface Token {
  type: "number" | "ident" | "op" | "lparen" | "rparen" | "lbracket" | "rbracket"
    | "lbrace" | "rbrace" | "comma" | "semicolon" | "assign" | "pipe" | "eof";
  value: string;
}

// ─── Tokenizer ────────────────────────────────────────────
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    // Whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Numbers: 123, 1.5, .5, 1e-3
    if (/[0-9.]/.test(ch) && (ch !== "." || (i + 1 < len && /[0-9]/.test(expr[i + 1])))) {
      let num = "";
      while (i < len && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      if (i < len && /[eE]/.test(expr[i])) {
        num += expr[i]; i++;
        if (i < len && /[+-]/.test(expr[i])) { num += expr[i]; i++; }
        while (i < len && /[0-9]/.test(expr[i])) { num += expr[i]; i++; }
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    // Identifiers and keywords
    if (/[A-Za-z_α-ωΑ-Ω∞]/.test(ch)) {
      let id = "";
      while (i < len && /[A-Za-z_0-9α-ωΑ-Ω∞]/.test(expr[i])) { id += expr[i]; i++; }
      tokens.push({ type: "ident", value: id });
      continue;
    }

    // Unicode math operators
    if (ch === "≤") { tokens.push({ type: "op", value: "<=" }); i++; continue; }
    if (ch === "≥") { tokens.push({ type: "op", value: ">=" }); i++; continue; }
    if (ch === "≠") { tokens.push({ type: "op", value: "!=" }); i++; continue; }
    if (ch === "·" || ch === "×") { tokens.push({ type: "op", value: "*" }); i++; continue; }
    if (ch === "÷") { tokens.push({ type: "op", value: "/" }); i++; continue; }

    // Two-char operators
    if (i + 1 < len) {
      const two = ch + expr[i + 1];
      if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
        tokens.push({ type: "op", value: two }); i += 2; continue;
      }
    }

    // Single-char
    switch (ch) {
      case "(": tokens.push({ type: "lparen", value: ch }); break;
      case ")": tokens.push({ type: "rparen", value: ch }); break;
      case "[": tokens.push({ type: "lbracket", value: ch }); break;
      case "]": tokens.push({ type: "rbracket", value: ch }); break;
      case "{": tokens.push({ type: "lbrace", value: ch }); break;
      case "}": tokens.push({ type: "rbrace", value: ch }); break;
      case ",": tokens.push({ type: "comma", value: ch }); break;
      case ";": tokens.push({ type: "semicolon", value: ch }); break;
      case "=": tokens.push({ type: "assign", value: ch }); break;
      case "|": tokens.push({ type: "pipe", value: ch }); break;
      case "+": case "-": case "*": case "/": case "^": case "%":
      case "<": case ">": case "!":
        tokens.push({ type: "op", value: ch }); break;
      default:
        i++; continue; // skip unknown
    }
    i++;
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private expect(type: Token["type"]): Token {
    const t = this.advance();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} "${t.value}"`);
    return t;
  }

  parse(): ASTNode {
    const node = this.parseAssignOrExpr();
    return node;
  }

  private parseAssignOrExpr(): ASTNode {
    // Check: ident = expr  or  ident[idx] = expr
    if (this.peek().type === "ident") {
      const saved = this.pos;
      const name = this.advance().value;

      // indexed assignment: A[i] = expr
      if (this.peek().type === "lbracket") {
        this.advance();
        const indices: ASTNode[] = [this.parseExpr()];
        while (this.peek().type === "semicolon" || this.peek().type === "comma") {
          this.advance();
          indices.push(this.parseExpr());
        }
        this.expect("rbracket");
        if (this.peek().type === "assign") {
          this.advance();
          return { type: "assign", name, expr: this.parseExpr(), indices };
        }
      }

      // simple assignment: x = expr
      if (this.peek().type === "assign") {
        this.advance();
        return { type: "assign", name, expr: this.parseExpr() };
      }

      // Not assignment — backtrack
      this.pos = saved;
    }
    return this.parseExpr();
  }

  private parseExpr(): ASTNode { return this.parseOr(); }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.peek().value === "||" || (this.peek().type === "ident" && this.peek().value === "or")) {
      this.advance();
      left = { type: "binary", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseComparison();
    while (this.peek().value === "&&" || (this.peek().type === "ident" && this.peek().value === "and")) {
      this.advance();
      left = { type: "binary", op: "&&", left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddSub();
    const ops = ["==", "!=", "<", ">", "<=", ">="];
    while (ops.includes(this.peek().value)) {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parseAddSub() };
    }
    return left;
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek().value === "+" || this.peek().value === "-") {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parsePower();
    while (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%") {
      const op = this.advance().value;
      left = { type: "binary", op, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let base = this.parseUnary();
    if (this.peek().value === "^") {
      this.advance();
      base = { type: "binary", op: "^", left: base, right: this.parsePower() }; // right-assoc
    }
    return base;
  }

  private parseUnary(): ASTNode {
    if (this.peek().value === "-") {
      this.advance();
      return { type: "unary", op: "-", operand: this.parseUnary() };
    }
    if (this.peek().value === "+") {
      this.advance();
      return this.parseUnary();
    }
    if (this.peek().value === "!" || (this.peek().type === "ident" && this.peek().value === "not")) {
      this.advance();
      return { type: "unary", op: "!", operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();
    // Function calls and indexing
    while (true) {
      if (this.peek().type === "lbracket") {
        this.advance();
        const indices: ASTNode[] = [this.parseExpr()];
        while (this.peek().type === "semicolon" || this.peek().type === "comma") {
          this.advance();
          indices.push(this.parseExpr());
        }
        this.expect("rbracket");
        node = { type: "index", target: node, indices };
      } else {
        break;
      }
    }
    return node;
  }

  private parsePrimary(): ASTNode {
    const t = this.peek();

    // Number
    if (t.type === "number") {
      this.advance();
      return { type: "number", value: parseFloat(t.value) };
    }

    // Parenthesized expression
    if (t.type === "lparen") {
      this.advance();
      const expr = this.parseExpr();
      this.expect("rparen");
      return expr;
    }

    // Cell array: {a; b; c}
    if (t.type === "lbrace") {
      this.advance();
      const elements: ASTNode[] = [];
      if (this.peek().type !== "rbrace") {
        elements.push(this.parseExpr());
        while (this.peek().type === "semicolon" || this.peek().type === "comma") {
          this.advance();
          elements.push(this.parseExpr());
        }
      }
      this.expect("rbrace");
      return { type: "cellarray", elements };
    }

    // Identifier: variable, function call, or constant
    if (t.type === "ident") {
      this.advance();
      const name = t.value;

      // Function call
      if (this.peek().type === "lparen") {
        this.advance();
        const args: ASTNode[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek().type === "comma" || this.peek().type === "semicolon") {
            this.advance();
            args.push(this.parseExpr());
          }
        }
        this.expect("rparen");
        return { type: "call", name, args };
      }

      return { type: "variable", name };
    }

    throw new Error(`Unexpected token: ${t.type} "${t.value}"`);
  }
}

// ─── Built-in functions ───────────────────────────────────
const BUILTINS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt,
  abs: Math.abs, sign: Math.sign, sgn: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  ln: Math.log, log: Math.log10, log2: Math.log2, log10: Math.log10,
  exp: Math.exp,
  min: Math.min, max: Math.max,
  pow: Math.pow, hypot: Math.hypot,
  random: Math.random,
  rad: (deg: number) => deg * Math.PI / 180,
  deg: (rad: number) => rad * 180 / Math.PI,
  // Combinatorics
  fact: (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  comb: (n: number, k: number) => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
  },
  perm: (n: number, k: number) => {
    let r = 1;
    for (let i = 0; i < k; i++) r *= (n - i);
    return r;
  },
  // Interpolation
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
};

// ─── Constants ────────────────────────────────────────────
const CONSTANTS: Record<string, number> = {
  pi: Math.PI, PI: Math.PI, π: Math.PI,
  e: Math.E, E: Math.E,
  g: 9.80665,
  inf: Infinity, Inf: Infinity, "∞": Infinity,
  true: 1, false: 0,
};

// ─── Environment ──────────────────────────────────────────
export class HekatanEnvironment {
  variables: Map<string, number | number[] | number[][]> = new Map();
  userFunctions: Map<string, { params: string[]; body: ASTNode }> = new Map();
  /** Multiline function bodies: name → lines (raw text) */
  multilineFunctions: Map<string, { params: string[]; lines: string[] }> = new Map();
  decimals = 4;

  reset(): void {
    this.variables.clear();
    this.userFunctions.clear();
    this.multilineFunctions.clear();
  }

  getVar(name: string): number | number[] | number[][] | undefined {
    if (CONSTANTS[name] !== undefined) return CONSTANTS[name];
    return this.variables.get(name);
  }

  setVar(name: string, value: number | number[] | number[][]): void {
    this.variables.set(name, value);
  }
}

// ─── Evaluate ─────────────────────────────────────────────
export function parseExpression(expr: string): ASTNode {
  const tokens = tokenize(expr);
  return new Parser(tokens).parse();
}

export function evaluate(node: ASTNode, env: HekatanEnvironment): number | number[] | number[][] {
  switch (node.type) {
    case "number":
      return node.value;

    case "variable": {
      const val = env.getVar(node.name);
      if (val === undefined) throw new Error(`Undefined variable: ${node.name}`);
      return val;
    }

    case "assign": {
      const val = evaluate(node.expr, env);
      if (node.indices) {
        // Indexed assignment
        const existing = env.getVar(node.name);
        const idx = evaluate(node.indices[0], env);
        if (typeof idx !== "number") throw new Error("Index must be a number");
        const i = Math.round(idx);
        if (Array.isArray(existing)) {
          (existing as number[])[i] = val as number;
          env.setVar(node.name, existing);
        } else {
          // Create new array
          const arr: number[] = [];
          arr[i] = val as number;
          env.setVar(node.name, arr);
        }
      } else {
        env.setVar(node.name, val);
      }
      return val;
    }

    case "binary": {
      const l = evaluate(node.left, env);
      const r = evaluate(node.right, env);
      const lv = typeof l === "number" ? l : NaN;
      const rv = typeof r === "number" ? r : NaN;
      switch (node.op) {
        case "+": return lv + rv;
        case "-": return lv - rv;
        case "*": return lv * rv;
        case "/": return rv === 0 ? NaN : lv / rv;
        case "^": return Math.pow(lv, rv);
        case "%": return lv % rv;
        case "==": return lv === rv ? 1 : 0;
        case "!=": return lv !== rv ? 1 : 0;
        case "<": return lv < rv ? 1 : 0;
        case ">": return lv > rv ? 1 : 0;
        case "<=": return lv <= rv ? 1 : 0;
        case ">=": return lv >= rv ? 1 : 0;
        case "&&": return (lv && rv) ? 1 : 0;
        case "||": return (lv || rv) ? 1 : 0;
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }

    case "unary": {
      const v = evaluate(node.operand, env);
      const nv = typeof v === "number" ? v : NaN;
      switch (node.op) {
        case "-": return -nv;
        case "!": return nv ? 0 : 1;
        default: throw new Error(`Unknown unary operator: ${node.op}`);
      }
    }

    case "call": {
      // Check user-defined functions first
      const userFn = env.userFunctions.get(node.name);
      if (userFn) {
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        for (let i = 0; i < userFn.params.length; i++) {
          childEnv.setVar(userFn.params[i], evaluate(node.args[i], env) as number);
        }
        return evaluate(userFn.body, childEnv);
      }

      // Built-in functions
      const fn = BUILTINS[node.name];
      if (fn) {
        const args = node.args.map(a => {
          const v = evaluate(a, env);
          return typeof v === "number" ? v : NaN;
        });
        return fn(...args);
      }

      // Vector/matrix creation
      if (node.name === "vector" || node.name === "vec") {
        return node.args.map(a => evaluate(a, env) as number);
      }
      if (node.name === "matrix" || node.name === "mat") {
        // Each arg is a vector
        return node.args.map(a => {
          const v = evaluate(a, env);
          return Array.isArray(v) ? v as number[] : [v as number];
        });
      }
      if (node.name === "zeros") {
        const n = evaluate(node.args[0], env) as number;
        const m = node.args[1] ? evaluate(node.args[1], env) as number : undefined;
        if (m !== undefined) {
          return Array.from({ length: n }, () => new Array(m).fill(0));
        }
        return new Array(n).fill(0);
      }
      if (node.name === "ones") {
        const n = evaluate(node.args[0], env) as number;
        const m = node.args[1] ? evaluate(node.args[1], env) as number : undefined;
        if (m !== undefined) {
          return Array.from({ length: n }, () => new Array(m).fill(1));
        }
        return new Array(n).fill(1);
      }
      if (node.name === "identity" || node.name === "eye") {
        const n = evaluate(node.args[0], env) as number;
        return Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
      }
      if (node.name === "len" || node.name === "length") {
        const v = evaluate(node.args[0], env);
        return Array.isArray(v) ? v.length : 1;
      }
      if (node.name === "sum" && node.args.length === 1) {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          return (v as number[]).reduce((a, b) => a + b, 0);
        }
        return typeof v === "number" ? v : NaN;
      }
      if (node.name === "det" && node.args.length === 1) {
        const m = evaluate(node.args[0], env);
        if (Array.isArray(m) && Array.isArray(m[0])) {
          return matDet(m as number[][]);
        }
        return NaN;
      }
      if (node.name === "transpose" || node.name === "trans") {
        const m = evaluate(node.args[0], env);
        if (Array.isArray(m) && Array.isArray(m[0])) {
          return matTranspose(m as number[][]);
        }
        return m;
      }

      throw new Error(`Unknown function: ${node.name}`);
    }

    case "index": {
      const target = evaluate(node.target, env);
      const idx = evaluate(node.indices[0], env) as number;
      if (Array.isArray(target)) {
        if (node.indices.length === 2) {
          // Matrix indexing M[i;j]
          const j = evaluate(node.indices[1], env) as number;
          const row = (target as number[][])[Math.round(idx)];
          return row ? row[Math.round(j)] : NaN;
        }
        return (target as number[])[Math.round(idx)] ?? NaN;
      }
      return NaN;
    }

    case "cellarray":
      return node.elements.map(e => evaluate(e, env) as number);

    case "vector":
      return node.elements.map(e => evaluate(e, env) as number);

    case "matrix":
      return node.rows.map(row => row.map(e => evaluate(e, env) as number));

    case "conditional": {
      const cond = evaluate(node.cond, env);
      return cond ? evaluate(node.ifTrue, env) : evaluate(node.ifFalse, env);
    }

    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

// ─── Matrix helpers ───────────────────────────────────────
function matDet(m: number[][]): number {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  let det = 0;
  for (let j = 0; j < n; j++) {
    const minor = m.slice(1).map(row => [...row.slice(0, j), ...row.slice(j + 1)]);
    det += (j % 2 === 0 ? 1 : -1) * m[0][j] * matDet(minor);
  }
  return det;
}

function matTranspose(m: number[][]): number[][] {
  const rows = m.length, cols = m[0].length;
  const result: number[][] = [];
  for (let j = 0; j < cols; j++) {
    result[j] = [];
    for (let i = 0; i < rows; i++) {
      result[j][i] = m[i][j];
    }
  }
  return result;
}

// ─── Convenience ──────────────────────────────────────────
export function evalString(expr: string, env: HekatanEnvironment): number | number[] | number[][] {
  const ast = parseExpression(expr);
  return evaluate(ast, env);
}

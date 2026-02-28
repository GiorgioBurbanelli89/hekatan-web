/**
 * Hekatan Evaluator — Numeric expression engine
 *
 * Tokenizer → Parser (recursive descent) → AST → Evaluate
 * Supports: variables, functions, units, cell arrays, vectors, matrices
 */

import { eigenSolver } from "./wasm/eigenSolver.js";

// ─── Cell Array type (vector of matrices/vectors/scalars) ─
export type HVal = number | number[] | number[][];
export interface CellArray {
  __cell: true;
  elements: HVal[];
}
export function isCellArray(v: any): v is CellArray {
  return v && typeof v === "object" && (v as any).__cell === true;
}

// ─── AST Node types ───────────────────────────────────────
export type ASTNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "binary"; op: string; left: ASTNode; right: ASTNode }
  | { type: "unary"; op: string; operand: ASTNode }
  | { type: "call"; name: string; args: ASTNode[] }
  | { type: "index"; target: ASTNode; indices: ASTNode[]; cellIndex?: boolean }
  | { type: "assign"; name: string; expr: ASTNode; indices?: ASTNode[] }
  | { type: "vector"; elements: ASTNode[] }
  | { type: "matrix"; rows: ASTNode[][] }
  | { type: "cellarray"; elements: ASTNode[] }
  | { type: "conditional"; cond: ASTNode; ifTrue: ASTNode; ifFalse: ASTNode }
  | { type: "range"; start: ASTNode; end: ASTNode };

// ─── Token types ──────────────────────────────────────────
interface Token {
  type: "number" | "ident" | "op" | "lparen" | "rparen" | "lbracket" | "rbracket"
    | "lbrace" | "rbrace" | "comma" | "semicolon" | "assign" | "pipe" | "colon" | "eof";
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
      case ":": tokens.push({ type: "colon", value: ch }); break;
      case "+": case "-": case "*": case "/": case "^": case "%":
      case "<": case ">": case "!": case "?":
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

      // indexed assignment: A[i] = expr  or  A[i:j] = expr
      if (this.peek().type === "lbracket") {
        this.advance();
        const indices: ASTNode[] = [this.parseIndexSlot()];
        while (this.peek().type === "semicolon" || this.peek().type === "comma") {
          this.advance();
          indices.push(this.parseIndexSlot());
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

  private parseExpr(): ASTNode {
    const node = this.parseOr();
    // Ternary: condition ? ifTrue : ifFalse
    if (this.peek().value === "?") {
      this.advance();
      const ifTrue = this.parseExpr();
      this.expect("colon");
      const ifFalse = this.parseExpr();
      return { type: "conditional", cond: node, ifTrue, ifFalse };
    }
    return node;
  }

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

  /** Parse a single index slot — may be `expr`, `expr:expr`, or just `:` */
  private parseIndexSlot(): ASTNode {
    const start = this.parseExpr();
    if (this.peek().type === "colon") {
      this.advance();
      const end = this.parseExpr();
      return { type: "range", start, end };
    }
    return start;
  }

  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();
    // Function calls, indexing [...] and cell indexing {...}
    while (true) {
      if (this.peek().type === "lbracket") {
        this.advance();
        const indices: ASTNode[] = [this.parseIndexSlot()];
        while (this.peek().type === "semicolon" || this.peek().type === "comma") {
          this.advance();
          indices.push(this.parseIndexSlot());
        }
        this.expect("rbracket");
        node = { type: "index", target: node, indices };
      } else if (this.peek().type === "lbrace" && node.type === "variable") {
        // Cell indexing: V{i} → access i-th element of cell array
        this.advance();
        const idx = this.parseExpr();
        this.expect("rbrace");
        node = { type: "index", target: node, indices: [idx], cellIndex: true } as any;
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

    // Bracket vector/matrix: [1, 2, 3] or [[1,2],[3,4]]
    if (t.type === "lbracket") {
      this.advance();
      // Empty: []
      if (this.peek().type === "rbracket") {
        this.advance();
        return { type: "vector", elements: [] };
      }
      // Check if first element starts with [ → matrix [[...],[...]]
      if (this.peek().type === "lbracket") {
        const rows: ASTNode[][] = [];
        while (this.peek().type === "lbracket") {
          this.advance(); // consume inner [
          const row: ASTNode[] = [];
          if (this.peek().type !== "rbracket") {
            row.push(this.parseExpr());
            while (this.peek().type === "comma") {
              this.advance();
              row.push(this.parseExpr());
            }
          }
          this.expect("rbracket"); // consume inner ]
          rows.push(row);
          if (this.peek().type === "comma") {
            this.advance(); // comma between rows
          }
        }
        this.expect("rbracket"); // consume outer ]
        return { type: "matrix", rows };
      }
      // Vector: [a, b, c] or [a; b; c]
      const elements: ASTNode[] = [];
      elements.push(this.parseExpr());
      let useSemicolon = false;
      while (this.peek().type === "comma" || this.peek().type === "semicolon") {
        if (this.peek().type === "semicolon") useSemicolon = true;
        this.advance();
        elements.push(this.parseExpr());
      }
      this.expect("rbracket");
      // If semicolons were used: [1; 2 | 3; 4] → matrix rows (Calcpad style)
      // For now treat as vector
      return { type: "vector", elements };
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
export type EnvVal = number | number[] | number[][] | CellArray;

export class HekatanEnvironment {
  variables: Map<string, EnvVal> = new Map();
  userFunctions: Map<string, { params: string[]; body: ASTNode }> = new Map();
  /** Multiline function bodies: name → lines (raw text) */
  multilineFunctions: Map<string, { params: string[]; lines: string[] }> = new Map();
  decimals = 4;

  reset(): void {
    this.variables.clear();
    this.userFunctions.clear();
    this.multilineFunctions.clear();
  }

  getVar(name: string): EnvVal | undefined {
    if (CONSTANTS[name] !== undefined) return CONSTANTS[name];
    return this.variables.get(name);
  }

  setVar(name: string, value: EnvVal): void {
    this.variables.set(name, value);
  }
}

// ─── Evaluate ─────────────────────────────────────────────
export function parseExpression(expr: string): ASTNode {
  const tokens = tokenize(expr);
  return new Parser(tokens).parse();
}

export function evaluate(node: ASTNode, env: HekatanEnvironment): EnvVal {
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
        // Indexed assignment: A[i] = val  or  A[i,j] = val  (1-based)
        const existing = env.getVar(node.name);
        const idx0 = evaluate(node.indices[0], env);
        if (typeof idx0 !== "number") throw new Error("Index must be a number");
        const i = Math.round(idx0) - 1; // 1-based → 0-based

        if (node.indices.length >= 2) {
          // 2D: A[i,j] = val
          const idx1 = evaluate(node.indices[1], env);
          if (typeof idx1 !== "number") throw new Error("Index must be a number");
          const j = Math.round(idx1) - 1; // 1-based → 0-based
          if (is2D(existing)) {
            const mat = existing as number[][];
            if (mat[i]) mat[i][j] = val as number;
            env.setVar(node.name, mat);
          } else {
            throw new Error(`Cannot index 2D into non-matrix: ${node.name}`);
          }
        } else {
          // 1D: A[i] = val
          if (Array.isArray(existing) && !is2D(existing)) {
            (existing as number[])[i] = val as number;
            env.setVar(node.name, existing);
          } else if (is2D(existing)) {
            // M[i] = row vector — set entire row
            const mat = existing as number[][];
            if (Array.isArray(val) && !is2D(val)) {
              mat[i] = val as number[];
            } else {
              mat[i] = [val as number];
            }
            env.setVar(node.name, mat);
          } else {
            const arr: number[] = [];
            arr[i] = val as number;
            env.setVar(node.name, arr);
          }
        }
      } else {
        env.setVar(node.name, val);
      }
      return val;
    }

    case "binary": {
      const l = evaluate(node.left, env);
      const r = evaluate(node.right, env);
      const l2 = is2D(l), r2 = is2D(r);
      const l1 = Array.isArray(l) && !l2, r1 = Array.isArray(r) && !r2;
      const lScalar = typeof l === "number", rScalar = typeof r === "number";

      // Matrix/vector arithmetic
      if (node.op === "*") {
        if (l2 && r2) return matMul(toMat(l), toMat(r));
        if (l2 && r1) {
          // Matrix * 1D vector → treat vector as Nx1 matrix, return 1D
          const mv = (r as number[]).map(v => [v]);
          const res = matMul(toMat(l), mv);
          return res.map(row => row[0]);
        }
        if (l2 && rScalar) return matScale(toMat(l), r as number);
        if (lScalar && r2) return matScale(toMat(r), l as number);
        if (lScalar && r1) return (r as number[]).map(v => (l as number) * v);
        if (l1 && rScalar) return (l as number[]).map(v => v * (r as number));
      }
      if (node.op === "+" || node.op === "-") {
        const sign = node.op === "+" ? 1 : -1;
        if (l2 && r2) return matAdd(toMat(l), toMat(r), sign);
        if (l1 && r1) return (l as number[]).map((v, i) => v + sign * ((r as number[])[i] ?? 0));
        if (l2 && rScalar) return toMat(l).map(row => row.map(v => v + sign * (r as number)));
        if (lScalar && r2) return toMat(r).map(row => row.map(v => (l as number) + sign * v));
      }

      // Scalar fallback
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
          const mat = m as number[][];
          if (mat.length >= 50 && eigenSolver.ready) {
            const d = eigenSolver.detSync(mat);
            if (d !== null) return d;
          }
          return matDet(mat);
        }
        return NaN;
      }
      if (node.name === "transpose" || node.name === "trans") {
        const m = evaluate(node.args[0], env);
        if (Array.isArray(m) && Array.isArray(m[0])) {
          return matTranspose(m as number[][]);
        }
        // transpose a 1D vector → row vector (1×N matrix)
        if (Array.isArray(m)) return [(m as number[]).slice()];
        return m;
      }
      if (node.name === "col") {
        // col(a,b,c) → column vector as Nx1 matrix [[a],[b],[c]]
        return node.args.map(a => {
          const v = evaluate(a, env);
          return [typeof v === "number" ? v : NaN];
        });
      }
      if (node.name === "row") {
        return [node.args.map(a => {
          const v = evaluate(a, env);
          return typeof v === "number" ? v : NaN;
        })];
      }
      if (node.name === "inv" || node.name === "inverse") {
        const m = evaluate(node.args[0], env);
        if (is2D(m)) {
          const mat = toMat(m);
          // Large matrices: use Eigen WASM
          if (mat.length >= 50 && eigenSolver.ready) {
            const result = eigenSolver.inverseSync(mat);
            if (result) return result;
          }
          return matInverse(mat);
        }
        return NaN;
      }
      if (node.name === "lusolve" || node.name === "solve") {
        const A = evaluate(node.args[0], env);
        const b = evaluate(node.args[1], env);
        if (is2D(A) && Array.isArray(b)) {
          const mat = toMat(A);
          const bVec = is2D(b) ? (b as number[][]).map(r => r[0]) : b as number[];
          // Large matrices: use Eigen WASM (SparseLU) if loaded
          if (mat.length >= 50 && eigenSolver.ready) {
            const { rows, cols, vals } = eigenSolver.denseToSparse(mat);
            const x = eigenSolver.sparseSolveSync(mat.length, rows, cols, vals, bVec);
            if (x) return x.map(v => [v]);
          }
          // Fallback: JS Gaussian elimination
          const x = gaussianSolve(mat, bVec);
          return x.map(v => [v]);
        }
        return NaN;
      }

      // ─── Numerical Derivative (central difference) ────────
      // nderiv(f, x)     — f'(x)   first derivative
      // nderiv(f, x, 2)  — f''(x)  second derivative
      if (node.name === "nderiv" || node.name === "deriv" || node.name === "diff") {
        if (node.args.length < 2) throw new Error("nderiv(f, x) requires 2 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("nderiv: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 1) throw new Error(`nderiv: '${fnName}' is not a function`);
        const x = evaluate(node.args[1], env) as number;
        const order = node.args[2] ? Math.round(evaluate(node.args[2], env) as number) : 1;
        const h = 1e-6;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => {
          childEnv.setVar(fn.params[0], xv);
          return evaluate(fn.body, childEnv) as number;
        };
        if (order === 1) {
          // Central difference: f'(x) ≈ (f(x+h) - f(x-h)) / 2h
          return (evalF(x + h) - evalF(x - h)) / (2 * h);
        } else if (order === 2) {
          // Second derivative: f''(x) ≈ (f(x+h) - 2f(x) + f(x-h)) / h²
          return (evalF(x + h) - 2 * evalF(x) + evalF(x - h)) / (h * h);
        } else {
          // Higher order via recursive central diff
          const h2 = Math.pow(1e-3, 1 / order);
          let coeffs = [1];
          for (let o = 0; o < order; o++) {
            const next = [coeffs[0]];
            for (let i = 1; i < coeffs.length; i++) next.push(coeffs[i] - coeffs[i - 1]);
            next.push(-coeffs[coeffs.length - 1]);
            coeffs = next;
          }
          let result = 0;
          for (let i = 0; i < coeffs.length; i++) {
            result += coeffs[i] * evalF(x + (order / 2 - i) * h2);
          }
          return result / Math.pow(h2, order);
        }
      }

      // ─── Numerical Summation ───────────────────────────────
      // summation(f, a, b)  — Σ_{i=a}^{b} f(i)
      if (node.name === "summation" || node.name === "nsum") {
        if (node.args.length < 3) throw new Error("summation(f, a, b) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("summation: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 1) throw new Error(`summation: '${fnName}' is not a function`);
        const a = Math.round(evaluate(node.args[1], env) as number);
        const b = Math.round(evaluate(node.args[2], env) as number);
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        let sum = 0;
        for (let i = a; i <= b; i++) {
          childEnv.setVar(fn.params[0], i);
          sum += evaluate(fn.body, childEnv) as number;
        }
        return sum;
      }

      // ─── Numerical Product ─────────────────────────────────
      // nproduct(f, a, b)  — Π_{i=a}^{b} f(i)
      if (node.name === "nproduct" || node.name === "nprod") {
        if (node.args.length < 3) throw new Error("nproduct(f, a, b) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("nproduct: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 1) throw new Error(`nproduct: '${fnName}' is not a function`);
        const a = Math.round(evaluate(node.args[1], env) as number);
        const b = Math.round(evaluate(node.args[2], env) as number);
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        let prod = 1;
        for (let i = a; i <= b; i++) {
          childEnv.setVar(fn.params[0], i);
          prod *= evaluate(fn.body, childEnv) as number;
        }
        return prod;
      }

      // ─── ODE Solver (Runge-Kutta 4th order) ────────────────
      // odesolve(f, y0, t0, tf)        — solve y' = f(t,y) from t0 to tf
      // odesolve(f, y0, t0, tf, steps) — with N steps (default: 1000)
      // Returns y(tf)
      if (node.name === "odesolve" || node.name === "rk4") {
        if (node.args.length < 4) throw new Error("odesolve(f, y0, t0, tf) requires 4 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("odesolve: first arg must be a function name f(t,y)");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 2) throw new Error(`odesolve: '${fnName}' must be f(t,y)`);
        let y = evaluate(node.args[1], env) as number;
        const t0 = evaluate(node.args[2], env) as number;
        const tf = evaluate(node.args[3], env) as number;
        const steps = node.args[4] ? Math.round(evaluate(node.args[4], env) as number) : 1000;
        const h = (tf - t0) / steps;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (t: number, yv: number) => {
          childEnv.setVar(fn.params[0], t);
          childEnv.setVar(fn.params[1], yv);
          return evaluate(fn.body, childEnv) as number;
        };
        let t = t0;
        for (let i = 0; i < steps; i++) {
          const k1 = evalF(t, y);
          const k2 = evalF(t + h / 2, y + h * k1 / 2);
          const k3 = evalF(t + h / 2, y + h * k2 / 2);
          const k4 = evalF(t + h, y + h * k3);
          y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
          t += h;
        }
        return y;
      }

      // ─── Numerical Root Finding (Newton-Raphson) ──────────
      // nsolve(f, x0)       — find x where f(x) = 0, starting from x0
      // nsolve(f, x0, tol)  — with tolerance (default: 1e-12)
      if (node.name === "nsolve") {
        if (node.args.length < 2) throw new Error("nsolve(f, x0) requires 2 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("nsolve: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 1) throw new Error(`nsolve: '${fnName}' is not a function`);
        let x = evaluate(node.args[1], env) as number;
        const tol = node.args[2] ? (evaluate(node.args[2], env) as number) : 1e-12;
        const h = 1e-8;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => {
          childEnv.setVar(fn.params[0], xv);
          return evaluate(fn.body, childEnv) as number;
        };
        for (let iter = 0; iter < 200; iter++) {
          const fx = evalF(x);
          if (Math.abs(fx) < tol) return x;
          const fp = (evalF(x + h) - evalF(x - h)) / (2 * h);
          if (Math.abs(fp) < 1e-15) break;
          x -= fx / fp;
        }
        return x;
      }

      // ─── Numerical Integration (Gauss-Legendre) ───────────
      // integral(f, a, b)       — single integral ∫_a^b f(x) dx
      // integral2(f, a, b, c, d) — double integral ∫∫ f(x,y) dx dy
      // integral3(f, a, b, c, d, e, f) — triple integral ∫∫∫ f(x,y,z) dx dy dz
      // f must be a user-defined function name
      if (node.name === "integral" || node.name === "integrate") {
        // integral(f, a, b)  or  integral(f, a, b, n)
        if (node.args.length < 3) throw new Error("integral(f, a, b) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("integral: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 1) throw new Error(`integral: '${fnName}' is not a function of 1 variable`);
        const a = evaluate(node.args[1], env) as number;
        const b = evaluate(node.args[2], env) as number;
        const nPts = node.args[3] ? Math.round(evaluate(node.args[3], env) as number) : 10;
        const { pts, wts } = gaussLegendre(nPts);
        // Transform [-1,1] → [a,b]: x = (b-a)/2 * t + (a+b)/2
        const hf = (b - a) / 2;
        const mid = (a + b) / 2;
        let sum = 0;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        for (let k = 0; k < pts.length; k++) {
          const x = hf * pts[k] + mid;
          childEnv.setVar(fn.params[0], x);
          const fv = evaluate(fn.body, childEnv);
          sum += wts[k] * (typeof fv === "number" ? fv : NaN);
        }
        return hf * sum;
      }

      if (node.name === "integral2" || node.name === "integrate2" || node.name === "dblintegral") {
        // integral2(f, xa, xb, ya, yb)  or  integral2(f, xa, xb, ya, yb, n)
        if (node.args.length < 5) throw new Error("integral2(f, xa, xb, ya, yb) requires 5 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("integral2: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 2) throw new Error(`integral2: '${fnName}' is not a function of 2 variables`);
        const xa = evaluate(node.args[1], env) as number;
        const xb = evaluate(node.args[2], env) as number;
        const ya = evaluate(node.args[3], env) as number;
        const yb = evaluate(node.args[4], env) as number;
        const nPts = node.args[5] ? Math.round(evaluate(node.args[5], env) as number) : 7;
        const { pts, wts } = gaussLegendre(nPts);
        const hx = (xb - xa) / 2, mx = (xa + xb) / 2;
        const hy = (yb - ya) / 2, my = (ya + yb) / 2;
        let sum = 0;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        for (let i = 0; i < pts.length; i++) {
          const x = hx * pts[i] + mx;
          childEnv.setVar(fn.params[0], x);
          for (let j = 0; j < pts.length; j++) {
            const y = hy * pts[j] + my;
            childEnv.setVar(fn.params[1], y);
            const fv = evaluate(fn.body, childEnv);
            sum += wts[i] * wts[j] * (typeof fv === "number" ? fv : NaN);
          }
        }
        return hx * hy * sum;
      }

      if (node.name === "integral3" || node.name === "integrate3" || node.name === "tplintegral") {
        // integral3(f, xa, xb, ya, yb, za, zb)  or  integral3(f, xa, xb, ya, yb, za, zb, n)
        if (node.args.length < 7) throw new Error("integral3(f, xa, xb, ya, yb, za, zb) requires 7 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("integral3: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 3) throw new Error(`integral3: '${fnName}' is not a function of 3 variables`);
        const xa = evaluate(node.args[1], env) as number;
        const xb = evaluate(node.args[2], env) as number;
        const ya = evaluate(node.args[3], env) as number;
        const yb = evaluate(node.args[4], env) as number;
        const za = evaluate(node.args[5], env) as number;
        const zb = evaluate(node.args[6], env) as number;
        const nPts = node.args[7] ? Math.round(evaluate(node.args[7], env) as number) : 5;
        const { pts, wts } = gaussLegendre(nPts);
        const hx = (xb - xa) / 2, mx = (xa + xb) / 2;
        const hy = (yb - ya) / 2, my = (ya + yb) / 2;
        const hz = (zb - za) / 2, mz = (za + zb) / 2;
        let sum = 0;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        for (let i = 0; i < pts.length; i++) {
          const x = hx * pts[i] + mx;
          childEnv.setVar(fn.params[0], x);
          for (let j = 0; j < pts.length; j++) {
            const y = hy * pts[j] + my;
            childEnv.setVar(fn.params[1], y);
            for (let k = 0; k < pts.length; k++) {
              const z = hz * pts[k] + mz;
              childEnv.setVar(fn.params[2], z);
              const fv = evaluate(fn.body, childEnv);
              sum += wts[i] * wts[j] * wts[k] * (typeof fv === "number" ? fv : NaN);
            }
          }
        }
        return hx * hy * hz * sum;
      }

      throw new Error(`Unknown function: ${node.name}`);
    }

    case "index": {
      const target = evaluate(node.target, env);

      // Cell array indexing: V{i}
      if (isCellArray(target)) {
        const idx = Math.round(evaluate(node.indices[0], env) as number) - 1; // 1-based
        return target.elements[idx] ?? NaN;
      }

      if (!Array.isArray(target)) return NaN;

      // Helper: resolve an index node to number or [start,end] range (1-based → 0-based)
      const resolveIdx = (n: ASTNode): number | [number, number] => {
        if (n.type === "range") {
          const s = evaluate(n.start, env) as number;
          const e = evaluate(n.end, env) as number;
          return [Math.round(s) - 1, Math.round(e) - 1]; // 1-based → 0-based
        }
        return Math.round(evaluate(n, env) as number) - 1; // 1-based → 0-based
      };

      if (is2D(target)) {
        const mat = target as number[][];
        if (node.indices.length === 2) {
          const rowIdx = resolveIdx(node.indices[0]);
          const colIdx = resolveIdx(node.indices[1]);
          // Range × Range → sub-matrix
          if (Array.isArray(rowIdx) && Array.isArray(colIdx)) {
            const [r0, r1] = rowIdx, [c0, c1] = colIdx;
            const sub: number[][] = [];
            for (let i = r0; i <= r1; i++) {
              const row: number[] = [];
              for (let j = c0; j <= c1; j++) row.push(mat[i]?.[j] ?? NaN);
              sub.push(row);
            }
            return sub;
          }
          // Range × scalar → sub-rows, single col
          if (Array.isArray(rowIdx) && typeof colIdx === "number") {
            const [r0, r1] = rowIdx;
            return mat.slice(r0, r1 + 1).map(row => row[colIdx] ?? NaN);
          }
          // Scalar × Range → single row, sub-cols
          if (typeof rowIdx === "number" && Array.isArray(colIdx)) {
            const [c0, c1] = colIdx;
            return mat[rowIdx]?.slice(c0, c1 + 1) ?? [];
          }
          // Scalar × Scalar → single element
          return mat[rowIdx as number]?.[colIdx as number] ?? NaN;
        }
        // Single index on matrix: row extraction
        const idx = resolveIdx(node.indices[0]);
        if (Array.isArray(idx)) {
          return mat.slice(idx[0], idx[1] + 1);
        }
        return mat[idx as number] ?? [];
      }

      // 1D vector indexing
      const vec = target as number[];
      const idx = resolveIdx(node.indices[0]);
      if (Array.isArray(idx)) {
        return vec.slice(idx[0], idx[1] + 1);
      }
      return vec[idx as number] ?? NaN;
    }

    case "cellarray": {
      const elems: HVal[] = node.elements.map(e => {
        const v = evaluate(e, env);
        if (isCellArray(v)) throw new Error("Nested cell arrays not supported");
        return v as HVal;
      });
      return { __cell: true, elements: elems } as CellArray;
    }

    case "vector":
      return node.elements.map(e => evaluate(e, env) as number);

    case "matrix":
      return node.rows.map(row => row.map(e => evaluate(e, env) as number));

    case "range":
      // ranges are handled inside "index" — if evaluated standalone, return start
      return evaluate(node.start, env);

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

function is2D(v: unknown): v is number[][] {
  return Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
}

function toMat(v: unknown): number[][] {
  if (is2D(v)) return v as number[][];
  if (Array.isArray(v)) return (v as number[]).map(x => [x]); // column vector
  return [[v as number]];
}

function matMul(a: number[][], b: number[][]): number[][] {
  const m = a.length, n = b[0].length, p = b.length;
  const result: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < p; k++)
        result[i][j] += a[i][k] * b[k][j];
  return result;
}

function matMulVec(a: number[][], v: number[]): number[] {
  return a.map(row => row.reduce((s, val, j) => s + val * (v[j] ?? 0), 0));
}

function matAdd(a: number[][], b: number[][], sign = 1): number[][] {
  return a.map((row, i) => row.map((v, j) => v + sign * (b[i]?.[j] ?? 0)));
}

function matScale(m: number[][], s: number): number[][] {
  return m.map(row => row.map(v => v * s));
}

function matInverse(m: number[][]): number[][] {
  const n = m.length;
  // Augmented matrix [A | I]
  const aug = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) throw new Error("Singular matrix");
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

function gaussianSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-14) throw new Error("Singular system");
    for (let j = col; j <= n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row[n]);
}

// ─── Gauss-Legendre quadrature points & weights on [-1,1] ─
function gaussLegendre(n: number): { pts: number[]; wts: number[] } {
  // Precomputed tables for common orders (high precision)
  const tables: Record<number, { pts: number[]; wts: number[] }> = {
    1: { pts: [0], wts: [2] },
    2: { pts: [-0.5773502691896257, 0.5773502691896257],
         wts: [1, 1] },
    3: { pts: [-0.7745966692414834, 0, 0.7745966692414834],
         wts: [0.5555555555555556, 0.8888888888888888, 0.5555555555555556] },
    4: { pts: [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526],
         wts: [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538] },
    5: { pts: [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640],
         wts: [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891] },
    7: { pts: [-0.9491079123427585, -0.7415311855993945, -0.4058451513773972, 0,
               0.4058451513773972, 0.7415311855993945, 0.9491079123427585],
         wts: [0.1294849661688697, 0.2797053914892767, 0.3818300505051189, 0.4179591836734694,
               0.3818300505051189, 0.2797053914892767, 0.1294849661688697] },
    10: { pts: [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472,
                -0.1488743389816312, 0.1488743389816312, 0.4333953941292472, 0.6794095682990244,
                0.8650633666889845, 0.9739065285171717],
          wts: [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963,
                0.2955242247147529, 0.2955242247147529, 0.2692667193099963, 0.2190863625159820,
                0.1494513491505806, 0.0666713443086881] },
  };

  if (tables[n]) return tables[n];

  // For non-tabulated n, compute via Newton iteration on Legendre polynomials
  const pts: number[] = new Array(n);
  const wts: number[] = new Array(n);
  const m = Math.floor((n + 1) / 2);
  for (let i = 0; i < m; i++) {
    // Initial guess (Chebyshev approximation)
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    let p0: number, p1: number, pp: number;
    // Newton iteration
    for (let iter = 0; iter < 100; iter++) {
      p0 = 1; p1 = x;
      for (let j = 2; j <= n; j++) {
        const p2 = ((2 * j - 1) * x * p1 - (j - 1) * p0) / j;
        p0 = p1; p1 = p2;
      }
      pp = n * (x * p1 - p0) / (x * x - 1);
      const dx = p1 / pp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    pts[i] = -x;
    pts[n - 1 - i] = x;
    wts[i] = wts[n - 1 - i] = 2 / ((1 - x * x) * pp * pp);
  }
  return { pts, wts };
}

// ─── Convenience ──────────────────────────────────────────
export function evalString(expr: string, env: HekatanEnvironment): number | number[] | number[][] {
  const ast = parseExpression(expr);
  return evaluate(ast, env);
}

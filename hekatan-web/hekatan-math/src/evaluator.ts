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
      // MATLAB ~= (not equal) → normalize to !=
      if (two === "~=") {
        tokens.push({ type: "op", value: "!=" }); i += 2; continue;
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
      // Vector [a, b, c] or MATLAB-style matrix [a, b; c, d]
      // Parse first row: elements separated by commas
      const firstRow: ASTNode[] = [];
      firstRow.push(this.parseExpr());
      while (this.peek().type === "comma") {
        this.advance();
        firstRow.push(this.parseExpr());
      }
      // Semicolons → additional rows (MATLAB-style matrix)
      if (this.peek().type === "semicolon") {
        const rows: ASTNode[][] = [firstRow];
        while (this.peek().type === "semicolon") {
          this.advance(); // consume ;
          const row: ASTNode[] = [];
          row.push(this.parseExpr());
          while (this.peek().type === "comma") {
            this.advance();
            row.push(this.parseExpr());
          }
          rows.push(row);
        }
        this.expect("rbracket");
        // Semicolons always produce a matrix (column vector if single-col)
        return { type: "matrix", rows };
      }
      this.expect("rbracket");
      return { type: "vector", elements: firstRow };
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

export interface MultilineFunction {
  params: string[];       // input parameter names
  outputs: string[];      // output variable names (from [a,b]=func(...))
  lines: string[];        // body lines (raw text)
}

export class HekatanEnvironment {
  variables: Map<string, EnvVal> = new Map();
  userFunctions: Map<string, { params: string[]; body: ASTNode }> = new Map();
  /** Multiline function bodies: name → { params, outputs, lines } */
  multilineFunctions: Map<string, MultilineFunction> = new Map();
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
      // Check user-defined functions first (single-line)
      const userFn = env.userFunctions.get(node.name);
      if (userFn) {
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        childEnv.multilineFunctions = env.multilineFunctions;
        for (let i = 0; i < userFn.params.length; i++) {
          childEnv.setVar(userFn.params[i], evaluate(node.args[i], env) as number);
        }
        return evaluate(userFn.body, childEnv);
      }

      // Check multiline functions (MATLAB-style function...end)
      const mlFn = env.multilineFunctions.get(node.name);
      if (mlFn) {
        const evalArgs = node.args.map(a => evaluate(a, env));
        return executeMultilineFunction(mlFn, evalArgs, env);
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
      // range(start, end[, step]) → column vector [[start],[start+step],...,[end]]
      if (node.name === "range" || node.name === "seq") {
        const a0 = evaluate(node.args[0], env);
        const a1 = evaluate(node.args[1], env);
        const a2 = node.args[2] != null ? evaluate(node.args[2], env) : undefined;
        if (typeof a0 === "number" && typeof a1 === "number") {
          const step = typeof a2 === "number" ? a2 : (a1 >= a0 ? 1 : -1);
          if (step === 0) return [[a0]];
          const arr: number[][] = [];
          if (step > 0) { for (let i = a0; i <= a1 + 1e-12; i += step) arr.push([i]); }
          else          { for (let i = a0; i >= a1 - 1e-12; i += step) arr.push([i]); }
          return arr; // Nx1 matrix (column vector)
        }
        return NaN;
      }
      // linspace(start, end, n) → column vector of n evenly spaced values
      if (node.name === "linspace") {
        const a0 = evaluate(node.args[0], env);
        const a1 = evaluate(node.args[1], env);
        const a2 = evaluate(node.args[2], env);
        if (typeof a0 === "number" && typeof a1 === "number" && typeof a2 === "number" && a2 >= 1) {
          const n = Math.round(a2);
          if (n === 1) return [[a0]];
          const arr: number[][] = [];
          for (let i = 0; i < n; i++) arr.push([a0 + (a1 - a0) * i / (n - 1)]);
          return arr; // Nx1 matrix
        }
        return NaN;
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

      // ─── Additional Root Finding ────────────────────────────
      // bisect(f, a, b)       — bisection method (f(a) and f(b) must have opposite signs)
      // bisect(f, a, b, tol)  — with tolerance (default: 1e-12)
      if (node.name === "bisect") {
        if (node.args.length < 3) throw new Error("bisect(f, a, b) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("bisect: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`bisect: '${fnName}' is not a function`);
        let a = evaluate(node.args[1], env) as number;
        let b = evaluate(node.args[2], env) as number;
        const tol = node.args[3] ? (evaluate(node.args[3], env) as number) : 1e-12;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        let fa = evalF(a), fb = evalF(b);
        if (fa * fb > 0) throw new Error("bisect: f(a) and f(b) must have opposite signs");
        for (let i = 0; i < 200; i++) {
          const c = (a + b) / 2, fc = evalF(c);
          if (Math.abs(fc) < tol || (b - a) / 2 < tol) return c;
          if (fa * fc < 0) { b = c; fb = fc; } else { a = c; fa = fc; }
        }
        return (a + b) / 2;
      }

      // secant(f, x0, x1) — secant method
      if (node.name === "secant") {
        if (node.args.length < 3) throw new Error("secant(f, x0, x1) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("secant: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`secant: '${fnName}' is not a function`);
        let x0 = evaluate(node.args[1], env) as number;
        let x1 = evaluate(node.args[2], env) as number;
        const tol = node.args[3] ? (evaluate(node.args[3], env) as number) : 1e-12;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        let f0 = evalF(x0), f1 = evalF(x1);
        for (let i = 0; i < 200; i++) {
          if (Math.abs(f1) < tol) return x1;
          const denom = f1 - f0;
          if (Math.abs(denom) < 1e-15) break;
          const x2 = x1 - f1 * (x1 - x0) / denom;
          x0 = x1; f0 = f1; x1 = x2; f1 = evalF(x2);
        }
        return x1;
      }

      // ─── Numerical Limit (Richardson extrapolation) ─────────
      // nlimit(f, a)  — lim_{x→a} f(x)
      if (node.name === "nlimit" || node.name === "lim") {
        if (node.args.length < 2) throw new Error("nlimit(f, a) requires 2 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("nlimit: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`nlimit: '${fnName}' is not a function`);
        const a = evaluate(node.args[1], env) as number;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        // Richardson extrapolation: approach from both sides
        const hs = [0.1, 0.01, 0.001, 0.0001, 0.00001];
        let bestL = NaN, bestR = NaN;
        for (const h of hs) {
          const l = evalF(a - h), r = evalF(a + h);
          if (isFinite(l)) bestL = l;
          if (isFinite(r)) bestR = r;
        }
        if (isFinite(bestL) && isFinite(bestR)) return (bestL + bestR) / 2;
        if (isFinite(bestR)) return bestR;
        if (isFinite(bestL)) return bestL;
        return NaN;
      }

      // ─── Taylor Series Coefficients ─────────────────────────
      // taylor(f, x0, n) → returns vector [f(x0), f'(x0)/1!, f''(x0)/2!, ...]
      if (node.name === "taylor") {
        if (node.args.length < 3) throw new Error("taylor(f, x0, n) requires 3 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("taylor: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`taylor: '${fnName}' is not a function`);
        const x0 = evaluate(node.args[1], env) as number;
        const n = Math.round(evaluate(node.args[2], env) as number);
        const h = 1e-4;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        // Compute n+1 function values around x0
        const coeffs: number[] = [];
        // Use finite differences for each derivative order
        let fact = 1;
        for (let k = 0; k <= n; k++) {
          if (k > 1) fact *= k;
          // k-th derivative via central differences with step h
          let dk = 0;
          for (let j = 0; j <= k; j++) {
            const sign = j % 2 === 0 ? 1 : -1;
            const binom = BUILTINS.comb(k, j);
            dk += sign * binom * evalF(x0 + (k / 2 - j) * h);
          }
          dk /= Math.pow(h, k);
          coeffs.push(dk / fact);
        }
        return coeffs;
      }

      // ─── Alternative Integration Methods ────────────────────
      // trapezoid(f, a, b, n) — trapezoidal rule with n intervals
      if (node.name === "trapezoid" || node.name === "trap") {
        if (node.args.length < 4) throw new Error("trapezoid(f, a, b, n) requires 4 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("trapezoid: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`trapezoid: '${fnName}' is not a function`);
        const a = evaluate(node.args[1], env) as number;
        const b = evaluate(node.args[2], env) as number;
        const n = Math.round(evaluate(node.args[3], env) as number);
        const h = (b - a) / n;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        let sum = (evalF(a) + evalF(b)) / 2;
        for (let i = 1; i < n; i++) sum += evalF(a + i * h);
        return h * sum;
      }

      // simpson(f, a, b, n) — Simpson's 1/3 rule with n intervals (n must be even)
      if (node.name === "simpson") {
        if (node.args.length < 4) throw new Error("simpson(f, a, b, n) requires 4 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("simpson: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`simpson: '${fnName}' is not a function`);
        const a = evaluate(node.args[1], env) as number;
        const b = evaluate(node.args[2], env) as number;
        let n = Math.round(evaluate(node.args[3], env) as number);
        if (n % 2 !== 0) n++;
        const h = (b - a) / n;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        const evalF = (xv: number) => { childEnv.setVar(fn.params[0], xv); return evaluate(fn.body, childEnv) as number; };
        let sum = evalF(a) + evalF(b);
        for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * evalF(a + i * h);
        return (h / 3) * sum;
      }

      // ─── Interpolation ─────────────────────────────────────
      // interp(xdata, ydata, x) — Lagrange polynomial interpolation
      if (node.name === "interp" || node.name === "lagrange") {
        if (node.args.length < 3) throw new Error("interp(xdata, ydata, x) requires 3 args");
        const xdata = evaluate(node.args[0], env);
        const ydata = evaluate(node.args[1], env);
        const x = evaluate(node.args[2], env) as number;
        if (!Array.isArray(xdata) || !Array.isArray(ydata)) throw new Error("interp: xdata and ydata must be vectors");
        const xd = xdata as number[], yd = ydata as number[];
        const n = xd.length;
        let result = 0;
        for (let i = 0; i < n; i++) {
          let li = 1;
          for (let j = 0; j < n; j++) if (i !== j) li *= (x - xd[j]) / (xd[i] - xd[j]);
          result += yd[i] * li;
        }
        return result;
      }

      // ─── Linear Regression ──────────────────────────────────
      // linreg(xdata, ydata) → [slope, intercept, R²]
      if (node.name === "linreg" || node.name === "linfit") {
        if (node.args.length < 2) throw new Error("linreg(xdata, ydata) requires 2 args");
        const xdata = evaluate(node.args[0], env) as number[];
        const ydata = evaluate(node.args[1], env) as number[];
        if (!Array.isArray(xdata) || !Array.isArray(ydata)) throw new Error("linreg: xdata and ydata must be vectors");
        const n = xdata.length;
        let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        for (let i = 0; i < n; i++) {
          sx += xdata[i]; sy += ydata[i];
          sxx += xdata[i] * xdata[i]; sxy += xdata[i] * ydata[i];
          syy += ydata[i] * ydata[i];
        }
        const denom = n * sxx - sx * sx;
        const m = (n * sxy - sx * sy) / denom;
        const b = (sy - m * sx) / n;
        const ssRes = ydata.reduce((s, yi, i) => s + (yi - m * xdata[i] - b) ** 2, 0);
        const ssTot = ydata.reduce((s, yi) => s + (yi - sy / n) ** 2, 0);
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
        return [m, b, r2];
      }

      // ─── Euler Method (simple ODE) ──────────────────────────
      // euler(f, y0, t0, tf, steps) — Euler method ODE solver
      if (node.name === "euler") {
        if (node.args.length < 5) throw new Error("euler(f, y0, t0, tf, steps) requires 5 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("euler: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn || fn.params.length < 2) throw new Error(`euler: '${fnName}' must be f(t,y)`);
        let y = evaluate(node.args[1], env) as number;
        const t0 = evaluate(node.args[2], env) as number;
        const tf = evaluate(node.args[3], env) as number;
        const steps = Math.round(evaluate(node.args[4], env) as number);
        const h = (tf - t0) / steps;
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        let t = t0;
        for (let i = 0; i < steps; i++) {
          childEnv.setVar(fn.params[0], t);
          childEnv.setVar(fn.params[1], y);
          y += h * (evaluate(fn.body, childEnv) as number);
          t += h;
        }
        return y;
      }

      // ─── Number Theory ─────────────────────────────────────
      // gcd(a, b) — greatest common divisor
      if (node.name === "gcd") {
        let a = Math.abs(Math.round(evaluate(node.args[0], env) as number));
        let b = Math.abs(Math.round(evaluate(node.args[1], env) as number));
        while (b) { [a, b] = [b, a % b]; }
        return a;
      }
      // lcm(a, b) — least common multiple
      if (node.name === "lcm") {
        let a = Math.abs(Math.round(evaluate(node.args[0], env) as number));
        let b = Math.abs(Math.round(evaluate(node.args[1], env) as number));
        let g = a, h = b;
        while (h) { [g, h] = [h, g % h]; }
        return (a / g) * b;
      }
      // fibonacci(n) — n-th Fibonacci number
      if (node.name === "fibonacci" || node.name === "fib") {
        const n = Math.round(evaluate(node.args[0], env) as number);
        if (n <= 0) return 0;
        if (n <= 2) return 1;
        let a = 0, b = 1;
        for (let i = 2; i <= n; i++) { [a, b] = [b, a + b]; }
        return b;
      }
      // isprime(n) — primality test
      if (node.name === "isprime") {
        const n = Math.round(evaluate(node.args[0], env) as number);
        if (n < 2) return 0;
        if (n < 4) return 1;
        if (n % 2 === 0 || n % 3 === 0) return 0;
        for (let i = 5; i * i <= n; i += 6) {
          if (n % i === 0 || n % (i + 2) === 0) return 0;
        }
        return 1;
      }

      // ─── Sequences & Series ─────────────────────────────────
      // arithsum(a, d, n) — sum of arithmetic series: n/2 * (2a + (n-1)*d)
      if (node.name === "arithsum") {
        const a = evaluate(node.args[0], env) as number;
        const d = evaluate(node.args[1], env) as number;
        const n = evaluate(node.args[2], env) as number;
        return (n / 2) * (2 * a + (n - 1) * d);
      }
      // geomsum(a, r, n) — sum of geometric series: a * (1 - r^n) / (1 - r)
      if (node.name === "geomsum") {
        const a = evaluate(node.args[0], env) as number;
        const r = evaluate(node.args[1], env) as number;
        const n = evaluate(node.args[2], env) as number;
        if (Math.abs(r - 1) < 1e-15) return a * n;
        return a * (1 - Math.pow(r, n)) / (1 - r);
      }
      // geominf(a, r) — infinite geometric series: a / (1 - r)  (|r| < 1)
      if (node.name === "geominf") {
        const a = evaluate(node.args[0], env) as number;
        const r = evaluate(node.args[1], env) as number;
        if (Math.abs(r) >= 1) return NaN;
        return a / (1 - r);
      }

      // ─── Statistical Functions ──────────────────────────────
      // mean(v) — arithmetic mean
      if (node.name === "mean" || node.name === "avg" || node.name === "average") {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          const arr = v as number[];
          return arr.reduce((s, x) => s + x, 0) / arr.length;
        }
        return NaN;
      }
      // median(v)
      if (node.name === "median") {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          const sorted = [...(v as number[])].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return NaN;
      }
      // stdev(v) — sample standard deviation
      if (node.name === "stdev" || node.name === "std") {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          const arr = v as number[];
          const m = arr.reduce((s, x) => s + x, 0) / arr.length;
          const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
          return Math.sqrt(variance);
        }
        return NaN;
      }
      // variance(v) — sample variance
      if (node.name === "variance" || node.name === "var") {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          const arr = v as number[];
          const m = arr.reduce((s, x) => s + x, 0) / arr.length;
          return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
        }
        return NaN;
      }
      // norm(v) — Euclidean norm (L2)
      if (node.name === "norm") {
        const v = evaluate(node.args[0], env);
        if (Array.isArray(v) && !Array.isArray(v[0])) {
          return Math.sqrt((v as number[]).reduce((s, x) => s + x * x, 0));
        }
        return NaN;
      }
      // dot(u, v) — dot product
      if (node.name === "dot") {
        const u = evaluate(node.args[0], env) as number[];
        const v = evaluate(node.args[1], env) as number[];
        if (Array.isArray(u) && Array.isArray(v)) {
          return u.reduce((s, x, i) => s + x * (v[i] || 0), 0);
        }
        return NaN;
      }
      // cross(u, v) — cross product (3D vectors)
      if (node.name === "cross") {
        const u = evaluate(node.args[0], env) as number[];
        const v = evaluate(node.args[1], env) as number[];
        if (Array.isArray(u) && Array.isArray(v) && u.length === 3 && v.length === 3) {
          return [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
        }
        return NaN;
      }

      // ─── Symbolic Derivative (AST-based) ────────────────────
      // sdiff(f, x) → returns the symbolic derivative evaluated at x
      // Uses AST differentiation rules (chain, product, quotient, trig)
      if (node.name === "sdiff") {
        if (node.args.length < 2) throw new Error("sdiff(f, x) requires 2 args");
        const fnName = node.args[0].type === "variable" ? node.args[0].name : null;
        if (!fnName) throw new Error("sdiff: first arg must be a function name");
        const fn = env.userFunctions.get(fnName);
        if (!fn) throw new Error(`sdiff: '${fnName}' is not a function`);
        const x = evaluate(node.args[1], env) as number;
        const varName = fn.params[0];
        const dAST = diffAST(fn.body, varName);
        const childEnv = new HekatanEnvironment();
        childEnv.variables = new Map(env.variables);
        childEnv.userFunctions = env.userFunctions;
        childEnv.setVar(varName, x);
        return evaluate(dAST, childEnv);
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
        const row = mat[idx as number];
        if (!row) return NaN;
        // Auto-extract scalar from Nx1 column vectors: u[1] → scalar instead of [scalar]
        if (row.length === 1) return row[0];
        return row;
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

// ─── Symbolic Differentiation (AST → AST) ────────────────
function diffAST(node: ASTNode, v: string): ASTNode {
  const ZERO: ASTNode = { type: "number", value: 0 };
  const ONE: ASTNode = { type: "number", value: 1 };
  const num = (n: number): ASTNode => ({ type: "number", value: n });
  const bin = (op: string, l: ASTNode, r: ASTNode): ASTNode => ({ type: "binary", op, left: l, right: r });
  const call = (name: string, ...args: ASTNode[]): ASTNode => ({ type: "call", name, args });
  const neg = (n: ASTNode): ASTNode => ({ type: "unary", op: "-", operand: n });

  switch (node.type) {
    case "number": return ZERO;
    case "variable": return node.name === v ? ONE : ZERO;
    case "binary": {
      const { op, left: u, right: w } = node;
      const du = diffAST(u, v), dw = diffAST(w, v);
      switch (op) {
        case "+": return bin("+", du, dw);
        case "-": return bin("-", du, dw);
        case "*": // product rule: u'w + uw'
          return bin("+", bin("*", du, w), bin("*", u, dw));
        case "/": // quotient rule: (u'w - uw') / w²
          return bin("/", bin("-", bin("*", du, w), bin("*", u, dw)), bin("^", w, num(2)));
        case "^": {
          // Power rule: if w is constant → n*u^(n-1)*u'
          // General: u^w * (w' * ln(u) + w * u'/u)
          const wIsConst = !hasVar(w, v);
          const uIsConst = !hasVar(u, v);
          if (wIsConst && !uIsConst) {
            return bin("*", bin("*", w, bin("^", u, bin("-", w, ONE))), du);
          }
          if (uIsConst && !wIsConst) {
            return bin("*", bin("*", node, call("ln", u)), dw);
          }
          // General case
          return bin("*", node, bin("+", bin("*", dw, call("ln", u)), bin("*", w, bin("/", du, u))));
        }
        default: return ZERO;
      }
    }
    case "unary":
      if (node.op === "-") return neg(diffAST(node.operand, v));
      return ZERO;
    case "call": {
      const { name, args } = node;
      if (args.length === 0) return ZERO;
      const u = args[0], du = diffAST(u, v);
      // Chain rule: d/dx f(u) = f'(u) * u'
      let inner: ASTNode;
      switch (name) {
        case "sin": inner = call("cos", u); break;
        case "cos": inner = neg(call("sin", u)); break;
        case "tan": inner = bin("/", ONE, bin("^", call("cos", u), num(2))); break;
        case "asin": inner = bin("/", ONE, call("sqrt", bin("-", ONE, bin("^", u, num(2))))); break;
        case "acos": inner = neg(bin("/", ONE, call("sqrt", bin("-", ONE, bin("^", u, num(2)))))); break;
        case "atan": inner = bin("/", ONE, bin("+", ONE, bin("^", u, num(2)))); break;
        case "exp": inner = call("exp", u); break;
        case "ln": inner = bin("/", ONE, u); break;
        case "log": inner = bin("/", ONE, bin("*", u, call("ln", num(10)))); break;
        case "log2": inner = bin("/", ONE, bin("*", u, call("ln", num(2)))); break;
        case "sqrt": inner = bin("/", ONE, bin("*", num(2), call("sqrt", u))); break;
        case "abs": inner = call("sign", u); break;
        case "sinh": inner = call("cosh", u); break;
        case "cosh": inner = call("sinh", u); break;
        case "tanh": inner = bin("-", ONE, bin("^", call("tanh", u), num(2))); break;
        default: return ZERO; // Unknown function → 0
      }
      return bin("*", inner, du);
    }
    default: return ZERO;
  }
}

function hasVar(node: ASTNode, v: string): boolean {
  switch (node.type) {
    case "number": return false;
    case "variable": return node.name === v;
    case "binary": return hasVar(node.left, v) || hasVar(node.right, v);
    case "unary": return hasVar(node.operand, v);
    case "call": return node.args.some(a => hasVar(a, v));
    default: return false;
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

// ═══════════════════════════════════════════════════════════
// MULTILINE FUNCTION EXECUTOR
// Supports: for/end, if/else/end, while/end, assignments,
// expressions, continue, break, zeros(), ones(), input()
// ═══════════════════════════════════════════════════════════

/** Execute a multiline function and return the output values */
export function executeMultilineFunction(
  fn: MultilineFunction,
  args: any[],
  callerEnv: HekatanEnvironment
): any {
  // Create isolated child environment
  const env = new HekatanEnvironment();
  env.variables = new Map(callerEnv.variables);
  env.userFunctions = callerEnv.userFunctions;
  env.multilineFunctions = callerEnv.multilineFunctions;
  env.decimals = callerEnv.decimals;

  // Bind input parameters
  for (let i = 0; i < fn.params.length; i++) {
    if (i < args.length) {
      env.setVar(fn.params[i], args[i]);
    }
  }

  // Execute body
  execBlock(fn.lines, 0, fn.lines.length, env);

  // Return outputs
  if (fn.outputs.length === 1) {
    return env.getVar(fn.outputs[0]) ?? 0;
  }
  // Multiple outputs → return as cell array
  const elements = fn.outputs.map(o => env.getVar(o) ?? 0);
  return { __cell: true, elements };
}

/** Evaluate a single expression string in the given environment, returning any type */
function evalAny(expr: string, env: HekatanEnvironment): any {
  try {
    const ast = parseExpression(expr);
    return evaluate(ast, env);
  } catch {
    return 0;
  }
}

/** Evaluate expression as a number */
function evalNum(expr: string, env: HekatanEnvironment): number {
  const v = evalAny(expr, env);
  return typeof v === "number" ? v : 0;
}

/** Strip trailing MATLAB-style comments: line % comment → line */
function stripComment(line: string): string {
  // Don't strip % inside strings
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'" || line[i] === '"') inStr = !inStr;
    if (!inStr && line[i] === '%') return line.slice(0, i).trimEnd();
  }
  return line;
}

/**
 * Execute a block of lines [start, end) in the environment.
 * Returns "break" or "continue" if those statements are hit, otherwise undefined.
 */
function execBlock(
  lines: string[], start: number, end: number, env: HekatanEnvironment
): "break" | "continue" | undefined {
  let i = start;
  while (i < end) {
    const raw = lines[i];
    const trimmed = stripComment(raw).trim();

    // Skip empty lines and pure comment lines
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('//')) {
      i++; continue;
    }

    // ── break / continue ─────────────────
    if (trimmed === "break") return "break";
    if (trimmed === "continue") return "continue";

    // ── for i = start : end ─────────────
    const forMatch = trimmed.match(
      /^for\s+(\w+)\s*=\s*(.+?)\s*:\s*(.+?)(?:\s*:\s*(.+?))?\s*$/i
    );
    if (forMatch) {
      const varName = forMatch[1];
      const forStart = evalNum(forMatch[2], env);
      const forEnd = evalNum(forMatch[3], env);
      const forStep = forMatch[4] ? evalNum(forMatch[4], env) : 1;
      // Find matching "end"
      const bodyEnd = findMatchingEnd(lines, i + 1, end);
      // Execute loop
      for (let v = forStart; forStep > 0 ? v <= forEnd : v >= forEnd; v += forStep) {
        env.setVar(varName, v);
        const signal = execBlock(lines, i + 1, bodyEnd, env);
        if (signal === "break") break;
        // "continue" just goes to next iteration
      }
      i = bodyEnd + 1;
      continue;
    }

    // ── while condition ──────────────────
    const whileMatch = trimmed.match(/^while\s+(.+)$/i);
    if (whileMatch) {
      const condExpr = whileMatch[1];
      const bodyEnd = findMatchingEnd(lines, i + 1, end);
      let maxIter = 100000;
      while (maxIter-- > 0 && evalNum(condExpr, env) !== 0) {
        const signal = execBlock(lines, i + 1, bodyEnd, env);
        if (signal === "break") break;
      }
      i = bodyEnd + 1;
      continue;
    }

    // ── if condition ─────────────────────
    if (/^if\s+/i.test(trimmed)) {
      const condExpr = trimmed.replace(/^if\s+/i, "").trim();
      // Find else/elseif/end structure
      const { branches, endLine } = parseIfBlock(lines, i, end);
      // Evaluate branches
      let executed = false;
      for (const br of branches) {
        if (br.condition === null) {
          // else branch
          execBlock(lines, br.bodyStart, br.bodyEnd, env);
          executed = true;
          break;
        }
        if (evalNum(br.condition, env) !== 0) {
          execBlock(lines, br.bodyStart, br.bodyEnd, env);
          executed = true;
          break;
        }
      }
      i = endLine + 1;
      continue;
    }

    // ── Assignment or expression ─────────
    // Handle semicolon-separated statements: a=1; b=2; c=3
    const stmts = splitStatements(trimmed);
    for (const stmt of stmts) {
      const s = stmt.trim();
      if (!s) continue;
      try {
        const ast = parseExpression(s);
        evaluate(ast, env);
      } catch {
        // Silently skip errors in function body
      }
    }

    i++;
  }
  return undefined;
}

/** Split a line by semicolons (respecting brackets and strings) */
function splitStatements(line: string): string[] {
  const stmts: string[] = [];
  let depth = 0, inStr = false, start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" || c === '"') inStr = !inStr;
    if (!inStr) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth === 0) {
        stmts.push(line.slice(start, i));
        start = i + 1;
      }
    }
  }
  if (start < line.length) stmts.push(line.slice(start));
  return stmts;
}

/** Find matching 'end' for a for/while/if block starting at line startBody */
function findMatchingEnd(lines: string[], startBody: number, limit: number): number {
  let depth = 1;
  for (let i = startBody; i < limit; i++) {
    const t = stripComment(lines[i]).trim().toLowerCase();
    if (/^(for|while|if)\s+/.test(t)) depth++;
    if (t === "end") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return limit; // No matching end found
}

interface IfBranch {
  condition: string | null;  // null = else (unconditional)
  bodyStart: number;
  bodyEnd: number;
}

/** Parse if/elseif/else/end block structure */
function parseIfBlock(
  lines: string[], ifLine: number, limit: number
): { branches: IfBranch[]; endLine: number } {
  const branches: IfBranch[] = [];
  const ifTrimmed = stripComment(lines[ifLine]).trim();
  const firstCond = ifTrimmed.replace(/^if\s+/i, "").trim();

  let depth = 1;
  let branchStart = ifLine + 1;
  let currentCond: string | null = firstCond;

  for (let i = ifLine + 1; i < limit; i++) {
    const t = stripComment(lines[i]).trim();
    const tl = t.toLowerCase();

    if (/^(for|while|if)\s+/.test(tl)) { depth++; continue; }
    if (tl === "end") {
      depth--;
      if (depth === 0) {
        branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
        return { branches, endLine: i };
      }
      continue;
    }

    if (depth === 1) {
      if (/^elseif\s+/i.test(t)) {
        branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
        currentCond = t.replace(/^elseif\s+/i, "").trim();
        branchStart = i + 1;
      } else if (/^else\s*$/i.test(t)) {
        branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
        currentCond = null;
        branchStart = i + 1;
      }
    }
  }
  // No matching end
  branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: limit });
  return { branches, endLine: limit };
}

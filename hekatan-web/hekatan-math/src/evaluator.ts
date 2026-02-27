/**
 * Hekatan Evaluator — Numeric expression engine
 *
 * Tokenizer → Parser (recursive descent) → AST → Evaluate
 * Supports: variables, functions, units, cell arrays, vectors, matrices
 */

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
          return matDet(m as number[][]);
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
        if (is2D(m)) return matInverse(toMat(m));
        return NaN;
      }
      if (node.name === "lusolve" || node.name === "solve") {
        const A = evaluate(node.args[0], env);
        const b = evaluate(node.args[1], env);
        if (is2D(A) && Array.isArray(b)) {
          // b can be Nx1 matrix or 1D vector
          const bVec = is2D(b) ? (b as number[][]).map(r => r[0]) : b as number[];
          const x = gaussianSolve(toMat(A), bVec);
          // Return as column vector (Nx1 matrix)
          return x.map(v => [v]);
        }
        return NaN;
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

// ─── Convenience ──────────────────────────────────────────
export function evalString(expr: string, env: HekatanEnvironment): number | number[] | number[][] {
  const ast = parseExpression(expr);
  return evaluate(ast, env);
}

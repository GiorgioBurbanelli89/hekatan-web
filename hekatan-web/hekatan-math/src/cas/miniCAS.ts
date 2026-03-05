/**
 * miniCAS — Mini Computer Algebra System
 * Symbolic engine: AST + rewrite rules (like Mathematica/Maxima)
 *
 * Supports: simplify, expand, diff, integrate, solve, dsolve, taylor, factor
 */

// ═══════════════════════════════════════════════════════════
// AST — N-ary add/mul for easier simplification
// ═══════════════════════════════════════════════════════════

export type Expr =
  | { tag: "num"; val: number }
  | { tag: "sym"; name: string }
  | { tag: "add"; terms: Expr[] }
  | { tag: "mul"; factors: Expr[] }
  | { tag: "pow"; base: Expr; exp: Expr }
  | { tag: "fn"; name: string; args: Expr[] }
  | { tag: "eq"; lhs: Expr; rhs: Expr };

// ─── Constructors ────────────────────────────────────────
export const num = (v: number): Expr => ({ tag: "num", val: v });
export const sym = (n: string): Expr => ({ tag: "sym", name: n });
export const add = (...t: Expr[]): Expr => ({ tag: "add", terms: t });
export const mul = (...f: Expr[]): Expr => ({ tag: "mul", factors: f });
export const pow = (b: Expr, e: Expr): Expr => ({ tag: "pow", base: b, exp: e });
export const fn = (name: string, ...args: Expr[]): Expr => ({ tag: "fn", name, args });
export const eq = (l: Expr, r: Expr): Expr => ({ tag: "eq", lhs: l, rhs: r });
export const neg = (e: Expr): Expr => mul(num(-1), e);
export const sub = (a: Expr, b: Expr): Expr => add(a, neg(b));
export const div = (a: Expr, b: Expr): Expr => mul(a, pow(b, num(-1)));

const ZERO = num(0);
const ONE = num(1);
const TWO = num(2);
const NEG1 = num(-1);

// ─── Helpers ─────────────────────────────────────────────
export function isNum(e: Expr, v?: number): boolean {
  return e.tag === "num" && (v === undefined || e.val === v);
}
export function isSym(e: Expr, n?: string): boolean {
  return e.tag === "sym" && (n === undefined || e.name === n);
}
function exprEqual(a: Expr, b: Expr): boolean {
  if (a.tag !== b.tag) return false;
  if (a.tag === "num" && b.tag === "num") return Math.abs(a.val - b.val) < 1e-15;
  if (a.tag === "sym" && b.tag === "sym") return a.name === b.name;
  if (a.tag === "add" && b.tag === "add") {
    if (a.terms.length !== b.terms.length) return false;
    return a.terms.every((t, i) => exprEqual(t, b.terms[i]));
  }
  if (a.tag === "mul" && b.tag === "mul") {
    if (a.factors.length !== b.factors.length) return false;
    // Commutative: try sorted comparison
    const sortA = [...a.factors].sort(exprCompare);
    const sortB = [...b.factors].sort(exprCompare);
    return sortA.every((f, i) => exprEqual(f, sortB[i]));
  }
  if (a.tag === "pow" && b.tag === "pow") return exprEqual(a.base, b.base) && exprEqual(a.exp, b.exp);
  if (a.tag === "fn" && b.tag === "fn") {
    if (a.name !== b.name || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => exprEqual(arg, b.args[i]));
  }
  return false;
}

function exprCompare(a: Expr, b: Expr): number {
  // For sorting: nums first, then syms alphabetically, then complex
  if (a.tag === "num" && b.tag !== "num") return -1;
  if (a.tag !== "num" && b.tag === "num") return 1;
  if (a.tag === "num" && b.tag === "num") return a.val - b.val;
  if (a.tag === "sym" && b.tag === "sym") return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  if (a.tag === "sym" && b.tag !== "sym") return -1;
  if (a.tag !== "sym" && b.tag === "sym") return 1;
  return print(a) < print(b) ? -1 : 1;
}

function toFraction(x: number): [number, number] {
  if (Number.isInteger(x)) return [x, 1];
  // Try small denominators
  for (let d = 2; d <= 1000; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-12) {
      // Simplify
      let g = Math.abs(n), h = d;
      while (h) { [g, h] = [h, g % h]; }
      return [n / g, d / g];
    }
  }
  return [x, 1]; // can't express as simple fraction
}
function hasSymbol(e: Expr, name: string): boolean {
  if (e.tag === "sym") return e.name === name;
  if (e.tag === "num") return false;
  if (e.tag === "add") return e.terms.some(t => hasSymbol(t, name));
  if (e.tag === "mul") return e.factors.some(f => hasSymbol(f, name));
  if (e.tag === "pow") return hasSymbol(e.base, name) || hasSymbol(e.exp, name);
  if (e.tag === "fn") return e.args.some(a => hasSymbol(a, name));
  if (e.tag === "eq") return hasSymbol(e.lhs, name) || hasSymbol(e.rhs, name);
  return false;
}
function substitute(e: Expr, name: string, val: Expr): Expr {
  if (e.tag === "sym" && e.name === name) return val;
  if (e.tag === "num" || e.tag === "sym") return e;
  if (e.tag === "add") return add(...e.terms.map(t => substitute(t, name, val)));
  if (e.tag === "mul") return mul(...e.factors.map(f => substitute(f, name, val)));
  if (e.tag === "pow") return pow(substitute(e.base, name, val), substitute(e.exp, name, val));
  if (e.tag === "fn") return fn(e.name, ...e.args.map(a => substitute(a, name, val)));
  if (e.tag === "eq") return eq(substitute(e.lhs, name, val), substitute(e.rhs, name, val));
  return e;
}

// ═══════════════════════════════════════════════════════════
// TOKENIZER
// ═══════════════════════════════════════════════════════════

type Tok = { ty: string; val: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (/[0-9.]/.test(src[i])) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      if (i < src.length && /[eE]/.test(src[i])) {
        n += src[i++];
        if (i < src.length && /[+-]/.test(src[i])) n += src[i++];
        while (i < src.length && /[0-9]/.test(src[i])) n += src[i++];
      }
      toks.push({ ty: "num", val: n });
      continue;
    }
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = "";
      while (i < src.length && /[a-zA-Z_0-9']/.test(src[i])) id += src[i++];
      toks.push({ ty: "id", val: id });
      continue;
    }
    if (src[i] === "=" && src[i + 1] === "=") { toks.push({ ty: "==", val: "==" }); i += 2; continue; }
    if (src[i] === "=" ) { toks.push({ ty: "=", val: "=" }); i++; continue; }
    const ch = src[i++];
    toks.push({ ty: ch, val: ch });
  }
  toks.push({ ty: "eof", val: "" });
  return toks;
}

// ═══════════════════════════════════════════════════════════
// PARSER — infix → AST
// ═══════════════════════════════════════════════════════════

class Parser {
  private toks: Tok[];
  private pos = 0;
  constructor(toks: Tok[]) { this.toks = toks; }
  private peek() { return this.toks[this.pos]; }
  private eat(ty?: string) {
    const t = this.toks[this.pos++];
    if (ty && t.ty !== ty) throw new Error(`Expected '${ty}', got '${t.val}'`);
    return t;
  }

  parse(): Expr {
    const e = this.parseEquation();
    return e;
  }

  private parseEquation(): Expr {
    const lhs = this.parseAdd();
    if (this.peek().ty === "=") {
      this.eat("=");
      const rhs = this.parseAdd();
      return eq(lhs, rhs);
    }
    return lhs;
  }

  private parseAdd(): Expr {
    let terms: Expr[] = [this.parseMul()];
    while (this.peek().ty === "+" || this.peek().ty === "-") {
      const op = this.eat().ty;
      const t = this.parseMul();
      terms.push(op === "-" ? neg(t) : t);
    }
    return terms.length === 1 ? terms[0] : add(...terms);
  }

  private parseMul(): Expr {
    let factors: Expr[] = [this.parseUnary()];
    while (this.peek().ty === "*" || this.peek().ty === "/") {
      const op = this.eat().ty;
      const f = this.parseUnary();
      factors.push(op === "/" ? pow(f, NEG1) : f);
    }
    return factors.length === 1 ? factors[0] : mul(...factors);
  }

  private parseUnary(): Expr {
    if (this.peek().ty === "-") {
      this.eat();
      return neg(this.parsePow());
    }
    return this.parsePow();
  }

  private parsePow(): Expr {
    let base = this.parseAtom();
    if (this.peek().ty === "^") {
      this.eat();
      const exp = this.parseUnary(); // right-associative
      base = pow(base, exp);
    }
    return base;
  }

  private parseAtom(): Expr {
    const t = this.peek();
    if (t.ty === "num") {
      this.eat();
      return num(parseFloat(t.val));
    }
    if (t.ty === "(") {
      this.eat("(");
      const e = this.parseAdd();
      this.eat(")");
      return e;
    }
    if (t.ty === "id") {
      const name = this.eat().val;
      // Constants
      if (name === "pi") return num(Math.PI);
      if (name === "e" && this.peek().ty !== "(") return num(Math.E);
      // Function call
      if (this.peek().ty === "(") {
        this.eat("(");
        const args: Expr[] = [];
        if (this.peek().ty !== ")") {
          args.push(this.parseEquation());
          while (this.peek().ty === ",") { this.eat(","); args.push(this.parseEquation()); }
        }
        this.eat(")");
        return fn(name, ...args);
      }
      return sym(name);
    }
    throw new Error(`Unexpected token: '${t.val}'`);
  }
}

export function parse(src: string): Expr {
  return new Parser(tokenize(src)).parse();
}

// ═══════════════════════════════════════════════════════════
// PRETTY PRINTER
// ═══════════════════════════════════════════════════════════

export function print(e: Expr): string {
  if (e.tag === "num") {
    if (Number.isInteger(e.val)) return String(e.val);
    if (Math.abs(e.val - Math.PI) < 1e-12) return "pi";
    if (Math.abs(e.val - Math.E) < 1e-12) return "e";
    return e.val.toPrecision(6);
  }
  if (e.tag === "sym") return e.name;
  if (e.tag === "eq") return `${print(e.lhs)} = ${print(e.rhs)}`;

  if (e.tag === "add") {
    let s = "";
    for (let i = 0; i < e.terms.length; i++) {
      const t = e.terms[i];
      if (i === 0) { s += print(t); continue; }
      // Check for negative: mul([-1, ...])
      if (t.tag === "mul" && t.factors.length >= 1 && isNum(t.factors[0]) && (t.factors[0] as any).val < 0) {
        const coeff = (t.factors[0] as any).val;
        const rest = t.factors.length === 2 ? t.factors[1] : mul(...t.factors.slice(1));
        if (coeff === -1) s += ` - ${printMulTerm(rest)}`;
        else s += ` - ${printMulTerm(mul(num(-coeff), ...t.factors.slice(1)))}`;
      } else {
        s += ` + ${print(t)}`;
      }
    }
    return s;
  }

  if (e.tag === "mul") return printMulTerm(e);

  if (e.tag === "pow") {
    const b = e.base;
    const ex = e.exp;
    // x^(-1) → 1/x
    if (isNum(ex, -1)) return `1/${wrapIfComplex(b)}`;
    // x^(1/2) → sqrt(x)
    if (ex.tag === "pow" && isNum(ex.base, 2) && isNum(ex.exp, -1)) return `sqrt(${print(b)})`;
    if (isNum(ex) && (ex as any).val === 0.5) return `sqrt(${print(b)})`;
    return `${wrapIfComplex(b)}^${wrapIfComplex(ex)}`;
  }

  if (e.tag === "fn") {
    return `${e.name}(${e.args.map(print).join(", ")})`;
  }
  return "?";
}

function printMulTerm(e: Expr): string {
  if (e.tag !== "mul") return print(e);
  const f = e.factors;
  // Separate numerator and denominator
  let coeff = 1;
  const numer: Expr[] = [];
  const denom: Expr[] = [];
  for (const factor of f) {
    if (factor.tag === "num") { coeff *= factor.val; }
    else if (factor.tag === "pow" && factor.exp.tag === "num" && factor.exp.val < 0) {
      if (factor.exp.val === -1) denom.push(factor.base);
      else denom.push(pow(factor.base, num(-factor.exp.val)));
    } else { numer.push(factor); }
  }
  // Build numerator string
  let numStr: string;
  if (numer.length === 0 && coeff === 1) numStr = "1";
  else if (numer.length === 0) numStr = String(coeff);
  else {
    const parts = numer.map(r => wrapIfComplex(r)).join("*");
    if (coeff === 1) numStr = parts;
    else if (coeff === -1) numStr = `-${parts}`;
    else numStr = `${coeff}*${parts}`;
  }
  // Build denominator string
  if (denom.length === 0) return numStr;
  const denomStr = denom.length === 1 ? wrapIfComplex(denom[0]) : denom.map(d => wrapIfComplex(d)).join("*");
  return `${numStr}/${denomStr}`;
}

function wrapIfComplex(e: Expr): string {
  if (e.tag === "add" || (e.tag === "mul" && e.factors.length > 1)) return `(${print(e)})`;
  return print(e);
}

// ═══════════════════════════════════════════════════════════
// SIMPLIFY — The heart of the CAS
// ═══════════════════════════════════════════════════════════

export function simplify(e: Expr, depth = 0): Expr {
  if (depth > 50) return e;
  const s = simplifyOnce(e);
  if (exprEqual(s, e)) return s;
  return simplify(s, depth + 1);
}

function simplifyOnce(e: Expr): Expr {
  if (e.tag === "num" || e.tag === "sym") return e;
  if (e.tag === "eq") return eq(simplify(e.lhs), simplify(e.rhs));

  // Recursively simplify children first
  if (e.tag === "fn") {
    const sArgs = e.args.map(a => simplify(a));
    // Evaluate known functions with all-numeric args
    if (sArgs.every(a => a.tag === "num")) {
      const vals = sArgs.map(a => (a as { tag: "num"; val: number }).val);
      const fns: Record<string, (...a: number[]) => number> = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        asin: Math.asin, acos: Math.acos, atan: Math.atan,
        exp: Math.exp, ln: Math.log, log: Math.log,
        sqrt: Math.sqrt, abs: Math.abs,
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      };
      if (fns[e.name]) {
        const r = fns[e.name](...vals);
        if (Number.isInteger(r)) return num(r);
        // Keep symbolic if result is irrational (unless very close to int)
        if (Math.abs(r - Math.round(r)) < 1e-12) return num(Math.round(r));
      }
    }
    return fn(e.name, ...sArgs);
  }

  if (e.tag === "pow") {
    const b = simplify(e.base);
    const ex = simplify(e.exp);
    // n^m → compute
    if (b.tag === "num" && ex.tag === "num") {
      if (Number.isInteger(ex.val) && ex.val >= 0) return num(Math.pow(b.val, ex.val));
      // Negative integer exponent with integer base: compute as fraction later
      if (Number.isInteger(ex.val) && ex.val < 0 && b.val !== 0) {
        const r = Math.pow(b.val, ex.val);
        if (Number.isInteger(r)) return num(r);
      }
    }
    if (isNum(ex, 0)) return ONE;        // x^0 → 1
    if (isNum(ex, 1)) return b;          // x^1 → x
    if (isNum(b, 0)) return ZERO;        // 0^n → 0
    if (isNum(b, 1)) return ONE;         // 1^n → 1
    // (x^a)^b → x^(a*b)
    if (b.tag === "pow") return simplify(pow(b.base, simplify(mul(b.exp, ex))));
    return pow(b, ex);
  }

  if (e.tag === "add") {
    // Flatten nested adds and simplify terms
    let terms: Expr[] = [];
    for (const t of e.terms) {
      const st = simplify(t);
      if (st.tag === "add") terms.push(...st.terms);
      else terms.push(st);
    }
    // Combine numeric constants
    let numSum = 0;
    const symbolic: Expr[] = [];
    for (const t of terms) {
      if (t.tag === "num") numSum += t.val;
      else symbolic.push(t);
    }
    // Collect like terms: 2x + 3x → 5x
    const collected = collectLikeTerms(symbolic);
    if (numSum !== 0) collected.push(num(numSum));
    if (collected.length === 0) return ZERO;
    if (collected.length === 1) return collected[0];
    return add(...collected);
  }

  if (e.tag === "mul") {
    // Flatten nested muls and simplify factors
    let factors: Expr[] = [];
    for (const f of e.factors) {
      const sf = simplify(f);
      if (sf.tag === "mul") factors.push(...sf.factors);
      else factors.push(sf);
    }
    // Check for zero
    if (factors.some(f => isNum(f, 0))) return ZERO;
    // Combine numeric constants — also absorb integer^(-1) into coefficient
    let numProd = 1;
    const symbolic: Expr[] = [];
    for (const f of factors) {
      if (f.tag === "num") { numProd *= f.val; }
      else if (f.tag === "pow" && f.base.tag === "num" && isNum(f.exp, -1) && f.base.val !== 0) {
        numProd /= f.base.val;  // absorb n^(-1) into coefficient
      } else { symbolic.push(f); }
    }
    // Combine like bases: x * x → x^2, x^2 * x^3 → x^5
    const combined = combineLikeBases(symbolic);
    if (numProd === 0) return ZERO;
    // Express as fraction if not integer
    if (numProd !== 1 || combined.length === 0) {
      if (Number.isInteger(numProd)) {
        combined.unshift(num(numProd));
      } else {
        // Try to express as a/b fraction
        const [numer, denom] = toFraction(numProd);
        if (denom !== 1) {
          combined.unshift(pow(num(denom), NEG1));
          combined.unshift(num(numer));
        } else {
          combined.unshift(num(numProd));
        }
      }
    }
    // Remove 1s
    const filtered = combined.filter(f => !isNum(f, 1));
    if (filtered.length === 0) return ONE;
    if (filtered.length === 1) return filtered[0];
    return mul(...filtered);
  }

  return e;
}

function getCoeffAndTerm(e: Expr): [number, Expr] {
  if (e.tag === "num") return [e.val, ONE];
  if (e.tag === "mul") {
    let coeff = 1;
    const rest: Expr[] = [];
    for (const f of e.factors) {
      if (f.tag === "num") coeff *= f.val;
      else rest.push(f);
    }
    const term = rest.length === 0 ? ONE : rest.length === 1 ? rest[0] : mul(...rest);
    return [coeff, term];
  }
  return [1, e];
}

function collectLikeTerms(terms: Expr[]): Expr[] {
  const groups: { term: Expr; coeff: number }[] = [];
  for (const t of terms) {
    const [c, base] = getCoeffAndTerm(t);
    const idx = groups.findIndex(g => exprEqual(g.term, base));
    if (idx >= 0) groups[idx].coeff += c;
    else groups.push({ term: base, coeff: c });
  }
  const result: Expr[] = [];
  for (const g of groups) {
    if (g.coeff === 0) continue;
    if (isNum(g.term, 1)) result.push(num(g.coeff));
    else if (g.coeff === 1) result.push(g.term);
    else result.push(simplify(mul(num(g.coeff), g.term)));
  }
  return result;
}

function getBaseAndExp(e: Expr): [Expr, Expr] {
  if (e.tag === "pow") return [e.base, e.exp];
  return [e, ONE];
}

function combineLikeBases(factors: Expr[]): Expr[] {
  const groups: { base: Expr; exp: Expr }[] = [];
  for (const f of factors) {
    const [b, ex] = getBaseAndExp(f);
    const idx = groups.findIndex(g => exprEqual(g.base, b));
    if (idx >= 0) groups[idx].exp = simplify(add(groups[idx].exp, ex));
    else groups.push({ base: b, exp: ex });
  }
  return groups.map(g => {
    if (isNum(g.exp, 0)) return ONE;
    if (isNum(g.exp, 1)) return g.base;
    return pow(g.base, g.exp);
  });
}

// ═══════════════════════════════════════════════════════════
// EXPAND — distribute multiplication
// ═══════════════════════════════════════════════════════════

export function expand(e: Expr): Expr {
  if (e.tag === "num" || e.tag === "sym") return e;
  if (e.tag === "fn") return fn(e.name, ...e.args.map(expand));
  if (e.tag === "eq") return eq(expand(e.lhs), expand(e.rhs));
  if (e.tag === "add") return simplify(add(...e.terms.map(expand)));

  // (a+b)^n integer → expand via repeated distribution (avoids simplify↔expand cycle)
  if (e.tag === "pow" && e.base.tag === "add" && e.exp.tag === "num" && Number.isInteger(e.exp.val) && e.exp.val >= 2 && e.exp.val <= 10) {
    let result: Expr = expand(e.base);
    for (let i = 1; i < e.exp.val; i++) {
      result = distrib(result, expand(e.base));
    }
    return simplify(result);
  }
  if (e.tag === "pow") return pow(expand(e.base), expand(e.exp));

  if (e.tag === "mul") {
    const expanded = e.factors.map(expand);
    return distribAll(expanded);
  }
  return e;
}

// Distribute a*b where a or b might be an add — NO simplify→combineLikeBases cycle
function distrib(a: Expr, b: Expr): Expr {
  if (a.tag === "add") return simplify(add(...a.terms.map(t => distrib(t, b))));
  if (b.tag === "add") return simplify(add(...b.terms.map(t => distrib(a, t))));
  return simplify(mul(a, b));
}

function distribAll(factors: Expr[]): Expr {
  if (factors.length === 0) return ONE;
  if (factors.length === 1) return factors[0];
  let result = factors[0];
  for (let i = 1; i < factors.length; i++) result = distrib(result, factors[i]);
  return simplify(result);
}

// ═══════════════════════════════════════════════════════════
// DIFFERENTIATE — symbolic derivative
// ═══════════════════════════════════════════════════════════

export function diff(e: Expr, v: string): Expr {
  if (e.tag === "num") return ZERO;
  if (e.tag === "sym") return e.name === v ? ONE : ZERO;
  if (e.tag === "eq") return eq(diff(e.lhs, v), diff(e.rhs, v));

  if (e.tag === "add") return simplify(add(...e.terms.map(t => diff(t, v))));

  if (e.tag === "mul") {
    // Product rule for n factors: d(f1*f2*...*fn) = f1'*f2*...*fn + f1*f2'*...*fn + ...
    const terms: Expr[] = [];
    for (let i = 0; i < e.factors.length; i++) {
      const parts = e.factors.map((f, j) => j === i ? diff(f, v) : f);
      terms.push(mul(...parts));
    }
    return simplify(add(...terms));
  }

  if (e.tag === "pow") {
    const { base: f, exp: g } = e;
    const fHas = hasSymbol(f, v);
    const gHas = hasSymbol(g, v);
    if (!fHas && !gHas) return ZERO;
    // x^n → n*x^(n-1)*x'
    if (!gHas) return simplify(mul(g, pow(f, sub(g, ONE)), diff(f, v)));
    // a^x → a^x * ln(a) * x'
    if (!fHas) return simplify(mul(e, fn("ln", f), diff(g, v)));
    // f^g → f^g * (g'*ln(f) + g*f'/f)
    return simplify(mul(e, add(mul(diff(g, v), fn("ln", f)), mul(g, div(diff(f, v), f)))));
  }

  if (e.tag === "fn") {
    const a = e.args[0];
    const da = diff(a, v); // chain rule: f(g(x))' = f'(g(x)) * g'(x)
    switch (e.name) {
      case "sin": return simplify(mul(fn("cos", a), da));
      case "cos": return simplify(mul(NEG1, fn("sin", a), da));
      case "tan": return simplify(mul(pow(fn("cos", a), num(-2)), da));
      case "asin": return simplify(mul(pow(sub(ONE, pow(a, TWO)), num(-0.5)), da));
      case "acos": return simplify(mul(NEG1, pow(sub(ONE, pow(a, TWO)), num(-0.5)), da));
      case "atan": return simplify(mul(pow(add(ONE, pow(a, TWO)), NEG1), da));
      case "exp": return simplify(mul(fn("exp", a), da));
      case "ln": case "log": return simplify(mul(pow(a, NEG1), da));
      case "sqrt": return simplify(mul(div(ONE, mul(TWO, fn("sqrt", a))), da));
      case "sinh": return simplify(mul(fn("cosh", a), da));
      case "cosh": return simplify(mul(fn("sinh", a), da));
      case "tanh": return simplify(mul(sub(ONE, pow(fn("tanh", a), TWO)), da));
      case "abs": return simplify(mul(div(a, fn("abs", a)), da));
    }
  }
  return fn("diff", e, sym(v)); // unevaluated
}

// ═══════════════════════════════════════════════════════════
// INTEGRATE — symbolic integral (table-based)
// ═══════════════════════════════════════════════════════════

export function integrate(e: Expr, v: string): Expr {
  e = simplify(e);

  // ∫ 0 dx = 0
  if (isNum(e, 0)) return ZERO;

  // ∫ c dx = c*x (constant)
  if (!hasSymbol(e, v)) return simplify(mul(e, sym(v)));

  // ∫ x dx = x^2/2
  if (isSym(e, v)) return simplify(div(pow(sym(v), TWO), TWO));

  // ∫ (a + b) dx = ∫a dx + ∫b dx (linearity)
  if (e.tag === "add") return simplify(add(...e.terms.map(t => integrate(t, v))));

  // ∫ c*f(x) dx = c * ∫f(x) dx
  if (e.tag === "mul") {
    const consts: Expr[] = [];
    const varParts: Expr[] = [];
    for (const f of e.factors) {
      if (!hasSymbol(f, v)) consts.push(f);
      else varParts.push(f);
    }
    if (consts.length > 0 && varParts.length > 0) {
      const inner = varParts.length === 1 ? varParts[0] : mul(...varParts);
      const result = integrate(inner, v);
      if (result.tag === "fn" && result.name === "integral") return fn("integral", e, sym(v));
      return simplify(mul(...consts, result));
    }
  }

  // ∫ x^n dx = x^(n+1)/(n+1) for n ≠ -1
  if (e.tag === "pow" && isSym(e.base, v) && !hasSymbol(e.exp, v)) {
    if (isNum(e.exp, -1)) return fn("ln", fn("abs", sym(v))); // ∫ 1/x = ln|x|
    const n1 = simplify(add(e.exp, ONE));
    return simplify(div(pow(sym(v), n1), n1));
  }

  // ∫ sin(x) dx = -cos(x)
  if (e.tag === "fn" && e.name === "sin" && isSym(e.args[0], v))
    return simplify(neg(fn("cos", sym(v))));

  // ∫ cos(x) dx = sin(x)
  if (e.tag === "fn" && e.name === "cos" && isSym(e.args[0], v))
    return fn("sin", sym(v));

  // ∫ exp(x) dx = exp(x)
  if (e.tag === "fn" && e.name === "exp" && isSym(e.args[0], v))
    return fn("exp", sym(v));

  // ∫ 1/(1+x^2) dx = atan(x)
  if (e.tag === "pow" && isNum(e.exp, -1) && e.base.tag === "add") {
    const terms = e.base.terms;
    if (terms.length === 2 && isNum(terms[0], 1) && terms[1].tag === "pow" && isSym(terms[1].base, v) && isNum(terms[1].exp, 2))
      return fn("atan", sym(v));
  }

  // ∫ 1/sqrt(1-x^2) dx = asin(x)
  // ∫ ln(x) dx = x*ln(x) - x
  if (e.tag === "fn" && e.name === "ln" && isSym(e.args[0], v))
    return simplify(sub(mul(sym(v), fn("ln", sym(v))), sym(v)));

  // ∫ tan(x) dx = -ln|cos(x)|
  if (e.tag === "fn" && e.name === "tan" && isSym(e.args[0], v))
    return simplify(neg(fn("ln", fn("abs", fn("cos", sym(v))))));

  // ∫ sec^2(x) dx = tan(x) — represented as cos(x)^(-2)
  if (e.tag === "pow" && e.base.tag === "fn" && e.base.name === "cos" && isSym(e.base.args[0], v) && isNum(e.exp, -2))
    return fn("tan", sym(v));

  // ∫ sinh(x) = cosh(x), ∫ cosh(x) = sinh(x)
  if (e.tag === "fn" && e.name === "sinh" && isSym(e.args[0], v)) return fn("cosh", sym(v));
  if (e.tag === "fn" && e.name === "cosh" && isSym(e.args[0], v)) return fn("sinh", sym(v));

  // Linear substitution: ∫ f(ax+b) dx = F(ax+b)/a
  if (e.tag === "fn" && e.args.length === 1) {
    const inner = e.args[0];
    const lin = matchLinear(inner, v);
    if (lin) {
      const u = sym(v);
      const basic = integrate(fn(e.name, u), v);
      if (basic.tag !== "fn" || basic.name !== "integral") {
        return simplify(div(substitute(basic, v, inner), num(lin.a)));
      }
    }
  }

  // Cannot integrate → return unevaluated
  return fn("integral", e, sym(v));
}

function matchLinear(e: Expr, v: string): { a: number; b: number } | null {
  // Match a*x + b
  if (isSym(e, v)) return { a: 1, b: 0 };
  if (e.tag === "mul" && e.factors.length === 2) {
    if (e.factors[0].tag === "num" && isSym(e.factors[1], v)) return { a: e.factors[0].val, b: 0 };
    if (e.factors[1].tag === "num" && isSym(e.factors[0], v)) return { a: e.factors[1].val, b: 0 };
  }
  if (e.tag === "add" && e.terms.length === 2) {
    const t0 = matchLinear(e.terms[0], v);
    const t1 = matchLinear(e.terms[1], v);
    if (t0 && !hasSymbol(e.terms[1], v)) return { a: t0.a, b: (e.terms[1] as any).val || 0 };
    if (t1 && !hasSymbol(e.terms[0], v)) return { a: t1.a, b: (e.terms[0] as any).val || 0 };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// SOLVE — isolate variable in equation
// ═══════════════════════════════════════════════════════════

export function solve(e: Expr, v: string): Expr[] {
  // Normalize to f(x) = 0
  let expr: Expr;
  if (e.tag === "eq") expr = simplify(sub(e.lhs, e.rhs));
  else expr = simplify(e);

  expr = expand(expr);

  // Polynomial detection: collect coefficients
  const coeffs = polyCoeffs(expr, v);
  if (coeffs) {
    if (coeffs.length === 2) {
      // Linear: a*x + b = 0 → x = -b/a
      return [simplify(neg(div(num(coeffs[0]), num(coeffs[1]))))];
    }
    if (coeffs.length === 3) {
      // Quadratic: a*x^2 + b*x + c = 0
      const [c, b, a] = coeffs;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return []; // no real roots
      if (disc === 0) return [simplify(div(neg(num(b)), mul(TWO, num(a))))];
      const sqrtD = Math.sqrt(disc);
      return [
        simplify(div(add(neg(num(b)), num(sqrtD)), mul(TWO, num(a)))),
        simplify(div(sub(neg(num(b)), num(sqrtD)), mul(TWO, num(a)))),
      ];
    }
    // Cubic: try rational roots
    if (coeffs.length === 4) {
      const roots = rationalRoots(coeffs);
      if (roots.length > 0) return roots.map(r => num(r));
    }
  }

  // Fallback: try to isolate symbolically
  const isolated = isolateVar(expr, v);
  if (isolated) return [isolated];

  return [fn("solve", expr, sym(v))]; // unevaluated
}

function polyCoeffs(e: Expr, v: string): number[] | null {
  // Try to extract polynomial coefficients [c0, c1, c2, ...]
  e = expand(e);
  const terms = e.tag === "add" ? e.terms : [e];
  const coeffMap: Map<number, number> = new Map();

  for (const t of terms) {
    const [deg, coeff] = termDegCoeff(t, v);
    if (deg === null) return null;
    coeffMap.set(deg, (coeffMap.get(deg) || 0) + coeff);
  }

  const maxDeg = Math.max(...coeffMap.keys());
  if (maxDeg > 10) return null;
  const result: number[] = [];
  for (let i = 0; i <= maxDeg; i++) result.push(coeffMap.get(i) || 0);
  return result;
}

function termDegCoeff(t: Expr, v: string): [number | null, number] {
  if (!hasSymbol(t, v)) {
    if (t.tag === "num") return [0, t.val];
    return [null, 0]; // symbolic constant — can't extract
  }
  if (isSym(t, v)) return [1, 1];
  if (t.tag === "pow" && isSym(t.base, v) && t.exp.tag === "num" && Number.isInteger(t.exp.val) && t.exp.val >= 0)
    return [t.exp.val, 1];
  if (t.tag === "mul") {
    let coeff = 1;
    let deg = 0;
    for (const f of t.factors) {
      if (!hasSymbol(f, v)) {
        if (f.tag === "num") coeff *= f.val;
        else return [null, 0];
      } else if (isSym(f, v)) {
        deg += 1;
      } else if (f.tag === "pow" && isSym(f.base, v) && f.exp.tag === "num" && Number.isInteger(f.exp.val)) {
        deg += f.exp.val;
      } else {
        return [null, 0];
      }
    }
    return [deg, coeff];
  }
  return [null, 0];
}

function rationalRoots(coeffs: number[]): number[] {
  const n = coeffs.length - 1;
  const an = coeffs[n];
  const a0 = coeffs[0];
  if (a0 === 0 || an === 0) return [];
  const roots: number[] = [];
  const ps = divisors(Math.abs(a0));
  const qs = divisors(Math.abs(an));
  for (const p of ps) for (const q of qs) {
    for (const r of [p / q, -p / q]) {
      let val = 0;
      for (let i = 0; i < coeffs.length; i++) val += coeffs[i] * Math.pow(r, i);
      if (Math.abs(val) < 1e-10 && !roots.some(x => Math.abs(x - r) < 1e-10)) roots.push(r);
    }
  }
  return roots;
}

function divisors(n: number): number[] {
  const d: number[] = [];
  for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i);
  return d;
}

function isolateVar(e: Expr, v: string): Expr | null {
  // Simple: x + a = 0 → x = -a, a*x = 0 → x = 0
  if (isSym(e, v)) return ZERO;
  if (e.tag === "add") {
    const withV = e.terms.filter(t => hasSymbol(t, v));
    const without = e.terms.filter(t => !hasSymbol(t, v));
    if (withV.length === 1) {
      const rhs = without.length === 0 ? ZERO : simplify(neg(without.length === 1 ? without[0] : add(...without)));
      return isolateVarFromTerm(withV[0], v, rhs);
    }
  }
  return null;
}

function isolateVarFromTerm(term: Expr, v: string, rhs: Expr): Expr | null {
  if (isSym(term, v)) return simplify(rhs);
  if (term.tag === "mul") {
    const coeff = term.factors.filter(f => !hasSymbol(f, v));
    const varP = term.factors.filter(f => hasSymbol(f, v));
    if (varP.length === 1 && coeff.length > 0) {
      const c = coeff.length === 1 ? coeff[0] : mul(...coeff);
      return isolateVarFromTerm(varP[0], v, simplify(div(rhs, c)));
    }
  }
  if (term.tag === "pow" && isSym(term.base, v) && !hasSymbol(term.exp, v)) {
    return simplify(pow(rhs, div(ONE, term.exp)));
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// DSOLVE — Ordinary Differential Equations
// ═══════════════════════════════════════════════════════════

export function dsolve(e: Expr): Expr {
  // Parse forms: y' = f(x,y) or y'' = f(x,y,y')
  // We support a few standard forms:

  // 1. y' = a*y → y = C1*exp(a*x)
  // 2. y' = f(x) → y = ∫f(x)dx + C1
  // 3. y' + P(x)*y = Q(x) → integrating factor
  // 4. y'' + a*y' + b*y = 0 → characteristic equation
  // 5. y' = g(y) → separable ∫dy/g(y) = x + C1

  if (e.tag !== "eq") return fn("dsolve", e);

  const lhs = e.lhs;
  const rhs = simplify(e.rhs);

  // y' = rhs
  if (lhs.tag === "sym" && lhs.name === "y'") {
    // Case 1: y' = a*y (exponential)
    const linY = matchLinearInVar(rhs, "y");
    if (linY && linY.b === 0) {
      // y' = a*y → y = C1*exp(a*x)
      return eq(sym("y"), mul(sym("C1"), fn("exp", mul(num(linY.a), sym("x")))));
    }
    if (linY && linY.a === 0) {
      // y' = f(x) only → y = ∫f(x)dx + C1
      const integral = integrate(num(linY.b), "x");
      return eq(sym("y"), simplify(add(integral, sym("C1"))));
    }

    // Case 2: y' = f(x) (no y in rhs)
    if (!hasSymbol(rhs, "y")) {
      const integral = integrate(rhs, "x");
      return eq(sym("y"), simplify(add(integral, sym("C1"))));
    }

    // Case 3: y' = a*y + f(x) → integrating factor
    if (linY) {
      // y' - a*y = b (constant coeff, constant forcing)
      // Integrating factor: mu = e^(-a*x)
      // y = e^(a*x) * (∫ b*e^(-a*x) dx + C1)
      const a = linY.a;
      const b = linY.b;
      if (b === 0) {
        return eq(sym("y"), mul(sym("C1"), fn("exp", mul(num(a), sym("x")))));
      }
      // y = C1*e^(ax) + b/a (particular solution for constant)
      if (a !== 0) {
        return eq(sym("y"), simplify(add(
          mul(sym("C1"), fn("exp", mul(num(a), sym("x")))),
          num(b / a)
        )));
      }
    }

    // Case 5: y' = g(y) separable → ∫ dy/g(y) = x + C1
    if (!hasSymbol(rhs, "x") && hasSymbol(rhs, "y")) {
      const reciprocal = simplify(div(ONE, rhs));
      const lhsInt = integrate(substitute(reciprocal, "y", sym("u")), "u");
      return eq(substitute(lhsInt, "u", sym("y")), add(sym("x"), sym("C1")));
    }

    return fn("dsolve", e);
  }

  // y'' = rhs
  if (lhs.tag === "sym" && lhs.name === "y''") {
    // Case 4: y'' + a*y' + b*y = 0
    // Rewrite as: y'' = -a*y' - b*y → rhs should be linear in y, y'
    // Characteristic equation: r^2 + a*r + b = 0
    if (!hasSymbol(rhs, "x")) {
      const aCoeff = extractCoeff(rhs, "y'");
      const bCoeff = extractCoeff(rhs, "y");
      if (aCoeff !== null && bCoeff !== null) {
        // r^2 - a*r - b = 0 → r^2 + (-a)*r + (-b) = 0
        const A = 1, B = -aCoeff, C = -bCoeff;
        const disc = B * B - 4 * A * C;
        if (disc > 0) {
          const r1 = (-B + Math.sqrt(disc)) / 2;
          const r2 = (-B - Math.sqrt(disc)) / 2;
          return eq(sym("y"), add(
            mul(sym("C1"), fn("exp", mul(num(r1), sym("x")))),
            mul(sym("C2"), fn("exp", mul(num(r2), sym("x"))))
          ));
        }
        if (Math.abs(disc) < 1e-10) {
          const r = -B / 2;
          return eq(sym("y"), mul(add(sym("C1"), mul(sym("C2"), sym("x"))), fn("exp", mul(num(r), sym("x")))));
        }
        // Complex roots: alpha ± beta*i
        const alpha = -B / 2;
        const beta = Math.sqrt(-disc) / 2;
        return eq(sym("y"), mul(fn("exp", mul(num(alpha), sym("x"))),
          add(
            mul(sym("C1"), fn("cos", mul(num(beta), sym("x")))),
            mul(sym("C2"), fn("sin", mul(num(beta), sym("x"))))
          )));
      }
    }

    // y'' = f(x) → integrate twice
    if (!hasSymbol(rhs, "y") && !hasSymbol(rhs, "y'")) {
      const first = integrate(rhs, "x");
      const second = integrate(first, "x");
      return eq(sym("y"), simplify(add(second, mul(sym("C1"), sym("x")), sym("C2"))));
    }

    return fn("dsolve", e);
  }

  return fn("dsolve", e);
}

function matchLinearInVar(e: Expr, v: string): { a: number; b: number } | null {
  e = expand(e);
  if (!hasSymbol(e, v)) {
    if (e.tag === "num") return { a: 0, b: e.val };
    return null;
  }
  if (isSym(e, v)) return { a: 1, b: 0 };
  if (e.tag === "mul") {
    const nums = e.factors.filter(f => f.tag === "num");
    const syms = e.factors.filter(f => isSym(f, v));
    if (syms.length === 1 && nums.length === e.factors.length - 1) {
      let coeff = 1;
      for (const n of nums) coeff *= (n as any).val;
      return { a: coeff, b: 0 };
    }
    return null;
  }
  if (e.tag === "add") {
    let a = 0, b = 0;
    for (const t of e.terms) {
      const r = matchLinearInVar(t, v);
      if (!r) return null;
      a += r.a;
      b += r.b;
    }
    return { a, b };
  }
  return null;
}

function extractCoeff(e: Expr, varName: string): number | null {
  e = expand(e);
  if (isSym(e, varName)) return 1;
  if (e.tag === "mul") {
    const nums = e.factors.filter(f => f.tag === "num");
    const syms = e.factors.filter(f => isSym(f, varName));
    if (syms.length === 1 && nums.length === e.factors.length - 1) {
      let coeff = 1;
      for (const n of nums) coeff *= (n as any).val;
      return coeff;
    }
  }
  if (e.tag === "add") {
    for (const t of e.terms) {
      if (!hasSymbol(t, varName)) continue; // skip terms without the variable
      const c = extractCoeff(t, varName);
      if (c !== null) return c;
    }
    return 0; // variable not found in any term
  }
  return e.tag === "num" || !hasSymbol(e, varName) ? 0 : null;
}

// ═══════════════════════════════════════════════════════════
// TAYLOR — series expansion
// ═══════════════════════════════════════════════════════════

export function taylor(e: Expr, v: string, x0: Expr, n: number): Expr {
  let terms: Expr[] = [];
  let current = e;
  let factorial = 1;
  const x0val = x0.tag === "num" ? x0.val : 0;

  for (let k = 0; k <= n; k++) {
    if (k > 0) factorial *= k;
    // Evaluate coefficient at x0
    const atX0 = substitute(current, v, x0);
    const coeff = simplify(atX0);
    // Term: coeff/k! * (x - x0)^k
    if (!isNum(coeff, 0)) {
      const c = coeff.tag === "num" ? num(coeff.val / factorial) : div(coeff, num(factorial));
      if (k === 0) terms.push(simplify(c));
      else if (x0val === 0) terms.push(simplify(mul(c, pow(sym(v), num(k)))));
      else terms.push(simplify(mul(c, pow(sub(sym(v), x0), num(k)))));
    }
    current = diff(current, v);
  }
  if (terms.length === 0) return ZERO;
  if (terms.length === 1) return terms[0];
  return simplify(add(...terms));
}

// ═══════════════════════════════════════════════════════════
// FACTOR — polynomial factoring (integer roots)
// ═══════════════════════════════════════════════════════════

export function factor(e: Expr, v: string): Expr {
  const coeffs = polyCoeffs(e, v);
  if (!coeffs || coeffs.length < 2) return e;

  const roots = rationalRoots(coeffs);
  if (roots.length === 0) return e;

  let factors: Expr[] = [];
  let remaining = coeffs.slice();

  for (const r of roots) {
    // Divide polynomial by (x - r)
    const newCoeffs: number[] = [];
    let carry = 0;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const c = remaining[i] + carry;
      if (i > 0) { newCoeffs.unshift(c); carry = c * r; }
    }
    remaining = newCoeffs;
    if (r === 0) factors.push(sym(v));
    else if (r > 0) factors.push(sub(sym(v), num(r)));
    else factors.push(add(sym(v), num(-r)));
  }

  // Remaining polynomial
  if (remaining.length > 1 || (remaining.length === 1 && remaining[0] !== 1)) {
    let rest = ZERO as Expr;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] !== 0) {
        if (i === 0) rest = add(rest, num(remaining[i]));
        else rest = add(rest, mul(num(remaining[i]), pow(sym(v), num(i))));
      }
    }
    factors.push(simplify(rest));
  }

  // Leading coefficient
  const lc = coeffs[coeffs.length - 1];
  if (lc !== 1) factors.unshift(num(lc));

  if (factors.length === 1) return factors[0];
  return mul(...factors);
}

// ═══════════════════════════════════════════════════════════
// NUMERIC EVALUATION
// ═══════════════════════════════════════════════════════════

export function evalNum(e: Expr, vars: Map<string, number> = new Map()): number {
  if (e.tag === "num") return e.val;
  if (e.tag === "sym") {
    const v = vars.get(e.name);
    if (v !== undefined) return v;
    throw new Error(`Undefined variable: ${e.name}`);
  }
  if (e.tag === "add") return e.terms.reduce((s, t) => s + evalNum(t, vars), 0);
  if (e.tag === "mul") return e.factors.reduce((p, f) => p * evalNum(f, vars), 1);
  if (e.tag === "pow") return Math.pow(evalNum(e.base, vars), evalNum(e.exp, vars));
  if (e.tag === "fn") {
    const args = e.args.map(a => evalNum(a, vars));
    const fns: Record<string, (...a: number[]) => number> = {
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
      asin: Math.asin, acos: Math.acos, atan: Math.atan,
      exp: Math.exp, ln: Math.log, log: Math.log,
      sqrt: Math.sqrt, abs: Math.abs,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    };
    if (fns[e.name]) return fns[e.name](...args);
    throw new Error(`Unknown function: ${e.name}`);
  }
  throw new Error(`Cannot evaluate: ${e.tag}`);
}

// ═══════════════════════════════════════════════════════════
// EXPORT ALL
// ═══════════════════════════════════════════════════════════

export { substitute, hasSymbol, exprEqual };

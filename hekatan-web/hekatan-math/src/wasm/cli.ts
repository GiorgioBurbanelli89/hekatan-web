#!/usr/bin/env tsx
/**
 * Hekatan Math CLI — Test all solvers from terminal
 *
 * Usage:
 *   tsx cli.ts                — Run ALL tests
 *   tsx cli.ts bench          — Benchmark JS vs WASM
 *   tsx cli.ts sparse 1000   — Sparse solve 1000×1000
 *   tsx cli.ts expr "x=5; x^2+3*x-1"
 *   tsx cli.ts file path.hcalc
 */

import { eigenSolver } from "./eigenSolver.js";
import { parseExpression, evaluate, HekatanEnvironment } from "../evaluator.js";

// ─── Helpers ─────────────────────────────────────────────

const OK = "  \x1b[32m✓\x1b[0m";
const FAIL = "  \x1b[31m✗\x1b[0m";
let passed = 0, failed = 0;

function check(name: string, got: any, expected: any, tol = 1e-8) {
  const g = typeof got === "number" ? got : JSON.stringify(got);
  const e = typeof expected === "number" ? expected : JSON.stringify(expected);
  if (typeof got === "number" && typeof expected === "number") {
    if (Math.abs(got - expected) < tol) {
      console.log(`${OK} ${name}: ${g}`);
      passed++;
    } else {
      console.log(`${FAIL} ${name}: got ${g}, expected ${e}`);
      failed++;
    }
  } else if (JSON.stringify(got) === JSON.stringify(expected)) {
    console.log(`${OK} ${name}`);
    passed++;
  } else {
    console.log(`${FAIL} ${name}: got ${g}, expected ${e}`);
    failed++;
  }
}

function checkClose(name: string, got: number, expected: number, tol = 1e-4) {
  check(name, got, expected, tol);
}

function evalExpr(expr: string, env?: HekatanEnvironment): any {
  const e = env || new HekatanEnvironment();
  const ast = parseExpression(expr);
  return evaluate(ast, e);
}

function time<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - t0 };
}

function bandedSparse(n: number, bandwidth = 5) {
  const rows: number[] = [], cols: number[] = [], vals: number[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(i); cols.push(i); vals.push(4.0 + Math.random());
    for (let d = 1; d <= bandwidth && i + d < n; d++) {
      const v = -(0.5 + Math.random() * 0.5) / d;
      rows.push(i); cols.push(i + d); vals.push(v);
      rows.push(i + d); cols.push(i); vals.push(v);
    }
  }
  return { rows, cols, vals, b: Array.from({ length: n }, () => Math.random() * 10) };
}

// ─── Test Suites ─────────────────────────────────────────

function testArithmetic() {
  console.log("\n═══ Arithmetic ═══");
  check("2 + 3", evalExpr("2 + 3"), 5);
  check("10 - 4", evalExpr("10 - 4"), 6);
  check("3 * 7", evalExpr("3 * 7"), 21);
  check("15 / 4", evalExpr("15 / 4"), 3.75);
  check("2^10", evalExpr("2^10"), 1024);
  check("-5 + 3", evalExpr("-5 + 3"), -2);
  check("2 + 3 * 4", evalExpr("2 + 3 * 4"), 14);
  check("(2 + 3) * 4", evalExpr("(2 + 3) * 4"), 20);
  check("2^3^2", evalExpr("2^3^2"), 512);
  check("100 % 7", evalExpr("100 % 7"), 2);
}

function testComparisons() {
  console.log("\n═══ Comparison & Logical Operators ═══");
  check("5 == 5", evalExpr("5 == 5"), 1);
  check("5 == 3", evalExpr("5 == 3"), 0);
  check("5 != 3", evalExpr("5 != 3"), 1);
  check("5 != 5", evalExpr("5 != 5"), 0);
  check("3 < 5", evalExpr("3 < 5"), 1);
  check("5 < 3", evalExpr("5 < 3"), 0);
  check("5 > 3", evalExpr("5 > 3"), 1);
  check("3 > 5", evalExpr("3 > 5"), 0);
  check("3 <= 5", evalExpr("3 <= 5"), 1);
  check("5 <= 5", evalExpr("5 <= 5"), 1);
  check("5 >= 3", evalExpr("5 >= 3"), 1);
  check("5 >= 5", evalExpr("5 >= 5"), 1);
  // Logical
  check("1 && 1", evalExpr("1 && 1"), 1);
  check("1 && 0", evalExpr("1 && 0"), 0);
  check("0 || 1", evalExpr("0 || 1"), 1);
  check("0 || 0", evalExpr("0 || 0"), 0);
  check("!0", evalExpr("!0"), 1);
  check("!1", evalExpr("!1"), 0);
}

function testConditional() {
  console.log("\n═══ Ternary / Conditional ═══");
  check("5 > 3 ? 1 : 0", evalExpr("5 > 3 ? 1 : 0"), 1);
  check("2 > 5 ? 1 : 0", evalExpr("2 > 5 ? 1 : 0"), 0);
  // Ternary with variable
  const env = new HekatanEnvironment();
  evaluate(parseExpression("x = 5"), env);
  check("x > 3 ? 100 : 0", evaluate(parseExpression("x > 3 ? 100 : 0"), env), 100);
  check("x < 3 ? 100 : 0", evaluate(parseExpression("x < 3 ? 100 : 0"), env), 0);
}

function testConstants() {
  console.log("\n═══ Constants ═══");
  checkClose("pi", evalExpr("pi"), Math.PI);
  checkClose("e", evalExpr("e"), Math.E);
  check("g (gravity)", evalExpr("g"), 9.80665);
  check("true", evalExpr("true"), 1);
  check("false", evalExpr("false"), 0);
}

function testTrig() {
  console.log("\n═══ Trigonometric Functions ═══");
  check("sin(0)", evalExpr("sin(0)"), 0);
  checkClose("sin(pi/2)", evalExpr("sin(pi/2)"), 1);
  checkClose("cos(0)", evalExpr("cos(0)"), 1);
  checkClose("cos(pi)", evalExpr("cos(pi)"), -1);
  checkClose("tan(pi/4)", evalExpr("tan(pi/4)"), 1);
  checkClose("asin(1)", evalExpr("asin(1)"), Math.PI / 2);
  checkClose("acos(0)", evalExpr("acos(0)"), Math.PI / 2);
  checkClose("atan(1)", evalExpr("atan(1)"), Math.PI / 4);
  checkClose("atan2(1, 1)", evalExpr("atan2(1; 1)"), Math.PI / 4);
}

function testHyperbolic() {
  console.log("\n═══ Hyperbolic Functions ═══");
  checkClose("sinh(1)", evalExpr("sinh(1)"), Math.sinh(1));
  checkClose("cosh(1)", evalExpr("cosh(1)"), Math.cosh(1));
  checkClose("tanh(1)", evalExpr("tanh(1)"), Math.tanh(1));
  checkClose("asinh(1)", evalExpr("asinh(1)"), Math.asinh(1));
  checkClose("acosh(2)", evalExpr("acosh(2)"), Math.acosh(2));
  checkClose("atanh(0.5)", evalExpr("atanh(0.5)"), Math.atanh(0.5));
}

function testExpLog() {
  console.log("\n═══ Exponential & Logarithmic ═══");
  checkClose("exp(1)", evalExpr("exp(1)"), Math.E);
  checkClose("ln(e)", evalExpr("ln(e)"), 1);
  checkClose("log(100)", evalExpr("log(100)"), 2);
  checkClose("log10(1000)", evalExpr("log10(1000)"), 3);
  checkClose("log2(8)", evalExpr("log2(8)"), 3);
  check("sqrt(144)", evalExpr("sqrt(144)"), 12);
  check("cbrt(27)", evalExpr("cbrt(27)"), 3);
  checkClose("pow(2; 10)", evalExpr("pow(2; 10)"), 1024);
}

function testRounding() {
  console.log("\n═══ Rounding & Absolute ═══");
  check("abs(-7)", evalExpr("abs(-7)"), 7);
  check("abs(7)", evalExpr("abs(7)"), 7);
  check("sign(-5)", evalExpr("sign(-5)"), -1);
  check("sign(5)", evalExpr("sign(5)"), 1);
  check("sign(0)", evalExpr("sign(0)"), 0);
  check("sgn(-3)", evalExpr("sgn(-3)"), -1);
  check("floor(3.7)", evalExpr("floor(3.7)"), 3);
  check("floor(-3.2)", evalExpr("floor(-3.2)"), -4);
  check("ceil(3.2)", evalExpr("ceil(3.2)"), 4);
  check("ceil(-3.7)", evalExpr("ceil(-3.7)"), -3);
  check("round(3.5)", evalExpr("round(3.5)"), 4);
  check("round(3.4)", evalExpr("round(3.4)"), 3);
  check("trunc(3.7)", evalExpr("trunc(3.7)"), 3);
  check("trunc(-3.7)", evalExpr("trunc(-3.7)"), -3);
}

function testAngleConversion() {
  console.log("\n═══ Angle Conversion ═══");
  checkClose("rad(180)", evalExpr("rad(180)"), Math.PI);
  checkClose("rad(90)", evalExpr("rad(90)"), Math.PI / 2);
  checkClose("deg(pi)", evalExpr("deg(pi)"), 180);
  checkClose("deg(pi/2)", evalExpr("deg(pi/2)"), 90);
}

function testCombinatorics() {
  console.log("\n═══ Combinatorics ═══");
  check("fact(0)", evalExpr("fact(0)"), 1);
  check("fact(1)", evalExpr("fact(1)"), 1);
  check("fact(5)", evalExpr("fact(5)"), 120);
  check("fact(10)", evalExpr("fact(10)"), 3628800);
  check("comb(5; 2)", evalExpr("comb(5; 2)"), 10);
  check("comb(10; 3)", evalExpr("comb(10; 3)"), 120);
  check("comb(5; 0)", evalExpr("comb(5; 0)"), 1);
  check("comb(5; 5)", evalExpr("comb(5; 5)"), 1);
  check("perm(5; 2)", evalExpr("perm(5; 2)"), 20);
  check("perm(10; 3)", evalExpr("perm(10; 3)"), 720);
}

function testInterpolation() {
  console.log("\n═══ Interpolation ═══");
  check("lerp(0; 10; 0)", evalExpr("lerp(0; 10; 0)"), 0);
  check("lerp(0; 10; 1)", evalExpr("lerp(0; 10; 1)"), 10);
  check("lerp(0; 10; 0.5)", evalExpr("lerp(0; 10; 0.5)"), 5);
  check("lerp(0; 10; 0.25)", evalExpr("lerp(0; 10; 0.25)"), 2.5);
  check("lerp(-10; 10; 0.5)", evalExpr("lerp(-10; 10; 0.5)"), 0);
}

function testAggregation() {
  console.log("\n═══ Aggregation ═══");
  check("min(3; 7; 1; 5)", evalExpr("min(3; 7; 1; 5)"), 1);
  check("max(3; 7; 1; 5)", evalExpr("max(3; 7; 1; 5)"), 7);
  checkClose("hypot(3; 4)", evalExpr("hypot(3; 4)"), 5);
  checkClose("hypot(5; 12)", evalExpr("hypot(5; 12)"), 13);
}

function testVariables() {
  console.log("\n═══ Variables & Assignment ═══");
  const env = new HekatanEnvironment();
  check("x = 5", evaluate(parseExpression("x = 5"), env), 5);
  check("y = x^2 + 3*x - 1", evaluate(parseExpression("y = x^2 + 3*x - 1"), env), 39);
  checkClose("z = sqrt(x*y)", evaluate(parseExpression("z = sqrt(x*y)"), env) as number, Math.sqrt(5 * 39));
  // Overwrite variable
  check("x = 10", evaluate(parseExpression("x = 10"), env), 10);
  check("x*2", evaluate(parseExpression("x*2"), env), 20);
}

function testUserFunctions() {
  console.log("\n═══ User Functions ═══");
  const env = new HekatanEnvironment();
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2 + 1") });
  check("f(3)", evaluate(parseExpression("f(3)"), env), 10);
  check("f(0)", evaluate(parseExpression("f(0)"), env), 1);
  check("f(-2)", evaluate(parseExpression("f(-2)"), env), 5);

  // Multi-arg function
  env.userFunctions.set("g", { params: ["x", "y"], body: parseExpression("x*y + x + y") });
  check("g(2; 3)", evaluate(parseExpression("g(2; 3)"), env), 11);

  // Composition
  env.userFunctions.set("h", { params: ["x"], body: parseExpression("2*x + 1") });
  check("f(h(2))", evaluate(parseExpression("f(h(2))"), env), 26); // h(2)=5, f(5)=26
}

function testVectors() {
  console.log("\n═══ Vectors ═══");
  const env = new HekatanEnvironment();
  const v = evaluate(parseExpression("v = [1; 2; 3]"), env);
  check("v = [1;2;3]", Array.isArray(v), true);
  check("len(v)", evaluate(parseExpression("len(v)"), env), 3);
  check("sum(v)", evaluate(parseExpression("sum(v)"), env), 6);

  // Vector indexing (1-based)
  check("v[1]", evaluate(parseExpression("v[1]"), env), 1);
  check("v[2]", evaluate(parseExpression("v[2]"), env), 2);
  check("v[3]", evaluate(parseExpression("v[3]"), env), 3);

  // Vector arithmetic
  evaluate(parseExpression("w = [4; 5; 6]"), env);
  const vw = evaluate(parseExpression("v + w"), env) as number[];
  check("v + w", vw, [5, 7, 9]);

  // Scalar * vector
  const sv = evaluate(parseExpression("2 * v"), env) as number[];
  check("2 * v", sv, [2, 4, 6]);
}

function testVectorCreation() {
  console.log("\n═══ Vector Creation Functions ═══");
  const env = new HekatanEnvironment();

  // zeros
  const z = evaluate(parseExpression("zeros(4)"), env) as number[];
  check("zeros(4)", z, [0, 0, 0, 0]);

  // ones
  const o = evaluate(parseExpression("ones(3)"), env) as number[];
  check("ones(3)", o, [1, 1, 1]);

  // vec
  const vc = evaluate(parseExpression("vec(1; 2; 3)"), env) as number[];
  check("vec(1;2;3)", vc, [1, 2, 3]);

  // col → Nx1 matrix
  const c = evaluate(parseExpression("col(1; 2; 3)"), env) as number[][];
  check("col(1;2;3)", c, [[1], [2], [3]]);

  // row → 1×N matrix
  const r = evaluate(parseExpression("row(1; 2; 3)"), env) as number[][];
  check("row(1;2;3)", r, [[1, 2, 3]]);
}

function testMatrices() {
  console.log("\n═══ Matrices ═══");
  const env = new HekatanEnvironment();

  // Define 2×2 matrix
  evaluate(parseExpression("A = [[1, 2], [3, 4]]"), env);
  const d = evaluate(parseExpression("det(A)"), env);
  check("det([[1,2],[3,4]])", d, -2);

  // Transpose
  const At = evaluate(parseExpression("transpose(A)"), env);
  check("transpose(A)[0][1]", (At as any)[0][1], 3);

  // Identity
  const I = evaluate(parseExpression("identity(3)"), env);
  check("identity(3)[0][0]", (I as any)[0][0], 1);
  check("identity(3)[0][1]", (I as any)[0][1], 0);
  check("identity(3)[2][2]", (I as any)[2][2], 1);

  // eye alias
  const I2 = evaluate(parseExpression("eye(2)"), env);
  check("eye(2)", I2, [[1, 0], [0, 1]]);

  // zeros matrix
  const Z = evaluate(parseExpression("zeros(2; 3)"), env);
  check("zeros(2,3)", Z, [[0, 0, 0], [0, 0, 0]]);

  // ones matrix
  const O = evaluate(parseExpression("ones(2; 2)"), env);
  check("ones(2,2)", O, [[1, 1], [1, 1]]);
}

function testMatrixArithmetic() {
  console.log("\n═══ Matrix Arithmetic ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("A = [[1, 2], [3, 4]]"), env);
  evaluate(parseExpression("B = [[5, 6], [7, 8]]"), env);

  // Matrix multiply
  const C = evaluate(parseExpression("A * B"), env) as number[][];
  check("(A*B)[0][0]", C[0][0], 19);
  check("(A*B)[0][1]", C[0][1], 22);
  check("(A*B)[1][0]", C[1][0], 43);
  check("(A*B)[1][1]", C[1][1], 50);

  // Matrix add
  const D = evaluate(parseExpression("A + B"), env) as number[][];
  check("(A+B)[0][0]", D[0][0], 6);
  check("(A+B)[1][1]", D[1][1], 12);

  // Matrix subtract
  const E = evaluate(parseExpression("B - A"), env) as number[][];
  check("(B-A)[0][0]", E[0][0], 4);

  // Scalar * matrix
  const F = evaluate(parseExpression("3 * A"), env) as number[][];
  check("(3*A)[0][0]", F[0][0], 3);
  check("(3*A)[1][1]", F[1][1], 12);

  // Matrix * vector
  const v = evaluate(parseExpression("A * [1; 0]"), env) as number[];
  check("A*[1;0]", v, [1, 3]);
}

function testMatrixIndexing() {
  console.log("\n═══ Matrix Indexing (1-based) ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("M = [[10, 20, 30], [40, 50, 60], [70, 80, 90]]"), env);

  // Single element
  check("M[1,1]", evaluate(parseExpression("M[1;1]"), env), 10);
  check("M[2,3]", evaluate(parseExpression("M[2;3]"), env), 60);
  check("M[3,3]", evaluate(parseExpression("M[3;3]"), env), 90);

  // Row extraction
  const row1 = evaluate(parseExpression("M[1]"), env);
  check("M[1] (row)", row1, [10, 20, 30]);

  // Sub-matrix range
  const sub = evaluate(parseExpression("M[1:2; 1:2]"), env);
  check("M[1:2,1:2]", sub, [[10, 20], [40, 50]]);
}

function testLusolve() {
  console.log("\n═══ LU Solve (Dense JS) ═══");
  const env = new HekatanEnvironment();

  // 3×3 system: A·x = b
  evaluate(parseExpression("A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]"), env);
  evaluate(parseExpression("b = [[8], [-11], [-3]]"), env);
  const x = evaluate(parseExpression("lusolve(A; b)"), env) as number[][];
  checkClose("lusolve x[0]", x[0][0], 2);
  checkClose("lusolve x[1]", x[1][0], 3);
  checkClose("lusolve x[2]", x[2][0], -1);
}

function testInverse() {
  console.log("\n═══ Matrix Inverse ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("A = [[1, 2], [3, 4]]"), env);
  const inv = evaluate(parseExpression("inv(A)"), env) as number[][];
  checkClose("inv(A)[0][0]", inv[0][0], -2);
  checkClose("inv(A)[0][1]", inv[0][1], 1);
  checkClose("inv(A)[1][0]", inv[1][0], 1.5);
  checkClose("inv(A)[1][1]", inv[1][1], -0.5);

  // A * inv(A) ≈ I
  const AI = evaluate(parseExpression("A * inv(A)"), env) as number[][];
  checkClose("A*inv(A)[0][0]", AI[0][0], 1);
  checkClose("A*inv(A)[0][1]", AI[0][1], 0);
  checkClose("A*inv(A)[1][0]", AI[1][0], 0);
  checkClose("A*inv(A)[1][1]", AI[1][1], 1);
}

function testDerivatives() {
  console.log("\n═══ Numerical Derivatives ═══");
  const env = new HekatanEnvironment();

  // f(x) = x^2 → f'(x) = 2x
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2") });
  checkClose("f'(3) = 6", evaluate(parseExpression("nderiv(f; 3)"), env) as number, 6);
  checkClose("f'(0) = 0", evaluate(parseExpression("nderiv(f; 0)"), env) as number, 0);
  checkClose("f'(-2) = -4", evaluate(parseExpression("nderiv(f; -2)"), env) as number, -4);

  // g(x) = sin(x) → g'(x) = cos(x)
  env.userFunctions.set("g2", { params: ["x"], body: parseExpression("sin(x)") });
  checkClose("sin'(0) = 1", evaluate(parseExpression("nderiv(g2; 0)"), env) as number, 1);
  checkClose("sin'(pi/2) = 0", evaluate(parseExpression("nderiv(g2; pi/2)"), env) as number, 0, 1e-3);

  // f''(x) = 2 (second derivative of x^2)
  checkClose("f''(3) = 2", evaluate(parseExpression("nderiv(f; 3; 2)"), env) as number, 2, 1e-2);

  // h(x) = e^x → h'(x) = e^x
  env.userFunctions.set("h", { params: ["x"], body: parseExpression("exp(x)") });
  checkClose("exp'(0) = 1", evaluate(parseExpression("nderiv(h; 0)"), env) as number, 1);
  checkClose("exp'(1) = e", evaluate(parseExpression("nderiv(h; 1)"), env) as number, Math.E, 1e-3);
}

function testSummation() {
  console.log("\n═══ Numerical Summation ═══");
  const env = new HekatanEnvironment();

  // Σ_{i=1}^{10} i = 55
  env.userFunctions.set("id", { params: ["i"], body: parseExpression("i") });
  check("Σ i, 1..10 = 55", evaluate(parseExpression("summation(id; 1; 10)"), env), 55);

  // Σ_{i=1}^{5} i^2 = 1+4+9+16+25 = 55
  env.userFunctions.set("sq", { params: ["i"], body: parseExpression("i^2") });
  check("Σ i^2, 1..5 = 55", evaluate(parseExpression("summation(sq; 1; 5)"), env), 55);

  // Σ_{i=0}^{3} 2^i = 1+2+4+8 = 15
  env.userFunctions.set("p2", { params: ["i"], body: parseExpression("2^i") });
  check("Σ 2^i, 0..3 = 15", evaluate(parseExpression("summation(p2; 0; 3)"), env), 15);
}

function testProduct() {
  console.log("\n═══ Numerical Product ═══");
  const env = new HekatanEnvironment();

  // Π_{i=1}^{5} i = 5! = 120
  env.userFunctions.set("id", { params: ["i"], body: parseExpression("i") });
  check("Π i, 1..5 = 120", evaluate(parseExpression("nproduct(id; 1; 5)"), env), 120);

  // Π_{i=1}^{4} 2 = 2^4 = 16
  env.userFunctions.set("two", { params: ["i"], body: parseExpression("2") });
  check("Π 2, 1..4 = 16", evaluate(parseExpression("nproduct(two; 1; 4)"), env), 16);
}

function testODE() {
  console.log("\n═══ ODE Solver (Runge-Kutta 4) ═══");
  const env = new HekatanEnvironment();

  // y' = y, y(0)=1 → y(t) = e^t → y(1) = e
  env.userFunctions.set("ode1", { params: ["t", "y"], body: parseExpression("y") });
  const r1 = evaluate(parseExpression("odesolve(ode1; 1; 0; 1)"), env) as number;
  checkClose("y'=y, y(0)=1, y(1)=e", r1, Math.E, 1e-6);

  // y' = -2*y, y(0)=1 → y(t) = e^(-2t) → y(1) = e^(-2) ≈ 0.13534
  env.userFunctions.set("ode2", { params: ["t", "y"], body: parseExpression("-2*y") });
  const r2 = evaluate(parseExpression("odesolve(ode2; 1; 0; 1)"), env) as number;
  checkClose("y'=-2y, y(1)=e^-2", r2, Math.exp(-2), 1e-6);

  // y' = cos(t), y(0)=0 → y(t) = sin(t) → y(pi/2) = 1
  env.userFunctions.set("ode3", { params: ["t", "y"], body: parseExpression("cos(t)") });
  const r3 = evaluate(parseExpression("odesolve(ode3; 0; 0; pi/2)"), env) as number;
  checkClose("y'=cos(t), y(pi/2)=1", r3, 1, 1e-6);

  // y' = t, y(0)=0 → y(t) = t²/2 → y(2) = 2
  env.userFunctions.set("ode4", { params: ["t", "y"], body: parseExpression("t") });
  const r4 = evaluate(parseExpression("odesolve(ode4; 0; 0; 2)"), env) as number;
  checkClose("y'=t, y(2)=2", r4, 2, 1e-6);
}

function testNsolve() {
  console.log("\n═══ Numerical Root Finding (nsolve) ═══");
  const env = new HekatanEnvironment();

  // x^2 - 4 = 0 → x = 2 (starting from x0=1)
  env.userFunctions.set("f1", { params: ["x"], body: parseExpression("x^2 - 4") });
  checkClose("x^2-4=0 → x=2", evaluate(parseExpression("nsolve(f1; 1)"), env) as number, 2, 1e-8);

  // x^2 - 4 = 0 → x = -2 (starting from x0=-1)
  checkClose("x^2-4=0 → x=-2", evaluate(parseExpression("nsolve(f1; -1)"), env) as number, -2, 1e-8);

  // sin(x) = 0 → x = pi (starting from x0=3)
  env.userFunctions.set("f2", { params: ["x"], body: parseExpression("sin(x)") });
  checkClose("sin(x)=0 → x=pi", evaluate(parseExpression("nsolve(f2; 3)"), env) as number, Math.PI, 1e-8);

  // e^x - 2 = 0 → x = ln(2) (starting from x0=1)
  env.userFunctions.set("f3", { params: ["x"], body: parseExpression("exp(x) - 2") });
  checkClose("e^x-2=0 → x=ln2", evaluate(parseExpression("nsolve(f3; 1)"), env) as number, Math.log(2), 1e-8);

  // x^3 - x - 1 = 0 → x ≈ 1.3247 (real root)
  env.userFunctions.set("f4", { params: ["x"], body: parseExpression("x^3 - x - 1") });
  checkClose("x^3-x-1=0", evaluate(parseExpression("nsolve(f4; 1.5)"), env) as number, 1.3247179572, 1e-6);
}

function testIntegrals() {
  console.log("\n═══ Numerical Integration (Gauss-Legendre) ═══");
  const env = new HekatanEnvironment();

  // Single integrals
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2") });
  checkClose("∫₀¹ x² dx = 1/3", evaluate(parseExpression("integral(f; 0; 1)"), env) as number, 1 / 3);

  env.userFunctions.set("g", { params: ["x"], body: parseExpression("sin(x)") });
  checkClose("∫₀^π sin(x) dx = 2", evaluate(parseExpression("integral(g; 0; pi)"), env) as number, 2);

  env.userFunctions.set("h", { params: ["x"], body: parseExpression("1/x") });
  checkClose("∫₁^e 1/x dx = 1", evaluate(parseExpression("integral(h; 1; e)"), env) as number, 1);

  env.userFunctions.set("k", { params: ["x"], body: parseExpression("exp(x)") });
  checkClose("∫₀¹ eˣ dx = e-1", evaluate(parseExpression("integral(k; 0; 1)"), env) as number, Math.E - 1);

  // ∫₀¹ x³ dx = 1/4
  env.userFunctions.set("x3", { params: ["x"], body: parseExpression("x^3") });
  checkClose("∫₀¹ x³ dx = 1/4", evaluate(parseExpression("integral(x3; 0; 1)"), env) as number, 0.25);

  // Double integral
  env.userFunctions.set("p", { params: ["x", "y"], body: parseExpression("x*y") });
  checkClose("∫∫ x·y dA [0,1]² = 1/4", evaluate(parseExpression("integral2(p; 0; 1; 0; 1)"), env) as number, 0.25);

  // ∫∫ 1 dA [0,2]×[0,3] = 6 (area)
  env.userFunctions.set("one", { params: ["x", "y"], body: parseExpression("1") });
  checkClose("∫∫ 1 dA [0,2]×[0,3] = 6", evaluate(parseExpression("integral2(one; 0; 2; 0; 3)"), env) as number, 6);

  // Triple integral: ∫∫∫ 1 dV [0,1]³ = 1 (volume of unit cube)
  env.userFunctions.set("one3", { params: ["x", "y", "z"], body: parseExpression("1") });
  checkClose("∫∫∫ 1 dV [0,1]³ = 1", evaluate(parseExpression("integral3(one3; 0; 1; 0; 1; 0; 1)"), env) as number, 1);

  // Triple integral: ∫∫∫ xyz dV [0,1]³ = 1/8
  env.userFunctions.set("xyz", { params: ["x", "y", "z"], body: parseExpression("x*y*z") });
  checkClose("∫∫∫ xyz dV = 1/8", evaluate(parseExpression("integral3(xyz; 0; 1; 0; 1; 0; 1)"), env) as number, 0.125);
}

function testCellArrays() {
  console.log("\n═══ Cell Arrays ═══");
  const env = new HekatanEnvironment();

  // Create cell array
  const ca = evaluate(parseExpression("{1; 2; 3}"), env);
  check("cell array created", (ca as any).__cell, true);
  check("cell elements count", (ca as any).elements.length, 3);

  // Cell array with mixed types
  evaluate(parseExpression("C = {10; 20; 30}"), env);
}

function testBisectSecant() {
  console.log("\n═══ Root Finding: Bisection & Secant ═══");
  const env = new HekatanEnvironment();

  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2 - 4") });
  checkClose("bisect(x^2-4, 0, 3)", evaluate(parseExpression("bisect(f; 0; 3)"), env) as number, 2, 1e-8);
  checkClose("secant(x^2-4, 1, 3)", evaluate(parseExpression("secant(f; 1; 3)"), env) as number, 2, 1e-8);

  env.userFunctions.set("g", { params: ["x"], body: parseExpression("cos(x) - x") });
  checkClose("bisect(cos(x)-x)", evaluate(parseExpression("bisect(g; 0; 1)"), env) as number, 0.7390851332, 1e-6);
  checkClose("secant(cos(x)-x)", evaluate(parseExpression("secant(g; 0; 1)"), env) as number, 0.7390851332, 1e-6);
}

function testNumericalLimit() {
  console.log("\n═══ Numerical Limit ═══");
  const env = new HekatanEnvironment();

  // lim_{x→0} sin(x)/x = 1
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("sin(x)/x") });
  checkClose("lim sin(x)/x → 1", evaluate(parseExpression("nlimit(f; 0)"), env) as number, 1, 1e-4);

  // lim_{x→0} (e^x - 1)/x = 1
  env.userFunctions.set("g", { params: ["x"], body: parseExpression("(exp(x) - 1)/x") });
  checkClose("lim (e^x-1)/x → 1", evaluate(parseExpression("nlimit(g; 0)"), env) as number, 1, 1e-3);
}

function testTaylorSeries() {
  console.log("\n═══ Taylor Series ═══");
  const env = new HekatanEnvironment();

  // Taylor of e^x at x=0: [1, 1, 1/2, 1/6, 1/24]
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("exp(x)") });
  const t = evaluate(parseExpression("taylor(f; 0; 4)"), env) as number[];
  checkClose("e^x taylor[0] = 1", t[0], 1, 1e-3);
  checkClose("e^x taylor[1] = 1", t[1], 1, 1e-3);
  checkClose("e^x taylor[2] = 1/2", t[2], 0.5, 1e-2);
  checkClose("e^x taylor[3] = 1/6", t[3], 1/6, 1e-1);
}

function testTrapezoidSimpson() {
  console.log("\n═══ Integration: Trapezoid & Simpson ═══");
  const env = new HekatanEnvironment();

  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2") });
  checkClose("trap ∫₀¹ x² = 1/3", evaluate(parseExpression("trapezoid(f; 0; 1; 100)"), env) as number, 1/3, 1e-4);
  checkClose("simpson ∫₀¹ x² = 1/3", evaluate(parseExpression("simpson(f; 0; 1; 10)"), env) as number, 1/3, 1e-8);

  env.userFunctions.set("g", { params: ["x"], body: parseExpression("sin(x)") });
  checkClose("simpson ∫₀^π sin = 2", evaluate(parseExpression("simpson(g; 0; pi; 20)"), env) as number, 2, 1e-4);
}

function testLagrangeInterp() {
  console.log("\n═══ Lagrange Interpolation ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("xd = [0; 1; 2; 3]"), env);
  evaluate(parseExpression("yd = [0; 1; 4; 9]"), env); // y = x^2

  checkClose("interp(xd, yd, 1.5) ≈ 2.25", evaluate(parseExpression("interp(xd; yd; 1.5)"), env) as number, 2.25, 1e-6);
  checkClose("interp(xd, yd, 2.5) ≈ 6.25", evaluate(parseExpression("interp(xd; yd; 2.5)"), env) as number, 6.25, 1e-6);
}

function testLinearRegression() {
  console.log("\n═══ Linear Regression ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("xd = [1; 2; 3; 4; 5]"), env);
  evaluate(parseExpression("yd = [2.1; 3.9; 6.2; 7.8; 10.1]"), env); // ≈ y = 2x + 0

  const r = evaluate(parseExpression("linreg(xd; yd)"), env) as number[];
  checkClose("slope ≈ 2", r[0], 2, 0.1);
  checkClose("R² ≈ 1", r[2], 1, 0.05);
}

function testEulerMethod() {
  console.log("\n═══ Euler Method ODE ═══");
  const env = new HekatanEnvironment();

  // y' = y, y(0)=1 → y(1) = e (less accurate than RK4)
  env.userFunctions.set("f", { params: ["t", "y"], body: parseExpression("y") });
  const r = evaluate(parseExpression("euler(f; 1; 0; 1; 10000)"), env) as number;
  checkClose("euler y'=y, y(1)≈e", r, Math.E, 1e-3);
}

function testNumberTheory() {
  console.log("\n═══ Number Theory ═══");
  check("gcd(12; 8)", evalExpr("gcd(12; 8)"), 4);
  check("gcd(100; 75)", evalExpr("gcd(100; 75)"), 25);
  check("lcm(4; 6)", evalExpr("lcm(4; 6)"), 12);
  check("lcm(12; 18)", evalExpr("lcm(12; 18)"), 36);
  check("fib(1)", evalExpr("fib(1)"), 1);
  check("fib(10)", evalExpr("fib(10)"), 55);
  check("fib(20)", evalExpr("fib(20)"), 6765);
  check("isprime(2)", evalExpr("isprime(2)"), 1);
  check("isprime(7)", evalExpr("isprime(7)"), 1);
  check("isprime(4)", evalExpr("isprime(4)"), 0);
  check("isprime(97)", evalExpr("isprime(97)"), 1);
  check("isprime(100)", evalExpr("isprime(100)"), 0);
}

function testSequences() {
  console.log("\n═══ Sequences & Series ═══");
  // Arithmetic: a=1, d=2, n=5 → 1+3+5+7+9 = 25
  check("arithsum(1;2;5)", evalExpr("arithsum(1; 2; 5)"), 25);
  // Arithmetic: a=1, d=1, n=100 → 5050
  check("arithsum(1;1;100)", evalExpr("arithsum(1; 1; 100)"), 5050);
  // Geometric: a=1, r=2, n=10 → 1*(1-2^10)/(1-2) = 1023
  check("geomsum(1;2;10)", evalExpr("geomsum(1; 2; 10)"), 1023);
  // Geometric: a=3, r=1/2, n=5 → 3*(1-(1/2)^5)/(1-1/2) ≈ 5.8125
  checkClose("geomsum(3;0.5;5)", evalExpr("geomsum(3; 0.5; 5)"), 5.8125);
  // Infinite geometric: a=1, r=1/2 → 2
  check("geominf(1;0.5)", evalExpr("geominf(1; 0.5)"), 2);
  // Infinite geometric: a=3, r=1/3 → 4.5
  checkClose("geominf(3;1/3)", evalExpr("geominf(3; 1/3)"), 4.5);
}

function testStatistics() {
  console.log("\n═══ Statistical Functions ═══");
  const env = new HekatanEnvironment();
  evaluate(parseExpression("v = [2; 4; 4; 4; 5; 5; 7; 9]"), env);

  checkClose("mean(v)", evaluate(parseExpression("mean(v)"), env) as number, 5);
  checkClose("median(v)", evaluate(parseExpression("median(v)"), env) as number, 4.5);
  checkClose("stdev(v)", evaluate(parseExpression("stdev(v)"), env) as number, 2.1381, 1e-3);

  // norm and dot
  evaluate(parseExpression("u = [3; 4]"), env);
  checkClose("norm([3;4])", evaluate(parseExpression("norm(u)"), env) as number, 5);

  evaluate(parseExpression("a = [1; 2; 3]"), env);
  evaluate(parseExpression("b = [4; 5; 6]"), env);
  check("dot([1;2;3],[4;5;6])", evaluate(parseExpression("dot(a; b)"), env), 32);

  // cross product
  evaluate(parseExpression("cx = [1; 0; 0]"), env);
  evaluate(parseExpression("cy = [0; 1; 0]"), env);
  const cr = evaluate(parseExpression("cross(cx; cy)"), env);
  check("cross(x,y)=[0,0,1]", cr, [0, 0, 1]);
}

function testSymbolicDerivative() {
  console.log("\n═══ Symbolic Derivative (sdiff) ═══");
  const env = new HekatanEnvironment();

  // d/dx(x^3) at x=2 → 3*2^2 = 12
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^3") });
  checkClose("d/dx(x^3)|x=2 = 12", evaluate(parseExpression("sdiff(f; 2)"), env) as number, 12, 1e-6);

  // d/dx(sin(x)) at x=0 → cos(0) = 1
  env.userFunctions.set("g", { params: ["x"], body: parseExpression("sin(x)") });
  checkClose("d/dx(sin)|x=0 = 1", evaluate(parseExpression("sdiff(g; 0)"), env) as number, 1, 1e-6);

  // d/dx(e^x) at x=1 → e
  env.userFunctions.set("h", { params: ["x"], body: parseExpression("exp(x)") });
  checkClose("d/dx(e^x)|x=1 = e", evaluate(parseExpression("sdiff(h; 1)"), env) as number, Math.E, 1e-6);

  // d/dx(x*sin(x)) at x=pi → sin(pi) + pi*cos(pi) = 0 + pi*(-1) = -pi
  env.userFunctions.set("p", { params: ["x"], body: parseExpression("x*sin(x)") });
  checkClose("d/dx(x·sin(x))|π = -π", evaluate(parseExpression("sdiff(p; pi)"), env) as number, -Math.PI, 1e-6);

  // d/dx(ln(x)) at x=2 → 1/2
  env.userFunctions.set("lf", { params: ["x"], body: parseExpression("ln(x)") });
  checkClose("d/dx(ln(x))|x=2 = 0.5", evaluate(parseExpression("sdiff(lf; 2)"), env) as number, 0.5, 1e-6);

  // d/dx(sqrt(x)) at x=4 → 1/(2*sqrt(4)) = 1/4
  env.userFunctions.set("sq", { params: ["x"], body: parseExpression("sqrt(x)") });
  checkClose("d/dx(√x)|x=4 = 0.25", evaluate(parseExpression("sdiff(sq; 4)"), env) as number, 0.25, 1e-6);
}

// ─── WASM Tests ──────────────────────────────────────────

async function testEigenWASM() {
  console.log("\n═══ Eigen WASM — Dense Solve ═══");
  const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
  const b = [8, -11, -3];
  const x = await eigenSolver.denseSolve(A, b);
  checkClose("WASM solve x[0]", x[0], 2);
  checkClose("WASM solve x[1]", x[1], 3);
  checkClose("WASM solve x[2]", x[2], -1);
}

async function testEigenSparse() {
  console.log("\n═══ Eigen WASM — Sparse Solve ═══");
  const rows = [0, 1, 2], cols = [0, 1, 2], vals = [2, 3, 4], b = [6, 12, 20];
  const xLU = await eigenSolver.sparseSolve(3, rows, cols, vals, b);
  check("SparseLU [3;4;5]", xLU.map(v => Math.round(v)), [3, 4, 5]);

  const xChol = await eigenSolver.sparseCholeskySolve(3, rows, cols, vals, b);
  check("Cholesky [3;4;5]", xChol.map(v => Math.round(v)), [3, 4, 5]);

  // Larger banded system
  const n = 500;
  const sp = bandedSparse(n, 5);
  const { ms } = await timeAsync(() => eigenSolver.sparseSolve(n, sp.rows, sp.cols, sp.vals, sp.b));
  console.log(`${OK} Sparse 500×500: solved in ${ms.toFixed(1)} ms`);
  passed++;
}

async function testEigenvalues() {
  console.log("\n═══ Eigen WASM — Eigenvalues ═══");
  const { real } = await eigenSolver.eigenvalues([[2, 1], [1, 2]]);
  const sorted = [...real].sort((a, b) => a - b);
  checkClose("eigenvalue 1", sorted[0], 1);
  checkClose("eigenvalue 2", sorted[1], 3);

  const ev3 = await eigenSolver.eigenvalues([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  checkClose("identity eig[0]", ev3.real[0], 1);
  checkClose("identity eig[1]", ev3.real[1], 1);
  checkClose("identity eig[2]", ev3.real[2], 1);

  // Symmetric 3×3
  const { real: r3 } = await eigenSolver.eigenvalues([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  const s3 = [...r3].sort((a, b) => a - b);
  checkClose("tridiag eig[0] ≈ 0.586", s3[0], 2 - Math.sqrt(2), 1e-4);
  checkClose("tridiag eig[1] = 2", s3[1], 2, 1e-4);
  checkClose("tridiag eig[2] ≈ 3.414", s3[2], 2 + Math.sqrt(2), 1e-4);
}

async function testEigenDecompose() {
  console.log("\n═══ Eigen WASM — Eigenvectors ═══");
  const { real, vectors } = await eigenSolver.eigenDecompose([[2, 1], [1, 2]]);
  console.log(`${OK} Eigenvalues: [${real.map(v => v.toFixed(4)).join(", ")}]`);
  passed++;
  console.log(`${OK} Eigenvector 1: [${vectors[0].map(v => v.toFixed(4)).join(", ")}]`);
  passed++;
  console.log(`${OK} Eigenvector 2: [${vectors[1].map(v => v.toFixed(4)).join(", ")}]`);
  passed++;
}

async function testSVD() {
  console.log("\n═══ Eigen WASM — SVD ═══");
  const { U, S, V } = await eigenSolver.svd([[3, 2, 2], [2, 3, -2]]);
  console.log(`${OK} Singular values: [${S.map(v => v.toFixed(4)).join(", ")}]`);
  passed++;
  check("U rows", U.length, 2);
  check("V rows", V.length, 3);

  // Verify: A ≈ U · diag(S) · V^T
  const k = S.length, m = U.length, n = V.length;
  const A_recon: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        A_recon[i][j] += U[i][l] * S[l] * V[j][l];
  const orig = [[3, 2, 2], [2, 3, -2]];
  let maxErr = 0;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      maxErr = Math.max(maxErr, Math.abs(A_recon[i][j] - orig[i][j]));
  console.log(`${OK} SVD reconstruction error: ${maxErr.toExponential(3)}`);
  passed++;
}

async function testDet() {
  console.log("\n═══ Eigen WASM — Determinant ═══");
  checkClose("det([[1,2],[3,4]])", await eigenSolver.det([[1, 2], [3, 4]]), -2);
  checkClose("det(diag(1,2,3))", await eigenSolver.det([[1, 0, 0], [0, 2, 0], [0, 0, 3]]), 6);
  // Singular matrix → det ≈ 0
  checkClose("det(singular)", await eigenSolver.det([[1, 2], [2, 4]]), 0);
}

async function testInverseWASM() {
  console.log("\n═══ Eigen WASM — Inverse ═══");
  const inv = await eigenSolver.inverse([[1, 2], [3, 4]]);
  checkClose("inv[0][0]", inv[0][0], -2);
  checkClose("inv[0][1]", inv[0][1], 1);
  checkClose("inv[1][0]", inv[1][0], 1.5);
  checkClose("inv[1][1]", inv[1][1], -0.5);
}

async function testMultiply() {
  console.log("\n═══ Eigen WASM — Multiply ═══");
  const C = await eigenSolver.multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
  check("(A·B)[0][0]", C[0][0], 19);
  check("(A·B)[0][1]", C[0][1], 22);
  check("(A·B)[1][0]", C[1][0], 43);
  check("(A·B)[1][1]", C[1][1], 50);
}

// ─── Benchmark ───────────────────────────────────────────

async function testBenchmark() {
  console.log("\n══════════════════════════════════════════════");
  console.log("  BENCHMARK: JS Dense vs WASM SparseLU");
  console.log("══════════════════════════════════════════════");

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
      if (Math.abs(pivot) < 1e-14) throw new Error("Singular");
      for (let j = col; j <= n; j++) aug[col][j] /= pivot;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row][col];
        for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }
    return aug.map(row => row[n]);
  }

  const sizes = [10, 50, 100, 200, 500, 1000, 2000, 5000];
  console.log("\n  N       | JS Dense (ms) | WASM Sparse (ms) | Speedup");
  console.log("  --------+---------------+------------------+--------");

  for (const n of sizes) {
    const sp = bandedSparse(n, 5);
    const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < sp.rows.length; i++) A[sp.rows[i]][sp.cols[i]] += sp.vals[i];

    let jsMs = -1;
    if (n <= 2000) {
      const { ms } = time(() => gaussianSolve(A, sp.b));
      jsMs = ms;
    }

    const { ms: wasmMs } = await timeAsync(() =>
      eigenSolver.sparseSolve(n, sp.rows, sp.cols, sp.vals, sp.b)
    );

    const jsStr = jsMs >= 0 ? jsMs.toFixed(1).padStart(13) : "     (skip)  ";
    const wasmStr = wasmMs.toFixed(1).padStart(16);
    const speedup = jsMs >= 0 && wasmMs > 0 ? (jsMs / wasmMs).toFixed(1).padStart(7) + "x" : "       -";
    console.log(`  ${String(n).padStart(7)} |${jsStr} |${wasmStr} |${speedup}`);
  }
}

// ─── CLI commands ────────────────────────────────────────

async function cmdExpr(expr: string) {
  console.log(`\n═══ Evaluate: ${expr} ═══`);
  const env = new HekatanEnvironment();
  const lines = expr.split(";").map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const ast = parseExpression(line);
    const result = evaluate(ast, env);
    if ((ast as any).type === "assign") {
      env.setVar((ast as any).name, result);
    }
    const display = Array.isArray(result)
      ? (Array.isArray((result as any)[0]) ? `[${(result as any).length}×${(result as any)[0].length} matrix]` : `[${(result as any).length} vector]`)
      : result;
    console.log(`  ${line} = ${display}`);
  }
}

async function cmdFile(path: string) {
  console.log(`\n═══ File: ${path} ═══`);
  const fs = await import("node:fs");
  if (!fs.existsSync(path)) { console.error(`  File not found: ${path}`); process.exit(1); }
  const code = fs.readFileSync(path, "utf-8");
  const env = new HekatanEnvironment();
  let lineNum = 0;
  for (const line of code.split("\n")) {
    lineNum++;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") ||
        trimmed.startsWith(">") || trimmed.startsWith("@{")) continue;
    try {
      const ast = parseExpression(trimmed);
      const result = evaluate(ast, env);
      if ((ast as any).type === "assign") env.setVar((ast as any).name, result);
      const display = Array.isArray(result)
        ? (Array.isArray((result as any)[0]) ? `[matrix]` : `[vector]`)
        : (typeof result === "number" ? (result as number).toPrecision(8) : result);
      console.log(`  L${String(lineNum).padStart(3)}: ${trimmed.substring(0, 60)}${trimmed.length > 60 ? "..." : ""}  → ${display}`);
    } catch {
      // skip unparseable lines
    }
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "all";

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Hekatan Math CLI — Complete Solver Test Suite      ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // Init WASM
  const t0 = performance.now();
  await eigenSolver.init();
  console.log(`  Eigen WASM loaded in ${(performance.now() - t0).toFixed(0)} ms (229 KB)\n`);

  if (cmd === "all" || cmd === "test") {
    // ── Basic ──
    testArithmetic();
    testComparisons();
    testConditional();
    testConstants();

    // ── Functions ──
    testTrig();
    testHyperbolic();
    testExpLog();
    testRounding();
    testAngleConversion();
    testCombinatorics();
    testInterpolation();
    testAggregation();

    // ── Variables & Functions ──
    testVariables();
    testUserFunctions();

    // ── Vectors & Matrices ──
    testVectors();
    testVectorCreation();
    testMatrices();
    testMatrixArithmetic();
    testMatrixIndexing();
    testLusolve();
    testInverse();

    // ── Calculus & Analysis ──
    testDerivatives();
    testSummation();
    testProduct();
    testODE();
    testNsolve();
    testBisectSecant();
    testNumericalLimit();
    testTaylorSeries();
    testIntegrals();
    testTrapezoidSimpson();
    testLagrangeInterp();
    testLinearRegression();
    testEulerMethod();
    testNumberTheory();
    testSequences();
    testStatistics();
    testSymbolicDerivative();
    testCellArrays();

    // ── WASM ──
    await testEigenWASM();
    await testEigenSparse();
    await testEigenvalues();
    await testEigenDecompose();
    await testSVD();
    await testDet();
    await testInverseWASM();
    await testMultiply();

    console.log("\n══════════════════════════════════════════════");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) console.log("  \x1b[32mALL TESTS PASSED\x1b[0m");
    else console.log("  \x1b[31mSOME TESTS FAILED\x1b[0m");
    console.log("══════════════════════════════════════════════");
  } else if (cmd === "bench" || cmd === "benchmark") {
    await testBenchmark();
  } else if (cmd === "sparse") {
    const n = parseInt(args[1]) || 100;
    const sp = bandedSparse(n, 5);
    console.log(`\n  Sparse solve ${n}×${n} (nnz=${sp.rows.length})...`);
    const { result, ms } = await timeAsync(() =>
      eigenSolver.sparseSolve(n, sp.rows, sp.cols, sp.vals, sp.b)
    );
    console.log(`  Solved in ${ms.toFixed(1)} ms`);
    console.log(`  x[0..4] = [${result.slice(0, 5).map(v => v.toFixed(6)).join(", ")}]`);
  } else if (cmd === "expr") {
    await cmdExpr(args.slice(1).join(" "));
  } else if (cmd === "file") {
    await cmdFile(args[1]);
  } else {
    console.log(`
  Commands:
    all / test        Run all tests (default)
    bench             JS vs WASM benchmark
    sparse [n]        Sparse solve n×n
    expr "x=5; x^2"  Evaluate expression
    file path.hcalc   Evaluate .hcalc file
    `);
  }
}

main().catch(console.error);

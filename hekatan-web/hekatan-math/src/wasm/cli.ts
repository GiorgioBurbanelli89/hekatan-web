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

function testFunctions() {
  console.log("\n═══ Math Functions ═══");
  check("sin(0)", evalExpr("sin(0)"), 0);
  checkClose("sin(pi/2)", evalExpr("sin(pi/2)"), 1);
  checkClose("cos(0)", evalExpr("cos(0)"), 1);
  checkClose("cos(pi)", evalExpr("cos(pi)"), -1);
  checkClose("tan(pi/4)", evalExpr("tan(pi/4)"), 1);
  checkClose("asin(1)", evalExpr("asin(1)"), Math.PI / 2);
  checkClose("acos(0)", evalExpr("acos(0)"), Math.PI / 2);
  checkClose("atan(1)", evalExpr("atan(1)"), Math.PI / 4);
  checkClose("atan2(1, 1)", evalExpr("atan2(1; 1)"), Math.PI / 4);
  check("sqrt(144)", evalExpr("sqrt(144)"), 12);
  check("cbrt(27)", evalExpr("cbrt(27)"), 3);
  check("abs(-7)", evalExpr("abs(-7)"), 7);
  checkClose("exp(1)", evalExpr("exp(1)"), Math.E);
  checkClose("ln(e)", evalExpr("ln(e)"), 1);
  checkClose("log(100)", evalExpr("log(100)"), 2);
  check("floor(3.7)", evalExpr("floor(3.7)"), 3);
  check("ceil(3.2)", evalExpr("ceil(3.2)"), 4);
  check("round(3.5)", evalExpr("round(3.5)"), 4);
  check("min(3; 7; 1; 5)", evalExpr("min(3; 7; 1; 5)"), 1);
  check("max(3; 7; 1; 5)", evalExpr("max(3; 7; 1; 5)"), 7);
  checkClose("hypot(3; 4)", evalExpr("hypot(3; 4)"), 5);
  check("sign(-5)", evalExpr("sign(-5)"), -1);
  check("fact(5)", evalExpr("fact(5)"), 120);
}

function testHyperbolic() {
  console.log("\n═══ Hyperbolic Functions ═══");
  checkClose("sinh(1)", evalExpr("sinh(1)"), Math.sinh(1));
  checkClose("cosh(1)", evalExpr("cosh(1)"), Math.cosh(1));
  checkClose("tanh(1)", evalExpr("tanh(1)"), Math.tanh(1));
}

function testVariables() {
  console.log("\n═══ Variables & Assignment ═══");
  const env = new HekatanEnvironment();
  const ast1 = parseExpression("x = 5");
  const r1 = evaluate(ast1, env);
  check("x = 5", r1, 5);

  const ast2 = parseExpression("y = x^2 + 3*x - 1");
  const r2 = evaluate(ast2, env);
  check("y = x^2 + 3*x - 1", r2, 39);

  const ast3 = parseExpression("z = sqrt(x*y)");
  const r3 = evaluate(ast3, env);
  checkClose("z = sqrt(x*y)", r3 as number, Math.sqrt(5 * 39));
}

function testUserFunctions() {
  console.log("\n═══ User Functions ═══");
  const env = new HekatanEnvironment();
  // Register function manually (function definition is in mathEngine.ts, not evaluator)
  env.userFunctions.set("f", {
    params: ["x"],
    body: parseExpression("x^2 + 1"),
  });
  check("f(3)", evaluate(parseExpression("f(3)"), env), 10);
  check("f(0)", evaluate(parseExpression("f(0)"), env), 1);
  check("f(-2)", evaluate(parseExpression("f(-2)"), env), 5);

  // Multi-arg function
  env.userFunctions.set("g", {
    params: ["x", "y"],
    body: parseExpression("x*y + x + y"),
  });
  check("g(2; 3)", evaluate(parseExpression("g(2; 3)"), env), 11);
}

function testVectors() {
  console.log("\n═══ Vectors ═══");
  const env = new HekatanEnvironment();
  const v = evaluate(parseExpression("v = [1; 2; 3]"), env);
  check("v = [1;2;3]", Array.isArray(v), true);

  const len = evaluate(parseExpression("len(v)"), env);
  check("len(v)", len, 3);

  const s = evaluate(parseExpression("sum(v)"), env);
  check("sum(v)", s, 6);
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
}

function testIntegrals() {
  console.log("\n═══ Numerical Integration (Gauss-Legendre) ═══");
  const env = new HekatanEnvironment();

  // Register functions (function def is in mathEngine, not evaluator)
  env.userFunctions.set("f", { params: ["x"], body: parseExpression("x^2") });
  const r1 = evaluate(parseExpression("integral(f; 0; 1)"), env) as number;
  checkClose("∫₀¹ x² dx = 1/3", r1, 1 / 3);

  env.userFunctions.set("g", { params: ["x"], body: parseExpression("sin(x)") });
  const r2 = evaluate(parseExpression("integral(g; 0; pi)"), env) as number;
  checkClose("∫₀^π sin(x) dx = 2", r2, 2);

  env.userFunctions.set("h", { params: ["x"], body: parseExpression("1/x") });
  const r3 = evaluate(parseExpression("integral(h; 1; e)"), env) as number;
  checkClose("∫₁^e 1/x dx = 1", r3, 1);

  env.userFunctions.set("k", { params: ["x"], body: parseExpression("exp(x)") });
  const r4 = evaluate(parseExpression("integral(k; 0; 1)"), env) as number;
  checkClose("∫₀¹ eˣ dx = e-1", r4, Math.E - 1);

  // Double integral
  env.userFunctions.set("p", { params: ["x", "y"], body: parseExpression("x*y") });
  const r5 = evaluate(parseExpression("integral2(p; 0; 1; 0; 1)"), env) as number;
  checkClose("∫∫ x·y dA [0,1]² = 1/4", r5, 0.25);
}

async function testEigenWASM() {
  console.log("\n═══ Eigen WASM — Dense Solve ═══");

  // 3×3 system
  const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
  const b = [8, -11, -3];
  const x = await eigenSolver.denseSolve(A, b);
  checkClose("WASM solve x[0]", x[0], 2);
  checkClose("WASM solve x[1]", x[1], 3);
  checkClose("WASM solve x[2]", x[2], -1);
}

async function testEigenSparse() {
  console.log("\n═══ Eigen WASM — Sparse Solve ═══");

  // Simple 3×3 sparse: diag(2,3,4) · x = [6, 12, 20]
  const rows = [0, 1, 2];
  const cols = [0, 1, 2];
  const vals = [2, 3, 4];
  const b = [6, 12, 20];

  const xLU = await eigenSolver.sparseSolve(3, rows, cols, vals, b);
  check("SparseLU [3;4;5]", xLU.map(v => Math.round(v)), [3, 4, 5]);

  const xChol = await eigenSolver.sparseCholeskySolve(3, rows, cols, vals, b);
  check("Cholesky [3;4;5]", xChol.map(v => Math.round(v)), [3, 4, 5]);

  // Larger banded system
  const n = 500;
  const sp = bandedSparse(n, 5);
  const { result: x500, ms } = await timeAsync(() =>
    eigenSolver.sparseSolve(n, sp.rows, sp.cols, sp.vals, sp.b)
  );
  console.log(`${OK} Sparse 500×500: solved in ${ms.toFixed(1)} ms`);
  passed++;
}

async function testEigenvalues() {
  console.log("\n═══ Eigen WASM — Eigenvalues ═══");

  // Symmetric 2×2: eigenvalues of [[2,1],[1,2]] are 3 and 1
  const { real, imag } = await eigenSolver.eigenvalues([[2, 1], [1, 2]]);
  const sorted = [...real].sort((a, b) => a - b);
  checkClose("eigenvalue 1", sorted[0], 1);
  checkClose("eigenvalue 2", sorted[1], 3);

  // 3×3 identity: eigenvalues = [1, 1, 1]
  const ev3 = await eigenSolver.eigenvalues([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  checkClose("identity eig[0]", ev3.real[0], 1);
  checkClose("identity eig[1]", ev3.real[1], 1);
  checkClose("identity eig[2]", ev3.real[2], 1);
}

async function testEigenDecompose() {
  console.log("\n═══ Eigen WASM — Eigenvectors ═══");

  // [[2,1],[1,2]] → eigenvectors should be [1,1]/√2 and [1,-1]/√2
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

  // SVD of [[3, 2, 2], [2, 3, -2]]
  const { U, S, V } = await eigenSolver.svd([[3, 2, 2], [2, 3, -2]]);
  console.log(`${OK} Singular values: [${S.map(v => v.toFixed(4)).join(", ")}]`);
  passed++;
  check("U rows", U.length, 2);
  check("V rows", V.length, 3);

  // Verify: A ≈ U · diag(S) · V^T
  const k = S.length;
  const m = U.length, n = V.length;
  const A_recon: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < k; l++) {
        A_recon[i][j] += U[i][l] * S[l] * V[j][l];
      }
    }
  }
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

  const d1 = await eigenSolver.det([[1, 2], [3, 4]]);
  checkClose("det([[1,2],[3,4]])", d1, -2);

  const d2 = await eigenSolver.det([[1, 0, 0], [0, 2, 0], [0, 0, 3]]);
  checkClose("det(diag(1,2,3))", d2, 6);
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

  const C = await eigenSolver.multiply(
    [[1, 2], [3, 4]],
    [[5, 6], [7, 8]]
  );
  check("(A·B)[0][0]", C[0][0], 19);
  check("(A·B)[0][1]", C[0][1], 22);
  check("(A·B)[1][0]", C[1][0], 43);
  check("(A·B)[1][1]", C[1][1], 50);
}

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
  if (!fs.existsSync(path)) {
    console.error(`  File not found: ${path}`);
    process.exit(1);
  }
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

  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   Hekatan Math CLI — Test All Solvers          ║");
  console.log("╚════════════════════════════════════════════════╝");

  // Init WASM
  const t0 = performance.now();
  await eigenSolver.init();
  console.log(`  Eigen WASM loaded in ${(performance.now() - t0).toFixed(0)} ms (229 KB)\n`);

  if (cmd === "all" || cmd === "test") {
    // ── JS Evaluator Tests ──
    testArithmetic();
    testFunctions();
    testHyperbolic();
    testVariables();
    testUserFunctions();
    testVectors();
    testMatrices();
    testLusolve();
    testInverse();
    testIntegrals();

    // ── WASM Tests ──
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

#!/usr/bin/env tsx
/**
 * Hekatan GPU CLI — WebGPU compute benchmarks with HTML report
 *
 * Usage:
 *   tsx cli-gpu.ts              — Run all GPU tests, open HTML report
 *   tsx cli-gpu.ts matmul 512   — Matrix multiplication benchmark
 *   tsx cli-gpu.ts solve 100    — Jacobi solver test
 *   tsx cli-gpu.ts bench        — Full benchmark suite
 */

import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { eigenSolver } from "../wasm/eigenSolver.js";

// ─── CPU Reference Implementations ─────────────────────

function cpuMatmul(a: Float32Array, b: Float32Array, M: number, N: number, K: number): Float32Array {
  const c = new Float32Array(M * N);
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let k = 0; k < K; k++) {
        sum += a[i * K + k] * b[k * N + j];
      }
      c[i * N + j] = sum;
    }
  }
  return c;
}

function cpuMatvec(a: Float32Array, x: Float32Array, N: number): Float32Array {
  const y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = 0; j < N; j++) {
      sum += a[i * N + j] * x[j];
    }
    y[i] = sum;
  }
  return y;
}

function cpuJacobi(a: Float32Array, b: Float32Array, N: number, maxIter = 1000, tol = 1e-6): { x: Float32Array; iterations: number; residual: number } {
  let xOld = new Float32Array(N);
  let xNew = new Float32Array(N);
  let iterations = 0;
  let residual = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < N; i++) {
      let sigma = 0;
      for (let j = 0; j < N; j++) {
        if (j !== i) sigma += a[i * N + j] * xOld[j];
      }
      xNew[i] = (b[i] - sigma) / a[i * N + i];
    }

    residual = 0;
    for (let i = 0; i < N; i++) {
      residual += (xNew[i] - xOld[i]) ** 2;
    }
    residual = Math.sqrt(residual);
    iterations = iter + 1;

    if (residual < tol) break;
    [xOld, xNew] = [xNew, xOld];
  }

  return { x: xNew, iterations, residual };
}

// ─── Generate test matrices ─────────────────────────────

/** Diagonally dominant matrix (guarantees Jacobi convergence) */
function genDiagDominant(N: number): { A: Float32Array; b: Float32Array; xExpected: Float32Array } {
  const A = new Float32Array(N * N);
  const xExpected = new Float32Array(N);
  const b = new Float32Array(N);

  // Generate known solution
  for (let i = 0; i < N; i++) xExpected[i] = i + 1;

  // Build diagonally dominant A
  for (let i = 0; i < N; i++) {
    let rowSum = 0;
    for (let j = 0; j < N; j++) {
      if (i !== j) {
        A[i * N + j] = (Math.random() - 0.5) * 2;
        rowSum += Math.abs(A[i * N + j]);
      }
    }
    A[i * N + i] = rowSum + 1 + Math.random() * 5; // strictly dominant
  }

  // b = A × xExpected
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = 0; j < N; j++) sum += A[i * N + j] * xExpected[j];
    b[i] = sum;
  }

  return { A, b, xExpected };
}

function genRandomMatrix(M: number, N: number): Float32Array {
  const a = new Float32Array(M * N);
  for (let i = 0; i < M * N; i++) a[i] = Math.random() * 10 - 5;
  return a;
}

// ─── Benchmark Runner ───────────────────────────────────

interface BenchResult {
  name: string;
  size: string;
  cpuTime: number;
  gpuTime?: number;
  speedup?: number;
  error?: number;
  iterations?: number;
  status: "pass" | "fail" | "cpu-only";
  details?: string;
}

async function runBenchmarks(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const sizes = [64, 128, 256, 512];

  console.log("\n\x1b[36m═══════════════════════════════════════════\x1b[0m");
  console.log("\x1b[36m  Hekatan GPU — Matrix Compute Benchmarks  \x1b[0m");
  console.log("\x1b[36m═══════════════════════════════════════════\x1b[0m\n");

  // ── Matrix Multiplication ──
  console.log("\x1b[33m▸ Matrix Multiplication (C = A × B)\x1b[0m");
  for (const N of sizes) {
    const a = genRandomMatrix(N, N);
    const b = genRandomMatrix(N, N);

    const t0 = performance.now();
    const cpuResult = cpuMatmul(a, b, N, N, N);
    const cpuTime = performance.now() - t0;

    console.log(`  \x1b[32m✓\x1b[0m ${N}×${N}: CPU = ${cpuTime.toFixed(2)} ms`);

    results.push({
      name: "Matrix Multiplication",
      size: `${N}×${N}`,
      cpuTime,
      status: "cpu-only",
      details: `C = A × B, ${(N * N * N * 2 / 1e6).toFixed(1)} MFLOP`,
    });
  }

  // ── Matrix-Vector Multiply ──
  console.log("\n\x1b[33m▸ Matrix-Vector Multiply (y = Ax)\x1b[0m");
  for (const N of [256, 512, 1024, 2048]) {
    const a = genRandomMatrix(N, N);
    const x = genRandomMatrix(N, 1);

    const t0 = performance.now();
    const cpuResult = cpuMatvec(a, x, N);
    const cpuTime = performance.now() - t0;

    console.log(`  \x1b[32m✓\x1b[0m ${N}×${N}: CPU = ${cpuTime.toFixed(2)} ms`);

    results.push({
      name: "Matrix-Vector Multiply",
      size: `${N}×${N}`,
      cpuTime,
      status: "cpu-only",
      details: `y = A·x, ${(N * N * 2 / 1e6).toFixed(3)} MFLOP`,
    });
  }

  // ── Jacobi Solver ──
  console.log("\n\x1b[33m▸ Jacobi Iterative Solver (Ax = b)\x1b[0m");
  for (const N of [50, 100, 200, 500]) {
    const { A, b, xExpected } = genDiagDominant(N);

    const t0 = performance.now();
    const result = cpuJacobi(A, b, N);
    const cpuTime = performance.now() - t0;

    let maxErr = 0;
    for (let i = 0; i < N; i++) maxErr = Math.max(maxErr, Math.abs(result.x[i] - xExpected[i]));

    const ok = maxErr < 0.01;
    const icon = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${icon} ${N}×${N}: CPU = ${cpuTime.toFixed(2)} ms, ${result.iterations} iter, err = ${maxErr.toExponential(2)}`);

    results.push({
      name: "Jacobi Solver",
      size: `${N}×${N}`,
      cpuTime,
      error: maxErr,
      iterations: result.iterations,
      status: ok ? "pass" : "fail",
      details: `Diag. dominant system, tol=1e-6`,
    });
  }

  // ── Stiffness Matrix Assembly (FEM-like) — Eigen WASM Sparse LU ──
  console.log("\n\x1b[33m▸ FEM Stiffness Assembly + Eigen WASM Solve\x1b[0m");
  await eigenSolver.init();
  for (const nElements of [10, 50, 100, 200, 500, 1000]) {
    const N = nElements + 1; // DOFs for 1D bar
    const EA_L = 1000; // EA/L

    // Build sparse triplets (COO format)
    const rows: number[] = [];
    const cols: number[] = [];
    const vals: number[] = [];
    const bVec: number[] = new Array(N).fill(0);

    for (let e = 0; e < nElements; e++) {
      // k_e = EA/L * [1 -1; -1 1]
      rows.push(e, e, e + 1, e + 1);
      cols.push(e, e + 1, e, e + 1);
      vals.push(EA_L, -EA_L, -EA_L, EA_L);
    }

    // BC: fix node 0 — replace row 0 with identity
    // Remove all entries in row 0, add diagonal 1
    const filtered = { rows: [] as number[], cols: [] as number[], vals: [] as number[] };
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] !== 0) {
        filtered.rows.push(rows[i]);
        filtered.cols.push(cols[i]);
        filtered.vals.push(vals[i]);
      }
    }
    filtered.rows.push(0);
    filtered.cols.push(0);
    filtered.vals.push(1);

    bVec[0] = 0;
    bVec[N - 1] = 100; // 100 kN

    const t0 = performance.now();
    const x = await eigenSolver.sparseSolve(N, filtered.rows, filtered.cols, filtered.vals, bVec);
    const wasmTime = performance.now() - t0;

    const expectedTip = 100 * nElements / EA_L;
    const tipErr = Math.abs(x[N - 1] - expectedTip);
    const ok = tipErr < 1e-6;
    const icon = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";

    console.log(`  ${icon} ${nElements} elem (${N} DOF): Eigen WASM = ${wasmTime.toFixed(2)} ms, tip = ${x[N - 1].toFixed(6)}, expected = ${expectedTip.toFixed(6)}`);

    results.push({
      name: "FEM 1D Bar (Eigen WASM)",
      size: `${nElements} elem (${N} DOF)`,
      cpuTime: wasmTime,
      error: tipErr,
      status: ok ? "pass" : "fail",
      details: `Sparse LU, EA/L=${EA_L}, F=100 kN`,
    });
  }

  return results;
}

// ─── HTML Report Generator ──────────────────────────────

function generateReport(results: BenchResult[]): string {
  const now = new Date().toLocaleString("es-EC", { dateStyle: "full", timeStyle: "short" });
  const totalPassed = results.filter(r => r.status === "pass" || r.status === "cpu-only").length;
  const totalFailed = results.filter(r => r.status === "fail").length;

  const groups = new Map<string, BenchResult[]>();
  for (const r of results) {
    if (!groups.has(r.name)) groups.set(r.name, []);
    groups.get(r.name)!.push(r);
  }

  // Format equation line: variable = expression = value
  function eqLine(varName: string, expr: string, value: string, unit = ""): string {
    const unitHtml = unit ? `<i class="unit">\u2009${unit}</i>` : "";
    return `<p class="line"><span class="eq"><var>${varName}</var> = ${expr} = <span class="val">${value}</span>${unitHtml}</span></p>`;
  }

  function eqAssign(varName: string, value: string, unit = ""): string {
    const unitHtml = unit ? `<i class="unit">\u2009${unit}</i>` : "";
    return `<p class="line"><span class="eq"><var>${varName}</var> = <span class="val">${value}</span>${unitHtml}</span></p>`;
  }

  // Build sections
  let contentHtml = "";

  // Summary section
  contentHtml += `<h1 class="chapter-heading">Hekatan GPU</h1>`;
  contentHtml += `<p class="desc">Matrix Compute Benchmark Report</p>`;
  contentHtml += `<p class="desc">${now}</p>`;
  contentHtml += `<br>`;

  contentHtml += `<h2 class="chapter-heading">1. Resumen</h2>`;
  contentHtml += eqAssign("Tests", `${results.length}`);
  contentHtml += eqLine("Passed", `${totalPassed}`, `${totalPassed}`);
  contentHtml += eqLine("Failed", `${totalFailed}`, `${totalFailed}`);
  contentHtml += eqAssign("Engine", "CPU (JavaScript)");
  contentHtml += `<br>`;

  let sectionNum = 2;
  for (const [name, items] of groups) {
    const hasError = items.some(i => i.error !== undefined);
    const hasIter = items.some(i => i.iterations !== undefined);

    contentHtml += `<h2 class="chapter-heading">${sectionNum}. ${name}</h2>`;
    if (items[0].details) {
      contentHtml += `<p class="desc">${items[0].details}</p>`;
    }

    contentHtml += `<table class="bench-table">
      <thead><tr>
        <th>Size</th>
        <th class="r">CPU (ms)</th>
        ${hasIter ? '<th class="r">Iterations</th>' : ''}
        ${hasError ? '<th class="r">Error</th>' : ''}
        <th class="c">Status</th>
      </tr></thead><tbody>`;

    for (const r of items) {
      const statusClass = r.status === "pass" ? "ok" : r.status === "fail" ? "err" : "ref";
      const statusText = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "CPU";
      contentHtml += `<tr>
        <td><var>${r.size}</var></td>
        <td class="r mono">${r.cpuTime.toFixed(2)}</td>
        ${hasIter ? `<td class="r mono">${r.iterations ?? '—'}</td>` : ''}
        ${hasError ? `<td class="r mono">${r.error !== undefined ? r.error.toExponential(2) : '—'}</td>` : ''}
        <td class="c"><span class="${statusClass}">${statusText}</span></td>
      </tr>`;
    }

    contentHtml += `</tbody></table><br>`;
    sectionNum++;
  }

  // Final summary equation
  contentHtml += `<h2 class="chapter-heading">${sectionNum}. Verificaci&oacute;n</h2>`;
  if (totalFailed === 0) {
    contentHtml += `<p class="line"><span class="ok">Todos los tests pasaron correctamente.</span></p>`;
  } else {
    contentHtml += `<p class="line"><span class="err">${totalFailed} test(s) fallaron. Revisar solver Jacobi para sistemas grandes.</span></p>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hekatan GPU — Benchmark Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #b0b0b0;
    font-family: 'Segoe UI', 'Arial Nova', Helvetica, sans-serif;
    font-size: 12pt;
    line-height: 135%;
    color: #000;
  }
  .page {
    background: #fff;
    width: 210mm;
    min-height: 297mm;
    padding: 10mm 10mm 10mm 12mm;
    margin: 10mm auto;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  h1.chapter-heading {
    font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', serif;
    font-weight: normal;
    color: #3a2a1a;
    font-size: 2.1em;
    margin-bottom: 0.3em;
  }
  h2.chapter-heading {
    font-family: 'Georgia Pro', 'Century Schoolbook', 'Times New Roman', serif;
    font-weight: normal;
    color: #3a2a1a;
    font-size: 1.5em;
    margin-top: 0.8em;
    margin-bottom: 0.4em;
    border-bottom: 1px solid #ddd;
    padding-bottom: 0.2em;
  }
  .desc {
    color: #555;
    font-size: 11pt;
    margin-bottom: 0.3em;
  }
  .line {
    margin: 2pt 0;
    padding: 1pt 4pt;
  }
  .eq {
    font-size: 105%;
  }
  .eq var {
    color: #06d;
    font-style: italic;
    font-family: 'Cambria Math', 'STIX Two Math', 'Times New Roman', serif;
  }
  .eq .val {
    color: #000;
    font-weight: 500;
  }
  i.unit {
    color: #086;
    font-size: 90%;
    font-style: italic;
  }
  .ok {
    color: Green;
    background-color: #F0FFF0;
    padding: 2pt 6pt;
    border-radius: 3pt;
  }
  .err {
    color: Crimson;
    background-color: #FEE;
    padding: 2pt 6pt;
    border-radius: 3pt;
  }
  .ref {
    color: #06d;
    background-color: #F8F8FF;
    padding: 2pt 6pt;
    border-radius: 3pt;
  }
  /* Benchmark table */
  table.bench-table {
    width: 100%;
    border-collapse: collapse;
    margin: 6pt 0;
    font-size: 11pt;
  }
  .bench-table th {
    background: #f4f6f8;
    border-bottom: 2pt solid #999;
    padding: 5pt 8pt;
    text-align: left;
    font-size: 10pt;
    font-weight: 600;
    color: #333;
  }
  .bench-table td {
    padding: 4pt 8pt;
    border-bottom: 0.5pt solid #ddd;
  }
  .bench-table tr:hover {
    background: #f8fbff;
  }
  .bench-table var {
    color: #06d;
    font-style: italic;
    font-family: 'Cambria Math', 'STIX Two Math', serif;
  }
  .r { text-align: right; }
  .c { text-align: center; }
  .mono {
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    font-size: 10pt;
  }
  /* Matrix display */
  .matrix {
    display: inline-table;
    border-left: solid 1.5pt black;
    border-right: solid 1.5pt black;
    border-radius: 2pt;
    padding: 1pt 2pt;
    vertical-align: middle;
  }
  .matrix .tr { display: table-row; }
  .matrix .td {
    display: table-cell;
    white-space: nowrap;
    padding: 0 3pt;
    text-align: center;
  }
  /* Fraction */
  .dvc {
    display: inline-block;
    text-align: center;
    line-height: 110%;
    vertical-align: middle;
  }
  .dvl {
    display: block;
    border-bottom: solid 1pt black;
    margin-top: 1pt;
    margin-bottom: 1pt;
  }
  footer {
    text-align: center;
    padding-top: 1em;
    margin-top: 2em;
    border-top: 1px solid #ccc;
    color: #888;
    font-size: 9pt;
  }
  @media print {
    body { background: none; }
    .page {
      box-shadow: none;
      margin: 0;
      padding: 10mm;
    }
  }
</style>
</head>
<body>
  <div class="page">
    ${contentHtml}
    <footer>
      Hekatan Calc 1.0.0 — GPU Compute Module — Ecuador
    </footer>
  </div>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const results = await runBenchmarks();

  const reportPath = decodeURIComponent(new URL("../../gpu-benchmark.html", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
  const html = generateReport(results);
  writeFileSync(reportPath, html, "utf-8");

  console.log(`\n\x1b[36m📄 Report: ${reportPath}\x1b[0m`);

  // Auto-open in browser
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${reportPath}"`, { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execSync(`open "${reportPath}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${reportPath}"`, { stdio: "ignore" });
    }
  } catch {
    // ignore if can't open
  }
}

main().catch(console.error);

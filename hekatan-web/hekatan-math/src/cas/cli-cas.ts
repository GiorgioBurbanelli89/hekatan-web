#!/usr/bin/env tsx
/**
 * Hekatan miniCAS CLI — REPL tipo Maxima
 *
 * Uso:
 *   tsx cli-cas.ts              — REPL interactivo
 *   tsx cli-cas.ts test         — Correr tests
 *   tsx cli-cas.ts eval "expr"  — Evaluar una expresion
 */

import {
  parse, print, simplify, expand, diff, integrate, solve,
  dsolve, taylor, factor, evalNum, substitute,
  sym, num, type Expr, hasSymbol
} from "./miniCAS.js";

import * as readline from "readline";
import { writeFileSync } from "fs";

// ═══════════════════════════════════════════════════════════
// COMMAND PROCESSOR
// ═══════════════════════════════════════════════════════════

const userVars = new Map<string, Expr>();

function processLine(input: string): string {
  input = input.trim();
  if (!input || input.startsWith("//")) return "";

  try {
    // Commands: diff(...), integrate(...), solve(...), etc.

    // diff(expr, var)
    let m = input.match(/^diff\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return print(simplify(diff(e, m[2])));
    }

    // integrate(expr, var)
    m = input.match(/^integrate\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      return print(simplify(integrate(e, m[2])));
    }

    // solve(expr, var) or solve(expr = 0, var)
    m = input.match(/^solve\((.+),\s*(\w+)\)$/);
    if (m) {
      const e = parse(m[1]);
      const roots = solve(e, m[2]);
      if (roots.length === 0) return "No real solutions";
      if (roots.length === 1) return `${m[2]} = ${print(roots[0])}`;
      return roots.map((r, i) => `${m[2]}_${i + 1} = ${print(r)}`).join("\n");
    }

    // expand(expr)
    m = input.match(/^expand\((.+)\)$/);
    if (m) return print(expand(parse(m[1])));

    // factor(expr, var)
    m = input.match(/^factor\((.+),\s*(\w+)\)$/);
    if (m) return print(factor(parse(m[1]), m[2]));
    m = input.match(/^factor\((.+)\)$/);
    if (m) return print(factor(parse(m[1]), "x"));

    // taylor(expr, var, x0, n)
    m = input.match(/^taylor\((.+),\s*(\w+),\s*(.+),\s*(\d+)\)$/);
    if (m) return print(taylor(parse(m[1]), m[2], parse(m[3]), parseInt(m[4])));

    // dsolve(y' = expr) or dsolve(y'' = expr)
    m = input.match(/^dsolve\((.+)\)$/);
    if (m) return print(simplify(dsolve(parse(m[1]))));

    // simplify(expr)
    m = input.match(/^simplify\((.+)\)$/);
    if (m) return print(simplify(parse(m[1])));

    // eval(expr) — numeric evaluation
    m = input.match(/^eval\((.+)\)$/);
    if (m) {
      const e = parse(m[1]);
      // Substitute user variables
      let resolved = e;
      for (const [k, v] of userVars) resolved = substitute(resolved, k, v);
      return String(evalNum(resolved));
    }

    // Variable assignment: x = expr
    m = input.match(/^(\w+)\s*=\s*(.+)$/);
    if (m && !m[2].includes("=")) {
      const name = m[1];
      const expr = simplify(parse(m[2]));
      userVars.set(name, expr);
      return `${name} := ${print(expr)}`;
    }

    // Default: parse, simplify, print
    const expr = simplify(parse(input));
    // Substitute known variables for display
    let resolved = expr;
    for (const [k, v] of userVars) resolved = substitute(resolved, k, v);
    resolved = simplify(resolved);
    return print(resolved);

  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

function runTests() {
  const OK = "  \x1b[32m✓\x1b[0m";
  const FAIL = "  \x1b[31m✗\x1b[0m";
  let passed = 0, failed = 0;

  function check(name: string, got: string, expected: string) {
    if (got.trim() === expected.trim()) {
      console.log(`${OK} ${name}: ${got}`);
      passed++;
    } else {
      console.log(`${FAIL} ${name}: got "${got}", expected "${expected}"`);
      failed++;
    }
  }

  console.log("\n═══ Simplify ═══");
  check("x + 0", print(simplify(parse("x + 0"))), "x");
  check("0 + x", print(simplify(parse("0 + x"))), "x");
  check("x * 1", print(simplify(parse("x * 1"))), "x");
  check("x * 0", print(simplify(parse("x * 0"))), "0");
  check("x^0", print(simplify(parse("x^0"))), "1");
  check("x^1", print(simplify(parse("x^1"))), "x");
  check("2 + 3", print(simplify(parse("2 + 3"))), "5");
  check("2 * 3", print(simplify(parse("2 * 3"))), "6");
  check("2*x + 3*x", print(simplify(parse("2*x + 3*x"))), "5*x");
  check("x + x", print(simplify(parse("x + x"))), "2*x");
  check("x * x", print(simplify(parse("x * x"))), "x^2");
  check("x^2 * x^3", print(simplify(parse("x^2 * x^3"))), "x^5");

  console.log("\n═══ Expand ═══");
  check("(x+1)^2", print(expand(parse("(x+1)^2"))), "x^2 + 2*x + 1");
  check("(x+1)*(x-1)", print(expand(parse("(x+1)*(x-1)"))), "x^2 + -1");
  check("(a+b)*c", print(expand(parse("(a+b)*c"))), "a*c + b*c");
  check("2*(x+3)", print(expand(parse("2*(x+3)"))), "2*x + 6");

  console.log("\n═══ Differentiate ═══");
  check("d/dx x^2", print(simplify(diff(parse("x^2"), "x"))), "2*x");
  check("d/dx x^3", print(simplify(diff(parse("x^3"), "x"))), "3*x^2");
  check("d/dx sin(x)", print(simplify(diff(parse("sin(x)"), "x"))), "cos(x)");
  check("d/dx cos(x)", print(simplify(diff(parse("cos(x)"), "x"))), "-sin(x)");
  check("d/dx exp(x)", print(simplify(diff(parse("exp(x)"), "x"))), "exp(x)");
  check("d/dx ln(x)", print(simplify(diff(parse("ln(x)"), "x"))), "1/x");
  check("d/dx 5", print(simplify(diff(parse("5"), "x"))), "0");
  check("d/dx 3*x", print(simplify(diff(parse("3*x"), "x"))), "3");
  // Chain rule
  check("d/dx sin(2*x)", print(simplify(diff(parse("sin(2*x)"), "x"))), "2*cos(2*x)");
  check("d/dx exp(x^2)", print(simplify(diff(parse("exp(x^2)"), "x"))), "2*exp(x^2)*x");
  // Product rule
  check("d/dx x*sin(x)", print(simplify(diff(parse("x*sin(x)"), "x"))), "sin(x) + x*cos(x)");
  // Second derivative
  check("d²/dx² x^3", print(simplify(diff(diff(parse("x^3"), "x"), "x"))), "6*x");
  check("d²/dx² sin(x)", print(simplify(diff(diff(parse("sin(x)"), "x"), "x"))), "-sin(x)");

  console.log("\n═══ Integrate ═══");
  check("∫ x dx", print(simplify(integrate(parse("x"), "x"))), "x^2/2");
  check("∫ x^2 dx", print(simplify(integrate(parse("x^2"), "x"))), "x^3/3");
  check("∫ 1/x dx", print(simplify(integrate(parse("x^(-1)"), "x"))), "ln(abs(x))");
  check("∫ sin(x) dx", print(simplify(integrate(parse("sin(x)"), "x"))), "-cos(x)");
  check("∫ cos(x) dx", print(simplify(integrate(parse("cos(x)"), "x"))), "sin(x)");
  check("∫ exp(x) dx", print(simplify(integrate(parse("exp(x)"), "x"))), "exp(x)");
  check("∫ 3*x^2 dx", print(simplify(integrate(parse("3*x^2"), "x"))), "x^3");
  check("∫ 5 dx", print(simplify(integrate(parse("5"), "x"))), "5*x");
  check("∫ (x+1) dx", print(simplify(integrate(parse("x + 1"), "x"))), "x^2/2 + x");

  console.log("\n═══ Solve ═══");
  check("x + 3 = 0", processLine("solve(x + 3, x)"), "x = -3");
  check("2*x - 6 = 0", processLine("solve(2*x - 6, x)"), "x = 3");
  check("x^2 - 4 = 0", processLine("solve(x^2 - 4, x)").split("\n")[0], "x_1 = 2");
  check("x^2 - 4 root 2", processLine("solve(x^2 - 4, x)").split("\n")[1], "x_2 = -2");
  check("x^2 - 5*x + 6", processLine("solve(x^2 - 5*x + 6, x)").split("\n")[0], "x_1 = 3");
  check("x^3-6x^2+11x-6", processLine("solve(x^3 - 6*x^2 + 11*x - 6, x)").split("\n").length >= 2 ? "ok" : "fail", "ok");

  console.log("\n═══ Factor ═══");
  check("x^2 - 1", processLine("factor(x^2 - 1)"), "(x - 1)*(x + 1)");
  check("x^2 - 4", processLine("factor(x^2 - 4)"), "(x - 2)*(x + 2)");
  check("x^3-6x^2+11x-6", processLine("factor(x^3 - 6*x^2 + 11*x - 6)"), "(x - 1)*(x - 2)*(x - 3)");

  console.log("\n═══ Taylor Series ═══");
  check("taylor exp(x) n=3", print(taylor(parse("exp(x)"), "x", num(0), 3)),
    "x + x^2/2 + x^3/6 + 1");
  check("taylor sin(x) n=3", print(taylor(parse("sin(x)"), "x", num(0), 3)),
    "x - x^3/6");

  console.log("\n═══ ODE (dsolve) ═══");
  // y' = y → y = C1*exp(x)
  check("y'=y", processLine("dsolve(y' = y)"), "y = C1*exp(x)");
  // y' = 2*y → y = C1*exp(2*x)
  check("y'=2y", processLine("dsolve(y' = 2*y)"), "y = C1*exp(2*x)");
  // y' = x → y = x^2/2 + C1
  check("y'=x", processLine("dsolve(y' = x)"), "y = x^2/2 + C1");
  // y'' = 0 → y = C1*x + C2
  check("y''=0", processLine("dsolve(y'' = 0)"), "y = C1 + C2*x");
  // y'' + y = 0 → y = C1*cos(x) + C2*sin(x)  (characteristic: r^2+1=0)
  const ode5 = processLine("dsolve(y'' = -y)");
  check("y''+y=0 has sin", ode5.includes("sin") && ode5.includes("cos") ? "ok" : ode5, "ok");
  // y'' - y = 0 → y = C1*e^x + C2*e^(-x)
  const ode6 = processLine("dsolve(y'' = y)");
  check("y''-y=0 has exp", ode6.includes("exp") ? "ok" : ode6, "ok");

  console.log("\n═══ REPL Commands ═══");
  check("simplify x+0", processLine("simplify(x + 0)"), "x");
  check("expand (a+b)^2", processLine("expand((a+b)^2)"), "a^2 + 2*a*b + b^2");
  check("diff(x^3, x)", processLine("diff(x^3, x)"), "3*x^2");
  check("integrate(x^2, x)", processLine("integrate(x^2, x)"), "x^3/3");

  console.log("\n══════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log("  \x1b[32mALL TESTS PASSED\x1b[0m");
  else console.log("  \x1b[31mSOME TESTS FAILED\x1b[0m");
  console.log("══════════════════════════════════════════════\n");
}

// ═══════════════════════════════════════════════════════════
// REPL
// ═══════════════════════════════════════════════════════════

function startREPL() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  Hekatan miniCAS v0.1                    ║");
  console.log("║  Symbolic Math Engine                    ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log("║  Comandos:                               ║");
  console.log("║    diff(expr, x)     — derivada          ║");
  console.log("║    integrate(expr,x) — integral           ║");
  console.log("║    solve(expr, x)    — resolver           ║");
  console.log("║    expand(expr)      — expandir           ║");
  console.log("║    factor(expr)      — factorizar         ║");
  console.log("║    taylor(f, x,0,n)  — serie Taylor       ║");
  console.log("║    dsolve(y' = f)    — ecuacion dif.      ║");
  console.log("║    simplify(expr)    — simplificar        ║");
  console.log("║    eval(expr)        — evaluar numerico   ║");
  console.log("║    exit / quit       — salir              ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\x1b[36mCAS>\x1b[0m ",
  });

  rl.prompt();
  rl.on("line", (line: string) => {
    const input = line.trim();
    if (input === "exit" || input === "quit") { rl.close(); return; }
    if (!input) { rl.prompt(); return; }
    const result = processLine(input);
    if (result) console.log(`  \x1b[33m→\x1b[0m ${result}\n`);
    rl.prompt();
  });
  rl.on("close", () => { console.log("\nAdios!"); process.exit(0); });
}

// ═══════════════════════════════════════════════════════════
// HTML REPORT — styled like Hekatan Web output
// ═══════════════════════════════════════════════════════════

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convert symbolic expression to HTML with styled variables/operators */
function exprToHtml(s: string): string {
  // Wrap function names: sin, cos, etc.
  let h = escHtml(s);
  h = h.replace(/\b(sin|cos|tan|asin|acos|atan|exp|ln|log|sqrt|abs|sinh|cosh|tanh)\b/g,
    '<span class="fn">$1</span>');
  // Wrap variables (single letters or short ids not preceded by class=)
  h = h.replace(/\b([a-zA-Z_]\w*)\b(?!["<])/g, (m) => {
    if (/^(sin|cos|tan|asin|acos|atan|exp|ln|log|sqrt|abs|sinh|cosh|tanh|pi|fn)$/.test(m)) return m;
    return `<var>${m}</var>`;
  });
  // Style operators
  h = h.replace(/(\+|-|=)/g, '<span class="op">$1</span>');
  h = h.replace(/\*/g, '<span class="op">&middot;</span>');
  h = h.replace(/\^(\w+)/g, '<sup>$1</sup>');
  h = h.replace(/\^(\([^)]+\))/g, (_, inner) => `<sup>${inner.slice(1, -1)}</sup>`);
  return h;
}

function generateReport() {
  const examples = [
    "# Hekatan miniCAS — Reporte Simbolico",
    "> Motor de algebra simbolica escrito en TypeScript puro",
    "",
    "## Simplificacion",
    "simplify(x + 0)",
    "simplify(x * 1)",
    "simplify(2*x + 3*x)",
    "simplify(x * x)",
    "simplify(x^2 * x^3)",
    "",
    "## Expansion de Polinomios",
    "expand((x+1)^2)",
    "expand((x+1)*(x-1))",
    "expand((a+b)^3)",
    "expand(2*(x+3))",
    "",
    "## Factorizacion",
    "factor(x^2 - 1)",
    "factor(x^2 - 4)",
    "factor(x^3 - 6*x^2 + 11*x - 6)",
    "",
    "## Derivadas Simbolicas",
    "> Regla de la cadena, producto, cociente",
    "diff(x^3, x)",
    "diff(sin(x), x)",
    "diff(cos(x), x)",
    "diff(exp(x), x)",
    "diff(ln(x), x)",
    "diff(x^3*sin(x), x)",
    "diff(sin(2*x), x)",
    "diff(exp(x^2), x)",
    "diff(exp(x)*sin(x), x)",
    "> Segunda derivada",
    "diff(diff(x^4, x), x)",
    "diff(diff(sin(x), x), x)",
    "",
    "## Integrales Simbolicas",
    "integrate(x, x)",
    "integrate(x^2, x)",
    "integrate(x^(-1), x)",
    "integrate(sin(x), x)",
    "integrate(cos(x), x)",
    "integrate(exp(x), x)",
    "integrate(3*x^2, x)",
    "integrate(ln(x), x)",
    "",
    "## Series de Taylor",
    "> Expansion alrededor de x=0",
    "taylor(exp(x), x, 0, 4)",
    "taylor(sin(x), x, 0, 5)",
    "taylor(cos(x), x, 0, 4)",
    "",
    "## Resolver Ecuaciones",
    "> Lineales, cuadraticas, cubicas",
    "solve(x + 3, x)",
    "solve(2*x - 6, x)",
    "solve(x^2 - 4, x)",
    "solve(x^2 - 5*x + 6, x)",
    "solve(x^3 - 6*x^2 + 11*x - 6, x)",
    "",
    "## Ecuaciones Diferenciales Ordinarias",
    "> y' = f(x,y) con solucion general",
    "dsolve(y' = y)",
    "dsolve(y' = 2*y)",
    "dsolve(y' = -3*y)",
    "dsolve(y' = x)",
    "dsolve(y' = x^2)",
    "> Segundo orden: y'' + ay' + by = 0",
    "dsolve(y'' = -y)",
    "dsolve(y'' = -4*y)",
    "dsolve(y'' = y)",
    "dsolve(y'' = -9*y)",
    "dsolve(y'' = 0)",
  ];

  const lines: string[] = [];
  for (const line of examples) {
    if (!line) { lines.push('<div class="spacer"></div>'); continue; }
    if (line.startsWith("# ")) {
      lines.push(`<h1>${escHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      lines.push(`<h2>${escHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("> ")) {
      lines.push(`<p class="desc">${escHtml(line.slice(2))}</p>`);
      continue;
    }
    // Expression line
    const result = processLine(line);
    lines.push(`<div class="eq-line">
      <span class="input">${exprToHtml(line)}</span>
      <span class="arrow">&rarr;</span>
      <span class="result">${exprToHtml(result)}</span>
    </div>`);
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Hekatan miniCAS — Reporte</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #11111b;
    color: #cdd6f4;
    font-family: 'Inter', 'Segoe UI', sans-serif;
    font-size: 15px;
    display: flex;
    justify-content: center;
    padding: 40px 20px;
  }

  .page {
    background: #1e1e2e;
    width: 800px;
    padding: 40px 50px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  h1 {
    font-family: 'Inter', sans-serif;
    font-size: 28px;
    font-weight: 600;
    color: #cba6f7;
    margin: 0 0 4px 0;
    padding-bottom: 12px;
    border-bottom: 2px solid #313244;
  }

  h2 {
    font-family: 'Inter', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: #89b4fa;
    margin: 28px 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #313244;
  }

  .desc {
    color: #9399b2;
    font-style: italic;
    font-size: 13px;
    margin: 2px 0 6px 0;
  }

  .spacer { height: 8px; }

  .eq-line {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 14px;
    margin: 5px 0;
    padding: 6px 12px;
    background: #181825;
    border-radius: 6px;
    border-left: 3px solid #313244;
    display: flex;
    align-items: baseline;
    gap: 10px;
    line-height: 1.6;
  }

  .eq-line .input {
    color: #a6adc8;
    min-width: 320px;
  }

  .eq-line .arrow {
    color: #f9e2af;
    font-weight: bold;
    flex-shrink: 0;
  }

  .eq-line .result {
    color: #a6e3a1;
    font-weight: 600;
  }

  .eq-line var {
    color: #f5c2e7;
    font-style: italic;
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 15px;
  }

  .eq-line .fn {
    color: #89b4fa;
    font-style: normal;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
  }

  .eq-line .op {
    color: #f9e2af;
    font-style: normal;
    padding: 0 1px;
  }

  .eq-line sup {
    font-size: 0.7em;
    vertical-align: super;
    color: #fab387;
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #11111b; }
  ::-webkit-scrollbar-thumb { background: #45475a; border-radius: 4px; }
</style>
</head>
<body>
<div class="page">
${lines.join("\n")}
</div>
</body>
</html>`;

  // Write to file
  const path = process.cwd() + "/miniCAS-report.html";
  writeFileSync(path, html, "utf-8");
  console.log(`\x1b[32m✓\x1b[0m Report generated: ${path}`);
  console.log("  Open in browser to view.");
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

const args = process.argv.slice(2);
if (args[0] === "test") {
  runTests();
} else if (args[0] === "report") {
  generateReport();
} else if (args[0] === "eval" && args[1]) {
  console.log(processLine(args.slice(1).join(" ")));
} else {
  startREPL();
}

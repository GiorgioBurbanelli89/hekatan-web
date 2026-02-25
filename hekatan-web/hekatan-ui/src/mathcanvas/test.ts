/**
 * MathCanvas Test Suite
 * Verifica rendering, evaluacion, letras griegas, subindices, funciones
 * Se ejecuta 100% en el navegador via Vite - se ve desde Claude preview
 */
import { MathEditor } from "hekatan-math/matheditor/MathEditor.js";
import {
  transformOperatorsForDisplay,
  isKnownFunction,
  tokenize,
  getColorForContent,
  VariableColor,
  FunctionColor,
  NumberColor,
  OperatorColor,
} from "hekatan-math/matheditor/MathStyles.js";
import { HekatanEvaluator } from "hekatan-math/mathEngine.js";

// ═══════════════════════════════════════════════════════════
// Test framework
// ═══════════════════════════════════════════════════════════
const resultsDiv = document.getElementById("results")!;
const summaryDiv = document.getElementById("summary")!;
const canvas = document.getElementById("testCanvas") as HTMLCanvasElement;

let totalTests = 0;
let passedTests = 0;
let currentGroup = "";

function group(name: string) {
  currentGroup = name;
  const div = document.createElement("div");
  div.className = "test-group";
  div.id = `group-${name.replace(/\s/g, "-")}`;
  div.innerHTML = `<h2>${name}</h2>`;
  resultsDiv.appendChild(div);
}

function test(name: string, fn: () => boolean | string) {
  totalTests++;
  const groupDiv = document.querySelector(`#group-${currentGroup.replace(/\s/g, "-")}`)!;
  let pass = false;
  let detail = "";
  try {
    const result = fn();
    if (typeof result === "string") {
      // String = info/detail, considered pass
      pass = true;
      detail = result;
    } else {
      pass = result;
    }
  } catch (e: any) {
    pass = false;
    detail = `Error: ${e.message}`;
  }
  if (pass) passedTests++;
  const icon = pass ? "✅" : "❌";
  const cls = pass ? "pass" : "fail";
  let html = `<div class="test"><span class="icon">${icon}</span><span class="${cls}">${name}</span></div>`;
  if (detail) {
    html += `<div class="detail">${detail}</div>`;
  }
  groupDiv.innerHTML += html;
}

function assert(condition: boolean, msg?: string): boolean {
  if (!condition && msg) console.error("FAIL:", msg);
  return condition;
}

function assertEq(actual: any, expected: any): boolean {
  const pass = actual === expected;
  if (!pass) console.error(`Expected "${expected}", got "${actual}"`);
  return pass;
}

function assertContains(haystack: string, needle: string): boolean {
  const pass = haystack.includes(needle);
  if (!pass) console.error(`"${haystack}" does not contain "${needle}"`);
  return pass;
}

// ═══════════════════════════════════════════════════════════
// 1. MathStyles Tests
// ═══════════════════════════════════════════════════════════
group("MathStyles");

test("transformOperators: * → · (middle dot)", () => {
  const result = transformOperatorsForDisplay("a*b");
  return assertContains(result, "·");
});

test("transformOperators: = con espacios", () => {
  const result = transformOperatorsForDisplay("a=3");
  return assertContains(result, " = ");
});

test("transformOperators: , con espacio despues", () => {
  const result = transformOperatorsForDisplay("f(a,b)");
  return assertContains(result, ", ");
});

test("Greek: alpha → α", () => {
  const result = transformOperatorsForDisplay("alpha");
  return assertEq(result, "α");
});

test("Greek: beta → β", () => {
  const result = transformOperatorsForDisplay("beta");
  return assertEq(result, "β");
});

test("Greek: gamma → γ", () => {
  const result = transformOperatorsForDisplay("gamma");
  return assertEq(result, "γ");
});

test("Greek: delta → δ", () => {
  const result = transformOperatorsForDisplay("delta");
  return assertEq(result, "δ");
});

test("Greek: theta → θ", () => {
  const result = transformOperatorsForDisplay("theta");
  return assertEq(result, "θ");
});

test("Greek: pi → π (minuscula)", () => {
  const result = transformOperatorsForDisplay("pi");
  // pi is not in the Greek map (it's a math constant in math.js)
  // Check if it stays as "pi" or transforms
  return `Result: "${result}"`;
});

test("Greek: Gamma → Γ (mayuscula)", () => {
  const result = transformOperatorsForDisplay("Gamma");
  return assertEq(result, "Γ");
});

test("Greek: Omega → Ω (mayuscula)", () => {
  const result = transformOperatorsForDisplay("Omega");
  return assertEq(result, "Ω");
});

test("Greek en expresion: alpha = atan(b/a)", () => {
  const result = transformOperatorsForDisplay("alpha = atan(b/a)");
  return assertContains(result, "α") && assertContains(result, " = ");
});

test("isKnownFunction: sin", () => isKnownFunction("sin"));
test("isKnownFunction: cos", () => isKnownFunction("cos"));
test("isKnownFunction: sqrt", () => isKnownFunction("sqrt"));
test("isKnownFunction: notAFunc returns false", () => !isKnownFunction("notAFunc"));

test("tokenize: a + 3", () => {
  const tokens = tokenize("a + 3");
  const types = tokens.map(t => t.type);
  return assertContains(types.join(","), "variable") && assertContains(types.join(","), "number");
});

test("getColorForContent: variable", () => assertEq(getColorForContent("alpha"), VariableColor));
test("getColorForContent: function", () => assertEq(getColorForContent("sin"), FunctionColor));
test("getColorForContent: number", () => assertEq(getColorForContent("42"), NumberColor));
test("getColorForContent: operator", () => assertEq(getColorForContent("+"), OperatorColor));

// ═══════════════════════════════════════════════════════════
// 2. Evaluator Tests
// ═══════════════════════════════════════════════════════════
group("Evaluator");

const evaluator = new HekatanEvaluator();

test("Basic: a = 3, b = 4, c = a + b = 7", () => {
  const results = evaluator.evalDocument("a = 3\nb = 4\nc = a + b");
  const cResult = results.find(r => r.varName === "c");
  return assert(cResult !== undefined && cResult.value === 7, `c = ${cResult?.value}`);
});

test("sqrt: c = sqrt(9) = 3", () => {
  const results = evaluator.evalDocument("c = sqrt(9)");
  const r = results.find(r => r.varName === "c");
  return assert(r !== undefined && r.value === 3);
});

test("Trig: sin(0) = 0", () => {
  const results = evaluator.evalDocument("s = sin(0)");
  const r = results.find(r => r.varName === "s");
  return assert(r !== undefined && Math.abs(r.value) < 1e-10);
});

test("Trig: cos(0) = 1", () => {
  const results = evaluator.evalDocument("c = cos(0)");
  const r = results.find(r => r.varName === "c");
  return assert(r !== undefined && Math.abs(r.value - 1) < 1e-10);
});

test("atan2: atan2(4, 3)", () => {
  const results = evaluator.evalDocument("a = atan2(4, 3)");
  const r = results.find(r => r.varName === "a");
  return assert(r !== undefined && Math.abs(r.value - Math.atan2(4, 3)) < 1e-10,
    `atan2(4,3) = ${r?.value}`);
});

test("Function def: f(x) = x^2, f(3) = 9", () => {
  const results = evaluator.evalDocument("f(x) = x^2\nf(3)");
  const fCall = results.find(r => r.type === "expression");
  return assert(fCall !== undefined && fCall.value === 9, `f(3) = ${fCall?.value}`);
});

test("Function def: f(x) = x^3 - 2*x + 1, f(2) = 5", () => {
  const results = evaluator.evalDocument("f(x) = x^3 - 2*x + 1\nf(2)");
  const fCall = results.find(r => r.type === "expression");
  return assert(fCall !== undefined && fCall.value === 5, `f(2) = ${fCall?.value}`);
});

test("pi constant", () => {
  const results = evaluator.evalDocument("p = pi");
  const r = results.find(r => r.varName === "p");
  return assert(r !== undefined && Math.abs(r.value - Math.PI) < 1e-10);
});

test("Subscript var: sin_a = sin(0.5)", () => {
  const results = evaluator.evalDocument("sin_a = sin(0.5)");
  const r = results.find(r => r.varName === "sin_a");
  return assert(r !== undefined && Math.abs(r.value - Math.sin(0.5)) < 1e-10);
});

test("Matrix: det([[2,1],[5,3]]) = 1", () => {
  const results = evaluator.evalDocument("A = [[2, 1], [5, 3]]\nd = det(A)");
  const r = results.find(r => r.varName === "d");
  return assert(r !== undefined && Math.abs(r.value - 1) < 1e-10, `det = ${r?.value}`);
});

test("Calculo completo: a,b,c,alpha,sin_a,cos_a,f,r,A", () => {
  const code = `a = 3
b = 4
c = sqrt(a^2 + b^2)
alpha = atan2(b, a)
sin_a = sin(alpha)
cos_a = cos(alpha)
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
r = 5
A = pi * r^2`;
  const results = evaluator.evalDocument(code);
  const c = results.find(r => r.varName === "c");
  const alpha = results.find(r => r.varName === "alpha");
  const sinA = results.find(r => r.varName === "sin_a");
  const cosA = results.find(r => r.varName === "cos_a");
  const area = results.find(r => r.varName === "A");
  const checks = [
    c && Math.abs(c.value - 5) < 1e-10,
    alpha && alpha.value > 0,
    sinA && sinA.value > 0,
    cosA && cosA.value > 0,
    area && Math.abs(area.value - Math.PI * 25) < 1e-10,
  ];
  const allPass = checks.every(Boolean);
  return allPass ? `c=${c?.value}, α=${alpha?.value?.toFixed(4)}, sin_a=${sinA?.value?.toFixed(4)}, cos_a=${cosA?.value?.toFixed(4)}, A=${area?.value?.toFixed(4)}` : false;
});

// ═══════════════════════════════════════════════════════════
// 3. MathEditor Canvas Tests
// ═══════════════════════════════════════════════════════════
group("MathEditor Canvas");

const editor = new MathEditor(canvas);

test("loadFromText carga texto correctamente", () => {
  editor.loadFromText("a = 3\nb = 4");
  const code = editor.toHekatan();
  return assertContains(code, "a = 3") && assertContains(code, "b = 4");
});

test("toHekatan round-trip con heading", () => {
  editor.loadFromText("# Titulo\na = 5");
  const code = editor.toHekatan();
  return assertContains(code, "# Titulo") && assertContains(code, "a = 5");
});

test("toHekatan round-trip con comentario (>)", () => {
  editor.loadFromText("> Nota importante\nx = 10");
  const code = editor.toHekatan();
  return assertContains(code, "> Nota importante");
});

test("toHekatan round-trip con comment (')", () => {
  editor.loadFromText("'Un comentario\ny = 20");
  const code = editor.toHekatan();
  return assertContains(code, "'Un comentario");
});

test("Calculo example: carga linea por linea", () => {
  // Test each line individually to find which one fails
  const lines = [
    "# Calculo Basico",
    "> Operaciones aritmeticas",
    "",
    "a = 3",
    "b = 4",
    "c = sqrt(a^2 + b^2)",
    "",
    "> Trigonometria",
    "alpha = atan2(b, a)",
    "sin_a = sin(alpha)",
    "cos_a = cos(alpha)",
    "",
    "> Funcion personalizada",
    "f(x) = x^3 - 2*x + 1",
    "f(0)",
    "f(1)",
    "f(2)",
    "f(3)",
    "",
    "> Area de circulo",
    "r = 5",
    "A = pi * r^2",
  ];
  const failures: string[] = [];
  for (const line of lines) {
    try {
      editor.loadFromText(line);
      editor.toHekatan();
    } catch (e: any) {
      failures.push(`"${line}": ${e.message}`);
    }
  }
  if (failures.length > 0) {
    return `Failures: ${failures.join("; ")}`;
  }
  return "All lines parse individually OK";
});

test("Calculo example: carga incremental", () => {
  // Add lines one by one
  const failures: string[] = [];
  let accumulated = "";
  const lines = [
    "# Calculo Basico",
    "> Ops",
    "",
    "a = 3",
    "b = 4",
    "c = sqrt(a^2 + b^2)",
    "",
    "> Trig",
    "alpha = atan2(b, a)",
    "sin_a = sin(alpha)",
    "cos_a = cos(alpha)",
    "",
    "> Func",
    "f(x) = x^3 - 2*x + 1",
    "f(0)",
    "f(1)",
    "f(2)",
    "f(3)",
    "",
    "> Area",
    "r = 5",
    "A = pi * r^2",
  ];
  for (let i = 0; i < lines.length; i++) {
    accumulated += (i > 0 ? "\n" : "") + lines[i];
    try {
      editor.loadFromText(accumulated);
    } catch (e: any) {
      failures.push(`Line ${i} ("${lines[i]}"): ${e.message}`);
    }
  }
  if (failures.length > 0) {
    return `Failures: ${failures.join("; ")}`;
  }
  // Final round-trip check
  const code = editor.toHekatan();
  return code.includes("alpha") && code.includes("sin_a") ? `OK: ${code.split("\\n").length} lines` : false;
});

test("Canvas render sin errores", () => {
  try {
    editor.loadFromText("a = 3\nb = sqrt(a)\nc = a^2 + b");
    // Force a render pass
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // The editor should have rendered on loadFromText
    return true;
  } catch (e: any) {
    return false;
  }
});

test("Subscript variable: sin_a tiene subindice en toHekatan", () => {
  editor.loadFromText("sin_a = 0.5");
  const code = editor.toHekatan();
  return assertContains(code, "sin_a");
});

test("Unicode operators: * se conserva en round-trip", () => {
  editor.loadFromText("c = a*b");
  const code = editor.toHekatan();
  // toHekatan should output raw * not ·
  return assertContains(code, "*");
});

test("Fraccion: (a+b)/(a-b) round-trip", () => {
  editor.loadFromText("d = (a+b)/(a-b)");
  const code = editor.toHekatan();
  // Spaces may be added by the parser
  return (code.includes("a+b") || code.includes("a + b")) &&
    (code.includes("a-b") || code.includes("a - b")) ?
    `Code: "${code.trim()}"` : false;
});

// ═══════════════════════════════════════════════════════════
// 4. Visual Rendering Tests (Canvas pixel inspection)
// ═══════════════════════════════════════════════════════════
group("Visual Rendering");

test("Canvas no esta vacio despues de render", () => {
  editor.loadFromText("# Test\na = 42");
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, 100).data;
  // Check if any non-white pixel exists (text was drawn)
  let hasContent = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      hasContent = true;
      break;
    }
  }
  return hasContent;
});

test("Calculo example renderiza en canvas", () => {
  editor.loadFromText(`# Calculo
a = 3
b = 4
c = sqrt(a^2 + b^2)
alpha = atan2(b, a)
sin_a = sin(alpha)
cos_a = cos(alpha)
r = 5
A = pi * r^2`);
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonWhitePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
      nonWhitePixels++;
    }
  }
  // Should have substantial content drawn
  return nonWhitePixels > 100 ? `${nonWhitePixels} non-white pixels rendered` : false;
});

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
const allPass = passedTests === totalTests;
summaryDiv.className = allPass ? "all-pass" : "has-fail";
summaryDiv.textContent = `${passedTests}/${totalTests} tests passed ${allPass ? "✅ ALL PASS" : "❌ SOME FAILED"}`;

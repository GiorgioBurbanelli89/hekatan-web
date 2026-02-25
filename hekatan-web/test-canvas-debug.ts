/**
 * Debug: reproduce Invalid array length with mock canvas
 * Run: npx tsx test-canvas-debug.ts
 */

// Mock CanvasRenderingContext2D
class MockCtx {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  textAlign = "left";
  font = "";
  measureText(text: string) {
    return { width: text.length * 8 };
  }
  fillRect() {}
  strokeRect() {}
  fillText() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  arc() {}
  fill() {}
  closePath() {}
  save() {}
  restore() {}
  setLineDash() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  clearRect() {}
  rect() {}
  clip() {}
  translate() {}
  rotate() {}
  scale() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
}

// Mock HTMLCanvasElement
class MockCanvas {
  width = 800;
  height = 600;
  getContext() {
    return new MockCtx();
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }
  addEventListener() {}
  removeEventListener() {}
  style = {};
}

// Polyfill globals
(globalThis as any).HTMLCanvasElement = MockCanvas;
(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag === "canvas") return new MockCanvas();
    return {};
  },
};
(globalThis as any).window = globalThis;
(globalThis as any).requestAnimationFrame = (fn: Function) => setTimeout(fn, 16);
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  constructor(cb: any) {}
};

// Now import MathEditor
import { MathEditor } from "./hekatan-math/src/matheditor/MathEditor.js";

const canvas = new MockCanvas() as any;
const editor = new MathEditor(canvas);

const CALCULO = `# Calculo Basico
> Operaciones aritmeticas

a = 3
b = 4
c = sqrt(a^2 + b^2)

> Trigonometria
alpha = atan2(b, a)
sin_a = sin(alpha)
cos_a = cos(alpha)

> Funcion personalizada
f(x) = x^3 - 2*x + 1
f(0)
f(1)
f(2)
f(3)

> Area de circulo
r = 5
A = pi * r^2`;

const lines = CALCULO.split("\n");

console.log("=== Test 1: Each line individually ===\n");
for (let i = 0; i < lines.length; i++) {
  try {
    editor.loadFromText(lines[i]);
    const out = editor.toHekatan();
    console.log(`[${i}] OK: "${lines[i]}" => "${out}"`);
  } catch (e: any) {
    console.log(`[${i}] FAIL: "${lines[i]}" => ${e.message}`);
    console.log(`    Stack: ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`);
  }
}

console.log("\n=== Test 2: Incremental accumulation ===\n");
for (let n = 1; n <= lines.length; n++) {
  const text = lines.slice(0, n).join("\n");
  try {
    editor.loadFromText(text);
    console.log(`[${n} lines] OK`);
  } catch (e: any) {
    console.log(`[${n} lines] FAIL adding: "${lines[n-1]}"`);
    console.log(`    Error: ${e.message}`);
    console.log(`    Stack: ${e.stack?.split("\n").slice(0, 5).join("\n    ")}`);
    break;
  }
}

console.log("\n=== Test 3: Full Calculo example ===\n");
try {
  editor.loadFromText(CALCULO);
  const out = editor.toHekatan();
  console.log("OK! Output length:", out.length);
  console.log("First 200 chars:", out.slice(0, 200));
} catch (e: any) {
  console.log("FAIL:", e.message);
  console.log("Stack:", e.stack);
}

/**
 * Debug test: identify which line of Calculo example causes Invalid array length
 * Run with: node test-debug.mjs
 */
import { create, all } from 'mathjs';

const math = create(all);

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

const scope = {};

console.log("=== Testing each line with math.js evaluate ===\n");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line || line.startsWith("#") || line.startsWith(">") || line.startsWith("'")) {
    console.log(`[${i}] SKIP: "${line}"`);
    continue;
  }
  try {
    const result = math.evaluate(line, scope);
    const type = result && typeof result === 'object' && typeof result.toArray === 'function'
      ? 'matrix'
      : typeof result;
    console.log(`[${i}] OK: "${line}" => ${result} (${type})`);
  } catch (e) {
    console.log(`[${i}] ERROR: "${line}" => ${e.message}`);
  }
}

console.log("\n=== Testing multiline evaluate ===\n");
try {
  const scope2 = {};
  const evalLines = lines.filter(l => {
    const t = l.trim();
    return t && !t.startsWith("#") && !t.startsWith(">") && !t.startsWith("'");
  });
  console.log("Lines to eval:", evalLines);
  for (let i = 0; i < evalLines.length; i++) {
    try {
      const result = math.evaluate(evalLines[i], scope2);
      console.log(`[${i}] OK: "${evalLines[i]}" => ${result}`);
    } catch (e) {
      console.log(`[${i}] ERROR: "${evalLines[i]}" => ${e.message}`);
    }
  }
} catch (e) {
  console.log("Multiline ERROR:", e.message);
}

console.log("\n=== Testing new Array() edge cases ===\n");
try {
  console.log("new Array(0):", new Array(0));
  console.log("new Array(3):", new Array(3));
  console.log("new Array(-1):", new Array(-1)); // This should throw
} catch (e) {
  console.log("new Array(-1) throws:", e.message);
}

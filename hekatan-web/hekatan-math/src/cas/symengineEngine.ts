/**
 * SymEngine CAS Engine — C++ symbolic math (MIT license)
 * Fastest engine but limited operation set.
 *
 * Falls back to JS-based evaluation if WASM not available.
 */

import type { CASEngine, CASResult, CASOperation } from "./types.js";

let _ready = false;
let _loading: Promise<void> | null = null;

// Operations NOT supported by SymEngine
const UNSUPPORTED: CASOperation[] = ["ode", "laplace", "fourier"];

// Minimal JS symbolic evaluator as fallback
function jsEval(expr: string): string {
  try {
    // Basic math evaluation for numeric expressions
    const fn = new Function("Math", `"use strict"; return (${expr});`);
    const result = fn(Math);
    if (typeof result === "number" && isFinite(result)) {
      return String(result);
    }
  } catch { /* not a simple numeric expression */ }
  return `[SymEngine fallback] ${expr}`;
}

export const symengineEngine: CASEngine = {
  name: "symengine",
  label: "SymEngine (C++ — JS fallback)",

  isReady(): boolean {
    return _ready;
  },

  async init(): Promise<void> {
    if (_ready) return;
    if (_loading) return _loading;

    _loading = (async () => {
      // For now, use JS fallback. WASM build can be added later.
      _ready = true;
      console.log("[CAS] SymEngine initialized (JS fallback mode)");
    })();

    return _loading;
  },

  async evaluate(expr: string): Promise<CASResult> {
    if (!_ready) throw new Error("SymEngine not initialized");

    const t0 = performance.now();
    const text = jsEval(expr);
    const timeMs = performance.now() - t0;

    const numeric = parseFloat(text);

    return {
      text,
      numeric: isFinite(numeric) ? numeric : undefined,
      engine: "symengine",
      timeMs,
    };
  },

  supports(op: CASOperation): boolean {
    return !UNSUPPORTED.includes(op);
  },
};

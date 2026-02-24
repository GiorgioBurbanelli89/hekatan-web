/**
 * SymPy CAS Engine — Python via Pyodide (WASM)
 * BSD license. Full symbolic math coverage.
 *
 * Loads Pyodide from CDN (~10 MB), then imports sympy.
 * Automatically converts math notation (^ → **) for Python compatibility.
 */

import type { CASEngine, CASResult, CASOperation } from "./types.js";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

let _pyodide: any = null;
let _loading: Promise<void> | null = null;

/** Convert math notation to Python/SymPy syntax */
function toSymPy(expr: string): string {
  // Replace ^ with ** for exponentiation (but not ^^)
  let py = expr.replace(/\^/g, "**");
  // oo is already sympy's infinity
  return py;
}

export const sympyEngine: CASEngine = {
  name: "sympy",
  label: "SymPy (Python WASM)",

  isReady(): boolean {
    return _pyodide !== null;
  },

  async init(): Promise<void> {
    if (_pyodide) return;
    if (_loading) return _loading;

    _loading = (async () => {
      // Load Pyodide script
      if (!(globalThis as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${PYODIDE_CDN}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pyodide"));
          document.head.appendChild(script);
        });
      }

      const loadPyodide = (globalThis as any).loadPyodide;
      _pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });

      // Install and import sympy
      await _pyodide.loadPackage("sympy");
      await _pyodide.runPythonAsync(`
from sympy import *
x, y, z, t, s, n, k, m, a, b, c, d = symbols('x y z t s n k m a b c d')
init_printing()

def _hekatan_eval(expr_str):
    """Evaluate a SymPy expression string and return (text, latex, numeric)"""
    try:
        _expr = eval(expr_str)
    except Exception as e:
        return (f"Error: {e}", "", None)

    _text = str(_expr)

    try:
        _ltx = latex(_expr)
    except:
        _ltx = ""

    _num = None
    try:
        _n = N(_expr)
        if _n.is_number:
            _num = float(_n)
    except:
        pass

    return (_text, _ltx, _num)
`);
      console.log("[CAS] SymPy/Pyodide loaded");
    })();

    return _loading;
  },

  async evaluate(expr: string): Promise<CASResult> {
    if (!_pyodide) throw new Error("SymPy not loaded");

    const t0 = performance.now();
    const pyExpr = toSymPy(expr);

    // Use the safe evaluator function
    const pyCode = `_hekatan_eval(${JSON.stringify(pyExpr)})`;
    const result = await _pyodide.runPythonAsync(pyCode);
    const [text, latexStr, numeric] = result.toJs();
    result.destroy(); // free Pyodide proxy
    const timeMs = performance.now() - t0;

    if (typeof text === "string" && text.startsWith("Error:")) {
      throw new Error(text);
    }

    return {
      text,
      latex: latexStr || undefined,
      numeric: numeric !== null && numeric !== undefined ? numeric : undefined,
      engine: "sympy",
      timeMs,
    };
  },

  supports(_op: CASOperation): boolean {
    return true; // SymPy supports everything
  },
};

/**
 * Giac/Xcas CAS Engine — C++ compiled to WASM
 * Used by GeoGebra in production. GPLv3 license.
 *
 * Loads giac.js from CDN (xcas.univ-grenoble-alpes.fr)
 * ~12 MB WASM binary, covers ALL symbolic operations.
 */

import type { CASEngine, CASResult, CASOperation } from "./types.js";

const GIAC_CDN = "https://xcas.univ-grenoble-alpes.fr/xcasjs";
const INIT_TIMEOUT = 45000; // 45s for initial WASM load

let _giac: any = null;
let _loading: Promise<void> | null = null;
let _initFailed = false;

export const giacEngine: CASEngine = {
  name: "giac",
  label: "Giac/Xcas (C++ WASM)",

  isReady(): boolean {
    return _giac !== null;
  },

  async init(): Promise<void> {
    if (_giac) return;
    if (_initFailed) throw new Error("Giac init previously failed");
    if (_loading) return _loading;

    _loading = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        _initFailed = true;
        reject(new Error("Giac WASM load timeout (45s)"));
      }, INIT_TIMEOUT);

      const script = document.createElement("script");
      script.src = `${GIAC_CDN}/giac.js`;
      script.onload = () => {
        const tryResolve = () => {
          const g = globalThis as any;
          if (g.Module && g.Module.ccall) {
            _giac = g.Module;
            clearTimeout(timeout);
            console.log("[CAS] Giac/Xcas WASM loaded");
            resolve();
          } else if (g.UI && g.UI.caseval) {
            _giac = { caseval: g.UI.caseval };
            clearTimeout(timeout);
            console.log("[CAS] Giac/Xcas (UI.caseval) loaded");
            resolve();
          } else {
            setTimeout(tryResolve, 300);
          }
        };
        tryResolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        _initFailed = true;
        reject(new Error("Failed to load Giac WASM from CDN"));
      };
      document.head.appendChild(script);
    });

    return _loading;
  },

  async evaluate(expr: string): Promise<CASResult> {
    if (!_giac) throw new Error("Giac not loaded");

    const t0 = performance.now();
    let text: string;

    try {
      if (_giac.caseval) {
        text = _giac.caseval(expr);
      } else if (_giac.ccall) {
        text = _giac.ccall("caseval", "string", ["string"], [expr]);
      } else {
        throw new Error("Giac: no evaluation method available");
      }
    } catch (e: any) {
      throw new Error(`Giac error: ${e.message || e}`);
    }

    const timeMs = performance.now() - t0;

    let latex: string | undefined;
    try {
      const latexExpr = `latex(${expr})`;
      if (_giac.caseval) {
        latex = _giac.caseval(latexExpr);
      } else if (_giac.ccall) {
        latex = _giac.ccall("caseval", "string", ["string"], [latexExpr]);
      }
      if (latex && latex.startsWith('"') && latex.endsWith('"')) {
        latex = latex.slice(1, -1);
      }
    } catch { /* latex is optional */ }

    return { text, latex, engine: "giac", timeMs };
  },

  supports(_op: CASOperation): boolean {
    return true;
  },
};

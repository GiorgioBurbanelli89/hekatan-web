/**
 * CAS Manager — Cascade engine system
 *
 * Tries engines in priority order. If one fails or doesn't support
 * the operation, falls back to the next one automatically.
 */

import type { CASEngine, CASResult, CASOperation, CASEngineName } from "./types.js";
import { giacEngine } from "./giacEngine.js";
import { sympyEngine } from "./sympyEngine.js";
import { maximaEngine } from "./maximaEngine.js";
import { symengineEngine } from "./symengineEngine.js";

const ALL_ENGINES: Record<CASEngineName, CASEngine> = {
  giac: giacEngine,
  sympy: sympyEngine,
  maxima: maximaEngine,
  symengine: symengineEngine,
};

// SymPy first (most reliable in browser), then Giac, Maxima, SymEngine fallback
let priority: CASEngineName[] = ["sympy", "giac", "maxima", "symengine"];

/** Detect operation type from expression string */
function detectOperation(expr: string): CASOperation {
  const e = expr.trim().toLowerCase();
  if (/\bdiff\b|\bderivative\b/.test(e)) return "diff";
  if (/\bintegrat/.test(e)) return "integrate";
  if (/\blimit\b/.test(e)) return "limit";
  if (/\bsolve\b|\broots?\b/.test(e)) return "solve";
  if (/\bode\b|\bdsolve\b/.test(e)) return "ode";
  if (/\bmatrix\b|\bdet\b|\beigenval/.test(e)) return "matrix";
  if (/\bseries\b|\btaylor\b/.test(e)) return "series";
  if (/\blaplace\b/.test(e)) return "laplace";
  if (/\bfourier\b/.test(e)) return "fourier";
  if (/\bsimplif/.test(e)) return "simplify";
  if (/\bexpand\b/.test(e)) return "expand";
  if (/\bfactor\b/.test(e)) return "factor";
  if (/\bsum\b/.test(e)) return "sum";
  if (/\bproduct\b/.test(e)) return "product";
  return "eval";
}

export const casManager = {
  /** Get all engine instances */
  get engines(): Record<CASEngineName, CASEngine> {
    return ALL_ENGINES;
  },

  /** Get current priority order */
  get priority(): CASEngineName[] {
    return [...priority];
  },

  /** Set custom priority order */
  setPriority(order: CASEngineName[]): void {
    priority = [...order];
  },

  /** Init the first available engine in priority order */
  async init(): Promise<CASEngineName | null> {
    for (const name of priority) {
      try {
        await ALL_ENGINES[name].init();
        return name;
      } catch (e) {
        console.warn(`[CAS] Failed to init ${name}:`, e);
      }
    }
    return null;
  },

  /** Init a specific engine */
  async initEngine(name: CASEngineName): Promise<void> {
    await ALL_ENGINES[name].init();
  },

  /** Init all engines in parallel */
  async initAll(): Promise<CASEngineName[]> {
    const results = await Promise.allSettled(
      priority.map(async (name) => {
        await ALL_ENGINES[name].init();
        return name;
      })
    );
    return results
      .filter((r): r is PromiseFulfilledResult<CASEngineName> => r.status === "fulfilled")
      .map((r) => r.value);
  },

  /** Evaluate with cascade: try engines in order until one works */
  async evaluate(expr: string, preferredEngine?: CASEngineName): Promise<CASResult> {
    const op = detectOperation(expr);
    const errors: string[] = [];

    // If a specific engine is requested, try it first
    const order = preferredEngine
      ? [preferredEngine, ...priority.filter((n) => n !== preferredEngine)]
      : priority;

    for (const name of order) {
      const engine = ALL_ENGINES[name];

      if (!engine.supports(op)) {
        continue;
      }

      if (!engine.isReady()) {
        try {
          await engine.init();
        } catch (e: any) {
          errors.push(`${name}: init failed — ${e.message}`);
          continue;
        }
      }

      try {
        return await engine.evaluate(expr);
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    throw new Error(
      `All CAS engines failed for "${expr}":\n${errors.join("\n")}`
    );
  },
};

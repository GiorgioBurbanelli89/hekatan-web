/**
 * Maxima CAS Engine — Common Lisp compiled to WASM
 * GPL license. Full symbolic math coverage.
 *
 * Uses Maxima-on-WASM hosted build loaded in a hidden iframe.
 */

import type { CASEngine, CASResult, CASOperation } from "./types.js";

const MAXIMA_URL = "https://maxima-on-wasm.pages.dev";

let _iframe: HTMLIFrameElement | null = null;
let _ready = false;
let _loading: Promise<void> | null = null;
let _reqId = 0;
const _pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

function onMessage(ev: MessageEvent) {
  if (ev.source !== _iframe?.contentWindow) return;
  const data = ev.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "maxima-ready") {
    _ready = true;
    return;
  }

  if (data.type === "maxima-result" && typeof data.id === "number") {
    const p = _pending.get(data.id);
    if (p) {
      _pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data);
    }
  }
}

export const maximaEngine: CASEngine = {
  name: "maxima",
  label: "Maxima (Lisp WASM)",

  isReady(): boolean {
    return _ready;
  },

  async init(): Promise<void> {
    if (_ready) return;
    if (_loading) return _loading;

    _loading = new Promise<void>((resolve, reject) => {
      window.addEventListener("message", onMessage);

      _iframe = document.createElement("iframe");
      _iframe.style.display = "none";
      _iframe.src = MAXIMA_URL;
      document.body.appendChild(_iframe);

      const timeout = setTimeout(() => {
        if (!_ready) reject(new Error("Maxima init timeout (60s)"));
      }, 60000);

      const check = setInterval(() => {
        if (_ready) {
          clearInterval(check);
          clearTimeout(timeout);
          console.log("[CAS] Maxima WASM loaded");
          resolve();
        }
      }, 500);
    });

    return _loading;
  },

  async evaluate(expr: string): Promise<CASResult> {
    if (!_ready || !_iframe?.contentWindow) throw new Error("Maxima not loaded");

    const t0 = performance.now();
    const id = ++_reqId;

    const result = await new Promise<any>((resolve, reject) => {
      _pending.set(id, { resolve, reject });
      _iframe!.contentWindow!.postMessage({ type: "maxima-eval", id, expr }, "*");
      setTimeout(() => {
        if (_pending.has(id)) {
          _pending.delete(id);
          reject(new Error("Maxima eval timeout (30s)"));
        }
      }, 30000);
    });

    const timeMs = performance.now() - t0;

    return {
      text: result.text || String(result.result),
      latex: result.latex || undefined,
      engine: "maxima",
      timeMs,
    };
  },

  supports(_op: CASOperation): boolean {
    return true; // Maxima supports everything
  },
};

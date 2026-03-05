/**
 * mathEngine.ts - Motor de evaluacion basado en math.js
 * Soporta: variables, matrices, lusolve, transpose, funciones, @{cells}, etc.
 * Formato Hekatan: # heading, > texto, @{cells} |a=1|b=2|
 */
import { create, all, type MathJsInstance, type Matrix } from "mathjs";
import { casManager } from "./cas/index.js";
import type { CASResult } from "./cas/types.js";

// ─── Instancia math.js ──────────────────────────────────
const math: MathJsInstance = create(all, {
  number: "number",
  precision: 14,
});

// ─── Gauss-Legendre quadrature ──────────────────────────
function gaussLegendre(n: number): { pts: number[]; wts: number[] } {
  const tables: Record<number, { pts: number[]; wts: number[] }> = {
    2: { pts: [-0.5773502691896257, 0.5773502691896257], wts: [1, 1] },
    3: { pts: [-0.7745966692414834, 0, 0.7745966692414834], wts: [0.5555555555555556, 0.8888888888888888, 0.5555555555555556] },
    5: { pts: [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640],
         wts: [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891] },
    7: { pts: [-0.9491079123427585, -0.7415311855993945, -0.4058451513773972, 0, 0.4058451513773972, 0.7415311855993945, 0.9491079123427585],
         wts: [0.1294849661688697, 0.2797053914892767, 0.3818300505051189, 0.4179591836734694, 0.3818300505051189, 0.2797053914892767, 0.1294849661688697] },
    10: { pts: [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312, 0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717],
          wts: [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963, 0.2955242247147529, 0.2955242247147529, 0.2692667193099963, 0.2190863625159820, 0.1494513491505806, 0.0666713443086881] },
  };
  if (tables[n]) return tables[n];
  // Compute via Newton iteration on Legendre polynomials
  const pts: number[] = new Array(n);
  const wts: number[] = new Array(n);
  const m = Math.floor((n + 1) / 2);
  for (let i = 0; i < m; i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    let p0: number, p1: number, pp: number = 0;
    for (let iter = 0; iter < 100; iter++) {
      p0 = 1; p1 = x;
      for (let j = 2; j <= n; j++) { const p2 = ((2*j-1)*x*p1 - (j-1)*p0)/j; p0 = p1; p1 = p2; }
      pp = n * (x*p1 - p0) / (x*x - 1);
      const dx = p1/pp; x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    pts[i] = -x; pts[n-1-i] = x;
    wts[i] = wts[n-1-i] = 2 / ((1 - x*x) * pp * pp);
  }
  return { pts, wts };
}

// ─── Register integral functions in math.js ─────────────
math.import({
  // integral(f, a, b)  or  integral(f, a, b, n)
  integral: function (f: any, a: number, b: number, nPts?: number) {
    if (typeof f !== "function") throw new Error("integral: first arg must be a function");
    const n = nPts ? Math.round(nPts) : 10;
    const { pts, wts } = gaussLegendre(n);
    const hf = (b - a) / 2, mid = (a + b) / 2;
    let sum = 0;
    for (let k = 0; k < pts.length; k++) {
      const x = hf * pts[k] + mid;
      const fv = f(x);
      sum += wts[k] * (typeof fv === "number" ? fv : Number(fv));
    }
    return hf * sum;
  },

  // integral2(f, xa, xb, ya, yb)  or  integral2(f, xa, xb, ya, yb, n)
  integral2: function (f: any, xa: number, xb: number, ya: number, yb: number, nPts?: number) {
    if (typeof f !== "function") throw new Error("integral2: first arg must be a function");
    const n = nPts ? Math.round(nPts) : 7;
    const { pts, wts } = gaussLegendre(n);
    const hx = (xb - xa) / 2, mx = (xa + xb) / 2;
    const hy = (yb - ya) / 2, my = (ya + yb) / 2;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const x = hx * pts[i] + mx;
      for (let j = 0; j < pts.length; j++) {
        const y = hy * pts[j] + my;
        const fv = f(x, y);
        sum += wts[i] * wts[j] * (typeof fv === "number" ? fv : Number(fv));
      }
    }
    return hx * hy * sum;
  },

  // integral3(f, xa, xb, ya, yb, za, zb)  or  integral3(f, xa, xb, ya, yb, za, zb, n)
  integral3: function (f: any, xa: number, xb: number, ya: number, yb: number, za: number, zb: number, nPts?: number) {
    if (typeof f !== "function") throw new Error("integral3: first arg must be a function");
    const n = nPts ? Math.round(nPts) : 5;
    const { pts, wts } = gaussLegendre(n);
    const hx = (xb - xa) / 2, mx = (xa + xb) / 2;
    const hy = (yb - ya) / 2, my = (ya + yb) / 2;
    const hz = (zb - za) / 2, mz = (za + zb) / 2;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const x = hx * pts[i] + mx;
      for (let j = 0; j < pts.length; j++) {
        const y = hy * pts[j] + my;
        for (let k = 0; k < pts.length; k++) {
          const z = hz * pts[k] + mz;
          const fv = f(x, y, z);
          sum += wts[i] * wts[j] * wts[k] * (typeof fv === "number" ? fv : Number(fv));
        }
      }
    }
    return hx * hy * hz * sum;
  },
  // nderiv(f, x)       — numerical first derivative  f'(x)
  // nderiv(f, x, 2)    — numerical second derivative f''(x)
  nderiv: function (f: any, x: number, order?: number) {
    if (typeof f !== "function") throw new Error("nderiv: first arg must be a function");
    const n = order ? Math.round(order) : 1;
    const h = 1e-6;
    if (n === 1) return (f(x + h) - f(x - h)) / (2 * h);
    if (n === 2) return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
    // Higher order via finite differences
    const h2 = Math.pow(1e-3, 1 / n);
    let coeffs = [1];
    for (let o = 0; o < n; o++) {
      const next = [coeffs[0]];
      for (let i = 1; i < coeffs.length; i++) next.push(coeffs[i] - coeffs[i - 1]);
      next.push(-coeffs[coeffs.length - 1]);
      coeffs = next;
    }
    let result = 0;
    for (let i = 0; i < coeffs.length; i++) {
      result += coeffs[i] * f(x + (n / 2 - i) * h2);
    }
    return result / Math.pow(h2, n);
  },

  // summation(f, a, b) — Σ_{i=a}^{b} f(i)
  summation: function (f: any, a: number, b: number) {
    if (typeof f !== "function") throw new Error("summation: first arg must be a function");
    let sum = 0;
    for (let i = Math.round(a); i <= Math.round(b); i++) sum += Number(f(i));
    return sum;
  },

  // nproduct(f, a, b) — Π_{i=a}^{b} f(i)
  nproduct: function (f: any, a: number, b: number) {
    if (typeof f !== "function") throw new Error("nproduct: first arg must be a function");
    let prod = 1;
    for (let i = Math.round(a); i <= Math.round(b); i++) prod *= Number(f(i));
    return prod;
  },

  // odesolve(f, y0, t0, tf)        — solve y' = f(t,y) with RK4
  // odesolve(f, y0, t0, tf, steps)
  odesolve: function (f: any, y0: number, t0: number, tf: number, steps?: number) {
    if (typeof f !== "function") throw new Error("odesolve: first arg must be f(t,y)");
    const N = steps ? Math.round(steps) : 1000;
    const h = (tf - t0) / N;
    let y = y0, t = t0;
    for (let i = 0; i < N; i++) {
      const k1 = Number(f(t, y));
      const k2 = Number(f(t + h / 2, y + h * k1 / 2));
      const k3 = Number(f(t + h / 2, y + h * k2 / 2));
      const k4 = Number(f(t + h, y + h * k3));
      y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      t += h;
    }
    return y;
  },

  // nsolve(f, x0) — numerical root finding: find x where f(x) = 0
  // Uses Newton-Raphson with central difference derivative
  nsolve: function (f: any, x0: number, tol?: number) {
    if (typeof f !== "function") throw new Error("nsolve: first arg must be a function");
    const eps = tol || 1e-12;
    const h = 1e-8;
    let x = x0;
    for (let iter = 0; iter < 200; iter++) {
      const fx = Number(f(x));
      if (Math.abs(fx) < eps) return x;
      const fp = (Number(f(x + h)) - Number(f(x - h))) / (2 * h);
      if (Math.abs(fp) < 1e-15) break;
      x -= fx / fp;
    }
    return x;
  },
  // bisect(f, a, b) — bisection root finding
  bisect: function (f: any, a: number, b: number, tol?: number) {
    if (typeof f !== "function") throw new Error("bisect: first arg must be a function");
    const eps = tol || 1e-12;
    let lo = a, hi = b;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (Math.abs(hi - lo) < eps) return mid;
      if (Number(f(lo)) * Number(f(mid)) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  },

  // secant(f, x0, x1) — secant method root finding
  secant: function (f: any, x0: number, x1: number, tol?: number) {
    if (typeof f !== "function") throw new Error("secant: first arg must be a function");
    const eps = tol || 1e-12;
    let a = x0, b = x1, fa = Number(f(a)), fb = Number(f(b));
    for (let i = 0; i < 200; i++) {
      if (Math.abs(fb) < eps) return b;
      const dx = fb * (b - a) / (fb - fa);
      a = b; fa = fb; b -= dx; fb = Number(f(b));
    }
    return b;
  },

  // nlimit(f, x0) — numerical limit via Richardson extrapolation
  nlimit: function (f: any, x0: number) {
    if (typeof f !== "function") throw new Error("nlimit: first arg must be a function");
    const hs = [0.1, 0.01, 0.001, 0.0001, 0.00001];
    const vals = hs.map(h => (Number(f(x0 + h)) + Number(f(x0 - h))) / 2);
    // Richardson: use smallest h values
    return vals[vals.length - 1];
  },

  // trapezoid(f, a, b, n) — trapezoidal rule
  trapezoid: function (f: any, a: number, b: number, n: number) {
    if (typeof f !== "function") throw new Error("trapezoid: first arg must be a function");
    const N = Math.round(n);
    const h = (b - a) / N;
    let sum = (Number(f(a)) + Number(f(b))) / 2;
    for (let i = 1; i < N; i++) sum += Number(f(a + i * h));
    return h * sum;
  },

  // simpson(f, a, b, n) — Simpson's 1/3 rule
  simpson: function (f: any, a: number, b: number, n: number) {
    if (typeof f !== "function") throw new Error("simpson: first arg must be a function");
    let N = Math.round(n); if (N % 2 !== 0) N++;
    const h = (b - a) / N;
    let sum = Number(f(a)) + Number(f(b));
    for (let i = 1; i < N; i++) sum += (i % 2 === 0 ? 2 : 4) * Number(f(a + i * h));
    return (h / 3) * sum;
  },

  // euler(f, y0, t0, tf, steps) — Euler method ODE
  euler: function (f: any, y0: number, t0: number, tf: number, steps?: number) {
    if (typeof f !== "function") throw new Error("euler: first arg must be f(t,y)");
    const N = steps ? Math.round(steps) : 1000;
    const h = (tf - t0) / N;
    let y = y0, t = t0;
    for (let i = 0; i < N; i++) { y += h * Number(f(t, y)); t += h; }
    return y;
  },

  // gcd(a, b) — greatest common divisor
  gcd: function (a: number, b: number) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { [a, b] = [b, a % b]; }
    return a;
  },

  // lcm(a, b) — least common multiple
  lcm: function (a: number, b: number) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    let g = a, h = b;
    while (h) { [g, h] = [h, g % h]; }
    return (a / g) * b;
  },

  // fibonacci(n) — n-th Fibonacci number
  fibonacci: function (n: number) {
    n = Math.round(n);
    if (n <= 0) return 0;
    if (n <= 2) return 1;
    let a = 1, b = 1;
    for (let i = 3; i <= n; i++) { [a, b] = [b, a + b]; }
    return b;
  },

  // isprime(n) — 1 if prime, 0 otherwise
  isprime: function (n: number) {
    n = Math.round(n);
    if (n < 2) return 0;
    if (n < 4) return 1;
    if (n % 2 === 0 || n % 3 === 0) return 0;
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) return 0;
    }
    return 1;
  },

  // arithsum(a, d, n) — sum of arithmetic series
  arithsum: function (a: number, d: number, n: number) {
    return (n / 2) * (2 * a + (n - 1) * d);
  },

  // geomsum(a, r, n) — sum of geometric series
  geomsum: function (a: number, r: number, n: number) {
    if (Math.abs(r - 1) < 1e-15) return a * n;
    return a * (1 - Math.pow(r, n)) / (1 - r);
  },

  // geominf(a, r) — sum of infinite geometric series |r| < 1
  geominf: function (a: number, r: number) {
    if (Math.abs(r) >= 1) return Infinity;
    return a / (1 - r);
  },

  // interp(xd, yd, x) — Lagrange polynomial interpolation
  interp: function (xd: any, yd: any, x: number) {
    const xs: number[] = Array.isArray(xd) ? xd : (xd as Matrix).toArray().flat() as number[];
    const ys: number[] = Array.isArray(yd) ? yd : (yd as Matrix).toArray().flat() as number[];
    const n = xs.length;
    let result = 0;
    for (let i = 0; i < n; i++) {
      let basis = 1;
      for (let j = 0; j < n; j++) {
        if (i !== j) basis *= (x - xs[j]) / (xs[i] - xs[j]);
      }
      result += ys[i] * basis;
    }
    return result;
  },

  // linreg(xd, yd) — linear regression [slope, intercept, R²]
  linreg: function (xd: any, yd: any) {
    const xs: number[] = Array.isArray(xd) ? xd : (xd as Matrix).toArray().flat() as number[];
    const ys: number[] = Array.isArray(yd) ? yd : (yd as Matrix).toArray().flat() as number[];
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i]; sy += ys[i]; sxx += xs[i]*xs[i]; sxy += xs[i]*ys[i]; syy += ys[i]*ys[i];
    }
    const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
    const intercept = (sy - slope*sx) / n;
    const sst = syy - sy*sy/n;
    const ssr = sst - (sxy - sx*sy/n)*(sxy - sx*sy/n)/(sxx - sx*sx/n);
    const r2 = sst > 0 ? 1 - ssr/sst : 1;
    return math.matrix([slope, intercept, r2]);
  },

  // aliases
  fib: function (n: number) {
    n = Math.round(n);
    if (n <= 0) return 0;
    if (n <= 2) return 1;
    let a = 1, b = 1;
    for (let i = 3; i <= n; i++) { [a, b] = [b, a + b]; }
    return b;
  },
  lagrange: function (xd: any, yd: any, x: number) {
    const xs: number[] = Array.isArray(xd) ? xd : (xd as Matrix).toArray().flat() as number[];
    const ys: number[] = Array.isArray(yd) ? yd : (yd as Matrix).toArray().flat() as number[];
    const n = xs.length;
    let result = 0;
    for (let i = 0; i < n; i++) {
      let basis = 1;
      for (let j = 0; j < n; j++) {
        if (i !== j) basis *= (x - xs[j]) / (xs[i] - xs[j]);
      }
      result += ys[i] * basis;
    }
    return result;
  },
  linfit: function (xd: any, yd: any) {
    // alias for linreg
    const xs: number[] = Array.isArray(xd) ? xd : (xd as Matrix).toArray().flat() as number[];
    const ys: number[] = Array.isArray(yd) ? yd : (yd as Matrix).toArray().flat() as number[];
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i]; sy += ys[i]; sxx += xs[i]*xs[i]; sxy += xs[i]*ys[i]; syy += ys[i]*ys[i];
    }
    const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
    const intercept = (sy - slope*sx) / n;
    const sst = syy - sy*sy/n;
    const ssr = sst - (sxy - sx*sy/n)*(sxy - sx*sy/n)/(sxx - sx*sx/n);
    const r2 = sst > 0 ? 1 - ssr/sst : 1;
    return math.matrix([slope, intercept, r2]);
  },
  lim: function (f: any, x0: number) {
    if (typeof f !== "function") throw new Error("lim: first arg must be a function");
    const hs = [0.1, 0.01, 0.001, 0.0001, 0.00001];
    const vals = hs.map(h => (Number(f(x0 + h)) + Number(f(x0 - h))) / 2);
    return vals[vals.length - 1];
  },
  trap: function (f: any, a: number, b: number, n: number) {
    if (typeof f !== "function") throw new Error("trap: first arg must be a function");
    const N = Math.round(n);
    const h = (b - a) / N;
    let sum = (Number(f(a)) + Number(f(b))) / 2;
    for (let i = 1; i < N; i++) sum += Number(f(a + i * h));
    return h * sum;
  },

  // stdev(v) — alias for std (sample standard deviation)
  stdev: function (...args: any[]) { return (math as any).std(...args); },

  // inverse(M) — alias for inv
  inverse: function (M: any) { return (math as any).inv(M); },

  // eigenvalues(M) — returns array of eigenvalues
  eigenvalues: function (M: any) {
    const r = (math as any).eigs(M);
    // mathjs >= 12: r.eigenvectors array; older: r.values
    if (r.values) {
      const vals = r.values;
      return vals.toArray ? vals.toArray() : Array.isArray(vals) ? vals : [vals];
    }
    // Fallback: extract from eigenvectors array
    return r.eigenvectors.map((e: any) => e.value);
  },

  // eigenvectors(M) — returns matrix of eigenvectors (columns)
  eigenvectors: function (M: any) {
    const r = (math as any).eigs(M);
    // mathjs >= 12: r.eigenvectors array; older: r.vectors matrix
    if (r.eigenvectors) {
      // New API: array of {value, vector} objects → build matrix from vectors
      return r.eigenvectors.map((e: any) => {
        const v = e.vector;
        return v.toArray ? v.toArray() : v;
      });
    }
    const vecs = r.vectors;
    return vecs.toArray ? vecs.toArray() : vecs;
  },

  // svd_vals(M) — singular values of M
  svd_vals: function (M: any) {
    // SVD via eigenvalues of M^T * M
    const Mt = (math as any).transpose(M);
    const MtM = (math as any).multiply(Mt, M);
    const ev = (math as any).eigs(MtM);
    const vals = ev.values.toArray ? ev.values.toArray() : ev.values;
    // Singular values = sqrt of eigenvalues of M^T*M, sorted descending
    return (vals as number[]).map((v: number) => Math.sqrt(Math.abs(v))).sort((a: number, b: number) => b - a);
  },
}, { override: true });

// ─── CAS (Computer Algebra System) ──────────────────────
/** CAS function names — routed to symbolic math engine (SymPy/Giac/Maxima cascade) */
const CAS_FUNCTIONS = new Set([
  'diff', 'integrate', 'limit', 'solve', 'dsolve',
  'simplify', 'expand', 'factor',
  'laplace', 'fourier', 'series', 'taylor',
]);
/** Math built-in names — NOT resolved when preparing CAS expressions */
const MATH_BUILTINS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'exp', 'log', 'ln', 'log2', 'log10',
  'sqrt', 'cbrt', 'abs', 'ceil', 'floor', 'round', 'min', 'max', 'sign',
  'factorial', 'pow', 'mod',
]);
/** Common symbolic variable names — not resolved */
const CAS_VARS = new Set([
  'x', 'y', 'z', 't', 's', 'n', 'k', 'i', 'j',
  'pi', 'e', 'E', 'I', 'oo', 'inf', 'nan',
]);

// ─── Tipos ──────────────────────────────────────────────
export interface CellResult {
  varName: string;
  expr: string;
  value: any;
  display: string;
  error?: string;
}

export interface LineResult {
  lineIndex: number;
  input: string;
  type: "assignment" | "expression" | "comment" | "heading" | "empty" | "directive" | "cells" | "draw" | "draw3d" | "draw3difc" | "importifc" | "image64" | "hrule" | "eqline" | "plot" | "error";
  varName?: string;
  value?: any;
  display?: string;
  error?: string;
  cells?: CellResult[];
  /** For type "draw"/"draw3d": width, height, and command lines */
  drawWidth?: number;
  drawHeight?: number;
  drawCommands?: string[];
  /** Named figure identifier for @{draw W H name:FigName} */
  drawName?: string;
  /** For type "plot": plot command lines */
  plotCommands?: string[];
  /** For type "importifc": IFC file path/URL and optional filter */
  ifcFile?: string;
  ifcFilter?: string;
  /** For type "image64": base64 data URI, width, height, name */
  imageData?: string;
  imageName?: string;
  /** When true, hide the expression/function in rendering — show only varName = result */
  hideExpr?: boolean;
  /** Display hint: "row" = horizontal inline, "col" = vertical column */
  displayHint?: "row" | "col";
  /** For lusolve rendering: show {F} = [K]{u} matrix equation */
  lsolveData?: { K: any; F: any; Z: any };
  /** CAS symbolic result: LaTeX representation */
  latex?: string;
  /** CAS engine that produced the result */
  casEngine?: string;
}

// ─── HekatanEvaluator ───────────────────────────────────
export class HekatanEvaluator {
  private scope: Record<string, any> = {};
  /** Last CAS result — propagates latex/engine to LineResult */
  private _lastCASResult?: CASResult;
  /** Document configuration: delimiters for inline modes */
  eqDelimiter: string = "";
  textDelimiter: string = "";
  /** Comment delimiter (default: //) — configurable via @{config comment:...} */
  commentDelimiter: string = "//";
  /** Page background color — configurable via @{config bg:cream} */
  pageBackground: string = "";
  /** Page header mode — configurable via @{config header:on} (top of page) */
  pageHeader: boolean = false;
  /** Page footer mode — configurable via @{config footer:on} (bottom of page) */
  pageFooter: boolean = false;
  /** Starting page number — configurable via @{config startpage:218} */
  startPage: number = 1;
  /** Custom header title — configurable via @{config headertitle:Texto} */
  headerTitle: string = "";
  /** Bold mode for equations — configurable via @{config bold:on} */
  eqBold: boolean = false;
  /** Black color mode for equations — configurable via @{config color:black} */
  eqBlack: boolean = false;
  /** Fraction display mode — configurable via @{config frac:on/off} (default: on = vertical fractions) */
  fracMode: boolean = true;
  /** Number notation mode — configurable via @{config notation:eng/sci/auto} (default: auto) */
  notation: "auto" | "eng" | "sci" = "auto";
  /** Hide mode: "none" = visible, "all" = hide everything, "function" = hide expr show result */
  private hideMode: "none" | "all" | "function" = "none";
  /** Set of function names that should be auto-hidden (@{config hide:fn1,fn2}) */
  private hiddenFunctions: Set<string> = new Set();
  /** Named figures store: name → {width, height, commands} */
  namedFigures = new Map<string, { width: number; height: number; commands: string[] }>();
  /** Named equations store: eqNumber → {lines, align} for @{eqn} references */
  namedEquations = new Map<string, { lines: string[]; align: string }>();

  constructor() {
    this.reset();
  }

  reset() {
    this.scope = {};
    this.scope["pi"] = Math.PI;
    this.scope["e"] = Math.E;
    this.scope["inf"] = Infinity;
    this.eqDelimiter = "";
    this.textDelimiter = "";
    this.commentDelimiter = "//";
    this.hideMode = "none";
    this.hiddenFunctions = new Set();
    this.eqBold = false;
    this.eqBlack = false;
    this.fracMode = true;
    this.notation = "auto";
    this.pageHeader = false;
    this.pageFooter = false;
    this.startPage = 1;
    this.headerTitle = "";
    this.namedFigures = new Map();
    this.namedEquations = new Map();
  }

  getScope(): Record<string, any> {
    return { ...this.scope };
  }

  /** Evalua una sola expresion */
  eval(expr: string): any {
    return math.evaluate(expr, this.scope);
  }

  /** Evalua documento completo linea por linea */
  async evalDocument(text: string): Promise<LineResult[]> {
    this.reset();
    const lines = text.split("\n");
    const results: LineResult[] = [];
    let inDirective = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      let trimmed = raw.trim();

      // @{end ...}
      if (/^@\{end\s+\w+\}/i.test(trimmed)) {
        inDirective = false;
        // @{end config} — mark for renderer to reset
        if (/^@\{end\s+config\}/i.test(trimmed)) {
          results.push({ lineIndex: i, input: raw, type: "directive", display: "config:end" });
          continue;
        }
        // @{end columns} — mark for renderer to close columns
        if (/^@\{end\s+columns\}/i.test(trimmed)) {
          results.push({ lineIndex: i, input: raw, type: "directive", display: "end:columns" });
          continue;
        }
        // @{end hide} — restore visibility
        if (/^@\{end\s+hide\}/i.test(trimmed)) {
          this.hideMode = "none";
          results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
          continue;
        }
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{config eq:$, text:"} - document configuration
      const cfgMatch = trimmed.match(/^@\{config\s+(.+)\}\s*$/i);
      if (cfgMatch) {
        const cfgStr = cfgMatch[1];
        // Parse eq:<delimiter>
        const eqDelim = cfgStr.match(/eq:(.)/);
        if (eqDelim) {
          this.eqDelimiter = eqDelim[1];
        }
        // Parse text:<delimiter>
        const textDelim = cfgStr.match(/text:(.)/);
        if (textDelim) {
          this.textDelimiter = textDelim[1];
        }
        // Parse comment:<delimiter> (e.g. comment:#, comment://, comment:%)
        const commentDelim = cfgStr.match(/comment:(\S+)/);
        if (commentDelim) {
          this.commentDelimiter = commentDelim[1];
        }
        // Parse hide:<fn1>,<fn2>,... (functions to auto-hide in output)
        const hideMatch = cfgStr.match(/hide:([^\s}]+)/);
        if (hideMatch) {
          const fns = hideMatch[1].split(",").map(s => s.trim()).filter(Boolean);
          for (const fn of fns) this.hiddenFunctions.add(fn);
        }
        // Parse bg:<color> — page background (named colors or hex)
        const bgMatch = cfgStr.match(/bg:([^\s,}]+)/);
        if (bgMatch) {
          this.pageBackground = bgMatch[1];
        }
        // Parse header:on|off — page header at top with page number and section title
        const headerMatch = cfgStr.match(/header:(on|off)/i);
        if (headerMatch) {
          this.pageHeader = headerMatch[1].toLowerCase() === "on";
        }
        // Parse footer:on|off — page footer at bottom with page number and section title
        const footerMatch = cfgStr.match(/footer:(on|off)/i);
        if (footerMatch) {
          this.pageFooter = footerMatch[1].toLowerCase() === "on";
        }
        // Parse startpage:<N> — starting page number
        const startPageMatch = cfgStr.match(/startpage:(\d+)/i);
        if (startPageMatch) {
          this.startPage = parseInt(startPageMatch[1]);
        }
        // Parse headertitle:<text> — custom header/footer title text
        const htMatch = cfgStr.match(/headertitle:([^,}]+)/i);
        if (htMatch) {
          this.headerTitle = htMatch[1].trim();
        }
        // Parse bold:on|off — bold equations and calculations
        const boldMatch = cfgStr.match(/bold:(on|off)/i);
        if (boldMatch) {
          this.eqBold = boldMatch[1].toLowerCase() === "on";
        }
        // Parse color:black|default — all-black equations (like printed books)
        const colorMatch = cfgStr.match(/color:(black|default)/i);
        if (colorMatch) {
          this.eqBlack = colorMatch[1].toLowerCase() === "black";
        }
        // Parse frac:on|off — vertical fraction display (default: on)
        const fracMatch = cfgStr.match(/frac:(on|off)/i);
        if (fracMatch) {
          this.fracMode = fracMatch[1].toLowerCase() === "on";
        }
        // Parse notation:eng|sci|auto — number display format (default: auto)
        const notMatch = cfgStr.match(/notation:(eng|sci|auto)/i);
        if (notMatch) {
          this.notation = notMatch[1].toLowerCase() as "auto" | "eng" | "sci";
        }
        // Parse align:<left|center|right>
        const alignMatch = cfgStr.match(/align:(\w+)/);

        // Store config in display for renderer
        const cfgParts: string[] = [];
        if (this.eqDelimiter) cfgParts.push(`eq=${this.eqDelimiter}`);
        if (this.textDelimiter) cfgParts.push(`text=${this.textDelimiter}`);
        if (this.commentDelimiter) cfgParts.push(`comment=${this.commentDelimiter}`);
        if (this.pageBackground) cfgParts.push(`bg=${this.pageBackground}`);
        results.push({ lineIndex: i, input: raw, type: "directive", display: `config:${cfgParts.join(",")}` });
        // Emit align directive if present (renderer handles align:X)
        if (alignMatch) {
          results.push({ lineIndex: i, input: raw, type: "directive", display: `align:${alignMatch[1]}` });
        }
        continue;
      }

      // @{cells} |a=1|b=2|c=3|
      if (/^@\{cells\}\s*\|/.test(trimmed)) {
        const cellsResult = this._evalCells(i, raw, trimmed);
        results.push(cellsResult);
        continue;
      }

      // @{pagebreak} - standalone directive, does NOT consume subsequent lines
      if (/^@\{pagebreak\}/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{noheader} - skip header/footer on this page
      if (/^@\{noheader\s*\}/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{columns N} - layout directive, does NOT consume subsequent lines
      if (/^@\{columns\s+\d+\}/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{end columns} already handled above

      // @{hide}, @{hide:function}, @{hide:code}, @{hide:fn} — visibility control
      // @{hide} = hide everything, @{hide:function} = hide expr but show var=result
      const hideMatch = trimmed.match(/^@\{hide(?::(\w+))?\}\s*$/i);
      if (hideMatch) {
        const mode = (hideMatch[1] || "").toLowerCase();
        if (mode === "function" || mode === "fn" || mode === "code") {
          this.hideMode = "function";
        } else {
          this.hideMode = "all";
        }
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{show} — alias for @{end hide}
      if (/^@\{show\}\s*$/i.test(trimmed)) {
        this.hideMode = "none";
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{align:center}, @{align:right}, @{align:left} — standalone alignment directive
      const alignMatch = trimmed.match(/^@\{align(?::([^}]+))?\}\s*$/i);
      if (alignMatch) {
        const align = (alignMatch[1] || "left").toLowerCase().trim();
        results.push({ lineIndex: i, input: raw, type: "directive", display: `align:${align}` });
        continue;
      }

      // @{text}, @{text:center}, @{text:right}, @{text:left} ... @{end text}
      // Pure text block — everything inside is literal text, nothing is processed
      // @{end text} can appear anywhere in a line (not just at the start)
      const textMatch = trimmed.match(/^@\{text(?::([^}]+))?\}\s*$/i);
      if (textMatch) {
        const opts = (textMatch[1] || "").toLowerCase().trim();
        const alignMatch = opts.match(/\b(left|center|right)\b/);
        const align = alignMatch ? alignMatch[1] : "left";
        results.push({ lineIndex: i, input: raw, type: "directive", display: `text:${align}` });
        i++;
        let paraBuffer = "";  // accumulate consecutive lines into one paragraph
        let paraStartLine = i;
        const flushPara = () => {
          if (paraBuffer) {
            results.push({ lineIndex: paraStartLine, input: paraBuffer, type: "comment", display: paraBuffer });
            paraBuffer = "";
          }
        };
        while (i < lines.length) {
          const tLine = lines[i];
          // Check if @{end text} appears anywhere in the line
          const endIdx = tLine.search(/@\{end\s+text\}/i);
          if (endIdx !== -1) {
            // Text before @{end text} is part of current paragraph
            const before = tLine.substring(0, endIdx).trim();
            if (before) {
              paraBuffer = paraBuffer ? paraBuffer + " " + before : before;
            }
            flushPara();
            results.push({ lineIndex: i, input: tLine, type: "directive", display: "text:end" });
            // Text after @{end text} goes back to normal processing
            const endMatch = tLine.substring(endIdx).match(/@\{end\s+text\}/i)!;
            const after = tLine.substring(endIdx + endMatch[0].length).trim();
            if (after) {
              lines.splice(i + 1, 0, after);
            }
            break;
          }
          const tTrimmed = tLine.trim();
          if (!tTrimmed) {
            // Blank line = new paragraph
            flushPara();
            results.push({ lineIndex: i, input: tLine, type: "empty" });
            paraStartLine = i + 1;
          } else {
            // Accumulate into current paragraph
            paraBuffer = paraBuffer ? paraBuffer + " " + tTrimmed : tTrimmed;
          }
          i++;
        }
        flushPara();
        continue;
      }

      // @{plot}...@{end plot} - Plot block (heatmap, curves, etc.)
      if (/^@\{plot\}\s*$/i.test(trimmed)) {
        const plotCommands: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+plot\}/i.test(lines[i].trim())) {
          plotCommands.push(lines[i]);
          i++;
        }
        results.push({
          lineIndex: i, input: raw,
          type: "plot",
          plotCommands,
        });
        continue;
      }

      // @{draw W H}, @{draw W H name:Fig 5.1}, @{draw:3D W H} - CAD block
      const drawMatch = trimmed.match(/^@\{draw(?::(2D|3D|3D:IFC))?\s+(\d+)\s+(\d+)(?:\s+name:([^}]+?))?\s*\}/i);
      if (drawMatch) {
        const mode = (drawMatch[1] || "2D").toUpperCase();
        const drawWidth = parseInt(drawMatch[2]);
        const drawHeight = parseInt(drawMatch[3]);
        const drawName = drawMatch[4]?.trim() || undefined;
        const drawCommands: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+draw\}/i.test(lines[i].trim())) {
          drawCommands.push(lines[i]);
          i++;
        }
        let dtype: LineResult["type"] = "draw";
        if (mode === "3D") dtype = "draw3d";
        else if (mode === "3D:IFC") dtype = "draw3difc";
        // Store named figure for later @{fig} reference
        if (drawName) {
          this.namedFigures.set(drawName, { width: drawWidth, height: drawHeight, commands: [...drawCommands] });
        }
        results.push({
          lineIndex: i, input: raw,
          type: dtype,
          drawWidth, drawHeight, drawCommands, drawName,
        });
        continue;
      }

      // @{image64 [W] [H] [name:Name]} ... base64 data ... @{end image64}
      // Embeds a base64-encoded image directly in the document
      const img64Match = trimmed.match(/^@\{image64(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+name:([^}]+?))?\s*\}/i);
      if (img64Match) {
        const imgW = img64Match[1] ? parseInt(img64Match[1]) : undefined;
        const imgH = img64Match[2] ? parseInt(img64Match[2]) : undefined;
        const imgName = img64Match[3]?.trim() || undefined;
        const imgLines: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+image64\}/i.test(lines[i].trim())) {
          imgLines.push(lines[i].trim());
          i++;
        }
        // Join all lines into a single base64 string (allows multiline base64)
        let b64 = imgLines.join("").trim();
        // Auto-detect mime and add data URI prefix if missing
        if (!b64.startsWith("data:")) {
          // Detect format from first bytes (JPEG=FF D8, PNG=89 50)
          const mime = b64.startsWith("/9j/") ? "image/jpeg"
                     : b64.startsWith("iVBOR") ? "image/png"
                     : b64.startsWith("R0lGOD") ? "image/gif"
                     : "image/png";
          b64 = `data:${mime};base64,${b64}`;
        }
        results.push({
          lineIndex: i, input: raw,
          type: "image64",
          imageData: b64,
          imageName: imgName,
          drawWidth: imgW,
          drawHeight: imgH,
        });
        continue;
      }

      // @{fig FigureName} — reference a previously named @{draw} figure
      const figRefMatch = trimmed.match(/^@\{fig\s+([^}]+)\}\s*$/i);
      if (figRefMatch) {
        const figName = figRefMatch[1].trim();
        const stored = this.namedFigures.get(figName);
        if (stored) {
          results.push({
            lineIndex: i, input: raw, type: "draw",
            drawWidth: stored.width, drawHeight: stored.height,
            drawCommands: [...stored.commands], drawName: figName,
          });
        } else {
          results.push({ lineIndex: i, input: raw, type: "error",
            error: `Figura no encontrada: "${figName}"` });
        }
        continue;
      }

      // @{import:ifc:filename W H filter} - load IFC model
      const ifcMatch = trimmed.match(/^@\{import:ifc:([^\s}]+)(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+(all|structural|columns|beams|slabs|rebar|plates|members|fasteners|connections|walls|openings))?\s*\}/i);
      if (ifcMatch) {
        results.push({
          lineIndex: i, input: raw,
          type: "importifc",
          ifcFile: ifcMatch[1],
          drawWidth: ifcMatch[2] ? parseInt(ifcMatch[2]) : 700,
          drawHeight: ifcMatch[3] ? parseInt(ifcMatch[3]) : 500,
          ifcFilter: ifcMatch[4]?.toLowerCase() || "all",
        });
        continue;
      }

      // Inline @{eq}...@{end eq} on a single line
      const inlineEqMatch = trimmed.match(/^@\{eq\}(.+?)@\{end\s+eq\}\s*$/i);
      if (inlineEqMatch) {
        results.push({ lineIndex: i, input: raw, type: "eqline", display: inlineEqMatch[1].trim() });
        continue;
      }

      // @{eq}, @{eq:align left}, @{eq:align center}, @{eq:align right} ... @{end eq}
      // Equation block — lines rendered with equation formatter
      // @{eqn NAME} — reference a previously named equation (like @{fig})
      const eqnRefMatch = trimmed.match(/^@\{eqn\s+([^}]+)\}\s*$/i);
      if (eqnRefMatch) {
        const eqnName = eqnRefMatch[1].trim();
        const stored = this.namedEquations.get(eqnName);
        if (stored) {
          results.push({ lineIndex: i, input: raw, type: "directive", display: `eq:${stored.align}` });
          for (const el of stored.lines) {
            results.push({ lineIndex: i, input: el, type: "eqline", display: el.trim() });
          }
          results.push({ lineIndex: i, input: "", type: "directive", display: "eq:end" });
        } else {
          results.push({ lineIndex: i, input: raw, type: "error",
            error: `Ecuación no encontrada: "${eqnName}"` });
        }
        continue;
      }

      const eqMatch = trimmed.match(/^@\{eq(?:(?:\s+|:align\s+)(left|center|right))?\}\s*$/i);
      if (eqMatch) {
        const eqAlign = eqMatch[1]?.toLowerCase() || "center";
        results.push({ lineIndex: i, input: raw, type: "directive", display: `eq:${eqAlign}` });
        i++;
        const eqContentLines: string[] = [];
        while (i < lines.length && !/^@\{end\s+eq\}/i.test(lines[i].trim())) {
          const eLine = lines[i];
          const eTrimmed = eLine.trim();
          if (!eTrimmed) {
            results.push({ lineIndex: i, input: eLine, type: "empty" });
          } else {
            results.push({ lineIndex: i, input: eLine, type: "eqline", display: eTrimmed });
            eqContentLines.push(eTrimmed);
          }
          i++;
        }
        if (i < lines.length) {
          results.push({ lineIndex: i, input: lines[i], type: "directive", display: "eq:end" });
        }
        // Auto-detect equation number (X.Y) at end of lines → store as named equation
        for (const el of eqContentLines) {
          const numMatch = el.match(/\((\d+\.\d+[a-z]?)\)\s*$/);
          if (numMatch) {
            this.namedEquations.set(numMatch[1], { lines: [...eqContentLines], align: eqAlign });
          }
        }
        continue;
      }

      // @{directive} - block directives that consume lines until @{end}
      if (/^@\{\w+/.test(trimmed)) {
        inDirective = true;
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }
      if (inDirective) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // ── Code comment: // (default, configurable via @{config comment:...}) ──
      if (this.commentDelimiter && trimmed.includes(this.commentDelimiter)) {
        const cmtIdx = trimmed.indexOf(this.commentDelimiter);
        if (cmtIdx === 0) {
          // Full-line comment — invisible in output
          results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
          continue;
        }
        // Inline comment — strip comment part, continue processing the rest
        trimmed = trimmed.slice(0, cmtIdx).trim();
        if (!trimmed) {
          results.push({ lineIndex: i, input: raw, type: "empty" });
          continue;
        }
      }

      // Linea vacia
      if (!trimmed) {
        results.push({ lineIndex: i, input: raw, type: "empty" });
        continue;
      }

      // Horizontal rule: --- (three or more dashes)
      if (/^-{3,}\s*$/.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "hrule" });
        continue;
      }

      // Heading: # titulo
      if (/^#{1,6}\s/.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "heading", display: trimmed });
        continue;
      }

      // Texto: > comentario
      if (trimmed.startsWith(">")) {
        const text = trimmed.slice(1).trim();
        results.push({ lineIndex: i, input: raw, type: "comment", display: text });
        continue;
      }

      // Comentario legacy: 'texto
      if (trimmed.startsWith("'")) {
        const text = trimmed.slice(1).trim();
        results.push({ lineIndex: i, input: raw, type: "comment", display: text });
        continue;
      }

      // ── for loop: for VAR = START:END[:STEP] ──────────
      if (/^for\s+/i.test(trimmed)) {
        const forMatch = trimmed.match(/^for\s+(\w+)\s*=\s*(.+)$/i);
        if (!forMatch) {
          results.push({ lineIndex: i, input: raw, type: "error", error: `Sintaxis for invalida: ${trimmed}` });
          continue;
        }
        const varName = forMatch[1];
        const rangeParts = forMatch[2].split(':').map(s => s.trim());
        if (rangeParts.length < 2 || rangeParts.length > 3) {
          results.push({ lineIndex: i, input: raw, type: "error", error: `Sintaxis for invalida (usar for i = start:end[:step]): ${trimmed}` });
          continue;
        }
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        let startVal: number, endVal: number, step: number;
        try {
          startVal = Number(math.evaluate(rangeParts[0], this.scope));
          endVal = Number(math.evaluate(rangeParts[1], this.scope));
          step = rangeParts.length === 3 ? Number(math.evaluate(rangeParts[2], this.scope)) : 1;
        } catch (e: any) {
          results.push({ lineIndex: i, input: raw, type: "error", error: e.message });
          continue;
        }
        // Collect body until matching 'end' or 'end for'
        const bodyLines: string[] = [];
        let depth = 1;
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (/^(for|if|while)\s+/i.test(t)) depth++;
          if (/^end(\s+(for|if|while))?\s*$/i.test(t)) {
            depth--;
            if (depth === 0) {
              results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
              break;
            }
          }
          bodyLines.push(lines[i]);
          results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
          i++;
        }
        // Execute loop
        for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
          this.scope[varName] = v;
          await this._evalBlockSilent(bodyLines);
        }
        continue;
      }

      // ── if block: if CONDITION ... [else ...] end ──────────
      if (/^if\s+/i.test(trimmed)) {
        const condExpr = this._fixNx1Indexing(trimmed.replace(/^if\s+/i, "").trim());
        let condResult: boolean;
        try {
          condResult = Boolean(math.evaluate(condExpr, this.scope));
        } catch (e: any) {
          results.push({ lineIndex: i, input: raw, type: "error", error: e.message });
          continue;
        }
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        const thenLines: string[] = [];
        const elseLines: string[] = [];
        let inElse = false;
        let depth = 1;
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (/^(for|if|while)\s+/i.test(t)) depth++;
          if (/^end(\s+(for|if|while))?\s*$/i.test(t)) {
            depth--;
            if (depth === 0) {
              results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
              break;
            }
          }
          if (/^else\s*$/i.test(t) && depth === 1) {
            inElse = true;
            results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
            i++;
            continue;
          }
          if (inElse) elseLines.push(lines[i]);
          else thenLines.push(lines[i]);
          results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
          i++;
        }
        if (condResult) {
          await this._evalBlockSilent(thenLines);
        } else {
          await this._evalBlockSilent(elseLines);
        }
        continue;
      }

      // ── Stray end/else keywords (not consumed by for/if) ───
      if (/^(end(\s+(for|if|while))?|else)\s*$/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // ── Display hints: row(expr) / col(expr) ────────────────
      const hintMatch = trimmed.match(/^(row|col)\((.+)\)$/i);
      if (hintMatch) {
        const hint = hintMatch[1].toLowerCase() as "row" | "col";
        const innerExpr = hintMatch[2];
        try {
          const innerResult = await this._evalLine(innerExpr);
          const lr: LineResult = {
            lineIndex: i, input: raw,
            type: innerResult.type as any ?? "expression",
            value: innerResult.value,
            display: innerResult.display,
            varName: innerResult.varName,
            displayHint: hint,
          };
          if (this.hideMode === "all") {
            results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
          } else {
            results.push(lr);
          }
        } catch (e: any) {
          results.push({ lineIndex: i, input: raw, type: "error", error: e.message || String(e) });
        }
        continue;
      }

      // ── Expresion o asignacion ─────────────────────────────
      try {
        const result = await this._evalLine(trimmed);
        // Apply hide mode
        if (this.hideMode === "all") {
          results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        } else if (this.hideMode === "function") {
          results.push({ lineIndex: i, input: raw, ...result, hideExpr: true });
        } else {
          results.push({ lineIndex: i, input: raw, ...result });
        }
      } catch (e: any) {
        results.push({
          lineIndex: i, input: raw, type: "error",
          error: e.message || String(e)
        });
      }
    }
    return results;
  }

  // ─── @{cells} ─────────────────────────────────────────
  private _evalCells(lineIndex: number, raw: string, trimmed: string): LineResult {
    // Extraer contenido entre pipes: @{cells} |a=1|b=2|c=3|
    const content = trimmed.replace(/^@\{cells\}\s*/, "");
    const parts = content.split("|").filter(p => p.trim());
    const cells: CellResult[] = [];

    for (const part of parts) {
      const cellTrimmed = part.trim();
      if (!cellTrimmed) continue;

      const assignMatch = cellTrimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1];
        const expr = assignMatch[2].trim();
        try {
          const value = math.evaluate(expr, this.scope);
          this.scope[varName] = value;
          cells.push({
            varName, expr, value,
            display: `${varName} = ${this._formatValue(value)}`
          });
        } catch (e: any) {
          cells.push({
            varName, expr, value: undefined,
            display: `${varName} = ?`, error: e.message
          });
        }
      } else {
        // Expresion pura en celda
        try {
          const value = math.evaluate(cellTrimmed, this.scope);
          cells.push({
            varName: "", expr: cellTrimmed, value,
            display: this._formatValue(value)
          });
        } catch (e: any) {
          cells.push({
            varName: "", expr: cellTrimmed, value: undefined,
            display: cellTrimmed, error: e.message
          });
        }
      }
    }

    return { lineIndex, input: raw, type: "cells", cells };
  }

  // ─── Evaluar linea ────────────────────────────────────
  private async _evalLine(line: string): Promise<Partial<LineResult>> {
    // ── Cell array assignment: V = {expr1, expr2, ...} ──
    const cellAssignMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*\{(.+)\}$/);
    if (cellAssignMatch) {
      const varName = cellAssignMatch[1];
      const inner = cellAssignMatch[2];
      // Split by top-level commas or semicolons (respecting brackets)
      const parts = this._splitCellElements(inner);
      const elements = parts.map(p => math.evaluate(p.trim(), this.scope));
      const cell = { __cell: true, elements };
      this.scope[varName] = cell;
      return {
        type: "assignment", varName, value: cell,
        display: `${varName} = {${parts.length} elements}`
      };
    }

    // ── Cell array indexing: V{i} ──
    const cellIdxMatch = line.match(/^([a-zA-Z_]\w*)\{(.+)\}$/);
    if (cellIdxMatch) {
      const varName = cellIdxMatch[1];
      const idxExpr = cellIdxMatch[2];
      const cell = this.scope[varName];
      if (cell && (cell as any).__cell) {
        const idx = Math.round(math.evaluate(idxExpr, this.scope) as number) - 1;
        const value = (cell as any).elements[idx];
        return { type: "expression", value, display: this._formatValue(value) };
      }
    }

    // ── Cell element in assignment: x = V{i} ──
    const cellRefMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*([a-zA-Z_]\w*)\{(.+)\}$/);
    if (cellRefMatch) {
      const varName = cellRefMatch[1];
      const cellName = cellRefMatch[2];
      const idxExpr = cellRefMatch[3];
      const cell = this.scope[cellName];
      if (cell && (cell as any).__cell) {
        const idx = Math.round(math.evaluate(idxExpr, this.scope) as number) - 1;
        const value = (cell as any).elements[idx];
        this.scope[varName] = value;
        return {
          type: "assignment", varName, value,
          display: `${varName} = ${cellName}{${idxExpr}} = ${this._formatValue(value)}`
        };
      }
    }

    // ── Indexed assignment: VAR[idx1, idx2] = expr ──
    // e.g. K[i,j] = K[i,j] + Ke[r,s]  or  V[i] = 5
    const idxAssignMatch = line.match(/^([a-zA-Z_]\w*)\[(.+?)\]\s*=(?!=)\s*(.+)$/);
    if (idxAssignMatch) {
      const varName = idxAssignMatch[1];
      let idxExpr = idxAssignMatch[2];
      const rhsExpr = this._fixNx1Indexing(this._resolveCellRefs(idxAssignMatch[3]));
      // Auto-fix: single index on Nx1 matrix → add ,1 column index
      if (!idxExpr.includes(',')) {
        const varVal = this.scope[varName];
        if (varVal && typeof varVal.size === 'function') {
          const sz = varVal.size();
          if (sz.length === 2 && sz[1] === 1) idxExpr = `${idxExpr}, 1`;
        }
      }
      // Convert K[i,j] = expr → K = subset(K, index(i,j), expr)
      const subsetExpr = `${varName} = subset(${varName}, index(${idxExpr}), ${rhsExpr})`;
      math.evaluate(subsetExpr, this.scope);
      return { type: "directive" as const, display: "" };
    }

    // Asignacion: var = expr (no == ni <=)
    const assignMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = this._fixNx1Indexing(this._resolveCellRefs(assignMatch[2]));
      const value = await this._evalExpr(expr);
      const casResult = this._lastCASResult;
      this.scope[varName] = value;
      // Check if expression uses a hidden function → hide the expression
      const fnCall = assignMatch[2].trim().match(/^(\w+)\s*\(/);
      const isHidden = fnCall && this.hiddenFunctions.has(fnCall[1]);
      // Detect lusolve(K, F) → capture matrices for equation rendering
      const lsolveMatch = assignMatch[2].trim().match(/^l(?:u)?solve\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i);
      let lsolveData: { K: any; F: any; Z: any } | undefined;
      if (lsolveMatch) {
        const matK = this.scope[lsolveMatch[1]];
        const vecF = this.scope[lsolveMatch[2]];
        if (matK && vecF) lsolveData = { K: matK, F: vecF, Z: value };
      }
      return {
        type: "assignment", varName, value,
        display: `${varName} = ${this._formatValue(value)}`,
        hideExpr: isHidden || undefined,
        lsolveData,
        latex: casResult?.latex,
        casEngine: casResult?.engine,
      };
    }

    // Funcion: f(x) = expr
    const fnMatch = line.match(/^([a-zA-Z_]\w*)\(([^)]+)\)\s*=\s*(.+)$/);
    if (fnMatch) {
      const fnName = fnMatch[1];
      const params = fnMatch[2].split(",").map(p => p.trim());
      const body = this._resolveCellRefs(fnMatch[3]);
      const fnExpr = `${fnName}(${params.join(",")}) = ${body}`;
      math.evaluate(fnExpr, this.scope);
      // Store function metadata for symbolic differentiation (sdiff)
      this.scope[`__fnBody_${fnName}`] = body;
      this.scope[`__fnParams_${fnName}`] = params;
      return {
        type: "assignment", varName: fnName,
        display: `${fnName}(${params.join(", ")}) = ${body}`
      };
    }

    // Expresion pura
    const resolved = this._fixNx1Indexing(this._resolveCellRefs(line));
    const value = await this._evalExpr(resolved);
    const casResult = this._lastCASResult;
    return {
      type: "expression", value, display: this._formatValue(value),
      latex: casResult?.latex, casEngine: casResult?.engine,
    };
  }

  /**
   * Evaluate expression, routing CAS function calls to the symbolic engine.
   * CAS functions: diff, integrate, limit, solve, dsolve, simplify, expand,
   * factor, laplace, fourier, series, taylor (+ sdiff alias for diff).
   */
  private async _evalExpr(expr: string): Promise<any> {
    const trimmed = expr.trim();

    // Check if expression contains CAS function calls
    if (this._isCASExpr(trimmed)) {
      const resolved = this._resolveFnForCAS(trimmed);
      const casResult = await casManager.evaluate(resolved);
      this._lastCASResult = casResult;
      // Return the text representation as the value
      return casResult.text;
    }

    this._lastCASResult = undefined;
    return math.evaluate(expr, this.scope);
  }

  /** Check if an expression contains CAS function calls */
  private _isCASExpr(expr: string): boolean {
    for (const fn of CAS_FUNCTIONS) {
      if (new RegExp(`\\b${fn}\\s*\\(`).test(expr)) return true;
    }
    // sdiff alias
    if (/\bsdiff\s*\(/.test(expr)) return true;
    return false;
  }

  /** Resolve user-defined function names in CAS expression string */
  private _resolveFnForCAS(expr: string): string {
    // Translate sdiff → diff for CAS
    let resolved = expr.replace(/\bsdiff\b/g, 'diff');

    // Pass 1: resolve f(args) calls — innermost first (iterate for nesting)
    let prev = '';
    while (resolved !== prev) {
      prev = resolved;
      resolved = resolved.replace(/\b([a-zA-Z_]\w*)\(([^()]*)\)/g, (match, name, argsStr) => {
        if (CAS_FUNCTIONS.has(name) || MATH_BUILTINS.has(name)) return match;
        const body = this.scope[`__fnBody_${name}`] as string | undefined;
        const params = this.scope[`__fnParams_${name}`] as string[] | undefined;
        if (!body || !params) return match;
        const args = argsStr.split(',').map((a: string) => a.trim());
        let sub = body;
        for (let k = 0; k < params.length && k < args.length; k++) {
          sub = sub.replace(new RegExp(`\\b${params[k]}\\b`, 'g'), args[k]);
        }
        return `(${sub})`;
      });
    }

    // Pass 2: resolve bare function names (e.g., "diff(f, x)")
    resolved = resolved.replace(/\b([a-zA-Z_]\w*)\b(?!\s*\()/g, (match, name) => {
      if (CAS_FUNCTIONS.has(name) || MATH_BUILTINS.has(name) || CAS_VARS.has(name)) return match;
      const body = this.scope[`__fnBody_${name}`] as string | undefined;
      if (body) return `(${body})`;
      // Substitute numeric scope variables for CAS context
      const val = this.scope[name];
      if (typeof val === 'number') return String(val);
      return match;
    });

    return resolved;
  }

  /**
   * Resuelve referencias cell array en una expresion antes de pasar a mathjs.
   * Reemplaza `varname{idx}` con una variable temporal que contiene el valor.
   * Ejemplo: "transpose(T) * k{1} * T" → "transpose(T) * __cell_k_1 * T"
   */
  private _resolveCellRefs(expr: string): string {
    return expr.replace(/\b([a-zA-Z_]\w*)\{(\d+)\}/g, (match, name, idxStr) => {
      const cell = this.scope[name];
      if (cell && (cell as any).__cell) {
        const idx = parseInt(idxStr) - 1;
        const value = (cell as any).elements[idx];
        if (value !== undefined) {
          // Crear variable temporal en scope
          const tmpName = `__cell_${name}_${idxStr}`;
          this.scope[tmpName] = value;
          return tmpName;
        }
      }
      return match; // no es cell array, dejar como esta
    });
  }

  /** Fix single-index access on Nx1 matrices: VAR[i] → VAR[i,1] */
  private _fixNx1Indexing(expr: string): string {
    let result = "";
    let i = 0;
    while (i < expr.length) {
      // Look for WORD[
      const wm = expr.slice(i).match(/^([a-zA-Z_]\w*)\[/);
      if (wm) {
        const name = wm[1];
        const bStart = i + name.length; // position of '['
        // Find matching ']'
        let depth = 1;
        let j = bStart + 1;
        while (j < expr.length && depth > 0) {
          if (expr[j] === "[" || expr[j] === "(") depth++;
          else if (expr[j] === "]" || expr[j] === ")") depth--;
          j++;
        }
        const idxContent = expr.slice(bStart + 1, j - 1);
        // Check for top-level comma (already multi-index)
        let hasComma = false;
        let d = 0;
        for (const ch of idxContent) {
          if (ch === "(" || ch === "[") d++;
          else if (ch === ")" || ch === "]") d--;
          else if (ch === "," && d === 0) { hasComma = true; break; }
        }
        if (!hasComma) {
          const v = this.scope[name];
          if (v && typeof v === "object" && typeof v.size === "function") {
            const sz = v.size();
            if (sz.length === 2 && sz[1] === 1) {
              result += `${name}[${idxContent}, 1]`;
              i = j;
              continue;
            }
          }
        }
        result += expr.slice(i, j);
        i = j;
      } else {
        result += expr[i];
        i++;
      }
    }
    return result;
  }

  /** Split cell array elements by top-level commas/semicolons, respecting brackets */
  private _splitCellElements(s: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of s) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      if ((ch === "," || ch === ";") && depth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  // ─── Ejecutar bloque silencioso (loop body / if body) ──
  private async _evalBlockSilent(lines: string[]): Promise<void> {
    for (let i = 0; i < lines.length; i++) {
      let trimmed = lines[i].trim();

      // Skip empty lines, comments, headings, text
      if (!trimmed) continue;
      if (this.commentDelimiter && trimmed.startsWith(this.commentDelimiter)) continue;
      if (/^[#>']/.test(trimmed)) continue;

      // Strip inline comments
      if (this.commentDelimiter && trimmed.includes(this.commentDelimiter)) {
        const cmtIdx = trimmed.indexOf(this.commentDelimiter);
        if (cmtIdx > 0) trimmed = trimmed.slice(0, cmtIdx).trim();
        if (!trimmed) continue;
      }

      // ── Nested for loop: for VAR = START:END[:STEP] ──
      if (/^for\s+/i.test(trimmed)) {
        const forMatch = trimmed.match(/^for\s+(\w+)\s*=\s*(.+)$/i);
        if (forMatch) {
          const varName = forMatch[1];
          const rangeParts = forMatch[2].split(':').map(s => s.trim());
          if (rangeParts.length < 2) continue;
          const startVal = Number(math.evaluate(rangeParts[0], this.scope));
          const endVal = Number(math.evaluate(rangeParts[1], this.scope));
          const step = rangeParts.length >= 3 ? Number(math.evaluate(rangeParts[2], this.scope)) : 1;
          const body: string[] = [];
          let depth = 1;
          i++;
          while (i < lines.length) {
            const t = lines[i].trim();
            if (/^(for|if|while)\s+/i.test(t)) depth++;
            if (/^end(\s+(for|if|while))?\s*$/i.test(t)) {
              depth--;
              if (depth === 0) break;
            }
            body.push(lines[i]);
            i++;
          }
          for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
            this.scope[varName] = v;
            await this._evalBlockSilent(body);
          }
          continue;
        }
      }

      // ── Nested if block ──
      if (/^if\s+/i.test(trimmed)) {
        const condExpr = this._fixNx1Indexing(trimmed.replace(/^if\s+/i, "").trim());
        const condResult = Boolean(math.evaluate(condExpr, this.scope));
        const thenLines: string[] = [];
        const elseLines: string[] = [];
        let inElse = false;
        let depth = 1;
        i++;
        while (i < lines.length) {
          const t = lines[i].trim();
          if (/^(for|if|while)\s+/i.test(t)) depth++;
          if (/^end(\s+(for|if|while))?\s*$/i.test(t)) {
            depth--;
            if (depth === 0) break;
          }
          if (/^else\s*$/i.test(t) && depth === 1) {
            inElse = true;
            i++;
            continue;
          }
          if (inElse) elseLines.push(lines[i]);
          else thenLines.push(lines[i]);
          i++;
        }
        if (condResult) await this._evalBlockSilent(thenLines);
        else await this._evalBlockSilent(elseLines);
        continue;
      }

      // ── Stray end/else ──
      if (/^(end(\s+(for|if|while))?|else)\s*$/i.test(trimmed)) continue;

      // ── Regular expression/assignment ──
      try {
        await this._evalLine(trimmed);
      } catch (_e) {
        // Silently ignore errors in loop body
      }
    }
  }

  // ─── Formateo ─────────────────────────────────────────
  formatValue(value: any): string {
    return this._formatValue(value);
  }

  private _formatValue(value: any): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "function") return "[function]";

    // Cell array
    if (value && (value as any).__cell) {
      const elems = (value as any).elements as any[];
      return `{${elems.map((e: any) => this._formatValue(e)).join(", ")}}`;
    }

    // Matrix math.js
    if (value && typeof value === "object" && typeof value.toArray === "function") {
      return this._formatMatrixText(value);
    }

    // Array
    if (Array.isArray(value)) {
      return `[${value.map(v => this._formatValue(v)).join(", ")}]`;
    }

    // Number
    if (typeof value === "number") {
      if (Number.isInteger(value)) return String(value);
      const rounded = Math.round(value * 10000) / 10000;
      return String(rounded);
    }

    return String(value);
  }

  private _formatMatrixText(m: Matrix): string {
    const arr = m.toArray() as any[];
    if (!Array.isArray(arr[0])) {
      return `[${arr.map(v => this._fmtNum(v)).join(", ")}]`;
    }
    const rows = (arr as any[][]).map(row =>
      row.map(v => this._fmtNum(v)).join(", ")
    );
    return `[${rows.join("; ")}]`;
  }

  /** Genera HTML para una matriz (con brackets verticales) */
  formatMatrixHTML(value: any): string {
    if (!value || typeof value !== "object" || typeof value.toArray !== "function") {
      return this._formatValue(value);
    }
    const arr = value.toArray() as any[];

    // Vector columna: [[a],[b],[c]]
    if (Array.isArray(arr[0]) && (arr[0] as any[]).length === 1) {
      const vals = (arr as any[][]).map(r => this._fmtNum(r[0]));
      return `<span class="mat-bracket">[</span><table class="mat-inner"><tbody>${
        vals.map(v => `<tr><td>${v}</td></tr>`).join("")
      }</tbody></table><span class="mat-bracket">]</span>`;
    }

    // Matriz 2D
    if (Array.isArray(arr[0])) {
      const rows = arr as any[][];
      return `<span class="mat-bracket">[</span><table class="mat-inner"><tbody>${
        rows.map(row =>
          `<tr>${row.map(v => `<td>${this._fmtNum(v)}</td>`).join("")}</tr>`
        ).join("")
      }</tbody></table><span class="mat-bracket">]</span>`;
    }

    // Vector fila
    return `[${arr.map(v => this._fmtNum(v)).join(", ")}]`;
  }

  /** Verifica si un valor es una matriz math.js */
  isMatrix(value: any): boolean {
    return value && typeof value === "object" && typeof value.toArray === "function";
  }

  /** Verifica si un valor es un cell array */
  isCellArray(value: any): boolean {
    return value && typeof value === "object" && (value as any).__cell === true;
  }

  /** Genera HTML para un cell array: {V₁ = [...], V₂ = [...], ...} con subíndices */
  formatCellHTML(value: any, varName?: string): string {
    if (!value || !(value as any).__cell) return this._formatValue(value);
    const elems = (value as any).elements as any[];
    const parts = elems.map((e: any, i: number) => {
      const label = varName
        ? `<span class="cell-label">${varName}<sub>${i + 1}</sub></span> = `
        : "";
      if (this.isMatrix(e)) {
        return `<span class="cell-element">${label}${this.formatMatrixHTML(e)}</span>`;
      }
      return `<span class="cell-element">${label}${this._fmtNum(e)}</span>`;
    });
    return `<span class="cell-array"><span class="cell-brace">{</span>${parts.join('<span class="cell-sep">,</span>')}<span class="cell-brace">}</span></span>`;
  }

  private _fmtNum(v: any): string {
    if (typeof v === "number") {
      if (Number.isInteger(v)) return String(v);
      // Mas precision para resultados de lusolve
      if (Math.abs(v) < 0.0001 || Math.abs(v) > 1e8) {
        return v.toPrecision(6);
      }
      return (Math.round(v * 10000) / 10000).toString();
    }
    return String(v);
  }
}

// ─── Instancia singleton ────────────────────────────────
export const hekatanEvaluator = new HekatanEvaluator();

// ─── Export math.js instance ────────────────────────────
export { math };

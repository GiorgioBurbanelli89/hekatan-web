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

// ─── Custom units for structural engineering ────────────
// kgf (kilogram-force) and tonf (metric ton-force) are essential
// in Latin American structural engineering practice
try { math.createUnit("kgf", "9.80665 N"); } catch {}
try { math.createUnit("tonf", "9806.65 N"); } catch {}

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

  // col(a, b, c, ...) → column vector (Nx1 matrix)
  col: function (...args: number[]) {
    return (math as any).matrix(args.map((v: number) => [v]));
  },

  // row(a, b, c, ...) → row vector (1xN matrix)
  row: function (...args: number[]) {
    return (math as any).matrix([args]);
  },

  // seq(start, end[, step]) → column vector (end-inclusive, like MATLAB 1:end)
  seq: function (start: number, end: number, step?: number) {
    const s = step ?? (end >= start ? 1 : -1);
    if (s === 0) return (math as any).matrix([[start]]);
    const arr: number[][] = [];
    if (s > 0) { for (let i = start; i <= end + 1e-12; i += s) arr.push([i]); }
    else       { for (let i = start; i >= end - 1e-12; i += s) arr.push([i]); }
    return (math as any).matrix(arr);
  },

  // range(start, end[, step]) → column vector (end-inclusive, overrides math.js range)
  range: function (start: number, end: number, step?: number) {
    const s = step ?? (end >= start ? 1 : -1);
    if (s === 0) return (math as any).matrix([[start]]);
    const arr: number[][] = [];
    if (s > 0) { for (let i = start; i <= end + 1e-12; i += s) arr.push([i]); }
    else       { for (let i = start; i >= end - 1e-12; i += s) arr.push([i]); }
    return (math as any).matrix(arr);
  },

  // submat(M, r1, r2, c1, c2) → sub-matrix M[r1:r2, c1:c2] (1-based inclusive)
  submat: function (M: any, r1: number, r2: number, c1: number, c2: number) {
    const rows: number[] = [];
    const cols: number[] = [];
    // math.index uses 0-based indexing with plain arrays, so convert 1-based → 0-based
    for (let i = Math.round(r1) - 1; i <= Math.round(r2) - 1; i++) rows.push(i);
    for (let j = Math.round(c1) - 1; j <= Math.round(c2) - 1; j++) cols.push(j);
    return (math as any).subset(M, (math as any).index(rows, cols));
  },

  // linspace(start, end, n) → column vector of n evenly spaced values
  linspace: function (start: number, end: number, n: number) {
    const count = Math.max(1, Math.round(n));
    if (count === 1) return (math as any).matrix([[start]]);
    const arr: number[][] = [];
    for (let i = 0; i < count; i++) arr.push([start + (end - start) * i / (count - 1)]);
    return (math as any).matrix(arr);
  },
}, { override: true });

// ─── Fix sqrt/cbrt of Unit values with fractional exponents ─────────
// Engineering formulas like Ec = 15100*sqrt(f'c) expect sqrt to operate on the
// numeric value only.  math.js sqrt of a Unit propagates units (e.g. sqrt(kgf/cm²)
// → kgf^0.5/cm) creating fractional dimension exponents that break all downstream
// conversions.  Fix: when sqrt/cbrt would produce fractional exponents, strip units
// and return the dimensionless numeric root.
const _origSqrt = math.sqrt.bind(math);
const _origCbrt = math.cbrt.bind(math);
math.import({
  sqrt: function (x: any) {
    if (x && typeof x === "object" && x.type === "Unit") {
      const result = _origSqrt(x);
      // Check for fractional exponents in result units
      if (result.type === "Unit" && result.units) {
        const hasFrac = result.units.some((u: any) => u.power % 1 !== 0);
        if (hasFrac) {
          // Return numeric sqrt of value in user's unit representation
          try { return Math.sqrt(x.toNumber(x.formatUnits())); } catch {}
          try { return Math.sqrt(x.value); } catch {}
        }
      }
      return result;
    }
    return _origSqrt(x);
  },
  cbrt: function (x: any) {
    if (x && typeof x === "object" && x.type === "Unit") {
      const result = _origCbrt(x);
      if (result.type === "Unit" && result.units) {
        const hasFrac = result.units.some((u: any) => u.power % 1 !== 0);
        if (hasFrac) {
          try { return Math.cbrt(x.toNumber(x.formatUnits())); } catch {}
          try { return Math.cbrt(x.value); } catch {}
        }
      }
      return result;
    }
    return _origCbrt(x);
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
  unitAnnotation?: string;
}

export interface LineResult {
  lineIndex: number;
  input: string;
  type: "assignment" | "expression" | "comment" | "heading" | "empty" | "directive" | "cells" | "draw" | "draw3d" | "draw3difc" | "importifc" | "image64" | "hrule" | "eqline" | "plot" | "svg" | "three" | "error";
  varName?: string;
  value?: any;
  display?: string;
  error?: string;
  cells?: CellResult[];
  /** Display mode for @{cells}: undefined=full, "f"=formula, "r"=result, "fr"=formula+result */
  cellsMode?: "f" | "r" | "fr";
  /** Display mode set by @{mode} directive: undefined=full, "f"=formula, "r"=result, "fr"=formula+result */
  displayMode?: "f" | "r" | "fr";
  /** For type "draw"/"draw3d": width, height, and command lines */
  drawWidth?: number;
  drawHeight?: number;
  drawCommands?: string[];
  /** Named figure identifier for @{draw W H name:FigName} */
  drawName?: string;
  /** Figure alignment: center, left, right */
  drawAlign?: string;
  /** For type "plot": plot command lines */
  plotCommands?: string[];
  /** For type "svg": raw SVG lines */
  svgLines?: string[];
  /** For type "three": Three.js DSL command lines */
  threeLines?: string[];
  /** For type "importifc": IFC file path/URL and optional filter */
  ifcFile?: string;
  ifcFilter?: string;
  /** For type "image64": base64 data URI, width, height, name, align */
  imageData?: string;
  imageName?: string;
  imageAlign?: string;
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
  /** Default unit from @{config units:force,length} — renderer shows this label */
  defaultUnit?: string;
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
  /** Render flags — configurable via @{config render:frac=off,mul=off,...} or @{config plain} */
  renderFlags: { frac: boolean; mul: boolean; sup: boolean; sub: boolean; sqrt: boolean } = {
    frac: true, mul: true, sup: true, sub: true, sqrt: true
  };
  /** Number notation mode — configurable via @{config notation:eng/sci/auto} (default: auto) */
  notation: "auto" | "eng" | "sci" = "auto";
  /** Matrix/vector visible size — configurable via @{config matvis:N} (0=all, -1=use UI selector) */
  matVisSize: number = -1;
  /** Decimals for tounit() — configurable via @{config decimals:N} (default: 2) */
  tounitDecimals: number = 2;
  /** Unit strip mode — configurable via @{config units:kgf,cm} */
  unitsStrip: boolean = false;
  private _unitsForce: string = "";
  private _unitsLength: string = "";
  /** Map of variable names to their detected default unit (from strip) */
  private _varUnits = new Map<string, string>();
  /** Pre-strip display values: var → {value, unit} in original units before stripping.
   *  e.g. b = 30 cm → _preStripDisplay.set("b", {value: 30, unit: "cm"}) before converting to 0.3 m */
  private _preStripDisplay = new Map<string, { value: number; unit: string }>();
  /** Hide mode: "none" = visible, "all" = hide everything, "function" = hide expr show result */
  private hideMode: "none" | "all" | "function" = "none";
  /** Display mode set by @{mode}: undefined=full, "f"=formula, "r"=result, "fr"=formula+result */
  private _displayMode: "f" | "r" | "fr" | undefined = undefined;
  /** Set of function names that should be auto-hidden (@{config hide:fn1,fn2}) */
  private hiddenFunctions: Set<string> = new Set();
  /** Named figures store: name → {width, height, commands} */
  namedFigures = new Map<string, { width: number; height: number; commands: string[] }>();
  /** Named equations store: eqNumber → {lines, align} for @{eqn} references */
  namedEquations = new Map<string, { lines: string[]; align: string }>();
  /** Multiline function definitions: name → { params, outputs, lines } */
  multilineFunctions = new Map<string, { params: string[]; outputs: string[]; lines: string[] }>();

  constructor() {
    this.reset();
  }

  reset() {
    this.scope = {};
    this.scope["pi"] = Math.PI;
    this.scope["e"] = Math.E;
    this.scope["inf"] = Infinity;
    // Cell array support
    this.scope["cell"] = (n: number) => ({ __cell: true, elements: new Array(Math.round(n)).fill(0) });
    this.scope["__cellget"] = (c: any, i: number) => {
      if (c && c.__cell) return c.elements[Math.round(i) - 1] ?? 0;
      return c;
    };
    this.scope["cells"] = (...args: any[]) => ({ __cell: true, elements: [...args] });
    this.scope["cset"] = (c: any, i: number, val: any) => {
      if (c && c.__cell) c.elements[Math.round(i) - 1] = val;
      return val;
    };
    this.scope["clen"] = (c: any) => {
      if (c && c.__cell) return c.elements.length;
      return 0;
    };
    // Alias: lsolve → lusolve (math.js built-in)
    this.scope["lsolve"] = (...args: any[]) => (math as any).lusolve(...args);
    // tounit(value, "unit") — smart unit conversion for scalars, vectors, and matrices
    // Algorithm:
    //   1. Parse target unit to extract force base (kN) and length base (m)
    //   2. For each element, try direct .to(target) first
    //   3. If fails, convert internally to force+length system (cm→m, MPa→kN/m²)
    //      which simplifies compound units (m/m=1) → pure number
    //   4. Multiply number × target unit
    // Supports:
    //   tounit(val, "kN/m")   — smart single-unit conversion
    //   tounit(val, "kN,m")   — system mode: strip to numbers in that force+length system
    this.scope["tounit"] = (val: any, targetUnit: any) => {
      let target: string;
      if (typeof targetUnit === "string") {
        target = targetUnit.trim();
      } else if (targetUnit && typeof targetUnit === "object" && targetUnit.type === "Unit") {
        const parts = targetUnit.toString().split(" ");
        target = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
      } else {
        target = String(targetUnit).trim();
      }

      // Round to N decimals (from @{config decimals:N}, default 2)
      const dec = this.tounitDecimals;
      const factor = Math.pow(10, dec);
      const roundN = (n: number): number => {
        if (n === 0) return 0;
        const abs = Math.abs(n);
        if (abs < Math.pow(10, -dec) || abs >= 1e6) return n; // sci notation range — keep full
        return Math.round(n * factor) / factor;
      };

      // --- Comma mode: "kN,m" → system conversion (strip to pure numbers) ---
      const commaMatch = target.match(/^([^,]+),\s*([^,]+)$/);
      if (commaMatch) {
        const fu = commaMatch[1].trim();
        const lu = commaMatch[2].trim();
        const stripOne = (v: any): any => {
          if (v && typeof v === "object" && v.type === "Unit") {
            return roundN(this._unitToNumberWith(v, fu, lu));
          }
          return typeof v === "number" ? roundN(v) : v;
        };
        const deepStrip = (a: any): any => Array.isArray(a) ? a.map(deepStrip) : stripOne(a);
        if (val && typeof val === "object" && val.type === "DenseMatrix" && typeof val.toArray === "function") {
          return math.matrix(deepStrip(val.toArray()));
        }
        if (Array.isArray(val)) {
          return deepStrip(val);
        }
        return stripOne(val);
      }

      // --- Single unit mode: "kN/m" → smart conversion ---
      // Extract force and length base units from the target string
      const forceMatch = target.match(/\b(tonf|kgf|lbf|kip|daN|MN|GN|kN|N)\b/);
      const lengthMatch = target.match(/\b(inch|mm|cm|km|ft|yd|mi|in|m)\b/);
      const fu = forceMatch ? forceMatch[1] : "";
      const lu = lengthMatch ? lengthMatch[1] : "";

      const convertOne = (v: any): any => {
        if (v && typeof v === "object" && v.type === "Unit") {
          // Step 1: try direct .to(target) — works if dimensions match exactly
          try {
            const converted = v.to(target);
            // Round the internal value
            const num = converted.toNumber(target);
            return math.unit(roundN(num), target);
          } catch {}
          // Step 2: smart system conversion
          if (fu || lu) {
            const num = roundN(this._unitToNumberWith(v, fu, lu));
            try { return math.unit(num, target); } catch { return num; }
          }
          // Step 3: fallback — return original
          return v;
        }
        if (typeof v === "number") {
          try { return math.unit(roundN(v), target); } catch { return v; }
        }
        return v;
      };

      // Apply to DenseMatrix, Array, or scalar.
      // IMPORTANT: DenseMatrix cannot hold Unit objects (corrupts shape/stringifies),
      // so for matrices/arrays we convert each cell, extract the numeric value,
      // and tag the result with __commonUnit for the renderer to display outside brackets.
      const deepMap = (a: any): any => Array.isArray(a) ? a.map(deepMap) : convertOne(a);
      // Extract number from a converted Unit (or keep as-is if not Unit)
      const deepToNum = (a: any): any => {
        if (Array.isArray(a)) return a.map(deepToNum);
        if (a && typeof a === "object" && a.type === "Unit") {
          try { return roundN(a.toNumber()); } catch { return a; }
        }
        return a;
      };
      if (val && typeof val === "object" && val.type === "DenseMatrix" && typeof val.toArray === "function") {
        // Use _data directly — toArray() corrupts when DenseMatrix holds Unit objects.
        // DenseMatrix with Units often gets shape [1,N,M] instead of [N,M]; unwrap.
        let raw: any = (val as any)._data || val.toArray();
        const sz = val.size();
        if (sz.length === 3 && sz[0] === 1 && Array.isArray(raw[0])) raw = raw[0];
        const mapped = deepMap(raw);
        const numArr = deepToNum(mapped);
        const result = math.matrix(numArr);
        (result as any).__commonUnit = target;
        return result;
      }
      if (Array.isArray(val)) {
        const mapped = deepMap(val);
        const numArr = deepToNum(mapped);
        if (Array.isArray(numArr)) (numArr as any).__commonUnit = target;
        return numArr;
      }
      return convertOne(val);
    };
    this.eqDelimiter = "";
    this.textDelimiter = "";
    this.commentDelimiter = "//";
    this.hideMode = "none";
    this._displayMode = undefined;
    this.hiddenFunctions = new Set();
    this.eqBold = false;
    this.eqBlack = false;
    this.fracMode = true;
    this.renderFlags = { frac: true, mul: true, sup: true, sub: true, sqrt: true };
    this.notation = "auto";
    this.pageHeader = false;
    this.pageFooter = false;
    this.startPage = 1;
    this.headerTitle = "";
    this.matVisSize = -1;
    this.tounitDecimals = 2;
    this.unitsStrip = false;
    this._unitsForce = "";
    this._unitsLength = "";
    this._varUnits.clear();
    this._preStripDisplay.clear();
    this.namedFigures = new Map();
    this.namedEquations = new Map();
    this.multilineFunctions = new Map();
  }

  getScope(): Record<string, any> {
    return { ...this.scope };
  }

  /** Get pre-strip display values: var → {value, unit} in original units before stripping.
   *  e.g. b=30cm → {b: {value:30, unit:"cm"}} (before conversion to meters) */
  getPreStripDisplay(): Map<string, { value: number; unit: string }> {
    return this._preStripDisplay;
  }

  /** Get variable unit map: var → unit string (e.g. "tonf/m²", "m⁴") */
  getVarUnits(): Map<string, string> {
    return this._varUnits;
  }

  /** Evalua una sola expresion */
  eval(expr: string): any {
    return math.evaluate(expr, this.scope);
  }

  /**
   * Registra una funcion multilinea (function...end) en el scope de math.js.
   * Crea una closure JS que ejecuta el body linea por linea con math.evaluate.
   */
  private _registerMultilineFunction(
    funcName: string,
    params: string[],
    outputs: string[],
    bodyLines: string[]
  ): void {
    this.multilineFunctions.set(funcName, { params, outputs, lines: bodyLines });
    const self = this;

    // Crear funcion JS que math.js puede llamar
    const fn = (...args: any[]) => {
      // Scope aislado: copia del scope padre + parametros
      const localScope: Record<string, any> = { ...self.scope };
      for (let i = 0; i < params.length; i++) {
        if (i < args.length) localScope[params[i]] = args[i];
      }

      // Ejecutar body linea por linea
      self._execFunctionBody(bodyLines, localScope);

      // Retornar outputs
      if (outputs.length === 1) {
        return localScope[outputs[0]] ?? 0;
      }
      // Multiple outputs → cell array
      const elements = outputs.map(o => localScope[o] ?? 0);
      return { __cell: true, elements };
    };

    // Registrar en scope para math.js
    this.scope[funcName] = fn;
  }

  /**
   * Ejecuta un bloque de lineas de funcion en un scope local.
   * Soporta for/while/if/elseif/else/end, break, continue.
   */
  private _execFunctionBody(
    lines: string[], scope: Record<string, any>,
    start = 0, end?: number
  ): "break" | "continue" | undefined {
    const limit = end ?? lines.length;
    let i = start;

    while (i < limit) {
      const raw = lines[i];
      const trimmed = raw.replace(/%.*$/, "").trim(); // strip % comments

      if (!trimmed || trimmed.startsWith("//")) { i++; continue; }
      if (trimmed === "break") return "break";
      if (trimmed === "continue") return "continue";

      // ── for var = start:step:end ─────────
      const forMatch = trimmed.match(/^for\s+(\w+)\s*=\s*(.+)$/i);
      if (forMatch) {
        const varName = forMatch[1];
        const rangeExpr = forMatch[2];
        // Parse range: start:end or start:step:end
        const rp = rangeExpr.split(":").map(s => s.trim());
        const fStart = Number(math.evaluate(rp[0], scope));
        const fEnd = rp.length >= 3
          ? Number(math.evaluate(rp[2], scope))
          : Number(math.evaluate(rp[1], scope));
        const fStep = rp.length >= 3
          ? Number(math.evaluate(rp[1], scope))
          : 1;
        const bodyEnd = this._findMatchingEnd(lines, i + 1, limit);
        for (let v = fStart; fStep > 0 ? v <= fEnd : v >= fEnd; v += fStep) {
          scope[varName] = v;
          const signal = this._execFunctionBody(lines, scope, i + 1, bodyEnd);
          if (signal === "break") break;
        }
        i = bodyEnd + 1;
        continue;
      }

      // ── while condition ──────────────────
      const whileMatch = trimmed.match(/^while\s+(.+)$/i);
      if (whileMatch) {
        const condExpr = whileMatch[1];
        const bodyEnd = this._findMatchingEnd(lines, i + 1, limit);
        let maxIter = 100000;
        while (maxIter-- > 0) {
          let cond: any;
          try { cond = math.evaluate(condExpr, scope); } catch { break; }
          if (!cond || cond === 0) break;
          const signal = this._execFunctionBody(lines, scope, i + 1, bodyEnd);
          if (signal === "break") break;
        }
        i = bodyEnd + 1;
        continue;
      }

      // ── if condition ─────────────────────
      if (/^if\s+/i.test(trimmed)) {
        const { branches, endLine } = this._parseIfBlock(lines, i, limit);
        for (const br of branches) {
          if (br.condition === null) {
            // else branch — always execute
            const sig = this._execFunctionBody(lines, scope, br.bodyStart, br.bodyEnd);
            if (sig) return sig; // propagate break/continue
            break;
          }
          let condVal: any;
          try { condVal = math.evaluate(br.condition, scope); } catch { condVal = 0; }
          if (condVal && condVal !== 0) {
            const sig = this._execFunctionBody(lines, scope, br.bodyStart, br.bodyEnd);
            if (sig) return sig; // propagate break/continue
            break;
          }
        }
        i = endLine + 1;
        continue;
      }

      // ── Cell assignment: VAR{idx} = expr ──
      const cellAssign = trimmed.match(/^(\w+)\{(.+?)\}\s*=\s*(.+)$/);
      if (cellAssign) {
        const [, varName, idxExpr, valExpr] = cellAssign;
        try {
          const idx = Math.round(Number(math.evaluate(idxExpr, scope)));
          const val = math.evaluate(valExpr, scope);
          if (!scope[varName] || !scope[varName].__cell) {
            scope[varName] = { __cell: true, elements: [] };
          }
          scope[varName].elements[idx - 1] = val;
        } catch { /* skip */ }
        i++;
        continue;
      }

      // ── Assignment / expression ──────────
      // Split by semicolons (respecting brackets — don't split inside [] or ())
      const stmts = this._splitBySemicolon(trimmed);
      for (const stmt of stmts) {
        try {
          // Convert cell reads: VAR{idx} → __cellget(VAR, idx)
          let processed = stmt.replace(/(\w+)\{([^}]+)\}/g, '__cellget($1, $2)');
          // Dot-notation element access: var.(i,j) → subset(var, index(i,j))
          processed = processed.replace(/\b([a-zA-Z_]\w*)\.\(([^)]+)\)/g, (m, name, args) => {
            if (scope[name] !== undefined) return `subset(${name}, index(${args}))`;
            return m;
          });
          // Convert semicolons inside brackets to commas (MATLAB→math.js matrix syntax)
          processed = this._semicolonToCommaInBrackets(processed);
          math.evaluate(processed, scope);
        } catch {
          // Silently skip errors in function body
        }
      }

      i++;
    }
    return undefined;
  }

  /** Convert semicolons inside brackets to commas (MATLAB [1,2;3,4] → math.js [1,2],[3,4]) */
  private _semicolonToCommaInBrackets(line: string): string {
    let depth = 0, inStr = false;
    const chars = line.split('');
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === "'" || c === '"') inStr = !inStr;
      if (!inStr) {
        if (c === '[' || c === '(') depth++;
        else if (c === ']' || c === ')') depth--;
        else if (c === ';' && depth > 0) chars[i] = ',';
      }
    }
    return chars.join('');
  }

  /** Split line by semicolons, respecting brackets and strings */
  private _splitBySemicolon(line: string): string[] {
    const stmts: string[] = [];
    let depth = 0, inStr = false, start = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" || c === '"') inStr = !inStr;
      if (!inStr) {
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ';' && depth === 0) {
          const s = line.slice(start, i).trim();
          if (s) stmts.push(s);
          start = i + 1;
        }
      }
    }
    const last = line.slice(start).trim();
    if (last) stmts.push(last);
    return stmts;
  }

  /** Encuentra el 'end' correspondiente (respetando profundidad) */
  private _findMatchingEnd(lines: string[], startBody: number, limit: number): number {
    let depth = 1;
    for (let i = startBody; i < limit; i++) {
      const t = lines[i].replace(/%.*$/, "").trim().toLowerCase();
      if (/^(for|while|if)\s+/.test(t)) depth++;
      if (t === "end") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return limit;
  }

  /** Parsea estructura if/elseif/else/end */
  private _parseIfBlock(
    lines: string[], ifLine: number, limit: number
  ): { branches: { condition: string | null; bodyStart: number; bodyEnd: number }[]; endLine: number } {
    const branches: { condition: string | null; bodyStart: number; bodyEnd: number }[] = [];
    const firstCond = lines[ifLine].replace(/%.*$/, "").trim().replace(/^if\s+/i, "").trim();
    let depth = 1, branchStart = ifLine + 1;
    let currentCond: string | null = firstCond;

    for (let i = ifLine + 1; i < limit; i++) {
      const t = lines[i].replace(/%.*$/, "").trim();
      const tl = t.toLowerCase();
      if (/^(for|while|if)\s+/.test(tl)) { depth++; continue; }
      if (tl === "end") {
        depth--;
        if (depth === 0) {
          branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
          return { branches, endLine: i };
        }
        continue;
      }
      if (depth === 1) {
        if (/^elseif\s+/i.test(t)) {
          branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
          currentCond = t.replace(/^elseif\s+/i, "").trim();
          branchStart = i + 1;
        } else if (/^else\s*$/i.test(t)) {
          branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: i });
          currentCond = null;
          branchStart = i + 1;
        }
      }
    }
    branches.push({ condition: currentCond, bodyStart: branchStart, bodyEnd: limit });
    return { branches, endLine: limit };
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
          this.renderFlags.frac = this.fracMode;
        }
        // Parse plain — disable ALL rendering (plain text output)
        if (/\bplain\b/i.test(cfgStr)) {
          this.renderFlags = { frac: false, mul: false, sup: false, sub: false, sqrt: false };
          this.fracMode = false;
        }
        // Parse render — re-enable ALL rendering
        if (/\brender\b(?!\s*:)/i.test(cfgStr)) {
          this.renderFlags = { frac: true, mul: true, sup: true, sub: true, sqrt: true };
          this.fracMode = true;
        }
        // Parse render:key=on|off,... — granular render control
        const renderMatch = cfgStr.match(/render:([\w=,]+)/i);
        if (renderMatch) {
          const pairs = renderMatch[1].split(",");
          for (const p of pairs) {
            const [key, val] = p.split("=");
            if (key && val && key in this.renderFlags) {
              (this.renderFlags as any)[key] = val.toLowerCase() === "on";
            }
          }
          this.fracMode = this.renderFlags.frac;
        }
        // Parse notation:eng|sci|auto — number display format (default: auto)
        const notMatch = cfgStr.match(/notation:(eng|sci|auto)/i);
        if (notMatch) {
          this.notation = notMatch[1].toLowerCase() as "auto" | "eng" | "sci";
        }
        // Parse matvis:<N> — visible rows/cols for truncated matrices/vectors (0=all)
        const matvisMatch = cfgStr.match(/matvis:(\d+)/i);
        if (matvisMatch) {
          this.matVisSize = parseInt(matvisMatch[1]);
        }
        // Parse decimals:<N> — decimal places for tounit() (default: 2)
        const decMatch = cfgStr.match(/decimals?:(\d+)/i);
        if (decMatch) {
          this.tounitDecimals = parseInt(decMatch[1]);
        }
        // Parse units:off — disable unit stripping
        if (/units:\s*off\b/i.test(cfgStr)) {
          this.unitsStrip = false;
          this._unitsForce = "";
          this._unitsLength = "";
        }
        // Parse units:<force>,<length> — strip units and convert to specified system
        const unitsMatch = cfgStr.match(/units:(\w+(?:\/\w+(?:\^\d)?)?),(\w+)/i);
        if (unitsMatch) {
          this.unitsStrip = true;
          this._unitsForce = unitsMatch[1];
          this._unitsLength = unitsMatch[2];
          // Convert all existing scope Unit values to numbers in the target system
          this._stripScopeUnits();
        }
        // Parse align:<left|center|right>
        const alignMatch = cfgStr.match(/align:(\w+)/);

        // Store config in display for renderer
        const cfgParts: string[] = [];
        if (this.eqDelimiter) cfgParts.push(`eq=${this.eqDelimiter}`);
        if (this.textDelimiter) cfgParts.push(`text=${this.textDelimiter}`);
        if (this.commentDelimiter) cfgParts.push(`comment=${this.commentDelimiter}`);
        if (this.pageBackground) cfgParts.push(`bg=${this.pageBackground}`);
        cfgParts.push(`frac=${this.renderFlags.frac ? "on" : "off"}`);
        cfgParts.push(`mul=${this.renderFlags.mul ? "on" : "off"}`);
        cfgParts.push(`sup=${this.renderFlags.sup ? "on" : "off"}`);
        cfgParts.push(`sub=${this.renderFlags.sub ? "on" : "off"}`);
        cfgParts.push(`sqrt=${this.renderFlags.sqrt ? "on" : "off"}`);
        if (this.matVisSize >= 0) cfgParts.push(`matvis=${this.matVisSize}`);
        if (this.unitsStrip) cfgParts.push(`units=${this._unitsForce},${this._unitsLength}`);
        results.push({ lineIndex: i, input: raw, type: "directive", display: `config:${cfgParts.join(",")}` });
        // Emit align directive if present (renderer handles align:X)
        if (alignMatch) {
          results.push({ lineIndex: i, input: raw, type: "directive", display: `align:${alignMatch[1]}` });
        }
        continue;
      }

      // @{cells} |a=1|b=2|  @{cells f} |a=expr|  @{cells r} |a=expr|  @{cells fr} |a=expr|
      const cellsMatch = trimmed.match(/^@\{cells(?:\s+(f|r|fr))?\}\s*\|/);
      if (cellsMatch) {
        const cellsMode = cellsMatch[1] as "f" | "r" | "fr" | undefined;
        const cellsResult = this._evalCells(i, raw, trimmed, cellsMode);
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

      // @{mode f|r|fr} — display mode for assignments: f=formula, r=result, fr=formula+result
      // @{mode} — reset to default (full procedure)
      const modeMatch = trimmed.match(/^@\{mode(?:\s+(f|r|fr))?\}\s*$/i);
      if (modeMatch) {
        this._displayMode = modeMatch[1] as "f" | "r" | "fr" | undefined;
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

      // ── function [out] = name(args) ... end ───────────────
      // MATLAB-style multiline function definition
      // Patterns: function [a,b] = name(x,y)
      //           function out = name(x)
      //           function name(x)  (no explicit output → funcName is output)
      const funcMatch = trimmed.match(
        /^function\s*(?:(?:\[([^\]]*)\]|(\w+))\s*=\s*)?(\w+)\s*\(([^)]*)\)\s*$/i
      );
      if (funcMatch) {
        const funcStartLine = i;
        const funcName = funcMatch[3];
        const paramStr = funcMatch[4] || "";
        let outputs: string[];
        if (funcMatch[1]) {
          // [a, b] = name(...)
          outputs = funcMatch[1].split(",").map(s => s.trim()).filter(Boolean);
        } else if (funcMatch[2]) {
          // out = name(...)
          outputs = [funcMatch[2]];
        } else {
          // name(...)  — no explicit output, use funcName as output var
          outputs = [funcName];
        }
        const params = paramStr.split(",").map(s => s.trim()).filter(Boolean);

        // Collect body lines until matching 'end'
        const bodyLines: string[] = [];
        let depth = 1;
        i++;
        while (i < lines.length && depth > 0) {
          const bLine = lines[i].trim();
          const bLower = bLine.replace(/%.*$/, "").trim().toLowerCase();
          if (/^(for|while|if)\s+/.test(bLower)) depth++;
          if (bLower === "end") {
            depth--;
            if (depth === 0) break;
          }
          bodyLines.push(lines[i]);
          i++;
        }

        // Registrar funcion en scope de math.js
        this._registerMultilineFunction(funcName, params, outputs, bodyLines);
        // Emit a directive so the renderer knows a function was defined
        results.push({
          lineIndex: funcStartLine, input: raw,
          type: "directive",
          display: `function:${funcName}(${params.join(", ")})`,
        });
        continue;
      }

      // @{plot}...@{end plot} - Plot block (heatmap, curves, etc.)
      if (/^@\{plot\}\s*$/i.test(trimmed)) {
        const plotStartLine = i;
        const plotCommands: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+plot\}/i.test(lines[i].trim())) {
          plotCommands.push(lines[i]);
          i++;
        }
        results.push({
          lineIndex: plotStartLine, input: raw,
          type: "plot",
          plotCommands,
        });
        continue;
      }

      // @{svg}...@{end svg} - SVG block (raw SVG passthrough)
      if (/^@\{svg\}\s*$/i.test(trimmed)) {
        const svgStartLine = i;
        const svgLines: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+svg\}/i.test(lines[i].trim())) {
          svgLines.push(lines[i]);
          i++;
        }
        results.push({
          lineIndex: svgStartLine, input: raw,
          type: "svg",
          svgLines,
        });
        continue;
      }

      // @{three}...@{end three} or @{three W H}...@{end three} - Three.js 3D scene block
      const threeMatch = trimmed.match(/^@\{three(?:\s+(\d+)\s+(\d+))?\s*\}$/i);
      if (threeMatch) {
        const threeStartLine = i;
        const threeLines: string[] = [];
        const threeW = threeMatch[1] ? parseInt(threeMatch[1]) : undefined;
        const threeH = threeMatch[2] ? parseInt(threeMatch[2]) : undefined;
        i++;
        while (i < lines.length && !/^@\{end\s+three\}/i.test(lines[i].trim())) {
          threeLines.push(lines[i]);
          i++;
        }
        results.push({
          lineIndex: threeStartLine, input: raw,
          type: "three",
          threeLines,
          drawWidth: threeW,
          drawHeight: threeH,
        });
        continue;
      }

      // @{draw W H}, @{draw W H name:Fig 5.1 align:center}, @{draw:3D W H}, @{svg W H} (alias) - CAD block
      const drawMatch = trimmed.match(/^@\{(?:draw|svg)(?::(2D|3D|3D:IFC))?\s+(\d+)\s+(\d+)(?:\s+name:([^}]+?))?\s*(?:align:(left|center|right))?\s*\}/i);
      if (drawMatch) {
        const drawStartLine = i;
        const mode = (drawMatch[1] || "2D").toUpperCase();
        const drawWidth = parseInt(drawMatch[2]);
        const drawHeight = parseInt(drawMatch[3]);
        const drawName = drawMatch[4]?.trim() || undefined;
        const drawAlign = drawMatch[5]?.trim() || undefined;
        const drawCommands: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+(?:draw|svg)\}/i.test(lines[i].trim())) {
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
          lineIndex: drawStartLine, input: raw,
          type: dtype,
          drawWidth, drawHeight, drawCommands, drawName, drawAlign,
        });
        continue;
      }

      // @{image64 [W] [H] [name:Name] [align:center|left|right]} ... base64 data ... @{end image64}
      // Embeds a base64-encoded image directly in the document
      const img64Match = trimmed.match(/^@\{image64(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+name:([^}]*?))?\s*(?:align:(left|center|right))?\s*\}/i);
      if (img64Match) {
        const imgStartLine = i; // remember start line for data-line navigation
        const imgW = img64Match[1] ? parseInt(img64Match[1]) : undefined;
        const imgH = img64Match[2] ? parseInt(img64Match[2]) : undefined;
        const imgName = img64Match[3]?.trim() || undefined;
        const imgAlign = img64Match[4]?.trim() || undefined;
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
          lineIndex: imgStartLine, input: raw,
          type: "image64",
          imageData: b64,
          imageName: imgName,
          imageAlign: imgAlign,
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

      const eqMatch = trimmed.match(/^@\{eq(?:(?:\s+|:align\s+)(left|center|right))?(?:\s+size:(\d+))?\}\s*$/i);
      if (eqMatch) {
        const eqAlign = eqMatch[1]?.toLowerCase() || "center";
        const eqSize = eqMatch[2] || "";
        results.push({ lineIndex: i, input: raw, type: "directive", display: `eq:${eqAlign}:${eqSize}` });
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
        // Apply hide mode and display mode
        const dm = this._displayMode;
        if (this.hideMode === "all") {
          results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        } else if (this.hideMode === "function") {
          const lr = { lineIndex: i, input: raw, ...result, hideExpr: true } as LineResult;
          if (dm) lr.displayMode = dm;
          results.push(lr);
        } else {
          const lr = { lineIndex: i, input: raw, ...result } as LineResult;
          if (dm) lr.displayMode = dm;
          results.push(lr);
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
  private _evalCells(lineIndex: number, raw: string, trimmed: string, mode?: "f" | "r" | "fr"): LineResult {
    // Extraer contenido entre pipes: @{cells} |a=1|b=2|c=3|
    const content = trimmed.replace(/^@\{cells(?:\s+(?:f|r|fr))?\}\s*/, "");
    const parts = content.split("|").filter(p => p.trim());
    const cells: CellResult[] = [];

    for (const part of parts) {
      const cellTrimmed = part.trim();
      if (!cellTrimmed) continue;

      // Extract unit annotation from & operator (e.g. "L = 100 & in" → expr="100", unit="in")
      let unitAnnotation: string | undefined;
      let cellExprStr = cellTrimmed;
      if (cellTrimmed.includes("&")) {
        // Find top-level & (not inside brackets/parens, skip &&)
        let d = 0, aIdx = -1;
        for (let j = 0; j < cellTrimmed.length; j++) {
          const ch = cellTrimmed[j];
          if (ch === "(" || ch === "[" || ch === "{") d++;
          else if (ch === ")" || ch === "]" || ch === "}") d--;
          else if (ch === "&" && d === 0) {
            if (j + 1 < cellTrimmed.length && cellTrimmed[j + 1] === "&") { j++; continue; }
            aIdx = j; break;
          }
        }
        if (aIdx >= 0) {
          unitAnnotation = cellTrimmed.substring(aIdx + 1).trim();
          cellExprStr = cellTrimmed.substring(0, aIdx).trim();
        }
      }

      const assignMatch = cellExprStr.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1];
        const expr = assignMatch[2].trim();
        try {
          const value = math.evaluate(expr, this.scope);
          this.scope[varName] = value;
          const cell: CellResult = {
            varName, expr, value,
            display: `${varName} = ${this._formatValue(value)}`
          };
          if (unitAnnotation) cell.unitAnnotation = unitAnnotation;
          cells.push(cell);
        } catch (e: any) {
          cells.push({
            varName, expr, value: undefined,
            display: `${varName} = ?`, error: e.message
          });
        }
      } else {
        // Expresion pura en celda
        try {
          const value = math.evaluate(cellExprStr, this.scope);
          const cell: CellResult = {
            varName: "", expr: cellExprStr, value,
            display: this._formatValue(value)
          };
          if (unitAnnotation) cell.unitAnnotation = unitAnnotation;
          cells.push(cell);
        } catch (e: any) {
          cells.push({
            varName: "", expr: cellExprStr, value: undefined,
            display: cellExprStr, error: e.message
          });
        }
      }
    }

    const lr: LineResult = { lineIndex, input: raw, type: "cells", cells, cellsMode: mode };
    if (this._displayMode) lr.displayMode = this._displayMode;
    return lr;
  }

  // ─── Evaluar linea ────────────────────────────────────
  private async _evalLine(line: string): Promise<Partial<LineResult>> {
    // Normalize prime notation: f'_c → f_prime_c (ACI concrete notation)
    line = line.replace(/([a-zA-Z])'([_a-zA-Z])/g, '$1_prime$2');

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

    // ── Cell element write: V{i} = expr ──
    const cellWriteMatch = line.match(/^([a-zA-Z_]\w*)\{(.+?)\}\s*=(?!=)\s*(.+)$/);
    if (cellWriteMatch) {
      const varName = cellWriteMatch[1];
      const idxExpr = cellWriteMatch[2];
      const rhsExpr = this._fixNx1Indexing(this._resolveCellRefs(cellWriteMatch[3]));
      try {
        const idx = Math.round(Number(math.evaluate(idxExpr, this.scope))) - 1;
        const val = await this._evalExpr(rhsExpr);
        if (!this.scope[varName] || !(this.scope[varName] as any).__cell) {
          this.scope[varName] = { __cell: true, elements: [] };
        }
        (this.scope[varName] as any).elements[idx] = val;
        return { type: "directive" as const, display: "" };
      } catch (e: any) {
        return { type: "error" as const, error: e.message };
      }
    }

    // ── Multi-output assignment: [a, b] = func(args) ──
    const multiOutMatch = line.match(/^\[([^\]]+)\]\s*=\s*(\w+)\s*\(([^)]*)\)\s*$/);
    if (multiOutMatch) {
      const outNames = multiOutMatch[1].split(",").map(s => s.trim()).filter(Boolean);
      const funcName = multiOutMatch[2];
      const argsStr = multiOutMatch[3];
      const fn = this.scope[funcName];
      if (typeof fn === "function") {
        const args = argsStr ? argsStr.split(",").map(a => {
          const resolved = this._fixNx1Indexing(this._resolveCellRefs(a.trim()));
          return math.evaluate(resolved, this.scope);
        }) : [];
        const result = fn(...args);
        if (result && (result as any).__cell) {
          const elements = (result as any).elements;
          const displays: string[] = [];
          for (let k = 0; k < outNames.length; k++) {
            const val = elements[k] ?? 0;
            this.scope[outNames[k]] = val;
            displays.push(`${outNames[k]} = ${this._formatValue(val)}`);
          }
          return {
            type: "assignment" as const,
            varName: outNames[0],
            value: result,
            display: displays.join("\n"),
          };
        } else {
          // Single output
          this.scope[outNames[0]] = result;
          return {
            type: "assignment" as const,
            varName: outNames[0],
            value: result,
            display: `${outNames[0]} = ${this._formatValue(result)}`,
          };
        }
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
      const expr = this._fixRangeSlicing(this._fixNx1Indexing(this._resolveCellRefs(assignMatch[2])));
      let value: any;
      try {
        value = await this._evalExpr(expr);
      } catch (evalErr: any) {
        throw evalErr;
      }
      const casResult = this._lastCASResult;
      // Auto-strip units when units:strip mode is active
      // Detect default unit BEFORE stripping (so renderer can display it)
      let defaultUnit: string | undefined;
      if (this.unitsStrip) {
        // If expression used & or | (explicit unit override), extract number in the target unit
        const hasUnitOverride = /(?<!\&)\&(?!\&)/.test(assignMatch[2]) || /(?<!\|)\|(?!\|)/.test(assignMatch[2]);
        if (hasUnitOverride && value && typeof value === 'object' && value.type === 'Unit') {
          const uStr = value.toString();
          const spaceIdx = uStr.indexOf(' ');
          defaultUnit = spaceIdx > 0 ? uStr.substring(spaceIdx + 1) : undefined;
          try { value = value.toNumber(defaultUnit); } catch { value = parseFloat(uStr) || value; }
        } else if (hasUnitOverride && value && typeof value === 'object' && (value as any).__commonUnitArray) {
          // Matrix/array with per-row unit array from & [...] — preserve array, no single defaultUnit
          // Don't set defaultUnit — per-row units handled by renderer via __commonUnitArray
        } else if (hasUnitOverride && value && typeof value === 'object' && (value as any).__commonUnit) {
          // Matrix/array with __commonUnit from tounit() — preserve unit label
          defaultUnit = (value as any).__commonUnit;
        } else {
          defaultUnit = this._detectDefaultUnit(value);
          // If value is already a number (post-strip scope), try to derive unit
          // by re-evaluating with original unit scope (too expensive).
          // Instead, use heuristic: infer from the variables used in expression.
          if (!defaultUnit) {
            defaultUnit = this._inferUnitFromExpr(assignMatch[2].trim());
          }
          value = this._stripUnit(value);
        }
        if (defaultUnit) this._varUnits.set(varName, defaultUnit);
      }
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
        defaultUnit,
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
    const resolved = this._fixRangeSlicing(this._fixNx1Indexing(this._resolveCellRefs(line)));
    let value = await this._evalExpr(resolved);
    const casResult = this._lastCASResult;
    let defaultUnit: string | undefined;
    if (this.unitsStrip) {
      // If expression used & or | (explicit unit override), extract number in the target unit
      // instead of re-stripping to the default system (which would undo the conversion)
      const hasUnitOverride = /(?<!\&)\&(?!\&)/.test(line) || /(?<!\|)\|(?!\|)/.test(line);
      if (hasUnitOverride && value && typeof value === 'object' && value.type === 'Unit') {
        const uStr = value.toString();
        const spaceIdx = uStr.indexOf(' ');
        defaultUnit = spaceIdx > 0 ? uStr.substring(spaceIdx + 1) : undefined;
        try { value = value.toNumber(defaultUnit); } catch { value = parseFloat(uStr) || value; }
      } else if (hasUnitOverride && value && typeof value === 'object' && (value as any).__commonUnitArray) {
        // Matrix/array with per-row unit array — no single defaultUnit
      } else if (hasUnitOverride && value && typeof value === 'object' && (value as any).__commonUnit) {
        // Matrix/array with __commonUnit from tounit() — preserve unit label
        defaultUnit = (value as any).__commonUnit;
      } else {
        defaultUnit = this._detectDefaultUnit(value);
        if (!defaultUnit) defaultUnit = this._inferUnitFromExpr(line.trim());
        value = this._stripUnit(value);
      }
    }
    return {
      type: "expression", value, display: this._formatValue(value),
      defaultUnit,
      latex: casResult?.latex, casEngine: casResult?.engine,
    };
  }

  /**
   * Evaluate expression, routing CAS function calls to the symbolic engine.
   * CAS functions: diff, integrate, limit, solve, dsolve, simplify, expand,
   * factor, laplace, fourier, series, taylor (+ sdiff alias for diff).
   */
  private async _evalExpr(expr: string): Promise<any> {
    // Normalize Calcpad matrix syntax [a; b| c; d] → [a, b; c, d] early
    expr = this._normalizeCalcpadMatrix(expr);
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

    // NEW: Try strip-evaluate-tag for & operator.
    // This handles dimensionally-inconsistent formulas (e.g. sqrt(kgf/cm²))
    // that tounit() can't process. Falls back to tounit() if strip approach fails.
    if (expr.includes("&")) {
      const ampResult = this._evalWithAmpersandStrip(expr);
      if (ampResult !== undefined) return ampResult;
    }

    // Per-row pipe conversion: expr | [unit1, unit2, ...]
    // Intercept before _normalizePipe mangles the bracket syntax.
    if (expr.includes("|")) {
      const pipeArrayResult = this._evalPipeArray(expr);
      if (pipeArrayResult !== undefined) return pipeArrayResult;
    }

    const normalized = this._normalizePipe(this._normalizeAmpersand(expr));

    // When expression uses unit conversion (& or |), restore units from _varUnits
    // so tounit() / "to" work correctly for stripped variables (pure numbers).
    const hasUnitConversion = normalized.includes('tounit(') ||
      (expr.includes('|') && normalized.includes(' to '));
    if (this._varUnits.size > 0 && hasUnitConversion) {
      const tmpScope: Record<string, any> = {};
      for (const key of Object.keys(this.scope)) {
        tmpScope[key] = this.scope[key];
      }
      // Restore scalar units so math.js "to" operator works
      for (const [varName, unitStr] of this._varUnits) {
        if (!(varName in tmpScope)) continue;
        const val = tmpScope[varName];
        if (typeof val === 'number') {
          try {
            tmpScope[varName] = math.unit(val, unitStr);
          } catch { /* skip if unit creation fails */ }
        }
      }
      // Try evaluating with restored scalar units (works for scalar | conversions)
      try {
        return math.evaluate(normalized, tmpScope);
      } catch { /* fall through to matrix conversion */ }
    }

    // Manual matrix/vector conversion for | pipe: "varName to targetUnit"
    // Works even when _varUnits is empty — uses __commonUnit from & tag as source unit.
    if (hasUnitConversion) {
      const toMatch = normalized.match(/^(\w+)\s+to\s+(\S+)\s*$/);
      if (toMatch) {
        const [, srcVar, tgtUnit] = toMatch;
        const srcVal = this.scope[srcVar];
        // Source unit: prefer _varUnits, fallback to __commonUnit tag from & operator
        const srcUnit = this._varUnits.get(srcVar) ||
          (srcVal && typeof srcVal === 'object' ? (srcVal as any).__commonUnit : undefined);
        if (srcUnit && srcVal && typeof srcVal === 'object') {
          try {
            const factor = math.unit(1, srcUnit).to(tgtUnit).toNumber(tgtUnit);
            if (srcVal.type === 'DenseMatrix') {
              const result = srcVal.map((el: any) =>
                typeof el === 'number' ? el * factor : el);
              (result as any).__commonUnit = tgtUnit;
              return result;
            }
            if (Array.isArray(srcVal)) {
              const deepMap = (a: any): any =>
                Array.isArray(a) ? a.map(deepMap) : (typeof a === 'number' ? a * factor : a);
              const result = deepMap(srcVal);
              (result as any).__commonUnit = tgtUnit;
              return result;
            }
          } catch { /* conversion failed */ }
        }
      }
    }

    return math.evaluate(normalized, this.scope);
  }

  /**
   * Normalize pipe `|` → ` to ` for unit conversion (math.js syntax).
   * Only replaces top-level pipes (not inside brackets/parens).
   * Skips `||` (logical OR).
   * Example: `5 cm|m` → `5 cm to m`
   */
  /**
   * Normalize Calcpad matrix syntax: [a; b| c; d] → [a, b; c, d]
   * In Calcpad: semicolons separate columns, pipes separate rows.
   * In MATLAB:  commas separate columns, semicolons separate rows.
   * Only transforms pipe chars that appear inside brackets.
   */
  private _normalizeCalcpadMatrix(expr: string): string {
    if (!expr.includes("|")) return expr;
    // Find bracket regions that contain pipes
    const chars = [...expr];
    const result: string[] = [];
    let i = 0;
    while (i < chars.length) {
      if (chars[i] === "[") {
        // Scan ahead to find matching ] and check for |
        let depth = 1;
        let j = i + 1;
        while (j < chars.length && depth > 0) {
          if (chars[j] === "[") depth++;
          else if (chars[j] === "]") depth--;
          j++;
        }
        // j is now past the matching ]
        const bracketContent = expr.slice(i + 1, j - 1);
        if (bracketContent.includes("|") && !bracketContent.startsWith("[")) {
          // Calcpad style: convert ; → , and | → ; inside this bracket
          result.push("[");
          for (let k = i + 1; k < j - 1; k++) {
            if (chars[k] === ";") result.push(",");
            else if (chars[k] === "|") result.push(";");
            else result.push(chars[k]);
          }
          result.push("]");
          i = j;
        } else {
          result.push(chars[i]);
          i++;
        }
      } else {
        result.push(chars[i]);
        i++;
      }
    }
    return result.join("");
  }

  private _normalizePipe(expr: string): string {
    if (!expr.includes("|")) return expr;
    let result = "";
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(" || ch === "[" || ch === "{") { depth++; result += ch; }
      else if (ch === ")" || ch === "]" || ch === "}") { depth--; result += ch; }
      else if (ch === "|" && depth === 0) {
        // Skip || (logical OR)
        if (i + 1 < expr.length && expr[i + 1] === "|") {
          result += "||";
          i++;
        } else {
          result += " to ";
        }
      } else {
        result += ch;
      }
    }
    return result;
  }

  /**
   * Transform `&` operator: `expr & unit` → `tounit(expr, "unit")`
   * Only matches top-level `&` (not inside brackets/parens).
   * The right side of `&` is treated as the target unit string.
   * Examples:
   *   k & kN/m        → tounit(k, "kN/m")
   *   12*E*I/L^3 & kN/m → tounit(12*E*I/L^3, "kN/m")
   *   F & kN           → tounit(F, "kN")
   */
  private _normalizeAmpersand(expr: string): string {
    if (!expr.includes("&")) return expr;
    // Find top-level & (not inside brackets/parens)
    let depth = 0;
    let ampIdx = -1;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") depth--;
      else if (ch === "&" && depth === 0) {
        // Skip && (logical AND)
        if (i + 1 < expr.length && expr[i + 1] === "&") { i++; continue; }
        ampIdx = i;
        break;
      }
    }
    if (ampIdx < 0) return expr;
    const left = expr.substring(0, ampIdx).trim();
    const right = expr.substring(ampIdx + 1).trim();
    if (!left || !right) return expr;
    return `tounit(${left}, "${right}")`;
  }

  /**
   * Extract base force and length units from a unit string.
   * E.g. "kgf/cm^2" → { force: "kgf", length: "cm" }
   *      "tonf m^2" → { force: "tonf", length: "m" }
   *      "kN/m"     → { force: "kN", length: "m" }
   */
  private _extractBaseUnitsFromString(unitStr: string): { force: string; length: string } {
    // Tokenize: split on operators and exponents, keep only unit names
    const tokens = unitStr.replace(/[\^0-9\/\*\s]+/g, ' ').trim().split(/\s+/);
    const knownForce = new Set(['N', 'kN', 'MN', 'GN', 'kgf', 'tonf', 'lbf', 'kip', 'daN']);
    const knownLength = new Set(['m', 'cm', 'mm', 'km', 'in', 'ft', 'yd']);
    let force = '', length = '';
    for (const t of tokens) {
      if (!force && knownForce.has(t)) force = t;
      if (!length && knownLength.has(t)) length = t;
    }
    return { force, length };
  }

  /**
   * Strip-evaluate-tag implementation for the `&` operator.
   * Instead of `tounit(expr, "unit")` (which fails for dimensionally-inconsistent
   * formulas like `sqrt(kgf/cm²)`), this approach:
   *   1. Extracts force/length base units from the target unit string
   *   2. Builds a temp scope where ALL Unit variables are stripped to those base units
   *   3. Evaluates the expression (now purely numeric/dimensionless)
   *   4. Wraps the result with the target unit
   * Returns undefined if expression has no `&` or can't be processed this way.
   */
  private _evalWithAmpersandStrip(expr: string): any | undefined {
    if (!expr.includes("&")) return undefined;

    // Find top-level & (same logic as _normalizeAmpersand)
    let depth = 0;
    let ampIdx = -1;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") depth--;
      else if (ch === "&" && depth === 0) {
        if (i + 1 < expr.length && expr[i + 1] === "&") { i++; continue; }
        ampIdx = i;
        break;
      }
    }
    if (ampIdx < 0) return undefined;

    const baseExpr = expr.substring(0, ampIdx).trim();
    const targetUnit = expr.substring(ampIdx + 1).trim();
    if (!baseExpr || !targetUnit) return undefined;

    // --- Per-row unit array: & [rad, rad, in] ---
    if (targetUnit.startsWith("[") && targetUnit.endsWith("]")) {
      return this._evalAmpersandArray(baseExpr, targetUnit);
    }

    // --- Chain conversion: & unit1|unit2 ---
    // Evaluates in unit1 system, then converts numeric result to unit2
    // e.g. "Suma & kN|tonf" → evaluate Suma in kN, then convert to tonf
    if (targetUnit.includes("|") && !targetUnit.includes("||")) {
      const pipeIdx = targetUnit.indexOf("|");
      const srcUnit = targetUnit.substring(0, pipeIdx).trim();
      const dstUnit = targetUnit.substring(pipeIdx + 1).trim();
      if (srcUnit && dstUnit) {
        // Recursively evaluate "baseExpr & srcUnit" first
        const srcResult = this._evalWithAmpersandStrip(
          baseExpr + " & " + srcUnit
        );
        if (srcResult !== undefined) {
          // srcResult is a Unit (scalar) or tagged matrix/array
          if (typeof srcResult === "object" && srcResult !== null && srcResult.type === "Unit") {
            // Scalar Unit: convert to dstUnit
            try {
              return srcResult.to(dstUnit);
            } catch { /* fall through */ }
          } else if (typeof srcResult === "object" && srcResult !== null &&
                     (srcResult.type === "DenseMatrix" || Array.isArray(srcResult))) {
            // Matrix/array with __commonUnit tag: convert via factor
            const commonUnit = (srcResult as any).__commonUnit;
            if (commonUnit) {
              try {
                const factor = (math as any).unit(1, commonUnit).to(dstUnit).toNumber(dstUnit);
                const converted = srcResult.type === "DenseMatrix"
                  ? srcResult.map((el: any) => typeof el === "number" ? el * factor : el)
                  : (srcResult as any[]).map((el: any) => typeof el === "number" ? el * factor : el);
                (converted as any).__commonUnit = dstUnit;
                return converted;
              } catch { /* fall through */ }
            }
          }
        }
      }
    }

    // Extract base units from target
    const { force, length } = this._extractBaseUnitsFromString(targetUnit);
    // & requires recognizable force and/or length units to perform conversion
    if (!force && !length) return undefined;

    // Build temp scope with all variables stripped to the target unit system
    const tmpScope: Record<string, any> = {};
    for (const key of Object.keys(this.scope)) {
      tmpScope[key] = this.scope[key];
    }

    // If unitsStrip is active, variables are already numbers in the default system.
    // Restore them as Unit values using _varUnits, then re-strip to the target system.
    if (this.unitsStrip && this._varUnits.size > 0) {
      for (const [varName, unitStr] of this._varUnits) {
        if (!(varName in tmpScope)) continue;
        const val = tmpScope[varName];

        if (typeof val === 'number') {
          // Scalar: restore as Unit, then strip to target system
          try {
            const restored = math.unit(val, unitStr);
            tmpScope[varName] = this._unitToNumberWith(restored, force, length);
          } catch { /* keep number as-is */ }
        } else if (typeof val === 'object' && val !== null &&
                   (val.type === 'DenseMatrix' || Array.isArray(val))) {
          // Matrix/array: compute conversion factor and multiply all elements
          try {
            const oneUnit = math.unit(1, unitStr);
            const factor = this._unitToNumberWith(oneUnit, force, length);
            if (factor !== 1) {
              if (val.type === 'DenseMatrix') {
                tmpScope[varName] = val.map((el: any) =>
                  typeof el === 'number' ? el * factor : el);
              } else {
                tmpScope[varName] = (val as any[]).map((el: any) =>
                  typeof el === 'number' ? el * factor : el);
              }
            }
          } catch { /* keep as-is */ }
        }
      }
    }

    // Strip any remaining Unit values (when unitsStrip is NOT active)
    for (const key of Object.keys(tmpScope)) {
      const v = tmpScope[key];
      if (v == null || typeof v === "function") continue;
      if (typeof v === "object" && v.type === "Unit") {
        tmpScope[key] = this._unitToNumberWith(v, force, length);
      } else if (typeof v === "object" && v.type === "DenseMatrix" && typeof v.map === "function") {
        tmpScope[key] = v.map((el: any) => {
          if (typeof el === "object" && el !== null && el.type === "Unit") {
            return this._unitToNumberWith(el, force, length);
          }
          return el;
        });
      } else if (Array.isArray(v)) {
        tmpScope[key] = v.map((el: any) => {
          if (typeof el === "object" && el !== null && el.type === "Unit") {
            return this._unitToNumberWith(el, force, length);
          }
          return el;
        });
      }
    }

    // Evaluate the base expression with the stripped scope (dimensionless)
    const normalized = this._normalizePipe(baseExpr);
    let result: any;
    try {
      result = math.evaluate(normalized, tmpScope);
    } catch {
      return undefined; // Fall through to existing tounit() approach
    }

    // Wrap scalar result with the target unit
    if (typeof result === "number") {
      try {
        return math.unit(result, targetUnit);
      } catch {
        return undefined;
      }
    }

    // Matrix/array result — tag with __commonUnit
    if (typeof result === "object" && result !== null) {
      if (result.type === "DenseMatrix" || Array.isArray(result)) {
        (result as any).__commonUnit = targetUnit;
        return result;
      }
    }

    return undefined;
  }

  /**
   * Handle per-row unit array: expr & [unit1, unit2, ...]
   * Tags each row of a vector/matrix with its own unit.
   * No unit conversion is performed — values stay as-is.
   * Sets __commonUnitArray on the result for the renderer.
   */
  private _evalAmpersandArray(baseExpr: string, bracketStr: string): any | undefined {
    // Parse [rad, rad, in] → ["rad", "rad", "in"]
    const inner = bracketStr.slice(1, -1).trim();
    if (!inner) return undefined;
    const units = inner.split(",").map(s => s.trim()).filter(Boolean);
    if (units.length === 0) return undefined;

    // Evaluate the base expression with current scope
    const normalized = this._normalizePipe(baseExpr);
    let result: any;
    try {
      result = math.evaluate(normalized, this.scope);
    } catch {
      return undefined;
    }

    // Tag the result with per-row unit array
    if (result && typeof result === "object") {
      if (result.type === "DenseMatrix" || Array.isArray(result)) {
        (result as any).__commonUnitArray = units;
        return result;
      }
    }

    // Scalar with array of 1 unit — treat as regular unit
    if (typeof result === "number" && units.length === 1) {
      try { return math.unit(result, units[0]); } catch { /* fall through */ }
    }

    return undefined;
  }

  /**
   * Handle per-row pipe conversion: expr | [unit1, unit2, ...]
   * Converts each row of a vector/matrix using its own source→target unit pair.
   * Source units come from __commonUnitArray (set by & [u1,u2,...]) or _varUnits.
   */
  private _evalPipeArray(expr: string): any | undefined {
    // Find top-level | followed by [...]
    const pipeMatch = expr.match(/^(.+?)\s*\|\s*\[([^\]]+)\]\s*$/);
    if (!pipeMatch) return undefined;

    const baseExpr = pipeMatch[1].trim();
    const targetUnitsStr = pipeMatch[2].trim();
    const targetUnits = targetUnitsStr.split(",").map(s => s.trim()).filter(Boolean);
    if (targetUnits.length === 0) return undefined;

    // Evaluate the base expression
    let srcVal: any;
    try {
      srcVal = math.evaluate(baseExpr, this.scope);
    } catch {
      // Try scope lookup directly (simple variable name)
      srcVal = this.scope[baseExpr];
    }
    if (!srcVal || typeof srcVal !== 'object') return undefined;

    // Get source units per row: from __commonUnitArray or single __commonUnit
    const srcUnitArray: string[] | undefined = (srcVal as any).__commonUnitArray;
    const srcUnitSingle: string | undefined = (srcVal as any).__commonUnit ||
      this._varUnits.get(baseExpr);

    // Extract rows from DenseMatrix or Array
    let rows: any[];
    if (srcVal.type === 'DenseMatrix') {
      const data = (srcVal as any)._data;
      rows = data || srcVal.toArray();
    } else if (Array.isArray(srcVal)) {
      rows = srcVal;
    } else {
      return undefined;
    }

    // Convert each row using its source→target unit pair
    const nRows = rows.length;
    const newRows: any[] = [];
    const resultUnitArray: string[] = [];

    for (let r = 0; r < nRows; r++) {
      const tgtUnit = targetUnits[r] || targetUnits[targetUnits.length - 1];
      const srcUnit = srcUnitArray ? (srcUnitArray[r] || srcUnitArray[srcUnitArray.length - 1]) : srcUnitSingle;

      resultUnitArray.push(tgtUnit);

      if (!srcUnit || srcUnit === tgtUnit) {
        // Same unit or no source — keep value as-is
        newRows.push(rows[r]);
        continue;
      }

      // Compute conversion factor
      try {
        const factor = math.unit(1, srcUnit).to(tgtUnit).toNumber(tgtUnit);
        const row = rows[r];
        if (Array.isArray(row)) {
          newRows.push(row.map((v: any) => typeof v === 'number' ? v * factor : v));
        } else {
          newRows.push(typeof row === 'number' ? row * factor : row);
        }
      } catch {
        // Conversion failed (incompatible units, e.g. rad→mm) — keep as-is
        newRows.push(rows[r]);
      }
    }

    // Build result
    if (srcVal.type === 'DenseMatrix') {
      const result = math.matrix(newRows);
      (result as any).__commonUnitArray = resultUnitArray;
      return result;
    } else {
      (newRows as any).__commonUnitArray = resultUnitArray;
      return newRows;
    }
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
    // Dot-notation element access: var.(i) or var.(i,j) → subset(var, index(i)) or subset(var, index(i,j))
    expr = expr.replace(/\b([a-zA-Z_]\w*)\.\(([^)]+)\)/g, (match, name, args) => {
      if (this.scope[name] !== undefined) {
        return `subset(${name}, index(${args}))`;
      }
      return match;
    });
    return expr.replace(/\b([a-zA-Z_]\w*)\{([^}]+)\}/g, (match, name, idxExpr) => {
      const cell = this.scope[name];
      if (cell && (cell as any).__cell) {
        // Literal index: V{1}, V{2} → resolve directly to temp var
        if (/^\d+$/.test(idxExpr.trim())) {
          const idx = parseInt(idxExpr) - 1;
          const value = (cell as any).elements[idx];
          if (value !== undefined) {
            const tmpName = `__cell_${name}_${idxExpr.trim()}`;
            this.scope[tmpName] = value;
            return tmpName;
          }
        }
        // Variable index: V{e}, V{i+1} → use __cellget(V, expr)
        return `__cellget(${name}, ${idxExpr})`;
      }
      return match; // no es cell array, dejar como esta
    });
  }

  /** Convert a single Unit value to a number in the target force/length system */
  private _unitToNumber(unit: any): number {
    return this._unitToNumberWith(unit, this._unitsForce, this._unitsLength);
  }

  /** Detect the default unit string for a value (scalar, matrix, or array) */
  private _detectDefaultUnit(value: any): string | undefined {
    if (value == null) return undefined;
    // Scalar Unit
    if (typeof value === "object" && value.type === "Unit") {
      return this._detectTargetUnit(value) ?? undefined;
    }
    // DenseMatrix — check first Unit cell
    if (typeof value === "object" && value.type === "DenseMatrix") {
      const raw = (value as any)._data;
      if (raw) {
        const first = this._findFirstUnit(raw);
        if (first) return this._detectTargetUnit(first) ?? undefined;
      }
    }
    // Plain array
    if (Array.isArray(value)) {
      const first = this._findFirstUnit(value);
      if (first) return this._detectTargetUnit(first) ?? undefined;
    }
    return undefined;
  }

  /** Find the first Unit object in a nested array */
  private _findFirstUnit(arr: any): any {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const found = this._findFirstUnit(item);
        if (found) return found;
      }
    } else if (arr && typeof arr === "object" && arr.type === "Unit") {
      return arr;
    }
    return null;
  }

  /**
   * Infer the resulting unit of an expression by performing dimensional analysis.
   * Uses the stored _varUnits map to know the units of each variable,
   * then re-evaluates the expression with unit objects to get the result unit.
   */
  private _inferUnitFromExpr(expr: string): string | undefined {
    if (!this._unitsForce && !this._unitsLength) return undefined;
    // Extract variable names from expression
    const varNames = expr.match(/[a-zA-Z_]\w*/g);
    if (!varNames) return undefined;
    // Check if any variable has a known unit
    const hasUnit = varNames.some(v => this._varUnits.has(v));
    if (!hasUnit) return undefined;
    // Build a temporary scope with unit values
    try {
      const tmpScope: Record<string, any> = {};
      for (const v of varNames) {
        const unitStr = this._varUnits.get(v);
        if (unitStr) {
          // Create a Unit with value 1 in the known unit
          tmpScope[v] = math.unit(1, unitStr);
        } else if (v in this.scope && typeof this.scope[v] === "number") {
          tmpScope[v] = this.scope[v]; // dimensionless number
        }
      }
      // Also add math functions
      const result = math.evaluate(expr, tmpScope);
      if (result && typeof result === "object" && result.type === "Unit") {
        return this._detectTargetUnit(result) ?? undefined;
      }
    } catch {}
    return undefined;
  }

  /** Detect the target unit string that matches a Unit value in the configured system */
  private _detectTargetUnit(unit: any): string | null {
    if (!unit || typeof unit !== "object" || unit.type !== "Unit") return null;
    const fu = this._unitsForce;
    const lu = this._unitsLength;
    const patterns: string[] = [];
    if (lu) patterns.push(lu, lu + '^2', lu + '^3', lu + '^4');
    if (fu) patterns.push(fu);
    if (fu && lu) {
      patterns.push(
        fu + '/' + lu, fu + '/' + lu + '^2', fu + '/' + lu + '^3',
        fu + ' ' + lu, fu + ' ' + lu + '^2',
      );
    }
    if (lu) patterns.push('1/' + lu, '1/' + lu + '^2');
    for (const target of patterns) {
      try { unit.toNumber(target); return target; } catch {}
    }
    return null;
  }

  /**
   * Convert a Unit value to a number using a specific force+length system.
   * Tries all common structural engineering unit patterns (force, force/length, etc.)
   * until one succeeds. This is the core of the smart unit conversion algorithm:
   *   1. Convert all sub-units to the target system (e.g., cm→m, MPa→kN/m²)
   *   2. math.js internally simplifies (m/m = 1) making the result dimensionless
   *   3. Returns the pure numeric coefficient
   */
  private _unitToNumberWith(unit: any, fu: string, lu: string): number {
    const patterns: string[] = [];
    if (lu) {
      patterns.push(lu, lu + '^2', lu + '^3', lu + '^4');
    }
    if (fu) {
      patterns.push(fu);
    }
    if (fu && lu) {
      patterns.push(
        fu + '/' + lu, fu + '/' + lu + '^2', fu + '/' + lu + '^3',  // force/length^n
        fu + ' ' + lu, fu + ' ' + lu + '^2',                         // force*length^n (moment)
      );
    }
    if (lu) {
      patterns.push('1/' + lu, '1/' + lu + '^2');
    }
    for (const target of patterns) {
      try { return unit.toNumber(target); } catch {}
    }
    // Fallback: extract the numeric coefficient as displayed
    try {
      const str = unit.toString();
      const num = parseFloat(str);
      if (!isNaN(num)) return num;
    } catch {}
    return typeof unit.value === "number" ? unit.value : 0;
  }

  /** Strip units from a value (scalar, matrix, or array) */
  private _stripUnit(value: any): any {
    if (value == null) return value;
    // mathjs Unit
    if (typeof value === "object" && value.type === "Unit") {
      return this._unitToNumber(value);
    }
    // mathjs DenseMatrix — map each element
    if (typeof value === "object" && value.type === "DenseMatrix" && typeof value.map === "function") {
      return value.map((v: any) => {
        if (typeof v === "object" && v !== null && v.type === "Unit") return this._unitToNumber(v);
        return v;
      });
    }
    // Plain array
    if (Array.isArray(value)) {
      return value.map((v: any) => this._stripUnit(v));
    }
    return value;
  }

  /** Convert all Unit values in scope to numbers using the target unit system */
  private _stripScopeUnits(): void {
    for (const key of Object.keys(this.scope)) {
      const v = this.scope[key];
      if (v == null || typeof v === "function") continue;
      if (typeof v === "object" && v.type === "Unit") {
        // Save the pre-strip display value + unit (numeric part in original units)
        // e.g. Unit(30, "cm") → save {value: 30, unit: "cm"} before converting to 0.3 m
        try {
          const uStr = v.formatUnits ? v.formatUnits() : "";
          if (uStr) {
            const displayVal = v.toNumber(uStr);
            if (isFinite(displayVal)) this._preStripDisplay.set(key, { value: displayVal, unit: uStr });
          }
        } catch { /* ignore — fallback to no pre-strip value */ }
        const detected = this._detectTargetUnit(v);
        if (detected) this._varUnits.set(key, detected);
        this.scope[key] = this._unitToNumber(v);
      } else if (typeof v === "object" && v.type === "DenseMatrix") {
        const du = this._detectDefaultUnit(v);
        if (du) this._varUnits.set(key, du);
        this.scope[key] = this._stripUnit(v);
      } else if (Array.isArray(v)) {
        const du = this._detectDefaultUnit(v);
        if (du) this._varUnits.set(key, du);
        this.scope[key] = this._stripUnit(v);
      }
    }
  }

  /** Transform range-indexed access: VAR[a:b, c:d] → subset(VAR, index([a,...,b], [c,...,d])) */
  private _fixRangeSlicing(expr: string): string {
    return expr.replace(/\b([a-zA-Z_]\w*)\[([^\]]*:[^\]]*)\]/g, (match, name, idxContent) => {
      // Only transform if the variable exists in scope
      if (this.scope[name] === undefined) return match;
      // Split by top-level commas
      const parts = idxContent.split(",").map(s => s.trim());
      const indexArgs = parts.map(part => {
        const rangeMatch = part.match(/^(.+):(.+)$/);
        if (rangeMatch) {
          // Expand a:b → [a, a+1, ..., b]
          try {
            const a = Math.round(Number(math.evaluate(rangeMatch[1], this.scope)));
            const b = Math.round(Number(math.evaluate(rangeMatch[2], this.scope)));
            const arr: number[] = [];
            for (let i = a; i <= b; i++) arr.push(i);
            return `[${arr.join(",")}]`;
          } catch {
            return part; // fallback
          }
        }
        return part;
      });
      return `subset(${name}, index(${indexArgs.join(", ")}))`;
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

  /** Display aliases for units: math.js name → display name */
  private static _unitDisplayAlias: Record<string, string> = {
    "inch": "in",
  };

  /** Parse unit tokens from a string, returning Map<base, exponent> and insertion order */
  private static _parseUnitTokens(s: string): { counts: Map<string, number>; order: string[] } {
    const tokens = s.split(/\s+/).filter(Boolean);
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const tok of tokens) {
      // strip parentheses that math.js sometimes adds
      const clean = tok.replace(/[()]/g, "");
      if (!clean) continue;
      const m = clean.match(/^([a-zA-Z\u00B0\u2103\u2109]+)\^?(\d*)$/);
      if (m) {
        const base = m[1];
        const exp = m[2] ? parseInt(m[2]) : 1;
        if (!counts.has(base)) order.push(base);
        counts.set(base, (counts.get(base) || 0) + exp);
      } else {
        if (!counts.has(clean)) order.push(clean);
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return { counts, order };
  }

  /** Format unit tokens back to string, applying display aliases */
  private static _formatUnitTokens(counts: Map<string, number>, order: string[]): string {
    const parts: string[] = [];
    for (const base of order) {
      const exp = counts.get(base);
      if (!exp || exp <= 0) continue;
      const display = HekatanEvaluator._unitDisplayAlias[base] || base;
      parts.push(exp === 1 ? display : `${display}^${exp}`);
    }
    return parts.join(" ");
  }

  /**
   * Simplify unit string: collapse repeated tokens AND cancel across numerator/denominator.
   * "cm cm" → "cm^2", "kip inch^4 / inch^2 inch" → "kip in"
   */
  static simplifyUnits(unitStr: string): string {
    if (!unitStr) return unitStr;

    // Strip outer parens: "(kip inch^4) / (inch^2 inch)" → "kip inch^4 / inch^2 inch"
    let s = unitStr.trim();

    const slashIdx = s.indexOf("/");
    if (slashIdx < 0) {
      // No fraction — just collapse repeated tokens
      if (!s.includes(" ")) {
        // Single token — just apply alias
        const alias = HekatanEvaluator._unitDisplayAlias[s] || s;
        return alias;
      }
      const { counts, order } = HekatanEvaluator._parseUnitTokens(s);
      return HekatanEvaluator._formatUnitTokens(counts, order);
    }

    // Has fraction — parse both sides and cancel common factors
    const numStr = s.slice(0, slashIdx).trim();
    const denStr = s.slice(slashIdx + 1).trim();
    const num = HekatanEvaluator._parseUnitTokens(numStr);
    const den = HekatanEvaluator._parseUnitTokens(denStr);

    // Cancel common bases
    for (const [base, denExp] of den.counts) {
      const numExp = num.counts.get(base) || 0;
      if (numExp > 0 && denExp > 0) {
        const net = numExp - denExp;
        if (net > 0) {
          num.counts.set(base, net);
          den.counts.delete(base);
        } else if (net < 0) {
          num.counts.delete(base);
          den.counts.set(base, -net);
        } else {
          // Fully cancel
          num.counts.delete(base);
          den.counts.delete(base);
        }
      }
    }

    const numResult = HekatanEvaluator._formatUnitTokens(num.counts, num.order);
    const denResult = HekatanEvaluator._formatUnitTokens(den.counts, den.order);

    if (!denResult) return numResult || "";
    if (!numResult) return `1 / ${denResult}`;
    return `${numResult} / ${denResult}`;
  }

  private _formatValue(value: any): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "function") return "[function]";

    // Cell array
    if (value && (value as any).__cell) {
      const elems = (value as any).elements as any[];
      return `{${elems.map((e: any) => this._formatValue(e)).join(", ")}}`;
    }

    // math.js Unit object (e.g. 5 cm, 250 MPa)
    if (value && typeof value === "object"
        && typeof value.toNumber === "function"
        && typeof value.formatUnits === "function") {
      const num = value.toNumber();
      const unit = HekatanEvaluator.simplifyUnits(value.formatUnits());
      const numStr = Number.isInteger(num) ? String(num)
        : String(Math.round(num * 10000) / 10000);
      return unit ? `${numStr} ${unit}` : numStr;
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
      let fmtName = varName ?? "";
      // Convert underscores to subscripts: KM_0 → KM<sub>0</sub>
      if (fmtName.includes("_")) {
        const p = fmtName.split("_");
        fmtName = `${p[0]}<sub>${p.slice(1).join("_")}</sub>`;
      }
      const label = varName
        ? `<span class="cell-label">[${fmtName}]<sub>${i + 1}</sub></span> = `
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

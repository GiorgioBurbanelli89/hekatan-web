/**
 * Hekatan Eigen WASM Solver — TypeScript wrapper
 *
 * Provides sparse and dense linear algebra via C++/Eigen compiled to WASM.
 * Lazy-loads the WASM module on first use.
 *
 * Usage:
 *   import { eigenSolver } from './wasm/eigenSolver';
 *
 *   // Sparse solve (FEM stiffness matrices)
 *   const x = await eigenSolver.sparseSolve(n, rows, cols, vals, b);
 *
 *   // Dense operations
 *   const x = await eigenSolver.denseSolve(A, b);
 *   const inv = await eigenSolver.inverse(A);
 *   const d = await eigenSolver.det(A);
 *   const ev = await eigenSolver.eigenvalues(A);
 */

// @ts-ignore — Emscripten-generated module
import createModule from "./built/eigen_sparse.js";

type WasmModule = {
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _sparse_lu_solve: (
    n: number, nnz: number,
    rows: number, cols: number, vals: number,
    b: number, x: number
  ) => number;
  _sparse_cholesky_solve: (
    n: number, nnz: number,
    rows: number, cols: number, vals: number,
    b: number, x: number
  ) => number;
  _dense_solve: (n: number, A: number, b: number, x: number) => number;
  _dense_inverse: (n: number, A: number, result: number) => number;
  _dense_det: (n: number, A: number) => number;
  _eigenvalues: (n: number, A: number, real: number, imag: number) => number;
  _eigen_decompose: (n: number, A: number, real: number, imag: number, vectors: number) => number;
  _svd: (m: number, n: number, A: number, U: number, S: number, V: number) => number;
  _dense_multiply: (m: number, k: number, n: number, A: number, B: number, C: number) => void;
  _sparse_multiply: (
    m: number, n: number, nnz: number,
    rows: number, cols: number, vals: number,
    x: number, y: number
  ) => void;
  HEAPF64: Float64Array;
  HEAP32: Int32Array;
};

let mod: WasmModule | null = null;
let loading: Promise<WasmModule> | null = null;

async function getModule(): Promise<WasmModule> {
  if (mod) return mod;
  if (!loading) {
    loading = createModule().then((m: WasmModule) => {
      mod = m;
      return m;
    });
  }
  return loading;
}

/** Allocate WASM heap and copy data. Returns pointer. */
function allocF64(m: WasmModule, data: number[]): number {
  const buf = new Float64Array(data);
  const ptr = m._malloc(buf.length * 8);
  m.HEAPF64.set(buf, ptr / 8);
  return ptr;
}

function allocI32(m: WasmModule, data: number[]): number {
  const buf = new Int32Array(data);
  const ptr = m._malloc(buf.length * 4);
  m.HEAP32.set(buf, ptr / 4);
  return ptr;
}

/** Read n doubles from WASM heap. */
function readF64(m: WasmModule, ptr: number, n: number): number[] {
  return Array.from(m.HEAPF64.subarray(ptr / 8, ptr / 8 + n));
}

/** Free all pointers. */
function freeAll(m: WasmModule, ptrs: number[]) {
  ptrs.forEach((p) => m._free(p));
}

/**
 * Flatten a 2D array (row-major) to 1D.
 */
function flatten(mat: number[][]): number[] {
  const result: number[] = [];
  for (const row of mat) {
    for (const v of row) result.push(v);
  }
  return result;
}

/**
 * Unflatten 1D array to 2D (row-major).
 */
function unflatten(flat: number[], rows: number, cols: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < rows; i++) {
    result.push(flat.slice(i * cols, i * cols + cols));
  }
  return result;
}

// ─── Public API ─────────────────────────────────────────

export const eigenSolver = {
  /** Check if WASM module is loaded */
  get ready(): boolean {
    return mod !== null;
  },

  /** Pre-load the WASM module */
  async init(): Promise<void> {
    await getModule();
  },

  /**
   * Sparse LU solve: A·x = b (general square sparse system)
   *
   * @param n    Matrix dimension (n×n)
   * @param rows Row indices of non-zero entries
   * @param cols Column indices of non-zero entries
   * @param vals Values of non-zero entries
   * @param b    RHS vector [n]
   * @returns    Solution vector [n]
   */
  async sparseSolve(
    n: number,
    rows: number[],
    cols: number[],
    vals: number[],
    b: number[]
  ): Promise<number[]> {
    const m = await getModule();
    const nnz = rows.length;
    const ptrs: number[] = [];

    const rowsPtr = allocI32(m, rows); ptrs.push(rowsPtr);
    const colsPtr = allocI32(m, cols); ptrs.push(colsPtr);
    const valsPtr = allocF64(m, vals); ptrs.push(valsPtr);
    const bPtr = allocF64(m, b); ptrs.push(bPtr);
    const xPtr = m._malloc(n * 8); ptrs.push(xPtr);

    const status = m._sparse_lu_solve(n, nnz, rowsPtr, colsPtr, valsPtr, bPtr, xPtr);
    if (status !== 0) {
      freeAll(m, ptrs);
      throw new Error("sparse_lu_solve failed: singular or ill-conditioned matrix");
    }

    const x = readF64(m, xPtr, n);
    freeAll(m, ptrs);
    return x;
  },

  /**
   * Sparse Cholesky solve: A·x = b (symmetric positive definite — FEM stiffness)
   * Faster than sparseSolve for SPD matrices.
   */
  async sparseCholeskySolve(
    n: number,
    rows: number[],
    cols: number[],
    vals: number[],
    b: number[]
  ): Promise<number[]> {
    const m = await getModule();
    const nnz = rows.length;
    const ptrs: number[] = [];

    const rowsPtr = allocI32(m, rows); ptrs.push(rowsPtr);
    const colsPtr = allocI32(m, cols); ptrs.push(colsPtr);
    const valsPtr = allocF64(m, vals); ptrs.push(valsPtr);
    const bPtr = allocF64(m, b); ptrs.push(bPtr);
    const xPtr = m._malloc(n * 8); ptrs.push(xPtr);

    const status = m._sparse_cholesky_solve(n, nnz, rowsPtr, colsPtr, valsPtr, bPtr, xPtr);
    if (status !== 0) {
      freeAll(m, ptrs);
      throw new Error("sparse_cholesky_solve failed: matrix not SPD");
    }

    const x = readF64(m, xPtr, n);
    freeAll(m, ptrs);
    return x;
  },

  /**
   * Dense LU solve: A·x = b
   * @param A  2D matrix [n×n]
   * @param b  RHS vector [n]
   * @returns  Solution vector [n]
   */
  async denseSolve(A: number[][], b: number[]): Promise<number[]> {
    const m = await getModule();
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const bPtr = allocF64(m, b); ptrs.push(bPtr);
    const xPtr = m._malloc(n * 8); ptrs.push(xPtr);

    m._dense_solve(n, aPtr, bPtr, xPtr);

    const x = readF64(m, xPtr, n);
    freeAll(m, ptrs);
    return x;
  },

  /**
   * Matrix inverse.
   * @param A  2D matrix [n×n]
   * @returns  Inverse matrix [n×n]
   */
  async inverse(A: number[][]): Promise<number[][]> {
    const m = await getModule();
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const rPtr = m._malloc(n * n * 8); ptrs.push(rPtr);

    const status = m._dense_inverse(n, aPtr, rPtr);
    if (status !== 0) {
      freeAll(m, ptrs);
      throw new Error("Matrix is singular");
    }

    const result = unflatten(readF64(m, rPtr, n * n), n, n);
    freeAll(m, ptrs);
    return result;
  },

  /**
   * Determinant.
   */
  async det(A: number[][]): Promise<number> {
    const m = await getModule();
    const n = A.length;

    const aPtr = allocF64(m, flatten(A));
    const d = m._dense_det(n, aPtr);
    m._free(aPtr);
    return d;
  },

  /**
   * Eigenvalues of square matrix.
   * @returns { real: number[], imag: number[] }
   */
  async eigenvalues(A: number[][]): Promise<{ real: number[]; imag: number[] }> {
    const m = await getModule();
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const realPtr = m._malloc(n * 8); ptrs.push(realPtr);
    const imagPtr = m._malloc(n * 8); ptrs.push(imagPtr);

    const status = m._eigenvalues(n, aPtr, realPtr, imagPtr);
    if (status !== 0) {
      freeAll(m, ptrs);
      throw new Error("Eigenvalue computation failed");
    }

    const real = readF64(m, realPtr, n);
    const imag = readF64(m, imagPtr, n);
    freeAll(m, ptrs);
    return { real, imag };
  },

  /**
   * Eigenvalue decomposition: eigenvalues + eigenvectors.
   * @returns { real, imag, vectors } where vectors[i] is the i-th eigenvector
   */
  async eigenDecompose(A: number[][]): Promise<{
    real: number[];
    imag: number[];
    vectors: number[][];
  }> {
    const m = await getModule();
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const realPtr = m._malloc(n * 8); ptrs.push(realPtr);
    const imagPtr = m._malloc(n * 8); ptrs.push(imagPtr);
    const vecsPtr = m._malloc(n * n * 8); ptrs.push(vecsPtr);

    const status = m._eigen_decompose(n, aPtr, realPtr, imagPtr, vecsPtr);
    if (status !== 0) {
      freeAll(m, ptrs);
      throw new Error("Eigen decomposition failed");
    }

    const real = readF64(m, realPtr, n);
    const imag = readF64(m, imagPtr, n);
    const vectors = unflatten(readF64(m, vecsPtr, n * n), n, n);
    freeAll(m, ptrs);
    return { real, imag, vectors };
  },

  /**
   * SVD: A = U · diag(S) · V^T
   * @returns { U, S, V }
   */
  async svd(A: number[][]): Promise<{
    U: number[][];
    S: number[];
    V: number[][];
  }> {
    const m = await getModule();
    const rows = A.length;
    const cols = A[0].length;
    const k = Math.min(rows, cols);
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const uPtr = m._malloc(rows * rows * 8); ptrs.push(uPtr);
    const sPtr = m._malloc(k * 8); ptrs.push(sPtr);
    const vPtr = m._malloc(cols * cols * 8); ptrs.push(vPtr);

    m._svd(rows, cols, aPtr, uPtr, sPtr, vPtr);

    const U = unflatten(readF64(m, uPtr, rows * rows), rows, rows);
    const S = readF64(m, sPtr, k);
    const V = unflatten(readF64(m, vPtr, cols * cols), cols, cols);
    freeAll(m, ptrs);
    return { U, S, V };
  },

  /**
   * Dense matrix multiply: C = A · B
   */
  async multiply(A: number[][], B: number[][]): Promise<number[][]> {
    const m = await getModule();
    const rows = A.length;
    const inner = A[0].length;
    const cols = B[0].length;
    const ptrs: number[] = [];

    const aPtr = allocF64(m, flatten(A)); ptrs.push(aPtr);
    const bPtr = allocF64(m, flatten(B)); ptrs.push(bPtr);
    const cPtr = m._malloc(rows * cols * 8); ptrs.push(cPtr);

    m._dense_multiply(rows, inner, cols, aPtr, bPtr, cPtr);

    const C = unflatten(readF64(m, cPtr, rows * cols), rows, cols);
    freeAll(m, ptrs);
    return C;
  },

  /**
   * Convert dense matrix to COO sparse format (for sparseSolve).
   * Only stores entries with |value| > tol.
   */
  denseToSparse(
    A: number[][],
    tol = 1e-15
  ): { rows: number[]; cols: number[]; vals: number[] } {
    const rs: number[] = [];
    const cs: number[] = [];
    const vs: number[] = [];
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < A[i].length; j++) {
        if (Math.abs(A[i][j]) > tol) {
          rs.push(i);
          cs.push(j);
          vs.push(A[i][j]);
        }
      }
    }
    return { rows: rs, cols: cs, vals: vs };
  },

  // ─── Synchronous API (requires init() to be called first) ─

  /**
   * Synchronous dense solve: A·x = b
   * Module MUST be loaded first via init(). Returns null if not ready.
   */
  denseSolveSync(A: number[][], b: number[]): number[] | null {
    if (!mod) return null;
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(mod, flatten(A)); ptrs.push(aPtr);
    const bPtr = allocF64(mod, b); ptrs.push(bPtr);
    const xPtr = mod._malloc(n * 8); ptrs.push(xPtr);

    mod._dense_solve(n, aPtr, bPtr, xPtr);

    const x = readF64(mod, xPtr, n);
    freeAll(mod, ptrs);
    return x;
  },

  /**
   * Synchronous sparse LU solve.
   */
  sparseSolveSync(
    n: number,
    rows: number[],
    cols: number[],
    vals: number[],
    b: number[]
  ): number[] | null {
    if (!mod) return null;
    const nnz = rows.length;
    const ptrs: number[] = [];

    const rowsPtr = allocI32(mod, rows); ptrs.push(rowsPtr);
    const colsPtr = allocI32(mod, cols); ptrs.push(colsPtr);
    const valsPtr = allocF64(mod, vals); ptrs.push(valsPtr);
    const bPtr = allocF64(mod, b); ptrs.push(bPtr);
    const xPtr = mod._malloc(n * 8); ptrs.push(xPtr);

    const status = mod._sparse_lu_solve(n, nnz, rowsPtr, colsPtr, valsPtr, bPtr, xPtr);
    if (status !== 0) {
      freeAll(mod, ptrs);
      return null;
    }

    const x = readF64(mod, xPtr, n);
    freeAll(mod, ptrs);
    return x;
  },

  /**
   * Synchronous matrix inverse.
   */
  inverseSync(A: number[][]): number[][] | null {
    if (!mod) return null;
    const n = A.length;
    const ptrs: number[] = [];

    const aPtr = allocF64(mod, flatten(A)); ptrs.push(aPtr);
    const rPtr = mod._malloc(n * n * 8); ptrs.push(rPtr);

    const status = mod._dense_inverse(n, aPtr, rPtr);
    if (status !== 0) {
      freeAll(mod, ptrs);
      return null;
    }

    const result = unflatten(readF64(mod, rPtr, n * n), n, n);
    freeAll(mod, ptrs);
    return result;
  },

  /**
   * Synchronous determinant.
   */
  detSync(A: number[][]): number | null {
    if (!mod) return null;
    const n = A.length;
    const aPtr = allocF64(mod, flatten(A));
    const d = mod._dense_det(n, aPtr);
    mod._free(aPtr);
    return d;
  },

  /**
   * Synchronous matrix multiply: C = A · B
   */
  multiplySync(A: number[][], B: number[][]): number[][] | null {
    if (!mod) return null;
    const rows = A.length;
    const inner = A[0].length;
    const cols = B[0].length;
    const ptrs: number[] = [];

    const aPtr = allocF64(mod, flatten(A)); ptrs.push(aPtr);
    const bPtr = allocF64(mod, flatten(B)); ptrs.push(bPtr);
    const cPtr = mod._malloc(rows * cols * 8); ptrs.push(cPtr);

    mod._dense_multiply(rows, inner, cols, aPtr, bPtr, cPtr);

    const C = unflatten(readF64(mod, cPtr, rows * cols), rows, cols);
    freeAll(mod, ptrs);
    return C;
  },
};

/**
 * CAS Engine types — Shared interfaces for all symbolic math backends
 *
 * Architecture: Cascade system — if one engine can't handle an operation,
 * the next one is tried automatically.
 *
 * Priority: Giac > SymPy > Maxima > SymEngine (configurable)
 */

export type CASEngineName = "giac" | "sympy" | "maxima" | "symengine";

export interface CASResult {
  /** LaTeX representation of the result */
  latex?: string;
  /** Plain text / ASCII representation */
  text: string;
  /** HTML representation (optional) */
  html?: string;
  /** Numeric value if applicable */
  numeric?: number;
  /** Which engine produced this result */
  engine: CASEngineName;
  /** Execution time in ms */
  timeMs: number;
}

export interface CASEngine {
  /** Engine identifier */
  readonly name: CASEngineName;
  /** Human-readable label */
  readonly label: string;
  /** Whether the engine is loaded and ready */
  isReady(): boolean;
  /** Load/initialize the engine (lazy) */
  init(): Promise<void>;
  /** Evaluate a symbolic expression string */
  evaluate(expr: string): Promise<CASResult>;
  /** Check if this engine supports a given operation type */
  supports(op: CASOperation): boolean;
}

export type CASOperation =
  | "simplify"
  | "expand"
  | "factor"
  | "diff"
  | "integrate"
  | "limit"
  | "solve"
  | "ode"
  | "matrix"
  | "series"
  | "laplace"
  | "fourier"
  | "sum"
  | "product"
  | "eval";

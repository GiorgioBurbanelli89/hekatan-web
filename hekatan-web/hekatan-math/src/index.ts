// ─── Parser & Evaluator & Renderer ───────────────────────
export { parse } from "./parser.js";
export { parseExpression, evaluate, evalString, HekatanEnvironment } from "./evaluator.js";
export type { ASTNode } from "./evaluator.js";
export {
  renderNode, renderValue, renderInlineText, renderEquationText,
  renderMatrix, renderVector, renderMatrixOperation, renderVectorOperation,
  setDecimals, getDecimals,
} from "./renderer.js";

// ─── Eigen WASM Solver (sparse + dense linear algebra) ───
export { eigenSolver } from "./wasm/eigenSolver.js";

// ─── CAS Engines ─────────────────────────────────────────
export { casManager, giacEngine, sympyEngine, maximaEngine, symengineEngine } from "./cas/index.js";
export type { CASEngine, CASResult, CASOperation, CASEngineName } from "./cas/index.js";

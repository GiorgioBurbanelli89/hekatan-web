export * from "./data-model";

export { analyze } from "./analyze";
// export { deform } from "./deform";
export { deformCpp as deform } from "./deformCpp";

export { modalCpp as modalAnalysis } from "./modalCpp";
export { modalPazCpp as modalAnalysisPaz } from "./modalPazCpp";

// Internal utils exposed for FEM inspection/debugging
export { getLocalStiffnessMatrix } from "./utils/getLocalStiffnessMatrix";
export { getTransformationMatrix } from "./utils/getTransformationMatrix";

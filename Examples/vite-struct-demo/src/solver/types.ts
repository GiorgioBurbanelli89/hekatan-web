// ====== TIPOS PARA EL SOLVER ======

/** Propiedades del material */
export interface Material {
  E: number;   // Modulo de elasticidad en GPa
  A: number;   // Area de seccion transversal en cm2
}

/** Fuerza en un elemento */
export interface ElementForce {
  element: number;
  nodeA: number;
  nodeB: number;
  force: number;  // kN (+ traccion, - compresion)
  length: number; // metros
}

/** Reaccion en un apoyo */
export interface Reaction {
  node: number;
  Rx: number;   // kN
  Ry: number;   // kN
  type: 'fijo' | 'movil';
}

/** Resultado del analisis */
export interface AnalysisResult {
  forces: ElementForce[];
  deformed: [number, number, number][];
  reactions: Reaction[];
}

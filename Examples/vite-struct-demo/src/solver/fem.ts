// ====== SOLVER FEM SIMPLIFICADO ======
import type { Point3D, Element } from '../geometry/types';
import type { Material, AnalysisResult, ElementForce, Reaction } from './types';

/**
 * Analisis estructural simplificado de una cercha
 * (Aproximacion visual — no es un solver FEM real)
 */
export function solveTruss(
  nodes: Point3D[],
  elements: Element[],
  material: Material,
  loadKN: number
): AnalysisResult {
  const forces: ElementForce[] = [];
  const deformed: [number, number, number][] = nodes.map(n => [...n]);

  // Calcular fuerzas aproximadas en cada elemento
  for (let i = 0; i < elements.length; i++) {
    const [a, b] = elements[i];
    const dx = nodes[b][0] - nodes[a][0];
    const dy = nodes[b][1] - nodes[a][1];
    const L = Math.sqrt(dx * dx + dy * dy);

    let f: number;
    if (nodes[a][1] === 0 && nodes[b][1] === 0) {
      // Cordon inferior → traccion
      f = loadKN * 0.8;
    } else if (nodes[a][1] > 0 && nodes[b][1] > 0) {
      // Cordon superior → compresion
      f = -loadKN * 0.7;
    } else {
      // Diagonales/verticales
      f = loadKN * 0.4 * (Math.random() - 0.3);
    }

    forces.push({ element: i, nodeA: a, nodeB: b, force: f, length: L });
  }

  // Deformacion aproximada (parabola)
  const EI = material.E * 1e6 * material.A * 1e-4;
  const span = nodes.reduce((max, n) => Math.max(max, n[0]), 0);

  for (let i = 0; i < nodes.length; i++) {
    const x = nodes[i][0];
    const deflection = -loadKN / EI * 500 * x * (span - x);
    deformed[i] = [nodes[i][0], nodes[i][1] + deflection, 0];
  }

  // Reacciones en apoyos
  const bottomNodes = nodes.filter(n => n[1] === 0).length;
  const lastBottomIdx = bottomNodes - 1;
  const totalLoad = loadKN * (nodes.length - bottomNodes);

  const reactions: Reaction[] = [
    { node: 0, Rx: 0, Ry: totalLoad / 2, type: 'fijo' },
    { node: lastBottomIdx, Rx: 0, Ry: totalLoad / 2, type: 'movil' }
  ];

  return { forces, deformed, reactions };
}

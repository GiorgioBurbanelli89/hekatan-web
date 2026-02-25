// ====== GENERADOR DE CERCHA (TRUSS) ======
import type { Point3D, Element, StructModel, TrussParams } from './types';

/**
 * Genera una cercha Pratt con cordon inferior, superior, verticales y diagonales
 */
export function generateTruss(params: TrussParams): StructModel {
  const { span, divisions, height } = params;
  const nodes: Point3D[] = [];
  const elements: Element[] = [];
  const dx = span / divisions;

  // Nodos inferiores (0 .. divisions)
  for (let i = 0; i <= divisions; i++) {
    nodes.push([i * dx, 0, 0]);
  }

  // Nodos superiores (divisions+1 .. 2*divisions-1)
  for (let i = 1; i < divisions; i++) {
    nodes.push([i * dx, height, 0]);
  }

  const topStart = divisions + 1;

  // Cordon inferior
  for (let i = 0; i < divisions; i++) {
    elements.push([i, i + 1]);
  }

  // Cordon superior
  for (let i = 0; i < divisions - 2; i++) {
    elements.push([topStart + i, topStart + i + 1]);
  }

  // Verticales y diagonales
  for (let i = 0; i < divisions - 1; i++) {
    elements.push([i + 1, topStart + i]); // vertical
    if (i < divisions - 2) {
      elements.push([i + 1, topStart + i + 1]); // diagonal
    }
  }

  // Diagonales extremas
  elements.push([0, topStart]);
  elements.push([divisions, topStart + divisions - 2]);

  return { nodes, elements };
}

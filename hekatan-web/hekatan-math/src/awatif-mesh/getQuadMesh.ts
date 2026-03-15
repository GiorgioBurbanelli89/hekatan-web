/**
 * Structured Quad Mesh Generator for Rectangular Plates
 *
 * Generates a structured mesh of 4-node quadrilateral elements
 * for rectangular domains.
 */
import { Node, Element } from "awatif-fem";

export interface QuadMeshOptions {
  /** Length in X direction */
  Lx: number;
  /** Length in Y direction */
  Ly: number;
  /** Number of divisions in X direction */
  nx: number;
  /** Number of divisions in Y direction */
  ny: number;
  /** Z coordinate for the plate (default: 0) */
  z?: number;
}

export interface QuadMeshResult {
  nodes: Node[];
  elements: Element[];
  boundaryIndices: number[];
  /** Indices of nodes on each edge */
  edges: {
    bottom: number[];
    right: number[];
    top: number[];
    left: number[];
  };
}

/**
 * Generate a structured quadrilateral mesh for a rectangular plate
 *
 * Node numbering: row-major (j * (nx+1) + i)
 * Element node ordering: counter-clockwise (n1, n2, n3, n4)
 *
 *    n4 ------- n3
 *    |          |
 *    |   elem   |
 *    |          |
 *    n1 ------- n2
 *
 * @param options Mesh generation options
 * @returns Mesh data including nodes, elements, and boundary information
 */
export function getQuadMesh(options: QuadMeshOptions): QuadMeshResult {
  const { Lx, Ly, nx, ny, z = 0 } = options;

  if (nx < 1 || ny < 1) {
    throw new Error("nx and ny must be at least 1");
  }

  const dx = Lx / nx;
  const dy = Ly / ny;

  // Generate nodes
  const nodes: Node[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push([i * dx, j * dy, z]);
    }
  }

  // Generate elements (counter-clockwise node ordering)
  const elements: Element[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n1 = j * (nx + 1) + i;           // Bottom-left
      const n2 = n1 + 1;                      // Bottom-right
      const n3 = n2 + (nx + 1);               // Top-right
      const n4 = n1 + (nx + 1);               // Top-left
      elements.push([n1, n2, n3, n4]);
    }
  }

  // Identify boundary nodes
  const boundaryIndices: number[] = [];
  const edges = {
    bottom: [] as number[],
    right: [] as number[],
    top: [] as number[],
    left: [] as number[],
  };

  for (let i = 0; i < nodes.length; i++) {
    const [x, y] = nodes[i];
    const onLeft = Math.abs(x) < 1e-10;
    const onRight = Math.abs(x - Lx) < 1e-10;
    const onBottom = Math.abs(y) < 1e-10;
    const onTop = Math.abs(y - Ly) < 1e-10;

    if (onLeft || onRight || onBottom || onTop) {
      boundaryIndices.push(i);

      if (onBottom) edges.bottom.push(i);
      if (onRight) edges.right.push(i);
      if (onTop) edges.top.push(i);
      if (onLeft) edges.left.push(i);
    }
  }

  return {
    nodes,
    elements,
    boundaryIndices,
    edges,
  };
}

/**
 * Generate equivalent nodal loads for uniform pressure on quad elements
 *
 * @param elements Array of quad elements
 * @param nodes Array of nodes
 * @param pressure Uniform pressure (positive = +Z direction)
 * @returns Map of node index to load vector [Fx, Fy, Fz, Mx, My, Mz]
 */
export function getQuadUniformLoads(
  elements: Element[],
  nodes: Node[],
  pressure: number
): Map<number, [number, number, number, number, number, number]> {
  const loads = new Map<number, [number, number, number, number, number, number]>();

  elements.forEach((element) => {
    // Calculate element area (assuming rectangular elements)
    const [n1, n2, , n4] = element;
    const dx = Math.abs(nodes[n2][0] - nodes[n1][0]);
    const dy = Math.abs(nodes[n4][1] - nodes[n1][1]);
    const area = dx * dy;

    // Force per node = pressure * area / 4
    const forcePerNode = pressure * area / 4;

    element.forEach((nodeIdx) => {
      const existing = loads.get(nodeIdx) || [0, 0, 0, 0, 0, 0];
      loads.set(nodeIdx, [
        existing[0],
        existing[1],
        existing[2] + forcePerNode,
        existing[3],
        existing[4],
        existing[5],
      ]);
    });
  });

  return loads;
}

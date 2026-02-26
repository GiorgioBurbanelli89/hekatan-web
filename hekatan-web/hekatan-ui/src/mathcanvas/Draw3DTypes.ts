/**
 * Draw3DTypes.ts - Tipos para el sistema CAD 3D
 * Mismos conceptos que CadTypes.ts pero para Three.js WebGL.
 */

export type Draw3DShapeType =
  | "line" | "rect" | "circle" | "ellipse" | "arc" | "pline"
  | "box" | "cylinder" | "sphere" | "cone"
  | "text" | "arrow" | "dim" | "rrect";

export interface Draw3DShape {
  type: Draw3DShapeType;
  color: string;
  fill?: string;
  lw?: number;
  // Position primaria
  x: number; y: number; z: number;
  // Segundo punto (line, arrow, dim)
  x2?: number; y2?: number; z2?: number;
  // Tamaño (box, rect, rrect)
  w?: number; h?: number; d?: number;
  // Radio (circle, sphere, cylinder, cone, arc, rrect)
  r?: number; r2?: number;
  // Elipse radios
  rx?: number; ry?: number;
  // Angulos (arc)
  startAngle?: number; endAngle?: number;
  // Rotacion (grados)
  rotX?: number; rotY?: number; rotZ?: number;
  // Polyline puntos [x,y,z, x,y,z, ...]
  pts?: number[];
  // Dimension
  offset?: number;
  // Texto
  text?: string;
  fontSize?: number;
  // Plano para formas planas
  plane?: "xy" | "xz" | "yz";
}

export interface Draw3DConfig {
  bg?: string;
  camX?: number; camY?: number; camZ?: number;
  grid?: boolean;
  gridSize?: number;
  scale?: number;
  unit?: string;
  views?: string[];
}

export interface Draw3DResult {
  shapes: Draw3DShape[];
  config: Draw3DConfig;
}

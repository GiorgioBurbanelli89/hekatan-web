/**
 * CadTypes.ts - Tipos e interfaces del sistema CAD
 * Extraído de CadEngine.ts para modularización.
 */

// ============================================================================
// Point types
// ============================================================================

export interface CadPoint { x: number; y: number; z: number; }
export interface CadScreenPt { x: number; y: number; }

// ============================================================================
// Shape types
// ============================================================================

export type CadShapeType =
  | "linea" | "rectangulo" | "circulo" | "elipse"
  | "arco" | "arco_circular" | "polilinea" | "mano"
  | "cota" | "grupo" | "texto" | "flecha" | "flecha_doble"
  | "rayado" | "poligono_relleno";

export interface CadShape {
  tipo: CadShapeType;
  color: string;
  z: number;
  lw?: number;
  fill?: string;
  hidden?: boolean;
  // linea
  x1?: number; y1?: number; z1?: number;
  x2?: number; y2?: number; z2?: number;
  // rectangulo
  x?: number; y?: number; w?: number; h?: number;
  // circulo / elipse / arco_circular
  cx?: number; cy?: number; r?: number;
  rx?: number; ry?: number;
  startAngle?: number; endAngle?: number;
  // polilinea / mano
  pts?: CadPoint[];
  // cota
  offset?: number; text?: string | null;
  // texto
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  fontFamily?: "mono" | "serif";
  fontItalic?: boolean;
  overbar?: boolean;
  // arco_circular: suppress arrowhead (used by rrect corners)
  noArrow?: boolean;
  // rayado: spacing between hatch lines
  spacing?: number;
  // label anchor: "left" | "right" | "above" | "below" | "center"
  anchor?: string;
  // 3D flag (usa w2s3 con proyección oblicua en vez de w2s)
  is3d?: boolean;
  // grupo
  children?: CadShape[];
}

// ============================================================================
// Serialization types
// ============================================================================

export interface CadShapeUser {
  type: string;
  color: string;
  [key: string]: any;
}

export interface CadJSON {
  version: number;
  unit: string;
  scale: number;
  color: string;
  z: number;
  shapes: CadShapeUser[];
}

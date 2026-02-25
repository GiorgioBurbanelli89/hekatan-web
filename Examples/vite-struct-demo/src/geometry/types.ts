// ====== TIPOS PARA GEOMETRIA ESTRUCTURAL ======

/** Punto 3D [x, y, z] en metros */
export type Point3D = [number, number, number];

/** Elemento conecta dos nodos por indice */
export type Element = [number, number];

/** Modelo estructural completo */
export interface StructModel {
  nodes: Point3D[];
  elements: Element[];
}

/** Parametros de la cercha */
export interface TrussParams {
  span: number;      // Luz en metros
  divisions: number; // Numero de divisiones
  height: number;    // Altura en metros
}

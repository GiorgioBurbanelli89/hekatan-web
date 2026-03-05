/**
 * CadDraw.ts - API de dibujo del CAD
 * Funciones para crear formas (line, rect, circle, etc.)
 */

import type { CadEngine } from "./CadEngine.js";
import type { CadShape, CadPoint } from "./CadTypes.js";

// ============================================================================
// Drawing API - cada función agrega una forma al engine
// ============================================================================

export function addLine(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "linea",
    x1: engine.toPx(x1), y1: engine.toPx(y1), z1: engine.currentZ,
    x2: engine.toPx(x2), y2: engine.toPx(y2), z2: engine.currentZ,
    z: engine.currentZ, color: c,
  };
  if (opts?.lw) shape.lw = opts.lw;
  else if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addRect(engine: CadEngine, x: number, y: number, w: number, h: number, color?: string, opts?: { fill?: string; lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "rectangulo",
    x: engine.toPx(x), y: engine.toPx(y), w: engine.toPx(w), h: engine.toPx(h),
    z: engine.currentZ, color: c,
  };
  if (opts?.fill) shape.fill = opts.fill;
  if (opts?.lw) shape.lw = opts.lw;
  else if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addCircle(engine: CadEngine, cx: number, cy: number, r: number, color?: string, opts?: { fill?: string; lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "circulo",
    cx: engine.toPx(cx), cy: engine.toPx(cy), r: engine.toPx(r),
    z: engine.currentZ, color: c,
  };
  if (opts?.fill) shape.fill = opts.fill;
  if (opts?.lw) shape.lw = opts.lw;
  else if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addEllipse(engine: CadEngine, cx: number, cy: number, rx: number, ry: number, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "elipse",
    cx: engine.toPx(cx), cy: engine.toPx(cy), rx: engine.toPx(rx), ry: engine.toPx(ry),
    z: engine.currentZ, color: c,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addArc(engine: CadEngine, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "arco",
    x1: engine.toPx(x1), y1: engine.toPx(y1), cx: engine.toPx(cx), cy: engine.toPx(cy),
    x2: engine.toPx(x2), y2: engine.toPx(y2),
    z: engine.currentZ, color: c,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addCarc(engine: CadEngine, cx: number, cy: number, r: number, startAngle: number, endAngle: number, color?: string, opts?: { noArrow?: boolean }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "arco_circular",
    cx: engine.toPx(cx), cy: engine.toPx(cy), r: engine.toPx(r),
    startAngle, endAngle,
    z: engine.currentZ, color: c,
  };
  if (opts?.noArrow) shape.noArrow = true;
  if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addPline(engine: CadEngine, coords: number[], color?: string): number {
  const c = color || engine.currentColor;
  const pts: CadPoint[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    pts.push({ x: engine.toPx(coords[i]), y: engine.toPx(coords[i + 1]), z: engine.currentZ });
  }
  if (pts.length < 2) return -1;
  const plShape: CadShape = { tipo: "polilinea", pts, z: engine.currentZ, color: c };
  if (engine.currentLineWidth !== 1.5) plShape.lw = engine.currentLineWidth;
  engine.formas.push(plShape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addDim(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number {
  const c = color || "#d4a017";
  const off = offset !== undefined ? engine.toPx(offset) : engine.toPx(10);
  engine.formas.push({
    tipo: "cota",
    x1: engine.toPx(x1), y1: engine.toPx(y1), x2: engine.toPx(x2), y2: engine.toPx(y2),
    offset: off, text: text || null,
    z: engine.currentZ, color: c,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addHdim(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number {
  return addDim(engine, x1, y1, x2, y1, offset, text, color);
}

export function addVdim(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number {
  return addDim(engine, x1, y1, x1, y2, offset, text, color);
}

export function addText(engine: CadEngine, x: number, y: number, text: string, color?: string, opts?: { fontSize?: number; textAlign?: "left" | "center" | "right" }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "texto",
    x: engine.toPx(x), y: engine.toPx(y),
    text, z: engine.currentZ, color: c,
  };
  if (opts?.fontSize) shape.fontSize = opts.fontSize;
  if (opts?.textAlign) shape.textAlign = opts.textAlign;
  if (engine.currentFontFamily !== "mono") shape.fontFamily = engine.currentFontFamily;
  if (engine.currentFontItalic) shape.fontItalic = true;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addOText(engine: CadEngine, x: number, y: number, text: string, color?: string, opts?: { fontSize?: number; textAlign?: "left" | "center" | "right" }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "texto",
    x: engine.toPx(x), y: engine.toPx(y),
    text, z: engine.currentZ, color: c,
    overbar: true,
  };
  if (opts?.fontSize) shape.fontSize = opts.fontSize;
  if (opts?.textAlign) shape.textAlign = opts.textAlign;
  if (engine.currentFontFamily !== "mono") shape.fontFamily = engine.currentFontFamily;
  if (engine.currentFontItalic) shape.fontItalic = true;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addArrow(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "flecha",
    x1: engine.toPx(x1), y1: engine.toPx(y1),
    x2: engine.toPx(x2), y2: engine.toPx(y2),
    z: engine.currentZ, color: c,
  };
  if (opts?.lw) shape.lw = opts.lw;
  else if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addDarrow(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "flecha_doble",
    x1: engine.toPx(x1), y1: engine.toPx(y1),
    x2: engine.toPx(x2), y2: engine.toPx(y2),
    z: engine.currentZ, color: c,
  };
  if (opts?.lw) shape.lw = opts.lw;
  else if (engine.currentLineWidth !== 1.5) shape.lw = engine.currentLineWidth;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

// ============================================================================
// 3D Drawing API - shapes con is3d=true para proyección oblicua
// Coordenadas: X=horizontal, Y=profundidad, Z=vertical
// ============================================================================

export function addLine3d(engine: CadEngine, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string, opts?: { lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "linea",
    x1: engine.toPx(x1), y1: engine.toPx(y1), z1: engine.toPx(z1),
    x2: engine.toPx(x2), y2: engine.toPx(y2), z2: engine.toPx(z2),
    z: 0, color: c, is3d: true,
  };
  if (opts?.lw) shape.lw = opts.lw;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addArrow3d(engine: CadEngine, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "flecha",
    x1: engine.toPx(x1), y1: engine.toPx(y1), z1: engine.toPx(z1),
    x2: engine.toPx(x2), y2: engine.toPx(y2), z2: engine.toPx(z2),
    z: 0, color: c, is3d: true,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addDarrow3d(engine: CadEngine, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "flecha_doble",
    x1: engine.toPx(x1), y1: engine.toPx(y1), z1: engine.toPx(z1),
    x2: engine.toPx(x2), y2: engine.toPx(y2), z2: engine.toPx(z2),
    z: 0, color: c, is3d: true,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addText3d(engine: CadEngine, x: number, y: number, z: number, text: string, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "texto",
    x: engine.toPx(x), y: engine.toPx(y),
    z: engine.toPx(z),
    text, color: c, is3d: true,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addPline3d(engine: CadEngine, coords: number[], color?: string): number {
  const c = color || engine.currentColor;
  const pts: CadPoint[] = [];
  for (let i = 0; i < coords.length; i += 3) {
    pts.push({ x: engine.toPx(coords[i]), y: engine.toPx(coords[i + 1]), z: engine.toPx(coords[i + 2]) });
  }
  if (pts.length < 2) return -1;
  engine.formas.push({ tipo: "polilinea", pts, z: 0, color: c, is3d: true });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addCircle3d(engine: CadEngine, cx: number, cy: number, cz: number, r: number, color?: string, opts?: { fill?: string; lw?: number }): number {
  const c = color || engine.currentColor;
  const shape: CadShape = {
    tipo: "circulo",
    cx: engine.toPx(cx), cy: engine.toPx(cy), r: engine.toPx(r),
    z: engine.toPx(cz), color: c, is3d: true,
  };
  if (opts?.fill) shape.fill = opts.fill;
  if (opts?.lw) shape.lw = opts.lw;
  engine.formas.push(shape);
  engine.refresh();
  return engine.formas.length - 1;
}

export function addCarc3d(engine: CadEngine, cx: number, cy: number, cz: number, r: number, startAngle: number, endAngle: number, color?: string): number {
  const c = color || engine.currentColor;
  engine.formas.push({
    tipo: "arco_circular",
    cx: engine.toPx(cx), cy: engine.toPx(cy), r: engine.toPx(r),
    startAngle, endAngle,
    z: engine.toPx(cz), color: c, is3d: true,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

// ============================================================================
// 2D compound: beam with hatch (structural element)
// ============================================================================

/** beam2d: rectangle between two points with diagonal hatching (perpendicular width).
 *  Draws outline + rayado. All coordinates in user units. */
export function addBeam2d(engine: CadEngine, x1: number, y1: number, x2: number, y2: number, width: number, color?: string, hatchSpacing?: number): void {
  const c = color || engine.currentColor;
  const w = width;
  // Direction vector
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return;
  // Perpendicular unit vector (rotated 90° CCW)
  const px = -dy / len * w / 2;
  const py = dx / len * w / 2;
  // 4 corners of the parallelogram
  const ax = x1 + px, ay = y1 + py;  // top-left
  const bx = x2 + px, by = y2 + py;  // top-right
  const cx2 = x2 - px, cy2 = y2 - py; // bottom-right
  const dx2 = x1 - px, dy2 = y1 - py; // bottom-left

  // Outline (4 lines)
  addLine(engine, ax, ay, bx, by, c);
  addLine(engine, bx, by, cx2, cy2, c);
  addLine(engine, cx2, cy2, dx2, dy2, c);
  addLine(engine, dx2, dy2, ax, ay, c);

  // Hatch fill (2D rayado) — reuse "rayado" shape type with is3d=false
  const sp = hatchSpacing || (w * 0.7);
  const pts: CadPoint[] = [
    { x: engine.toPx(ax), y: engine.toPx(ay), z: 0 },
    { x: engine.toPx(bx), y: engine.toPx(by), z: 0 },
    { x: engine.toPx(cx2), y: engine.toPx(cy2), z: 0 },
    { x: engine.toPx(dx2), y: engine.toPx(dy2), z: 0 },
  ];
  engine.formas.push({
    tipo: "rayado",
    pts,
    spacing: engine.toPx(sp),
    z: 0, color: c, is3d: false, lw: engine.currentLineWidth * 0.3,
  });
  engine.refresh();
}

// ============================================================================
// New 3D primitives: hatch, fillpoly, label
// ============================================================================

export function addHatch3d(engine: CadEngine, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number, x4: number, y4: number, z4: number, spacing?: number, color?: string): number {
  const c = color || engine.currentColor;
  const sp = spacing || 1.0;
  const pts: CadPoint[] = [
    { x: engine.toPx(x1), y: engine.toPx(y1), z: engine.toPx(z1) },
    { x: engine.toPx(x2), y: engine.toPx(y2), z: engine.toPx(z2) },
    { x: engine.toPx(x3), y: engine.toPx(y3), z: engine.toPx(z3) },
    { x: engine.toPx(x4), y: engine.toPx(y4), z: engine.toPx(z4) },
  ];
  engine.formas.push({
    tipo: "rayado",
    pts,
    spacing: engine.toPx(sp),
    z: 0, color: c, is3d: true, lw: engine.currentLineWidth * 0.3,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addFillPoly3d(engine: CadEngine, coords: number[], color?: string): number {
  const c = color || engine.currentColor;
  const pts: CadPoint[] = [];
  for (let i = 0; i < coords.length; i += 3) {
    pts.push({ x: engine.toPx(coords[i]), y: engine.toPx(coords[i + 1]), z: engine.toPx(coords[i + 2]) });
  }
  if (pts.length < 3) return -1;
  engine.formas.push({
    tipo: "poligono_relleno",
    pts, fill: c,
    z: 0, color: c, is3d: true,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function addLabel3d(engine: CadEngine, x: number, y: number, z: number, text: string, anchor?: string, color?: string): number {
  const c = color || engine.currentColor;
  let textAlign: "left" | "center" | "right" = "center";
  let offX = 0, offY = 0;
  switch (anchor) {
    case "left": textAlign = "left"; offX = 0.3; break;
    case "right": textAlign = "right"; offX = -0.3; break;
    case "above": offY = 0.5; break;
    case "below": offY = -0.5; break;
  }
  engine.formas.push({
    tipo: "texto",
    x: engine.toPx(x + offX), y: engine.toPx(y),
    z: engine.toPx(z + offY),
    text, color: c, is3d: true,
    fontSize: engine.currentFontSize,
    textAlign,
  });
  engine.refresh();
  return engine.formas.length - 1;
}

export function clearShapes(engine: CadEngine): void {
  engine.saveHist();
  engine.formas.length = 0;
  engine.formaSel = -1;
  engine.saveHist();
}

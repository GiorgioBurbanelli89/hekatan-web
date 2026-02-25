/**
 * CadInput.ts - Hit test y seleccion (port de ifc/js/cad/cad-input.js)
 * Modulo separado: funciones puras que operan sobre CadEngine.
 *
 * hitTest: click → forma bajo cursor
 * selectByBox: window/crossing selection
 * shapeBounds: bounding box de una forma
 */

import type { CadEngine, CadShape } from "./CadEngine.js";

// ============================================================================
// Types
// ============================================================================

export interface BBox {
  x1: number; y1: number;
  x2: number; y2: number;
}

// ============================================================================
// shapeBounds - bounding box de una forma (recursivo para grupos)
// ============================================================================

export function shapeBounds(f: CadShape): BBox | null {
  switch (f.tipo) {
    case "linea":
      return {
        x1: Math.min(f.x1!, f.x2!), y1: Math.min(f.y1!, f.y2!),
        x2: Math.max(f.x1!, f.x2!), y2: Math.max(f.y1!, f.y2!),
      };
    case "rectangulo":
      return { x1: f.x!, y1: f.y!, x2: f.x! + f.w!, y2: f.y! + f.h! };
    case "circulo":
      return { x1: f.cx! - f.r!, y1: f.cy! - f.r!, x2: f.cx! + f.r!, y2: f.cy! + f.r! };
    case "elipse":
      return { x1: f.cx! - f.rx!, y1: f.cy! - f.ry!, x2: f.cx! + f.rx!, y2: f.cy! + f.ry! };
    case "arco_circular":
      return { x1: f.cx! - f.r!, y1: f.cy! - f.r!, x2: f.cx! + f.r!, y2: f.cy! + f.r! };
    case "cota":
      return {
        x1: Math.min(f.x1!, f.x2!), y1: Math.min(f.y1!, f.y2!),
        x2: Math.max(f.x1!, f.x2!), y2: Math.max(f.y1!, f.y2!),
      };
    case "polilinea":
    case "mano": {
      if (!f.pts || f.pts.length === 0) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of f.pts) {
        if (p.x < x1) x1 = p.x;
        if (p.y < y1) y1 = p.y;
        if (p.x > x2) x2 = p.x;
        if (p.y > y2) y2 = p.y;
      }
      return { x1, y1, x2, y2 };
    }
    case "grupo": {
      if (!f.children || f.children.length === 0) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const c of f.children) {
        const cb = shapeBounds(c);
        if (!cb) continue;
        if (cb.x1 < x1) x1 = cb.x1;
        if (cb.y1 < y1) y1 = cb.y1;
        if (cb.x2 > x2) x2 = cb.x2;
        if (cb.y2 > y2) y2 = cb.y2;
      }
      return x1 < Infinity ? { x1, y1, x2, y2 } : null;
    }
  }
  return null;
}

// ============================================================================
// hitTest - encuentra la forma bajo el cursor (world coords)
// ============================================================================

export function hitTest(engine: CadEngine, wx: number, wy: number): number {
  const tol = 8 / engine.cam.zoom;

  for (let i = engine.formas.length - 1; i >= 0; i--) {
    const f = engine.formas[i];
    if (f.hidden) continue;

    if (_hitShape(f, wx, wy, tol)) return i;
  }
  return -1;
}

function _hitShape(f: CadShape, wx: number, wy: number, tol: number): boolean {
  switch (f.tipo) {
    case "linea":
      return _distPointToSeg(wx, wy, f.x1!, f.y1!, f.x2!, f.y2!) < tol;

    case "rectangulo": {
      const x2 = f.x! + f.w!, y2 = f.y! + f.h!;
      // Check proximity to any of the 4 edges
      return (
        _distPointToSeg(wx, wy, f.x!, f.y!, x2, f.y!) < tol ||
        _distPointToSeg(wx, wy, x2, f.y!, x2, y2) < tol ||
        _distPointToSeg(wx, wy, x2, y2, f.x!, y2) < tol ||
        _distPointToSeg(wx, wy, f.x!, y2, f.x!, f.y!) < tol ||
        (f.fill ? _pointInRect(wx, wy, f.x!, f.y!, x2, y2) : false)
      );
    }

    case "circulo": {
      const d = Math.sqrt((wx - f.cx!) ** 2 + (wy - f.cy!) ** 2);
      return f.fill
        ? d < f.r! + tol
        : Math.abs(d - f.r!) < tol;
    }

    case "elipse": {
      const nx = (wx - f.cx!) / f.rx!;
      const ny = (wy - f.cy!) / f.ry!;
      const d = Math.sqrt(nx * nx + ny * ny);
      return Math.abs(d - 1) < tol / Math.min(f.rx!, f.ry!);
    }

    case "arco_circular": {
      const d = Math.sqrt((wx - f.cx!) ** 2 + (wy - f.cy!) ** 2);
      if (Math.abs(d - f.r!) > tol) return false;
      const a = Math.atan2(wy - f.cy!, wx - f.cx!);
      return _angleInArc(a, f.startAngle!, f.endAngle!);
    }

    case "cota":
      return _distPointToSeg(wx, wy, f.x1!, f.y1!, f.x2!, f.y2!) < tol * 2;

    case "polilinea":
    case "mano": {
      if (!f.pts || f.pts.length < 2) return false;
      for (let j = 1; j < f.pts.length; j++) {
        if (_distPointToSeg(wx, wy, f.pts[j - 1].x, f.pts[j - 1].y, f.pts[j].x, f.pts[j].y) < tol) return true;
      }
      return false;
    }

    case "grupo": {
      if (!f.children) return false;
      for (const c of f.children) {
        if (_hitShape(c, wx, wy, tol)) return true;
      }
      return false;
    }
  }
  return false;
}

// ============================================================================
// selectByBox - window (left→right) or crossing (right→left) selection
// ============================================================================

export function selectByBox(engine: CadEngine, x1: number, y1: number, x2: number, y2: number): number[] {
  const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
  const maxX = Math.max(x1, x2), maxY = Math.max(y1, y2);
  const crossing = x2 < x1; // right-to-left = crossing
  const result: number[] = [];

  for (let i = 0; i < engine.formas.length; i++) {
    const f = engine.formas[i];
    if (f.hidden) continue;
    const bb = shapeBounds(f);
    if (!bb) continue;

    if (crossing) {
      // Crossing: shape intersects box
      if (bb.x2 >= minX && bb.x1 <= maxX && bb.y2 >= minY && bb.y1 <= maxY) {
        result.push(i);
      }
    } else {
      // Window: shape completely inside box
      if (bb.x1 >= minX && bb.x2 <= maxX && bb.y1 >= minY && bb.y2 <= maxY) {
        result.push(i);
      }
    }
  }
  return result;
}

// ============================================================================
// Private geometry helpers
// ============================================================================

function _distPointToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const nx = x1 + t * dx, ny = y1 + t * dy;
  return Math.sqrt((px - nx) ** 2 + (py - ny) ** 2);
}

function _pointInRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function _angleInArc(a: number, start: number, end: number): boolean {
  // Normalize to [0, 2PI]
  const TWO_PI = Math.PI * 2;
  const na = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  const ns = ((start % TWO_PI) + TWO_PI) % TWO_PI;
  const ne = ((end % TWO_PI) + TWO_PI) % TWO_PI;
  if (ns <= ne) return na >= ns && na <= ne;
  return na >= ns || na <= ne;
}

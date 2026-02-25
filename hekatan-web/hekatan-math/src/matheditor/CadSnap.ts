/**
 * CadSnap.ts - Snap system (port de ifc/js/cad/cad-snap.js)
 * Modulo separado: funciones puras que operan sobre CadEngine.
 *
 * Snap types: endpoint, midpoint, center, quadrant, intersection,
 *             perpendicular, nearest, extension
 * Tambien: orthoSnap, gridSnap, tracking lines
 */

import type { CadEngine, CadShape, CadScreenPt } from "./CadEngine.js";

// ============================================================================
// Types
// ============================================================================

export interface SnapCfg {
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  quadrant: boolean;
  intersection: boolean;
  perpendicular: boolean;
  nearest: boolean;
  extension: boolean;
}

export interface SnapPoint {
  x: number;
  y: number;
  t: string;   // snap type name
  c: string;   // marker color
}

export interface TrackingLine {
  x1: number; y1: number;
  x2: number; y2: number;
  snapPt: SnapPoint;
  axis: "h" | "v";
  snapX?: number;
  snapY?: number;
}

// ============================================================================
// Snap state (instanciable, una por CadEngine)
// ============================================================================

export class CadSnapState {
  snapOn = true;
  orthoOn = false;
  trackingOn = true;
  trackThreshold = 12;

  cfg: SnapCfg = {
    endpoint: true,
    midpoint: true,
    center: true,
    quadrant: true,
    intersection: false,
    perpendicular: false,
    nearest: true,
    extension: false,
  };

  // Cache
  private _cache: SnapPoint[] | null = null;
  private _cacheKey = "";

  /** Punto inicial del trazo actual (para perpendicular y tracking) */
  pIni: { x: number; y: number } | null = null;

  invalidateCache(): void {
    this._cache = null;
    this._cacheKey = "";
  }

  // ========================================================================
  // getSnapPoints - recolecta todos los puntos snap de las formas
  // ========================================================================

  getSnapPoints(engine: CadEngine): SnapPoint[] {
    const key = engine.formas.length + "|" + engine.cam.zoom.toFixed(2);
    if (this._cache && this._cacheKey === key) return this._cache;

    const pts: SnapPoint[] = [];
    const cfg = this.cfg;

    for (const f of engine.formas) {
      if (f.hidden) continue;
      const fz = f.z || 0;

      switch (f.tipo) {
        case "linea": {
          if (cfg.endpoint) {
            pts.push({ x: f.x1!, y: f.y1!, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: f.x2!, y: f.y2!, t: "endpoint", c: "#e06c5a" });
          }
          if (cfg.midpoint) {
            pts.push({ x: (f.x1! + f.x2!) / 2, y: (f.y1! + f.y2!) / 2, t: "midpoint", c: "#4ec9b0" });
          }
          break;
        }
        case "rectangulo": {
          const ex = f.x! + f.w!, ey = f.y! + f.h!;
          if (cfg.endpoint) {
            pts.push({ x: f.x!, y: f.y!, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: ex, y: f.y!, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: f.x!, y: ey, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: ex, y: ey, t: "endpoint", c: "#e06c5a" });
          }
          if (cfg.midpoint) {
            pts.push({ x: f.x! + f.w! / 2, y: f.y!, t: "midpoint", c: "#4ec9b0" });
            pts.push({ x: f.x! + f.w! / 2, y: ey, t: "midpoint", c: "#4ec9b0" });
            pts.push({ x: f.x!, y: f.y! + f.h! / 2, t: "midpoint", c: "#4ec9b0" });
            pts.push({ x: ex, y: f.y! + f.h! / 2, t: "midpoint", c: "#4ec9b0" });
          }
          if (cfg.center) {
            pts.push({ x: f.x! + f.w! / 2, y: f.y! + f.h! / 2, t: "center", c: "#dcdcaa" });
          }
          break;
        }
        case "circulo": {
          if (cfg.center) pts.push({ x: f.cx!, y: f.cy!, t: "center", c: "#dcdcaa" });
          if (cfg.quadrant) {
            pts.push({ x: f.cx! + f.r!, y: f.cy!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx! - f.r!, y: f.cy!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx!, y: f.cy! + f.r!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx!, y: f.cy! - f.r!, t: "quadrant", c: "#c586c0" });
          }
          break;
        }
        case "elipse": {
          if (cfg.center) pts.push({ x: f.cx!, y: f.cy!, t: "center", c: "#dcdcaa" });
          if (cfg.quadrant) {
            pts.push({ x: f.cx! + f.rx!, y: f.cy!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx! - f.rx!, y: f.cy!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx!, y: f.cy! + f.ry!, t: "quadrant", c: "#c586c0" });
            pts.push({ x: f.cx!, y: f.cy! - f.ry!, t: "quadrant", c: "#c586c0" });
          }
          break;
        }
        case "arco_circular": {
          if (cfg.center) pts.push({ x: f.cx!, y: f.cy!, t: "center", c: "#dcdcaa" });
          if (cfg.endpoint) {
            pts.push({ x: f.cx! + Math.cos(f.startAngle!) * f.r!, y: f.cy! + Math.sin(f.startAngle!) * f.r!, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: f.cx! + Math.cos(f.endAngle!) * f.r!, y: f.cy! + Math.sin(f.endAngle!) * f.r!, t: "endpoint", c: "#e06c5a" });
          }
          break;
        }
        case "cota": {
          if (cfg.endpoint) {
            pts.push({ x: f.x1!, y: f.y1!, t: "endpoint", c: "#e06c5a" });
            pts.push({ x: f.x2!, y: f.y2!, t: "endpoint", c: "#e06c5a" });
          }
          if (cfg.midpoint) {
            pts.push({ x: (f.x1! + f.x2!) / 2, y: (f.y1! + f.y2!) / 2, t: "midpoint", c: "#4ec9b0" });
          }
          break;
        }
        case "polilinea": {
          if (!f.pts || f.pts.length < 2) break;
          for (const p of f.pts) {
            if (cfg.endpoint) pts.push({ x: p.x, y: p.y, t: "endpoint", c: "#e06c5a" });
          }
          for (let k = 1; k < f.pts.length; k++) {
            if (cfg.midpoint) pts.push({
              x: (f.pts[k - 1].x + f.pts[k].x) / 2,
              y: (f.pts[k - 1].y + f.pts[k].y) / 2,
              t: "midpoint", c: "#4ec9b0",
            });
          }
          break;
        }
        case "grupo": {
          // Recursivo: snap a children
          if (f.children) {
            for (const child of f.children) {
              // Temp: reusar logica creando sub-engine? No, simplificar:
              // solo endpoints del bounding box
            }
          }
          break;
        }
      }
    }

    // Intersection points (entre segmentos)
    if (cfg.intersection) {
      const segs = _collectSegments(engine);
      for (let a = 0; a < segs.length; a++) {
        for (let b = a + 1; b < segs.length; b++) {
          const ip = segIntersect(segs[a], segs[b]);
          if (ip) pts.push({ x: ip.x, y: ip.y, t: "intersection", c: "#569cd6" });
        }
      }
    }

    this._cache = pts;
    this._cacheKey = key;
    return pts;
  }

  // ========================================================================
  // findSnap - busca el snap mas cercano al cursor
  // ========================================================================

  findSnap(engine: CadEngine, wx: number, wy: number): SnapPoint | null {
    if (!this.snapOn) return null;
    const thresh = 14 / engine.cam.zoom;
    const pts = this.getSnapPoints(engine);

    let best: SnapPoint | null = null;
    let md = thresh;
    for (const p of pts) {
      const d = engine.D(wx, wy, p.x, p.y);
      if (d < md) { md = d; best = p; }
    }
    if (best) return best;

    // Perpendicular
    const perp = this._getPerpSnap(engine, wx, wy);
    if (perp) return perp;

    // Nearest on segment
    return this._getNearestOnSegments(engine, wx, wy);
  }

  // ========================================================================
  // gridSnap - snap al grid mas cercano
  // ========================================================================

  gridSnap(engine: CadEngine, wx: number, wy: number): { x: number; y: number } {
    if (!engine.gridOn) return { x: wx, y: wy };
    const g = engine.tamGrid;
    return {
      x: Math.round(wx / g) * g,
      y: Math.round(wy / g) * g,
    };
  }

  // ========================================================================
  // orthoSnap - constrain a H/V desde pIni
  // ========================================================================

  orthoSnap(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    if (dx >= dy) {
      return { x: toX, y: fromY }; // horizontal
    } else {
      return { x: fromX, y: toY }; // vertical
    }
  }

  // ========================================================================
  // Tracking lines (object snap tracking)
  // ========================================================================

  getTrackingLines(engine: CadEngine, wx: number, wy: number): TrackingLine[] {
    if (!this.trackingOn || !this.snapOn) return [];
    const lines: TrackingLine[] = [];
    const thresh = this.trackThreshold / engine.cam.zoom;
    const pts = this.getSnapPoints(engine);
    if (this.pIni) pts.push({ x: this.pIni.x, y: this.pIni.y, t: "start", c: "#4ec9b0" });

    for (const p of pts) {
      if (Math.abs(wy - p.y) < thresh && Math.abs(wx - p.x) > thresh) {
        lines.push({ x1: p.x, y1: p.y, x2: wx, y2: p.y, snapPt: p, axis: "h", snapY: p.y });
      }
      if (Math.abs(wx - p.x) < thresh && Math.abs(wy - p.y) > thresh) {
        lines.push({ x1: p.x, y1: p.y, x2: p.x, y2: wy, snapPt: p, axis: "v", snapX: p.x });
      }
    }
    return lines;
  }

  applyTracking(engine: CadEngine, wx: number, wy: number): { x: number; y: number; tracked: boolean } {
    if (!this.trackingOn || !this.snapOn) return { x: wx, y: wy, tracked: false };
    const thresh = this.trackThreshold / engine.cam.zoom;
    const pts = this.getSnapPoints(engine);
    if (this.pIni) pts.push({ x: this.pIni.x, y: this.pIni.y, t: "start", c: "#4ec9b0" });

    let bestH: SnapPoint | null = null, bestV: SnapPoint | null = null;
    let minDH = thresh, minDV = thresh;

    for (const p of pts) {
      const dh = Math.abs(wy - p.y);
      const dv = Math.abs(wx - p.x);
      if (dh < minDH && Math.abs(wx - p.x) > thresh) { minDH = dh; bestH = p; }
      if (dv < minDV && Math.abs(wy - p.y) > thresh) { minDV = dv; bestV = p; }
    }

    let rx = wx, ry = wy, tracked = false;
    if (bestH && bestV) { rx = bestV.x; ry = bestH.y; tracked = true; }
    else if (bestV) { rx = bestV.x; tracked = true; }
    else if (bestH) { ry = bestH.y; tracked = true; }
    return { x: rx, y: ry, tracked };
  }

  // ========================================================================
  // Rendering: snap marker + tracking lines
  // ========================================================================

  drawSnapMarker(ctx: CanvasRenderingContext2D, engine: CadEngine, wx: number, wy: number, type: string, color: string): void {
    const sp = engine.w2s(wx, wy);
    const x = sp.x, y = sp.y;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    const s = 8;

    switch (type) {
      case "endpoint":
        ctx.beginPath(); ctx.rect(x - s, y - s, s * 2, s * 2); ctx.stroke();
        break;
      case "midpoint":
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath(); ctx.stroke();
        break;
      case "center":
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke();
        break;
      case "quadrant":
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
        break;
      case "intersection":
        ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
        break;
      case "perpendicular":
        ctx.beginPath(); ctx.moveTo(x - s, y + s); ctx.lineTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.stroke();
        ctx.beginPath(); ctx.rect(x - s, y - s, s, s); ctx.stroke();
        break;
      case "nearest":
        ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y - s); ctx.closePath(); ctx.stroke();
        break;
    }

    // Label
    ctx.font = "bold 10px Consolas,monospace";
    const lbl = type.charAt(0).toUpperCase() + type.slice(1);
    const tw = ctx.measureText(lbl).width;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x - tw / 2 - 3, y + s + 2, tw + 6, 13);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(lbl, x, y + s + 12);
    ctx.restore();
  }

  drawTrackingLines(ctx: CanvasRenderingContext2D, engine: CadEngine, lines: TrackingLine[]): void {
    if (lines.length === 0) return;
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 0.8;

    for (const tl of lines) {
      const s1 = engine.w2s(tl.x1, tl.y1);
      const s2 = engine.w2s(tl.x2, tl.y2);

      ctx.strokeStyle = "#d7ba7d";
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();

      // Small diamond at snap origin
      const ms = 4;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = tl.snapPt.c || "#d7ba7d";
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y - ms); ctx.lineTo(s1.x + ms, s1.y);
      ctx.lineTo(s1.x, s1.y + ms); ctx.lineTo(s1.x - ms, s1.y);
      ctx.closePath(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private _getNearestOnSegments(engine: CadEngine, x: number, y: number): SnapPoint | null {
    if (!this.cfg.nearest) return null;
    let best: SnapPoint | null = null;
    let md = 14 / engine.cam.zoom;

    const segs = _collectSegments(engine);
    for (const s of segs) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = dx * dx + dy * dy;
      if (len === 0) continue;
      const u = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / len));
      const px = s.x1 + u * dx, py = s.y1 + u * dy;
      const d = engine.D(x, y, px, py);
      if (d < md) { md = d; best = { x: px, y: py, t: "nearest", c: "#9cdcfe" }; }
    }

    // Nearest on circles / ellipses
    for (const f of engine.formas) {
      if (f.hidden) continue;
      if (f.tipo === "circulo") {
        const da = Math.atan2(y - f.cy!, x - f.cx!);
        const px = f.cx! + Math.cos(da) * f.r!;
        const py = f.cy! + Math.sin(da) * f.r!;
        const d = engine.D(x, y, px, py);
        if (d < md) { md = d; best = { x: px, y: py, t: "nearest", c: "#9cdcfe" }; }
      } else if (f.tipo === "elipse") {
        const da = Math.atan2(y - f.cy!, x - f.cx!);
        const px = f.cx! + Math.cos(da) * f.rx!;
        const py = f.cy! + Math.sin(da) * f.ry!;
        const d = engine.D(x, y, px, py);
        if (d < md) { md = d; best = { x: px, y: py, t: "nearest", c: "#9cdcfe" }; }
      }
    }
    return best;
  }

  private _getPerpSnap(engine: CadEngine, x: number, y: number): SnapPoint | null {
    if (!this.cfg.perpendicular || !this.pIni) return null;
    let best: SnapPoint | null = null;
    let md = 15 / engine.cam.zoom;

    const segs = _collectSegments(engine);
    for (const s of segs) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = dx * dx + dy * dy;
      if (len === 0) continue;
      const u = ((this.pIni.x - s.x1) * dx + (this.pIni.y - s.y1) * dy) / len;
      if (u < 0 || u > 1) continue;
      const px = s.x1 + u * dx, py = s.y1 + u * dy;
      const d = engine.D(x, y, px, py);
      if (d < md) { md = d; best = { x: px, y: py, t: "perpendicular", c: "#d7ba7d" }; }
    }
    return best;
  }
}

// ============================================================================
// Utilidades libres (no dependen de estado)
// ============================================================================

interface Seg { x1: number; y1: number; x2: number; y2: number; }

function segIntersect(s1: Seg, s2: Seg): { x: number; y: number } | null {
  const dx1 = s1.x2 - s1.x1, dy1 = s1.y2 - s1.y1;
  const dx2 = s2.x2 - s2.x1, dy2 = s2.y2 - s2.y1;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-10) return null;
  const t = ((s2.x1 - s1.x1) * dy2 - (s2.y1 - s1.y1) * dx2) / det;
  const u = ((s2.x1 - s1.x1) * dy1 - (s2.y1 - s1.y1) * dx1) / det;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: s1.x1 + t * dx1, y: s1.y1 + t * dy1 };
  }
  return null;
}

/** Recolecta todos los segmentos rectos de todas las formas */
function _collectSegments(engine: CadEngine): Seg[] {
  const segs: Seg[] = [];
  for (const f of engine.formas) {
    if (f.hidden) continue;
    if (f.tipo === "linea") {
      segs.push({ x1: f.x1!, y1: f.y1!, x2: f.x2!, y2: f.y2! });
    } else if (f.tipo === "rectangulo") {
      const x2 = f.x! + f.w!, y2 = f.y! + f.h!;
      segs.push({ x1: f.x!, y1: f.y!, x2: x2, y2: f.y! });
      segs.push({ x1: x2, y1: f.y!, x2: x2, y2: y2 });
      segs.push({ x1: x2, y1: y2, x2: f.x!, y2: y2 });
      segs.push({ x1: f.x!, y1: y2, x2: f.x!, y2: f.y! });
    } else if (f.tipo === "polilinea" && f.pts) {
      for (let j = 1; j < f.pts.length; j++) {
        segs.push({ x1: f.pts[j - 1].x, y1: f.pts[j - 1].y, x2: f.pts[j].x, y2: f.pts[j].y });
      }
    }
  }
  return segs;
}

/**
 * CadEngine.ts - Motor CAD 2D (orquestador delgado)
 * Estado, math, proyección, historial y serialización.
 * Delega rendering a CadRender, dibujo a CadDraw, edición a CadEdit, CLI a CadCli.
 */

import { CadSnapState } from "./CadSnap.js";
import { renderToCtx as _renderToCtx, zoomFit as _zoomFit } from "./CadRender.js";
import { addLine, addRect, addCircle, addEllipse, addArc, addCarc, addPline, addDim, addHdim, addVdim, addText, addOText, addArrow, addDarrow, addLine3d, addArrow3d, addDarrow3d, addText3d, addPline3d, addCircle3d, addCarc3d, addHatch3d, addFillPoly3d, addLabel3d, addBeam2d, clearShapes } from "./CadDraw.js";
import { deleteShape, moveShape, copyShape, rotateShape, scaleShapeOp, mirrorShape, arrayShape, polarArrayShape, groupShapes, ungroupShape } from "./CadEdit.js";
import { execCommands } from "./CadCli.js";

import type { CadShape, CadShapeType, CadScreenPt, CadShapeUser, CadJSON } from "./CadTypes.js";

// Re-export types para que los consumidores existentes sigan funcionando
export type { CadShape, CadShapeType, CadScreenPt, CadPoint, CadJSON } from "./CadTypes.js";

// ============================================================================
// CadEngine class
// ============================================================================
export class CadEngine {
  // ── Camera ──
  cam = { x: 0, y: 0, zoom: 1, minZoom: 0.05, maxZoom: 200 };

  // ── Shapes & history ──
  formas: CadShape[] = [];
  private historial: CadShape[][] = [];
  private histPos = -1;
  private readonly MAX_HIST = 40;

  // ── Drawing state ──
  formaSel = -1;
  selectedShapes: number[] = [];
  currentColor = "#333";
  currentZ = 0;
  currentFontSize = 12;
  currentLineWidth = 1.5;
  currentFontFamily: "mono" | "serif" = "mono";
  currentFontItalic = false;

  // ── Scale / units ──
  escala = 1;
  unidad = "cm";

  // ── Toggles ──
  gridOn = true;
  tamGrid = 50;
  showDimLabels = false;

  // ── Canvas dimensions ──
  canvasW = 500;
  canvasH = 400;

  // ── Y-axis flip (cartesian mode: Y+ upward) ──
  yFlip = false;

  /** Transform user Y coordinate for world storage.
   *  w2s() already negates Y (world is inherently cartesian Y+ up).
   *  - yFlip=true  (cartesian): pass Y unchanged → w2s inverts → screen Y+ up ✓
   *  - yFlip=false (canvas default): invert Y here → w2s inverts back → screen Y+ down ✓ */
  yf(y: number): number {
    return this.yFlip ? y : this.canvasH / this.escala - y;
  }

  // ── Background ──
  bgColor = "#ffffff";
  gridColor = "rgba(200,200,220,0.3)";

  // ── 3D projection ──
  projMode: "2d" | "oblique" = "2d";
  projAngle = Math.PI / 4;    // 45° default
  projScale = 0.5;            // cabinet projection foreshortening
  _current3d = false;          // set by renderer per-shape

  // ── Snap (módulo separado CadSnap.ts) ──
  snap = new CadSnapState();

  // ── Batch mode ──
  private _batch = 0;

  // ════════════════════════════════════════════════════════════════════
  // Math utilities
  // ════════════════════════════════════════════════════════════════════

  D(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  Ang(x1: number, y1: number, x2: number, y2: number): number {
    return Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI;
  }

  toU(px: number): number { return +(px / this.escala).toFixed(2); }
  toPx(v: number): number { return v * this.escala; }
  F(v: number): string { return v % 1 === 0 ? v.toString() : v.toFixed(2); }

  // ════════════════════════════════════════════════════════════════════
  // Projection
  // ════════════════════════════════════════════════════════════════════

  w2s(wx: number, wy: number): CadScreenPt {
    return {
      x: (wx - this.cam.x) * this.cam.zoom + this.canvasW / 2,
      y: -(wy - this.cam.y) * this.cam.zoom + this.canvasH / 2,
    };
  }

  s2w(sx: number, sy: number): CadScreenPt {
    return {
      x: (sx - this.canvasW / 2) / this.cam.zoom + this.cam.x,
      y: -(sy - this.canvasH / 2) / this.cam.zoom + this.cam.y,
    };
  }

  w2s3(x3: number, y3: number, z3: number): CadScreenPt {
    if (!this._current3d || this.projMode === "2d") return this.w2s(x3, y3);
    // Oblique projection: X=horizontal, Y=depth(foreshortened), Z=vertical
    const px = x3 + y3 * Math.cos(this.projAngle) * this.projScale;
    const py = z3 + y3 * Math.sin(this.projAngle) * this.projScale;
    return this.w2s(px, py);
  }

  /** Project 3D→2D world coords (for bounds calculation, not screen coords) */
  _proj(x: number, y: number, z: number, is3d?: boolean): { x: number; y: number } {
    if (!is3d || this.projMode === "2d") return { x, y };
    return {
      x: x + y * Math.cos(this.projAngle) * this.projScale,
      y: z + y * Math.sin(this.projAngle) * this.projScale,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // History
  // ════════════════════════════════════════════════════════════════════

  saveHist(): void {
    if (this.histPos < this.historial.length - 1) {
      this.historial = this.historial.slice(0, this.histPos + 1);
    }
    this.historial.push(JSON.parse(JSON.stringify(this.formas)));
    if (this.historial.length > this.MAX_HIST) this.historial.shift();
    this.histPos = this.historial.length - 1;
  }

  undo(): void {
    if (this.histPos > 0) {
      this.histPos--;
      this.formas = JSON.parse(JSON.stringify(this.historial[this.histPos]));
      this.formaSel = -1;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Batch / refresh
  // ════════════════════════════════════════════════════════════════════

  beginBatch(): void { this._batch++; }
  endBatch(): void {
    this._batch--;
    if (this._batch <= 0) { this._batch = 0; this.refresh(); }
  }

  refresh(): void {
    if (this._batch > 0) return;
    this.saveHist();
  }

  // ════════════════════════════════════════════════════════════════════
  // Rendering → CadRender.ts
  // ════════════════════════════════════════════════════════════════════

  renderToCtx(ctx: CanvasRenderingContext2D, w: number, h: number): void { _renderToCtx(this, ctx, w, h); }
  zoomFit(): void { _zoomFit(this); }

  // ════════════════════════════════════════════════════════════════════
  // Drawing API → CadDraw.ts
  // ════════════════════════════════════════════════════════════════════

  line(x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number { return addLine(this, x1, y1, x2, y2, color, opts); }
  rect(x: number, y: number, w: number, h: number, color?: string, opts?: { fill?: string; lw?: number }): number { return addRect(this, x, y, w, h, color, opts); }
  circle(cx: number, cy: number, r: number, color?: string, opts?: { fill?: string; lw?: number }): number { return addCircle(this, cx, cy, r, color, opts); }
  ellipse(cx: number, cy: number, rx: number, ry: number, color?: string): number { return addEllipse(this, cx, cy, rx, ry, color); }
  arc(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, color?: string): number { return addArc(this, x1, y1, cx, cy, x2, y2, color); }
  carc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, color?: string, opts?: { noArrow?: boolean }): number { return addCarc(this, cx, cy, r, startAngle, endAngle, color, opts); }
  pline(coords: number[], color?: string): number { return addPline(this, coords, color); }
  dim(x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number { return addDim(this, x1, y1, x2, y2, offset, text, color); }
  hdim(x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number { return addHdim(this, x1, y1, x2, y2, offset, text, color); }
  vdim(x1: number, y1: number, x2: number, y2: number, offset?: number, text?: string, color?: string): number { return addVdim(this, x1, y1, x2, y2, offset, text, color); }
  text(x: number, y: number, txt: string, color?: string, opts?: { fontSize?: number; textAlign?: "left" | "center" | "right" }): number { return addText(this, x, y, txt, color, opts); }
  /** otext: text with overbar line above (for δ̄, ū, etc.) */
  otext(x: number, y: number, txt: string, color?: string, opts?: { fontSize?: number; textAlign?: "left" | "center" | "right" }): number { return addOText(this, x, y, txt, color, opts); }
  arrow(x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number { return addArrow(this, x1, y1, x2, y2, color, opts); }
  darrow(x1: number, y1: number, x2: number, y2: number, color?: string, opts?: { lw?: number }): number { return addDarrow(this, x1, y1, x2, y2, color, opts); }
  /** beam: structural element between two points with perpendicular width + hatch */
  beam(x1: number, y1: number, x2: number, y2: number, width?: number, color?: string, hatchSpacing?: number): void { addBeam2d(this, x1, y1, x2, y2, width || 8, color, hatchSpacing); }
  /** cid: circle with centered label (identifier) — self-contained block */
  cnode(cx: number, cy: number, label: string, radius?: number, color?: string): void {
    const r = radius || 8;
    const c = color || this.currentColor;
    const fs = Math.round(r * 1.2);  // font scales with radius
    this.beginBatch();
    this.circle(cx, cy, r, c, { fill: "#fff" });
    const oldFi = this.currentFontItalic;
    const oldFf = this.currentFontFamily;
    this.currentFontItalic = false;
    this.currentFontFamily = "serif";
    this.text(cx, cy, label, c, { fontSize: fs });
    this.currentFontItalic = oldFi;
    this.currentFontFamily = oldFf;
    this.endBatch();
  }
  /** tid: equilateral triangle with centered label (identifier marker) */
  tnode(cx: number, cy: number, label: string, size?: number, color?: string): void {
    const s = size || 10; // half-size of triangle
    const c = color || this.currentColor;
    const px = this.toPx(cx);
    const py = this.toPx(cy);
    const sp = this.toPx(s);
    // Equilateral triangle: top vertex, bottom-left, bottom-right
    // Note: CadEngine uses Y-up world coords (w2s inverts Y), so top = +Y, bottom = -Y
    const h = sp * Math.sqrt(3);
    const topY = py + h * 0.6;    // top vertex (up in world Y)
    const botY = py - h * 0.4;    // bottom vertices (down in world Y)
    const pts: import("./CadTypes.js").CadPoint[] = [
      { x: px, y: topY, z: 0 },
      { x: px - sp, y: botY, z: 0 },
      { x: px + sp, y: botY, z: 0 },
      { x: px, y: topY, z: 0 },  // close
    ];
    this.beginBatch();
    // Filled triangle (white fill + black outline)
    this.formas.push({
      tipo: "poligono_relleno",
      pts,
      fill: "#fff",
      color: c,
      z: this.currentZ,
      lw: this.currentLineWidth,
    });
    // Centered label — font scales with triangle size
    const fs = Math.round(s * 0.9);
    const oldFi = this.currentFontItalic;
    const oldFf = this.currentFontFamily;
    this.currentFontItalic = false;
    this.currentFontFamily = "serif";
    this.text(cx, cy, label, c, { fontSize: fs });
    this.currentFontItalic = oldFi;
    this.currentFontFamily = oldFf;
    this.endBatch();
  }
  /** axes: coordinate axes with labels at origin (x, y).
   *  mode "2d" draws X→ and Y↑; mode "3d" adds Z via oblique projection.
   *  labelX/Y/Z override default axis labels. */
  axes(x: number, y: number, length?: number, mode?: string, labelX?: string, labelY?: string, labelZ?: string): void {
    const L = length || 40;
    const m = (mode || "2d").toLowerCase();
    const c = this.currentColor;
    const lx = labelX || "X";
    const ly = labelY || "Y";
    const oldFs = this.currentFontSize;
    const fs = Math.max(9, Math.round(L * 0.28));
    this.currentFontSize = fs;
    this.beginBatch();
    // X axis (right)
    this.arrow(x, y, x + L, y, c);
    this.text(x + L + 4, y + 2, lx, c);
    // Y axis (up in world)
    this.arrow(x, y, x, y + L, c);
    this.text(x - 8, y + L + 6, ly, c);
    if (m === "3d") {
      // Z axis via oblique projection (45° into the page)
      const lz = labelZ || "Z";
      const zx = L * 0.5;  // oblique offsets
      const zy = -L * 0.5; // down-left in world Y
      this.arrow(x, y, x + zx, y + zy, c);
      this.text(x + zx + 4, y + zy - 4, lz, c);
    }
    this.currentFontSize = oldFs;
    this.endBatch();
  }

  /** moment: curved arrow indicating rotation/moment at a point.
   *  position: "top"|"left"|"right"|"bottom" controls where the arc appears.
   *  CW on canvas = CCW in Y-up world = positive rotation convention. */
  moment(cx: number, cy: number, r?: number, position?: string, color?: string): void {
    const radius = r || 16;
    const pos = (position || "top").toLowerCase();
    // Angle ranges (canvas CW): arc passes through the specified side
    // Each range is 100° sweep
    let start: number, end: number;
    switch (pos) {
      case "left":  case "l": start = 130; end = 230; break;
      case "right": case "r": start = 310; end = 410; break; // 410 = 50° wrapped
      case "bottom":case "b": start = 40;  end = 140; break;
      default: /* top */      start = 220; end = 320; break;
    }
    this.carc(cx, cy, radius, start, end, color);
  }

  clear(): void { clearShapes(this); }

  // ── 3D Drawing API ──
  line3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string, opts?: { lw?: number }): number { return addLine3d(this, x1, y1, z1, x2, y2, z2, color, opts); }
  arrow3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string): number { return addArrow3d(this, x1, y1, z1, x2, y2, z2, color); }
  darrow3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color?: string): number { return addDarrow3d(this, x1, y1, z1, x2, y2, z2, color); }
  text3d(x: number, y: number, z: number, txt: string, color?: string): number { return addText3d(this, x, y, z, txt, color); }
  pline3d(coords: number[], color?: string): number { return addPline3d(this, coords, color); }
  circle3d(cx: number, cy: number, cz: number, r: number, color?: string, opts?: { fill?: string; lw?: number }): number { return addCircle3d(this, cx, cy, cz, r, color, opts); }
  carc3d(cx: number, cy: number, cz: number, r: number, startAngle: number, endAngle: number, color?: string): number { return addCarc3d(this, cx, cy, cz, r, startAngle, endAngle, color); }
  hatch3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, x3: number, y3: number, z3: number, x4: number, y4: number, z4: number, spacing?: number, color?: string): void { addHatch3d(this, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, spacing, color); }
  fillpoly3d(coords: number[], color?: string): number { return addFillPoly3d(this, coords, color); }
  label3d(x: number, y: number, z: number, txt: string, anchor?: string, color?: string): number { return addLabel3d(this, x, y, z, txt, anchor, color); }

  // ── Compound 3D elements (structural engineering) ──

  beam3d(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, depth?: number, label?: string): void {
    const d = depth || 1.2;
    const c = this.currentColor;
    this.beginBatch();
    // Outline: top, bottom, end caps
    this.line3d(x1, y1, z1, x2, y2, z2, c);
    this.line3d(x1, y1, z1 - d, x2, y2, z2 - d, c);
    this.line3d(x1, y1, z1, x1, y1, z1 - d, c);
    this.line3d(x2, y2, z2, x2, y2, z2 - d, c);
    // Hatch fill
    addHatch3d(this, x1, y1, z1, x2, y2, z2, x2, y2, z2 - d, x1, y1, z1 - d, d * 0.8);
    // Direction triangle (filled) + label inside
    if (label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mz = (z1 + z2) / 2;
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const triSize = 1.0;
      const triOff = d + 1.5; // offset below element
      const tx1 = mx - ux * triSize, ty1 = my - uy * triSize, tz1 = mz - triOff;
      const tx2 = mx + ux * triSize, ty2 = my + uy * triSize, tz2 = tz1;
      const tx3 = mx, ty3 = my, tz3 = tz1 + triSize * 1.2;
      // Filled triangle
      addFillPoly3d(this, [tx1, ty1, tz1, tx2, ty2, tz2, tx3, ty3, tz3], "#333");
      // Label centered inside triangle (white text)
      addLabel3d(this, mx, my, (tz1 + tz3) / 2, label, "center", "#fff");
    }
    this.endBatch();
  }

  node3d(x: number, y: number, z: number, label: string, radius?: number): void {
    const r = radius || 0.8;
    this.beginBatch();
    this.circle3d(x, y, z, r, "#333", { fill: "#fff" });
    addLabel3d(this, x, y, z, label, "center", "#333");
    this.endBatch();
  }

  dof3d(x: number, y: number, z: number, dx: number, dy: number, dz: number, label: string): void {
    const c = this.currentColor;
    this.beginBatch();
    this.arrow3d(x, y, z, x + dx, y + dy, z + dz, c);
    // Label at tip with small offset
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const off = 0.8;
    addLabel3d(this, x + dx + ux * off, y + dy + uy * off, z + dz + uz * off, label, "center", c);
    this.endBatch();
  }

  /** Rotational DOF: two parallel arrows pointing in same direction + label */
  rdof3d(x: number, y: number, z: number, dx: number, dy: number, dz: number, label: string): void {
    const c = this.currentColor;
    this.beginBatch();

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len === 0) { this.endBatch(); return; }
    const ux = dx / len, uy = dy / len, uz = dz / len;

    // Perpendicular offset: Z for horizontal arrows, X for vertical
    let px = 0, py = 0, pz = 0;
    if (Math.abs(uz) > 0.7) {
      px = 1;  // vertical arrow → offset in X
    } else {
      pz = 1;  // horizontal arrow → offset in Z
    }

    const off = 0.3;

    // Arrow 1 (offset +perp)
    this.arrow3d(
      x + px * off, y + py * off, z + pz * off,
      x + dx + px * off, y + dy + py * off, z + dz + pz * off, c
    );
    // Arrow 2 (offset -perp)
    this.arrow3d(
      x - px * off, y - py * off, z - pz * off,
      x + dx - px * off, y + dy - py * off, z + dz - pz * off, c
    );

    // Label at tip
    const loff = 0.8;
    addLabel3d(this, x + dx + ux * loff, y + dy + uy * loff, z + dz + uz * loff, label, "center", c);
    this.endBatch();
  }

  axes3d(x: number, y: number, z: number, size?: number, labels?: string[]): void {
    const s = size || 4;
    const lx = labels?.[0] || "X";
    const ly = labels?.[1] || "Y";
    const lz = labels?.[2] || "Z";
    const oldColor = this.currentColor;
    this.beginBatch();
    // Z axis (up)
    this.currentColor = "#333";
    this.arrow3d(x, y, z, x, y, z + s);
    addLabel3d(this, x - 1, y, z + s + 0.5, lz, "center", "#333");
    // X axis (right)
    this.arrow3d(x, y, z, x + s, y, z);
    addLabel3d(this, x + s + 0.5, y, z - 0.5, lx, "center", "#333");
    // Y axis (oblique/depth)
    this.arrow3d(x, y, z, x, y + s * 0.75, z);
    addLabel3d(this, x, y + s * 0.75 + 0.5, z + 0.5, ly, "center", "#333");
    this.currentColor = oldColor;
    this.endBatch();
  }

  /** axes2d cx cy size [labelH] [labelV] — 2D axis cross with arrows and labels.
   *  Default: horizontal=X, vertical=Y. Draws from origin outward. */
  axes2d(cx: number, cy: number, size?: number, labelH?: string, labelV?: string): void {
    const s = size || 50;
    const lh = labelH || "X";
    const lv = labelV || "Y";
    const c = this.currentColor || "#333";
    const oldFf = this.currentFontFamily;
    const oldFi = this.currentFontItalic;
    this.currentFontFamily = "serif";
    this.currentFontItalic = true;
    this.beginBatch();
    // Horizontal axis →
    this.arrow(cx, cy, cx + s, cy, c);
    this.text(cx + s + 4, cy, lh, c);
    // Vertical axis ↑
    this.arrow(cx, cy, cx, cy - s, c);
    this.text(cx - 2, cy - s - 6, lv, c);
    this.currentFontFamily = oldFf;
    this.currentFontItalic = oldFi;
    this.endBatch();
  }

  /** axes2dxyz cx cy size — 2D axis cross X→, Y↑, Z↓ (for grid frame local coords) */
  axes2dxyz(cx: number, cy: number, size?: number, labels?: string[]): void {
    const s = size || 50;
    const lx = labels?.[0] || "x";
    const ly = labels?.[1] || "y";
    const lz = labels?.[2] || "z";
    const c = this.currentColor || "#333";
    const oldFf = this.currentFontFamily;
    const oldFi = this.currentFontItalic;
    this.currentFontFamily = "serif";
    this.currentFontItalic = true;
    this.beginBatch();
    // X axis → (horizontal right)
    this.arrow(cx, cy, cx + s, cy, c);
    this.text(cx + s + 4, cy, lx, c);
    // Y axis ↑ (vertical up)
    this.arrow(cx, cy, cx, cy - s, c);
    this.text(cx - 2, cy - s - 6, ly, c);
    // Z axis ↓ (vertical down)
    this.arrow(cx, cy, cx, cy + s, c);
    this.text(cx - 2, cy + s + 10, lz, c);
    this.currentFontFamily = oldFf;
    this.currentFontItalic = oldFi;
    this.endBatch();
  }

  support3d(x: number, y: number, z: number, type: string, angle?: number): void {
    const c = this.currentColor;
    const sz = 1.5;
    this.beginBatch();
    switch (type) {
      case "pinned": {
        // Triangle outline (NOT filled)
        this.line3d(x, y, z, x - sz, y, z - sz * 1.2, c);
        this.line3d(x - sz, y, z - sz * 1.2, x + sz, y, z - sz * 1.2, c);
        this.line3d(x + sz, y, z - sz * 1.2, x, y, z, c);
        // Base line
        this.line3d(x - sz * 1.3, y, z - sz * 1.2, x + sz * 1.3, y, z - sz * 1.2, c);
        // Hatching lines below base
        const oldLw = this.currentLineWidth;
        this.currentLineWidth = 0.5;
        for (let i = -2; i <= 2; i++) {
          const hx = x + i * sz * 0.35;
          this.line3d(hx, y, z - sz * 1.2, hx - sz * 0.3, y, z - sz * 1.2 - sz * 0.4, c);
        }
        this.currentLineWidth = oldLw;
        break;
      }
      case "roller": {
        // Triangle outline (NOT filled)
        this.line3d(x, y, z, x - sz, y, z - sz * 1.0, c);
        this.line3d(x - sz, y, z - sz * 1.0, x + sz, y, z - sz * 1.0, c);
        this.line3d(x + sz, y, z - sz * 1.0, x, y, z, c);
        // Circle below
        this.circle3d(x, y, z - sz * 1.0 - sz * 0.3, sz * 0.3, c);
        // Base line
        this.line3d(x - sz * 1.3, y, z - sz * 1.0 - sz * 0.6, x + sz * 1.3, y, z - sz * 1.0 - sz * 0.6, c);
        break;
      }
      case "fixed": {
        // Thick wall line
        this.line3d(x - sz, y, z, x + sz, y, z, c);
        // Hatching (ground symbol)
        for (let i = -3; i <= 3; i++) {
          const bx = x + i * sz * 0.3;
          this.line3d(bx, y, z, bx - sz * 0.3, y, z - sz * 0.4, c);
        }
        break;
      }
    }
    this.endBatch();
  }

  // ════════════════════════════════════════════════════════════════════
  // Edit API → CadEdit.ts
  // ════════════════════════════════════════════════════════════════════

  del(idx: number): void { deleteShape(this, idx); }
  move(idx: number | number[], dx: number, dy: number): void { moveShape(this, idx, dx, dy); }
  copy(idx: number, dx: number, dy: number): number { return copyShape(this, idx, dx, dy); }
  rotate(idx: number, cx: number, cy: number, angleDeg: number): void { rotateShape(this, idx, cx, cy, angleDeg); }
  scaleShape(idx: number, factor: number, cx?: number, cy?: number): void { scaleShapeOp(this, idx, factor, cx, cy); }
  mirror(idx: number, ax1: number, ay1: number, ax2: number, ay2: number): number { return mirrorShape(this, idx, ax1, ay1, ax2, ay2); }
  array(idx: number | number[], nx: number, ny: number, dx: number, dy: number): number[] { return arrayShape(this, idx, nx, ny, dx, dy); }
  polarArray(idx: number | number[], n: number, cx: number, cy: number, totalAngle?: number): number[] { return polarArrayShape(this, idx, n, cx, cy, totalAngle); }
  group(indices: number[]): number { return groupShapes(this, indices); }
  ungroup(idx: number): void { ungroupShape(this, idx); }

  // ── Special shapes (structural engineering) ──

  rrect(x: number, y: number, w: number, h: number, r: number, color?: string): void {
    const c = color || this.currentColor;
    r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.beginBatch();
    this.line(x + r, y, x + w - r, y, c);
    this.line(x + w, y + r, x + w, y + h - r, c);
    this.line(x + w - r, y + h, x + r, y + h, c);
    this.line(x, y + h - r, x, y + r, c);
    if (r > 0) {
      // carc expects degrees — convert from radians
      const na = { noArrow: true };
      this.carc(x + r, y + r, r, 180, 270, c, na);
      this.carc(x + w - r, y + r, r, 270, 360, c, na);
      this.carc(x + w - r, y + h - r, r, 0, 90, c, na);
      this.carc(x + r, y + h - r, r, 90, 180, c, na);
    }
    this.endBatch();
  }

  stirrup(x: number, y: number, w: number, h: number, r: number, hookLen?: number, color?: string): void {
    const c = color || "#4ec9b0";
    hookLen = hookLen || r * 3;
    this.beginBatch();
    this.rrect(x, y, w, h, r, c);
    const hx = x + r, hy = y + h;
    this.line(hx, hy, hx + hookLen * 0.707, hy - hookLen * 0.707, c);
    const hx2 = x + w - r;
    this.line(hx2, hy, hx2 - hookLen * 0.707, hy - hookLen * 0.707, c);
    this.endBatch();
  }

  columnSection(cx: number, cy: number, bw: number, bh: number, rec: number, dStirrup: number, dLong: number, nx: number, ny: number, bendR?: number): number {
    const groupStart = this.formas.length;
    this.beginBatch();
    const cConcrete = "#cccccc", cStirrup = "#00aa66", cBar = "#dd3333";
    bendR = bendR || (dStirrup * 3);
    rec = rec || 4;
    const x0 = cx - bw / 2, y0 = cy - bh / 2;
    this.rect(x0, y0, bw, bh, "#999999", { fill: cConcrete });
    const sxO = x0 + rec, syO = y0 + rec;
    const swO = bw - 2 * rec, shO = bh - 2 * rec;
    const rO = bendR + dStirrup / 2;
    this.rrect(sxO, syO, swO, shO, rO, cStirrup);
    const sxI = sxO + dStirrup, syI = syO + dStirrup;
    const swI = swO - 2 * dStirrup, shI = shO - 2 * dStirrup;
    const rI = Math.max(bendR - dStirrup / 2, 0.5);
    this.rrect(sxI, syI, swI, shI, rI, cStirrup);
    const barR = dLong / 2;
    const barOpts = { fill: cBar };
    const barOff = rec + dStirrup + barR;
    const cd = (rI + barR) * 0.707;
    const acBLx = sxI + rI, acBLy = syI + rI;
    this.circle(acBLx - cd, acBLy - cd, barR, cBar, barOpts);
    this.circle(acBLx + (swI - 2 * rI) + cd, acBLy - cd, barR, cBar, barOpts);
    this.circle(acBLx + (swI - 2 * rI) + cd, acBLy + (shI - 2 * rI) + cd, barR, cBar, barOpts);
    this.circle(acBLx - cd, acBLy + (shI - 2 * rI) + cd, barR, cBar, barOpts);
    if (nx > 2) {
      const spacingX = (bw - 2 * barOff) / (nx - 1);
      for (let ix = 1; ix < nx - 1; ix++) {
        const bx = x0 + barOff + ix * spacingX;
        this.circle(bx, y0 + barOff, barR, cBar, barOpts);
        this.circle(bx, y0 + bh - barOff, barR, cBar, barOpts);
      }
    }
    if (ny > 2) {
      const spacingY = (bh - 2 * barOff) / (ny - 1);
      for (let iy = 1; iy < ny - 1; iy++) {
        const by = y0 + barOff + iy * spacingY;
        this.circle(x0 + barOff, by, barR, cBar, barOpts);
        this.circle(x0 + bw - barOff, by, barR, cBar, barOpts);
      }
    }
    this.endBatch();
    const groupEnd = this.formas.length;
    if (groupEnd > groupStart) {
      const children: CadShape[] = [];
      for (let i = groupStart; i < groupEnd; i++) children.push(this.formas[i]);
      this.formas.splice(groupStart, groupEnd - groupStart);
      this.formas.push({ tipo: "grupo", color: "#333", z: 0, children });
      this.refresh();
    }
    return this.formas.length - 1;
  }

  // ════════════════════════════════════════════════════════════════════
  // CLI → CadCli.ts
  // ════════════════════════════════════════════════════════════════════

  exec(cmdText: string): void { execCommands(this, cmdText); }

  // ════════════════════════════════════════════════════════════════════
  // Serialization
  // ════════════════════════════════════════════════════════════════════

  private _shapeToUser(f: CadShape): CadShapeUser {
    const o: CadShapeUser = { type: f.tipo, color: f.color || "#333" };
    if (f.z) o.z = this.toU(f.z);
    if (f.lw) o.lw = f.lw;
    if (f.fill) o.fill = f.fill;
    if (f.hidden) o.hidden = true;
    if (f.is3d) o.is3d = true;

    switch (f.tipo) {
      case "linea":
        o.x1 = this.toU(f.x1!); o.y1 = this.toU(f.y1!);
        o.x2 = this.toU(f.x2!); o.y2 = this.toU(f.y2!);
        if (f.z1) o.z1 = this.toU(f.z1); if (f.z2) o.z2 = this.toU(f.z2);
        break;
      case "rectangulo":
        o.x = this.toU(f.x!); o.y = this.toU(f.y!);
        o.w = this.toU(f.w!); o.h = this.toU(f.h!);
        break;
      case "circulo":
        o.cx = this.toU(f.cx!); o.cy = this.toU(f.cy!); o.r = this.toU(f.r!);
        break;
      case "elipse":
        o.cx = this.toU(f.cx!); o.cy = this.toU(f.cy!);
        o.rx = this.toU(f.rx!); o.ry = this.toU(f.ry!);
        break;
      case "arco":
        o.x1 = this.toU(f.x1!); o.y1 = this.toU(f.y1!);
        o.cx = this.toU(f.cx!); o.cy = this.toU(f.cy!);
        o.x2 = this.toU(f.x2!); o.y2 = this.toU(f.y2!);
        break;
      case "arco_circular":
        o.cx = this.toU(f.cx!); o.cy = this.toU(f.cy!); o.r = this.toU(f.r!);
        o.startAngle = f.startAngle; o.endAngle = f.endAngle;
        break;
      case "polilinea": case "mano":
        if (f.pts) o.pts = f.pts.map(p => ({ x: this.toU(p.x), y: this.toU(p.y), z: p.z ? this.toU(p.z) : 0 }));
        break;
      case "cota":
        o.x1 = this.toU(f.x1!); o.y1 = this.toU(f.y1!);
        o.x2 = this.toU(f.x2!); o.y2 = this.toU(f.y2!);
        o.offset = this.toU(f.offset || 0); if (f.text) o.text = f.text;
        break;
      case "texto":
        o.x = this.toU(f.x!); o.y = this.toU(f.y!);
        if (f.text) o.text = f.text;
        if (f.fontSize) o.fontSize = f.fontSize;
        if (f.textAlign) o.textAlign = f.textAlign;
        break;
      case "flecha":
        o.x1 = this.toU(f.x1!); o.y1 = this.toU(f.y1!);
        o.x2 = this.toU(f.x2!); o.y2 = this.toU(f.y2!);
        if (f.z1) o.z1 = this.toU(f.z1); if (f.z2) o.z2 = this.toU(f.z2);
        break;
      case "grupo":
        if (f.children) o.children = f.children.map(c => this._shapeToUser(c));
        break;
    }
    return o;
  }

  private _shapeFromUser(o: CadShapeUser): CadShape {
    const f: CadShape = { tipo: o.type as CadShapeType, color: o.color || "#333", z: 0 };
    if (o.z) f.z = this.toPx(o.z);
    if (o.lw) f.lw = o.lw;
    if (o.fill) f.fill = o.fill;
    if (o.hidden) f.hidden = true;
    if (o.is3d) f.is3d = true;

    switch (o.type) {
      case "linea":
        f.x1 = this.toPx(o.x1); f.y1 = this.toPx(o.y1);
        f.x2 = this.toPx(o.x2); f.y2 = this.toPx(o.y2);
        if (o.z1) f.z1 = this.toPx(o.z1); if (o.z2) f.z2 = this.toPx(o.z2);
        f.z = this.toPx(o.z || 0);
        break;
      case "rectangulo":
        f.x = this.toPx(o.x); f.y = this.toPx(o.y);
        f.w = this.toPx(o.w); f.h = this.toPx(o.h);
        break;
      case "circulo":
        f.cx = this.toPx(o.cx); f.cy = this.toPx(o.cy); f.r = this.toPx(o.r);
        break;
      case "elipse":
        f.cx = this.toPx(o.cx); f.cy = this.toPx(o.cy);
        f.rx = this.toPx(o.rx); f.ry = this.toPx(o.ry);
        break;
      case "arco":
        f.x1 = this.toPx(o.x1); f.y1 = this.toPx(o.y1);
        f.cx = this.toPx(o.cx); f.cy = this.toPx(o.cy);
        f.x2 = this.toPx(o.x2); f.y2 = this.toPx(o.y2);
        break;
      case "arco_circular":
        f.cx = this.toPx(o.cx); f.cy = this.toPx(o.cy); f.r = this.toPx(o.r);
        if (o.startAngle !== undefined) f.startAngle = o.startAngle;
        if (o.endAngle !== undefined) f.endAngle = o.endAngle;
        break;
      case "polilinea": case "mano":
        if (o.pts) f.pts = o.pts.map((p: any) => ({ x: this.toPx(p.x), y: this.toPx(p.y), z: p.z ? this.toPx(p.z) : 0 }));
        break;
      case "cota":
        f.x1 = this.toPx(o.x1); f.y1 = this.toPx(o.y1);
        f.x2 = this.toPx(o.x2); f.y2 = this.toPx(o.y2);
        f.offset = this.toPx(o.offset || 0); if (o.text) f.text = o.text;
        break;
      case "texto":
        f.x = this.toPx(o.x); f.y = this.toPx(o.y);
        if (o.text) f.text = o.text;
        if (o.fontSize) f.fontSize = o.fontSize;
        if (o.textAlign) f.textAlign = o.textAlign;
        break;
      case "flecha":
        f.x1 = this.toPx(o.x1); f.y1 = this.toPx(o.y1);
        f.x2 = this.toPx(o.x2); f.y2 = this.toPx(o.y2);
        if (o.z1) f.z1 = this.toPx(o.z1); if (o.z2) f.z2 = this.toPx(o.z2);
        break;
      case "grupo":
        if (o.children) f.children = o.children.map((c: any) => this._shapeFromUser(c));
        break;
    }
    return f;
  }

  toJSON(): CadJSON {
    return {
      version: 1,
      unit: this.unidad,
      scale: this.escala,
      color: this.currentColor,
      z: this.toU(this.currentZ),
      shapes: this.formas.map(f => this._shapeToUser(f)),
    };
  }

  fromJSON(data: CadJSON): void {
    if (!data || !data.shapes) return;
    this.saveHist();
    if (data.unit) this.unidad = data.unit;
    if (data.scale) this.escala = data.scale;
    if (data.color) this.currentColor = data.color;
    if (data.z) this.currentZ = this.toPx(data.z);
    this.formas.length = 0;
    for (const s of data.shapes) this.formas.push(this._shapeFromUser(s));
    this.formaSel = -1;
    this.saveHist();
  }
}

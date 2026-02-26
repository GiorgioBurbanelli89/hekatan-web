/**
 * CadRender.ts - Funciones de renderizado del CAD
 * Port de cad-render.js como funciones libres que reciben engine.
 */

import type { CadEngine } from "./CadEngine.js";
import type { CadShape, CadScreenPt } from "./CadTypes.js";

// ============================================================================
// renderToCtx - Render principal
// ============================================================================

export function renderToCtx(engine: CadEngine, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  engine.canvasW = w;
  engine.canvasH = h;

  ctx.fillStyle = engine.bgColor;
  ctx.fillRect(0, 0, w, h);

  if (engine.gridOn) drawGrid(engine, ctx, w, h);
  drawOrigin(engine, ctx);

  for (let i = 0; i < engine.formas.length; i++) {
    const f = engine.formas[i];
    if (!f.hidden) {
      const isSel = i === engine.formaSel || engine.selectedShapes.includes(i);
      drawShape(engine, ctx, f, isSel);
    }
  }
}

// ============================================================================
// drawGrid
// ============================================================================

function drawGrid(engine: CadEngine, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  const tl = engine.s2w(0, 0);
  const br = engine.s2w(w, h);
  let spacing = engine.tamGrid;
  let screenSpacing = spacing * engine.cam.zoom;
  while (screenSpacing < 15) { spacing *= 5; screenSpacing = spacing * engine.cam.zoom; }
  while (screenSpacing > 150) { spacing /= 5; screenSpacing = spacing * engine.cam.zoom; }

  const minY = Math.min(tl.y, br.y), maxY = Math.max(tl.y, br.y);
  const startX = Math.floor(tl.x / spacing) * spacing;
  const startY = Math.floor(minY / spacing) * spacing;
  const endX = Math.ceil(br.x / spacing) * spacing;
  const endY = Math.ceil(maxY / spacing) * spacing;

  ctx.strokeStyle = engine.gridColor;
  ctx.lineWidth = 0.5;
  for (let wx = startX; wx <= endX; wx += spacing) {
    const sp = engine.w2s(wx, 0);
    ctx.beginPath(); ctx.moveTo(sp.x, 0); ctx.lineTo(sp.x, h); ctx.stroke();
  }
  for (let wy = startY; wy <= endY; wy += spacing) {
    const sp = engine.w2s(0, wy);
    ctx.beginPath(); ctx.moveTo(0, sp.y); ctx.lineTo(w, sp.y); ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// drawOrigin
// ============================================================================

function drawOrigin(engine: CadEngine, ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const o = engine.w2s(0, 0);
  const len = 30;
  const axes = [
    { dx: 1, dy: 0, lbl: "X", col: "rgba(220,80,80,0.5)" },
    { dx: 0, dy: -1, lbl: "Y", col: "rgba(80,200,80,0.5)" },
  ];
  for (const ax of axes) {
    ctx.strokeStyle = ax.col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + ax.dx * len, o.y + ax.dy * len);
    ctx.stroke();
    ctx.fillStyle = ax.col;
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(ax.lbl, o.x + ax.dx * len + (ax.dx ? 4 : -4), o.y + ax.dy * len + (ax.dy ? -4 : 4));
  }
  ctx.fillStyle = "rgba(100,100,100,0.3)";
  ctx.beginPath(); ctx.arc(o.x, o.y, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ============================================================================
// drawShape - Dibuja una forma individual
// ============================================================================

export function drawShape(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  ctx.save();
  ctx.strokeStyle = sel ? "#0066dd" : (f.color || "#333");
  const baseLw = f.lw || (sel ? 2.5 : 1.5);
  ctx.lineWidth = Math.max(baseLw / Math.max(engine.cam.zoom, 0.2), 1);
  const fz = f.z || 0;

  // Set 3D flag for w2s3 projection routing
  engine._current3d = !!f.is3d;

  switch (f.tipo) {
    case "linea": {
      const a = engine.w2s3(f.x1!, f.y1!, f.z1 ?? fz);
      const b = engine.w2s3(f.x2!, f.y2!, f.z2 ?? fz);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (sel) { drawNode(ctx, a); drawNode(ctx, b); }
      break;
    }
    case "rectangulo": {
      const r1 = engine.w2s3(f.x!, f.y!, fz);
      const r2 = engine.w2s3(f.x! + f.w!, f.y! + f.h!, fz);
      if (f.fill) { ctx.fillStyle = f.fill; ctx.fillRect(r1.x, r1.y, r2.x - r1.x, r2.y - r1.y); }
      ctx.beginPath(); ctx.rect(r1.x, r1.y, r2.x - r1.x, r2.y - r1.y); ctx.stroke();
      if (sel) {
        drawNode(ctx, r1);
        drawNode(ctx, engine.w2s3(f.x! + f.w!, f.y!, fz));
        drawNode(ctx, engine.w2s3(f.x!, f.y! + f.h!, fz));
        drawNode(ctx, r2);
      }
      break;
    }
    case "circulo": {
      const cc = engine.w2s3(f.cx!, f.cy!, fz);
      const sr = f.r! * engine.cam.zoom;
      ctx.beginPath(); ctx.arc(cc.x, cc.y, sr, 0, Math.PI * 2);
      if (f.fill) { ctx.fillStyle = f.fill; ctx.fill(); }
      ctx.stroke();
      if (sel) drawNode(ctx, cc);
      break;
    }
    case "elipse": {
      const ce = engine.w2s3(f.cx!, f.cy!, fz);
      ctx.beginPath();
      ctx.ellipse(ce.x, ce.y, f.rx! * engine.cam.zoom, f.ry! * engine.cam.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (sel) drawNode(ctx, ce);
      break;
    }
    case "arco": {
      const a1 = engine.w2s3(f.x1!, f.y1!, fz);
      const ac = engine.w2s3(f.cx!, f.cy!, fz);
      const a2 = engine.w2s3(f.x2!, f.y2!, fz);
      ctx.beginPath();
      ctx.moveTo(a1.x, a1.y);
      ctx.quadraticCurveTo(ac.x, ac.y, a2.x, a2.y);
      ctx.stroke();
      if (sel) { drawNode(ctx, a1); drawNode(ctx, a2); }
      break;
    }
    case "arco_circular": {
      const ac2 = engine.w2s3(f.cx!, f.cy!, fz);
      const sr2 = f.r! * engine.cam.zoom;
      ctx.beginPath();
      ctx.arc(ac2.x, ac2.y, sr2, -f.startAngle!, -f.endAngle!, true);
      ctx.stroke();
      // Arrowhead at end of arc (skip for rrect corners via noArrow flag)
      if (!f.noArrow) {
        const endAng = -f.endAngle!;
        const ex = ac2.x + sr2 * Math.cos(endAng);
        const ey = ac2.y + sr2 * Math.sin(endAng);
        const tx = Math.sin(endAng), ty = -Math.cos(endAng);
        const nx = -ty, ny = tx;
        const aLen = 7, aW = 2.8;
        ctx.fillStyle = f.color || engine.currentColor;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - tx * aLen + nx * aW, ey - ty * aLen + ny * aW);
        ctx.lineTo(ex - tx * aLen - nx * aW, ey - ty * aLen - ny * aW);
        ctx.closePath(); ctx.fill();
      }
      if (sel) drawNode(ctx, ac2);
      break;
    }
    case "polilinea":
    case "mano": {
      if (!f.pts || f.pts.length < 2) break;
      const p0 = engine.w2s3(f.pts[0].x, f.pts[0].y, f.pts[0].z || fz);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      for (let j = 1; j < f.pts.length; j++) {
        const pj = engine.w2s3(f.pts[j].x, f.pts[j].y, f.pts[j].z || fz);
        ctx.lineTo(pj.x, pj.y);
      }
      ctx.stroke();
      if (sel) {
        for (const pt of f.pts) drawNode(ctx, engine.w2s3(pt.x, pt.y, pt.z || fz));
      }
      break;
    }
    case "grupo": {
      if (f.children) {
        for (const child of f.children) drawShape(engine, ctx, child, sel);
      }
      break;
    }
    case "cota": {
      drawDimension(engine, ctx, f, sel);
      break;
    }
    case "texto": {
      drawText(engine, ctx, f, sel);
      break;
    }
    case "flecha": {
      drawArrow(engine, ctx, f, sel);
      break;
    }
    case "rayado": {
      drawHatch(engine, ctx, f, sel);
      break;
    }
    case "poligono_relleno": {
      drawFillPoly(engine, ctx, f, sel);
      break;
    }
  }

  engine._current3d = false;
  if (engine.showDimLabels && f.tipo !== "cota") drawDimLabel(engine, ctx, f);
  ctx.restore();
}

// ============================================================================
// drawNode - nodo de selección
// ============================================================================

function drawNode(ctx: CanvasRenderingContext2D, s: CadScreenPt): void {
  ctx.save();
  ctx.fillStyle = "#0066dd";
  ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
  ctx.restore();
}

// ============================================================================
// drawDimLabel - etiqueta de dimensión automática
// ============================================================================

function drawDimLabel(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape): void {
  ctx.save();
  ctx.fillStyle = "rgba(80,120,180,0.75)";
  const fontSize = Math.max(8, 10 / Math.max(engine.cam.zoom, 0.3));
  ctx.font = `${fontSize}px Consolas,monospace`;
  ctx.textAlign = "center";

  if (f.tipo === "linea") {
    const sm = engine.w2s((f.x1! + f.x2!) / 2, (f.y1! + f.y2!) / 2);
    const l = engine.toU(engine.D(f.x1!, f.y1!, f.x2!, f.y2!));
    ctx.fillText(`${engine.F(l)} ${engine.unidad}`, sm.x, sm.y - 6);
  } else if (f.tipo === "rectangulo") {
    const st = engine.w2s(f.x! + f.w! / 2, f.y!);
    ctx.fillText(`${engine.F(engine.toU(Math.abs(f.w!)))} ${engine.unidad}`, st.x, st.y - 5);
  } else if (f.tipo === "circulo") {
    const sc = engine.w2s(f.cx!, f.cy! - f.r!);
    ctx.fillText(`r=${engine.F(engine.toU(f.r!))} ${engine.unidad}`, sc.x, sc.y - 5);
  }
  ctx.restore();
}

// ============================================================================
// drawDimension - cota completa con flechas y texto
// ============================================================================

function drawDimension(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  ctx.save();
  const fz = f.z || 0;
  const s1 = engine.w2s3(f.x1!, f.y1!, fz);
  const s2 = engine.w2s3(f.x2!, f.y2!, fz);

  const dx = s2.x - s1.x, dy = s2.y - s1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) { ctx.restore(); return; }

  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const offPx = (f.offset || 10) * engine.cam.zoom;
  const extLen = offPx + 6;

  const d1x = s1.x + nx * offPx, d1y = s1.y + ny * offPx;
  const d2x = s2.x + nx * offPx, d2y = s2.y + ny * offPx;

  const dimColor = sel ? "#0066dd" : (f.color || "#d4a017");
  const gap = 3;

  // Extension lines
  ctx.strokeStyle = dimColor;
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(s1.x + nx * gap, s1.y + ny * gap); ctx.lineTo(s1.x + nx * extLen, s1.y + ny * extLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s2.x + nx * gap, s2.y + ny * gap); ctx.lineTo(s2.x + nx * extLen, s2.y + ny * extLen); ctx.stroke();

  // Dimension line
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(d1x, d1y); ctx.lineTo(d2x, d2y); ctx.stroke();

  // Arrowheads
  const arrowLen = 7, arrowW = 2.5;
  ctx.fillStyle = dimColor;
  ctx.beginPath();
  ctx.moveTo(d1x, d1y);
  ctx.lineTo(d1x + ux * arrowLen + nx * arrowW, d1y + uy * arrowLen + ny * arrowW);
  ctx.lineTo(d1x + ux * arrowLen - nx * arrowW, d1y + uy * arrowLen - ny * arrowW);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(d2x, d2y);
  ctx.lineTo(d2x - ux * arrowLen + nx * arrowW, d2y - uy * arrowLen + ny * arrowW);
  ctx.lineTo(d2x - ux * arrowLen - nx * arrowW, d2y - uy * arrowLen - ny * arrowW);
  ctx.closePath(); ctx.fill();

  // Text
  const worldDist = engine.D(f.x1!, f.y1!, f.x2!, f.y2!);
  const label = f.text || `${engine.F(engine.toU(worldDist))} ${engine.unidad}`;
  const midX = (d1x + d2x) / 2, midY = (d1y + d2y) / 2;
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

  const fontSize = Math.max(9, 11 / Math.max(engine.cam.zoom, 0.3));
  ctx.font = `bold ${fontSize}px Consolas,monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(angle);
  const textW = ctx.measureText(label).width;
  ctx.fillStyle = engine.bgColor;
  ctx.fillRect(-textW / 2 - 2, -fontSize - 2, textW + 4, fontSize + 2);
  ctx.fillStyle = dimColor;
  ctx.fillText(label, 0, -2);
  ctx.restore();

  if (sel) {
    drawNode(ctx, s1);
    drawNode(ctx, s2);
  }
  ctx.restore();
}

// ============================================================================
// drawText - texto libre en posición world
// ============================================================================

function drawText(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  ctx.save();
  const fz = f.z || 0;
  const s = engine.w2s3(f.x!, f.y!, fz);
  const textColor = sel ? "#0066dd" : (f.color || "#333");
  const fontSize = f.fontSize || Math.max(10, 12 / Math.max(engine.cam.zoom, 0.3));
  ctx.font = `${fontSize}px Consolas,monospace`;
  ctx.textAlign = f.textAlign || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = textColor;
  ctx.fillText(f.text || "", s.x, s.y);
  if (sel) drawNode(ctx, s);
  ctx.restore();
}

// ============================================================================
// drawArrow - flecha con punta triangular
// ============================================================================

function drawArrow(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  ctx.save();
  const fz = f.z || 0;
  const a = engine.w2s3(f.x1!, f.y1!, f.z1 ?? fz);
  const b = engine.w2s3(f.x2!, f.y2!, f.z2 ?? fz);
  const arrowColor = sel ? "#0066dd" : (f.color || "#333");
  const baseLw = f.lw || 1.5;
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = Math.max(baseLw / Math.max(engine.cam.zoom, 0.2), 1);

  // Shaft
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

  // Arrowhead at b (tip)
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) { ctx.restore(); return; }
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const arrowLen = 12, arrowW = 5;
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - ux * arrowLen + nx * arrowW, b.y - uy * arrowLen + ny * arrowW);
  ctx.lineTo(b.x - ux * arrowLen - nx * arrowW, b.y - uy * arrowLen - ny * arrowW);
  ctx.closePath(); ctx.fill();

  if (sel) { drawNode(ctx, a); drawNode(ctx, b); }
  ctx.restore();
}

// ============================================================================
// drawHatch - rayado diagonal dentro de un polígono 3D (4 vértices)
// ============================================================================

function drawHatch(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  if (!f.pts || f.pts.length < 4) return;
  ctx.save();
  const fz = f.z || 0;
  // Project 4 corners to screen
  const corners = f.pts.map(p => engine.w2s3(p.x, p.y, p.z || fz));

  // Create clip path
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.clip();

  // Bounding box in screen space
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
  }

  // Draw diagonal lines at 45° with spacing
  const spacing = (f.spacing || 10) * engine.cam.zoom;
  const hatchColor = sel ? "#0066dd" : (f.color || "#666");
  const hatchLw = f.lw || 0.5;
  ctx.strokeStyle = hatchColor;
  ctx.lineWidth = Math.max(hatchLw / Math.max(engine.cam.zoom, 0.2), 0.5);

  const diag = (maxX - minX) + (maxY - minY);
  for (let d = -diag; d < diag; d += spacing) {
    const x1 = minX + d, y1 = minY;
    const x2 = minX + d + (maxY - minY), y2 = maxY;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
  if (sel && f.pts) {
    for (const p of f.pts) drawNode(ctx, engine.w2s3(p.x, p.y, p.z || fz));
  }
}

// ============================================================================
// drawFillPoly - polígono relleno 3D
// ============================================================================

function drawFillPoly(engine: CadEngine, ctx: CanvasRenderingContext2D, f: CadShape, sel: boolean): void {
  if (!f.pts || f.pts.length < 3) return;
  ctx.save();
  const fz = f.z || 0;
  const pts = f.pts.map(p => engine.w2s3(p.x, p.y, p.z || fz));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  if (f.fill) {
    ctx.fillStyle = f.fill;
    ctx.fill();
  }
  ctx.strokeStyle = sel ? "#0066dd" : (f.color || "#333");
  ctx.lineWidth = Math.max((f.lw || 1) / Math.max(engine.cam.zoom, 0.2), 0.5);
  ctx.stroke();

  if (sel) {
    for (const p of pts) drawNode(ctx, p);
  }
  ctx.restore();
}

// ============================================================================
// zoomFit - ajustar cámara para mostrar todas las formas
// ============================================================================

export function zoomFit(engine: CadEngine): void {
  if (engine.formas.length === 0) {
    engine.cam.x = 0; engine.cam.y = 0; engine.cam.zoom = 1;
    return;
  }
  const bb = getBounds(engine);
  if (!bb) return;

  const margin = 20;
  const bw = bb.maxX - bb.minX;
  const bh = bb.maxY - bb.minY;
  if (bw < 0.01 && bh < 0.01) { engine.cam.zoom = 1; return; }

  const zx = (engine.canvasW - margin * 2) / (bw || 1);
  const zy = (engine.canvasH - margin * 2) / (bh || 1);
  engine.cam.zoom = Math.min(zx, zy);
  engine.cam.zoom = Math.max(engine.cam.minZoom, Math.min(engine.cam.maxZoom, engine.cam.zoom));
  engine.cam.x = (bb.minX + bb.maxX) / 2;
  engine.cam.y = (bb.minY + bb.maxY) / 2;
}

// ============================================================================
// getBounds - bounding box de todas las formas
// ============================================================================

export function getBounds(engine: CadEngine): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;

  const expand = (x: number, y: number) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    found = true;
  };

  // expand with 3D→2D projection when shape has is3d
  const expandPt = (x: number, y: number, z: number, is3d?: boolean) => {
    if (is3d && engine.projMode !== "2d") {
      const p = engine._proj(x, y, z, true);
      expand(p.x, p.y);
    } else {
      expand(x, y);
    }
  };

  const processShape = (f: CadShape) => {
    if (f.hidden) return;
    const fz = f.z || 0;
    switch (f.tipo) {
      case "linea":
        expandPt(f.x1!, f.y1!, f.z1 ?? fz, f.is3d);
        expandPt(f.x2!, f.y2!, f.z2 ?? fz, f.is3d);
        break;
      case "rectangulo":
        expand(f.x!, f.y!); expand(f.x! + f.w!, f.y! + f.h!); break;
      case "circulo":
        if (f.is3d) {
          const pc = engine._proj(f.cx!, f.cy!, fz, true);
          expand(pc.x - f.r!, pc.y - f.r!); expand(pc.x + f.r!, pc.y + f.r!);
        } else {
          expand(f.cx! - f.r!, f.cy! - f.r!); expand(f.cx! + f.r!, f.cy! + f.r!);
        }
        break;
      case "elipse":
        expand(f.cx! - f.rx!, f.cy! - f.ry!); expand(f.cx! + f.rx!, f.cy! + f.ry!); break;
      case "arco":
        expand(f.x1!, f.y1!); expand(f.x2!, f.y2!); expand(f.cx!, f.cy!); break;
      case "arco_circular":
        if (f.is3d) {
          const pa = engine._proj(f.cx!, f.cy!, fz, true);
          expand(pa.x - f.r!, pa.y - f.r!); expand(pa.x + f.r!, pa.y + f.r!);
        } else {
          expand(f.cx! - f.r!, f.cy! - f.r!); expand(f.cx! + f.r!, f.cy! + f.r!);
        }
        break;
      case "polilinea": case "mano":
        if (f.pts) {
          for (const p of f.pts) expandPt(p.x, p.y, p.z || fz, f.is3d);
        }
        break;
      case "cota":
        expand(f.x1!, f.y1!); expand(f.x2!, f.y2!); break;
      case "texto":
        expandPt(f.x!, f.y!, fz, f.is3d); break;
      case "flecha":
        expandPt(f.x1!, f.y1!, f.z1 ?? fz, f.is3d);
        expandPt(f.x2!, f.y2!, f.z2 ?? fz, f.is3d);
        break;
      case "rayado":
      case "poligono_relleno":
        if (f.pts) {
          for (const p of f.pts) expandPt(p.x, p.y, p.z || fz, f.is3d);
        }
        break;
      case "grupo":
        if (f.children) for (const c of f.children) processShape(c);
        break;
    }
  };

  for (const f of engine.formas) processShape(f);
  return found ? { minX, minY, maxX, maxY } : null;
}

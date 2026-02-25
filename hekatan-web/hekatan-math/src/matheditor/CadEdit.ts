/**
 * CadEdit.ts - API de edición del CAD
 * Funciones para manipular formas existentes (move, copy, rotate, mirror, etc.)
 */

import type { CadEngine } from "./CadEngine.js";
import type { CadShape } from "./CadTypes.js";

// ============================================================================
// moveShapeInternal - mover una forma en pixel coords (helper)
// ============================================================================

export function moveShapeInternal(engine: CadEngine, idx: number, ddx: number, ddy: number): void {
  const f = engine.formas[idx];
  if (!f) return;
  switch (f.tipo) {
    case "linea": f.x1! += ddx; f.y1! += ddy; f.x2! += ddx; f.y2! += ddy; break;
    case "rectangulo": f.x! += ddx; f.y! += ddy; break;
    case "circulo": case "elipse": case "arco_circular": f.cx! += ddx; f.cy! += ddy; break;
    case "arco": f.x1! += ddx; f.y1! += ddy; f.cx! += ddx; f.cy! += ddy; f.x2! += ddx; f.y2! += ddy; break;
    case "polilinea": case "mano":
      if (f.pts) for (const p of f.pts) { p.x += ddx; p.y += ddy; }
      break;
    case "cota": f.x1! += ddx; f.y1! += ddy; f.x2! += ddx; f.y2! += ddy; break;
    case "texto": f.x! += ddx; f.y! += ddy; break;
    case "flecha": f.x1! += ddx; f.y1! += ddy; f.x2! += ddx; f.y2! += ddy; break;
  }
}

// ============================================================================
// deleteShape
// ============================================================================

export function deleteShape(engine: CadEngine, idx: number): void {
  if (idx < 0 || idx >= engine.formas.length) return;
  engine.saveHist();
  engine.formas.splice(idx, 1);
  engine.formaSel = -1;
  engine.saveHist();
}

// ============================================================================
// moveShape - mover una o varias formas (user units)
// ============================================================================

export function moveShape(engine: CadEngine, idx: number | number[], dx: number, dy: number): void {
  if (Array.isArray(idx)) {
    engine.saveHist();
    for (const i of idx) moveShapeInternal(engine, i, engine.toPx(dx), engine.toPx(dy));
    engine.refresh();
    return;
  }
  if (idx < 0 || idx >= engine.formas.length) return;
  engine.saveHist();
  moveShapeInternal(engine, idx, engine.toPx(dx), engine.toPx(dy));
  engine.refresh();
}

// ============================================================================
// copyShape
// ============================================================================

export function copyShape(engine: CadEngine, idx: number, dx: number, dy: number): number {
  if (idx < 0 || idx >= engine.formas.length) return -1;
  const clone: CadShape = JSON.parse(JSON.stringify(engine.formas[idx]));
  engine.formas.push(clone);
  const newIdx = engine.formas.length - 1;
  moveShapeInternal(engine, newIdx, engine.toPx(dx), engine.toPx(dy));
  engine.refresh();
  return newIdx;
}

// ============================================================================
// rotateShape
// ============================================================================

export function rotateShape(engine: CadEngine, idx: number, cx: number, cy: number, angleDeg: number): void {
  if (idx < 0 || idx >= engine.formas.length) return;
  engine.saveHist();
  const f = engine.formas[idx];
  const pcx = engine.toPx(cx), pcy = engine.toPx(cy);
  const rad = angleDeg * Math.PI / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  const rot = (mx: number, my: number) => ({
    x: pcx + (mx - pcx) * cosA - (my - pcy) * sinA,
    y: pcy + (mx - pcx) * sinA + (my - pcy) * cosA,
  });

  if (f.tipo === "linea" || f.tipo === "flecha") {
    const r1 = rot(f.x1!, f.y1!), r2 = rot(f.x2!, f.y2!);
    f.x1 = r1.x; f.y1 = r1.y; f.x2 = r2.x; f.y2 = r2.y;
  } else if (f.tipo === "circulo" || f.tipo === "elipse" || f.tipo === "arco_circular") {
    const rc = rot(f.cx!, f.cy!); f.cx = rc.x; f.cy = rc.y;
  } else if (f.tipo === "texto") {
    const rt = rot(f.x!, f.y!); f.x = rt.x; f.y = rt.y;
  } else if ((f.tipo === "polilinea" || f.tipo === "mano") && f.pts) {
    for (const p of f.pts) { const rp = rot(p.x, p.y); p.x = rp.x; p.y = rp.y; }
  }
  engine.refresh();
}

// ============================================================================
// scaleShape
// ============================================================================

export function scaleShapeOp(engine: CadEngine, idx: number, factor: number, cx?: number, cy?: number): void {
  if (idx < 0 || idx >= engine.formas.length) return;
  engine.saveHist();
  const f = engine.formas[idx];
  const pcx = cx !== undefined ? engine.toPx(cx) : (f.cx ?? f.x ?? 0);
  const pcy = cy !== undefined ? engine.toPx(cy) : (f.cy ?? f.y ?? 0);
  const sc = (x: number, y: number) => ({ x: pcx + (x - pcx) * factor, y: pcy + (y - pcy) * factor });

  if (f.tipo === "linea" || f.tipo === "flecha") {
    const s1 = sc(f.x1!, f.y1!), s2 = sc(f.x2!, f.y2!);
    f.x1 = s1.x; f.y1 = s1.y; f.x2 = s2.x; f.y2 = s2.y;
  } else if (f.tipo === "texto") {
    const st = sc(f.x!, f.y!); f.x = st.x; f.y = st.y;
  } else if (f.tipo === "rectangulo") {
    const so = sc(f.x!, f.y!); f.x = so.x; f.y = so.y; f.w! *= factor; f.h! *= factor;
  } else if (f.tipo === "circulo") {
    const scc = sc(f.cx!, f.cy!); f.cx = scc.x; f.cy = scc.y; f.r! *= factor;
  } else if (f.tipo === "elipse") {
    const se = sc(f.cx!, f.cy!); f.cx = se.x; f.cy = se.y; f.rx! *= factor; f.ry! *= factor;
  } else if ((f.tipo === "polilinea" || f.tipo === "mano") && f.pts) {
    for (const p of f.pts) { const sp = sc(p.x, p.y); p.x = sp.x; p.y = sp.y; }
  }
  engine.refresh();
}

// ============================================================================
// mirrorShape
// ============================================================================

export function mirrorShape(engine: CadEngine, idx: number, ax1: number, ay1: number, ax2: number, ay2: number): number {
  if (idx < 0 || idx >= engine.formas.length) return -1;
  const clone: CadShape = JSON.parse(JSON.stringify(engine.formas[idx]));
  const pax1 = engine.toPx(ax1), pay1 = engine.toPx(ay1), pax2 = engine.toPx(ax2), pay2 = engine.toPx(ay2);
  const adx = pax2 - pax1, ady = pay2 - pay1, alen2 = adx * adx + ady * ady;
  const mirPt = (mx: number, my: number) => {
    const t = ((mx - pax1) * adx + (my - pay1) * ady) / alen2;
    return { x: 2 * (pax1 + t * adx) - mx, y: 2 * (pay1 + t * ady) - my };
  };

  if (clone.tipo === "linea" || clone.tipo === "flecha") {
    const m1 = mirPt(clone.x1!, clone.y1!), m2 = mirPt(clone.x2!, clone.y2!);
    clone.x1 = m1.x; clone.y1 = m1.y; clone.x2 = m2.x; clone.y2 = m2.y;
  } else if (clone.tipo === "texto") {
    const mt = mirPt(clone.x!, clone.y!); clone.x = mt.x; clone.y = mt.y;
  } else if (clone.tipo === "circulo" || clone.tipo === "elipse" || clone.tipo === "arco_circular") {
    const mc = mirPt(clone.cx!, clone.cy!); clone.cx = mc.x; clone.cy = mc.y;
  } else if ((clone.tipo === "polilinea" || clone.tipo === "mano") && clone.pts) {
    for (const p of clone.pts) { const mp = mirPt(p.x, p.y); p.x = mp.x; p.y = mp.y; }
  }
  engine.formas.push(clone);
  engine.refresh();
  return engine.formas.length - 1;
}

// ============================================================================
// arrayShape - rectangular array
// ============================================================================

export function arrayShape(engine: CadEngine, idx: number | number[], nx: number, ny: number, dx: number, dy: number): number[] {
  const indices = Array.isArray(idx) ? idx : [idx];
  const newIds: number[] = [];
  engine.saveHist();
  engine.beginBatch();
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      if (ix === 0 && iy === 0) continue;
      for (const k of indices) newIds.push(copyShape(engine, k, ix * dx, iy * dy));
    }
  }
  engine.endBatch();
  return newIds;
}

// ============================================================================
// polarArrayShape
// ============================================================================

export function polarArrayShape(engine: CadEngine, idx: number | number[], n: number, cx: number, cy: number, totalAngle = 360): number[] {
  const indices = Array.isArray(idx) ? idx : [idx];
  const newIds: number[] = [];
  const step = totalAngle / n;
  engine.saveHist();
  engine.beginBatch();
  for (let i = 1; i < n; i++) {
    for (const k of indices) {
      const clone: CadShape = JSON.parse(JSON.stringify(engine.formas[k]));
      engine.formas.push(clone);
      const ni = engine.formas.length - 1;
      rotateShape(engine, ni, cx, cy, step * i);
      newIds.push(ni);
    }
  }
  engine.endBatch();
  return newIds;
}

// ============================================================================
// groupShapes / ungroupShape
// ============================================================================

export function groupShapes(engine: CadEngine, indices: number[]): number {
  if (!indices || indices.length < 2) return -1;
  const children: CadShape[] = [];
  for (const i of indices) {
    if (i >= 0 && i < engine.formas.length) children.push(JSON.parse(JSON.stringify(engine.formas[i])));
  }
  const sorted = indices.slice().sort((a, b) => b - a);
  for (const j of sorted) {
    if (j >= 0 && j < engine.formas.length) engine.formas.splice(j, 1);
  }
  engine.formas.push({ tipo: "grupo", color: "#333", z: 0, children });
  engine.refresh();
  return engine.formas.length - 1;
}

export function ungroupShape(engine: CadEngine, idx: number): void {
  if (idx < 0 || idx >= engine.formas.length || engine.formas[idx].tipo !== "grupo") return;
  const ch = engine.formas[idx].children!;
  engine.formas.splice(idx, 1);
  for (const c of ch) engine.formas.push(c);
  engine.refresh();
}

/**
 * Draw3DFlat.ts - Formas planas en espacio 3D (rect, circle, ellipse, arc, rrect)
 * Renderiza como lineas o meshes planos en Three.js.
 * plane: "xz" (default, suelo), "xy" (frontal), "yz" (lateral)
 */
import * as THREE from "three";
import type { Draw3DShape } from "./Draw3DTypes.js";

const DEG = Math.PI / 180;

/** Rectangulo 3D como 4 lineas en un plano */
export function renderRect3D(scene: THREE.Scene, s: Draw3DShape): void {
  const w = s.w || 1, h = s.h || 1;
  const pts = rectPoints(s.x, s.y, s.z, w, h, s.plane);
  const color = new THREE.Color(s.color || "#4488ff");

  if (s.fill) {
    // Mesh plano con fill
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.fill), side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    positionPlane(mesh, s.x + w / 2, s.y, s.z + h / 2, s.plane);
    scene.add(mesh);
  }

  // Bordes
  pts.push(pts[0].clone()); // cerrar
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

/** Circulo 3D como anillo de lineas en un plano */
export function renderCircle3D(scene: THREE.Scene, s: Draw3DShape): void {
  const r = s.r || 1;
  const color = new THREE.Color(s.color || "#4488ff");
  const segs = 48;
  const pts: THREE.Vector3[] = [];

  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(planePoint(s.x, s.y, s.z, Math.cos(a) * r, Math.sin(a) * r, s.plane));
  }

  if (s.fill) {
    const geo = new THREE.CircleGeometry(r, segs);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.fill), side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    positionPlane(mesh, s.x, s.y, s.z, s.plane);
    scene.add(mesh);
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

/** Elipse 3D como curva de lineas */
export function renderEllipse3D(scene: THREE.Scene, s: Draw3DShape): void {
  const rx = s.rx || 1, ry = s.ry || 0.5;
  const color = new THREE.Color(s.color || "#4488ff");
  const segs = 48;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(planePoint(s.x, s.y, s.z, Math.cos(a) * rx, Math.sin(a) * ry, s.plane));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

/** Arco 3D: porcion de circulo */
export function renderArc3D(scene: THREE.Scene, s: Draw3DShape): void {
  const r = s.r || 1;
  const start = (s.startAngle || 0) * DEG;
  const end = (s.endAngle || 180) * DEG;
  const color = new THREE.Color(s.color || "#4488ff");
  const segs = 32;
  const range = end - start;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = start + (i / segs) * range;
    pts.push(planePoint(s.x, s.y, s.z, Math.cos(a) * r, Math.sin(a) * r, s.plane));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

/** Rectangulo redondeado 3D */
export function renderRRect3D(scene: THREE.Scene, s: Draw3DShape): void {
  const w = s.w || 1, h = s.h || 1, cr = Math.min(s.r || 0, w / 2, h / 2);
  const color = new THREE.Color(s.color || "#4488ff");
  const pts: THREE.Vector3[] = [];

  // Esquinas con arcos
  const corners = [
    { cx: cr, cy: cr, a0: Math.PI, a1: 1.5 * Math.PI },
    { cx: w - cr, cy: cr, a0: 1.5 * Math.PI, a1: 2 * Math.PI },
    { cx: w - cr, cy: h - cr, a0: 0, a1: 0.5 * Math.PI },
    { cx: cr, cy: h - cr, a0: 0.5 * Math.PI, a1: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= 8; i++) {
      const a = c.a0 + (i / 8) * (c.a1 - c.a0);
      pts.push(planePoint(s.x, s.y, s.z, c.cx + Math.cos(a) * cr, c.cy + Math.sin(a) * cr, s.plane));
    }
  }
  pts.push(pts[0].clone()); // cerrar

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

// ── Helpers de plano ──

/** Genera un punto 3D en el plano especificado, offset du,dv desde origen */
function planePoint(ox: number, oy: number, oz: number, du: number, dv: number, plane?: string): THREE.Vector3 {
  if (plane === "xy") return new THREE.Vector3(ox + du, oy + dv, oz);
  if (plane === "yz") return new THREE.Vector3(ox, oy + dv, oz + du);
  return new THREE.Vector3(ox + du, oy, oz + dv); // xz default (suelo)
}

function rectPoints(ox: number, oy: number, oz: number, w: number, h: number, plane?: string): THREE.Vector3[] {
  return [
    planePoint(ox, oy, oz, 0, 0, plane),
    planePoint(ox, oy, oz, w, 0, plane),
    planePoint(ox, oy, oz, w, h, plane),
    planePoint(ox, oy, oz, 0, h, plane),
  ];
}

function positionPlane(mesh: THREE.Mesh, cx: number, cy: number, cz: number, plane?: string): void {
  if (plane === "xy") { mesh.position.set(cx, cy, cz); }
  else if (plane === "yz") { mesh.position.set(cx, cy, cz); mesh.rotation.y = Math.PI / 2; }
  else { mesh.position.set(cx, cy, cz); mesh.rotation.x = -Math.PI / 2; }
}

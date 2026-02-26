/**
 * Draw3DLines.ts - Lineas, flechas, polilineas y cotas en Three.js
 * Equivalente 3D de las funciones de CadDraw.ts para lineas.
 */
import * as THREE from "three";
import type { Draw3DShape } from "./Draw3DTypes.js";

/** Linea 3D entre dos puntos */
export function renderLine3D(scene: THREE.Scene, s: Draw3DShape): void {
  const pts = [
    new THREE.Vector3(s.x, s.y, s.z),
    new THREE.Vector3(s.x2 ?? 0, s.y2 ?? 0, s.z2 ?? 0),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: s.color || "#4488ff", linewidth: s.lw || 1 });
  scene.add(new THREE.Line(geo, mat));
}

/** Flecha 3D: linea + cono en el extremo */
export function renderArrow3D(scene: THREE.Scene, s: Draw3DShape): void {
  const from = new THREE.Vector3(s.x, s.y, s.z);
  const to = new THREE.Vector3(s.x2 ?? 0, s.y2 ?? 0, s.z2 ?? 0);
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 0.001) return;

  const color = new THREE.Color(s.color || "#4488ff");

  // Linea (shaft)
  const shaftLen = len * 0.85;
  const shaftEnd = from.clone().add(dir.clone().normalize().multiplyScalar(shaftLen));
  const lineGeo = new THREE.BufferGeometry().setFromPoints([from, shaftEnd]);
  scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color })));

  // Cono (head)
  const headLen = len * 0.15;
  const headR = headLen * 0.35;
  const coneGeo = new THREE.ConeGeometry(headR, headLen, 8);
  const coneMat = new THREE.MeshStandardMaterial({ color });
  const cone = new THREE.Mesh(coneGeo, coneMat);

  // Posicionar y rotar cono
  cone.position.copy(to.clone().sub(dir.clone().normalize().multiplyScalar(headLen / 2)));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(cone);
}

/** Polilinea 3D: puntos [x,y,z, x,y,z, ...] */
export function renderPline3D(scene: THREE.Scene, s: Draw3DShape): void {
  if (!s.pts || s.pts.length < 6) return;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < s.pts.length - 2; i += 3) {
    points.push(new THREE.Vector3(s.pts[i], s.pts[i + 1], s.pts[i + 2]));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: s.color || "#4488ff", linewidth: s.lw || 1 });
  scene.add(new THREE.Line(geo, mat));
}

/** Cota 3D: dos flechas opuestas + texto en el medio */
export function renderDim3D(scene: THREE.Scene, s: Draw3DShape): void {
  const p1 = new THREE.Vector3(s.x, s.y, s.z);
  const p2 = new THREE.Vector3(s.x2 ?? 0, s.y2 ?? 0, s.z2 ?? 0);
  const off = s.offset || 1;
  const color = new THREE.Color(s.color || "#666666");

  // Direccion y normal para offset
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  if (len < 0.001) return;
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (perp.length() < 0.001) perp.set(0, 0, 1);
  perp.multiplyScalar(off);

  const d1 = p1.clone().add(perp);
  const d2 = p2.clone().add(perp);

  // Linea de cota
  const lineGeo = new THREE.BufferGeometry().setFromPoints([d1, d2]);
  scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color })));

  // Extension lines
  const ext1 = new THREE.BufferGeometry().setFromPoints([p1, d1]);
  const ext2 = new THREE.BufferGeometry().setFromPoints([p2, d2]);
  const extMat = new THREE.LineBasicMaterial({ color, linewidth: 1 });
  scene.add(new THREE.Line(ext1, extMat));
  scene.add(new THREE.Line(ext2, extMat));

  // Texto en el medio
  const mid = d1.clone().add(d2).multiplyScalar(0.5);
  mid.y += 0.3;
  const txt = s.text || len.toFixed(2);
  addDimText(scene, mid, txt, s.color || "#666666");
}

/** Sprite de texto para cotas */
function addDimText(scene: THREE.Scene, pos: THREE.Vector3, txt: string, color: string): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 36px sans-serif";
  const w = Math.ceil(ctx.measureText(txt).width) + 6;
  canvas.width = w; canvas.height = 44;
  ctx.font = "bold 36px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = color;
  ctx.fillText(txt, 3, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(pos);
  sprite.scale.set(w / 35, 44 / 35, 1);
  scene.add(sprite);
}

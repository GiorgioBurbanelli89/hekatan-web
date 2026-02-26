/**
 * Draw3DRender.ts - Renderiza shapes 3D en escena Three.js
 * Solidos: box, cylinder, sphere, cone.
 * Delega lineas/flechas a Draw3DLines.ts, planos a Draw3DFlat.ts.
 */
import * as THREE from "three";
import type { Draw3DShape } from "./Draw3DTypes.js";
import { renderLine3D, renderArrow3D, renderPline3D, renderDim3D } from "./Draw3DLines.js";
import { renderRect3D, renderCircle3D, renderEllipse3D, renderArc3D, renderRRect3D } from "./Draw3DFlat.js";

const DEG = Math.PI / 180;

/** Agrega todas las shapes a la escena */
export function addShapesToScene(scene: THREE.Scene, shapes: Draw3DShape[]): void {
  for (const s of shapes) {
    const c = new THREE.Color(s.color || "#4488ff");
    switch (s.type) {
      case "box": addBox(scene, s, c); break;
      case "cylinder": case "cone": addCylinder(scene, s, c); break;
      case "sphere": addSphere(scene, s, c); break;
      case "line": renderLine3D(scene, s); break;
      case "arrow": renderArrow3D(scene, s); break;
      case "pline": renderPline3D(scene, s); break;
      case "dim": renderDim3D(scene, s); break;
      case "rect": renderRect3D(scene, s); break;
      case "circle": renderCircle3D(scene, s); break;
      case "ellipse": renderEllipse3D(scene, s); break;
      case "arc": renderArc3D(scene, s); break;
      case "rrect": renderRRect3D(scene, s); break;
      case "text": addText(scene, s); break;
    }
  }
}

// ── Box ──
function addBox(scene: THREE.Scene, s: Draw3DShape, c: THREE.Color): void {
  const geo = new THREE.BoxGeometry(s.w || 1, s.h || 1, s.d || 1);
  const mat = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, s.y, s.z);
  applyRot(mesh, s);
  scene.add(mesh);
  // Wireframe edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x333333 }));
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  scene.add(edges);
}

// ── Cylinder / Cone ──
function addCylinder(scene: THREE.Scene, s: Draw3DShape, c: THREE.Color): void {
  const rTop = s.type === "cone" ? (s.r2 ?? 0) : (s.r || 0.5);
  const rBot = s.r || 0.5;
  const h = s.h || 1;
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 24);
  const mat = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, s.y, s.z);
  applyRot(mesh, s);
  scene.add(mesh);
}

// ── Sphere ──
function addSphere(scene: THREE.Scene, s: Draw3DShape, c: THREE.Color): void {
  const geo = new THREE.SphereGeometry(s.r || 0.5, 24, 16);
  const mat = new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, s.y, s.z);
  scene.add(mesh);
}

// ── Text sprite ──
function addText(scene: THREE.Scene, s: Draw3DShape): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const fs = s.fontSize || 48;
  ctx.font = `bold ${fs}px sans-serif`;
  const metrics = ctx.measureText(s.text || "");
  canvas.width = Math.ceil(metrics.width) + 8;
  canvas.height = fs + 8;
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.fillStyle = s.color || "#333333";
  ctx.fillText(s.text || "", 4, fs);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(s.x, s.y, s.z);
  sprite.scale.set(canvas.width / 40, canvas.height / 40, 1);
  scene.add(sprite);
}

function applyRot(mesh: THREE.Object3D, s: Draw3DShape): void {
  if (s.rotX || s.rotY || s.rotZ) {
    mesh.rotation.set((s.rotX||0)*DEG, (s.rotY||0)*DEG, (s.rotZ||0)*DEG);
  }
}

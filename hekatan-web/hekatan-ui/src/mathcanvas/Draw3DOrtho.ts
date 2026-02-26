/**
 * Draw3DOrtho.ts - Vistas ortograficas 2D desde escena Three.js
 * Renderiza front (XY), side (ZY), top (XZ) como canvas 2D.
 * Usa camara ortografica de Three.js para capturar snapshots.
 */
import * as THREE from "three";

export type OrthoView = "front" | "side" | "top";

const VIEW_CONFIG: Record<OrthoView, { pos: [number, number, number]; up: [number, number, number]; label: string }> = {
  front: { pos: [0, 0, 100], up: [0, 1, 0], label: "Vista Frontal (XY)" },
  side:  { pos: [100, 0, 0], up: [0, 1, 0], label: "Vista Lateral (ZY)" },
  top:   { pos: [0, 100, 0], up: [0, 0, -1], label: "Vista en Planta (XZ)" },
};

/** Renderiza una vista ortografica de la escena en un canvas 2D */
export function renderOrthoView(
  scene: THREE.Scene,
  view: OrthoView,
  width: number,
  height: number,
): HTMLCanvasElement {
  const cfg = VIEW_CONFIG[view];

  // Calcular bounding box de la escena (solo meshes y lineas)
  const box = new THREE.Box3();
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
      box.expandByObject(obj);
    }
  });

  // Si no hay objetos, usar un rango default
  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10));
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Calcular frustum ortografico segun la vista
  let halfW: number, halfH: number;
  if (view === "front") {
    halfW = size.x / 2 + 2;
    halfH = size.y / 2 + 2;
  } else if (view === "side") {
    halfW = size.z / 2 + 2;
    halfH = size.y / 2 + 2;
  } else {
    halfW = size.x / 2 + 2;
    halfH = size.z / 2 + 2;
  }

  // Ajustar aspect ratio
  const aspect = width / height;
  if (halfW / halfH > aspect) {
    halfH = halfW / aspect;
  } else {
    halfW = halfH * aspect;
  }

  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 500);
  cam.position.set(
    center.x + cfg.pos[0],
    center.y + cfg.pos[1],
    center.z + cfg.pos[2],
  );
  cam.up.set(cfg.up[0], cfg.up[1], cfg.up[2]);
  cam.lookAt(center);
  cam.updateProjectionMatrix();

  // Renderer offscreen
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);

  // Fondo blanco para vistas 2D
  const origBg = scene.background;
  scene.background = new THREE.Color(0xffffff);

  // Ocultar grid y axes helpers para vistas limpias
  const hidden: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if ((obj as any).isGridHelper || (obj as any).isAxesHelper) {
      if (obj.visible) { obj.visible = false; hidden.push(obj); }
    }
  });

  renderer.render(scene, cam);

  // Restaurar
  scene.background = origBg;
  for (const h of hidden) h.visible = true;

  // Copiar a canvas 2D con etiqueta
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext("2d")!;

  // Dibujar render
  ctx.drawImage(renderer.domElement, 0, 0);

  // Borde y etiqueta
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, 0, width, 22);
  ctx.fillStyle = "#333";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(cfg.label, 6, 15);

  // Ejes indicadores (esquina inferior izquierda)
  drawAxesIndicator(ctx, view, width, height);

  renderer.dispose();
  return outCanvas;
}

/** Dibuja flechas de ejes en esquina inferior-izquierda */
function drawAxesIndicator(ctx: CanvasRenderingContext2D, view: OrthoView, w: number, h: number) {
  const ox = 30, oy = h - 30, len = 20;
  ctx.lineWidth = 1.5;

  let hLabel: string, vLabel: string;
  let hColor: string, vColor: string;

  if (view === "front") {
    hLabel = "X"; vLabel = "Y"; hColor = "#cc3333"; vColor = "#33aa33";
  } else if (view === "side") {
    hLabel = "Z"; vLabel = "Y"; hColor = "#3333cc"; vColor = "#33aa33";
  } else {
    hLabel = "X"; vLabel = "Z"; hColor = "#cc3333"; vColor = "#3333cc";
  }

  // Horizontal →
  ctx.strokeStyle = hColor;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + len, oy); ctx.stroke();
  ctx.fillStyle = hColor;
  ctx.font = "bold 10px sans-serif";
  ctx.fillText(hLabel, ox + len + 2, oy + 4);

  // Vertical ↑
  ctx.strokeStyle = vColor;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - len); ctx.stroke();
  ctx.fillStyle = vColor;
  ctx.fillText(vLabel, ox - 4, oy - len - 3);
}

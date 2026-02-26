/**
 * Draw3DScene.ts - Creacion de escena Three.js para @{draw:3D}
 * Camera, renderer, OrbitControls, luces, grid, ejes.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Draw3DScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  dispose: () => void;
}

/** Crea escena Three.js dentro de un contenedor DOM */
export function createScene(container: HTMLElement, w: number, h: number): Draw3DScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
  camera.position.set(30, 20, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Luces
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 15);
  scene.add(dir);

  // Grid
  scene.add(new THREE.GridHelper(40, 20, 0xcccccc, 0xe0e0e0));

  // Ejes con flechas y etiquetas X, Y, Z
  addLabeledAxes(scene);

  // Animation loop
  let rafId = 0;
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const dispose = () => {
    cancelAnimationFrame(rafId);
    controls.dispose();
    renderer.dispose();
    renderer.domElement.parentElement?.removeChild(renderer.domElement);
  };

  return { renderer, scene, camera, controls, dispose };
}

/** Ejes con flechas y etiquetas X(rojo), Y(verde), Z(azul) */
function addLabeledAxes(scene: THREE.Scene): void {
  const len = 8;
  const axes: [THREE.Vector3, number, string][] = [
    [new THREE.Vector3(1, 0, 0), 0xcc3333, "X"],
    [new THREE.Vector3(0, 1, 0), 0x33aa33, "Y"],
    [new THREE.Vector3(0, 0, 1), 0x3333cc, "Z"],
  ];
  for (const [dir, hex, label] of axes) {
    const color = new THREE.Color(hex);
    // Linea del eje
    const pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(len)];
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color })
    ));
    // Cono (flecha)
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.5, 8),
      new THREE.MeshStandardMaterial({ color })
    );
    cone.position.copy(dir.clone().multiplyScalar(len + 0.25));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(cone);
    // Etiqueta texto
    const canvas = document.createElement("canvas");
    canvas.width = 48; canvas.height = 48;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "bold 38px sans-serif";
    ctx.fillStyle = `#${hex.toString(16).padStart(6, "0")}`;
    ctx.textAlign = "center";
    ctx.fillText(label, 24, 36);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    sprite.position.copy(dir.clone().multiplyScalar(len + 1.2));
    sprite.scale.set(1.2, 1.2, 1);
    scene.add(sprite);
  }
  // Marcas de coordenadas en cada eje (cada 2 unidades)
  for (const [dir, hex] of axes) {
    const color = new THREE.Color(hex);
    for (let i = 2; i <= len; i += 2) {
      const p = dir.clone().multiplyScalar(i);
      // Tick mark
      const tickSize = 0.12;
      const perp = dir.x ? new THREE.Vector3(0, tickSize, 0) : new THREE.Vector3(tickSize, 0, 0);
      const t1 = p.clone().add(perp), t2 = p.clone().sub(perp);
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([t1, t2]),
        new THREE.LineBasicMaterial({ color })
      ));
      // Numero
      const nc = document.createElement("canvas");
      nc.width = 40; nc.height = 28;
      const nctx = nc.getContext("2d")!;
      nctx.font = "bold 22px sans-serif";
      nctx.fillStyle = `#${hex.toString(16).padStart(6, "0")}`;
      nctx.textAlign = "center";
      nctx.fillText(String(i), 20, 22);
      const ntex = new THREE.CanvasTexture(nc);
      const ns = new THREE.Sprite(new THREE.SpriteMaterial({ map: ntex }));
      ns.position.copy(p.clone().add(dir.x ? new THREE.Vector3(0, -0.5, 0) : dir.y ? new THREE.Vector3(-0.5, 0, 0) : new THREE.Vector3(0, -0.5, 0)));
      ns.scale.set(0.7, 0.5, 1);
      scene.add(ns);
    }
  }
}

// ====== VISOR 3D CON THREE.JS ======
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Point3D, Element } from '../geometry/types';
import type { ElementForce } from '../solver/types';

export interface ViewerState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  groups: {
    elements: THREE.Group;
    nodes: THREE.Group;
    loads: THREE.Group;
    supports: THREE.Group;
    deformed: THREE.Group;
  };
}

/** Inicializa el visor Three.js en el container dado */
export function createViewer(container: HTMLElement): ViewerState {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f23);

  const w = container.clientWidth;
  const h = container.clientHeight;

  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
  camera.position.set(5, 4, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(5, 1.5, 0);

  // Grilla
  scene.add(new THREE.GridHelper(20, 20, 0x333355, 0x222244));
  // Ejes
  scene.add(new THREE.AxesHelper(1.5));
  // Luces
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // Grupos
  const groups = {
    elements: new THREE.Group(),
    nodes: new THREE.Group(),
    loads: new THREE.Group(),
    supports: new THREE.Group(),
    deformed: new THREE.Group(),
  };
  Object.values(groups).forEach(g => scene.add(g));

  // Resize handler
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  return { scene, camera, renderer, controls, groups };
}

/** Limpia todos los hijos de un grupo */
function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const obj = group.children[0] as THREE.Mesh;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material).dispose();
    }
    group.remove(obj);
  }
}

/** Dibuja la estructura completa */
export function drawStructure(
  viewer: ViewerState,
  nodes: Point3D[],
  elements: Element[],
  forces: ElementForce[],
  divisions: number
): void {
  const { groups } = viewer;
  Object.values(groups).forEach(clearGroup);

  // ELEMENTOS (cilindros con color segun fuerza)
  for (let i = 0; i < elements.length; i++) {
    const [a, b] = elements[i];
    const f = forces[i]?.force ?? 0;

    const color = f > 0
      ? new THREE.Color(0x3b82f6)   // traccion azul
      : f < 0
        ? new THREE.Color(0xef4444) // compresion rojo
        : new THREE.Color(0x888888);

    const pA = new THREE.Vector3(...nodes[a]);
    const pB = new THREE.Vector3(...nodes[b]);
    const mid = pA.clone().add(pB).multiplyScalar(0.5);
    const dir = pB.clone().sub(pA);
    const L = dir.length();

    const cylGeo = new THREE.CylinderGeometry(0.03, 0.03, L, 6);
    const cylMat = new THREE.MeshPhongMaterial({ color });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.copy(mid);
    cyl.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize()
    );
    groups.elements.add(cyl);
  }

  // NODOS (esferas amarillas)
  const sphereGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const sphereMat = new THREE.MeshPhongMaterial({ color: 0xfbbf24 });
  for (const node of nodes) {
    const s = new THREE.Mesh(sphereGeo, sphereMat);
    s.position.set(...node);
    groups.nodes.add(s);
  }

  // CARGAS (flechas en nodos superiores)
  for (const node of nodes) {
    if (node[1] > 0) {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(node[0], node[1] + 0.9, node[2]),
        0.8, 0x22c55e, 0.2, 0.12
      );
      groups.loads.add(arrow);
    }
  }

  // APOYOS
  const triGeo = new THREE.ConeGeometry(0.15, 0.25, 3);

  const tri1 = new THREE.Mesh(triGeo, new THREE.MeshPhongMaterial({ color: 0xf97316 }));
  tri1.position.set(nodes[0][0], -0.15, 0);
  tri1.rotation.z = Math.PI;
  groups.supports.add(tri1);

  const tri2 = new THREE.Mesh(triGeo.clone(), new THREE.MeshPhongMaterial({ color: 0xf97316 }));
  tri2.position.set(nodes[divisions][0], -0.15, 0);
  tri2.rotation.z = Math.PI;
  groups.supports.add(tri2);
}

/** Dibuja la forma deformada */
export function drawDeformed(
  viewer: ViewerState,
  nodes: Point3D[],
  elements: Element[],
  deformed: Point3D[],
  scale: number
): void {
  clearGroup(viewer.groups.deformed);

  for (const [a, b] of elements) {
    const pA = deformed[a];
    const pB = deformed[b];

    const vA = new THREE.Vector3(
      pA[0], nodes[a][1] + (pA[1] - nodes[a][1]) * scale, pA[2]
    );
    const vB = new THREE.Vector3(
      pB[0], nodes[b][1] + (pB[1] - nodes[b][1]) * scale, pB[2]
    );

    const geo = new THREE.BufferGeometry().setFromPoints([vA, vB]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xa855f7, transparent: true, opacity: 0.7
    });
    viewer.groups.deformed.add(new THREE.Line(geo, mat));
  }
}

/** Loop de animacion */
export function startAnimation(viewer: ViewerState): void {
  function animate() {
    requestAnimationFrame(animate);
    viewer.controls.update();
    viewer.renderer.render(viewer.scene, viewer.camera);
  }
  animate();
}

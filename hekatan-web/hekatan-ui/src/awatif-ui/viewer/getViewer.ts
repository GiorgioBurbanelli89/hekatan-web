import * as THREE from "three";
import van, { State } from "vanjs-core";
import { Node, Mesh } from "awatif-fem";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Settings,
  SettingsObj,
  getDefaultSettings,
  getSettings,
} from "./settings/getSettings";
import { nodes } from "./objects/nodes";
import { elements } from "./objects/elements";
import { grid } from "./objects/grid";
import { supports } from "./objects/supports";
import { loads } from "./objects/loads";
import { nodesIndexes } from "./objects/nodesIndexes";
import { elementsIndexes } from "./objects/elementsIndexes";
import { axes } from "./objects/axes";
import { orientations } from "./objects/orientations";
import { frameResults } from "./objects/frameResults";
import { nodeResults } from "./objects/nodeResults";
import { drawing, Drawing } from "./drawing/drawing";
import { shellResults } from "./objects/shellResults";

import "./styles.css";
import { getLegend } from "../color-map/getLegend";

export interface ViewerContext3D {
  scene: THREE.Scene;
  perspCamera: THREE.PerspectiveCamera;
  orthoCamera: THREE.OrthographicCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  render: () => void;
  setActiveCamera: (cam: THREE.Camera) => void;
}

export function getViewer({
  mesh,
  settingsObj,
  drawingObj,
  objects3D,
  solids,
}: {
  mesh?: Mesh;
  settingsObj?: SettingsObj;
  drawingObj?: Drawing;
  objects3D?: State<THREE.Object3D[]>;
  solids?: State<THREE.Object3D[]>;
}): HTMLDivElement {
  // init
  THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

  const viewerElm = document.createElement("div");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    1,
    0.1,
    2 * 1e6 // supported view till 1e6
  );
  const orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 2e6);
  let activeCamera: THREE.Camera = camera;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.localClippingEnabled = true;
  const controls = new OrbitControls(camera, renderer.domElement);

  const settings = getDefaultSettings(settingsObj);
  const derivedDisplayScale = van.derive(() =>
    settings.displayScale.val === 0
      ? 1
      : settings.displayScale.val > 0
      ? settings.displayScale.val
      : -1 / settings.displayScale.val
  );
  const derivedNodes = deriveNodes(mesh, settings);
  const gridObj = grid(settings.gridSize.rawVal);

  // update
  viewerElm.appendChild(getSettings(settings, mesh, solids));

  viewerElm.setAttribute("id", "viewer");
  viewerElm.appendChild(renderer.domElement);

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 1);

  const gridSize = settings.gridSize.rawVal;
  const z2fit = gridSize * 0.5 + (gridSize * 0.5) / Math.tan(45 * 0.5);
  camera.position.set(0.5 * gridSize, 0.8 * -z2fit, 0.5 * gridSize);
  controls.target.set(0.5 * gridSize, 0.5 * gridSize, 0);
  controls.minDistance = 1;
  controls.maxDistance = z2fit * 2.5;
  controls.zoomSpeed = 10;
  controls.update();

  scene.add(gridObj, axes(settings.gridSize.rawVal, settings.flipAxes.rawVal));

  // Events
  // on size change
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const width = entry.target?.clientWidth;
      const height = entry.target?.clientHeight;
      if (width === 0 || height === 0) continue;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const aspect = width / height;
      const frustumHalf = orthoCamera.top;
      orthoCamera.left = -frustumHalf * aspect;
      orthoCamera.right = frustumHalf * aspect;
      orthoCamera.updateProjectionMatrix();

      renderer.setSize(width, height);
      viewerRender();
    }
  });
  resizeObserver.observe(viewerElm);

  // on controls change
  controls.addEventListener("change", viewerRender);

  // on mesh or settings change: render
  van.derive(() => {
    mesh?.nodes?.val;
    mesh?.elements?.val;
    mesh?.nodeInputs?.val;
    mesh?.elementInputs?.val;
    mesh?.deformOutputs?.val;
    mesh?.analyzeOutputs?.val;

    settings.displayScale.val;
    settings.nodes.val;
    settings.elements.val;
    settings.nodesIndexes.val;
    settings.elementsIndexes.val;
    settings.orientations.val;
    settings.supports.val;
    settings.loads.val;
    settings.deformedShape.val;
    settings.nodeResults.val;
    settings.frameResults.val;
    settings.shellResults.val;

    setTimeout(viewerRender); // setTimeout to ensure render is called after all updates are done in that event tick
  });

  // Object's functions (Actions)
  function viewerRender() {
    renderer.render(scene, activeCamera);
  }

  function setActiveCamera(cam: THREE.Camera) {
    activeCamera = cam;
    controls.object = cam;
    controls.update();
    viewerRender();
  }

  // Optional inputs
  if (mesh) {
    // 3D objects
    scene.add(
      nodes(settings, derivedNodes, derivedDisplayScale),
      elements(mesh, settings, derivedNodes),
      nodesIndexes(settings, derivedNodes, derivedDisplayScale),
      elementsIndexes(mesh, settings, derivedNodes, derivedDisplayScale),
      supports(mesh, settings, derivedNodes, derivedDisplayScale),
      loads(mesh, settings, derivedNodes, derivedDisplayScale),
      orientations(mesh, settings, derivedNodes, derivedDisplayScale),
      nodeResults(mesh, settings, derivedNodes, derivedDisplayScale),
      frameResults(mesh, settings, derivedNodes, derivedDisplayScale)
    );

    // Color map
    const colorMapValues = getColorMapValues(mesh, settings);
    const shellResultsObj = shellResults(
      mesh,
      settings,
      derivedNodes,
      colorMapValues
    );
    const legend = getLegend(colorMapValues);

    scene.add(shellResultsObj);
    viewerElm.appendChild(legend);

    van.derive(() => {
      legend.hidden = settings.shellResults.val == "none";
      shellResultsObj.visible = settings.shellResults.val != "none";
    });
  }

  if (solids) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const light1 = new THREE.DirectionalLight(0xffffff, 0.5);
    light1.position.set(30, 25, -10);
    light1.shadow.mapSize.width = 1024;
    light1.shadow.mapSize.height = 1024;
    scene.add(light1);

    const d = 10;
    light1.shadow.camera.left = -d;
    light1.shadow.camera.right = d;
    light1.shadow.camera.top = d;
    light1.shadow.camera.bottom = -d;
    light1.shadow.camera.far = 1000;

    const light2 = new THREE.DirectionalLight(0xffffff, 0.5);
    light2.color.setHSL(11, 43, 96);
    light2.position.set(-10, 0, 30);
    scene.add(light2);

    // Events: on solids change add/remove objects from the scene
    van.derive(() => {
      if (!solids?.val.length) return;

      scene.remove(...solids.oldVal);

      scene.add(...solids.rawVal);

      viewerRender();
    });

    // Events: on solids settings change update visibility
    van.derive(() => {
      solids.rawVal.forEach((solid) => (solid.visible = settings.solids.val));

      viewerRender();
    });
  }

  if (objects3D) {
    // Events: on objects3D change add/remove objects from the scene
    van.derive(() => {
      if (!objects3D?.val.length) return;

      scene.remove(...objects3D.oldVal);

      scene.add(...objects3D.rawVal);

      viewerRender();
    });
  }

  if (drawingObj)
    drawing({
      drawingObj,
      gridObj,
      scene,
      camera,
      controls,
      gridSize,
      derivedDisplayScale,
      rendererElm: renderer.domElement,
      viewerRender,
    });

  // Expose Three.js context for external use (view switching, etc.)
  (viewerElm as any).__ctx = {
    scene,
    perspCamera: camera,
    orthoCamera,
    controls,
    renderer,
    render: viewerRender,
    setActiveCamera,
  } as ViewerContext3D;

  return viewerElm;
}

// Utils
// Reference scale: locked on first analysis so load changes produce visible differences
let _refScale: number | null = null;
let _refNodeCount: number = 0;

function deriveNodes(
  mesh: Mesh | undefined,
  settings: Settings
): Mesh["nodes"] {
  return van.derive(() => {
    if (!settings.deformedShape.val) return mesh?.nodes?.val ?? [];

    const nodes = mesh?.nodes?.val ?? [];
    const deformations = mesh?.deformOutputs?.val?.deformations;
    if (!deformations || deformations.size === 0) return nodes;

    // Compute max deformation
    let maxDeform = 0;
    deformations.forEach((d) => {
      for (let i = 0; i < 3; i++) maxDeform = Math.max(maxDeform, Math.abs(d[i]));
    });

    let modelExtent = 1;
    if (nodes.length > 1) {
      const mins = [Infinity, Infinity, Infinity];
      const maxs = [-Infinity, -Infinity, -Infinity];
      for (const n of nodes) {
        for (let i = 0; i < 3; i++) { mins[i] = Math.min(mins[i], n[i]); maxs[i] = Math.max(maxs[i], n[i]); }
      }
      modelExtent = Math.max(maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2], 1);
    }

    const targetFraction = 0.05; // 5% of model size for initial/reference loads
    const autoScale = maxDeform > 1e-12 ? (modelExtent * targetFraction) / maxDeform : 1;

    // Lock reference scale on first analysis or when geometry changes (node count changes)
    if (_refScale === null || nodes.length !== _refNodeCount) {
      _refScale = autoScale;
      _refNodeCount = nodes.length;
    }

    // Use the locked reference scale so bigger loads → bigger visual deformation
    // Apply user display scale as multiplier (displayScale=0→auto, >0→manual)
    const userScale = settings.displayScale.val;
    let finalScale = userScale === 0 ? _refScale : (userScale > 0 ? _refScale * userScale : _refScale / (-userScale));

    // Soft cap using sqrt: proportional growth but diminishing returns for very large loads
    // This avoids both: (1) constant deformation (old auto-scale) and (2) absurdly large shapes
    const maxFraction = 0.30; // max 30% of model size
    const maxVisual = maxDeform * finalScale;
    if (maxVisual > modelExtent * maxFraction) {
      // Smooth transition: sqrt-based soft cap
      const ratio = maxVisual / (modelExtent * maxFraction);
      finalScale = finalScale / Math.sqrt(ratio);
    }

    return (
      nodes.map((node, index) => {
        const d = deformations.get(index)?.slice(0, 3) ?? [0, 0, 0];
        return node.map((n, i) => n + d[i] * finalScale) as Node;
      })
    );
  });
}

function getColorMapValues(mesh: Mesh, settings: Settings): State<number[]> {
  // Init
  const colorMapValues = van.state([]);

  enum ResultType {
    bendingXX = "bendingXX",
    bendingYY = "bendingYY",
    bendingXY = "bendingXY",
    displacementZ = "displacementZ",
  }

  // Events
  // On resultMapper, nodes, settings.shellResults change: get new values
  van.derive(() => {
    const nodeBendingXX = new Map<number, number[]>();
    const nodeBendingYY = new Map<number, number[]>();
    const nodeBendingXY = new Map<number, number[]>();

    mesh.analyzeOutputs?.val?.bendingXX?.forEach((vals, elementIndex) => {
      nodeBendingXX.set(mesh.elements.val[elementIndex][0], [vals[0]]);
      nodeBendingXX.set(mesh.elements.val[elementIndex][1], [vals[1]]);
      nodeBendingXX.set(mesh.elements.val[elementIndex][2], [vals[2]]);
    });

    mesh.analyzeOutputs?.val?.bendingYY?.forEach((vals, elementIndex) => {
      nodeBendingYY.set(mesh.elements.val[elementIndex][0], [vals[0]]);
      nodeBendingYY.set(mesh.elements.val[elementIndex][1], [vals[1]]);
      nodeBendingYY.set(mesh.elements.val[elementIndex][2], [vals[2]]);
    });

    mesh.analyzeOutputs?.val?.bendingXY?.forEach((vals, elementIndex) => {
      nodeBendingXY.set(mesh.elements.val[elementIndex][0], [vals[0]]);
      nodeBendingXY.set(mesh.elements.val[elementIndex][1], [vals[1]]);
      nodeBendingXY.set(mesh.elements.val[elementIndex][2], [vals[2]]);
    });

    const resultMapper = {
      [ResultType.bendingXX]: [nodeBendingXX, 0],
      [ResultType.bendingYY]: [nodeBendingYY, 0],
      [ResultType.bendingXY]: [nodeBendingXY, 0],
      [ResultType.displacementZ]: [mesh.deformOutputs?.val?.deformations, 2],
    };

    const values = [];
    mesh.nodes.val.forEach((_, i) => {
      const resultMap = resultMapper[settings.shellResults.val];
      if (!resultMap) return;
      if (!resultMap[0].has(i)) {
        values.push(0);
        return;
      }
      values.push(resultMap[0].get(i)[resultMap[1]]);
    });

    colorMapValues.val = values;
  });

  return colorMapValues;
}

// ====== MAIN — Punto de entrada ======
// Conecta: Geometria + Solver + Viewer + UI

import { generateTruss } from './geometry/truss';
import { solveTruss } from './solver/fem';
import { createViewer, drawStructure, drawDeformed, startAnimation } from './viewer/scene';
import type { ViewerState } from './viewer/scene';
import { createParams, readAll, resetAll } from './ui/params';
import { createTabs, updateData } from './ui/tables';

// ====== Estado ======
let viewer: ViewerState;
let showDeformed = false;

// ====== Calcular ======
function recalcular(): void {
  const p = readAll();
  const status = document.getElementById('status')!;
  status.innerHTML = '&#9881; Calculando...';
  status.style.color = '#fbbf24';

  // Generar geometria
  const model = generateTruss({
    span: p.span,
    divisions: p.div,
    height: p.height,
  });

  // Resolver
  const result = solveTruss(
    model.nodes,
    model.elements,
    { E: p.E, A: p.A },
    p.load
  );

  // Dibujar
  drawStructure(viewer, model.nodes, model.elements, result.forces, p.div);

  if (showDeformed) {
    drawDeformed(viewer, model.nodes, model.elements, result.deformed, p.scale);
  }

  // Centrar camara
  viewer.controls.target.set(p.span / 2, p.height / 2, 0);

  // Actualizar tablas
  updateData(model.nodes, model.elements, result.forces, result.reactions);

  // Status
  setTimeout(() => {
    status.innerHTML = `&#10003; ${model.nodes.length} nodos, ${model.elements.length} elem`;
    status.style.color = '#4ade80';
  }, 50);
}

// ====== Inicializacion ======
function init(): void {
  // Visor 3D
  const container = document.getElementById('viewer')!;
  viewer = createViewer(container);
  startAnimation(viewer);

  // Panel de parametros
  const paramsPanel = document.getElementById('params')!;
  createParams(paramsPanel, () => recalcular());

  // Tabs de tablas
  const tabsEl = document.getElementById('tabs')!;
  createTabs(tabsEl);

  // Botones del toolbar
  document.getElementById('btn-calc')!.addEventListener('click', recalcular);
  document.getElementById('btn-reset')!.addEventListener('click', () => {
    resetAll();
    showDeformed = false;
    recalcular();
  });

  // Primer calculo
  recalcular();

  console.log('✓ Vite Struct Demo iniciado — TypeScript + Three.js');
}

init();

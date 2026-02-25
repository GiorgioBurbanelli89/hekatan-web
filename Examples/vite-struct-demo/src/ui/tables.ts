// ====== TABLAS DE RESULTADOS (con tabs) ======
import type { Point3D, Element } from '../geometry/types';
import type { ElementForce, Reaction } from '../solver/types';

type TabName = 'nodes' | 'elements' | 'reactions' | 'forces';

const TAB_LABELS: { id: TabName; label: string }[] = [
  { id: 'nodes',     label: 'Nodos' },
  { id: 'elements',  label: 'Elementos' },
  { id: 'reactions',  label: 'Reacciones' },
  { id: 'forces',    label: 'Fuerzas' },
];

let activeTab: TabName = 'nodes';
let currentData: {
  nodes: Point3D[];
  elements: Element[];
  forces: ElementForce[];
  reactions: Reaction[];
} | null = null;

/** Crea los botones de tabs */
export function createTabs(tabsContainer: HTMLElement): void {
  for (const tab of TAB_LABELS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    if (tab.id === activeTab) btn.classList.add('active');

    btn.addEventListener('click', () => {
      tabsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = tab.id;
      renderTable();
    });

    tabsContainer.appendChild(btn);
  }
}

/** Actualiza los datos y re-renderiza */
export function updateData(
  nodes: Point3D[],
  elements: Element[],
  forces: ElementForce[],
  reactions: Reaction[]
): void {
  currentData = { nodes, elements, forces, reactions };
  renderTable();
}

/** Renderiza la tabla activa */
function renderTable(): void {
  const el = document.getElementById('table-content');
  if (!el || !currentData) return;

  const { nodes, elements, forces, reactions } = currentData;
  let html = '<table>';

  switch (activeTab) {
    case 'nodes':
      html += '<tr><th>#</th><th>X (m)</th><th>Y (m)</th><th>Z (m)</th></tr>';
      for (let i = 0; i < nodes.length; i++) {
        const [x, y, z] = nodes[i];
        html += `<tr><td>${i}</td><td>${x.toFixed(2)}</td><td>${y.toFixed(2)}</td><td>${z.toFixed(2)}</td></tr>`;
      }
      break;

    case 'elements':
      html += '<tr><th>#</th><th>Nodo A</th><th>Nodo B</th><th>L (m)</th></tr>';
      for (let i = 0; i < elements.length; i++) {
        const [a, b] = elements[i];
        const dx = nodes[b][0] - nodes[a][0];
        const dy = nodes[b][1] - nodes[a][1];
        html += `<tr><td>${i}</td><td>${a}</td><td>${b}</td><td>${Math.sqrt(dx*dx+dy*dy).toFixed(3)}</td></tr>`;
      }
      break;

    case 'reactions':
      html += '<tr><th>Nodo</th><th>Tipo</th><th>Rx (kN)</th><th>Ry (kN)</th></tr>';
      for (const r of reactions) {
        html += `<tr><td>${r.node}</td><td>${r.type}</td><td>${r.Rx.toFixed(1)}</td><td>${r.Ry.toFixed(1)}</td></tr>`;
      }
      break;

    case 'forces':
      html += '<tr><th>#</th><th>A</th><th>B</th><th>F (kN)</th><th>L (m)</th></tr>';
      for (let i = 0; i < forces.length; i++) {
        const f = forces[i];
        const style = f.force > 0 ? 'color:#3b82f6' : f.force < 0 ? 'color:#ef4444' : '';
        html += `<tr><td>${i}</td><td>${f.nodeA}</td><td>${f.nodeB}</td><td style="${style}">${f.force.toFixed(1)}</td><td>${f.length.toFixed(3)}</td></tr>`;
      }
      break;
  }

  html += '</table>';
  el.innerHTML = html;
}

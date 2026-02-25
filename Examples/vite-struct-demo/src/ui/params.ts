// ====== PANEL DE PARAMETROS ======

export interface ParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  step: number;
  group: string;
}

const PARAMS: ParamDef[] = [
  { id: 'span',   label: 'Luz (m)',      min: 4,  max: 20,  value: 10,  step: 1,   group: 'Geometria' },
  { id: 'div',    label: 'Divisiones',   min: 2,  max: 8,   value: 4,   step: 1,   group: 'Geometria' },
  { id: 'height', label: 'Altura (m)',   min: 1,  max: 6,   value: 3,   step: 0.5, group: 'Geometria' },
  { id: 'E',      label: 'E (GPa)',      min: 10, max: 210, value: 200, step: 10,  group: 'Material' },
  { id: 'A',      label: 'A (cm²)',      min: 5,  max: 100, value: 30,  step: 5,   group: 'Material' },
  { id: 'load',   label: 'P (kN)',       min: 10, max: 500, value: 100, step: 10,  group: 'Cargas' },
  { id: 'scale',  label: 'Escala def.',  min: 1,  max: 200, value: 50,  step: 1,   group: 'Vista' },
];

/** Crea el panel de parametros en el container dado */
export function createParams(
  container: HTMLElement,
  onChange: (values: Record<string, number>) => void
): void {
  let currentGroup = '';

  for (const p of PARAMS) {
    // Encabezado de grupo
    if (p.group !== currentGroup) {
      currentGroup = p.group;
      const h3 = document.createElement('h3');
      h3.textContent = currentGroup;
      container.appendChild(h3);
    }

    const row = document.createElement('div');
    row.className = 'param-row';

    const label = document.createElement('label');
    label.textContent = p.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `p-${p.id}`;
    input.min = String(p.min);
    input.max = String(p.max);
    input.value = String(p.value);
    input.step = String(p.step);

    const val = document.createElement('span');
    val.className = 'val';
    val.id = `v-${p.id}`;
    val.textContent = String(p.value);

    input.addEventListener('input', () => {
      val.textContent = input.value;
      onChange(readAll());
    });

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    container.appendChild(row);
  }
}

/** Lee todos los valores actuales */
export function readAll(): Record<string, number> {
  const vals: Record<string, number> = {};
  for (const p of PARAMS) {
    const el = document.getElementById(`p-${p.id}`) as HTMLInputElement | null;
    vals[p.id] = el ? parseFloat(el.value) : p.value;
  }
  return vals;
}

/** Restaura valores por defecto */
export function resetAll(): void {
  for (const p of PARAMS) {
    const input = document.getElementById(`p-${p.id}`) as HTMLInputElement | null;
    const val = document.getElementById(`v-${p.id}`);
    if (input) input.value = String(p.value);
    if (val) val.textContent = String(p.value);
  }
}

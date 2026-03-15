/**
 * hekatanAwatif.ts — Integration bridge between Hekatan MathCanvas and awatif FEM
 *
 * Provides a hybrid DSL + JavaScript execution environment for @{awatif} blocks.
 * DSL commands define the structural model; JS code after "---" does post-processing.
 */

import van from "vanjs-core";
import * as THREE from "three";
import {
  deform,
  analyze,
  getLocalStiffnessMatrix,
  getTransformationMatrix,
  Node,
  Element,
  NodeInputs,
  ElementInputs,
  DeformOutputs,
  AnalyzeOutputs,
  Mesh,
} from "awatif-fem";
import { multiply, transpose, norm, subtract } from "mathjs";
import { getViewer, getParameters, Parameters } from "awatif-ui";
import type { Settings } from "awatif-ui/viewer/settings/getSettings";
import { getMesh } from "awatif-mesh";
import { getQuadMesh, getQuadUniformLoads } from "awatif-mesh/getQuadMesh";

// ─── Support presets ───────────────────────────────────────────────
const SUPPORT_PRESETS: Record<string, [boolean, boolean, boolean, boolean, boolean, boolean]> = {
  fixed:     [true, true, true, true, true, true],
  pin:       [true, true, true, false, false, false],
  pinned:    [true, true, true, false, false, false],
  roller:    [false, true, true, false, false, false],
  rollerx:   [true, false, false, false, false, false],
  rollery:   [false, true, false, false, false, false],
  rollerz:   [false, false, true, false, false, false],
  rollerxy:  [true, true, false, false, false, false],
  rollerxz:  [true, false, true, false, false, false],
  rolleryz:  [false, true, true, false, false, false],
  hingex:    [true, true, true, true, false, false],
  hingey:    [true, true, true, false, true, false],
  hingez:    [true, true, true, false, false, true],
};

// ─── Parse named params from a token list: "E:200000 A:0.01" ─────
function parseNamedParams(tokens: string[], scope: Record<string, any>): Record<string, number> {
  const params: Record<string, number> = {};
  for (const t of tokens) {
    const m = t.match(/^(\w+):(.+)$/);
    if (m) {
      params[m[1]] = resolveValue(m[2], scope);
    }
  }
  return params;
}

// ─── Resolve a value: $varName → scope lookup, else parseFloat ────
function resolveValue(raw: string, scope: Record<string, any>): number {
  if (raw.startsWith("$")) {
    const name = raw.slice(1);
    const val = scope[name];
    if (val === undefined) throw new Error(`Variable '${name}' not found in Hekatan scope`);
    return typeof val === "number" ? val : Number(val);
  }
  // Try evaluating simple expressions like -$P or 2*$E
  if (raw.includes("$")) {
    const expr = raw.replace(/\$(\w+)/g, (_, name) => {
      const val = scope[name];
      if (val === undefined) throw new Error(`Variable '${name}' not found in Hekatan scope`);
      return String(val);
    });
    try {
      return new Function(`return (${expr})`)() as number;
    } catch {
      return NaN;
    }
  }
  return parseFloat(raw);
}

// ─── DSL Parser ───────────────────────────────────────────────────
interface MeshCommand {
  type: "tri" | "quad";
  // For tri mesh
  polygon?: number[];
  maxSize?: number;
  // For quad mesh
  Lx?: number;
  Ly?: number;
  nx?: number;
  ny?: number;
  z?: number;
  // Common: properties to assign to generated elements
  E?: number;
  t?: number;
  nu?: number;
}

interface ParsedModel {
  nodes: Node[];
  elements: Element[];
  solverNodeInputs: NodeInputs;   // combined loads for deform/analyze
  elementInputs: ElementInputs;
  solveRequested: boolean;
  explicitMode: boolean;
  showSettings: Record<string, any>;
  jsCode: string;
  // Load pattern data for visualization
  patterns: Map<string, Map<number, [number, number, number, number, number, number]>>;
  patternNames: string[];  // ordered pattern names
  supports: Map<number, [boolean, boolean, boolean, boolean, boolean, boolean]>;
  // Mesh generation commands
  meshCommands: MeshCommand[];
  // Pressure loads (applied after mesh generation)
  pressureValue: number | null;
  // Boundary support preset for mesh-generated boundaries
  boundarySupport: string | null;
}

// ─── Accumulate a 6-DOF force vector onto a Map ─────────
function accumulateLoad(
  map: Map<number, [number, number, number, number, number, number]>,
  nodeIdx: number,
  f: [number, number, number, number, number, number],
): void {
  if (map.has(nodeIdx)) {
    const existing = map.get(nodeIdx)!;
    for (let i = 0; i < 6; i++) existing[i] += f[i];
  } else {
    map.set(nodeIdx, [...f]);
  }
}

function parseDSL(lines: string[], scope: Record<string, any>): ParsedModel {
  const nodes: Node[] = [];
  const elements: Element[] = [];
  const supports = new Map<number, [boolean, boolean, boolean, boolean, boolean, boolean]>();
  const elasticities = new Map<number, number>();
  const areas = new Map<number, number>();
  const momentsOfInertiaZ = new Map<number, number>();
  const momentsOfInertiaY = new Map<number, number>();
  const torsionalConstants = new Map<number, number>();
  const shearModuli = new Map<number, number>();
  const thicknesses = new Map<number, number>();
  const poissonsRatios = new Map<number, number>();

  // ── Load patterns ─────────────────────────────────────
  // Each pattern is a named load case with its own loads map.
  // Multiple `load` commands on the same node ACCUMULATE (don't overwrite).
  // `combine factor*name + factor*name ...` creates the final combined loads.
  // Without `combine`, all patterns are summed with factor 1.0.
  const patterns = new Map<string, Map<number, [number, number, number, number, number, number]>>();
  let currentPattern = "default";
  patterns.set(currentPattern, new Map());
  let combineUsed = false;
  const combinedLoads = new Map<number, [number, number, number, number, number, number]>();

  let solveRequested = false;
  let explicitMode = false;
  const showSettings: Record<string, any> = {};
  const jsLines: string[] = [];
  let inJsMode = false;
  const meshCommands: MeshCommand[] = [];
  let pressureValue: number | null = null;
  let boundarySupport: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    // Switch to JS mode after "---"
    if (line === "---") {
      inJsMode = true;
      continue;
    }
    if (inJsMode) {
      jsLines.push(rawLine);
      continue;
    }

    const tokens = line.split(/\s+/);
    const cmd = tokens[0].toLowerCase();

    switch (cmd) {
      case "node": {
        // node x y z
        const x = resolveValue(tokens[1], scope);
        const y = resolveValue(tokens[2], scope);
        const z = resolveValue(tokens[3] || "0", scope);
        nodes.push([x, y, z]);
        break;
      }

      case "element": {
        // element bar|frame i j [E:val] [A:val] [Iz:val] [Iy:val] [J:val] [G:val]
        // element shell|plate i j k [l] [E:val] [t:val] [nu:val]
        const etype = tokens[1].toLowerCase();
        const elemIdx = elements.length;

        if (etype === "bar" || etype === "frame" || etype === "beam" || etype === "truss") {
          const ni = parseInt(tokens[2]);
          const nj = parseInt(tokens[3]);
          elements.push([ni, nj]);
          const params = parseNamedParams(tokens.slice(4), scope);
          if (params.E !== undefined) elasticities.set(elemIdx, params.E);
          if (params.A !== undefined) areas.set(elemIdx, params.A);
          if (params.Iz !== undefined) momentsOfInertiaZ.set(elemIdx, params.Iz);
          if (params.Iy !== undefined) momentsOfInertiaY.set(elemIdx, params.Iy);
          if (params.J !== undefined) torsionalConstants.set(elemIdx, params.J);
          if (params.G !== undefined) shearModuli.set(elemIdx, params.G);
        } else if (etype === "shell" || etype === "plate" || etype === "tri" || etype === "quad") {
          // Collect node indices (until we hit a named param)
          const nodeIndices: number[] = [];
          let pi = 2;
          while (pi < tokens.length && !tokens[pi].includes(":")) {
            nodeIndices.push(parseInt(tokens[pi]));
            pi++;
          }
          elements.push(nodeIndices);
          const params = parseNamedParams(tokens.slice(pi), scope);
          if (params.E !== undefined) elasticities.set(elemIdx, params.E);
          if (params.t !== undefined) thicknesses.set(elemIdx, params.t);
          if (params.nu !== undefined) poissonsRatios.set(elemIdx, params.nu);
          if (params.G !== undefined) shearModuli.set(elemIdx, params.G);
        }
        break;
      }

      case "support": {
        // support nodeIdx fixed|pin|roller|[b,b,b,b,b,b]
        const nodeIdx = parseInt(tokens[1]);
        const preset = tokens[2]?.toLowerCase();
        if (SUPPORT_PRESETS[preset]) {
          supports.set(nodeIdx, [...SUPPORT_PRESETS[preset]]);
        } else if (tokens[2]?.startsWith("[")) {
          // Parse [true,false,...] inline
          const boolStr = tokens.slice(2).join("").replace(/[\[\]]/g, "");
          const bools = boolStr.split(",").map(b => b.trim().toLowerCase() === "true") as [boolean, boolean, boolean, boolean, boolean, boolean];
          supports.set(nodeIdx, bools);
        }
        break;
      }

      case "pattern": {
        // pattern name — switch to a named load pattern
        currentPattern = tokens[1];
        if (!patterns.has(currentPattern)) {
          patterns.set(currentPattern, new Map());
        }
        break;
      }

      case "load": {
        // load nodeIdx fx:v fy:v fz:v mx:v my:v mz:v
        // Loads ACCUMULATE on the same node (no overwrite)
        const nodeIdx = parseInt(tokens[1]);
        const params = parseNamedParams(tokens.slice(2), scope);
        const f: [number, number, number, number, number, number] = [
          params.fx || 0, params.fy || 0, params.fz || 0,
          params.mx || 0, params.my || 0, params.mz || 0,
        ];
        accumulateLoad(patterns.get(currentPattern)!, nodeIdx, f);
        break;
      }

      case "combine": {
        // combine factor*name + factor*name + ...
        // e.g. combine 1.2*dead + 1.6*live + 1.0*sismo
        // Factors can reference $variables: combine $fd*dead + $fl*live
        combineUsed = true;
        const expr = tokens.slice(1).join(" ");
        const terms = expr.split("+").map(t => t.trim());
        for (const term of terms) {
          const m = term.match(/^([\d.$\w*\-+/()]+)\s*\*\s*(\w+)$/);
          if (m) {
            const factor = resolveValue(m[1], scope);
            const patName = m[2];
            const patLoads = patterns.get(patName);
            if (patLoads) {
              for (const [nodeIdx, f] of patLoads) {
                const scaled: [number, number, number, number, number, number] =
                  [f[0] * factor, f[1] * factor, f[2] * factor,
                   f[3] * factor, f[4] * factor, f[5] * factor];
                accumulateLoad(combinedLoads, nodeIdx, scaled);
              }
            }
          } else {
            // Bare pattern name without factor (factor = 1.0)
            const patName = term;
            const patLoads = patterns.get(patName);
            if (patLoads) {
              for (const [nodeIdx, f] of patLoads) {
                accumulateLoad(combinedLoads, nodeIdx, [...f]);
              }
            }
          }
        }
        break;
      }

      case "mesh": {
        // mesh tri polygon:[0,1,2,...] maxSize:N E:val t:val nu:val
        // mesh quad Lx:N Ly:N nx:N ny:N z:N E:val t:val nu:val
        const mtype = tokens[1]?.toLowerCase();
        const mparams = parseNamedParams(tokens.slice(2), scope);
        if (mtype === "tri" || mtype === "triangle") {
          // Parse polygon indices from polygon:[0,1,2,3]
          let polygon: number[] | undefined;
          for (const t of tokens.slice(2)) {
            const pm = t.match(/^polygon:\[([^\]]+)\]$/);
            if (pm) {
              polygon = pm[1].split(",").map(s => parseInt(s.trim()));
            }
          }
          meshCommands.push({
            type: "tri",
            polygon,
            maxSize: mparams.maxSize || mparams.maxsize,
            E: mparams.E,
            t: mparams.t,
            nu: mparams.nu,
          });
        } else if (mtype === "quad" || mtype === "quadrilateral") {
          meshCommands.push({
            type: "quad",
            Lx: mparams.Lx || mparams.lx,
            Ly: mparams.Ly || mparams.ly,
            nx: mparams.nx || 4,
            ny: mparams.ny || 4,
            z: mparams.z || 0,
            E: mparams.E,
            t: mparams.t,
            nu: mparams.nu,
          });
        }
        break;
      }

      case "pressure": {
        // pressure value (uniform load in Z direction on all elements)
        pressureValue = resolveValue(tokens[1], scope);
        break;
      }

      case "boundarysupport": {
        // boundarysupport fixed|pin|...
        boundarySupport = tokens[1]?.toLowerCase() || "fixed";
        break;
      }

      case "frame": {
        // frame svX [svY] sp [Lvi:N] [Lvd:N]
        // frame [2.93,4.72,3.20] [3.45,3.07]                → portico plano 2D
        // frame [2.93,4.72,3.20] [3,4.5] [3.45,3.07]        → edificio 3D
        // frame [4,6] [3.5,3] Lvi:1.5 Lvd:2                 → con volados
        // frame [4,6] [3,4.5] [3.5,3] Lvi:1.5 Lvd:2         → 3D con volados
        const arrays: number[][] = [];
        const fparams = parseNamedParams(tokens.slice(1), scope);
        const Lvi = fparams.Lvi || fparams.lvi || 0;
        const Lvd = fparams.Lvd || fparams.lvd || 0;

        // Parse bracketed arrays [a,b,c]
        const arrayRegex = /\[([^\]]+)\]/g;
        let am;
        while ((am = arrayRegex.exec(line)) !== null) {
          arrays.push(am[1].split(",").map(s => resolveValue(s.trim(), scope)));
        }

        let svX: number[], svY: number[] | null, sp: number[];
        if (arrays.length === 2) {
          // 2D: frame [svX] [sp]
          svX = arrays[0]; svY = null; sp = arrays[1];
        } else if (arrays.length >= 3) {
          // 3D: frame [svX] [svY] [sp]
          svX = arrays[0]; svY = arrays[1]; sp = arrays[2];
        } else {
          break; // malformed
        }

        // Build X coordinates
        const xCoords = Lvi > 0 ? [-Lvi] : [] as number[];
        let xAcc = 0;
        xCoords.push(xAcc);
        for (const s of svX) { xAcc += s; xCoords.push(xAcc); }
        if (Lvd > 0) xCoords.push(xAcc + Lvd);

        // Build Y coordinates
        const yCoords = svY ? [0] : [0];
        if (svY) {
          let yAcc = 0;
          for (const s of svY) { yAcc += s; yCoords.push(yAcc); }
        }

        // Build Z coordinates
        const zCoords = [0];
        let zAcc = 0;
        for (const s of sp) { zAcc += s; zCoords.push(zAcc); }

        // Cantilever tip detection: tips have no column, no ground node, no support
        const isCantTip = (ix: number) =>
          (Lvi > 0 && ix === 0) || (Lvd > 0 && ix === xCoords.length - 1);

        // Create nodes — skip ground level (iz=0) for cantilever tips
        const fnid: Record<string, number> = {};
        for (let iz = 0; iz < zCoords.length; iz++)
          for (let iy = 0; iy < yCoords.length; iy++)
            for (let ix = 0; ix < xCoords.length; ix++) {
              if (iz === 0 && isCantTip(ix)) continue;
              fnid[`${ix},${iy},${iz}`] = nodes.length;
              nodes.push([xCoords[ix], yCoords[iy], zCoords[iz]]);
            }

        const firstElem = elements.length;

        // Columns (vertical) — skip cantilever tips
        for (let iz = 0; iz < zCoords.length - 1; iz++)
          for (let iy = 0; iy < yCoords.length; iy++)
            for (let ix = 0; ix < xCoords.length; ix++) {
              if (isCantTip(ix)) continue;
              elements.push([fnid[`${ix},${iy},${iz}`], fnid[`${ix},${iy},${iz + 1}`]]);
            }

        // Beams X direction (cantilever beams connect at iz >= 1 where tip nodes exist)
        for (let iz = 1; iz < zCoords.length; iz++)
          for (let iy = 0; iy < yCoords.length; iy++)
            for (let ix = 0; ix < xCoords.length - 1; ix++)
              elements.push([fnid[`${ix},${iy},${iz}`], fnid[`${ix + 1},${iy},${iz}`]]);

        // Beams Y direction (only if 3D) — skip cantilever X tips
        if (svY) {
          for (let iz = 1; iz < zCoords.length; iz++)
            for (let ix = 0; ix < xCoords.length; ix++) {
              if (isCantTip(ix)) continue;
              for (let iy = 0; iy < yCoords.length - 1; iy++)
                elements.push([fnid[`${ix},${iy},${iz}`], fnid[`${ix},${iy + 1},${iz}`]]);
            }
        }

        // Apply section properties to all generated elements
        for (let ei = firstElem; ei < elements.length; ei++) {
          if (fparams.E !== undefined) elasticities.set(ei, fparams.E);
          if (fparams.A !== undefined) areas.set(ei, fparams.A);
          if (fparams.Iz !== undefined) momentsOfInertiaZ.set(ei, fparams.Iz);
          if (fparams.Iy !== undefined) momentsOfInertiaY.set(ei, fparams.Iy);
          if (fparams.G !== undefined) shearModuli.set(ei, fparams.G);
          if (fparams.J !== undefined) torsionalConstants.set(ei, fparams.J);
        }

        // Auto-support base nodes (z=0) as fixed — skip cantilever tips
        for (let iy = 0; iy < yCoords.length; iy++)
          for (let ix = 0; ix < xCoords.length; ix++) {
            if (isCantTip(ix)) continue;
            supports.set(fnid[`${ix},${iy},0`], [true, true, true, true, true, true]);
          }

        break;
      }

      case "solve": {
        solveRequested = true;
        // "solve explicit" or "solve static explicit"
        if (tokens.includes("explicit")) explicitMode = true;
        break;
      }

      case "show": {
        // show [deformed] [scale:N] [result:field]
        for (const t of tokens.slice(1)) {
          if (t === "deformed") showSettings.deformedShape = true;
          else {
            const m = t.match(/^(\w+):(.+)$/);
            if (m) showSettings[m[1]] = isNaN(Number(m[2])) ? m[2] : Number(m[2]);
          }
        }
        break;
      }

      default:
        // Unknown command - ignore silently
        break;
    }
  }

  // ── Resolve SOLVER loads (combined with factors) ──────────
  const solverLoads = new Map<number, [number, number, number, number, number, number]>();
  if (combineUsed) {
    for (const [nodeIdx, f] of combinedLoads) {
      solverLoads.set(nodeIdx, f);
    }
  } else {
    // No combine: sum all patterns with factor 1.0
    for (const [, patLoads] of patterns) {
      for (const [nodeIdx, f] of patLoads) {
        accumulateLoad(solverLoads, nodeIdx, [...f]);
      }
    }
  }

  // Collect ordered pattern names (excluding "default" if empty)
  const patternNames: string[] = [];
  for (const [name, loads] of patterns) {
    if (loads.size > 0) patternNames.push(name);
  }

  const solverNodeInputs: NodeInputs = {
    supports: supports,
    loads: solverLoads,
  };

  const elementInputs: ElementInputs = {};
  if (elasticities.size > 0) elementInputs.elasticities = elasticities;
  if (areas.size > 0) elementInputs.areas = areas;
  if (momentsOfInertiaZ.size > 0) elementInputs.momentsOfInertiaZ = momentsOfInertiaZ;
  if (momentsOfInertiaY.size > 0) elementInputs.momentsOfInertiaY = momentsOfInertiaY;
  if (torsionalConstants.size > 0) elementInputs.torsionalConstants = torsionalConstants;
  if (shearModuli.size > 0) elementInputs.shearModuli = shearModuli;
  if (thicknesses.size > 0) elementInputs.thicknesses = thicknesses;
  if (poissonsRatios.size > 0) elementInputs.poissonsRatios = poissonsRatios;

  // ── Smart defaults: awatif-fem always uses 6 DOF/node frame solver.
  // Missing Iy/G/J cause zero-stiffness DOFs → singular matrix.
  // Auto-fill missing properties so bar elements and incomplete frames work.
  // Factor 0.01: small enough to preserve truss-like behavior (~1% of frame),
  // large enough to avoid numerical singularity in LU decomposition.
  for (let i = 0; i < elements.length; i++) {
    if (elements[i].length !== 2) continue; // skip shell/plate elements
    const E = elasticities.get(i);
    const A = areas.get(i);
    if (E === undefined || A === undefined) continue;
    const smallI = A * A * 0.01; // ~1% bending stiffness vs axial
    // Iy defaults to Iz (or small value for bar elements)
    if (!momentsOfInertiaY.has(i)) {
      const Iz = momentsOfInertiaZ.get(i);
      momentsOfInertiaY.set(i, Iz ?? smallI);
    }
    // Iz defaults to Iy (or small value for bar elements)
    if (!momentsOfInertiaZ.has(i)) {
      const Iy = momentsOfInertiaY.get(i);
      momentsOfInertiaZ.set(i, Iy ?? smallI);
    }
    // G defaults to E / 2.6 (steel, nu≈0.3)
    if (!shearModuli.has(i)) {
      shearModuli.set(i, E / 2.6);
    }
    // J defaults to Iz + Iy (approximate polar moment)
    if (!torsionalConstants.has(i)) {
      const Iz = momentsOfInertiaZ.get(i) ?? 0;
      const Iy = momentsOfInertiaY.get(i) ?? 0;
      torsionalConstants.set(i, Iz + Iy || smallI);
    }
  }
  // Re-build elementInputs with potentially updated maps
  if (momentsOfInertiaY.size > 0) elementInputs.momentsOfInertiaY = momentsOfInertiaY;
  if (torsionalConstants.size > 0) elementInputs.torsionalConstants = torsionalConstants;
  if (shearModuli.size > 0) elementInputs.shearModuli = shearModuli;
  if (momentsOfInertiaZ.size > 0) elementInputs.momentsOfInertiaZ = momentsOfInertiaZ;

  return {
    nodes,
    elements,
    solverNodeInputs,
    elementInputs,
    solveRequested,
    explicitMode,
    showSettings,
    jsCode: jsLines.join("\n"),
    patterns,
    patternNames,
    supports,
    meshCommands,
    pressureValue,
    boundarySupport,
  };
}

// ─── Build viewer nodeInputs for a given pattern selection ────────
function buildViewerNodeInputs(
  model: ParsedModel,
  selection: string, // "combined" | pattern name | "all"
): NodeInputs {
  // awatif-ui expects supports and loads to always be Maps (never undefined)
  const ni: NodeInputs = {
    supports: model.supports.size > 0 ? model.supports : new Map(),
    loads: new Map(),
  };

  if (selection === "combined") {
    ni.loads = model.solverNodeInputs.loads || new Map();
  } else if (selection === "all") {
    const merged = new Map<number, [number, number, number, number, number, number]>();
    for (const [, patLoads] of model.patterns) {
      for (const [nodeIdx, f] of patLoads) {
        accumulateLoad(merged, nodeIdx, [...f]);
      }
    }
    ni.loads = merged;
  } else {
    // Show a single pattern's loads
    const patLoads = model.patterns.get(selection);
    if (patLoads && patLoads.size > 0) {
      ni.loads = new Map(
        [...patLoads.entries()].map(([k, v]) => [k, [...v] as [number, number, number, number, number, number]])
      );
    }
  }
  return ni;
}

// ─── Extract $variable references from DSL lines ─────────────────
function extractDollarVars(lines: string[]): string[] {
  const vars = new Set<string>();
  const jsIdx = lines.findIndex(l => l.trim() === "---");
  const dslLines = jsIdx >= 0 ? lines.slice(0, jsIdx) : lines;
  for (const line of dslLines) {
    const matches = line.matchAll(/\$(\w+)/g);
    for (const m of matches) vars.add(m[1]);
  }
  return [...vars];
}

// ─── Build Parameters object for Tweakpane (awatif v2 pattern) ───
function buildParametersObj(
  dollarVars: string[],
  scope: Record<string, any>,
): Parameters {
  const params: Parameters = {};
  for (const name of dollarVars) {
    const val = scope[name];
    if (typeof val !== "number") continue;
    const absVal = Math.abs(val) || 1;
    const step = absVal >= 1000 ? Math.pow(10, Math.floor(Math.log10(absVal)) - 1)
               : absVal >= 10 ? 1
               : absVal >= 1 ? 0.5
               : absVal >= 0.01 ? 0.01
               : 0.001;
    const maxVal = absVal * 3;
    params[name] = {
      value: van.state(val),
      min: 0,
      max: maxVal,
      step,
      label: name,
    };
  }
  return params;
}

// ─── Execute mesh commands on a parsed model ─────────────────────
function executeMeshCommands(model: ParsedModel): void {
  for (const mc of model.meshCommands) {
    if (mc.type === "tri" && model.nodes.length >= 3) {
      const polygon = mc.polygon ?? model.nodes.map((_, i) => i);
      const meshResult = getMesh({
        points: model.nodes,
        polygon,
        maxMeshSize: mc.maxSize || 3,
      });
      model.nodes.length = 0;
      model.elements.length = 0;
      meshResult.nodes.forEach(n => model.nodes.push(n));
      meshResult.elements.forEach(e => model.elements.push(e));
      if (mc.E !== undefined || mc.t !== undefined || mc.nu !== undefined) {
        for (let i = 0; i < model.elements.length; i++) {
          if (mc.E !== undefined) {
            if (!model.elementInputs.elasticities) model.elementInputs.elasticities = new Map();
            model.elementInputs.elasticities.set(i, mc.E);
          }
          if (mc.t !== undefined) {
            if (!model.elementInputs.thicknesses) model.elementInputs.thicknesses = new Map();
            model.elementInputs.thicknesses.set(i, mc.t);
          }
          if (mc.nu !== undefined) {
            if (!model.elementInputs.poissonsRatios) model.elementInputs.poissonsRatios = new Map();
            model.elementInputs.poissonsRatios.set(i, mc.nu);
          }
        }
      }
      if (model.boundarySupport && SUPPORT_PRESETS[model.boundarySupport]) {
        for (const bi of meshResult.boundaryIndices) {
          model.supports.set(bi, [...SUPPORT_PRESETS[model.boundarySupport!]]);
        }
      }
    } else if (mc.type === "quad") {
      const qm = getQuadMesh({
        Lx: mc.Lx || 10, Ly: mc.Ly || 10,
        nx: mc.nx || 4, ny: mc.ny || 4, z: mc.z || 0,
      });
      const nodeOffset = model.nodes.length;
      qm.nodes.forEach(n => model.nodes.push(n));
      qm.elements.forEach(e => model.elements.push(e.map(idx => idx + nodeOffset)));
      for (let i = 0; i < qm.elements.length; i++) {
        const eIdx = model.elements.length - qm.elements.length + i;
        if (mc.E !== undefined) {
          if (!model.elementInputs.elasticities) model.elementInputs.elasticities = new Map();
          model.elementInputs.elasticities.set(eIdx, mc.E);
        }
        if (mc.t !== undefined) {
          if (!model.elementInputs.thicknesses) model.elementInputs.thicknesses = new Map();
          model.elementInputs.thicknesses.set(eIdx, mc.t);
        }
        if (mc.nu !== undefined) {
          if (!model.elementInputs.poissonsRatios) model.elementInputs.poissonsRatios = new Map();
          model.elementInputs.poissonsRatios.set(eIdx, mc.nu);
        }
      }
      if (model.boundarySupport && SUPPORT_PRESETS[model.boundarySupport]) {
        for (const bi of qm.boundaryIndices) {
          model.supports.set(bi + nodeOffset, [...SUPPORT_PRESETS[model.boundarySupport!]]);
        }
      }
      if (model.pressureValue !== null) {
        const pressLoads = getQuadUniformLoads(
          qm.elements.map(e => e.map(idx => idx + nodeOffset)),
          model.nodes, model.pressureValue,
        );
        for (const [nodeIdx, f] of pressLoads) {
          accumulateLoad(model.solverNodeInputs.loads || new Map(), nodeIdx, f);
        }
        if (!model.solverNodeInputs.loads) model.solverNodeInputs.loads = new Map();
      }
    }
  }
  if (model.meshCommands.length > 0) {
    model.solverNodeInputs.supports = model.supports;
  }
}

// ─── Compute model: parse DSL + mesh + solve + JS ─────────────────
function computeModel(
  awatifLines: string[],
  scope: Record<string, any>,
): {
  model: ParsedModel;
  deformOutputs: DeformOutputs;
  analyzeOutputs: AnalyzeOutputs;
  solveError: string | null;
} {
  const model = parseDSL(awatifLines, scope);
  executeMeshCommands(model);

  let deformOutputs: DeformOutputs = {};
  let analyzeOutputs: AnalyzeOutputs = {};
  let solveError: string | null = null;

  if (model.solveRequested && model.nodes.length > 0) {
    try {
      deformOutputs = deform(
        model.nodes, model.elements,
        model.solverNodeInputs, model.elementInputs,
      ) || {};
      analyzeOutputs = analyze(
        model.nodes, model.elements,
        model.elementInputs, deformOutputs,
      ) || {};
    } catch (solveErr: any) {
      console.warn("@{awatif} solve warning:", solveErr.message);
      solveError = solveErr.message;
    }
  }

  if (model.jsCode.trim() && model.nodes.length > 0) {
    try {
      const jsFn = new Function(
        "nodes", "elements", "nodeInputs", "elementInputs",
        "result", "analysis", "hk", "deform", "analyze", "Map",
        model.jsCode,
      );
      jsFn(
        model.nodes, model.elements, model.solverNodeInputs, model.elementInputs,
        deformOutputs, analyzeOutputs, scope, deform, analyze, Map,
      );
    } catch (jsErr: any) {
      console.error("@{awatif} JS error:", jsErr);
    }
  }

  return { model, deformOutputs, analyzeOutputs, solveError };
}

// ─── Scale deformations for visualization ─────────────────────────
function scaleDeformations(
  deformOutputs: DeformOutputs,
  scaleFactor: number,
): DeformOutputs {
  if (scaleFactor === 1 || !deformOutputs.deformations) return deformOutputs;
  const scaled = new Map<number, [number, number, number, number, number, number]>();
  for (const [nodeIdx, d] of deformOutputs.deformations) {
    scaled.set(nodeIdx, [
      d[0] * scaleFactor, d[1] * scaleFactor, d[2] * scaleFactor,
      d[3], d[4], d[5],
    ]);
  }
  return { ...deformOutputs, deformations: scaled };
}

// ─── Main render function (awatif v2 reactive architecture) ───────
export function renderAwatifBlock(
  container: HTMLElement,
  awatifLines: string[],
  scope: Record<string, any>,
): void {
  try {
    // 1. Extract $variables and create Parameters (Tweakpane)
    const dollarVars = extractDollarVars(awatifLines);
    const hasParams = dollarVars.length > 0;
    let parameters: Parameters = {};
    if (hasParams) {
      parameters = buildParametersObj(dollarVars, scope);
    }

    // 2. Initial computation
    const initial = computeModel(awatifLines, scope);
    if (initial.model.nodes.length === 0) {
      container.innerHTML = `<div style="padding:1em;color:#999;">@{awatif}: No nodes defined</div>`;
      return;
    }

    const deformScale = initial.model.showSettings.scale ?? 1;

    // 3. Build VanJS reactive Mesh (created ONCE, updated reactively)
    const hasNamedPatterns = initial.model.patternNames.length > 1 ||
      (initial.model.patternNames.length === 1 && initial.model.patternNames[0] !== "default");
    const defaultView = hasNamedPatterns ? initial.model.patternNames[0] : "combined";
    const initialViewerNI = buildViewerNodeInputs(initial.model, defaultView);

    const mesh: Mesh = {
      nodes: van.state(initial.model.nodes),
      elements: van.state(initial.model.elements),
      nodeInputs: van.state(initialViewerNI),
      elementInputs: van.state(initial.model.elementInputs),
      deformOutputs: van.state(initial.deformOutputs),
      analyzeOutputs: van.state(initial.analyzeOutputs),
    };

    // 4. Reactive update: when any parameter changes, recompute model
    if (hasParams) {
      van.derive(() => {
        // Touch all parameter states to establish dependency
        const updatedScope = { ...scope };
        for (const [name, param] of Object.entries(parameters)) {
          updatedScope[name] = param.value.val;
        }

        // Recompute model with updated scope
        const result = computeModel(awatifLines, updatedScope);
        if (result.model.nodes.length === 0) return;

        // Update reactive mesh states (viewer re-renders automatically)
        mesh.nodes!.val = result.model.nodes;
        mesh.elements!.val = result.model.elements;
        mesh.nodeInputs!.val = buildViewerNodeInputs(result.model, "combined");
        mesh.elementInputs!.val = result.model.elementInputs;
        mesh.deformOutputs!.val = result.deformOutputs;
        mesh.analyzeOutputs!.val = result.analyzeOutputs;
      });
    }

    // 5. Build settings
    const showCopy = { ...initial.model.showSettings };
    delete showCopy.scale;
    const settingsObj: Record<string, any> = {
      nodes: true, elements: true, supports: true, loads: true,
      deformScale,
      ...showCopy,
    };

    // 6. Create viewer (ONCE — it watches mesh states reactively)
    const viewerDiv = getViewer({ mesh, settingsObj });
    viewerDiv.style.position = "relative";
    viewerDiv.style.width = "100%";
    viewerDiv.style.height = "100%";

    // 7. Mount UI
    container.innerHTML = "";
    if (initial.solveError) {
      const warnDiv = document.createElement("div");
      warnDiv.style.cssText = "color:#c60;padding:4px 8px;font-size:12px;background:#fff3e0;border:1px solid #ffcc80;border-radius:3px;margin-bottom:4px;";
      warnDiv.textContent = `Solve warning: ${initial.solveError}`;
      container.appendChild(warnDiv);
    }

    // 7b. Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "awatif-toolbar";

    // Pattern selector
    if (hasNamedPatterns) {
      const patSelect = document.createElement("select");
      patSelect.className = "awatif-pattern-select";
      patSelect.title = "Patron de carga";
      for (const name of initial.model.patternNames) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        patSelect.appendChild(opt);
      }
      const sep = document.createElement("option");
      sep.disabled = true;
      sep.textContent = "────────";
      patSelect.appendChild(sep);
      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "Todos (sin factores)";
      patSelect.appendChild(optAll);
      const optCombined = document.createElement("option");
      optCombined.value = "combined";
      optCombined.textContent = "Combinado";
      patSelect.appendChild(optCombined);
      patSelect.value = defaultView;
      patSelect.addEventListener("change", () => {
        mesh.nodeInputs!.val = buildViewerNodeInputs(initial.model, patSelect.value);
      });
      toolbar.appendChild(patSelect);
    }

    // Settings button
    const btnSettings = document.createElement("button");
    btnSettings.className = "awatif-btn-settings";
    btnSettings.title = "Configuracion";
    btnSettings.textContent = "\u2699";
    toolbar.appendChild(btnSettings);

    // Inspect button
    const btnInspect = document.createElement("button");
    btnInspect.className = "awatif-btn-inspect";
    btnInspect.title = "Inspect elemento";
    btnInspect.textContent = "Inspect";
    btnInspect.style.cssText = "font-size:11px;padding:2px 8px;";
    toolbar.appendChild(btnInspect);

    // Maximize button
    const btnMax = document.createElement("button");
    btnMax.className = "awatif-btn-maximize";
    btnMax.title = "Maximizar";
    btnMax.textContent = "\u2922";
    toolbar.appendChild(btnMax);

    container.appendChild(toolbar);

    // 7b2. Inspect panel
    let inspectPanelEl: HTMLDivElement | null = null;
    let inspectActive = false;

    function fmtInsp(v: number, dec = 4): string {
      if (Math.abs(v) < 1e-10) return "0";
      if (Math.abs(v) >= 1e6) return v.toExponential(2);
      if (Math.abs(v) >= 100) return v.toFixed(1);
      return v.toFixed(dec);
    }

    function matrixHTMLInsp(m: number[][], labels?: string[]): string {
      const rows = Math.min(m.length, 12);
      const cols = Math.min(m[0]?.length || 0, 12);
      let html = `<table style="border-collapse:collapse;width:100%;font-size:10px;margin-top:4px;">`;
      if (labels) {
        html += `<tr><td style="border:1px solid #333;padding:2px 4px;color:#ee9b00;font-weight:bold;background:#222;text-align:center"></td>`;
        for (let j = 0; j < cols; j++) html += `<td style="border:1px solid #333;padding:2px 4px;color:#ee9b00;font-weight:bold;background:#222;text-align:center">${labels[j] || j}</td>`;
        html += `</tr>`;
      }
      for (let i = 0; i < rows; i++) {
        html += `<tr>`;
        if (labels) html += `<td style="border:1px solid #333;padding:2px 4px;color:#ee9b00;font-weight:bold;background:#222;text-align:center">${labels[i] || i}</td>`;
        for (let j = 0; j < cols; j++) {
          const v = m[i][j];
          const color = Math.abs(v) > 1e-10 ? "#0f0" : "#ddd";
          html += `<td style="border:1px solid #333;padding:2px 4px;text-align:right;color:${color};white-space:nowrap">${fmtInsp(v, 2)}</td>`;
        }
        html += `</tr>`;
      }
      html += `</table>`;
      return html;
    }

    function showInspectForElement(elemIdx: number) {
      if (inspectPanelEl) inspectPanelEl.remove();

      const nodes_arr = mesh.nodes!.val;
      const elements_arr = mesh.elements!.val;
      const elem = elements_arr[elemIdx];
      if (!elem) return;
      const elmNodes = elem.map(ni => nodes_arr[ni]) as Node[];
      const isFrame = elem.length === 2;
      const ei = mesh.elementInputs?.val || {};
      const dOut = mesh.deformOutputs?.val;
      const aOut = mesh.analyzeOutputs?.val;

      let propsHTML = "";
      if (isFrame) {
        const L_val = norm(subtract(elmNodes[1], elmNodes[0])) as number;
        const E = ei.elasticities?.get(elemIdx) ?? 0;
        const A = ei.areas?.get(elemIdx) ?? 0;
        const Iz = ei.momentsOfInertiaZ?.get(elemIdx) ?? 0;
        const Iy = ei.momentsOfInertiaY?.get(elemIdx) ?? 0;
        const G = ei.shearModuli?.get(elemIdx) ?? 0;
        const J = ei.torsionalConstants?.get(elemIdx) ?? 0;
        propsHTML = `
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">Tipo</span><span style="color:#fff;font-weight:bold">Frame (2 nodos)</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">Nodos</span><span style="color:#fff;font-weight:bold">${elem[0]} → ${elem[1]}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">L</span><span style="color:#fff;font-weight:bold">${fmtInsp(L_val)} m</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">E</span><span style="color:#fff;font-weight:bold">${fmtInsp(E)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">A</span><span style="color:#fff;font-weight:bold">${fmtInsp(A)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">Iz</span><span style="color:#fff;font-weight:bold">${fmtInsp(Iz)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">Iy</span><span style="color:#fff;font-weight:bold">${fmtInsp(Iy)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">G</span><span style="color:#fff;font-weight:bold">${fmtInsp(G)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#aaa">J</span><span style="color:#fff;font-weight:bold">${fmtInsp(J)}</span></div>
        `;
      } else {
        propsHTML = `<div style="color:#aaa">Shell (${elem.length} nodos): ${elem.join(", ")}</div>`;
      }

      // Compute matrices
      let matricesHTML = "";
      try {
        const kLocal = getLocalStiffnessMatrix(elmNodes, ei, elemIdx);
        const T = getTransformationMatrix(elmNodes);
        const kGlobal = multiply(transpose(T), multiply(kLocal, T)) as number[][];
        const dofLabels = ["ux₀","uy₀","uz₀","θx₀","θy₀","θz₀","ux₁","uy₁","uz₁","θx₁","θy₁","θz₁"];

        matricesHTML = `
          <div style="margin-top:10px;border-top:1px solid #444;padding-top:8px">
            <div style="color:#ee9b00;font-size:12px;font-weight:bold;margin-bottom:4px">K local (12×12)</div>
            ${matrixHTMLInsp(kLocal, dofLabels)}
          </div>
          <div style="margin-top:10px;border-top:1px solid #444;padding-top:8px">
            <div style="color:#ee9b00;font-size:12px;font-weight:bold;margin-bottom:4px">T (transformacion)</div>
            ${matrixHTMLInsp(T, dofLabels)}
          </div>
          <div style="margin-top:10px;border-top:1px solid #444;padding-top:8px">
            <div style="color:#ee9b00;font-size:12px;font-weight:bold;margin-bottom:4px">K global = T' · K_local · T</div>
            ${matrixHTMLInsp(kGlobal, dofLabels)}
          </div>
        `;
      } catch (e: any) {
        matricesHTML = `<div style="color:#c60;margin-top:8px">No se pudo calcular matrices: ${e.message}</div>`;
      }

      // Results
      let resultsHTML = "";
      if (dOut && isFrame) {
        const dofNames = ["ux","uy","uz","θx","θy","θz"];
        const d0 = dOut.deformations?.get(elem[0]) ?? [0,0,0,0,0,0];
        const d1 = dOut.deformations?.get(elem[1]) ?? [0,0,0,0,0,0];
        resultsHTML += `<div style="margin-top:10px;border-top:1px solid #444;padding-top:8px">
          <div style="color:#ee9b00;font-size:12px;font-weight:bold;margin-bottom:4px">Desplazamientos</div>
          <div style="color:#aaa;font-size:10px">Nodo ${elem[0]}: ${d0.map((v,i) => `${dofNames[i]}=${fmtInsp(v)}`).join(", ")}</div>
          <div style="color:#aaa;font-size:10px">Nodo ${elem[1]}: ${d1.map((v,i) => `${dofNames[i]}=${fmtInsp(v)}`).join(", ")}</div>
        </div>`;
      }
      if (aOut && isFrame) {
        const forces = aOut.normals;
        if (forces) {
          const n = forces.get(elemIdx);
          if (n !== undefined) {
            resultsHTML += `<div style="margin-top:6px"><span style="color:#aaa;font-size:10px">N = </span><span style="color:#0f0;font-weight:bold">${fmtInsp(Array.isArray(n) ? n[0] : n as number)}</span></div>`;
          }
        }
      }

      inspectPanelEl = document.createElement("div");
      inspectPanelEl.style.cssText = "position:absolute;top:10px;right:10px;background:rgba(20,20,28,0.97);color:#ccc;border:1px solid #555;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;max-width:420px;max-height:80%;overflow-y:auto;z-index:100;box-shadow:0 4px 20px rgba(0,0,0,0.6);";
      inspectPanelEl.innerHTML = `
        <h3 style="margin:0 0 8px 0;color:#0a84ff;font-size:14px;display:flex;justify-content:space-between;">
          Elemento ${elemIdx}
          <button style="background:none;border:none;color:#888;cursor:pointer;font-size:16px" id="awatif-inspect-close">✕</button>
        </h3>
        ${propsHTML}
        ${resultsHTML}
        ${matricesHTML}
      `;
      container.appendChild(inspectPanelEl);
      inspectPanelEl.querySelector("#awatif-inspect-close")?.addEventListener("click", () => {
        if (inspectPanelEl) { inspectPanelEl.remove(); inspectPanelEl = null; }
      });
    }

    let highlightObj: THREE.LineSegments | null = null;

    function getViewerCtx() {
      return (viewerDiv as any).__ctx as { scene: THREE.Scene; camera: THREE.Camera; controls: any; renderer: THREE.WebGLRenderer; render: () => void } | undefined;
    }

    function cleanupInspect() {
      const ctx = getViewerCtx();
      if (highlightObj && ctx) {
        ctx.scene.remove(highlightObj);
        highlightObj.geometry.dispose();
        (highlightObj.material as THREE.Material).dispose();
        highlightObj = null;
        ctx.render();
      }
      if (inspectPanelEl) { inspectPanelEl.remove(); inspectPanelEl = null; }
    }

    function highlightElement(elemIdx: number) {
      const ctx = getViewerCtx();
      if (!ctx) return;
      if (highlightObj) { ctx.scene.remove(highlightObj); highlightObj.geometry.dispose(); (highlightObj.material as THREE.Material).dispose(); }
      const nodes_arr = mesh.nodes!.val;
      const elem = mesh.elements!.val[elemIdx];
      if (!elem) return;
      const points: number[] = [];
      for (let i = 0; i < elem.length; i++) {
        const a = nodes_arr[elem[i]], b = nodes_arr[elem[(i + 1) % elem.length]];
        points.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      highlightObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3, depthTest: false }));
      highlightObj.renderOrder = 9999;
      ctx.scene.add(highlightObj);
      ctx.render();
    }

    function pickElement(ev: MouseEvent): number {
      const ctx = getViewerCtx();
      if (!ctx) return -1;
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, ctx.camera);
      const nodes_arr = mesh.nodes!.val;
      const elements_arr = mesh.elements!.val;
      if (nodes_arr.length === 0 || elements_arr.length === 0) return -1;
      let bestDist = Infinity, bestIdx = -1;
      const ray = raycaster.ray;
      for (let i = 0; i < elements_arr.length; i++) {
        const elem = elements_arr[i];
        if (elem.length === 2) {
          const a = new THREE.Vector3(...nodes_arr[elem[0]]);
          const b = new THREE.Vector3(...nodes_arr[elem[1]]);
          const line = new THREE.Line3(a, b);
          const closestOnRay = new THREE.Vector3();
          const closestOnLine = new THREE.Vector3();
          ray.closestPointToPoint(line.getCenter(new THREE.Vector3()), closestOnRay);
          line.closestPointToPoint(closestOnRay, true, closestOnLine);
          const d = closestOnRay.distanceTo(closestOnLine);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      }
      // Threshold based on model extent
      let maxCoord = 1;
      for (const n of nodes_arr) for (const c of n) if (Math.abs(c) > maxCoord) maxCoord = Math.abs(c);
      return bestDist < maxCoord * 0.1 ? bestIdx : -1;
    }

    // Click handler on viewer canvas for inspect
    viewerDiv.addEventListener("click", (ev: MouseEvent) => {
      if (!inspectActive) return;
      const idx = pickElement(ev);
      if (idx >= 0) {
        highlightElement(idx);
        showInspectForElement(idx);
      }
    });

    // Hover cursor change
    viewerDiv.addEventListener("mousemove", (ev: MouseEvent) => {
      if (!inspectActive) return;
      const idx = pickElement(ev);
      viewerDiv.style.cursor = idx >= 0 ? "crosshair" : "default";
    });

    btnInspect.addEventListener("click", (e) => {
      e.stopPropagation();
      inspectActive = !inspectActive;
      btnInspect.classList.toggle("active", inspectActive);
      if (!inspectActive) {
        cleanupInspect();
        viewerDiv.style.cursor = "default";
      }
    });

    // 7c. Parameters panel (Tweakpane — awatif v2 pattern)
    if (hasParams) {
      const paramsDiv = getParameters(parameters);
      container.appendChild(paramsDiv);
    }

    container.appendChild(viewerDiv);

    // 7d. Touch-friendly settings panel (direct VanJS state)
    const settingsPanel = document.createElement("div");
    settingsPanel.className = "awatif-settings-panel";
    const vanSettings = (viewerDiv as any).__settings as Settings | undefined;

    function buildTouchPanel() {
      settingsPanel.innerHTML = "";
      const title = document.createElement("div");
      title.style.cssText = "color:#fff;font-size:15px;font-weight:bold;padding:6px;border-bottom:1px solid rgba(255,255,255,0.2);margin-bottom:4px;";
      title.textContent = "Configuracion";
      settingsPanel.appendChild(title);
      if (!vanSettings) return;

      const boolSettings: [string, keyof Settings][] = [
        ["Nodos", "nodes"], ["Elementos", "elements"],
        ["Ind. Nodos", "nodesIndexes"], ["Ind. Elementos", "elementsIndexes"],
        ["Orientaciones", "orientations"], ["Apoyos", "supports"],
        ["Cargas", "loads"], ["Forma deformada", "deformedShape"],
        ["Solidos", "solids"], ["Invertir ejes", "flipAxes"],
      ];
      for (const [label, key] of boolSettings) {
        const state = vanSettings[key];
        if (typeof state.val !== "boolean") continue;
        const row = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = state.val as boolean;
        cb.addEventListener("change", () => { (state as any).val = cb.checked; });
        van.derive(() => { cb.checked = (state as any).val; });
        row.appendChild(cb);
        row.appendChild(document.createTextNode(label));
        settingsPanel.appendChild(row);
      }

      // Display scale +/- buttons
      const scaleRow = document.createElement("div");
      scaleRow.className = "setting-row";
      const scaleLabel = document.createElement("span");
      scaleLabel.textContent = "Escala";
      scaleRow.appendChild(scaleLabel);
      const btnMinus = document.createElement("button");
      btnMinus.className = "btn-step";
      btnMinus.textContent = "\u2212";
      const valDisp = document.createElement("input");
      valDisp.type = "number";
      valDisp.value = String(vanSettings.displayScale.val);
      const btnPlus = document.createElement("button");
      btnPlus.className = "btn-step";
      btnPlus.textContent = "+";
      btnMinus.addEventListener("click", () => { vanSettings.displayScale.val -= 1; });
      btnPlus.addEventListener("click", () => { vanSettings.displayScale.val += 1; });
      valDisp.addEventListener("change", () => { vanSettings.displayScale.val = parseFloat(valDisp.value) || 0; });
      van.derive(() => { valDisp.value = String(vanSettings.displayScale.val); });
      scaleRow.appendChild(btnMinus);
      scaleRow.appendChild(valDisp);
      scaleRow.appendChild(btnPlus);
      settingsPanel.appendChild(scaleRow);

      // Result dropdowns
      const selectSettings: [string, keyof Settings, Record<string, string>][] = [
        ["Resultado nodos", "nodeResults", { none: "Ninguno", deformations: "Deformaciones", reactions: "Reacciones" }],
        ["Resultado barras", "frameResults", { none: "Ninguno", normals: "Normales", shearsY: "Cortante Y", shearsZ: "Cortante Z", torsions: "Torsion", bendingsY: "Flexion Y", bendingsZ: "Flexion Z" }],
        ["Resultado shell", "shellResults", { none: "Ninguno", bendingXX: "Flexion XX", bendingYY: "Flexion YY", bendingXY: "Flexion XY", displacementZ: "Desp. Z" }],
      ];
      for (const [label, key, options] of selectSettings) {
        const state = vanSettings[key];
        if (typeof state.val !== "string") continue;
        const row = document.createElement("div");
        row.className = "setting-row";
        const span = document.createElement("span");
        span.textContent = label;
        row.appendChild(span);
        const sel = document.createElement("select");
        for (const [val, text] of Object.entries(options)) {
          const o = document.createElement("option");
          o.value = val; o.textContent = text;
          o.selected = state.val === val;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () => { (state as any).val = sel.value; });
        van.derive(() => { sel.value = (state as any).val; });
        row.appendChild(sel);
        settingsPanel.appendChild(row);
      }
    }

    btnSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = settingsPanel.classList.toggle("open");
      btnSettings.classList.toggle("active", isOpen);
      if (isOpen) buildTouchPanel();
    });

    // 7e. Maximize/restore
    let isMaximized = false;
    const origParent = container.parentElement!;
    const origNextSibling = container.nextSibling;
    const origWidth = container.style.width;
    const origHeight = container.style.height;

    function toggleMaximize() {
      isMaximized = !isMaximized;
      if (isMaximized) {
        container.style.width = "";
        container.style.height = "";
        document.body.appendChild(container);
        container.classList.add("awatif-fullscreen");
        btnMax.textContent = "\u2715";
        btnMax.title = "Restaurar (Esc)";
      } else {
        container.classList.remove("awatif-fullscreen");
        settingsPanel.classList.remove("open");
        btnSettings.classList.remove("active");
        container.style.width = origWidth;
        container.style.height = origHeight;
        if (origNextSibling) {
          origParent.insertBefore(container, origNextSibling);
        } else {
          origParent.appendChild(container);
        }
        btnMax.textContent = "\u2922";
        btnMax.title = "Maximizar";
      }
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }

    container.appendChild(settingsPanel);

    btnMax.addEventListener("click", (e) => { e.stopPropagation(); toggleMaximize(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isMaximized) toggleMaximize();
    });

    // ─── 8. EXPLICIT MODE: show step-by-step calculations ───────────
    if (initial.model.explicitMode && initial.model.solveRequested) {
      const explDiv = generateExplicitPanel(
        initial.model, initial.deformOutputs, initial.analyzeOutputs,
      );
      // Insert AFTER the awatif container, in the output flow
      if (container.parentElement) {
        container.parentElement.insertBefore(explDiv, container.nextSibling);
      } else {
        container.appendChild(explDiv);
      }
    }

  } catch (err: any) {
    console.error("@{awatif} error:", err);
    container.innerHTML = `<div style="padding:1em;color:red;font-family:monospace;">
      @{awatif} Error: ${err.message}
    </div>`;
  }
}

// ─── Generate explicit calculation panel (matricial/vectorial) ────
function generateExplicitPanel(
  model: ParsedModel,
  deformOutputs: DeformOutputs,
  analyzeOutputs: AnalyzeOutputs,
): HTMLElement {
  const div = document.createElement("div");
  div.className = "awatif-explicit";
  div.style.cssText = "font-family:'Times New Roman',serif;font-size:14px;line-height:1.6;padding:16px 0;color:#333;";

  const { nodes, elements, elementInputs } = model;
  const nElem = elements.length;
  const nNodes = nodes.length;

  // ── Helpers ──
  const fmt = (v: number, d = 4) => {
    if (Math.abs(v) < 1e-15) return "0";
    if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(d);
    return v.toFixed(d).replace(/\.?0+$/, "");
  };
  const heading = (text: string) => `<h3 style="color:#0d47a1;margin:24px 0 10px;font-size:16px;border-bottom:2px solid #0d47a1;padding-bottom:4px;">${text}</h3>`;
  const formula = (html: string) => `<div style="text-align:center;margin:10px 0;font-style:italic;font-size:15px;">${html}</div>`;

  // CSS bracket styles for matrix/vector notation (align-self:stretch for full height)
  const bracketL = 'border-left:2px solid #333;border-top:2px solid #333;border-bottom:2px solid #333;border-radius:3px 0 0 3px;width:5px;align-self:stretch;';
  const bracketR = 'border-right:2px solid #333;border-top:2px solid #333;border-bottom:2px solid #333;border-radius:0 3px 3px 0;width:5px;align-self:stretch;';

  // Cell size: 12×12 matrix must fit in ~700px → 700/12 ≈ 48px per cell
  const cellW = 48;
  const cellH = 16;
  const matFontSize = 10;
  const vecFontSize = 11;
  const lblFontSize = 8;

  // Render a matrix with [ ] brackets
  const matrixHTML = (rows: number[][], name?: string, rowLabels?: string[], colLabels?: string[]) => {
    const nR = rows.length;
    const nC = Math.max(...rows.map(r => r.length));
    let h = '<div style="display:flex;align-items:stretch;justify-content:center;margin:10px 0;gap:0px;overflow-x:auto;">';
    if (name) h += `<div style="font-weight:bold;font-size:13px;margin-right:4px;font-style:italic;align-self:center;">${name} =</div>`;
    // Row labels on left
    if (rowLabels) {
      h += `<div style="display:flex;flex-direction:column;font-size:${lblFontSize}px;color:#888;margin-right:1px;justify-content:center;">`;
      for (const lbl of rowLabels) h += `<div style="height:${cellH}px;display:flex;align-items:center;justify-content:flex-end;padding-right:1px;">${lbl}</div>`;
      h += '</div>';
    }
    // Left bracket
    h += `<div style="${bracketL}"></div>`;
    // Matrix body
    h += '<div style="display:flex;flex-direction:column;justify-content:center;">';
    if (colLabels) {
      h += `<div style="display:flex;font-size:${lblFontSize - 1}px;color:#888;">`;
      for (const cl of colLabels) h += `<div style="width:${cellW}px;text-align:center;">${cl}</div>`;
      h += '</div>';
    }
    for (let i = 0; i < nR; i++) {
      h += '<div style="display:flex;">';
      for (let j = 0; j < nC; j++) {
        const v = rows[i]?.[j] ?? 0;
        const color = Math.abs(v) < 1e-15 ? '#ccc' : (v > 0 ? '#1565c0' : '#c62828');
        const fw = Math.abs(v) < 1e-15 ? 'normal' : 'bold';
        h += `<div style="width:${cellW}px;height:${cellH}px;text-align:right;padding-right:3px;font-size:${matFontSize}px;font-family:monospace;color:${color};font-weight:${fw};line-height:${cellH}px;">${fmt(v, 2)}</div>`;
      }
      h += '</div>';
    }
    h += '</div>';
    // Right bracket
    h += `<div style="${bracketR}"></div>`;
    h += '</div>';
    return h;
  };

  // Render a column vector with [ ] brackets
  const vectorHTML = (values: number[], name: string, labels?: string[], color?: string, decimals?: number) => {
    const clr = color || '#333';
    const dec = decimals ?? 6;
    let h = '<div style="display:inline-flex;align-items:stretch;margin:6px 8px;gap:0px;vertical-align:middle;">';
    h += `<div style="font-weight:bold;font-size:13px;margin-right:3px;font-style:italic;color:${clr};align-self:center;">${name} =</div>`;
    // Labels on left
    if (labels) {
      h += `<div style="display:flex;flex-direction:column;font-size:${lblFontSize}px;color:#888;margin-right:1px;justify-content:center;">`;
      for (const lbl of labels) h += `<div style="height:${cellH}px;display:flex;align-items:center;justify-content:flex-end;padding-right:1px;">${lbl}</div>`;
      h += '</div>';
    }
    h += `<div style="${bracketL}"></div>`;
    h += '<div style="display:flex;flex-direction:column;justify-content:center;">';
    for (const v of values) {
      const vc = Math.abs(v) < 1e-15 ? '#ccc' : clr;
      const fw = Math.abs(v) < 1e-15 ? 'normal' : 'bold';
      h += `<div style="height:${cellH}px;padding:0 4px;text-align:right;font-size:${vecFontSize}px;font-family:monospace;color:${vc};font-weight:${fw};line-height:${cellH}px;">${fmt(v, dec)}</div>`;
    }
    h += '</div>';
    h += `<div style="${bracketR}"></div>`;
    h += '</div>';
    return h;
  };

  // Equation: [K]{u} = {F} centered block
  const equationBlock = (left: string, middle: string, right: string) => {
    return `<div style="display:flex;align-items:center;justify-content:center;gap:4px;margin:12px 0;flex-wrap:wrap;">${left}<div style="font-size:18px;font-weight:bold;margin:0 8px;">${middle}</div>${right}</div>`;
  };

  // DOF labels per node
  const dofLabels6 = ['u<sub>x</sub>','u<sub>y</sub>','u<sub>z</sub>','θ<sub>x</sub>','θ<sub>y</sub>','θ<sub>z</sub>'];

  // Build full DOF labels array for all nodes
  const buildDofLabels = () => {
    const labels: string[] = [];
    for (let n = 0; n < nNodes; n++) {
      for (const d of dofLabels6) labels.push(`${d}<sub>${n}</sub>`);
    }
    return labels;
  };

  let html = heading("Calculos Explicitos — Paso a Paso");

  // ── Section 1: Element data (compact formulas, not table) ──
  html += heading("1. Datos de los Elementos");
  for (let i = 0; i < nElem; i++) {
    const [n0, n1] = elements[i];
    const p0 = nodes[n0], p1 = nodes[n1];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const E = elementInputs.elasticities?.get(i) ?? 0;
    const A = elementInputs.areas?.get(i) ?? 0;
    const Iz = elementInputs.momentsOfInertiaZ?.get(i) ?? 0;
    const Iy = elementInputs.momentsOfInertiaY?.get(i) ?? 0;
    const G = elementInputs.shearModuli?.get(i) ?? 0;
    const J = elementInputs.torsionalConstants?.get(i) ?? 0;
    html += `<div style="margin:4px 0;font-family:monospace;font-size:13px;">`;
    html += `<b>Elem ${i}</b> (${n0}→${n1}): L=${fmt(L)}, E=${fmt(E)}, A=${fmt(A)}, I<sub>z</sub>=${fmt(Iz)}, I<sub>y</sub>=${fmt(Iy)}, G=${fmt(G)}, J=${fmt(J)}`;
    html += `</div>`;
  }

  // ── Section 2: Local stiffness matrix per element ──
  html += heading("2. Matriz de Rigidez Local K<sup>(e)</sup>");
  html += formula("K<sup>(e)</sup><sub>local</sub> = f(EA/L, 12EI<sub>z</sub>/L<sup>3</sup>, 12EI<sub>y</sub>/L<sup>3</sup>, GJ/L, 6EI/L<sup>2</sup>, 4EI/L, 2EI/L)");

  for (let i = 0; i < nElem; i++) {
    const [n0, n1] = elements[i];
    const p0 = nodes[n0], p1 = nodes[n1];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-12) continue;

    const E = elementInputs.elasticities?.get(i) ?? 0;
    const A = elementInputs.areas?.get(i) ?? 0;
    const Iz = elementInputs.momentsOfInertiaZ?.get(i) ?? 0;
    const Iy = elementInputs.momentsOfInertiaY?.get(i) ?? 0;
    const G = elementInputs.shearModuli?.get(i) ?? 0;
    const J = elementInputs.torsionalConstants?.get(i) ?? 0;

    const EA_L = E * A / L;
    const EIz_L3 = E * Iz / (L * L * L);
    const EIy_L3 = E * Iy / (L * L * L);
    const GJ_L = G * J / L;
    const EIz_L2 = E * Iz / (L * L);
    const EIy_L2 = E * Iy / (L * L);
    const EIz_L = E * Iz / L;
    const EIy_L = E * Iy / L;

    html += `<div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;padding:12px;margin:12px 0;">`;
    html += `<div style="font-weight:bold;color:#1565c0;font-size:14px;">Elemento ${i}: nodos ${n0}→${n1}, L = ${fmt(L)}</div>`;

    // Coeficientes como ecuaciones
    html += '<div style="font-family:monospace;font-size:12px;margin:8px 0;display:flex;flex-wrap:wrap;gap:6px 20px;">';
    html += `<div>EA/L = <b>${fmt(EA_L)}</b></div>`;
    if (EIz_L3) html += `<div>12EI<sub>z</sub>/L<sup>3</sup> = <b>${fmt(12 * EIz_L3)}</b></div>`;
    if (EIy_L3) html += `<div>12EI<sub>y</sub>/L<sup>3</sup> = <b>${fmt(12 * EIy_L3)}</b></div>`;
    if (GJ_L) html += `<div>GJ/L = <b>${fmt(GJ_L)}</b></div>`;
    if (EIz_L2) html += `<div>6EI<sub>z</sub>/L<sup>2</sup> = <b>${fmt(6 * EIz_L2)}</b></div>`;
    if (EIy_L2) html += `<div>6EI<sub>y</sub>/L<sup>2</sup> = <b>${fmt(6 * EIy_L2)}</b></div>`;
    if (EIz_L) html += `<div>4EI<sub>z</sub>/L = <b>${fmt(4 * EIz_L)}</b>, 2EI<sub>z</sub>/L = <b>${fmt(2 * EIz_L)}</b></div>`;
    if (EIy_L) html += `<div>4EI<sub>y</sub>/L = <b>${fmt(4 * EIy_L)}</b>, 2EI<sub>y</sub>/L = <b>${fmt(2 * EIy_L)}</b></div>`;
    html += '</div>';

    // Build 12x12 matrix (same as C++ getLocalStiffnessMatrixFrame)
    const K: number[][] = Array.from({ length: 12 }, () => Array(12).fill(0));
    K[0][0] = EA_L;   K[0][6] = -EA_L;
    K[1][1] = 12*EIz_L3;  K[1][5] = 6*EIz_L2;  K[1][7] = -12*EIz_L3;  K[1][11] = 6*EIz_L2;
    K[2][2] = 12*EIy_L3;  K[2][4] = -6*EIy_L2;  K[2][8] = -12*EIy_L3;  K[2][10] = -6*EIy_L2;
    K[3][3] = GJ_L;  K[3][9] = -GJ_L;
    K[4][2] = -6*EIy_L2;  K[4][4] = 4*EIy_L;  K[4][8] = 6*EIy_L2;  K[4][10] = 2*EIy_L;
    K[5][1] = 6*EIz_L2;  K[5][5] = 4*EIz_L;  K[5][7] = -6*EIz_L2;  K[5][11] = 2*EIz_L;
    K[6][0] = -EA_L;  K[6][6] = EA_L;
    K[7][1] = -12*EIz_L3;  K[7][5] = -6*EIz_L2;  K[7][7] = 12*EIz_L3;  K[7][11] = -6*EIz_L2;
    K[8][2] = -12*EIy_L3;  K[8][4] = 6*EIy_L2;  K[8][8] = 12*EIy_L3;  K[8][10] = 6*EIy_L2;
    K[9][3] = -GJ_L;  K[9][9] = GJ_L;
    K[10][2] = -6*EIy_L2;  K[10][4] = 2*EIy_L;  K[10][8] = 6*EIy_L2;  K[10][10] = 4*EIy_L;
    K[11][1] = 6*EIz_L2;  K[11][5] = 2*EIz_L;  K[11][7] = -6*EIz_L2;  K[11][11] = 4*EIz_L;

    const rl = ['u','v','w','θx','θy','θz','u','v','w','θx','θy','θz'].map((d, idx) => `${d}<sub>${idx < 6 ? n0 : n1}</sub>`);
    html += matrixHTML(K, `K<sup>(${i})</sup>`, rl, rl);
    html += '</div>';
  }

  // ── Section 3: System equation K·u = F ──
  html += heading("3. Sistema: [K] · {u} = {F}");

  // Build global F vector and u vector
  const allDofLabels = buildDofLabels();
  const F_global: number[] = new Array(nNodes * 6).fill(0);
  const loads = model.solverNodeInputs.loads;
  if (loads) {
    for (const [nodeIdx, f] of loads) {
      for (let d = 0; d < 6; d++) F_global[nodeIdx * 6 + d] = f[d];
    }
  }

  // Build u vector
  const defMap = deformOutputs.deformations;
  const U_global: number[] = new Array(nNodes * 6).fill(0);
  if (defMap) {
    for (let n = 0; n < nNodes; n++) {
      const d = defMap.get(n);
      if (d) for (let j = 0; j < 6; j++) U_global[n * 6 + j] = d[j];
    }
  }

  // Show F vector
  html += '<div style="display:flex;align-items:flex-start;justify-content:center;gap:24px;flex-wrap:wrap;margin:16px 0;">';
  html += vectorHTML(F_global, 'F', allDofLabels, '#e65100', 4);

  // Show support constraints
  const supports = model.supports;
  if (supports && supports.size > 0) {
    const constrainedDofs: string[] = [];
    for (const [nodeIdx, s] of supports) {
      const dofNames = ['u<sub>x</sub>','u<sub>y</sub>','u<sub>z</sub>','θ<sub>x</sub>','θ<sub>y</sub>','θ<sub>z</sub>'];
      for (let d = 0; d < 6; d++) {
        if (s[d]) constrainedDofs.push(`${dofNames[d]}<sub>${nodeIdx}</sub> = 0`);
      }
    }
    html += '<div style="display:inline-flex;flex-direction:column;margin:8px 12px;padding:8px 12px;background:#e8f5e9;border-radius:6px;border:1px solid #a5d6a7;vertical-align:middle;">';
    html += '<div style="font-weight:bold;color:#2e7d32;font-size:13px;margin-bottom:4px;">Condiciones de Contorno:</div>';
    for (const c of constrainedDofs) {
      html += `<div style="font-size:12px;font-family:monospace;color:#2e7d32;">${c}</div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  // ── Section 4: Solution u = K⁻¹·F ──
  html += heading("4. Solucion: {u} = [K]<sup>-1</sup> · {F}");
  html += '<div style="display:flex;align-items:flex-start;justify-content:center;gap:24px;flex-wrap:wrap;margin:16px 0;">';
  html += vectorHTML(U_global, 'u', allDofLabels, '#1565c0', 6);

  // Show per-node breakdown
  html += '<div style="display:inline-flex;flex-direction:column;gap:4px;vertical-align:middle;">';
  for (let n = 0; n < nNodes; n++) {
    const d = defMap?.get(n);
    if (!d) continue;
    const hasNonZero = d.some(v => Math.abs(v) > 1e-15);
    if (!hasNonZero) continue;
    html += `<div style="font-family:monospace;font-size:12px;color:#1565c0;">`;
    html += `<b>Nodo ${n}:</b> `;
    const parts: string[] = [];
    const dofN = ['u<sub>x</sub>','u<sub>y</sub>','u<sub>z</sub>','θ<sub>x</sub>','θ<sub>y</sub>','θ<sub>z</sub>'];
    for (let j = 0; j < 6; j++) {
      if (Math.abs(d[j]) > 1e-15) parts.push(`${dofN[j]}=${fmt(d[j], 6)}`);
    }
    html += parts.join(', ');
    html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  // ── Section 5: Reactions R = K·u - F ──
  html += heading("5. Reacciones: {R} = [K]·{u} - {F}");
  const reactMap = deformOutputs.reactions;
  if (reactMap && reactMap.size > 0) {
    const R_global: number[] = new Array(nNodes * 6).fill(0);
    for (const [nodeIdx, r] of reactMap) {
      for (let j = 0; j < 6; j++) R_global[nodeIdx * 6 + j] = r[j];
    }

    html += '<div style="display:flex;align-items:flex-start;justify-content:center;gap:24px;flex-wrap:wrap;margin:16px 0;">';
    // Only show nodes with supports (reactions)
    for (const [nodeIdx, r] of reactMap) {
      const nodeLabels = dofLabels6.map(d => `${d}<sub>${nodeIdx}</sub>`);
      html += vectorHTML(r as unknown as number[], `R<sub>${nodeIdx}</sub>`, nodeLabels, '#c62828', 4);
    }
    html += '</div>';

    // Equilibrium check in vector form
    let sumFx = 0, sumFy = 0, sumFz = 0, sumMx = 0, sumMy = 0, sumMz = 0;
    for (const [, r] of reactMap) { sumFx += r[0]; sumFy += r[1]; sumFz += r[2]; sumMx += r[3]; sumMy += r[4]; sumMz += r[5]; }
    if (loads) {
      for (const [, f] of loads) { sumFx += f[0]; sumFy += f[1]; sumFz += f[2]; sumMx += f[3]; sumMy += f[4]; sumMz += f[5]; }
    }
    const eqOk = Math.abs(sumFx) < 1e-6 && Math.abs(sumFy) < 1e-6 && Math.abs(sumFz) < 1e-6;

    html += '<div style="text-align:center;margin:12px 0;">';
    html += '<div style="display:inline-flex;align-items:center;gap:4px;font-family:monospace;font-size:13px;">';
    html += vectorHTML([sumFx, sumFy, sumFz, sumMx, sumMy, sumMz], 'ΣF + ΣR', ['F<sub>x</sub>','F<sub>y</sub>','F<sub>z</sub>','M<sub>x</sub>','M<sub>y</sub>','M<sub>z</sub>'], eqOk ? '#2e7d32' : '#c62828', 4);
    html += `<div style="font-size:16px;font-weight:bold;color:${eqOk ? '#2e7d32' : '#c62828'};margin-left:8px;">${eqOk ? '= 0 ✓' : '≠ 0 ✗'}</div>`;
    html += '</div></div>';
  }

  // ── Section 6: Element forces as vectors ──
  if (analyzeOutputs.normals || analyzeOutputs.shearsY || analyzeOutputs.bendingsZ) {
    html += heading("6. Fuerzas Internas por Elemento");
    html += formula("f<sup>(e)</sup> = K<sup>(e)</sup> · u<sup>(e)</sup>");

    for (let i = 0; i < nElem; i++) {
      const N = analyzeOutputs.normals?.get(i);
      const Vy = analyzeOutputs.shearsY?.get(i);
      const Vz = analyzeOutputs.shearsZ?.get(i);
      const T = analyzeOutputs.torsions?.get(i);
      const My = analyzeOutputs.bendingsY?.get(i);
      const Mz = analyzeOutputs.bendingsZ?.get(i);

      // Build force vector for element start and end
      const [n0, n1] = elements[i];
      const f_start: number[] = [
        N?.[0] ?? 0, Vy?.[0] ?? 0, Vz?.[0] ?? 0,
        T?.[0] ?? 0, My?.[0] ?? 0, Mz?.[0] ?? 0
      ];
      const f_end: number[] = [
        N?.[N?.length ? N.length - 1 : 0] ?? 0,
        Vy?.[Vy?.length ? Vy.length - 1 : 0] ?? 0,
        Vz?.[Vz?.length ? Vz.length - 1 : 0] ?? 0,
        T?.[T?.length ? T.length - 1 : 0] ?? 0,
        My?.[My?.length ? My.length - 1 : 0] ?? 0,
        Mz?.[Mz?.length ? Mz.length - 1 : 0] ?? 0,
      ];

      const forceLabels = ['N','V<sub>y</sub>','V<sub>z</sub>','T','M<sub>y</sub>','M<sub>z</sub>'];

      html += '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin:8px 0;flex-wrap:wrap;">';
      html += `<div style="font-weight:bold;font-size:13px;color:#7b1fa2;">Elem ${i} (${n0}→${n1}):</div>`;
      html += vectorHTML(f_start, `f<sub>${n0}</sub>`, forceLabels, '#7b1fa2', 4);
      html += vectorHTML(f_end, `f<sub>${n1}</sub>`, forceLabels, '#7b1fa2', 4);
      html += '</div>';
    }
  }

  div.innerHTML = html;
  return div;
}

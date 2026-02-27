/**
 * mathEngine.ts - Motor de evaluacion basado en math.js
 * Soporta: variables, matrices, lusolve, transpose, funciones, @{cells}, etc.
 * Formato Hekatan: # heading, > texto, @{cells} |a=1|b=2|
 */
import { create, all, type MathJsInstance, type Matrix } from "mathjs";

// ─── Instancia math.js ──────────────────────────────────
const math: MathJsInstance = create(all, {
  number: "number",
  precision: 14,
});

// ─── Tipos ──────────────────────────────────────────────
export interface CellResult {
  varName: string;
  expr: string;
  value: any;
  display: string;
  error?: string;
}

export interface LineResult {
  lineIndex: number;
  input: string;
  type: "assignment" | "expression" | "comment" | "heading" | "empty" | "directive" | "cells" | "draw" | "draw3d" | "draw3difc" | "importifc" | "error";
  varName?: string;
  value?: any;
  display?: string;
  error?: string;
  cells?: CellResult[];
  /** For type "draw"/"draw3d": width, height, and command lines */
  drawWidth?: number;
  drawHeight?: number;
  drawCommands?: string[];
  /** For type "importifc": IFC file path/URL and optional filter */
  ifcFile?: string;
  ifcFilter?: string;
}

// ─── HekatanEvaluator ───────────────────────────────────
export class HekatanEvaluator {
  private scope: Record<string, any> = {};

  constructor() {
    this.reset();
  }

  reset() {
    this.scope = {};
    this.scope["pi"] = Math.PI;
    this.scope["e"] = Math.E;
    this.scope["inf"] = Infinity;
  }

  getScope(): Record<string, any> {
    return { ...this.scope };
  }

  /** Evalua una sola expresion */
  eval(expr: string): any {
    return math.evaluate(expr, this.scope);
  }

  /** Evalua documento completo linea por linea */
  evalDocument(text: string): LineResult[] {
    this.reset();
    const lines = text.split("\n");
    const results: LineResult[] = [];
    let inDirective = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // @{end ...}
      if (/^@\{end\s+\w+\}/i.test(trimmed)) {
        inDirective = false;
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{cells} |a=1|b=2|c=3|
      if (/^@\{cells\}\s*\|/.test(trimmed)) {
        const cellsResult = this._evalCells(i, raw, trimmed);
        results.push(cellsResult);
        continue;
      }

      // @{columns N} - layout directive, does NOT consume subsequent lines
      if (/^@\{columns\s+\d+\}/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // @{end columns} already handled above

      // @{text} ... @{end text} - block of text lines (no need for > prefix)
      if (/^@\{text\}\s*$/i.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        i++;
        while (i < lines.length && !/^@\{end\s+text\}/i.test(lines[i].trim())) {
          const tLine = lines[i];
          const tTrimmed = tLine.trim();
          if (!tTrimmed) {
            results.push({ lineIndex: i, input: tLine, type: "empty" });
          } else {
            results.push({ lineIndex: i, input: tLine, type: "comment", display: tTrimmed });
          }
          i++;
        }
        // @{end text} line
        if (i < lines.length) {
          results.push({ lineIndex: i, input: lines[i], type: "directive", display: "" });
        }
        continue;
      }

      // @{draw W H}, @{draw:2D W H}, @{draw:3D W H}, @{draw:3D:IFC W H} - CAD block
      const drawMatch = trimmed.match(/^@\{draw(?::(2D|3D|3D:IFC))?\s+(\d+)\s+(\d+)\}/i);
      if (drawMatch) {
        const mode = (drawMatch[1] || "2D").toUpperCase();
        const drawWidth = parseInt(drawMatch[2]);
        const drawHeight = parseInt(drawMatch[3]);
        const drawCommands: string[] = [];
        i++;
        while (i < lines.length && !/^@\{end\s+draw\}/i.test(lines[i].trim())) {
          drawCommands.push(lines[i]);
          i++;
        }
        let dtype: LineResult["type"] = "draw";
        if (mode === "3D") dtype = "draw3d";
        else if (mode === "3D:IFC") dtype = "draw3difc";
        results.push({
          lineIndex: i, input: raw,
          type: dtype,
          drawWidth, drawHeight, drawCommands,
        });
        continue;
      }

      // @{import:ifc:filename W H filter} - load IFC model
      const ifcMatch = trimmed.match(/^@\{import:ifc:([^\s}]+)(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+(all|structural|columns|beams|slabs|rebar|plates|members|fasteners|connections|walls|openings))?\s*\}/i);
      if (ifcMatch) {
        results.push({
          lineIndex: i, input: raw,
          type: "importifc",
          ifcFile: ifcMatch[1],
          drawWidth: ifcMatch[2] ? parseInt(ifcMatch[2]) : 700,
          drawHeight: ifcMatch[3] ? parseInt(ifcMatch[3]) : 500,
          ifcFilter: ifcMatch[4]?.toLowerCase() || "all",
        });
        continue;
      }

      // @{directive} - block directives that consume lines until @{end}
      if (/^@\{\w+/.test(trimmed)) {
        inDirective = true;
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }
      if (inDirective) {
        results.push({ lineIndex: i, input: raw, type: "directive", display: "" });
        continue;
      }

      // Linea vacia
      if (!trimmed) {
        results.push({ lineIndex: i, input: raw, type: "empty" });
        continue;
      }

      // Heading: # titulo
      if (/^#{1,6}\s/.test(trimmed)) {
        results.push({ lineIndex: i, input: raw, type: "heading", display: trimmed });
        continue;
      }

      // Texto: > comentario
      if (trimmed.startsWith(">")) {
        const text = trimmed.slice(1).trim();
        results.push({ lineIndex: i, input: raw, type: "comment", display: text });
        continue;
      }

      // Comentario legacy: 'texto
      if (trimmed.startsWith("'")) {
        const text = trimmed.slice(1).trim();
        results.push({ lineIndex: i, input: raw, type: "comment", display: text });
        continue;
      }

      // Expresion o asignacion
      try {
        const result = this._evalLine(trimmed);
        results.push({ lineIndex: i, input: raw, ...result });
      } catch (e: any) {
        results.push({
          lineIndex: i, input: raw, type: "error",
          error: e.message || String(e)
        });
      }
    }
    return results;
  }

  // ─── @{cells} ─────────────────────────────────────────
  private _evalCells(lineIndex: number, raw: string, trimmed: string): LineResult {
    // Extraer contenido entre pipes: @{cells} |a=1|b=2|c=3|
    const content = trimmed.replace(/^@\{cells\}\s*/, "");
    const parts = content.split("|").filter(p => p.trim());
    const cells: CellResult[] = [];

    for (const part of parts) {
      const cellTrimmed = part.trim();
      if (!cellTrimmed) continue;

      const assignMatch = cellTrimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1];
        const expr = assignMatch[2].trim();
        try {
          const value = math.evaluate(expr, this.scope);
          this.scope[varName] = value;
          cells.push({
            varName, expr, value,
            display: `${varName} = ${this._formatValue(value)}`
          });
        } catch (e: any) {
          cells.push({
            varName, expr, value: undefined,
            display: `${varName} = ?`, error: e.message
          });
        }
      } else {
        // Expresion pura en celda
        try {
          const value = math.evaluate(cellTrimmed, this.scope);
          cells.push({
            varName: "", expr: cellTrimmed, value,
            display: this._formatValue(value)
          });
        } catch (e: any) {
          cells.push({
            varName: "", expr: cellTrimmed, value: undefined,
            display: cellTrimmed, error: e.message
          });
        }
      }
    }

    return { lineIndex, input: raw, type: "cells", cells };
  }

  // ─── Evaluar linea ────────────────────────────────────
  private _evalLine(line: string): Partial<LineResult> {
    // ── Cell array assignment: V = {expr1, expr2, ...} ──
    const cellAssignMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*\{(.+)\}$/);
    if (cellAssignMatch) {
      const varName = cellAssignMatch[1];
      const inner = cellAssignMatch[2];
      // Split by top-level commas or semicolons (respecting brackets)
      const parts = this._splitCellElements(inner);
      const elements = parts.map(p => math.evaluate(p.trim(), this.scope));
      const cell = { __cell: true, elements };
      this.scope[varName] = cell;
      return {
        type: "assignment", varName, value: cell,
        display: `${varName} = {${parts.length} elements}`
      };
    }

    // ── Cell array indexing: V{i} ──
    const cellIdxMatch = line.match(/^([a-zA-Z_]\w*)\{(.+)\}$/);
    if (cellIdxMatch) {
      const varName = cellIdxMatch[1];
      const idxExpr = cellIdxMatch[2];
      const cell = this.scope[varName];
      if (cell && (cell as any).__cell) {
        const idx = Math.round(math.evaluate(idxExpr, this.scope) as number) - 1;
        const value = (cell as any).elements[idx];
        return { type: "expression", value, display: this._formatValue(value) };
      }
    }

    // ── Cell element in assignment: x = V{i} ──
    const cellRefMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*([a-zA-Z_]\w*)\{(.+)\}$/);
    if (cellRefMatch) {
      const varName = cellRefMatch[1];
      const cellName = cellRefMatch[2];
      const idxExpr = cellRefMatch[3];
      const cell = this.scope[cellName];
      if (cell && (cell as any).__cell) {
        const idx = Math.round(math.evaluate(idxExpr, this.scope) as number) - 1;
        const value = (cell as any).elements[idx];
        this.scope[varName] = value;
        return {
          type: "assignment", varName, value,
          display: `${varName} = ${cellName}{${idxExpr}} = ${this._formatValue(value)}`
        };
      }
    }

    // Asignacion: var = expr (no == ni <=)
    const assignMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = this._resolveCellRefs(assignMatch[2]);
      const value = math.evaluate(expr, this.scope);
      this.scope[varName] = value;
      return {
        type: "assignment", varName, value,
        display: `${varName} = ${this._formatValue(value)}`
      };
    }

    // Funcion: f(x) = expr
    const fnMatch = line.match(/^([a-zA-Z_]\w*)\(([^)]+)\)\s*=\s*(.+)$/);
    if (fnMatch) {
      const fnName = fnMatch[1];
      const params = fnMatch[2].split(",").map(p => p.trim());
      const body = this._resolveCellRefs(fnMatch[3]);
      const fnExpr = `${fnName}(${params.join(",")}) = ${body}`;
      math.evaluate(fnExpr, this.scope);
      return {
        type: "assignment", varName: fnName,
        display: `${fnName}(${params.join(", ")}) = ${body}`
      };
    }

    // Expresion pura
    const resolved = this._resolveCellRefs(line);
    const value = math.evaluate(resolved, this.scope);
    return { type: "expression", value, display: this._formatValue(value) };
  }

  /**
   * Resuelve referencias cell array en una expresion antes de pasar a mathjs.
   * Reemplaza `varname{idx}` con una variable temporal que contiene el valor.
   * Ejemplo: "transpose(T) * k{1} * T" → "transpose(T) * __cell_k_1 * T"
   */
  private _resolveCellRefs(expr: string): string {
    return expr.replace(/\b([a-zA-Z_]\w*)\{(\d+)\}/g, (match, name, idxStr) => {
      const cell = this.scope[name];
      if (cell && (cell as any).__cell) {
        const idx = parseInt(idxStr) - 1;
        const value = (cell as any).elements[idx];
        if (value !== undefined) {
          // Crear variable temporal en scope
          const tmpName = `__cell_${name}_${idxStr}`;
          this.scope[tmpName] = value;
          return tmpName;
        }
      }
      return match; // no es cell array, dejar como esta
    });
  }

  /** Split cell array elements by top-level commas/semicolons, respecting brackets */
  private _splitCellElements(s: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of s) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      if ((ch === "," || ch === ";") && depth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  // ─── Formateo ─────────────────────────────────────────
  formatValue(value: any): string {
    return this._formatValue(value);
  }

  private _formatValue(value: any): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "function") return "[function]";

    // Cell array
    if (value && (value as any).__cell) {
      const elems = (value as any).elements as any[];
      return `{${elems.map((e: any) => this._formatValue(e)).join(", ")}}`;
    }

    // Matrix math.js
    if (value && typeof value === "object" && typeof value.toArray === "function") {
      return this._formatMatrixText(value);
    }

    // Array
    if (Array.isArray(value)) {
      return `[${value.map(v => this._formatValue(v)).join(", ")}]`;
    }

    // Number
    if (typeof value === "number") {
      if (Number.isInteger(value)) return String(value);
      const rounded = Math.round(value * 10000) / 10000;
      return String(rounded);
    }

    return String(value);
  }

  private _formatMatrixText(m: Matrix): string {
    const arr = m.toArray() as any[];
    if (!Array.isArray(arr[0])) {
      return `[${arr.map(v => this._fmtNum(v)).join(", ")}]`;
    }
    const rows = (arr as any[][]).map(row =>
      row.map(v => this._fmtNum(v)).join(", ")
    );
    return `[${rows.join("; ")}]`;
  }

  /** Genera HTML para una matriz (con brackets verticales) */
  formatMatrixHTML(value: any): string {
    if (!value || typeof value !== "object" || typeof value.toArray !== "function") {
      return this._formatValue(value);
    }
    const arr = value.toArray() as any[];

    // Vector columna: [[a],[b],[c]]
    if (Array.isArray(arr[0]) && (arr[0] as any[]).length === 1) {
      const vals = (arr as any[][]).map(r => this._fmtNum(r[0]));
      return `<span class="mat-bracket">[</span><table class="mat-inner"><tbody>${
        vals.map(v => `<tr><td>${v}</td></tr>`).join("")
      }</tbody></table><span class="mat-bracket">]</span>`;
    }

    // Matriz 2D
    if (Array.isArray(arr[0])) {
      const rows = arr as any[][];
      return `<span class="mat-bracket">[</span><table class="mat-inner"><tbody>${
        rows.map(row =>
          `<tr>${row.map(v => `<td>${this._fmtNum(v)}</td>`).join("")}</tr>`
        ).join("")
      }</tbody></table><span class="mat-bracket">]</span>`;
    }

    // Vector fila
    return `[${arr.map(v => this._fmtNum(v)).join(", ")}]`;
  }

  /** Verifica si un valor es una matriz math.js */
  isMatrix(value: any): boolean {
    return value && typeof value === "object" && typeof value.toArray === "function";
  }

  /** Verifica si un valor es un cell array */
  isCellArray(value: any): boolean {
    return value && typeof value === "object" && (value as any).__cell === true;
  }

  /** Genera HTML para un cell array: {V₁ = [...], V₂ = [...], ...} con subíndices */
  formatCellHTML(value: any, varName?: string): string {
    if (!value || !(value as any).__cell) return this._formatValue(value);
    const elems = (value as any).elements as any[];
    const parts = elems.map((e: any, i: number) => {
      const label = varName
        ? `<span class="cell-label">${varName}<sub>${i + 1}</sub></span> = `
        : "";
      if (this.isMatrix(e)) {
        return `<span class="cell-element">${label}${this.formatMatrixHTML(e)}</span>`;
      }
      return `<span class="cell-element">${label}${this._fmtNum(e)}</span>`;
    });
    return `<span class="cell-array"><span class="cell-brace">{</span>${parts.join('<span class="cell-sep">,</span>')}<span class="cell-brace">}</span></span>`;
  }

  private _fmtNum(v: any): string {
    if (typeof v === "number") {
      if (Number.isInteger(v)) return String(v);
      // Mas precision para resultados de lusolve
      if (Math.abs(v) < 0.0001 || Math.abs(v) > 1e8) {
        return v.toPrecision(6);
      }
      return (Math.round(v * 10000) / 10000).toString();
    }
    return String(v);
  }
}

// ─── Instancia singleton ────────────────────────────────
export const hekatanEvaluator = new HekatanEvaluator();

// ─── Export math.js instance ────────────────────────────
export { math };

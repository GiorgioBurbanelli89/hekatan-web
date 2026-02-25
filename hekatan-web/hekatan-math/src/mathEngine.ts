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
  type: "assignment" | "expression" | "comment" | "heading" | "empty" | "directive" | "cells" | "error";
  varName?: string;
  value?: any;
  display?: string;
  error?: string;
  cells?: CellResult[];
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
    // Asignacion: var = expr (no == ni <=)
    const assignMatch = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = assignMatch[2];
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
      const body = fnMatch[3];
      const fnExpr = `${fnName}(${params.join(",")}) = ${body}`;
      math.evaluate(fnExpr, this.scope);
      return {
        type: "assignment", varName: fnName,
        display: `${fnName}(${params.join(", ")}) = ${body}`
      };
    }

    // Expresion pura
    const value = math.evaluate(line, this.scope);
    return { type: "expression", value, display: this._formatValue(value) };
  }

  // ─── Formateo ─────────────────────────────────────────
  formatValue(value: any): string {
    return this._formatValue(value);
  }

  private _formatValue(value: any): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "function") return "[function]";

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

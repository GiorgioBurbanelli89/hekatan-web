/**
 * MathEditor - Canvas-based WYSIWYG math editor (like Mathcad)
 * Port del WPF MathEditorControl a TypeScript/Canvas
 */
import * as S from "./MathStyles";
import {
  MathElement, MathGroup, MathText, MathFraction, MathPower, MathRoot,
  MathSubscript, MathIntegral, MathDerivative, MathMatrix, MathVector,
  MathComment, MathCode, MathColumns, MathSvg, MathDraw, MathDraw3D, MathImportIfc,
} from "./MathElement";
import { parseExpression, type ASTNode } from "../evaluator.js";
import { HekatanEvaluator } from "../mathEngine.js";

const BASE_FONT_SIZE = 14; // 10.5pt (matches Output CSS font-size: 10.5pt)
const BASE_LINE_HEIGHT = 16.8; // 120% line-height (matches Output CSS line-height: 120%)

export class MathEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // Grid 2D: grid[row][col] = MathElement[] (elements in that cell)
  private grid: MathElement[][][] = [];
  private currentRow = 0;
  private currentCol = 0;
  private currentElement: MathElement | null = null;
  private zoomLevel = 1.0;
  private fontSize = BASE_FONT_SIZE;
  private lineHeight = BASE_LINE_HEIGHT;
  private cursorVisible = true;
  private cursorTimer: number | null = null;
  private scrollY = 0;
  private contentHeight = 0;  // actual rendered content height
  private scrollbarDragging = false;
  private scrollbarDragStartY = 0;
  private scrollbarDragStartScroll = 0;
  private clickIndicator: { x: number; y: number; alpha: number; timer: number | null } = { x: 0, y: 0, alpha: 0, timer: null };
  private autoRun = true;
  /** Last computed render scale (autoFit * zoomLevel) — use to sync Output panel */
  lastScale = 1;
  private autoRunTimer: number | null = null;
  /** Rows rendered in the last frame (used for hit-test filtering) */
  private visibleRows = new Set<number>();

  /** Minimum cell width in pixels */
  private readonly minCellWidth = 40;
  /** Padding between cells */
  private readonly cellGap = 16;

  /** Evaluation results per cell [row][col] */
  private cellResults: string[][] = [];
  /** Raw values per cell (for matrix/vector formatted rendering) */
  private cellResultValues: (any | null)[][] = [];
  /** Whether evaluation needs to rerun */
  private needsEval = true;
  /** Shared math.js evaluator (supports matrices, vectors, etc.) */
  private evaluator = new HekatanEvaluator();
  /** Tracks which grid rows are @{cells} rows (for serialization) */
  private cellsRowFlags = new Set<number>();

  /** Callback para cuando el contenido cambia (AutoRun) */
  onContentChanged: ((code: string) => void) | null = null;

  /** Callback para cuando se ejecuta (F5 / Ctrl+Enter) */
  onExecute: ((code: string) => void) | null = null;

  /** Fires when scroll position changes (fraction 0..1) */
  onScrollChange: ((fraction: number) => void) | null = null;
  /** Fires when zoom level changes */
  onZoomChange: ((zoomLevel: number) => void) | null = null;

  /** Debug click callback — fires on every mousedown with diagnostic info */
  onDebugClick: ((info: {
    mouseX: number; mouseY: number;
    contentX: number; contentY: number;
    foundRow: number; foundCol: number;
    elementType: string; elementText: string;
    cursorRow: number; cursorElement: string;
  }) => void) | null = null;

  /** Get current cell (array of elements) */
  get currentCell(): MathElement[] {
    return this.grid[this.currentRow]?.[this.currentCol] ?? [];
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    // Grid inicial: una fila con una celda vacia
    const initial = new MathText();
    initial.isCursorHere = true;
    this.grid.push([[initial]]);
    this.currentElement = initial;

    // Event listeners
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.addEventListener("keydown", e => this._onKeyDown(e));
    canvas.addEventListener("mousedown", e => this._onMouseDown(e));
    canvas.addEventListener("mousemove", e => this._onMouseMove(e));
    canvas.addEventListener("mouseup", () => this._onMouseUp());
    canvas.addEventListener("mouseleave", () => this._onMouseUp());
    canvas.addEventListener("wheel", e => this._onWheel(e), { passive: false });
    canvas.addEventListener("focus", () => this._startCursor());
    canvas.addEventListener("blur", () => this._stopCursor());

    // Resize observer
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(canvas.parentElement ?? canvas);
    this._resize();
    this._startCursor();
    this.render();
  }

  // ==========================================================================
  // Público
  // ==========================================================================

  /** Debug: returns element bounding info for all rows */
  getElementBounds(): { row: number; elements: { type: string; text: string; x: number; y: number; w: number; h: number }[] }[] {
    const result: { row: number; elements: { type: string; text: string; x: number; y: number; w: number; h: number }[] }[] = [];
    for (let ri = 0; ri < this.grid.length; ri++) {
      const row = this.grid[ri];
      const elems: { type: string; text: string; x: number; y: number; w: number; h: number }[] = [];
      for (let ci = 0; ci < row.length; ci++) {
        for (const el of row[ci]) {
          elems.push({
            type: el.constructor.name,
            text: el instanceof MathText ? el.text : el.toHekatan().slice(0, 30),
            x: Math.round(el.x), y: Math.round(el.y),
            w: Math.round(el.width), h: Math.round(el.height),
          });
        }
      }
      result.push({ row: ri, elements: elems });
    }
    return result;
  }

  /** Obtiene todo el contenido como texto Hekatan */
  toHekatan(): string {
    return this.grid.map((row, ri) => {
      if (this.cellsRowFlags.has(ri)) {
        // Serialize as @{cells} |a=1|b=2|c=3|
        const cellTexts = row.map(cell =>
          cell.map(el => el.toHekatan()).join("")
        );
        return `@{cells} |${cellTexts.join("|")}|`;
      }
      return row.map(cell => {
        return cell.map(el => el.toHekatan()).join("");
      }).join("\t");
    }).join("\n");
  }

  /** Carga contenido desde texto Hekatan */
  loadFromText(text: string) {
    this.grid = [];
    this.cellsRowFlags = new Set<number>();
    const rawLines = text.split("\n");
    let i = 0;
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trim();

      // @{cells} |a=1|b=2|c=3|
      if (/^@\{cells\}\s*\|/.test(trimmed)) {
        const content = trimmed.replace(/^@\{cells\}\s*/, "");
        const parts = content.split("|").filter(p => p.trim());
        const row: MathElement[][] = parts.map(part => {
          return this._parseLine(part.trim());
        });
        const rowIdx = this.grid.length;
        this.grid.push(row);
        this.cellsRowFlags.add(rowIdx);
        i++;
        continue;
      }

      // @{columns N}
      const colMatch = trimmed.match(/^@\{columns\s+(\d+)\}/i);
      if (colMatch) {
        const cols = new MathColumns(parseInt(colMatch[1]));
        let colIdx = 0;
        i++;
        while (i < rawLines.length) {
          const lt = rawLines[i].trim();
          if (/^@\{end\s+columns\}/i.test(lt)) break;
          // Auto-close columns if another @{} directive is encountered
          if (/^@\{(?!column\})\w+/i.test(lt)) { i--; break; }
          if (/^@\{column\}/i.test(lt)) { colIdx++; i++; continue; }
          for (const el of this._parseLine(rawLines[i])) {
            cols.addElement(colIdx, el);
          }
          i++;
        }
        this.grid.push([[cols]]);
        i++;
        continue;
      }

      // @{svg W H} ... @{end svg}  — SVG drawing DSL
      const svgMatch = trimmed.match(/^@\{svg(?:\s+(\d+)(?:\s+(\d+))?)?\s*\}$/i);
      if (svgMatch) {
        const svgW = svgMatch[1] ? parseInt(svgMatch[1]) : 500;
        const svgH = svgMatch[2] ? parseInt(svgMatch[2]) : (svgMatch[1] ? Math.round(parseInt(svgMatch[1]) * 0.75) : 400);
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length) {
          if (/^@\{end\s+svg\}/i.test(rawLines[i].trim())) break;
          codeLines.push(rawLines[i]);
          i++;
        }
        this.grid.push([[new MathSvg(codeLines.join("\n"), svgW, svgH)]]);
        i++;
        continue;
      }

      // @{draw W H}, @{draw:2D W H}, @{draw:3D W H}, @{draw:3D:IFC W H}
      const drawMatch = trimmed.match(/^@\{draw(?::(2D|3D|3D:IFC))?(?:\s+(\d+%?)(?:\s+(\d+%?))?(?:\s+(left|right|center))?)?\s*\}$/i);
      if (drawMatch) {
        const mode = (drawMatch[1] || "2D").toUpperCase();
        const dW = drawMatch[2] ? parseInt(drawMatch[2]) : 600;
        const dH = drawMatch[3] ? parseInt(drawMatch[3]) : (drawMatch[2] ? Math.round(parseInt(drawMatch[2]) * 0.67) : 400);
        const align = (drawMatch[4] as "left" | "right" | "center") || "center";
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length) {
          if (/^@\{end\s+draw\}/i.test(rawLines[i].trim())) break;
          codeLines.push(rawLines[i]);
          i++;
        }
        if (mode === "3D" || mode === "3D:IFC") {
          this.grid.push([[new MathDraw3D(codeLines.join("\n"), dW, dH)]]);
        } else {
          this.grid.push([[new MathDraw(codeLines.join("\n"), dW, dH, align)]]);
        }
        i++;
        continue;
      }

      // @{import:ifc:filename W H} - IFC 3D model
      const ifcMatch = trimmed.match(/^@\{import:ifc:([^\s}]+)(?:\s+(\d+))?(?:\s+(\d+))?\s*\}$/i);
      if (ifcMatch) {
        const ifcFile = ifcMatch[1];
        const ifcW = ifcMatch[2] ? parseInt(ifcMatch[2]) : 700;
        const ifcH = ifcMatch[3] ? parseInt(ifcMatch[3]) : 500;
        this.grid.push([[new MathImportIfc(ifcFile, ifcW, ifcH)]]);
        i++;
        continue;
      }

      // @{text} ... @{end text}  — flowing text (each line becomes a MathComment row)
      if (/^@\{text\}$/i.test(trimmed)) {
        i++;
        while (i < rawLines.length) {
          if (/^@\{end\s+text\}/i.test(rawLines[i].trim())) break;
          const tLine = rawLines[i];
          const tTrimmed = tLine.trim();
          if (!tTrimmed) {
            this.grid.push([[new MathComment("")]]);
          } else {
            // Strip leading > if present (blockquote style)
            const cleaned = tTrimmed.startsWith(">") ? tTrimmed.slice(1).trimStart() : tTrimmed;
            this.grid.push([[new MathComment("> " + cleaned)]]);
          }
          i++;
        }
        i++;
        continue;
      }

      // @{eq} ... @{end eq}  — display equations (centered, italic, serif, eq numbers)
      if (/^@\{eq\b/i.test(trimmed)) {
        const eqLines: string[] = [];
        i++;
        while (i < rawLines.length) {
          if (/^@\{end\s+eq\}/i.test(rawLines[i].trim())) break;
          eqLines.push(rawLines[i]);
          i++;
        }
        // Each equation line becomes a centered equation MathComment
        for (const eLine of eqLines) {
          const et = eLine.trim();
          if (et) {
            this.grid.push([[new MathComment(et, true)]]);
          }
        }
        i++;
        continue;
      }

      // @{python/js/etc} blocks (generic code blocks)
      const blockMatch = trimmed.match(/^@\{(\w+)\}$/);
      if (blockMatch && !["column", "end"].some(k => trimmed.includes(k))) {
        const lang = blockMatch[1];
        const codeLines: string[] = [];
        i++;
        while (i < rawLines.length) {
          if (rawLines[i].trim().match(new RegExp(`^@\\{end\\s+${lang}\\}`, "i"))) break;
          codeLines.push(rawLines[i]);
          i++;
        }
        this.grid.push([[new MathCode(codeLines.join("\n"), lang)]]);
        i++;
        continue;
      }

      // Linea normal: split por tab para obtener celdas
      const cellTexts = rawLines[i].split("\t");
      const row: MathElement[][] = cellTexts.map(cellText => {
        return this._parseLine(cellText);
      });
      this.grid.push(row);
      i++;
    }

    if (this.grid.length === 0) {
      this.grid.push([[new MathText()]]);
    }
    this.currentRow = 0;
    this.currentCol = 0;
    this.currentElement = this._getFirstTextElement(this.grid[0][0]);
    if (this.currentElement) this.currentElement.isCursorHere = true;
    this.needsEval = true;
    this.evaluateAll();
    this._notifyDrawFocus();
    this.render();
    // Ensure cursor blink timer is running and canvas has focus
    this._startCursor();
    this.canvas.focus();
  }

  /** Zoom in/out — CSS zoom is applied externally; canvas is resized to compensate */
  setZoom(level: number) {
    this.zoomLevel = Math.max(0.5, Math.min(3.0, level));
    // Resize canvas to compensate for CSS zoom (canvas CSS size = container / zoomLevel)
    this._resize();
    if (this.onZoomChange) this.onZoomChange(this.zoomLevel);
  }

  /** Public resize (triggers _resize) */
  resize() { this._resize(); }

  // ==========================================================================
  // Debug CLI API - Para testing interactivo del cursor y elementos
  // ==========================================================================

  /** Devuelve info completa del estado actual del editor para debug */
  getDebugInfo(): Record<string, any> {
    const el = this.currentElement;
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const elIdx = el ? cell.indexOf(el) : -1;
    const info: Record<string, any> = {
      row: this.currentRow,
      col: this.currentCol,
      totalRows: this.grid.length,
      totalCols: this.grid[this.currentRow]?.length ?? 0,
      elementIndex: elIdx,
      elementsInCell: cell.length,
      fontSize: this.fontSize,
      lineHeight: this.lineHeight,
      zoomLevel: this.zoomLevel,
      cursorVisible: this.cursorVisible,
      cursorTimer: this.cursorTimer !== null,
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
      scrollY: this.scrollY,
      contentHeight: this.contentHeight,
    };
    if (el) {
      info.element = {
        type: el.constructor.name,
        x: Math.round(el.x * 100) / 100,
        y: Math.round(el.y * 100) / 100,
        width: Math.round(el.width * 100) / 100,
        height: Math.round(el.height * 100) / 100,
        isCursorHere: el.isCursorHere,
      };
      if (el instanceof MathText) {
        info.element.text = el.text;
        info.element.displayText = el.displayText;
        info.element.cursorPosition = el.cursorPosition;
        info.element.textLength = el.text.length;
      } else if (el instanceof MathComment) {
        info.element.text = el.text;
        info.element.displayText = el.displayText;
        info.element.cursorPosition = el.cursorPosition;
        info.element.textLength = el.text.length;
      }
    }
    return info;
  }

  /** Lista todos los elementos en una fila con sus coordenadas y texto */
  getRowElements(row?: number): Record<string, any>[] {
    const r = row ?? this.currentRow;
    if (r < 0 || r >= this.grid.length) return [];
    const result: Record<string, any>[] = [];
    const gridRow = this.grid[r];
    for (let c = 0; c < gridRow.length; c++) {
      for (let e = 0; e < gridRow[c].length; e++) {
        const el = gridRow[c][e];
        const entry: Record<string, any> = {
          row: r, col: c, idx: e,
          type: el.constructor.name,
          x: Math.round(el.x * 100) / 100,
          y: Math.round(el.y * 100) / 100,
          w: Math.round(el.width * 100) / 100,
          h: Math.round(el.height * 100) / 100,
          cursor: el.isCursorHere,
        };
        if (el instanceof MathText) {
          entry.text = el.text;
          entry.display = el.displayText;
          entry.cursorPos = el.cursorPosition;
        } else if (el instanceof MathComment) {
          entry.text = el.text;
          entry.display = el.displayText;
          entry.cursorPos = el.cursorPosition;
        }
        result.push(entry);
      }
    }
    return result;
  }

  /** Devuelve las coordenadas pixel de cada carácter del elemento actual */
  getCharCoords(): Record<string, any>[] {
    const el = this.currentElement;
    if (!el) return [];
    const ctx = this.ctx;
    const fs = this.fontSize;
    let dt = "";
    let font = `${fs}px ${S.EquationFont}`;
    if (el instanceof MathText) {
      dt = el.displayText;
    } else if (el instanceof MathComment) {
      dt = el.displayText || el.text;
      font = `${fs}px ${S.UIFont}`;
    } else {
      return [];
    }
    ctx.font = font;
    const chars: Record<string, any>[] = [];
    let cx = el.x;
    for (let i = 0; i < dt.length; i++) {
      const ch = dt[i];
      const cw = ctx.measureText(ch).width;
      chars.push({
        idx: i,
        char: ch,
        x: Math.round(cx * 100) / 100,
        y: Math.round(el.y * 100) / 100,
        w: Math.round(cw * 100) / 100,
        h: Math.round(el.height * 100) / 100,
      });
      cx += cw;
    }
    return chars;
  }

  /** Mueve el cursor a la izquierda (público) */
  moveCursorLeft() { this._moveCursorLeft(); this.cursorVisible = true; this.render(); }
  /** Mueve el cursor a la derecha (público) */
  moveCursorRight() { this._moveCursorRight(); this.cursorVisible = true; this.render(); }
  /** Mueve el cursor arriba (público) */
  moveCursorUp() { this._moveCursorUp(); this.cursorVisible = true; this.render(); }
  /** Mueve el cursor abajo (público) */
  moveCursorDown() { this._moveCursorDown(); this.cursorVisible = true; this.render(); }

  /** Mueve el cursor a una fila y columna específica */
  moveCursorTo(row: number, col: number, charPos?: number) {
    if (row < 0 || row >= this.grid.length) return "Error: fila fuera de rango";
    const gridRow = this.grid[row];
    if (col < 0 || col >= gridRow.length) return "Error: columna fuera de rango";
    if (this.currentElement) this.currentElement.isCursorHere = false;
    this.currentRow = row;
    this.currentCol = col;
    const cell = gridRow[col];
    const first = this._getFirstTextElement(cell);
    if (first) {
      first.isCursorHere = true;
      this.currentElement = first;
      if (charPos !== undefined && first instanceof MathText) {
        first.cursorPosition = Math.min(charPos, first.text.length);
      }
      if (charPos !== undefined && first instanceof MathComment) {
        first.cursorPosition = Math.min(charPos, (first as any)._text?.length ?? 0);
      }
    }
    this.cursorVisible = true;
    this.render();
    return `OK: cursor en [${row},${col}]` + (charPos !== undefined ? ` pos=${charPos}` : "");
  }

  /** Inserta texto en la posición actual del cursor */
  typeText(text: string) {
    const el = this.currentElement;
    if (!el) return "Error: no hay elemento activo";
    if (el instanceof MathText || el instanceof MathComment) {
      for (const ch of text) el.insertChar(ch);
      this._recheckLineType();
      this._triggerAutoRun();
      this.render();
      const cur = this.currentElement as any;
      return `OK: insertado "${text}" en pos ${cur.cursorPosition}`;
    }
    return "Error: elemento no es MathText ni MathComment";
  }

  /** Elimina N caracteres hacia atrás (backspace) */
  deleteBack(n: number = 1) {
    const el = this.currentElement;
    if (!el || !(el instanceof MathText || el instanceof MathComment))
      return "Error: no MathText ni MathComment";
    for (let i = 0; i < n; i++) el.deleteChar();
    this._recheckLineType();
    this._triggerAutoRun();
    this.render();
    const cur = this.currentElement as any;
    return `OK: eliminados ${n} chars, texto="${cur.text}" pos=${cur.cursorPosition}`;
  }

  /** Simula un click en coordenadas del canvas (internal CSS pixels) */
  simulateClick(canvasX: number, canvasY: number) {
    // Fake event with offsetX/offsetY — _onMouseDown detects missing clientX
    // and uses offsetX/offsetY directly as canvas-space coordinates.
    const fakeEvent = { offsetX: canvasX, offsetY: canvasY, button: 0, preventDefault: () => {} } as any;
    this._onMouseDown(fakeEvent);
    this.cursorVisible = true;
    this.render();
    const el = this.currentElement;
    if (el) {
      const cursorInfo = (el instanceof MathText || el instanceof MathComment)
        ? ` cursorPos=${(el as any).cursorPosition}/${el.text.length}` : "";
      return `OK: click(${canvasX},${canvasY}) → ${el.constructor.name} en [${this.currentRow},${this.currentCol}]${cursorInfo}`;
    }
    return `OK: click(${canvasX},${canvasY}) → sin elemento`;
  }

  // ─── Insertar estructuras matemáticas (para debug CLI) ───

  /** Inserta una fracción en la posición actual */
  insertFraction(num?: string, den?: string): string {
    const numEl = new MathText(num ?? "");
    const denEl = new MathText(den ?? "");
    const frac = new MathFraction(numEl, denEl);
    return this._insertStructure(frac, denEl);
  }

  /** Inserta una potencia (superíndice) */
  insertPower(base?: string, exp?: string): string {
    const baseEl = new MathText(base ?? "");
    const expEl = new MathText(exp ?? "");
    const pow = new MathPower(baseEl, expEl);
    return this._insertStructure(pow, expEl);
  }

  /** Inserta un subíndice */
  insertSubscript(base?: string, sub?: string): string {
    const baseEl = new MathText(base ?? "");
    const subEl = new MathText(sub ?? "");
    // MathSubscript stores subscript within parent MathText
    // Just insert base_sub text
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = this.currentElement ? cell.indexOf(this.currentElement) : cell.length - 1;
    const combined = new MathText(`${base ?? "x"}_${sub ?? "i"}`);
    cell.splice(idx + 1, 0, combined);
    this._setCursor(combined);
    combined.cursorPosition = combined.text.length;
    this.needsEval = true;
    this.render();
    return `OK: subscript '${base}_${sub}' insertado`;
  }

  /** Inserta una raíz cuadrada */
  insertRoot(radicand?: string): string {
    const radEl = new MathText(radicand ?? "");
    const root = new MathRoot(radEl);
    return this._insertStructure(root, radEl);
  }

  /** Inserta una integral */
  insertIntegral(lower?: string, upper?: string, integrand?: string): string {
    const lowerEl = new MathText(lower ?? "0");
    const upperEl = new MathText(upper ?? "1");
    const intEl = new MathIntegral(lowerEl, upperEl);
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = this.currentElement ? cell.indexOf(this.currentElement) : cell.length - 1;
    cell.splice(idx + 1, 0, intEl);
    if (integrand) {
      const body = new MathText(integrand);
      cell.splice(idx + 2, 0, body);
    }
    this._setCursor(lowerEl);
    this.needsEval = true;
    this.render();
    return `OK: integral insertada [${lower ?? "0"}, ${upper ?? "1"}]`;
  }

  /** Inserta una derivada */
  insertDerivative(func?: string, variable?: string): string {
    const fEl = new MathText(func ?? "f");
    const vEl = new MathText(variable ?? "x");
    const deriv = new MathDerivative(fEl, vEl);
    return this._insertStructure(deriv, fEl);
  }

  /** Inserta una matriz NxM */
  insertMatrix(rows: number = 2, cols: number = 2, values?: string[][]): string {
    const cells: MathText[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: MathText[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(new MathText(values?.[r]?.[c] ?? "0"));
      }
      cells.push(row);
    }
    const mat = new MathMatrix(cells);
    return this._insertStructure(mat, cells[0][0]);
  }

  /** Inserta un vector (columna) */
  insertVector(elements: string[] = ["0", "0", "0"]): string {
    const els = elements.map(v => new MathText(v));
    const vec = new MathVector(els);
    return this._insertStructure(vec, els[0]);
  }

  /** Inserta una nueva fila con texto en la posición actual */
  insertLine(text: string): string {
    const newRow: MathElement[][] = [this._parseLine(text)];
    this.grid.splice(this.currentRow + 1, 0, newRow);
    this.currentRow++;
    this.currentCol = 0;
    const cell = this.grid[this.currentRow][0];
    this.currentElement = this._getFirstTextElement(cell);
    if (this.currentElement) this.currentElement.isCursorHere = true;
    this._triggerAutoRun();
    this.render();
    return `OK: línea insertada en fila ${this.currentRow}: "${text}"`;
  }

  /** Helper: inserta estructura en la celda actual */
  private _insertStructure(struct: MathElement, focusEl: MathElement): string {
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = this.currentElement ? cell.indexOf(this.currentElement) : cell.length - 1;
    cell.splice(idx + 1, 0, struct);
    this._setCursor(focusEl);
    this.needsEval = true;
    this.render();
    return `OK: ${struct.constructor.name} insertado en [${this.currentRow},${this.currentCol}]`;
  }

  // ==========================================================================
  // Evaluation (Mathcad-like: show results after each expression)
  // ==========================================================================

  /** Evaluate all cells and store results */
  evaluateAll() {
    this.evaluator.reset();
    this.cellResults = [];
    this.cellResultValues = [];

    for (const row of this.grid) {
      const rowResults: string[] = [];
      const rowValues: (any | null)[] = [];
      for (const cell of row) {
        const text = cell.map(el => el.toHekatan()).join("").trim();

        // Skip empty, comments, headings, directives
        if (!text || text.startsWith("'") || text.startsWith("#") || text.startsWith("@{")) {
          rowResults.push("");
          rowValues.push(null);
          continue;
        }

        // Skip markdown-like lines (> blockquote)
        if (text.startsWith(">")) {
          rowResults.push("");
          rowValues.push(null);
          continue;
        }

        // Function definition: f(x) = expr — math.js handles this directly
        const fnMatch = text.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);
        if (fnMatch) {
          try {
            this.evaluator.eval(text);
          } catch { /* skip */ }
          rowResults.push("");
          rowValues.push(null);
          continue;
        }

        try {
          const val = this.evaluator.eval(text);
          const resultStr = this._formatValue(val);

          // For assignments like "a = 3", check if RHS is already the result
          const assignMatch = text.match(/^[A-Za-z_]\w*\s*=\s*(.+)$/);
          if (assignMatch) {
            const rhsText = assignMatch[1].trim();
            // If RHS is a simple literal that equals the result, don't show redundant result
            if (rhsText === resultStr || rhsText === String(val)) {
              rowResults.push("");
              rowValues.push(null);
            } else {
              rowResults.push(resultStr);
              rowValues.push(val);
            }
          } else {
            rowResults.push(resultStr);
            rowValues.push(val);
          }
        } catch (e: any) {
          rowResults.push("err");
          rowValues.push(null);
        }
      }
      this.cellResults.push(rowResults);
      this.cellResultValues.push(rowValues);
    }
    this.needsEval = false;
  }

  private _formatValue(val: any): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "function") return "";

    // math.js Matrix
    if (val && typeof val === "object" && typeof val.toArray === "function") {
      const arr = val.toArray();
      if (Array.isArray(arr[0])) {
        // 2D matrix
        return "[" + (arr as any[][]).map((r: any[]) =>
          r.map((v: any) => this._fmtNum(v)).join(", ")
        ).join("; ") + "]";
      }
      // 1D vector
      return "[" + (arr as any[]).map((v: any) => this._fmtNum(v)).join(", ") + "]";
    }

    if (Array.isArray(val)) {
      if (Array.isArray(val[0])) {
        return "[" + (val as number[][]).map(r =>
          r.map(v => this._fmtNum(v)).join(", ")
        ).join("; ") + "]";
      }
      return "[" + (val as number[]).map(v => this._fmtNum(v)).join(", ") + "]";
    }

    return this._fmtNum(val);
  }

  /** Convert a variable name to MathElement, handling underscores → subscripts.
   *  Greek names are handled in display via transformOperatorsForDisplay. */
  private _varToElement(name: string): MathElement {
    // Split on first underscore: E_s → base="E", sub="s"
    const uIdx = name.indexOf("_");
    if (uIdx >= 0 && uIdx < name.length - 1) {
      const baseName = name.slice(0, uIdx);
      const subName = name.slice(uIdx + 1);
      const baseEl = new MathText(baseName);
      const subEl = new MathText(subName);
      return new MathSubscript(baseEl, subEl);
    }
    return new MathText(name);
  }

  private _fmtNum(n: number): string {
    if (!isFinite(n)) return String(n);
    if (Number.isInteger(n)) return String(n);
    // Remove trailing zeros
    return n.toFixed(4).replace(/\.?0+$/, "");
  }

  // ==========================================================================
  // Parser de línea
  // ==========================================================================

  /** Parse a raw line into MathElement[] (one cell's worth) */
  private _parseLine(raw: string): MathElement[] {
    const trimmed = raw.trim();

    // Empty line
    if (!trimmed) return [new MathText("")];

    // Markdown: # heading
    if (/^#{1,6}\s/.test(trimmed)) {
      return [new MathComment(trimmed)];
    }

    // Comment: starts with '
    if (trimmed.startsWith("'")) {
      return [new MathComment(trimmed)];
    }

    // Blockquote: starts with >
    if (trimmed.startsWith(">")) {
      return [new MathComment(trimmed)];
    }

    // Function definition: f(x) = expr  or  f(x, y) = expr
    const fnMatch = trimmed.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);
    if (fnMatch) {
      const name = fnMatch[1];
      const params = fnMatch[2];
      const bodyElements = this._parseExpressionToElements(fnMatch[3]);
      return [new MathText(`${name}(${params}) = `), ...bodyElements];
    }

    // Expression: parse AST and convert to MathElements
    return this._parseExpressionToElements(trimmed);
  }

  /** Parse expression text → AST → formatted MathElement[] */
  private _parseExpressionToElements(text: string): MathElement[] {
    try {
      const ast = parseExpression(text);
      return this._astToElements(ast);
    } catch {
      // Fallback: plain text
      return [new MathText(text)];
    }
  }

  /** Convert AST node to array of MathElements */
  private _astToElements(node: ASTNode): MathElement[] {
    switch (node.type) {
      case "number":
        return [new MathText(this._fmtNum(node.value))];

      case "variable":
        return [this._varToElement(node.name)];

      case "assign": {
        const lhs = [this._varToElement(node.name), new MathText(" = ")];
        return [...lhs, ...this._astToElements(node.expr)];
      }

      case "binary": {
        const bn = node as Extract<ASTNode, { type: "binary" }>;
        // Division → MathFraction
        if (bn.op === "/") {
          const num = this._astToSingle(bn.left);
          const den = this._astToSingle(bn.right);
          return [new MathFraction(num, den)];
        }
        // Power → MathPower
        if (bn.op === "^") {
          const base = this._astToSingle(bn.left);
          const exp = this._astToSingle(bn.right);
          return [new MathPower(base, exp)];
        }
        // Other operators: store raw op, displayText handles visual transform
        return [
          ...this._astToElements(bn.left),
          new MathText(` ${bn.op} `),
          ...this._astToElements(bn.right),
        ];
      }

      case "unary": {
        const un = node as Extract<ASTNode, { type: "unary" }>;
        return [new MathText(un.op), ...this._astToElements(un.operand)];
      }

      case "call": {
        const cn = node as Extract<ASTNode, { type: "call" }>;
        // sqrt → MathRoot
        if (cn.name === "sqrt" && cn.args.length === 1) {
          const content = this._astToSingle(cn.args[0]);
          return [new MathRoot(content)];
        }
        // root(x, n) → MathRoot with index
        if (cn.name === "root" && cn.args.length === 2) {
          const content = this._astToSingle(cn.args[0]);
          const index = this._astToSingle(cn.args[1]);
          return [new MathRoot(content, index)];
        }
        // Generic function: name(args)
        const argsElements: MathElement[] = [];
        for (let i = 0; i < cn.args.length; i++) {
          if (i > 0) argsElements.push(new MathText(", "));
          argsElements.push(...this._astToElements(cn.args[i]));
        }
        return [
          new MathText(cn.name + "("),
          ...argsElements,
          new MathText(")"),
        ];
      }

      case "vector": {
        const vn = node as Extract<ASTNode, { type: "vector" }>;
        const vec = new MathVector(vn.elements.length, false);
        for (let i = 0; i < vn.elements.length; i++) {
          const el = this._astToSingle(vn.elements[i]);
          vec.elements[i] = el;
          el.parent = vec;
        }
        return [vec];
      }

      case "matrix": {
        const mn = node as Extract<ASTNode, { type: "matrix" }>;
        const nRows = mn.rows.length;
        const nCols = mn.rows[0]?.length ?? 0;
        const mat = new MathMatrix(nRows, nCols);
        for (let i = 0; i < nRows; i++) {
          for (let j = 0; j < mn.rows[i].length; j++) {
            const cellEl = this._astToSingle(mn.rows[i][j]);
            mat.cells[i][j] = cellEl;
            cellEl.parent = mat;
          }
        }
        return [mat];
      }

      case "cellarray": {
        const ca = node as Extract<ASTNode, { type: "cellarray" }>;
        const elems: MathElement[] = [new MathText("{")];
        for (let i = 0; i < ca.elements.length; i++) {
          if (i > 0) elems.push(new MathText("; "));
          elems.push(...this._astToElements(ca.elements[i]));
        }
        elems.push(new MathText("}"));
        return elems;
      }

      case "index": {
        const idx = node as Extract<ASTNode, { type: "index" }>;
        const baseElements = this._astToElements(idx.target);
        const indexTexts = idx.indices.map(n => this._astToText(n));
        return [...baseElements, new MathText(`[${indexTexts.join(", ")}]`)];
      }

      case "range": {
        const rn = node as Extract<ASTNode, { type: "range" }>;
        return [new MathText(`${this._astToText(rn.start)}:${this._astToText(rn.end)}`)];
      }

      default:
        return [new MathText("?")];
    }
  }

  /** Convert AST to a single MathElement (combine multiple into MathGroup) */
  private _astToSingle(node: ASTNode): MathElement {
    const elements = this._astToElements(node);
    if (elements.length === 1) return elements[0];
    // Wrap multiple elements in a MathGroup container
    return new MathGroup(elements);
  }

  /** Convert AST to plain text representation */
  private _astToText(node: ASTNode): string {
    switch (node.type) {
      case "number": return this._fmtNum(node.value);
      case "variable": return node.name;
      case "assign": return `${node.name} = ${this._astToText(node.expr)}`;
      case "binary": {
        const bn = node as Extract<ASTNode, { type: "binary" }>;
        const l = this._astToText(bn.left);
        const r = this._astToText(bn.right);
        return `${l} ${bn.op} ${r}`;
      }
      case "unary": {
        const un = node as Extract<ASTNode, { type: "unary" }>;
        return `${un.op}${this._astToText(un.operand)}`;
      }
      case "call": {
        const cn = node as Extract<ASTNode, { type: "call" }>;
        return `${cn.name}(${cn.args.map(a => this._astToText(a)).join(", ")})`;
      }
      case "index": {
        const idx = node as Extract<ASTNode, { type: "index" }>;
        return `${this._astToText(idx.target)}[${idx.indices.map(n => this._astToText(n)).join(",")}]`;
      }
      case "vector": {
        const vn = node as Extract<ASTNode, { type: "vector" }>;
        return `[${vn.elements.map(e => this._astToText(e)).join(", ")}]`;
      }
      case "matrix": {
        const mn = node as Extract<ASTNode, { type: "matrix" }>;
        const rows = mn.rows.map(r => "[" + r.map(e => this._astToText(e)).join(", ") + "]");
        return "[" + rows.join(", ") + "]";
      }
      case "range": {
        const rn = node as Extract<ASTNode, { type: "range" }>;
        return `${this._astToText(rn.start)}:${this._astToText(rn.end)}`;
      }
      default: return "?";
    }
  }

  private _getFirstTextElement(cell: MathElement[]): MathElement | null {
    for (const el of cell) {
      if (el instanceof MathText || el instanceof MathComment) return el;
      // Recursivo para MathColumns
      if (el instanceof MathColumns) {
        for (const col of el.columns) {
          for (const cel of col) {
            if (cel instanceof MathText) return cel;
          }
        }
      }
    }
    return cell[0] ?? null;
  }

  // ==========================================================================
  // Teclado
  // ==========================================================================

  private _onKeyDown(e: KeyboardEvent) {
    const el = this.currentElement;

    // F5 = Ejecutar
    if (e.key === "F5") {
      e.preventDefault();
      this.evaluateAll();
      this.render();
      this.onExecute?.(this.toHekatan());
      return;
    }

    // Ctrl+Enter = Ejecutar
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      this.evaluateAll();
      this.render();
      this.onExecute?.(this.toHekatan());
      return;
    }

    // Ctrl+S = guardar
    if (e.key === "s" && e.ctrlKey) {
      e.preventDefault();
      // TODO: save
      return;
    }

    // Ctrl+Z = deshacer (TODO)
    // Ctrl+Y = rehacer (TODO)

    // Zoom: Ctrl+= / Ctrl+-
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      this.setZoom(this.zoomLevel + 0.1);
      return;
    }
    if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      this.setZoom(this.zoomLevel - 0.1);
      return;
    }

    // Tab = siguiente celda (crea nueva si es la ultima)
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      this._nextCell();
      this.render();
      this._triggerAutoRun();
      return;
    }

    // Shift+Tab = celda anterior
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      this._prevCell();
      this.render();
      return;
    }

    // Enter = nueva fila
    if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      this._newLine();
      this.render();
      this._triggerAutoRun();
      return;
    }

    // Backspace
    if (e.key === "Backspace") {
      e.preventDefault();
      if (el instanceof MathText || el instanceof MathComment) {
        const textEl = el as MathText | MathComment;
        if (textEl.cursorPosition > 0) {
          textEl.deleteChar();
        } else if (this.currentRow > 0 || this.currentCol > 0) {
          // Merge con celda anterior o fila anterior
          this._mergeLineUp();
        }
      }
      this._recheckLineType();
      this.render();
      this._triggerAutoRun();
      return;
    }

    // Delete
    if (e.key === "Delete") {
      e.preventDefault();
      if (el instanceof MathText) {
        el.deleteForward();
      }
      this._recheckLineType();
      this.render();
      this._triggerAutoRun();
      return;
    }

    // Arrows
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      this._moveCursorLeft();
      this.render();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      this._moveCursorRight();
      this.render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      this._moveCursorUp();
      this.render();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this._moveCursorDown();
      this.render();
      return;
    }

    // Home / End
    if (e.key === "Home") {
      e.preventDefault();
      if (el instanceof MathText) el.cursorPosition = 0;
      if (el instanceof MathComment) el.cursorPosition = 0;
      this.render();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      if (el instanceof MathText) el.cursorPosition = el.text.length;
      if (el instanceof MathComment) el.cursorPosition = el.text.length;
      this.render();
      return;
    }

    // Shortcuts para crear estructuras matemáticas
    // Ctrl+/ = fracción
    if (e.key === "/" && e.ctrlKey) {
      e.preventDefault();
      this._insertFraction();
      this.render();
      this._triggerAutoRun();
      return;
    }

    // Ctrl+6 (^) = superscript/power
    // Se detecta por el caracter ^ directamente

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();

      // Crear fracción con /
      // (pero solo si es "a/b", no si estamos al inicio)
      if (e.key === "/" && el instanceof MathText && el.text.length > 0 && el.cursorPosition > 0) {
        this._insertFractionFromSlash();
        this.render();
        this._triggerAutoRun();
        return;
      }

      // Crear potencia con ^
      if (e.key === "^" && el instanceof MathText && el.text.length > 0 && el.cursorPosition > 0) {
        this._insertPowerFromCaret();
        this.render();
        this._triggerAutoRun();
        return;
      }

      // Crear subíndice con _
      if (e.key === "_" && el instanceof MathText && el.text.length > 0 && el.cursorPosition > 0) {
        this._insertSubscriptFromUnderscore();
        this.render();
        this._triggerAutoRun();
        return;
      }

      // Caracter normal
      if (el instanceof MathText) {
        el.insertChar(e.key);
      } else if (el instanceof MathComment) {
        el.insertChar(e.key);
      }
      this._recheckLineType();
      this.render();
      this._triggerAutoRun();
      return;
    }
  }

  // ==========================================================================
  // Inserción de estructuras matemáticas
  // ==========================================================================

  private _insertFraction() {
    const frac = new MathFraction();
    const line = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = line.indexOf(this.currentElement!);
    line.splice(idx + 1, 0, frac);
    this._setCursor(frac.numerator);
  }

  private _insertFractionFromSlash() {
    const el = this.currentElement as MathText;
    // Tomar lo que hay antes del cursor como numerador
    const numText = el.text.slice(0, el.cursorPosition);
    const afterText = el.text.slice(el.cursorPosition);

    const num = new MathText(numText);
    const den = new MathText();
    const frac = new MathFraction(num, den);

    const line = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = line.indexOf(el);

    if (afterText) {
      el.text = afterText;
      el.cursorPosition = 0;
      line.splice(idx, 0, frac);
    } else {
      line.splice(idx, 1, frac);
    }
    this._setCursor(den);
  }

  private _insertPowerFromCaret() {
    const el = this.currentElement as MathText;
    const baseText = el.text.slice(0, el.cursorPosition);
    const afterText = el.text.slice(el.cursorPosition);

    const base = new MathText(baseText);
    const exp = new MathText();
    const pow = new MathPower(base, exp);

    const line = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = line.indexOf(el);

    if (afterText) {
      el.text = afterText;
      el.cursorPosition = 0;
      line.splice(idx, 0, pow);
    } else {
      line.splice(idx, 1, pow);
    }
    this._setCursor(exp);
  }

  private _insertSubscriptFromUnderscore() {
    const el = this.currentElement as MathText;
    const baseText = el.text.slice(0, el.cursorPosition);
    const afterText = el.text.slice(el.cursorPosition);

    const base = new MathText(baseText);
    const sub = new MathText();
    const subscr = new MathSubscript(base, sub);

    const line = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = line.indexOf(el);

    if (afterText) {
      el.text = afterText;
      el.cursorPosition = 0;
      line.splice(idx, 0, subscr);
    } else {
      line.splice(idx, 1, subscr);
    }
    this._setCursor(sub);
  }

  // ==========================================================================
  // Movimiento del cursor
  // ==========================================================================

  private _setCursor(el: MathElement) {
    if (this.currentElement) this.currentElement.isCursorHere = false;
    this.currentElement = el;
    el.isCursorHere = true;
    if (el instanceof MathText) el.cursorPosition = 0;
    if (el instanceof MathComment) el.cursorPosition = 0;
    this.cursorVisible = true;
  }

  private _moveCursorLeft() {
    const el = this.currentElement;
    if (el instanceof MathText && el.cursorPosition > 0) {
      el.cursorPosition--;
      return;
    }
    if (el instanceof MathComment && el.cursorPosition > 0) {
      el.cursorPosition--;
      return;
    }
    // Ir al elemento anterior en la celda
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = cell.indexOf(el!);
    if (idx > 0) {
      this._setCursorEnd(cell[idx - 1]);
    } else if (this.currentCol > 0) {
      // Ir a la celda anterior en la misma fila
      this.currentCol--;
      const prevCell = this.grid[this.currentRow][this.currentCol];
      if (prevCell.length > 0) this._setCursorEnd(prevCell[prevCell.length - 1]);
    } else if (this.currentRow > 0) {
      // Ir a la ultima celda de la fila anterior
      this.currentRow--;
      const prevRow = this.grid[this.currentRow];
      this.currentCol = prevRow.length - 1;
      const prevCell = prevRow[this.currentCol];
      if (prevCell.length > 0) this._setCursorEnd(prevCell[prevCell.length - 1]);
    }
  }

  private _moveCursorRight() {
    const el = this.currentElement;
    if (el instanceof MathText && el.cursorPosition < el.text.length) {
      el.cursorPosition++;
      return;
    }
    if (el instanceof MathComment && el.cursorPosition < el.text.length) {
      el.cursorPosition++;
      return;
    }
    // Ir al elemento siguiente en la celda
    const cell = this.grid[this.currentRow]?.[this.currentCol] ?? [];
    const idx = cell.indexOf(el!);
    if (idx < cell.length - 1) {
      this._setCursor(cell[idx + 1]);
    } else if (this.currentCol < (this.grid[this.currentRow]?.length ?? 1) - 1) {
      // Ir a la primera celda siguiente en la misma fila
      this.currentCol++;
      const nextCell = this.grid[this.currentRow][this.currentCol];
      if (nextCell.length > 0) this._setCursor(nextCell[0]);
    } else if (this.currentRow < this.grid.length - 1) {
      // Ir a la primera celda de la fila siguiente
      this.currentRow++;
      this.currentCol = 0;
      const nextCell = this.grid[this.currentRow][0];
      if (nextCell.length > 0) this._setCursor(nextCell[0]);
    }
  }

  private _moveCursorUp() {
    if (this.currentRow > 0) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentRow--;
      const row = this.grid[this.currentRow];
      this.currentCol = Math.min(this.currentCol, row.length - 1);
      const cell = row[this.currentCol];
      this.currentElement = this._getFirstTextElement(cell);
      if (this.currentElement) this.currentElement.isCursorHere = true;
      this._notifyDrawFocus();
    }
  }

  private _moveCursorDown() {
    if (this.currentRow < this.grid.length - 1) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentRow++;
      const row = this.grid[this.currentRow];
      this.currentCol = Math.min(this.currentCol, row.length - 1);
      const cell = row[this.currentCol];
      this.currentElement = this._getFirstTextElement(cell);
      if (this.currentElement) this.currentElement.isCursorHere = true;
      this._notifyDrawFocus();
    }
  }

  private _setCursorEnd(el: MathElement) {
    if (this.currentElement) this.currentElement.isCursorHere = false;
    this.currentElement = el;
    el.isCursorHere = true;
    if (el instanceof MathText) el.cursorPosition = el.text.length;
    if (el instanceof MathComment) el.cursorPosition = el.text.length;
    this.cursorVisible = true;
  }

  // ==========================================================================
  // Operaciones de línea
  // ==========================================================================

  /** Tab: ir a la siguiente celda (o crear una nueva) */
  private _nextCell() {
    const row = this.grid[this.currentRow];
    if (!row) return;

    if (this.currentElement) this.currentElement.isCursorHere = false;

    if (this.currentCol < row.length - 1) {
      // Ir a la celda siguiente existente
      this.currentCol++;
    } else {
      // Crear nueva celda a la derecha
      const newEl = new MathText();
      row.push([newEl]);
      this.currentCol = row.length - 1;
    }

    const cell = this.grid[this.currentRow][this.currentCol];
    this.currentElement = this._getFirstTextElement(cell);
    if (this.currentElement) {
      this.currentElement.isCursorHere = true;
      if (this.currentElement instanceof MathText) {
        this.currentElement.cursorPosition = 0;
      }
    }
    this.cursorVisible = true;
  }

  /** Shift+Tab: ir a la celda anterior */
  private _prevCell() {
    if (this.currentCol <= 0 && this.currentRow <= 0) return;

    if (this.currentElement) this.currentElement.isCursorHere = false;

    if (this.currentCol > 0) {
      this.currentCol--;
    } else if (this.currentRow > 0) {
      // Ir a la ultima celda de la fila anterior
      this.currentRow--;
      this.currentCol = this.grid[this.currentRow].length - 1;
    }

    const cell = this.grid[this.currentRow][this.currentCol];
    this.currentElement = this._getFirstTextElement(cell);
    if (this.currentElement) {
      this.currentElement.isCursorHere = true;
      if (this.currentElement instanceof MathText) {
        this.currentElement.cursorPosition = this.currentElement.text.length;
      }
    }
    this.cursorVisible = true;
  }

  /** Enter: nueva fila debajo */
  private _newLine() {
    const el = this.currentElement;
    if (el instanceof MathText) {
      const afterText = el.text.slice(el.cursorPosition);
      el.text = el.text.slice(0, el.cursorPosition);
      el.isCursorHere = false;

      const newEl = new MathText(afterText);
      newEl.isCursorHere = true;
      newEl.cursorPosition = 0;

      // Detectar si la nueva linea empieza con # (markdown heading)
      const trimmed = afterText.trim();
      const newCell: MathElement[] = [];
      if (/^#{1,6}\s/.test(trimmed)) {
        const comment = new MathComment(afterText);
        comment.isCursorHere = true;
        newCell.push(comment);
        this.currentElement = comment;
      } else {
        newCell.push(newEl);
        this.currentElement = newEl;
      }

      this.currentRow++;
      this.currentCol = 0;
      this.grid.splice(this.currentRow, 0, [newCell]);
    } else if (el instanceof MathComment) {
      el.isCursorHere = false;
      const newEl = new MathText();
      newEl.isCursorHere = true;
      this.currentRow++;
      this.currentCol = 0;
      this.grid.splice(this.currentRow, 0, [[newEl]]);
      this.currentElement = newEl;
    } else {
      const newEl = new MathText();
      newEl.isCursorHere = true;
      this.currentRow++;
      this.currentCol = 0;
      this.grid.splice(this.currentRow, 0, [[newEl]]);
      this.currentElement = newEl;
    }
  }

  /**
   * Re-check if current line should change element type:
   *   MathText → MathComment  (when text starts with #, >, ')
   *   MathComment → MathText  (when text no longer starts with those)
   * Called after each character insert/delete to provide live formatting.
   */
  private _recheckLineType() {
    const cell = this.grid[this.currentRow]?.[this.currentCol];
    if (!cell || cell.length !== 1) return;

    const el = cell[0];

    // MathText → MathComment: heading, comment, or blockquote detected
    if (el instanceof MathText) {
      const text = el.text;
      const trimmed = text.trim();
      const isHeading = /^#{1,6}\s/.test(trimmed);
      const isComment = trimmed.startsWith("'");
      const isBlockquote = trimmed.startsWith(">");

      if (isHeading || isComment || isBlockquote) {
        const comment = new MathComment(text);
        comment.cursorPosition = el.cursorPosition;
        comment.isCursorHere = el.isCursorHere;
        cell[0] = comment;
        this.currentElement = comment;
      }
    }
    // MathComment → MathText: no longer matches any special pattern
    else if (el instanceof MathComment) {
      const text = el.text;
      const trimmed = text.trim();
      const isHeading = /^#{1,6}\s/.test(trimmed);
      const isComment = trimmed.startsWith("'");
      const isBlockquote = trimmed.startsWith(">");

      if (!isHeading && !isComment && !isBlockquote) {
        const newText = new MathText(text);
        newText.cursorPosition = Math.min(el.cursorPosition, text.length);
        newText.isCursorHere = el.isCursorHere;
        cell[0] = newText;
        this.currentElement = newText;
      }
    }
  }

  /** Backspace al inicio de celda: merge con celda anterior o fila anterior */
  private _mergeLineUp() {
    if (this.currentCol > 0) {
      // Merge con celda anterior en la misma fila
      const row = this.grid[this.currentRow];
      const prevCell = row[this.currentCol - 1];
      const currCell = row[this.currentCol];

      if (prevCell.length > 0) {
        const lastEl = prevCell[prevCell.length - 1];
        this._setCursorEnd(lastEl);
      }
      prevCell.push(...currCell);
      row.splice(this.currentCol, 1);
      this.currentCol--;
    } else if (this.currentRow > 0) {
      // Merge con la ultima celda de la fila anterior
      const prevRow = this.grid[this.currentRow - 1];
      const currCell = this.grid[this.currentRow][0];
      const lastCol = prevRow.length - 1;
      const prevCell = prevRow[lastCol];

      if (prevCell.length > 0) {
        const lastEl = prevCell[prevCell.length - 1];
        this._setCursorEnd(lastEl);
      }
      prevCell.push(...currCell);

      // Si la fila actual tiene mas celdas, moverlas a la fila anterior
      const currRow = this.grid[this.currentRow];
      for (let c = 1; c < currRow.length; c++) {
        prevRow.push(currRow[c]);
      }

      this.grid.splice(this.currentRow, 1);
      this.currentRow--;
      this.currentCol = lastCol;
    }
  }

  // ==========================================================================
  // Mouse
  // ==========================================================================

  /** Scrollbar hit-test and drag constants */
  private readonly scrollbarWidth = 10;
  private readonly scrollbarMargin = 2;

  private _getScrollbarGeometry(): { trackX: number, barH: number, barY: number, maxScroll: number } | null {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    if (this.contentHeight <= h) return null;
    const maxScroll = this.contentHeight - h + 20;
    const barH = Math.max(30, (h / this.contentHeight) * h);
    const barY = (this.scrollY / maxScroll) * (h - barH);
    const trackX = w - this.scrollbarWidth - this.scrollbarMargin;
    return { trackX, barH, barY, maxScroll };
  }

  private _onMouseDown(e: MouseEvent) {
    let px: number, py: number;

    if (e.clientX !== undefined && e.clientY !== undefined) {
      // Real MouseEvent — compensate for CSS zoom on the canvas.
      // getBoundingClientRect() returns the VISUAL size (after CSS zoom),
      // so we scale the offset to match the canvas's internal coordinate space.
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.offsetWidth / rect.width;   // ≈ 1/zoomLevel
      const scaleY = this.canvas.offsetHeight / rect.height;
      px = (e.clientX - rect.left) * scaleX;
      py = (e.clientY - rect.top) * scaleY;
    } else {
      // Fake event from simulateClick() — offsetX/offsetY are already in
      // the canvas's internal coordinate space, use them directly.
      px = (e as any).offsetX ?? 0;
      py = (e as any).offsetY ?? 0;
    }

    // Check if click is on scrollbar
    const sb = this._getScrollbarGeometry();
    if (sb && px >= sb.trackX) {
      this.scrollbarDragging = true;
      this.scrollbarDragStartY = py;
      this.scrollbarDragStartScroll = this.scrollY;
      this.canvas.style.cursor = "default";
      return;
    }

    // Normal click — element coordinates are in screen-space (scroll already
    // applied during render via pagesStartY = pageGap - scrollY), so use
    // screen-space mouse coordinates directly (no scrollY addition).
    const screenY = py;

    // Buscar fila, columna y elemento
    let foundRow = -1;
    let foundCol = -1;
    let foundElement: MathElement | null = null;

    for (let ri = 0; ri < this.grid.length; ri++) {
      // Only hit-test rows that were rendered in the last frame
      // (off-screen rows have stale coordinates that cause wrong matches)
      if (!this.visibleRows.has(ri)) continue;
      const row = this.grid[ri];
      for (let ci = 0; ci < row.length; ci++) {
        for (const el of row[ci]) {
          const hit = el.hitTest(px, screenY);
          if (hit) {
            foundRow = ri;
            foundCol = ci;
            foundElement = hit;
            break;
          }
        }
        if (foundElement) break;
      }
      if (foundElement) break;
    }

    if (foundElement && foundRow >= 0) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentRow = foundRow;
      this.currentCol = foundCol;
      this.currentElement = foundElement;
      foundElement.isCursorHere = true;

      // Posicionar cursor dentro del texto
      if (foundElement instanceof MathText) {
        foundElement.cursorPosition = this._hitTextPosition(foundElement, px);
      } else if (foundElement instanceof MathComment) {
        foundElement.cursorPosition = this._hitCommentPosition(foundElement, px);
      }
    }

    // Debug click callback
    if (this.onDebugClick) {
      const elType = foundElement ? foundElement.constructor.name : "none";
      const elText = foundElement instanceof MathText ? foundElement.text : (foundElement ? foundElement.toHekatan() : "");
      this.onDebugClick({
        mouseX: Math.round(px), mouseY: Math.round(py),
        contentX: Math.round(px), contentY: Math.round(screenY),
        foundRow, foundCol, elementType: elType, elementText: elText,
        cursorRow: this.currentRow,
        cursorElement: this.currentElement instanceof MathText ? this.currentElement.text : (this.currentElement?.constructor.name ?? "none"),
      });
    }

    this.canvas.focus();
    this.cursorVisible = true;
    this._startCursor();
    this._notifyDrawFocus();

    // Brief click indicator — small circle at click point
    this._showClickIndicator(px, py);

    this.render();
  }

  private _hitTextPosition(el: MathText, px: number): number {
    const dt = el.displayText;
    if (!dt) return 0;
    const isItalic = !(/^\d/.test(el.text)) && !S.isOperator(el.text) && !S.isKnownFunction(el.text);
    const style = isItalic ? "italic " : "";
    this.ctx.font = `${style}300 ${this.fontSize}px ${S.EquationFont}`;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= dt.length; i++) {
      const w = this.ctx.measureText(dt.slice(0, i)).width;
      const dist = Math.abs(el.x + w - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return Math.min(best, el.text.length);
  }

  private _showClickIndicator(px: number, py: number) {
    if (this.clickIndicator.timer) cancelAnimationFrame(this.clickIndicator.timer);
    this.clickIndicator.x = px;
    this.clickIndicator.y = py;
    this.clickIndicator.alpha = 1.0;
    let frame = 0;
    const totalFrames = 30; // ~500ms at 60fps
    const fade = () => {
      frame++;
      // Stay fully visible for 10 frames, then fade out over remaining 20
      if (frame <= 10) {
        this.clickIndicator.alpha = 1.0;
      } else {
        this.clickIndicator.alpha = 1.0 - (frame - 10) / (totalFrames - 10);
      }
      if (frame < totalFrames) {
        this.render();
        this.clickIndicator.timer = requestAnimationFrame(fade);
      } else {
        this.clickIndicator.alpha = 0;
        this.clickIndicator.timer = null;
        this.render();
      }
    };
    this.clickIndicator.timer = requestAnimationFrame(fade);
  }

  private _hitCommentPosition(el: MathComment, px: number): number {
    const raw = el.text;
    if (!raw) return 0;
    // MathComment cursor rendering uses raw text with UIFont + heading size
    const headingLevel = (el as any)._headingLevel ?? 0;
    const mult = S.HeadingSizeRatios[headingLevel] ?? 1.0;
    const actual = this.fontSize * mult;
    const isBold = (el as any)._isBold ?? false;
    const isItalic = (el as any)._isItalic ?? false;
    const baseStyle = (isBold ? "bold " : "") + (isItalic ? "italic " : "");
    this.ctx.font = `${baseStyle}${actual}px ${S.UIFont}`;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= raw.length; i++) {
      const w = this.ctx.measureText(raw.slice(0, i)).width;
      const dist = Math.abs(el.x + w - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return Math.min(best, raw.length);
  }

  // ==========================================================================
  // Scroll / Zoom + Scrollbar drag
  // ==========================================================================

  private _onMouseMove(e: MouseEvent) {
    // Scrollbar dragging
    if (this.scrollbarDragging) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleY = this.canvas.offsetHeight / rect.height; // compensate CSS transform
      const h = this.canvas.height / (window.devicePixelRatio || 1);
      const dy = ((e.clientY - rect.top) * scaleY) - this.scrollbarDragStartY;
      const sb = this._getScrollbarGeometry();
      if (!sb) return;
      const scrollRange = h - sb.barH;
      if (scrollRange <= 0) return;
      const scrollDelta = (dy / scrollRange) * sb.maxScroll;
      this.scrollY = Math.max(0, Math.min(sb.maxScroll, this.scrollbarDragStartScroll + scrollDelta));
      this.render();
      if (this.onScrollChange) {
        this.onScrollChange(sb.maxScroll > 0 ? this.scrollY / sb.maxScroll : 0);
      }
      return;
    }

    // Dynamic cursor: text over page content area, default elsewhere
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.zoomLevel;
    const scaleX = this.canvas.offsetWidth / rect.width;
    const scaleY = this.canvas.offsetHeight / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    // Check if over scrollbar area
    const sb = this._getScrollbarGeometry();
    if (sb && px >= sb.trackX) {
      this.canvas.style.cursor = "default";
      return;
    }

    // Check if over ruler area (top ruler or left ruler)
    const vRulerW = 18;
    const hRulerH = 18;
    if (py < hRulerH || px < vRulerW) {
      this.canvas.style.cursor = "default";
      return;
    }

    // Over page content → text cursor
    this.canvas.style.cursor = "text";
  }

  private _onMouseUp() {
    if (this.scrollbarDragging) {
      this.scrollbarDragging = false;
      this.canvas.style.cursor = "default";
    }
  }

  private _onWheel(e: WheelEvent) {
    // Ctrl+wheel zoom is handled by the global handler in main.ts
    // (prevents browser zoom and routes to setZoom for both panels).
    if (e.ctrlKey) { e.preventDefault(); return; }
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const maxScroll = Math.max(0, this.contentHeight - h + 20);
    this.scrollY = Math.max(0, Math.min(maxScroll, this.scrollY + e.deltaY));
    this.render();
    if (this.onScrollChange) {
      this.onScrollChange(maxScroll > 0 ? this.scrollY / maxScroll : 0);
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Auto-evaluate if needed
    if (this.needsEval && this.autoRun) {
      this.evaluateAll();
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = w / dpr;
    const cssH = h / dpr;

    // ── Apply DPR scale every render (transform resets on canvas resize) ──
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // ── Text rendering quality ──
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    (ctx as any).textRendering = "optimizeLegibility";
    (ctx as any).fontKerning = "normal";

    // ── Page layout constants (A4-like, matching Output CSS exactly) ──
    // Output CSS: width:210mm, min-height:297mm, padding:15mm 15mm 15mm 20mm
    // 210mm at 96dpi = 793.7px, 297mm at 96dpi = 1122.5px
    const pageW_base = Math.round(210 * 96 / 25.4);   // 794px = 210mm
    const pageH_base = Math.round(297 * 96 / 25.4);    // 1123px = 297mm
    const marginL_base = Math.round(20 * 96 / 25.4);   // 76px = 20mm
    const marginR_base = Math.round(15 * 96 / 25.4);   // 57px = 15mm
    const marginT_base = Math.round(15 * 96 / 25.4);   // 57px = 15mm
    const marginB_base = Math.round(15 * 96 / 25.4);   // 57px = 15mm
    const gap_base = 12;               // gap between pages (matches output gap: 12px)

    // Auto-fit: scale A4 page to fit available canvas width (like Output's fitA4Page)
    // NOTE: zoomLevel is NOT applied here — it's applied as CSS zoom on the
    // canvas element (in main.ts) so that EVERYTHING scales visually together:
    // pages, text, equations, @{draw} diagrams, matrices, etc.
    const vRulerW = 18;  // vertical ruler width
    const availW = cssW - this.scrollbarWidth - this.scrollbarMargin - vRulerW;
    const autoFitScale = Math.min((availW - 20) / pageW_base, 1);
    const scale = autoFitScale;   // zoom handled externally via CSS zoom
    this.lastScale = scale;

    // Scaled dimensions (all rendering uses these)
    const pageW = pageW_base * scale;
    const pageH = pageH_base * scale;
    const pageMarginLeft = marginL_base * scale;
    const pageMarginRight = marginR_base * scale;
    const pageMarginTop = marginT_base * scale;
    const pageMarginBottom = marginB_base * scale;
    const pageGap = Math.max(4, gap_base * scale);

    // Update class font metrics (used by mouse handling too)
    this.fontSize = BASE_FONT_SIZE * scale;
    this.lineHeight = BASE_LINE_HEIGHT * scale;

    // Center page horizontally in the canvas area (after vertical ruler and scrollbar)
    const pageX = Math.max(vRulerW, Math.round(vRulerW + (availW - pageW) / 2));
    const contentH = pageH - pageMarginTop - pageMarginBottom; // usable height per page
    const leftMargin = pageX + pageMarginLeft;

    // Clear with gray background (outside pages, matches output-panel bg #b0b0b0)
    // Use CSS dimensions since ctx is already scaled by dpr
    ctx.fillStyle = "#b0b0b0";
    ctx.fillRect(0, 0, cssW, cssH);

    // ── Pass 1: Measure all row heights to compute page breaks ──
    const rowHeights: number[] = [];
    const rowBaselines: number[] = [];
    for (let ri = 0; ri < this.grid.length; ri++) {
      const row = this.grid[ri];
      let maxHeight = this.lineHeight;
      let maxBaseline = this.fontSize * 0.85;
      for (let ci = 0; ci < row.length; ci++) {
        for (const el of row[ci]) {
          el.measure(ctx, this.fontSize);
          maxHeight = Math.max(maxHeight, el.height);
          maxBaseline = Math.max(maxBaseline, el.baseline);
        }
        const resultVal = this.cellResultValues[ri]?.[ci];
        if (resultVal && typeof resultVal === "object" && typeof resultVal.toArray === "function") {
          const mh = this._measureResultMatrix(resultVal, ctx, this.fontSize);
          maxHeight = Math.max(maxHeight, mh.height);
          maxBaseline = Math.max(maxBaseline, mh.baseline);
        }
      }
      rowHeights.push(maxHeight + 4);
      rowBaselines.push(maxBaseline);
    }

    // ── Compute page assignments: which page each row belongs to ──
    // Rows taller than a page span multiple pages; we track the absolute Y
    // position (summing page heights + gaps) for each row.
    const rowAbsY: number[] = [];      // absolute Y position for each row (from top of first page content)
    const rowPage: number[] = [];      // page index where the row starts
    const rowYInPage: number[] = [];   // y offset within that page's content area
    let currentPage = 0;
    let yInPage = 0;
    for (let ri = 0; ri < rowHeights.length; ri++) {
      const rh = rowHeights[ri];
      if (yInPage + rh > contentH && yInPage > 0) {
        // Move to next page
        currentPage++;
        yInPage = 0;
      }
      rowPage.push(currentPage);
      rowYInPage.push(yInPage);
      yInPage += rh;
      // If this row itself exceeds one page, advance pages accordingly
      if (rh > contentH) {
        const extraPages = Math.ceil((yInPage) / contentH) - 1;
        currentPage += extraPages;
        yInPage = yInPage - extraPages * contentH;
      }
    }
    const totalPages = currentPage + 1;

    // Total virtual height (all pages + gaps)
    const rulerH = 18;   // ruler height — pages start below
    const totalH = totalPages * pageH + (totalPages - 1) * pageGap + pageGap * 2; // top+bottom padding

    // ── Draw pages (white sheets with shadow) ──
    const pagesStartY = rulerH + pageGap - this.scrollY; // first page top (below ruler)

    for (let p = 0; p < totalPages; p++) {
      const py = pagesStartY + p * (pageH + pageGap);
      // Skip pages completely outside viewport
      if (py + pageH < 0 || py > cssH) continue;

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = "#f4eeef";
      ctx.fillRect(pageX, py, pageW, pageH);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // (No line numbers in A4 page mode — matches Output)

    // Toggle cursor visibility on current element for blink effect
    if (this.currentElement && !this.cursorVisible) {
      this.currentElement.isCursorHere = false;
    }

    // ── Pass 2: Render rows on their assigned pages ──
    this.visibleRows.clear();
    for (let ri = 0; ri < this.grid.length; ri++) {
      const row = this.grid[ri];
      const pg = rowPage[ri];
      const pageTopY = pagesStartY + pg * (pageH + pageGap);
      const y = pageTopY + pageMarginTop + rowYInPage[ri];
      const maxHeight = rowHeights[ri] - 4;
      const maxBaseline = rowBaselines[ri];

      // Skip si está completamente fuera de la vista
      if (y + maxHeight + 4 < -100) continue;
      if (y > cssH + 100) continue;

      // Clip to page area — skip rows that start beyond the page bottom,
      // but allow rows taller than a page (they span multiple pages)
      if (rowYInPage[ri] > contentH + 2 && maxHeight + 4 <= contentH) continue;

      this.visibleRows.add(ri);

      // Highlight fila actual (subtle)
      if (ri === this.currentRow) {
        ctx.fillStyle = "rgba(0,102,221,0.04)";
        ctx.fillRect(pageX + pageMarginLeft - 4, y, pageW - pageMarginLeft - pageMarginRight + 8, maxHeight + 4);
      }

      // Renderizar celdas de la fila horizontalmente
      let x = leftMargin;
      for (let ci = 0; ci < row.length; ci++) {
        const cell = row[ci];

        // Highlight celda activa
        if (ri === this.currentRow && ci === this.currentCol) {
          ctx.fillStyle = "rgba(0,102,221,0.06)";
          const cellW = cell.reduce((sum, el) => sum + el.width + S.ElementSpacing, 0) || this.minCellWidth;
          ctx.fillRect(x - 2, y, cellW + 4, maxHeight + 4);
        }

        // Renderizar elementos de la celda
        for (const el of cell) {
          const elY = y + (maxBaseline - el.baseline);
          el.render(ctx, x, elY, this.fontSize);
          x += el.width + S.ElementSpacing;
        }

        // Si la celda está vacía, dejar espacio mínimo
        if (cell.length === 0) {
          x += this.minCellWidth;
        }

        // Dibujar resultado de evaluación (= valor) en azul
        const result = this.cellResults[ri]?.[ci];
        const resultVal = this.cellResultValues[ri]?.[ci];
        if (result) {
          const isMatrixResult = resultVal && typeof resultVal === "object" && typeof resultVal.toArray === "function";
          if (isMatrixResult) {
            const eqText = " = ";
            ctx.font = `300 ${this.fontSize}px ${S.EquationFont}`;
            ctx.fillStyle = "#0066dd";
            ctx.fillText(eqText, x, y + maxBaseline);
            x += ctx.measureText(eqText).width;
            x += this._renderResultMatrix(ctx, resultVal, x, y, maxBaseline, this.fontSize);
            x += S.ElementSpacing;
          } else {
            const resultText = ` = ${result}`;
            ctx.font = `300 ${this.fontSize}px ${S.EquationFont}`;
            ctx.fillStyle = "#0066dd";
            ctx.fillText(resultText, x, y + maxBaseline);
            x += ctx.measureText(resultText).width + S.ElementSpacing;
          }
        }

        x += this.cellGap;
      }
    }

    // Track actual content height
    this.contentHeight = totalH;

    // Restore cursor visibility flag after render
    if (this.currentElement && !this.cursorVisible) {
      this.currentElement.isCursorHere = true;
    }

    // Scrollbar — visible and draggable
    if (this.contentHeight > cssH) {
      const maxScroll = this.contentHeight - cssH + 20;
      const barH = Math.max(30, (cssH / this.contentHeight) * cssH);
      const barY = (this.scrollY / maxScroll) * (cssH - barH);
      const sbW = this.scrollbarWidth;
      const sbX = cssW - sbW - this.scrollbarMargin;
      // Track background
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(sbX, 0, sbW, cssH);
      // Thumb
      const isHover = this.scrollbarDragging;
      ctx.fillStyle = isHover ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)";
      ctx.beginPath();
      const r = 3;
      const bx = sbX + 1, by = barY, bw = sbW - 2, bh = barH;
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
      ctx.lineTo(bx + bw, by + bh - r);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
      ctx.lineTo(bx + r, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();
    }

    // Click indicator — small fading circle at last click position
    if (this.clickIndicator.alpha > 0) {
      const ci = this.clickIndicator;
      ctx.save();
      ctx.globalAlpha = ci.alpha;
      ctx.strokeStyle = "#1a73e8";
      ctx.lineWidth = 1.5;
      const radius = 6;
      ctx.beginPath();
      ctx.arc(ci.x, ci.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Small crosshair inside
      ctx.beginPath();
      ctx.moveTo(ci.x - 3, ci.y);
      ctx.lineTo(ci.x + 3, ci.y);
      ctx.moveTo(ci.x, ci.y - 3);
      ctx.lineTo(ci.x, ci.y + 3);
      ctx.stroke();
      ctx.restore();
    }

    // ── Rulers (Word-style) — fixed at top and left of canvas ──
    this._renderRuler(ctx, cssW, pageX, pageW, pageMarginLeft, pageMarginRight, scale);
    this._renderVerticalRuler(ctx, cssH, pageX, pageH, pageMarginTop, pageMarginBottom, pagesStartY, scale, totalPages, pageGap);
  }

  // ==========================================================================
  // Ruler rendering (Word-style horizontal ruler)
  // ==========================================================================

  private _renderRuler(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    pageX: number,
    pageW: number,
    marginL: number,
    marginR: number,
    scale: number,
  ) {
    const rulerH = 18;    // ruler height in CSS px
    const rulerY = 0;     // fixed at top

    // ── Ruler background (margin areas = darker, content area = lighter) ──
    // Full-width ruler background
    ctx.fillStyle = "#d0ccc8";
    ctx.fillRect(0, rulerY, canvasW, rulerH);

    // Content area (between margins) — lighter
    const contentLeft = pageX + marginL;
    const contentRight = pageX + pageW - marginR;
    ctx.fillStyle = "#f0eeec";
    ctx.fillRect(contentLeft, rulerY, contentRight - contentLeft, rulerH);

    // ── Tick marks in centimeters ──
    // 1cm at 96dpi = 96/2.54 ≈ 37.795px, scaled by page scale
    const cmPx = (96 / 2.54) * scale;
    const totalCm = Math.ceil(pageW / cmPx);

    // Smart label interval: skip numbers when ticks are too close together
    // (happens at high CSS zoom where internal scale gets very small)
    const labelInterval = cmPx < 8 ? 10 : cmPx < 14 ? 5 : cmPx < 22 ? 2 : 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const rulerFontSize = Math.max(6, Math.min(10, Math.round(cmPx * 0.6)));
    ctx.font = `${rulerFontSize}px ${S.UIFont}`;

    for (let cm = 0; cm <= totalCm; cm++) {
      const x = pageX + cm * cmPx;
      if (x < pageX - 1 || x > pageX + pageW + 1) continue;

      const isLabel = cm % labelInterval === 0;

      // Major tick at label positions, smaller tick otherwise
      ctx.strokeStyle = "#777";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, rulerY + rulerH - 1);
      ctx.lineTo(x, rulerY + rulerH - (isLabel ? 7 : 4));
      ctx.stroke();

      // Number label only at interval positions (skip 0)
      if (cm > 0 && isLabel) {
        ctx.fillStyle = "#555";
        ctx.fillText(`${cm}`, x, rulerY + rulerH - 7);
      }

      // Half-cm tick (only when spacing allows)
      if (cmPx >= 10) {
        const halfX = x + cmPx / 2;
        if (halfX <= pageX + pageW) {
          ctx.beginPath();
          ctx.moveTo(halfX, rulerY + rulerH - 1);
          ctx.lineTo(halfX, rulerY + rulerH - 3);
          ctx.stroke();
        }
      }
    }

    // ── Margin indicators (small triangles at margin boundaries) ──
    ctx.fillStyle = "#666";
    // Left margin indicator
    this._drawMarginTriangle(ctx, contentLeft, rulerY + rulerH - 1, 4, true);
    // Right margin indicator
    this._drawMarginTriangle(ctx, contentRight, rulerY + rulerH - 1, 4, true);

    // Bottom border line
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerY + rulerH - 0.5);
    ctx.lineTo(canvasW, rulerY + rulerH - 0.5);
    ctx.stroke();

    // Reset text state so subsequent renders use correct alignment
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  /** Draw a small triangle marker for margin indicators */
  private _drawMarginTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pointUp: boolean) {
    ctx.beginPath();
    if (pointUp) {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size / 2, y);
      ctx.lineTo(x + size / 2, y);
    } else {
      ctx.moveTo(x, y + size);
      ctx.lineTo(x - size / 2, y);
      ctx.lineTo(x + size / 2, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ==========================================================================
  // Vertical ruler (Word-style, left side)
  // ==========================================================================

  private _renderVerticalRuler(
    ctx: CanvasRenderingContext2D,
    canvasH: number,
    _pageX: number,
    pageH: number,
    marginT: number,
    marginB: number,
    pagesStartY: number,
    scale: number,
    totalPages: number,
    pageGap: number,
  ) {
    const rulerW = 18;    // ruler width in CSS px
    const rulerH = 18;    // horizontal ruler height (vertical ruler starts below it)
    const rulerX = 0;     // fixed at left edge

    // Ruler background — full height below horizontal ruler
    ctx.fillStyle = "#d0ccc8";
    ctx.fillRect(rulerX, rulerH, rulerW, canvasH - rulerH);

    // ── Iterate over ALL pages and draw ruler marks for each visible page ──
    const cmPx = (96 / 2.54) * scale;
    const totalCm = Math.ceil(pageH / cmPx);
    const labelInterval = cmPx < 8 ? 10 : cmPx < 14 ? 5 : cmPx < 22 ? 2 : 1;
    const vRulerFontSize = Math.max(6, Math.min(10, Math.round(cmPx * 0.6)));

    for (let p = 0; p < totalPages; p++) {
      const pageTop = pagesStartY + p * (pageH + pageGap);

      // Skip pages completely outside viewport
      if (pageTop + pageH < rulerH - 10 || pageTop > canvasH + 10) continue;

      // Content area (between top/bottom margins) — lighter
      const contentTop = pageTop + marginT;
      const contentBottom = pageTop + pageH - marginB;
      const clampedTop = Math.max(rulerH, contentTop);
      const clampedBottom = Math.min(canvasH, contentBottom);
      if (clampedBottom > clampedTop) {
        ctx.fillStyle = "#f0eeec";
        ctx.fillRect(rulerX, clampedTop, rulerW, clampedBottom - clampedTop);
      }

      // ── Tick marks in centimeters ──
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${vRulerFontSize}px ${S.UIFont}`;

      for (let cm = 0; cm <= totalCm; cm++) {
        const y = pageTop + cm * cmPx;
        if (y < rulerH - 1 || y > canvasH + 1) continue;

        const isLabel = cm % labelInterval === 0;
        ctx.strokeStyle = "#777";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(rulerX + rulerW - 1, y);
        ctx.lineTo(rulerX + rulerW - (isLabel ? 7 : 4), y);
        ctx.stroke();

        if (cm > 0 && isLabel && y > rulerH + 4) {
          ctx.fillStyle = "#555";
          ctx.fillText(`${cm}`, rulerX + rulerW / 2 - 1, y);
        }

        if (cmPx >= 10) {
          const halfY = y + cmPx / 2;
          if (halfY <= pageTop + pageH && halfY > rulerH) {
            ctx.beginPath();
            ctx.moveTo(rulerX + rulerW - 1, halfY);
            ctx.lineTo(rulerX + rulerW - 3, halfY);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // ── Margin indicators ──
      ctx.fillStyle = "#666";
      if (contentTop >= rulerH && contentTop <= canvasH) {
        this._drawMarginTriangleH(ctx, rulerX + rulerW - 1, contentTop, 4);
      }
      if (contentBottom >= rulerH && contentBottom <= canvasH) {
        this._drawMarginTriangleH(ctx, rulerX + rulerW - 1, contentBottom, 4);
      }
    }

    // Right border line
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerX + rulerW - 0.5, rulerH);
    ctx.lineTo(rulerX + rulerW - 0.5, canvasH);
    ctx.stroke();

    // Corner box (intersection of horizontal and vertical rulers)
    ctx.fillStyle = "#d0ccc8";
    ctx.fillRect(0, 0, rulerW, rulerH);
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerW - 0.5, 0);
    ctx.lineTo(rulerW - 0.5, rulerH);
    ctx.stroke();
  }

  /** Draw a small horizontal triangle (pointing right) for vertical ruler margin indicator */
  private _drawMarginTriangleH(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - size, y - size / 2);
    ctx.lineTo(x - size, y + size / 2);
    ctx.closePath();
    ctx.fill();
  }

  // ==========================================================================
  // Matrix/Vector result rendering helpers
  // ==========================================================================

  /** Measure a matrix/vector result for row height calculation */
  private _measureResultMatrix(val: any, ctx: CanvasRenderingContext2D, fontSize: number): { width: number, height: number, baseline: number } {
    const arr = val.toArray();
    const inner = fontSize * 0.85;
    const cellPad = 6;
    const bracketW = 8;

    if (Array.isArray(arr[0])) {
      // 2D matrix
      const rows = arr as any[][];
      const rowHeight = inner * 1.2;
      const totalH = rows.length * (rowHeight + cellPad) - cellPad + cellPad * 2;
      ctx.font = `300 ${inner}px ${S.EquationFont}`;
      const colWidths: number[] = new Array(rows[0].length).fill(0);
      for (const row of rows) {
        for (let j = 0; j < row.length; j++) {
          colWidths[j] = Math.max(colWidths[j], ctx.measureText(this._fmtNum(row[j])).width);
        }
      }
      const totalW = colWidths.reduce((s, w) => s + w + cellPad, 0) - cellPad + bracketW * 2;
      return { width: totalW, height: totalH, baseline: totalH / 2 };
    } else {
      // 1D vector - inline
      ctx.font = `300 ${inner}px ${S.EquationFont}`;
      const texts = (arr as any[]).map((v: any) => this._fmtNum(v));
      const str = "[" + texts.join(", ") + "]";
      return { width: ctx.measureText(str).width, height: inner * 1.2, baseline: inner * 0.85 };
    }
  }

  /** Render a matrix/vector result value with blue brackets and text */
  private _renderResultMatrix(ctx: CanvasRenderingContext2D, val: any, x: number, y: number, baseline: number, fontSize: number): number {
    const arr = val.toArray();
    const inner = fontSize * 0.85;
    const cellPad = 6;
    const bracketW = 8;

    ctx.fillStyle = "#0066dd";

    if (Array.isArray(arr[0])) {
      // 2D matrix
      const rows = arr as any[][];
      const numRows = rows.length;
      const numCols = rows[0].length;

      // Measure columns
      ctx.font = `300 ${inner}px ${S.EquationFont}`;
      const colWidths = new Array(numCols).fill(0);
      const rowHeight = inner * 1.2;
      for (const row of rows) {
        for (let j = 0; j < row.length; j++) {
          colWidths[j] = Math.max(colWidths[j], ctx.measureText(this._fmtNum(row[j])).width);
        }
      }

      const totalH = numRows * (rowHeight + cellPad) - cellPad + cellPad * 2;
      const totalW = colWidths.reduce((s, w) => s + w + cellPad, 0) - cellPad + bracketW * 2;

      const matY = y + baseline - totalH / 2;

      // Left bracket
      this._drawResultBracket(ctx, x, matY, totalH, true, bracketW);

      // Cells
      let cy = matY + cellPad;
      for (let i = 0; i < numRows; i++) {
        let cx = x + bracketW;
        for (let j = 0; j < numCols; j++) {
          const text = this._fmtNum(rows[i][j]);
          ctx.font = `300 ${inner}px ${S.EquationFont}`;
          ctx.fillStyle = "#0066dd";
          const tw = ctx.measureText(text).width;
          ctx.fillText(text, cx + (colWidths[j] - tw) / 2, cy + inner * 0.85);
          cx += colWidths[j] + cellPad;
        }
        cy += rowHeight + cellPad;
      }

      // Right bracket
      this._drawResultBracket(ctx, x + totalW - bracketW, matY, totalH, false, bracketW);

      return totalW;
    } else {
      // 1D vector - render inline as [a, b, c]
      ctx.font = `300 ${inner}px ${S.EquationFont}`;
      ctx.fillStyle = "#0066dd";
      const texts = (arr as any[]).map((v: any) => this._fmtNum(v));
      const str = "[" + texts.join(", ") + "]";
      ctx.fillText(str, x, y + baseline);
      return ctx.measureText(str).width;
    }
  }

  /** Draw a bracket (left or right) for matrix result rendering */
  private _drawResultBracket(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, isLeft: boolean, bw: number) {
    ctx.strokeStyle = "#0066dd";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(x + bw - 2, y);
      ctx.lineTo(x + 2, y);
      ctx.lineTo(x + 2, y + h);
      ctx.lineTo(x + bw - 2, y + h);
    } else {
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + bw - 2, y);
      ctx.lineTo(x + bw - 2, y + h);
      ctx.lineTo(x + 2, y + h);
    }
    ctx.stroke();
  }

  private _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    // Compensate for CSS zoom: canvas CSS size = container / zoomLevel
    // so that after CSS zoom, it fills exactly the container.
    const zoom = this.zoomLevel;
    const w = Math.round(parent.clientWidth / zoom);
    const h = Math.round(parent.clientHeight / zoom);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  // ==========================================================================
  // Cursor blink
  // ==========================================================================

  private _startCursor() {
    if (this.cursorTimer) return;
    this.cursorTimer = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      this.render();
    }, 500);
  }

  private _stopCursor() {
    if (this.cursorTimer) {
      clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
  }

  // ==========================================================================
  // AutoRun
  // ==========================================================================

  private _triggerAutoRun() {
    this.needsEval = true;
    if (!this.autoRun) return;
    if (this.autoRunTimer) clearTimeout(this.autoRunTimer);
    this.autoRunTimer = window.setTimeout(() => {
      this.evaluateAll();
      this.render();
      this.onContentChanged?.(this.toHekatan());
    }, 300);
  }

  /** Toggle autorun */
  setAutoRun(enabled: boolean) {
    this.autoRun = enabled;
  }

  // ==========================================================================
  // CAD / Draw block support
  // ==========================================================================

  /** Returns true if any @{draw} block exists in the document */
  hasDrawBlock(): boolean {
    for (const row of this.grid) {
      for (const cell of row) {
        for (const el of cell) {
          if (el instanceof MathDraw) return true;
        }
      }
    }
    return false;
  }

  /** Returns the MathDraw element the cursor is currently in, or null */
  getActiveDrawBlock(): MathDraw | null {
    const cell = this.grid[this.currentRow]?.[this.currentCol];
    if (!cell) return null;
    for (const el of cell) {
      if (el instanceof MathDraw) return el;
    }
    return null;
  }

  /** Public scroll offset for overlay positioning */
  get scrollOffset(): number { return this.scrollY; }

  /** Set scroll position from outside (fraction 0..1) — does NOT fire onScrollChange */
  setScrollFraction(fraction: number) {
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const maxScroll = Math.max(0, this.contentHeight - h + 20);
    this.scrollY = Math.max(0, Math.min(maxScroll, fraction * maxScroll));
    this.render();
  }

  /** Current scroll fraction (0..1) */
  get scrollFraction(): number {
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const maxScroll = Math.max(0, this.contentHeight - h + 20);
    return maxScroll > 0 ? this.scrollY / maxScroll : 0;
  }

  /** Callback when cursor enters/leaves a draw block */
  onDrawBlockFocus: ((draw: MathDraw | null) => void) | null = null;

  /** Notify listeners about draw block focus changes */
  private _lastDrawFocus: MathDraw | null = null;
  private _notifyDrawFocus() {
    const draw = this.getActiveDrawBlock();
    if (draw !== this._lastDrawFocus) {
      this._lastDrawFocus = draw;
      this.onDrawBlockFocus?.(draw);
    }
  }
}

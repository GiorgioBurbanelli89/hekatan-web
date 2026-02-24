/**
 * MathEditor - Canvas-based WYSIWYG math editor (like Mathcad)
 * Port del WPF MathEditorControl a TypeScript/Canvas
 */
import * as S from "./MathStyles";
import {
  MathElement, MathText, MathFraction, MathPower, MathRoot,
  MathSubscript, MathIntegral, MathDerivative, MathMatrix, MathVector,
  MathComment, MathCode, MathColumns,
} from "./MathElement";

const BASE_FONT_SIZE = 14.67; // 11pt
const BASE_LINE_HEIGHT = 22;

export class MathEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lines: MathElement[][] = [];
  private currentLineIndex = 0;
  private currentElement: MathElement | null = null;
  private zoomLevel = 1.0;
  private fontSize = BASE_FONT_SIZE;
  private lineHeight = BASE_LINE_HEIGHT;
  private cursorVisible = true;
  private cursorTimer: number | null = null;
  private scrollY = 0;
  private autoRun = true;
  private autoRunTimer: number | null = null;

  /** Callback para cuando el contenido cambia (AutoRun) */
  onContentChanged: ((code: string) => void) | null = null;

  /** Callback para cuando se ejecuta (F5 / Ctrl+Enter) */
  onExecute: ((code: string) => void) | null = null;

  get currentLine(): MathElement[] {
    return this.lines[this.currentLineIndex] ?? [];
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    // Línea inicial vacía
    const initial = new MathText();
    initial.isCursorHere = true;
    this.lines.push([initial]);
    this.currentElement = initial;

    // Event listeners
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.addEventListener("keydown", e => this._onKeyDown(e));
    canvas.addEventListener("mousedown", e => this._onMouseDown(e));
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

  /** Obtiene todo el contenido como texto Hekatan */
  toHekatan(): string {
    return this.lines.map(line => {
      return line.map(el => el.toHekatan()).join("");
    }).join("\n");
  }

  /** Carga contenido desde texto Hekatan */
  loadFromText(text: string) {
    this.lines = [];
    const rawLines = text.split("\n");
    let i = 0;
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trim();

      // @{columns N}
      const colMatch = trimmed.match(/^@\{columns\s+(\d+)\}/i);
      if (colMatch) {
        const cols = new MathColumns(parseInt(colMatch[1]));
        let colIdx = 0;
        i++;
        while (i < rawLines.length) {
          const lt = rawLines[i].trim();
          if (/^@\{end\s+columns\}/i.test(lt)) break;
          if (/^@\{column\}/i.test(lt)) { colIdx++; i++; continue; }
          cols.addElement(colIdx, this._parseLine(rawLines[i]));
          i++;
        }
        this.lines.push([cols]);
        i++;
        continue;
      }

      // @{python/js/etc} blocks
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
        this.lines.push([new MathCode(codeLines.join("\n"), lang)]);
        i++;
        continue;
      }

      // Línea normal
      this.lines.push([this._parseLine(rawLines[i])]);
      i++;
    }

    if (this.lines.length === 0) {
      this.lines.push([new MathText()]);
    }
    this.currentLineIndex = 0;
    this.currentElement = this._getFirstTextElement(this.lines[0]);
    if (this.currentElement) this.currentElement.isCursorHere = true;
    this.render();
  }

  /** Zoom in/out */
  setZoom(level: number) {
    this.zoomLevel = Math.max(0.5, Math.min(3.0, level));
    this.fontSize = BASE_FONT_SIZE * this.zoomLevel;
    this.lineHeight = BASE_LINE_HEIGHT * this.zoomLevel;
    this.render();
  }

  // ==========================================================================
  // Parser de línea
  // ==========================================================================

  private _parseLine(raw: string): MathElement {
    const trimmed = raw.trim();

    // Markdown: # heading
    if (/^#{1,6}\s/.test(trimmed)) {
      return new MathComment(trimmed);
    }

    // Si la línea es solo texto sin operadores, tratarla como comentario markdown
    // (Hekatan usa markdown, no '# de Calcpad)

    // Línea de ecuación: parsear tokens matemáticos
    return this._parseExpression(raw);
  }

  private _parseExpression(text: string): MathElement {
    // Por ahora, crear un MathText simple con el texto
    // TODO: Parsear fracciones (/), potencias (^), subíndices (_), sqrt(), etc.
    // Para una primera versión funcional, el texto se muestra como MathText
    const mt = new MathText(text);
    return mt;
  }

  private _getFirstTextElement(line: MathElement[]): MathElement | null {
    for (const el of line) {
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
    return line[0] ?? null;
  }

  // ==========================================================================
  // Teclado
  // ==========================================================================

  private _onKeyDown(e: KeyboardEvent) {
    const el = this.currentElement;

    // F5 = Ejecutar
    if (e.key === "F5") {
      e.preventDefault();
      this.onExecute?.(this.toHekatan());
      return;
    }

    // Ctrl+Enter = Ejecutar
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
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

    // Enter = nueva línea
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
        } else if (this.currentLineIndex > 0) {
          // Merge con línea anterior
          this._mergeLineUp();
        }
      }
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
    const line = this.lines[this.currentLineIndex];
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

    const line = this.lines[this.currentLineIndex];
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

    const line = this.lines[this.currentLineIndex];
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

    const line = this.lines[this.currentLineIndex];
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
    // Ir al elemento anterior en la línea
    const line = this.lines[this.currentLineIndex];
    const idx = line.indexOf(el!);
    if (idx > 0) {
      this._setCursorEnd(line[idx - 1]);
    } else if (this.currentLineIndex > 0) {
      this.currentLineIndex--;
      const prevLine = this.lines[this.currentLineIndex];
      if (prevLine.length > 0) this._setCursorEnd(prevLine[prevLine.length - 1]);
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
    // Ir al elemento siguiente en la línea
    const line = this.lines[this.currentLineIndex];
    const idx = line.indexOf(el!);
    if (idx < line.length - 1) {
      this._setCursor(line[idx + 1]);
    } else if (this.currentLineIndex < this.lines.length - 1) {
      this.currentLineIndex++;
      const nextLine = this.lines[this.currentLineIndex];
      if (nextLine.length > 0) this._setCursor(nextLine[0]);
    }
  }

  private _moveCursorUp() {
    if (this.currentLineIndex > 0) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentLineIndex--;
      const line = this.lines[this.currentLineIndex];
      this.currentElement = this._getFirstTextElement(line);
      if (this.currentElement) this.currentElement.isCursorHere = true;
    }
  }

  private _moveCursorDown() {
    if (this.currentLineIndex < this.lines.length - 1) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentLineIndex++;
      const line = this.lines[this.currentLineIndex];
      this.currentElement = this._getFirstTextElement(line);
      if (this.currentElement) this.currentElement.isCursorHere = true;
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

  private _newLine() {
    const el = this.currentElement;
    if (el instanceof MathText) {
      const afterText = el.text.slice(el.cursorPosition);
      el.text = el.text.slice(0, el.cursorPosition);
      el.isCursorHere = false;

      const newEl = new MathText(afterText);
      newEl.isCursorHere = true;
      newEl.cursorPosition = 0;

      // Detectar si la nueva línea empieza con # (markdown heading)
      const trimmed = afterText.trim();
      const newLine: MathElement[] = [];
      if (/^#{1,6}\s/.test(trimmed)) {
        const comment = new MathComment(afterText);
        comment.isCursorHere = true;
        newLine.push(comment);
        this.currentElement = comment;
      } else {
        newLine.push(newEl);
        this.currentElement = newEl;
      }

      this.currentLineIndex++;
      this.lines.splice(this.currentLineIndex, 0, newLine);
    } else if (el instanceof MathComment) {
      el.isCursorHere = false;
      const newEl = new MathText();
      newEl.isCursorHere = true;
      this.currentLineIndex++;
      this.lines.splice(this.currentLineIndex, 0, [newEl]);
      this.currentElement = newEl;
    } else {
      const newEl = new MathText();
      newEl.isCursorHere = true;
      this.currentLineIndex++;
      this.lines.splice(this.currentLineIndex, 0, [newEl]);
      this.currentElement = newEl;
    }
  }

  private _mergeLineUp() {
    if (this.currentLineIndex <= 0) return;
    const prevLine = this.lines[this.currentLineIndex - 1];
    const currLine = this.lines[this.currentLineIndex];

    // Mover cursor al final de la línea anterior
    if (prevLine.length > 0) {
      const lastEl = prevLine[prevLine.length - 1];
      this._setCursorEnd(lastEl);
    }

    // Merge elementos
    prevLine.push(...currLine);
    this.lines.splice(this.currentLineIndex, 1);
    this.currentLineIndex--;
  }

  // ==========================================================================
  // Mouse
  // ==========================================================================

  private _onMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (this.canvas.height / rect.height) + this.scrollY;

    // Buscar línea y elemento
    let foundLine = -1;
    let foundElement: MathElement | null = null;

    for (let li = 0; li < this.lines.length; li++) {
      for (const el of this.lines[li]) {
        const hit = el.hitTest(px, py);
        if (hit) {
          foundLine = li;
          foundElement = hit;
          break;
        }
      }
      if (foundElement) break;
    }

    if (foundElement && foundLine >= 0) {
      if (this.currentElement) this.currentElement.isCursorHere = false;
      this.currentLineIndex = foundLine;
      this.currentElement = foundElement;
      foundElement.isCursorHere = true;

      // Posicionar cursor dentro del texto
      if (foundElement instanceof MathText) {
        foundElement.cursorPosition = this._hitTextPosition(foundElement, px);
      }
    }

    this.canvas.focus();
    this.cursorVisible = true;
    this.render();
  }

  private _hitTextPosition(el: MathText, px: number): number {
    const dt = el.displayText;
    if (!dt) return 0;
    const isItalic = !(/^\d/.test(el.text)) && !S.isOperator(el.text) && !S.isKnownFunction(el.text);
    const style = isItalic ? "italic " : "";
    this.ctx.font = `${style}${this.fontSize}px ${S.EquationFont}`;
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

  // ==========================================================================
  // Scroll / Zoom
  // ==========================================================================

  private _onWheel(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
      this.setZoom(this.zoomLevel - e.deltaY * 0.001);
    } else {
      this.scrollY = Math.max(0, this.scrollY + e.deltaY);
      this.render();
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = S.EditorBackground;
    ctx.fillRect(0, 0, w, h);

    const leftMargin = 50;
    const topMargin = 10;

    // Números de línea
    ctx.fillStyle = S.LineNumberBackground;
    ctx.fillRect(0, 0, leftMargin - 5, h);
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftMargin - 5, 0);
    ctx.lineTo(leftMargin - 5, h);
    ctx.stroke();

    // Medir y renderizar líneas
    let y = topMargin - this.scrollY;

    for (let li = 0; li < this.lines.length; li++) {
      const line = this.lines[li];

      // Medir todos los elementos de la línea
      let maxHeight = this.lineHeight;
      let maxBaseline = this.fontSize * 0.85;
      for (const el of line) {
        el.measure(ctx, this.fontSize);
        maxHeight = Math.max(maxHeight, el.height);
        maxBaseline = Math.max(maxBaseline, el.baseline);
      }

      // Skip si está fuera de la vista
      if (y + maxHeight < 0) { y += maxHeight + 4; continue; }
      if (y > h) break;

      // Highlight línea actual
      if (li === this.currentLineIndex) {
        ctx.fillStyle = "rgba(0,102,221,0.04)";
        ctx.fillRect(leftMargin - 5, y, w - leftMargin + 5, maxHeight + 4);
      }

      // Número de línea
      ctx.font = `${this.fontSize * 0.8}px ${S.UIFont}`;
      ctx.fillStyle = "#999";
      ctx.textAlign = "right";
      ctx.fillText(String(li + 1), leftMargin - 12, y + maxBaseline);
      ctx.textAlign = "left";

      // Renderizar elementos inline
      let x = leftMargin;
      for (const el of line) {
        // Alinear baselines
        const elY = y + (maxBaseline - el.baseline);
        el.render(ctx, x, elY, this.fontSize);
        x += el.width + S.ElementSpacing;
      }

      y += maxHeight + 4;
    }

    // Scrollbar
    const totalHeight = this.lines.length * (this.lineHeight + 4);
    if (totalHeight > h) {
      const barH = Math.max(20, (h / totalHeight) * h);
      const barY = (this.scrollY / totalHeight) * h;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(w - 8, barY, 6, barH);
    }
  }

  private _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
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
    if (!this.autoRun || !this.onContentChanged) return;
    if (this.autoRunTimer) clearTimeout(this.autoRunTimer);
    this.autoRunTimer = window.setTimeout(() => {
      this.onContentChanged?.(this.toHekatan());
    }, 500);
  }

  /** Toggle autorun */
  setAutoRun(enabled: boolean) {
    this.autoRun = enabled;
  }
}

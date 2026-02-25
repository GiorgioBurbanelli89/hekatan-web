/**
 * MathElement hierarchy - Port del WPF MathEditor a HTML Canvas
 * Todos los elementos matemáticos: texto, fracción, potencia, raíz,
 * subíndice, integral, derivada, matriz, vector, columnas, comentario
 */
import * as S from "./MathStyles";
import { CadEngine } from "./CadEngine";

// ============================================================================
// Canvas helpers
// ============================================================================
function measureText(ctx: CanvasRenderingContext2D, text: string, font: string, fontSize: number): TextMetrics {
  ctx.font = `${fontSize}px ${font}`;
  return ctx.measureText(text);
}

function textWidth(ctx: CanvasRenderingContext2D, text: string, font: string, fontSize: number): number {
  return measureText(ctx, text, font, fontSize).width;
}

function textHeight(fontSize: number): number {
  return fontSize * 1.2;
}

function textBaseline(fontSize: number): number {
  return fontSize * 0.85;
}

// ============================================================================
// MathElement base
// ============================================================================
export abstract class MathElement {
  parent: MathElement | null = null;
  x = 0; y = 0;
  width = 0; height = 0;
  baseline = 0;
  isSelected = false;
  isCursorHere = false;

  abstract measure(ctx: CanvasRenderingContext2D, fontSize: number): void;
  abstract render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number): void;
  abstract toHekatan(): string;

  hitTest(px: number, py: number): MathElement | null {
    if (px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height)
      return this;
    return null;
  }
}

// ============================================================================
// MathGroup — container for multiple elements rendered horizontally
// ============================================================================
export class MathGroup extends MathElement {
  children: MathElement[];

  constructor(children: MathElement[] = []) {
    super();
    this.children = children;
    for (const c of children) c.parent = this;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    let w = 0;
    let maxH = 0;
    let maxBl = 0;
    const gap = 1; // minimal spacing between children
    for (const c of this.children) {
      c.measure(ctx, fontSize);
      w += c.width + gap;
      maxH = Math.max(maxH, c.height);
      maxBl = Math.max(maxBl, c.baseline);
    }
    this.width = Math.max(w - gap, 0);
    this.height = maxH || textHeight(fontSize);
    this.baseline = maxBl || textBaseline(fontSize);
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const gap = 1;
    let cx = x;
    for (const c of this.children) {
      const cy = y + (this.baseline - c.baseline);
      c.render(ctx, cx, cy, fontSize);
      cx += c.width + gap;
    }
  }

  toHekatan(): string {
    return this.children.map(c => c.toHekatan()).join("");
  }

  hitTest(px: number, py: number): MathElement | null {
    for (const c of this.children) {
      const hit = c.hitTest(px, py);
      if (hit) return hit;
    }
    return super.hitTest(px, py);
  }
}

// ============================================================================
// MathText
// ============================================================================
export class MathText extends MathElement {
  private _text = "";
  cursorPosition = 0;
  isVariable = true;
  isVector = false;
  selectionStart = -1;
  selectionEnd = -1;

  get text(): string { return this._text; }
  set text(v: string) { this._text = v ?? ""; }

  get displayText(): string {
    return S.transformOperatorsForDisplay(this._text);
  }

  get hasSelection(): boolean {
    return this.selectionStart >= 0 && this.selectionEnd >= 0 && this.selectionStart !== this.selectionEnd;
  }

  constructor(text = "") { super(); this._text = text; }

  clearSelection() { this.selectionStart = -1; this.selectionEnd = -1; }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const dt = this.displayText;
    if (!dt) {
      this.width = 2;
      this.height = textHeight(fontSize);
      this.baseline = textBaseline(fontSize);
      return;
    }
    const isItalic = !(/^\d/.test(this._text)) && !S.isOperator(this._text) && !S.isKnownFunction(this._text);
    const style = isItalic ? "italic " : "";
    ctx.font = `${style}${fontSize}px ${S.EquationFont}`;
    this.width = ctx.measureText(dt).width;
    this.height = textHeight(fontSize);
    this.baseline = textBaseline(fontSize);
    if (this.isVector) this.width += fontSize * 0.15;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    let cx = x;

    // Fondo de selección
    if (this.isSelected && this.width > 0) {
      ctx.fillStyle = S.SelectionBackground;
      ctx.fillRect(x, y, Math.max(this.width, 4), this.height);
    }

    // Flecha de vector
    if (this.isVector) {
      ctx.font = `${fontSize}px ${S.SymbolFont}`;
      ctx.fillStyle = "#8af";
      ctx.fillText("⃗", cx, y + this.baseline - fontSize * 0.1);
    }

    // Tokenizar y renderizar con highlighting
    const tokens = S.tokenize(this.displayText);
    for (const tk of tokens) {
      let color: string;
      let fontStyle = "";
      if (this.isSelected) {
        color = S.SelectionColor;
      } else if (tk.type === "function") {
        color = S.FunctionColor;
      } else if (tk.type === "number" || tk.type === "operator") {
        color = S.NumberColor;
      } else {
        color = S.VariableColor;
        fontStyle = "italic ";
      }
      ctx.font = `${fontStyle}${fontSize}px ${S.EquationFont}`;
      ctx.fillStyle = color;
      ctx.fillText(tk.text, cx, y + this.baseline);
      cx += ctx.measureText(tk.text).width;
    }

    // Selección de texto parcial
    if (this.hasSelection) {
      const s = Math.min(this.selectionStart, this.selectionEnd);
      const e = Math.max(this.selectionStart, this.selectionEnd);
      const sx = x + this._getOffset(ctx, s, fontSize);
      const ex = x + this._getOffset(ctx, e, fontSize);
      ctx.fillStyle = S.SelectionBackground;
      ctx.fillRect(sx, y + 2, ex - sx, this.height - 4);
    }

    // Cursor
    if (this.isCursorHere) {
      const cursorX = x + this._getCursorOffset(ctx, fontSize);
      ctx.strokeStyle = S.CursorColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, y + 2);
      ctx.lineTo(cursorX, y + this.height - 2);
      ctx.stroke();
    }
  }

  private _getOffset(ctx: CanvasRenderingContext2D, pos: number, fontSize: number): number {
    if (pos <= 0 || !this._text) return 0;
    const before = this._text.slice(0, Math.min(pos, this._text.length));
    const isItalic = !(/^\d/.test(before)) && !S.isOperator(before);
    ctx.font = `${isItalic ? "italic " : ""}${fontSize}px ${S.EquationFont}`;
    return ctx.measureText(S.transformOperatorsForDisplay(before)).width;
  }

  private _getCursorOffset(ctx: CanvasRenderingContext2D, fontSize: number): number {
    return this._getOffset(ctx, this.cursorPosition, fontSize);
  }

  toHekatan(): string { return this._text; }

  insertChar(c: string) {
    this._text = this._text.slice(0, this.cursorPosition) + c + this._text.slice(this.cursorPosition);
    this.cursorPosition++;
  }

  deleteChar() {
    if (this.cursorPosition > 0 && this._text.length > 0) {
      this._text = this._text.slice(0, this.cursorPosition - 1) + this._text.slice(this.cursorPosition);
      this.cursorPosition--;
    }
  }

  deleteForward() {
    if (this.cursorPosition < this._text.length) {
      this._text = this._text.slice(0, this.cursorPosition) + this._text.slice(this.cursorPosition + 1);
    }
  }
}

// ============================================================================
// MathFraction
// ============================================================================
export class MathFraction extends MathElement {
  numerator: MathElement;
  denominator: MathElement;

  private static readonly LINE_THICKNESS = 1.0;
  private static readonly V_PAD = 1.0;
  private static readonly H_PAD = 2.0;

  constructor(num?: MathElement, den?: MathElement) {
    super();
    this.numerator = num ?? new MathText();
    this.denominator = den ?? new MathText();
    this.numerator.parent = this;
    this.denominator.parent = this;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const inner = fontSize * S.FractionSizeRatio;
    this.numerator.measure(ctx, inner);
    this.denominator.measure(ctx, inner);
    this.width = Math.max(this.numerator.width, this.denominator.width) + MathFraction.H_PAD * 2;
    this.height = this.numerator.height + MathFraction.LINE_THICKNESS + this.denominator.height + MathFraction.V_PAD * 4;
    this.baseline = this.numerator.height + MathFraction.V_PAD * 2 + MathFraction.LINE_THICKNESS / 2;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const inner = fontSize * S.FractionSizeRatio;

    const numX = x + (this.width - this.numerator.width) / 2;
    const numY = y + MathFraction.V_PAD;
    const lineY = y + this.numerator.height + MathFraction.V_PAD * 2;
    const denX = x + (this.width - this.denominator.width) / 2;
    const denY = lineY + MathFraction.LINE_THICKNESS + MathFraction.V_PAD;

    this.numerator.render(ctx, numX, numY, inner);

    // Línea de fracción
    ctx.strokeStyle = this.isSelected ? "#00f" : "#000";
    ctx.lineWidth = MathFraction.LINE_THICKNESS;
    ctx.beginPath();
    ctx.moveTo(x + 2, lineY);
    ctx.lineTo(x + this.width - 2, lineY);
    ctx.stroke();

    this.denominator.render(ctx, denX, denY, inner);

    if (this.isSelected) this._drawSelection(ctx, x, y);
  }

  private _drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.strokeStyle = "lightblue";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(0,120,255,0.12)";
    ctx.fillRect(x, y, this.width, this.height);
    ctx.strokeRect(x, y, this.width, this.height);
  }

  toHekatan(): string {
    const n = this.numerator.toHekatan();
    const d = this.denominator.toHekatan();
    const simple = (s: string) => !/[+\-*/]/.test(s);
    return simple(n) && simple(d) ? `${n}/${d}` : `(${n})/(${d})`;
  }

  hitTest(px: number, py: number): MathElement | null {
    return this.numerator.hitTest(px, py) ?? this.denominator.hitTest(px, py) ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathPower
// ============================================================================
export class MathPower extends MathElement {
  base: MathElement;
  exponent: MathElement;

  constructor(base?: MathElement, exp?: MathElement) {
    super();
    this.base = base ?? new MathText();
    this.exponent = exp ?? new MathText();
    this.base.parent = this;
    this.exponent.parent = this;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    this.base.measure(ctx, fontSize);
    this.exponent.measure(ctx, fontSize * S.SuperscriptSizeRatio);
    this.width = this.base.width + this.exponent.width + 1;
    this.height = this.base.height;
    this.baseline = this.base.baseline;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    this.base.render(ctx, x, y, fontSize);
    const expX = x + this.base.width + 1;
    const expY = y - (this.base.height * 0.35);
    this.exponent.render(ctx, expX, expY, fontSize * S.SuperscriptSizeRatio);
    if (this.isSelected) {
      ctx.fillStyle = "rgba(0,120,255,0.12)";
      ctx.fillRect(x, y, this.width, this.height);
    }
  }

  toHekatan(): string {
    let b = this.base.toHekatan();
    let e = this.exponent.toHekatan();
    const complex = (s: string) => /[+\-*/^]/.test(s);
    if (complex(b)) b = `(${b})`;
    return complex(e) ? `${b}^(${e})` : `${b}^${e}`;
  }

  hitTest(px: number, py: number) {
    return this.base.hitTest(px, py) ?? this.exponent.hitTest(px, py) ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathRoot
// ============================================================================
export class MathRoot extends MathElement {
  radicand: MathElement;
  index: MathElement | null;

  private static readonly SYM_W = 12;
  private static readonly TOP_EXT = 4;
  private static readonly V_PAD = 2;

  constructor(radicand?: MathElement, index?: MathElement) {
    super();
    this.radicand = radicand ?? new MathText();
    this.index = index ?? null;
    this.radicand.parent = this;
    if (this.index) this.index.parent = this;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    this.radicand.measure(ctx, fontSize);
    let idxW = 0;
    if (this.index) {
      this.index.measure(ctx, fontSize * 0.6);
      idxW = this.index.width;
    }
    this.width = MathRoot.SYM_W + this.radicand.width + MathRoot.TOP_EXT + idxW * 0.5;
    this.height = this.radicand.height + MathRoot.V_PAD * 2 + 4;
    this.baseline = MathRoot.V_PAD + 4 + this.radicand.baseline;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    let idxW = 0;
    if (this.index) {
      this.index.measure(ctx, fontSize * 0.6);
      idxW = this.index.width * 0.5;
    }
    const symX = x + idxW;
    const contentX = symX + MathRoot.SYM_W;
    const contentY = y + MathRoot.V_PAD + 4;

    // Dibujar símbolo √
    ctx.strokeStyle = this.isSelected ? "#00f" : "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const h = this.radicand.height + MathRoot.V_PAD * 2 + 4;
    const startX = symX;
    const startY = y + h * 0.6;
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + 3, startY + 2);
    ctx.lineTo(startX + 6, y + h - 2);
    ctx.lineTo(startX + MathRoot.SYM_W, y + 2);
    ctx.lineTo(startX + MathRoot.SYM_W + this.radicand.width + MathRoot.TOP_EXT, y + 2);
    ctx.stroke();

    if (this.index) this.index.render(ctx, x, y, fontSize * 0.6);
    this.radicand.render(ctx, contentX, contentY, fontSize);

    if (this.isSelected) {
      ctx.fillStyle = "rgba(0,120,255,0.12)";
      ctx.fillRect(x, y, this.width, this.height);
    }
  }

  toHekatan(): string {
    const c = this.radicand.toHekatan();
    if (!this.index) return `sqrt(${c})`;
    return `root(${c};${this.index.toHekatan()})`;
  }

  hitTest(px: number, py: number) {
    return this.radicand.hitTest(px, py) ?? this.index?.hitTest(px, py) ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathSubscript
// ============================================================================
export class MathSubscript extends MathElement {
  base: MathElement;
  subscript: MathElement;

  constructor(base?: MathElement, sub?: MathElement) {
    super();
    this.base = base ?? new MathText();
    this.subscript = sub ?? new MathText();
    this.base.parent = this;
    this.subscript.parent = this;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    this.base.measure(ctx, fontSize);
    this.subscript.measure(ctx, fontSize * S.SubscriptSizeRatio);
    this.width = this.base.width + this.subscript.width;
    this.height = Math.max(this.base.height, this.base.height * 0.4 + this.subscript.height);
    this.baseline = this.base.baseline;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    this.base.render(ctx, x, y, fontSize);
    const subX = x + this.base.width;
    const subY = y + this.base.height * 0.4;
    // Subíndice con fuente Calibri
    const subFs = fontSize * S.SubscriptSizeRatio;
    const el = this.subscript;
    if (el instanceof MathText) {
      const dt = el.displayText;
      const color = (/^\d/.test(dt)) ? S.NumberColor : S.VariableColor;
      ctx.font = `${subFs}px ${S.SubscriptFont}`;
      ctx.fillStyle = color;
      ctx.fillText(dt, subX, subY + textBaseline(subFs));
      // cursor
      if (el.isCursorHere) {
        const coff = textWidth(ctx, dt.slice(0, Math.min(el.cursorPosition, dt.length)), S.SubscriptFont, subFs);
        ctx.strokeStyle = S.CursorColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(subX + coff, subY + 2);
        ctx.lineTo(subX + coff, subY + subFs - 2);
        ctx.stroke();
      }
    } else {
      el.render(ctx, subX, subY, subFs);
    }
  }

  toHekatan(): string { return `${this.base.toHekatan()}_${this.subscript.toHekatan()}`; }

  hitTest(px: number, py: number) {
    return this.subscript.hitTest(px, py) ?? this.base.hitTest(px, py) ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathIntegral
// ============================================================================
export class MathIntegral extends MathElement {
  integrand: MathElement;
  variable: MathElement;
  lowerLimit: MathElement | null = null;
  upperLimit: MathElement | null = null;
  hasLimits: boolean;

  private static readonly SYM_W = 20;
  private static readonly PAD = 4;

  constructor(hasLimits = false) {
    super();
    this.hasLimits = hasLimits;
    this.integrand = new MathText();
    this.variable = new MathText("x");
    this.integrand.parent = this;
    this.variable.parent = this;
    if (hasLimits) {
      this.lowerLimit = new MathText();
      this.upperLimit = new MathText();
      this.lowerLimit.parent = this;
      this.upperLimit.parent = this;
    }
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const inner = fontSize * 0.85;
    const limitFs = fontSize * 0.6;
    this.integrand.measure(ctx, inner);
    this.variable.measure(ctx, inner);

    const symH = fontSize * 1.5;
    let limitsW = 0, limitsH = 0;
    if (this.hasLimits && this.lowerLimit && this.upperLimit) {
      this.lowerLimit.measure(ctx, limitFs);
      this.upperLimit.measure(ctx, limitFs);
      limitsW = Math.max(this.lowerLimit.width, this.upperLimit.width);
      limitsH = this.lowerLimit.height + this.upperLimit.height;
    }
    this.width = MathIntegral.SYM_W + limitsW + MathIntegral.PAD + this.integrand.width + MathIntegral.PAD + fontSize * 0.3 + this.variable.width + MathIntegral.PAD;
    this.height = Math.max(symH + limitsH * 0.5, this.integrand.height);
    this.baseline = this.height * 0.6;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const inner = fontSize * 0.85;
    const limitFs = fontSize * 0.6;

    // Símbolo ∫
    ctx.font = `${fontSize * 1.8}px ${S.SymbolFont}`;
    ctx.fillStyle = this.isSelected ? "#00f" : "#000";
    ctx.fillText("∫", x, y + this.height * 0.6);

    let cx = x + MathIntegral.SYM_W;

    if (this.hasLimits && this.lowerLimit && this.upperLimit) {
      this.lowerLimit.measure(ctx, limitFs);
      this.upperLimit.measure(ctx, limitFs);
      this.upperLimit.render(ctx, cx, y, limitFs);
      this.lowerLimit.render(ctx, cx, y + this.height - this.lowerLimit.height, limitFs);
      cx += Math.max(this.lowerLimit.width, this.upperLimit.width) + MathIntegral.PAD;
    }

    // Integrando
    this.integrand.render(ctx, cx, y + (this.height - this.integrand.height) / 2, inner);
    cx += this.integrand.width + MathIntegral.PAD;

    // "d"
    ctx.font = `italic ${inner}px ${S.SymbolFont}`;
    ctx.fillStyle = this.isSelected ? "#00f" : "#000";
    ctx.fillText("d", cx, y + (this.height - this.integrand.height) / 2 + textBaseline(inner));
    cx += fontSize * 0.4;

    // Variable
    this.variable.render(ctx, cx, y + (this.height - this.variable.height) / 2, inner);
  }

  toHekatan(): string {
    const ig = this.integrand.toHekatan();
    const v = this.variable.toHekatan();
    if (this.hasLimits && this.lowerLimit && this.upperLimit)
      return `$Integral{${ig} @ ${v} = ${this.lowerLimit.toHekatan()} : ${this.upperLimit.toHekatan()}}`;
    return `$Integral{${ig} @ ${v}}`;
  }

  hitTest(px: number, py: number) {
    return this.integrand.hitTest(px, py) ?? this.variable.hitTest(px, py)
      ?? this.lowerLimit?.hitTest(px, py) ?? this.upperLimit?.hitTest(px, py)
      ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathDerivative
// ============================================================================
export class MathDerivative extends MathElement {
  func: MathElement;
  variable: MathElement;
  order = 1;

  private static readonly PAD = 2;

  constructor(order = 1) {
    super();
    this.order = order;
    this.func = new MathText("f");
    this.variable = new MathText("x");
    this.func.parent = this;
    this.variable.parent = this;
  }

  private _sup(n: number): string {
    const chars = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    return n >= 0 && n <= 9 ? chars[n] : String(n);
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const inner = fontSize * 0.85;
    this.func.measure(ctx, inner);
    this.variable.measure(ctx, inner);
    const dText = this.order > 1 ? `d${this._sup(this.order)}` : "d";
    ctx.font = `italic ${inner}px ${S.SymbolFont}`;
    const dW = ctx.measureText(dText).width;
    const numW = dW + this.func.width;
    const denW = dW + this.variable.width;
    this.width = Math.max(numW, denW) + MathDerivative.PAD * 2;
    this.height = this.func.height + 1 + this.variable.height + MathDerivative.PAD * 4;
    this.baseline = this.func.height + MathDerivative.PAD * 2;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const inner = fontSize * 0.85;
    const dText = this.order > 1 ? `d${this._sup(this.order)}` : "d";
    ctx.font = `italic ${inner}px ${S.SymbolFont}`;
    const dW = ctx.measureText(dText).width;
    const numW = dW + this.func.width;
    const denW = dW + this.variable.width;

    // Numerador
    const numY = y + MathDerivative.PAD;
    const numStartX = x + (this.width - numW) / 2;
    ctx.fillStyle = this.isSelected ? "#00f" : "#000";
    ctx.fillText(dText, numStartX, numY + textBaseline(inner));
    this.func.render(ctx, numStartX + dW, numY, inner);

    // Línea
    const lineY = y + this.func.height + MathDerivative.PAD * 2;
    ctx.strokeStyle = this.isSelected ? "#00f" : "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, lineY);
    ctx.lineTo(x + this.width - 2, lineY);
    ctx.stroke();

    // Denominador
    const denY = lineY + 1 + MathDerivative.PAD;
    const denStartX = x + (this.width - denW) / 2;
    ctx.font = `italic ${inner}px ${S.SymbolFont}`;
    ctx.fillStyle = this.isSelected ? "#00f" : "#000";
    ctx.fillText(dText, denStartX, denY + textBaseline(inner));
    this.variable.render(ctx, denStartX + dW, denY, inner);
  }

  toHekatan(): string {
    const f = this.func.toHekatan();
    const v = this.variable.toHekatan();
    return this.order === 1 ? `$Derivative{${f} @ ${v}}` : `$Derivative{${f} @ ${v} : ${this.order}}`;
  }

  hitTest(px: number, py: number) {
    return this.func.hitTest(px, py) ?? this.variable.hitTest(px, py) ?? super.hitTest(px, py);
  }
}

// ============================================================================
// MathMatrix
// ============================================================================
export class MathMatrix extends MathElement {
  cells: MathElement[][] = [];
  get rows(): number { return this.cells.length; }
  get cols(): number { return this.cells[0]?.length ?? 0; }

  private static readonly CELL_PAD = 6;
  private static readonly BRACKET_W = 8;
  private _colWidths: number[] = [];
  private _rowHeights: number[] = [];

  constructor(rows = 2, cols = 2) {
    super();
    for (let i = 0; i < rows; i++) {
      const row: MathElement[] = [];
      for (let j = 0; j < cols; j++) {
        const cell = new MathText();
        cell.parent = this;
        row.push(cell);
      }
      this.cells.push(row);
    }
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const inner = fontSize * 0.85;
    this._colWidths = new Array(this.cols).fill(0);
    this._rowHeights = new Array(this.rows).fill(0);

    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const cell = this.cells[i][j];
        cell.measure(ctx, inner);
        this._colWidths[j] = Math.max(this._colWidths[j], cell.width);
        this._rowHeights[i] = Math.max(this._rowHeights[i], cell.height);
      }
    }
    let tw = MathMatrix.BRACKET_W * 2;
    for (const w of this._colWidths) tw += w + MathMatrix.CELL_PAD;
    tw -= MathMatrix.CELL_PAD;
    let th = 0;
    for (const h of this._rowHeights) th += h + MathMatrix.CELL_PAD;
    th -= MathMatrix.CELL_PAD;
    th += MathMatrix.CELL_PAD * 2;

    this.width = tw;
    this.height = th;
    this.baseline = th / 2;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const inner = fontSize * 0.85;

    this._drawBracket(ctx, x, y, this.height, true);

    let cy = y + MathMatrix.CELL_PAD;
    for (let i = 0; i < this.rows; i++) {
      let cx = x + MathMatrix.BRACKET_W;
      for (let j = 0; j < this.cols; j++) {
        const cell = this.cells[i][j];
        const cellX = cx + (this._colWidths[j] - cell.width) / 2;
        const cellY = cy + (this._rowHeights[i] - cell.height) / 2;
        cell.render(ctx, cellX, cellY, inner);
        cx += this._colWidths[j] + MathMatrix.CELL_PAD;
      }
      cy += this._rowHeights[i] + MathMatrix.CELL_PAD;
    }

    this._drawBracket(ctx, x + this.width - MathMatrix.BRACKET_W, y, this.height, false);

    if (this.isSelected) {
      ctx.strokeStyle = "rgb(0,120,215)";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(0,120,215,0.4)";
      ctx.fillRect(x, y, this.width, this.height);
      ctx.strokeRect(x, y, this.width, this.height);
    }
  }

  private _drawBracket(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, isLeft: boolean) {
    ctx.strokeStyle = this.isSelected ? "#00f" : "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(x + MathMatrix.BRACKET_W - 2, y);
      ctx.lineTo(x + 2, y);
      ctx.lineTo(x + 2, y + h);
      ctx.lineTo(x + MathMatrix.BRACKET_W - 2, y + h);
    } else {
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + MathMatrix.BRACKET_W - 2, y);
      ctx.lineTo(x + MathMatrix.BRACKET_W - 2, y + h);
      ctx.lineTo(x + 2, y + h);
    }
    ctx.stroke();
  }

  toHekatan(): string {
    // math.js syntax: [[1, 2], [3, 4]]
    const rows = this.cells.map(row =>
      "[" + row.map(c => c.toHekatan()).join(", ") + "]"
    );
    return "[" + rows.join(", ") + "]";
  }

  hitTest(px: number, py: number) {
    for (const row of this.cells)
      for (const cell of row) {
        const h = cell.hitTest(px, py);
        if (h) return h;
      }
    return super.hitTest(px, py);
  }
}

// ============================================================================
// MathVector
// ============================================================================
export class MathVector extends MathElement {
  elements: MathElement[] = [];
  isColumn = true;

  private static readonly ELEM_PAD = 4;
  private static readonly BRACKET_W = 6;

  constructor(length = 3, isColumn = true) {
    super();
    this.isColumn = isColumn;
    for (let i = 0; i < length; i++) {
      const el = new MathText();
      el.parent = this;
      this.elements.push(el);
    }
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const inner = fontSize * 0.85;
    let maxW = 0, maxH = 0, total = 0;
    for (const el of this.elements) {
      el.measure(ctx, inner);
      maxW = Math.max(maxW, el.width);
      maxH = Math.max(maxH, el.height);
      total += (this.isColumn ? el.height : el.width) + MathVector.ELEM_PAD;
    }
    total -= MathVector.ELEM_PAD;
    if (this.isColumn) {
      this.width = maxW + MathVector.BRACKET_W * 2 + MathVector.ELEM_PAD * 2;
      this.height = total + MathVector.ELEM_PAD * 2;
      this.baseline = this.height / 2;
    } else {
      this.width = total + MathVector.BRACKET_W * 2 + MathVector.ELEM_PAD * 2;
      this.height = maxH + MathVector.ELEM_PAD * 2;
      this.baseline = fontSize * 0.8;
    }
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const inner = fontSize * 0.85;
    this._drawBracket(ctx, x, y, this.height, true);

    if (this.isColumn) {
      let cy = y + MathVector.ELEM_PAD;
      for (const el of this.elements) {
        const ex = x + MathVector.BRACKET_W + (this.width - MathVector.BRACKET_W * 2 - el.width) / 2;
        el.render(ctx, ex, cy, inner);
        cy += el.height + MathVector.ELEM_PAD;
      }
    } else {
      let cx = x + MathVector.BRACKET_W + MathVector.ELEM_PAD;
      for (const el of this.elements) {
        const ey = y + this.baseline - el.baseline;
        el.render(ctx, cx, ey, inner);
        cx += el.width + MathVector.ELEM_PAD;
      }
    }
    this._drawBracket(ctx, x + this.width - MathVector.BRACKET_W, y, this.height, false);
  }

  private _drawBracket(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, isLeft: boolean) {
    ctx.strokeStyle = this.isSelected ? "#00f" : "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isLeft) {
      ctx.moveTo(x + MathVector.BRACKET_W - 2, y);
      ctx.lineTo(x + 2, y);
      ctx.lineTo(x + 2, y + h);
      ctx.lineTo(x + MathVector.BRACKET_W - 2, y + h);
    } else {
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + MathVector.BRACKET_W - 2, y);
      ctx.lineTo(x + MathVector.BRACKET_W - 2, y + h);
      ctx.lineTo(x + 2, y + h);
    }
    ctx.stroke();
  }

  toHekatan(): string {
    // math.js syntax: [1, 2, 3] for row, [[1], [2], [3]] for column
    if (this.isColumn) {
      return "[" + this.elements.map(e => "[" + e.toHekatan() + "]").join(", ") + "]";
    }
    return "[" + this.elements.map(e => e.toHekatan()).join(", ") + "]";
  }

  hitTest(px: number, py: number) {
    for (const el of this.elements) {
      const h = el.hitTest(px, py);
      if (h) return h;
    }
    return super.hitTest(px, py);
  }
}

// ============================================================================
// MathComment (Markdown headings/text - Hekatan uses markdown, NOT Calcpad '# )
// ============================================================================
// ─── Comment segment types for rich rendering ───────────────
type CommentSegment =
  | { type: "text"; text: string; italic?: boolean }
  | { type: "subscript"; base: string; sub: string }
  | { type: "superscript"; base: string; sup: string }
  | { type: "vector"; name: string }    // {u} → bold u with arrow
  | { type: "matrix"; name: string }    // [K] → bold K with brackets
  ;

/** Greek letter map for comment display */
const COMMENT_GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε",
  Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ",
  Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο",
  Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ",
  Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
};

function greekifyWord(w: string): string { return COMMENT_GREEK[w] ?? w; }

/** Replace Greek letter names with Unicode in a string */
function greekifyAll(text: string): string {
  return text.replace(/\b([A-Za-z]+)\b/g, (m) => greekifyWord(m));
}

/** Parse comment text into rich segments */
function parseCommentSegments(text: string): CommentSegment[] {
  const segments: CommentSegment[] = [];
  // Regex tokens: {name} vector, [name] matrix, word_sub subscript, word^sup superscript, or plain text
  // Order matters: try structured patterns first, then fall back to plain text
  const re = /(\{(\w+)\})|(\[(\w+)\])|([a-zA-Z\u0370-\u03FF]+)_(\w+)|([a-zA-Z\u0370-\u03FF]+)\^(\w+)|([^{}\[\]_^]+|[{}\[\]_^])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      // {name} → vector
      segments.push({ type: "vector", name: greekifyAll(m[2]) });
    } else if (m[3]) {
      // [name] → matrix
      segments.push({ type: "matrix", name: greekifyAll(m[4]) });
    } else if (m[5] !== undefined && m[6] !== undefined) {
      // word_sub → subscript
      segments.push({ type: "subscript", base: greekifyAll(m[5]), sub: greekifyAll(m[6]) });
    } else if (m[7] !== undefined && m[8] !== undefined) {
      // word^sup → superscript
      segments.push({ type: "superscript", base: greekifyAll(m[7]), sup: greekifyAll(m[8]) });
    } else if (m[9] !== undefined) {
      // plain text — apply Greek replacement
      const plain = greekifyAll(m[9]);
      // Replace * with ·
      segments.push({ type: "text", text: plain.replace(/\*/g, "·") });
    }
  }
  return segments;
}

export class MathComment extends MathElement {
  private _text = "";
  private _displayText = "";
  private _segments: CommentSegment[] = [];
  private _isBold = false;
  private _isItalic = false;
  private _headingLevel = 0;
  cursorPosition = 0;

  get text(): string { return this._text; }
  set text(v: string) {
    this._text = v ?? "";
    this._parseMarkdown(this._text);
  }

  get displayText(): string { return this._displayText; }

  constructor(text = "") {
    super();
    this._text = text;
    this._parseMarkdown(text);
  }

  /** Parse markdown syntax: # heading, **bold**, *italic*, > blockquote, ' comment */
  private _parseMarkdown(input: string) {
    if (!input) {
      this._displayText = "";
      this._segments = [];
      this._headingLevel = 0;
      this._isBold = false;
      this._isItalic = false;
      return;
    }
    let text = input;
    this._headingLevel = 0;
    this._isBold = false;
    this._isItalic = false;

    // Markdown headings: # h1, ## h2, ### h3, etc.
    const hm = text.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      this._headingLevel = hm[1].length;
      this._isBold = true;
      text = hm[2];
    }

    // Strip blockquote prefix: > text
    if (text.startsWith(">")) {
      text = text.slice(1).trimStart();
    }

    // Strip comment prefix: ' text
    if (text.startsWith("'")) {
      text = text.slice(1).trimStart();
    }

    // **bold**
    if (/\*\*(.+)\*\*/.test(text)) {
      this._isBold = true;
      text = text.replace(/\*\*(.+)\*\*/g, "$1");
    }
    // *italic*
    if (/\*(.+)\*/.test(text)) {
      this._isItalic = true;
      text = text.replace(/\*(.+)\*/g, "$1");
    }

    this._displayText = text.trim();
    this._segments = parseCommentSegments(this._displayText);
  }

  private _fontSizeMultiplier(): number {
    return S.HeadingSizeRatios[this._headingLevel] ?? 1.0;
  }

  /** Measure a single segment and return its width */
  private _measureSegment(ctx: CanvasRenderingContext2D, seg: CommentSegment, fs: number, baseStyle: string): number {
    const eqFont = S.EquationFont;
    const subFs = fs * S.SubscriptSizeRatio;
    switch (seg.type) {
      case "text": {
        ctx.font = `${baseStyle}${fs}px ${S.UIFont}`;
        return ctx.measureText(seg.text).width;
      }
      case "subscript": {
        ctx.font = `italic ${fs}px ${eqFont}`;
        const bw = ctx.measureText(seg.base).width;
        ctx.font = `${subFs}px ${S.SubscriptFont}`;
        const sw = ctx.measureText(seg.sub).width;
        return bw + sw;
      }
      case "superscript": {
        ctx.font = `italic ${fs}px ${eqFont}`;
        const bw = ctx.measureText(seg.base).width;
        ctx.font = `${fs * S.SuperscriptSizeRatio}px ${S.SubscriptFont}`;
        const sw = ctx.measureText(seg.sup).width;
        return bw + sw;
      }
      case "vector": {
        // {u} → bold italic u with curly braces
        ctx.font = `bold italic ${fs}px ${eqFont}`;
        const nw = ctx.measureText(seg.name).width;
        ctx.font = `${fs}px ${eqFont}`;
        const lbw = ctx.measureText("{").width;
        const rbw = ctx.measureText("}").width;
        return lbw + nw + rbw;
      }
      case "matrix": {
        // [K] → bold K with square brackets
        ctx.font = `bold italic ${fs}px ${eqFont}`;
        const nw = ctx.measureText(seg.name).width;
        ctx.font = `${fs}px ${eqFont}`;
        const lbw = ctx.measureText("[").width;
        const rbw = ctx.measureText("]").width;
        return lbw + nw + rbw;
      }
    }
    return 0;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const actual = fontSize * this._fontSizeMultiplier();
    if (!this._displayText) {
      this.width = actual * 0.5;
      this.height = textHeight(actual);
      this.baseline = textBaseline(actual);
      return;
    }
    const baseStyle = (this._isBold ? "bold " : "") + (this._isItalic ? "italic " : "");
    let totalW = 0;
    for (const seg of this._segments) {
      totalW += this._measureSegment(ctx, seg, actual, baseStyle);
    }
    this.width = totalW;
    this.height = textHeight(actual);
    this.baseline = textBaseline(actual);
    if (this._headingLevel > 0) this.height += actual * 0.5;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const actual = fontSize * this._fontSizeMultiplier();
    const bl = textBaseline(actual);
    const eqFont = S.EquationFont;
    const baseStyle = (this._isBold ? "bold " : "") + (this._isItalic ? "italic " : "");
    const baseColor = this._headingLevel > 0 && this._headingLevel <= 3 ? "#333" : "#000";
    let cx = x;

    for (const seg of this._segments) {
      switch (seg.type) {
        case "text": {
          ctx.font = `${baseStyle}${actual}px ${S.UIFont}`;
          ctx.fillStyle = baseColor;
          ctx.fillText(seg.text, cx, y + bl);
          cx += ctx.measureText(seg.text).width;
          break;
        }
        case "subscript": {
          // Base in italic equation font
          ctx.font = `italic ${actual}px ${eqFont}`;
          ctx.fillStyle = S.VariableColor;
          ctx.fillText(seg.base, cx, y + bl);
          cx += ctx.measureText(seg.base).width;
          // Subscript in smaller Calibri
          const subFs = actual * S.SubscriptSizeRatio;
          ctx.font = `${subFs}px ${S.SubscriptFont}`;
          ctx.fillStyle = S.NumberColor;
          ctx.fillText(seg.sub, cx, y + actual * 0.4 + textBaseline(subFs));
          cx += ctx.measureText(seg.sub).width;
          break;
        }
        case "superscript": {
          // Base in italic equation font
          ctx.font = `italic ${actual}px ${eqFont}`;
          ctx.fillStyle = S.VariableColor;
          ctx.fillText(seg.base, cx, y + bl);
          cx += ctx.measureText(seg.base).width;
          // Superscript raised
          const supFs = actual * S.SuperscriptSizeRatio;
          ctx.font = `${supFs}px ${S.SubscriptFont}`;
          ctx.fillStyle = S.NumberColor;
          ctx.fillText(seg.sup, cx, y + textBaseline(supFs) * 0.4);
          cx += ctx.measureText(seg.sup).width;
          break;
        }
        case "vector": {
          // {u} → curly braces + bold italic name
          ctx.font = `${actual}px ${eqFont}`;
          ctx.fillStyle = baseColor;
          ctx.fillText("{", cx, y + bl);
          cx += ctx.measureText("{").width;
          ctx.font = `bold italic ${actual}px ${eqFont}`;
          ctx.fillStyle = S.VariableColor;
          ctx.fillText(seg.name, cx, y + bl);
          cx += ctx.measureText(seg.name).width;
          ctx.font = `${actual}px ${eqFont}`;
          ctx.fillStyle = baseColor;
          ctx.fillText("}", cx, y + bl);
          cx += ctx.measureText("}").width;
          break;
        }
        case "matrix": {
          // [K] → square brackets + bold italic name
          ctx.font = `${actual}px ${eqFont}`;
          ctx.fillStyle = baseColor;
          ctx.fillText("[", cx, y + bl);
          cx += ctx.measureText("[").width;
          ctx.font = `bold italic ${actual}px ${eqFont}`;
          ctx.fillStyle = S.VariableColor;
          ctx.fillText(seg.name, cx, y + bl);
          cx += ctx.measureText(seg.name).width;
          ctx.font = `${actual}px ${eqFont}`;
          ctx.fillStyle = baseColor;
          ctx.fillText("]", cx, y + bl);
          cx += ctx.measureText("]").width;
          break;
        }
      }
    }

    // Cursor
    if (this.isCursorHere) {
      ctx.font = `${baseStyle}${actual}px ${S.UIFont}`;
      const coff = this.cursorPosition > 0 && this._text
        ? ctx.measureText(this._text.slice(0, Math.min(this.cursorPosition, this._text.length))).width
        : 0;
      ctx.strokeStyle = S.CursorColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + coff, y + 2);
      ctx.lineTo(x + coff, y + this.height - 2);
      ctx.stroke();
    }
  }

  toHekatan(): string { return this._text; }

  insertChar(c: string) {
    this._text = this._text.slice(0, this.cursorPosition) + c + this._text.slice(this.cursorPosition);
    this.cursorPosition++;
    this._parseMarkdown(this._text);
  }

  deleteChar() {
    if (this.cursorPosition > 0 && this._text.length > 0) {
      this._text = this._text.slice(0, this.cursorPosition - 1) + this._text.slice(this.cursorPosition);
      this.cursorPosition--;
      this._parseMarkdown(this._text);
    }
  }
}

// ============================================================================
// MathCode (bloques de código @{python}, @{js}, etc.)
// ============================================================================
export class MathCode extends MathElement {
  code = "";
  language = "";
  cursorPosition = 0;

  constructor(code = "", language = "") {
    super();
    this.code = code;
    this.language = language;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    ctx.font = `${fontSize * 0.9}px ${S.CodeFont}`;
    const lines = this.code.split("\n");
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    }
    this.width = maxW + 16;
    this.height = lines.length * fontSize * 1.4 + 12;
    this.baseline = textBaseline(fontSize);
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    // Fondo
    ctx.fillStyle = "#f8f8f8";
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, this.width, this.height);
    ctx.strokeRect(x, y, this.width, this.height);

    // Etiqueta del lenguaje
    if (this.language) {
      ctx.font = `bold ${fontSize * 0.7}px ${S.UIFont}`;
      ctx.fillStyle = "#999";
      ctx.fillText(`@{${this.language}}`, x + 4, y + fontSize * 0.7);
    }

    // Código
    ctx.font = `${fontSize * 0.9}px ${S.CodeFont}`;
    ctx.fillStyle = "#333";
    const lines = this.code.split("\n");
    let ly = y + (this.language ? fontSize * 1.2 : 6);
    for (const line of lines) {
      ctx.fillText(line, x + 8, ly + textBaseline(fontSize * 0.9));
      ly += fontSize * 1.4;
    }
  }

  toHekatan(): string {
    return `@{${this.language}}\n${this.code}\n@{end ${this.language}}`;
  }
}

// ============================================================================
// MathColumns (@{columns N} ... @{column} ... @{end columns})
// ============================================================================
export class MathColumns extends MathElement {
  columns: MathElement[][] = [];
  columnCount = 2;
  activeColumnIndex = 0;
  activeElementIndex = 0;

  private static readonly COL_GAP = 15;
  private static readonly PAD = 8;
  private static readonly HEADER_H = 20;
  private static readonly MIN_COL_W = 100;
  private _colWidths: number[] = [];
  private _colHeights: number[] = [];

  constructor(colCount = 2) {
    super();
    this.columnCount = Math.max(2, Math.min(4, colCount));
    for (let i = 0; i < this.columnCount; i++) {
      this.columns.push([]);
    }
  }

  addElement(colIdx: number, el: MathElement) {
    if (colIdx >= 0 && colIdx < this.columns.length) {
      el.parent = this;
      this.columns[colIdx].push(el);
    }
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    this._colWidths = new Array(this.columnCount).fill(MathColumns.MIN_COL_W);
    this._colHeights = new Array(this.columnCount).fill(0);

    for (let ci = 0; ci < this.columns.length; ci++) {
      for (const el of this.columns[ci]) {
        el.measure(ctx, fontSize);
        this._colWidths[ci] = Math.max(this._colWidths[ci], el.width);
        this._colHeights[ci] += el.height + 5;
      }
    }

    let tw = MathColumns.PAD * 2;
    for (let i = 0; i < this.columnCount; i++) {
      tw += this._colWidths[i];
      if (i < this.columnCount - 1) tw += MathColumns.COL_GAP;
    }
    let maxH = 0;
    for (const h of this._colHeights) maxH = Math.max(maxH, h);

    this.width = tw;
    this.height = MathColumns.HEADER_H + maxH + MathColumns.PAD * 2;
    this.baseline = this.height * 0.5;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;

    // Fondo
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "#007acc";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, this.width, this.height);
    ctx.strokeRect(x, y, this.width, this.height);

    // Header
    ctx.font = `bold ${fontSize * 0.8}px ${S.CodeFont}`;
    ctx.fillStyle = "#007acc";
    ctx.fillText(`@{columns ${this.columnCount}}`, x + MathColumns.PAD, y + fontSize * 0.8);

    // Línea header
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(x + 2, y + MathColumns.HEADER_H);
    ctx.lineTo(x + this.width - 2, y + MathColumns.HEADER_H);
    ctx.stroke();

    // Columnas
    let cx = x + MathColumns.PAD;
    const contentY = y + MathColumns.HEADER_H + MathColumns.PAD;

    for (let ci = 0; ci < this.columns.length; ci++) {
      // Fondo columna
      ctx.fillStyle = (ci === this.activeColumnIndex && this.isCursorHere)
        ? "rgba(0,120,215,0.08)" : "rgba(128,128,128,0.04)";
      ctx.fillRect(cx, contentY, this._colWidths[ci], this.height - MathColumns.HEADER_H - MathColumns.PAD * 2);

      // Elementos
      let ey = contentY;
      for (let ei = 0; ei < this.columns[ci].length; ei++) {
        const el = this.columns[ci][ei];
        el.isCursorHere = (ci === this.activeColumnIndex && ei === this.activeElementIndex && this.isCursorHere);
        el.render(ctx, cx, ey, fontSize);
        ey += el.height + 5;
      }

      // Separador vertical
      if (ci < this.columns.length - 1) {
        const sepX = cx + this._colWidths[ci] + MathColumns.COL_GAP / 2;
        ctx.strokeStyle = "#ddd";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sepX, contentY);
        ctx.lineTo(sepX, y + this.height - MathColumns.PAD);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      cx += this._colWidths[ci] + MathColumns.COL_GAP;
    }
  }

  toHekatan(): string {
    const parts: string[] = [];
    parts.push(`@{columns ${this.columnCount}}`);
    for (let ci = 0; ci < this.columns.length; ci++) {
      for (const el of this.columns[ci]) parts.push(el.toHekatan());
      if (ci < this.columns.length - 1) parts.push("@{column}");
    }
    parts.push("@{end columns}");
    return parts.join("\n");
  }

  hitTest(px: number, py: number) {
    if (px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height) {
      let cx = this.x + MathColumns.PAD;
      const contentY = this.y + MathColumns.HEADER_H + MathColumns.PAD;
      for (let ci = 0; ci < this.columns.length; ci++) {
        const colRight = cx + this._colWidths[ci];
        if (px >= cx && px <= colRight && py >= contentY) {
          let ey = contentY;
          for (let ei = 0; ei < this.columns[ci].length; ei++) {
            const el = this.columns[ci][ei];
            el.x = cx; el.y = ey;
            const hit = el.hitTest(px, py);
            if (hit) { this.activeColumnIndex = ci; this.activeElementIndex = ei; return hit; }
            ey += el.height + 5;
          }
          this.activeColumnIndex = ci;
          return this;
        }
        cx += this._colWidths[ci] + MathColumns.COL_GAP;
      }
      return this;
    }
    return null;
  }
}

// ============================================================================
// MathSvg — @{svg W H} ... @{end svg} — SVG drawing DSL rendered on canvas
// ============================================================================

/** Parsed SVG command with options */
interface SvgOpts {
  pos: number[];                       // positional numeric params
  kv: Record<string, string>;          // key:value options
  flags: Set<string>;                  // flags like "bold", "italic"
  text: string | null;                 // quoted text content
}

function parseSvgTokens(tokens: string[]): SvgOpts {
  const pos: number[] = [];
  const kv: Record<string, string> = {};
  const flags = new Set<string>();
  let text: string | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.includes(":")) {
      const ci = tok.indexOf(":");
      kv[tok.slice(0, ci).toLowerCase()] = tok.slice(ci + 1);
    } else if (tok === "bold" || tok === "italic") {
      flags.add(tok);
    } else {
      const n = parseFloat(tok);
      if (!isNaN(n) || tok.includes(",")) {
        pos.push(n);
      } else if (text === null) {
        text = tok;
      } else {
        pos.push(0);
      }
    }
  }
  return { pos, kv, flags, text };
}

/** Split an SVG DSL line respecting quoted strings */
function splitSvgLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === " " || line[i] === "\t") { i++; continue; }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) j++;
      tokens.push(line.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < line.length && line[j] !== " " && line[j] !== "\t") j++;
      tokens.push(line.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function parseColor(c: string | undefined): string {
  if (!c) return "";
  // Accept #hex, named colors, rgb()
  return c;
}

export class MathSvg extends MathElement {
  code = "";
  svgW = 500;
  svgH = 400;
  cursorPosition = 0;

  constructor(code = "", svgW = 500, svgH = 400) {
    super();
    this.code = code;
    this.svgW = svgW;
    this.svgH = svgH;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    // Fixed size from directive @{svg W H}
    this.width = this.svgW + 4;   // +4 for border
    this.height = this.svgH + 4;
    this.baseline = textBaseline(fontSize);
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;

    // Border + background
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, this.width, this.height);
    ctx.strokeRect(x, y, this.width, this.height);

    // Clip to SVG area
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, this.svgW, this.svgH);
    ctx.clip();

    // Origin offset
    const ox = x + 2;
    const oy = y + 2;

    const lines = this.code.split("\n");

    // ── Persistent state ──
    let sStroke = "", sFill = "", sDash = "", sFont = "";
    let sWidth = 0, sFontSize = 0, sOpacity = -1;
    let yUp = false, fitMode = false, fitMargin = 5;

    // ── First pass: detect yup, fit, bounding box ──
    let bbMinX = Infinity, bbMinY = Infinity;
    let bbMaxX = -Infinity, bbMaxY = -Infinity;
    for (const rawLine of lines) {
      const t = rawLine.trim();
      if (!t || t.startsWith("//") || t.startsWith("#")) continue;
      const toks = splitSvgLine(t);
      if (toks.length === 0) continue;
      const c = toks[0].toLowerCase();
      if (c === "yup") { yUp = true; continue; }
      if (c === "fit") { fitMode = true; if (toks.length > 1) fitMargin = parseFloat(toks[1]) || 5; continue; }
      if (["color","stroke","fill","width","opacity","dash","font","fontsize","reset","background"].includes(c)) continue;
      if (fitMode) {
        const fo = parseSvgTokens(toks);
        const upBB = (px: number, py: number) => {
          if (isFinite(px)) { bbMinX = Math.min(bbMinX, px); bbMaxX = Math.max(bbMaxX, px); }
          if (isFinite(py)) { bbMinY = Math.min(bbMinY, py); bbMaxY = Math.max(bbMaxY, py); }
        };
        for (let i = 0; i + 1 < fo.pos.length; i += 2) upBB(fo.pos[i], fo.pos[i + 1]);
        if ((c === "circle" || c === "arc") && fo.pos.length >= 3) {
          const r = fo.pos[2];
          upBB(fo.pos[0] - r, fo.pos[1] - r);
          upBB(fo.pos[0] + r, fo.pos[1] + r);
        }
        if (c === "rect" && fo.pos.length >= 4) upBB(fo.pos[0] + fo.pos[2], fo.pos[1] + fo.pos[3]);
      }
    }

    // ── Coordinate transform functions ──
    let mapX = (v: number) => ox + v;
    let mapY = (v: number) => yUp ? (oy + this.svgH - v) : (oy + v);
    let scaleF = 1;

    if (fitMode && bbMinX < bbMaxX && bbMinY < bbMaxY) {
      const rX = bbMaxX - bbMinX, rY = bbMaxY - bbMinY;
      const mx = rX * fitMargin / 100, my = rY * fitMargin / 100;
      const vx = bbMinX - mx, vy = bbMinY - my;
      const vw = rX + 2 * mx, vh = rY + 2 * my;
      scaleF = Math.min(this.svgW / vw, this.svgH / vh);
      const offX = (this.svgW - vw * scaleF) / 2;
      const offY = (this.svgH - vh * scaleF) / 2;
      mapX = (v) => ox + offX + (v - vx) * scaleF;
      mapY = yUp
        ? (v) => oy + this.svgH - (offY + (v - vy) * scaleF)
        : (v) => oy + offY + (v - vy) * scaleF;
    }

    const scaleD = (v: number) => v * scaleF;

    // ── Style helpers with persistent-state fallback ──
    const applyStyle = (
      lineStroke: string, lineFill: string, lineLw: number | undefined,
      lineOpacity: number | undefined, lineDash: string | undefined,
      defaultStroke?: string, defaultFill?: string
    ) => {
      ctx.strokeStyle = lineStroke || defaultStroke || sStroke || "black";
      ctx.fillStyle = lineFill || defaultFill || sFill || "none";
      ctx.lineWidth = (lineLw ?? (sWidth || 1)) * scaleF;
      const op = lineOpacity ?? (sOpacity >= 0 ? sOpacity : undefined);
      if (op !== undefined) ctx.globalAlpha = op;
      const d = lineDash || sDash;
      if (d) ctx.setLineDash(d.split(",").map(n => Number(n) * scaleF));
      else ctx.setLineDash([]);
    };
    const resetStyle = () => { ctx.globalAlpha = 1; ctx.setLineDash([]); };

    // ── Arrowhead helpers ──
    const drawArrowhead = (px: number, py: number, angle: number, len?: number, color?: string) => {
      const hl = len ?? 10 * scaleF;
      ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(-hl, -hl * 0.4); ctx.lineTo(-hl, hl * 0.4); ctx.closePath();
      ctx.fillStyle = color || ctx.strokeStyle; ctx.fill(); ctx.restore();
    };
    const drawDblArrow = (px: number, py: number, angle: number, len?: number, color?: string) => {
      const hl = len ?? 8 * scaleF;
      ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(-hl, -hl * 0.4); ctx.lineTo(-hl, hl * 0.4); ctx.closePath();
      ctx.fillStyle = color || ctx.strokeStyle; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-hl * 0.6, 0);
      ctx.lineTo(-hl * 1.6, -hl * 0.4); ctx.lineTo(-hl * 1.6, hl * 0.4); ctx.closePath();
      ctx.fill(); ctx.restore();
    };

    // Helper: draw text respecting yUp
    const drawText = (txt: string, tx: number, ty: number, size: number, color: string,
                      align: CanvasTextAlign = "left", baseline: CanvasTextBaseline = "alphabetic",
                      fontOverride?: string) => {
      ctx.save();
      ctx.font = `${size}px ${fontOverride || sFont || "sans-serif"}`;
      ctx.fillStyle = color;
      ctx.textAlign = align; ctx.textBaseline = baseline;
      if (yUp) {
        ctx.save(); ctx.translate(tx, ty); ctx.scale(1, -1);
        ctx.fillText(txt, 0, 0); ctx.restore();
      } else {
        ctx.fillText(txt, tx, ty);
      }
      ctx.restore();
    };

    // ──── Main rendering loop ────
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
      const tokens = splitSvgLine(trimmed);
      if (tokens.length === 0) continue;
      const cmd = tokens[0].toLowerCase();

      // State commands
      if (cmd === "yup" || cmd === "fit") continue;
      if (cmd === "color" || cmd === "stroke") { sStroke = tokens[1] || ""; continue; }
      if (cmd === "fill") { sFill = tokens[1] || ""; continue; }
      if (cmd === "width") { sWidth = parseFloat(tokens[1]) || 0; continue; }
      if (cmd === "opacity") { sOpacity = parseFloat(tokens[1]) ?? -1; continue; }
      if (cmd === "dash") { sDash = tokens[1] || ""; continue; }
      if (cmd === "font") { sFont = tokens.slice(1).join(" ") || ""; continue; }
      if (cmd === "fontsize") { sFontSize = parseFloat(tokens[1]) || 0; continue; }
      if (cmd === "reset") { sStroke = sFill = sDash = sFont = ""; sWidth = sFontSize = 0; sOpacity = -1; continue; }

      if (cmd === "background") {
        ctx.fillStyle = tokens[1] || "#fff";
        ctx.fillRect(ox, oy, this.svgW, this.svgH);
        continue;
      }

      const o = parseSvgTokens(tokens);
      const P = (i: number) => i < o.pos.length ? o.pos[i] : 0;
      const stroke = parseColor(o.kv["stroke"]);
      const fill = parseColor(o.kv["fill"]);
      const lw = o.kv["width"] ? parseFloat(o.kv["width"]) : undefined;
      const opacity = o.kv["opacity"] ? parseFloat(o.kv["opacity"]) : undefined;
      const dash = o.kv["dash"];
      const sc = stroke || sStroke || "black"; // shorthand for stroke color

      switch (cmd) {
        case "line": {
          applyStyle(stroke, fill, lw, opacity, dash, "black");
          ctx.beginPath();
          ctx.moveTo(mapX(P(0)), mapY(P(1)));
          ctx.lineTo(mapX(P(2)), mapY(P(3)));
          ctx.stroke();
          resetStyle();
          break;
        }

        case "rect": {
          applyStyle(stroke, fill, lw, opacity, dash, undefined, "#ccc");
          const rx = o.kv["rx"] ? parseFloat(o.kv["rx"]) * scaleF : 0;
          const rw = scaleD(P(2)), rh = scaleD(P(3));
          const rxc = mapX(P(0)), ryc = yUp ? mapY(P(1)) - rh : mapY(P(1));
          if (rx > 0) {
            const r = Math.min(rx, rw / 2, rh / 2);
            ctx.beginPath();
            ctx.moveTo(rxc + r, ryc);
            ctx.lineTo(rxc + rw - r, ryc);
            ctx.quadraticCurveTo(rxc + rw, ryc, rxc + rw, ryc + r);
            ctx.lineTo(rxc + rw, ryc + rh - r);
            ctx.quadraticCurveTo(rxc + rw, ryc + rh, rxc + rw - r, ryc + rh);
            ctx.lineTo(rxc + r, ryc + rh);
            ctx.quadraticCurveTo(rxc, ryc + rh, rxc, ryc + rh - r);
            ctx.lineTo(rxc, ryc + r);
            ctx.quadraticCurveTo(rxc, ryc, rxc + r, ryc);
            ctx.closePath();
          } else {
            ctx.beginPath();
            ctx.rect(rxc, ryc, rw, rh);
          }
          if (fill || o.kv["fill"]) ctx.fill();
          if (stroke || lw) ctx.stroke();
          resetStyle();
          break;
        }

        case "circle": {
          applyStyle(stroke, fill, lw, opacity, dash, undefined, "none");
          ctx.beginPath();
          ctx.arc(mapX(P(0)), mapY(P(1)), scaleD(P(2)), 0, Math.PI * 2);
          if (fill || o.kv["fill"]) ctx.fill();
          if (stroke || lw || !o.kv["fill"]) ctx.stroke();
          resetStyle();
          break;
        }

        case "ellipse": {
          applyStyle(stroke, fill, lw, opacity, dash, undefined, "none");
          ctx.beginPath();
          ctx.ellipse(mapX(P(0)), mapY(P(1)), scaleD(P(2)), scaleD(P(3)), 0, 0, Math.PI * 2);
          if (fill || o.kv["fill"]) ctx.fill();
          if (stroke || lw || !o.kv["fill"]) ctx.stroke();
          resetStyle();
          break;
        }

        case "polyline": {
          applyStyle(stroke, fill, lw, opacity, dash, "black", "none");
          const pts: [number, number][] = [];
          for (let i = 1; i < tokens.length; i++) {
            if (tokens[i].includes(",") && !tokens[i].includes(":")) {
              const [px, py] = tokens[i].split(",").map(Number);
              if (!isNaN(px) && !isNaN(py)) pts.push([px, py]);
            }
          }
          if (pts.length > 1) {
            ctx.beginPath();
            ctx.moveTo(mapX(pts[0][0]), mapY(pts[0][1]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i][0]), mapY(pts[i][1]));
            ctx.stroke();
          }
          resetStyle();
          break;
        }

        case "polygon": {
          applyStyle(stroke, fill, lw, opacity, dash, "black");
          const pts: [number, number][] = [];
          for (let i = 1; i < tokens.length; i++) {
            if (tokens[i].includes(",") && !tokens[i].includes(":")) {
              const [px, py] = tokens[i].split(",").map(Number);
              if (!isNaN(px) && !isNaN(py)) pts.push([px, py]);
            }
          }
          if (pts.length > 2) {
            ctx.beginPath();
            ctx.moveTo(mapX(pts[0][0]), mapY(pts[0][1]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(mapX(pts[i][0]), mapY(pts[i][1]));
            ctx.closePath();
            if (fill || o.kv["fill"]) ctx.fill();
            ctx.stroke();
          }
          resetStyle();
          break;
        }

        case "text": {
          const txt = o.text ?? "";
          const size = (o.kv["size"] ? parseFloat(o.kv["size"]) : (sFontSize || 12)) * scaleF;
          const color = o.kv["color"] || stroke || sStroke || "black";
          const anchor = o.kv["anchor"] || "start";
          const fontFamily = o.kv["font"] || sFont || "sans-serif";
          const weight = o.flags.has("bold") ? "bold " : "";
          const style = o.flags.has("italic") ? "italic " : "";
          const al: CanvasTextAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
          drawText(txt, mapX(P(0)), mapY(P(1)), size, color, al, "alphabetic",
            `${style}${weight}${size}px ${fontFamily}`);
          resetStyle();
          break;
        }

        case "arc": {
          applyStyle(stroke, fill, lw, opacity, dash, "black", "none");
          const cx = P(0), cy = P(1), r = P(2);
          const startRad = P(3) * Math.PI / 180;
          const endRad = P(4) * Math.PI / 180;
          ctx.beginPath();
          if (yUp) ctx.arc(mapX(cx), mapY(cy), scaleD(r), startRad, endRad, false);
          else ctx.arc(mapX(cx), mapY(cy), scaleD(r), -startRad, -endRad, true);
          ctx.stroke();
          resetStyle();
          break;
        }

        case "arrow": {
          applyStyle(stroke, fill, lw, opacity, dash, "black");
          const ax1 = mapX(P(0)), ay1 = mapY(P(1)), ax2 = mapX(P(2)), ay2 = mapY(P(3));
          ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
          drawArrowhead(ax2, ay2, Math.atan2(ay2 - ay1, ax2 - ax1), undefined, sc);
          resetStyle();
          break;
        }

        // ── Engineering primitives ──

        case "darrow": {
          applyStyle(stroke, fill, lw, opacity, dash, "black");
          const ax1 = mapX(P(0)), ay1 = mapY(P(1)), ax2 = mapX(P(2)), ay2 = mapY(P(3));
          ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
          const ang = Math.atan2(ay2 - ay1, ax2 - ax1);
          drawDblArrow(ax2, ay2, ang, undefined, sc);
          drawDblArrow(ax1, ay1, ang + Math.PI, undefined, sc);
          resetStyle();
          break;
        }

        case "dim": {
          const x1 = P(0), y1 = P(1), x2 = P(2), y2 = P(3);
          const off = parseFloat(o.kv["offset"] || "15");
          const txt = o.text || o.kv["text"] || "";
          const sz = parseFloat(o.kv["size"] || String(sFontSize || 10)) * scaleF;
          const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) break;
          const nx = -dy / len, ny = dx / len;
          ctx.strokeStyle = sc; ctx.lineWidth = 0.5 * scaleF;
          ctx.beginPath();
          ctx.moveTo(mapX(x1), mapY(y1)); ctx.lineTo(mapX(x1 + nx * off * 1.2), mapY(y1 + ny * off * 1.2));
          ctx.moveTo(mapX(x2), mapY(y2)); ctx.lineTo(mapX(x2 + nx * off * 1.2), mapY(y2 + ny * off * 1.2));
          ctx.stroke();
          const d1x = mapX(x1 + nx * off), d1y = mapY(y1 + ny * off);
          const d2x = mapX(x2 + nx * off), d2y = mapY(y2 + ny * off);
          ctx.lineWidth = 1 * scaleF;
          ctx.beginPath(); ctx.moveTo(d1x, d1y); ctx.lineTo(d2x, d2y); ctx.stroke();
          const dAng = Math.atan2(d2y - d1y, d2x - d1x);
          drawArrowhead(d2x, d2y, dAng, 6 * scaleF, sc);
          drawArrowhead(d1x, d1y, dAng + Math.PI, 6 * scaleF, sc);
          if (txt) drawText(txt, (d1x + d2x) / 2, (d1y + d2y) / 2 - 2 * scaleF, sz, sc, "center", "bottom");
          resetStyle();
          break;
        }

        case "hdim": {
          const x1 = P(0), x2 = P(1), hy = P(2);
          const off = parseFloat(o.kv["offset"] || "15");
          const txt = o.text || o.kv["text"] || "";
          const sz = parseFloat(o.kv["size"] || String(sFontSize || 10)) * scaleF;
          const dOff = yUp ? off : -off;
          const d1x = mapX(x1), d1y = mapY(hy + dOff);
          const d2x = mapX(x2), d2y = d1y;
          ctx.strokeStyle = sc; ctx.lineWidth = 0.5 * scaleF;
          ctx.beginPath();
          ctx.moveTo(mapX(x1), mapY(hy)); ctx.lineTo(d1x, d1y + (yUp ? -3 : 3) * scaleF);
          ctx.moveTo(mapX(x2), mapY(hy)); ctx.lineTo(d2x, d2y + (yUp ? -3 : 3) * scaleF);
          ctx.stroke();
          ctx.lineWidth = 1 * scaleF;
          ctx.beginPath(); ctx.moveTo(d1x, d1y); ctx.lineTo(d2x, d2y); ctx.stroke();
          const dAng = Math.atan2(0, d2x - d1x);
          drawArrowhead(d2x, d2y, dAng, 6 * scaleF, sc);
          drawArrowhead(d1x, d1y, dAng + Math.PI, 6 * scaleF, sc);
          if (txt) drawText(txt, (d1x + d2x) / 2, d1y - 2 * scaleF, sz, sc, "center", "bottom");
          resetStyle();
          break;
        }

        case "vdim": {
          const y1 = P(0), y2 = P(1), vx = P(2);
          const off = parseFloat(o.kv["offset"] || "15");
          const txt = o.text || o.kv["text"] || "";
          const sz = parseFloat(o.kv["size"] || String(sFontSize || 10)) * scaleF;
          const d1x = mapX(vx + off), d1y = mapY(y1);
          const d2x = d1x, d2y = mapY(y2);
          ctx.strokeStyle = sc; ctx.lineWidth = 0.5 * scaleF;
          ctx.beginPath();
          ctx.moveTo(mapX(vx), mapY(y1)); ctx.lineTo(d1x + 3 * scaleF, d1y);
          ctx.moveTo(mapX(vx), mapY(y2)); ctx.lineTo(d2x + 3 * scaleF, d2y);
          ctx.stroke();
          ctx.lineWidth = 1 * scaleF;
          ctx.beginPath(); ctx.moveTo(d1x, d1y); ctx.lineTo(d2x, d2y); ctx.stroke();
          const dAng = Math.atan2(d2y - d1y, 0);
          drawArrowhead(d2x, d2y, dAng, 6 * scaleF, sc);
          drawArrowhead(d1x, d1y, dAng + Math.PI, 6 * scaleF, sc);
          if (txt) drawText(txt, d1x + 4 * scaleF, (d1y + d2y) / 2, sz, sc, "left", "middle");
          resetStyle();
          break;
        }

        case "support": {
          const sx = mapX(P(0)), sy = mapY(P(1));
          const type = o.kv["type"] || "pin";
          const sz = scaleD(parseFloat(o.kv["size"] || "20"));
          ctx.strokeStyle = sc;
          ctx.fillStyle = fill || sFill || "none";
          ctx.lineWidth = (lw ?? (sWidth || 1.5)) * scaleF;
          const down = yUp ? -1 : 1;
          if (type === "pin") {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - sz * 0.5, sy + sz * down);
            ctx.lineTo(sx + sz * 0.5, sy + sz * down);
            ctx.closePath(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - sz * 0.6, sy + sz * down);
            ctx.lineTo(sx + sz * 0.6, sy + sz * down);
            ctx.stroke();
          } else if (type === "fixed") {
            const w = sz * 0.8;
            ctx.beginPath();
            ctx.moveTo(sx - w, sy); ctx.lineTo(sx + w, sy); ctx.stroke();
            for (let hi = -3; hi <= 3; hi++) {
              const hx = sx + hi * w / 3;
              ctx.beginPath(); ctx.moveTo(hx, sy);
              ctx.lineTo(hx - sz * 0.3, sy + sz * 0.4 * down); ctx.stroke();
            }
          } else if (type === "roller") {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - sz * 0.4, sy + sz * 0.7 * down);
            ctx.lineTo(sx + sz * 0.4, sy + sz * 0.7 * down);
            ctx.closePath(); ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx, sy + (sz * 0.7 + sz * 0.15) * down, sz * 0.15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - sz * 0.5, sy + (sz * 0.7 + sz * 0.3) * down);
            ctx.lineTo(sx + sz * 0.5, sy + (sz * 0.7 + sz * 0.3) * down);
            ctx.stroke();
          }
          resetStyle();
          break;
        }

        case "dload": {
          const x1 = P(0), y1 = P(1), x2 = P(2), y2 = P(3);
          const n = parseInt(o.kv["n"] || "5");
          const dlc = stroke || sStroke || "blue";
          ctx.strokeStyle = dlc;
          ctx.lineWidth = (lw ?? (sWidth || 1)) * scaleF;
          ctx.beginPath(); ctx.moveTo(mapX(x1), mapY(y1)); ctx.lineTo(mapX(x2), mapY(y2)); ctx.stroke();
          const baseY = parseFloat(o.kv["base"] || "0");
          for (let ai = 0; ai <= n; ai++) {
            const t = n > 0 ? ai / n : 0;
            const ax = x1 + (x2 - x1) * t, ay = y1 + (y2 - y1) * t;
            const bx = mapX(ax), by = mapY(baseY);
            const tx = mapX(ax), ty = mapY(ay);
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
            drawArrowhead(bx, by, Math.atan2(by - ty, bx - tx), 6 * scaleF, dlc);
          }
          resetStyle();
          break;
        }

        case "moment":
        case "carc": {
          const cx = mapX(P(0)), cy = mapY(P(1));
          const r = scaleD(parseFloat(o.kv["r"] || "20"));
          const startDeg = parseFloat(o.kv["start"] || o.kv["startangle"] || "0");
          const endDeg = parseFloat(o.kv["end"] || o.kv["endangle"] || "270");
          const txt = o.text || o.kv["text"] || "";
          ctx.strokeStyle = sc; ctx.lineWidth = (lw ?? (sWidth || 1.5)) * scaleF;
          const startRad = startDeg * Math.PI / 180;
          const endRad = endDeg * Math.PI / 180;
          ctx.beginPath();
          if (yUp) ctx.arc(cx, cy, r, startRad, endRad, false);
          else ctx.arc(cx, cy, r, -startRad, -endRad, true);
          ctx.stroke();
          const aeRad = yUp ? endRad : -endRad;
          const aex = cx + r * Math.cos(aeRad), aey = cy + r * Math.sin(aeRad);
          const tangent = yUp ? (endRad + Math.PI / 2) : (-endRad - Math.PI / 2);
          drawArrowhead(aex, aey, tangent, 8 * scaleF, sc);
          if (txt) {
            const sz = parseFloat(o.kv["size"] || String(sFontSize || 10)) * scaleF;
            drawText(txt, cx, cy, sz, sc, "center", "middle");
          }
          resetStyle();
          break;
        }

        case "axes": {
          const ax = mapX(P(0)), ay = mapY(P(1));
          const len = scaleD(parseFloat(o.kv["length"] || "100"));
          const showLabels = o.kv["labels"] !== "false";
          ctx.strokeStyle = sc; ctx.lineWidth = (lw ?? (sWidth || 1)) * scaleF;
          const xEnd = ax + len;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(xEnd, ay); ctx.stroke();
          drawArrowhead(xEnd, ay, 0, 8 * scaleF, sc);
          const yEndS = mapY(P(1) + parseFloat(o.kv["length"] || "100"));
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, yEndS); ctx.stroke();
          drawArrowhead(ax, yEndS, Math.atan2(yEndS - ay, 0), 8 * scaleF, sc);
          if (showLabels) {
            const sz = parseFloat(o.kv["size"] || "12") * scaleF;
            drawText(o.kv["xlabel"] || "X", xEnd + 5 * scaleF, ay, sz, sc, "left", "middle");
            drawText(o.kv["ylabel"] || "Y", ax, yEndS + (yUp ? 10 : -10) * scaleF, sz, sc, "center", "middle");
          }
          resetStyle();
          break;
        }

        case "node": {
          const nx = mapX(P(0)), ny = mapY(P(1));
          const label = o.text || "";
          const r = scaleD(parseFloat(o.kv["r"] || "12"));
          const fc = fill || sFill || "white";
          ctx.strokeStyle = sc; ctx.lineWidth = (lw ?? (sWidth || 1)) * scaleF;
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2);
          ctx.fillStyle = fc; ctx.fill(); ctx.stroke();
          if (label) {
            const sz = parseFloat(o.kv["size"] || String(r * 1.2)) * scaleF;
            drawText(label, nx, ny, sz, sc, "center", "middle",
              `bold ${sz}px ${sFont || "sans-serif"}`);
          }
          resetStyle();
          break;
        }

        case "grid": {
          const gx = P(0), gy = P(1);
          const gw = P(2) || this.svgW;
          const gh = P(3) || this.svgH;
          const step = o.kv["step"] ? parseFloat(o.kv["step"]) : 50;
          ctx.strokeStyle = stroke || "#ddd";
          ctx.lineWidth = (lw ?? 0.5) * scaleF;
          ctx.globalAlpha = opacity ?? 0.5;
          for (let gxi = gx; gxi <= gx + gw; gxi += step) {
            ctx.beginPath(); ctx.moveTo(mapX(gxi), mapY(gy)); ctx.lineTo(mapX(gxi), mapY(gy + gh)); ctx.stroke();
          }
          for (let gyi = gy; gyi <= gy + gh; gyi += step) {
            ctx.beginPath(); ctx.moveTo(mapX(gx), mapY(gyi)); ctx.lineTo(mapX(gx + gw), mapY(gyi)); ctx.stroke();
          }
          resetStyle();
          break;
        }

        case "path": {
          applyStyle(stroke, fill, lw, opacity, dash, "black", "none");
          const d = o.kv["d"] || o.text || "";
          if (d) {
            const p = new Path2D(d);
            ctx.save();
            ctx.translate(ox, yUp ? oy + this.svgH : oy);
            if (yUp) ctx.scale(1, -1);
            if (fill || o.kv["fill"]) ctx.fill(p);
            ctx.stroke(p);
            ctx.restore();
          }
          resetStyle();
          break;
        }

        case "group": {
          ctx.save();
          if (o.kv["translate"]) {
            const [tx, ty] = o.kv["translate"].split(",").map(Number);
            ctx.translate((tx || 0) * scaleF, (ty || 0) * scaleF * (yUp ? -1 : 1));
          }
          if (o.kv["rotate"]) ctx.rotate(parseFloat(o.kv["rotate"]) * Math.PI / 180 * (yUp ? -1 : 1));
          if (o.kv["scale"]) { const s = parseFloat(o.kv["scale"]); ctx.scale(s, s); }
          break;
        }
        case "endgroup": {
          ctx.restore();
          break;
        }

        default:
          break;
      }
    }

    ctx.restore();

    // Label tag
    ctx.font = `bold ${fontSize * 0.65}px ${S.UIFont}`;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.textAlign = "right";
    ctx.fillText(`@{svg ${this.svgW}×${this.svgH}}`, x + this.width - 4, y + fontSize * 0.7);
    ctx.textAlign = "left";
  }

  toHekatan(): string {
    return `@{svg ${this.svgW} ${this.svgH}}\n${this.code}\n@{end svg}`;
  }
}

// ============================================================================
// MathDraw — Bloque CAD interactivo @{draw W H [align]}
// ============================================================================
export class MathDraw extends MathElement {
  code = "";
  drawW = 600;
  drawH = 400;
  align: "left" | "center" | "right" = "center";
  cadEngine: CadEngine;
  cursorPosition = 0;

  constructor(code = "", drawW = 600, drawH = 400, align: "left" | "center" | "right" = "center") {
    super();
    this.code = code;
    this.drawW = drawW;
    this.drawH = drawH;
    this.align = align;
    this.cadEngine = new CadEngine();
    this.cadEngine.canvasW = drawW;
    this.cadEngine.canvasH = drawH;
    // Execute CLI commands from the code block
    if (code.trim()) {
      this.cadEngine.exec(code);
      if (this.cadEngine.formas.length > 0) {
        this.cadEngine.zoomFit();
      }
    }
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    this.width = this.drawW + 4;   // +4 for border
    this.height = this.drawH + 4;
    this.baseline = textBaseline(fontSize);
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;

    ctx.save();

    // Background
    ctx.fillStyle = S.DrawBackground;
    ctx.strokeStyle = S.DrawBorderColor;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, this.width, this.height);
    ctx.strokeRect(x, y, this.width, this.height);

    // Clip to draw area
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, this.drawW, this.drawH);
    ctx.clip();

    // Render CAD engine content
    ctx.save();
    ctx.translate(x + 2, y + 2);
    this.cadEngine.renderToCtx(ctx, this.drawW, this.drawH);
    ctx.restore();

    ctx.restore();

    // Label "@{draw}" small tag in top-right
    ctx.font = `bold ${fontSize * 0.65}px ${S.UIFont}`;
    ctx.fillStyle = S.DrawLabelColor;
    ctx.textAlign = "right";
    ctx.fillText(`@{draw ${this.drawW}×${this.drawH}}`, x + this.width - 4, y + fontSize * 0.7);
    ctx.textAlign = "left";
  }

  toHekatan(): string {
    const alignStr = this.align !== "center" ? ` ${this.align}` : "";
    return `@{draw ${this.drawW} ${this.drawH}${alignStr}}\n${this.code}\n@{end draw}`;
  }
}

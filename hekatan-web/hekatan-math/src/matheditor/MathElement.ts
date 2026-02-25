/**
 * MathElement hierarchy - Port del WPF MathEditor a HTML Canvas
 * Todos los elementos matemáticos: texto, fracción, potencia, raíz,
 * subíndice, integral, derivada, matriz, vector, columnas, comentario
 */
import * as S from "./MathStyles";

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
export class MathComment extends MathElement {
  private _text = "";
  private _displayText = "";
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

  /** Parse markdown syntax: # heading, **bold**, *italic* */
  private _parseMarkdown(input: string) {
    if (!input) {
      this._displayText = "";
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
  }

  private _fontSizeMultiplier(): number {
    return S.HeadingSizeRatios[this._headingLevel] ?? 1.0;
  }

  measure(ctx: CanvasRenderingContext2D, fontSize: number) {
    const actual = fontSize * this._fontSizeMultiplier();
    const dt = this._displayText;
    if (!dt) {
      this.width = actual * 0.5;
      this.height = textHeight(actual);
      this.baseline = textBaseline(actual);
      return;
    }
    const style = (this._isBold ? "bold " : "") + (this._isItalic ? "italic " : "");
    const font = this._headingLevel > 0 ? S.UIFont : S.UIFont;
    ctx.font = `${style}${actual}px ${font}`;
    this.width = ctx.measureText(dt).width;
    this.height = textHeight(actual);
    this.baseline = textBaseline(actual);
    if (this._headingLevel > 0) this.height += actual * 0.5;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number) {
    this.x = x; this.y = y;
    const actual = fontSize * this._fontSizeMultiplier();
    const dt = this._displayText;
    if (dt) {
      const style = (this._isBold ? "bold " : "") + (this._isItalic ? "italic " : "");
      const font = S.UIFont;
      ctx.font = `${style}${actual}px ${font}`;
      ctx.fillStyle = this._headingLevel > 0 && this._headingLevel <= 3 ? "#333" : "#000";
      ctx.fillText(dt, x, y + textBaseline(actual));
    }
    if (this.isCursorHere) {
      const style = (this._isBold ? "bold " : "") + (this._isItalic ? "italic " : "");
      ctx.font = `${style}${actual}px ${S.UIFont}`;
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

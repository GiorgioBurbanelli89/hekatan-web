/**
 * Hekatan Parser — Parses .hcalc text → HTML output
 *
 * Supports: variables, expressions, for/if/while/repeat (also legacy #for/#if),
 * @{plot}/@{eq}/@{svg}/@{three}/@{plotly} directive blocks,
 * comments, markdown, user functions
 */
import { parseExpression, evaluate, HekatanEnvironment, type ASTNode } from "./evaluator.js";
import { renderNode, renderValue, renderValueRow, renderValueCol, renderInlineText, renderEquationText, renderVarName } from "./renderer.js";

const BLOCK_OPEN_RE = /^@\{(plot|plotly|svg|three|eq|draw|text|columns)\b\s*([^}]*)\}\s*$/i;
const BLOCK_CLOSE_RE = /^@\{end\s+(plot|plotly|svg|three|eq|draw|text|columns)\}\s*$/i;

// ─── Main parse function ─────────────────────────────────
export function parse(source: string, existingEnv?: HekatanEnvironment, compact?: boolean): { html: string; env: HekatanEnvironment } {
  const env = existingEnv ?? new HekatanEnvironment();
  const lines = source.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let trimmed = line.trim();

    // Empty line
    if (!trimmed) { html += '<div class="spacer"></div>'; i++; continue; }

    // Code comment: // (full-line or inline — invisible in output)
    if (trimmed.startsWith("//")) { i++; continue; }
    if (trimmed.includes("//")) {
      trimmed = trimmed.slice(0, trimmed.indexOf("//")).trim();
      if (!trimmed) { i++; continue; }
    }

    // @{hide} ... @{show}: parse silently (evaluate but suppress output)
    if (/^@\{hide\}\s*$/i.test(trimmed)) {
      const hideLines: string[] = [];
      i++;
      while (i < lines.length) {
        const ht = lines[i].trim();
        if (/^@\{show\}\s*$/i.test(ht)) { i++; break; }
        hideLines.push(lines[i]);
        i++;
      }
      // Evaluate all lines silently (variables get set, functions defined, but no HTML)
      parse(hideLines.join("\n"), env);
      continue;
    }

    // @{config ...} — single-line directive, skip silently
    if (/^@\{config\b[^}]*\}\s*$/i.test(trimmed)) { i++; continue; }

    // @{pagebreak} — page break
    if (/^@\{pagebreak\}\s*$/i.test(trimmed)) { html += '<div style="page-break-after:always"></div>'; i++; continue; }

    // --- horizontal rule
    if (/^---+\s*$/.test(trimmed)) { html += '<hr>'; i++; continue; }

    // Directive block @{plot} ... @{end plot}
    const blockMatch = trimmed.match(BLOCK_OPEN_RE);
    if (blockMatch) {
      const blockType = blockMatch[1].toLowerCase();
      const blockArgs = blockMatch[2]?.trim() || "";
      const blockLines: string[] = [];
      i++;
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (BLOCK_CLOSE_RE.test(lt)) { i++; break; }
        blockLines.push(lines[i]);
        i++;
      }
      html += parseDirectiveBlock(blockType, blockLines, blockArgs, env);
      continue;
    }

    // Control flow: for / #for (Hekatan supports both)
    if (/^#?for\s+/i.test(trimmed)) {
      const result = parseFor(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // if / #if
    if (/^#?if\s+/i.test(trimmed)) {
      const result = parseIf(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // while / #while
    if (/^#?while\s+/i.test(trimmed)) {
      const result = parseWhile(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // repeat / #repeat
    if (/^#?repeat\s*$/i.test(trimmed)) {
      const result = parseRepeat(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }

    // Heading: # Title, ## Subtitle (NOT #for/#if/#while/#repeat)
    if (/^#{1,6}\s+/.test(trimmed) && !/^#(?:for|if|else|end|while|loop|repeat|until|next)\b/i.test(trimmed)) {
      const level = (trimmed.match(/^#+/) || [""])[0].length;
      const hText = trimmed.slice(level).trim();
      html += `<h${Math.min(level, 6)}>${renderInlineText(hText)}</h${Math.min(level, 6)}>`;
      i++; continue;
    }

    // Text line: > description
    if (trimmed.startsWith(">")) {
      const text = trimmed.slice(1).trim();
      html += `<p class="comment">${renderInlineText(text)}</p>`;
      i++; continue;
    }

    // Inline cells: @{cells} |expr1|expr2|...| or @{cells} |expr1|expr2|expr3|
    if (/^@\{cells\}\s*\|/.test(trimmed)) {
      const cellPart = trimmed.replace(/^@\{cells\}\s*/, "");
      // Split by | and filter empties
      const cells = cellPart.split("|").map(s => s.trim()).filter(Boolean);
      let row = '<div class="cells-row">';
      for (const cell of cells) {
        row += `<div class="cell">${parseLine(cell, env)}</div>`;
      }
      row += "</div>";
      html += row;
      i++; continue;
    }

    // Comment line: starts with '
    if (trimmed.startsWith("'")) {
      const commentText = trimmed.slice(1).trim();
      // Check if it's markdown-like
      if (commentText.startsWith("#")) {
        const level = (commentText.match(/^#+/) || [""])[0].length;
        const hText = commentText.slice(level).trim();
        html += `<h${Math.min(level, 6)}>${renderInlineText(hText)}</h${Math.min(level, 6)}>`;
      } else if (commentText.startsWith("---")) {
        html += "<hr>";
      } else if (commentText.startsWith("- ") || commentText.startsWith("* ")) {
        html += `<li>${renderInlineText(commentText.slice(2))}</li>`;
      } else {
        html += `<p class="comment">${renderInlineText(commentText)}</p>`;
      }
      i++; continue;
    }

    // User function definition: f(x) = expr
    const fnMatch = trimmed.match(/^([A-Za-z_]\w*)\(([^)]*)\)\s*=\s*(.+)$/);
    if (fnMatch) {
      const [, fname, paramsStr, bodyStr] = fnMatch;
      const params = paramsStr.split(",").map(s => s.trim()).filter(Boolean);
      try {
        const body = parseExpression(bodyStr);
        env.userFunctions.set(fname, { params, body });
        html += `<div class="line fn-def"><var>${fname}</var>(${params.join(", ")}) = ${renderInlineText(bodyStr)}</div>`;
      } catch (e: any) {
        html += `<div class="line error">${trimmed} → Error: ${e.message}</div>`;
      }
      i++; continue;
    }

    // Expression / assignment line
    html += parseLine(trimmed, env, compact);
    i++;
  }

  return { html, env };
}

// ─── Parse single line ───────────────────────────────────
// ─── Render integral() as ∫ notation ──────────────────────
function renderIntegralNotation(callNode: any, env: HekatanEnvironment): string | null {
  const fnName = callNode.name as string;
  const args = callNode.args as any[];
  if (!args || args.length < 3) return null;

  // First arg is the function reference
  const fnRef = args[0];
  const fnKey = fnRef.type === "var" ? fnRef.name : null;
  if (!fnKey) return null;

  const userFn = env.userFunctions.get(fnKey);
  if (!userFn) return null;

  const bodyHtml = renderNode(userFn.body);
  const params = userFn.params; // e.g. ["x"] or ["x","y"] or ["x","y","z"]

  // Helper: build one ∫ symbol with limits
  const intSym = (lo: string, hi: string) =>
    `<span class="dvr"><small>${hi}</small><span class="nary"><em>∫</em></span><small>${lo}</small></span>`;

  if (/^(integral|integrate)$/.test(fnName) && args.length >= 3) {
    // integral(f, a, b)
    const lo = renderNode(args[1]);
    const hi = renderNode(args[2]);
    const dv = params[0] || "x";
    return `${intSym(lo, hi)} (${bodyHtml}) <i>d${dv}</i>`;
  }

  if (/^(integral2|integrate2|dblintegral)$/.test(fnName) && args.length >= 5) {
    // integral2(f, xa, xb, ya, yb)
    const xlo = renderNode(args[1]), xhi = renderNode(args[2]);
    const ylo = renderNode(args[3]), yhi = renderNode(args[4]);
    const dx = params[0] || "x", dy = params[1] || "y";
    return `${intSym(xlo, xhi)} ${intSym(ylo, yhi)} (${bodyHtml}) <i>d${dy}</i> <i>d${dx}</i>`;
  }

  if (/^(integral3|integrate3|tplintegral)$/.test(fnName) && args.length >= 7) {
    // integral3(f, xa, xb, ya, yb, za, zb)
    const xlo = renderNode(args[1]), xhi = renderNode(args[2]);
    const ylo = renderNode(args[3]), yhi = renderNode(args[4]);
    const zlo = renderNode(args[5]), zhi = renderNode(args[6]);
    const dx = params[0] || "x", dy = params[1] || "y", dz = params[2] || "z";
    return `${intSym(xlo, xhi)} ${intSym(ylo, yhi)} ${intSym(zlo, zhi)} (${bodyHtml}) <i>d${dz}</i> <i>d${dy}</i> <i>d${dx}</i>`;
  }

  return null;
}

function parseLine(line: string, env: HekatanEnvironment, compact?: boolean): string {
  try {
    const ast = parseExpression(line);

    // Display hint: row(expr) → horizontal, col(expr) → vertical
    if (ast.type === "call" && (ast.name === "row" || ast.name === "col") && ast.args.length === 1) {
      const innerAst = ast.args[0];
      const val = evaluate(innerAst, env);
      const valHtml = ast.name === "row" ? renderValueRow(val) : renderValueCol(val);
      if (compact) return `<div class="line expr">${valHtml}</div>`;
      return `<div class="line expr">${renderNode(innerAst)} = ${valHtml}</div>`;
    }
    // Display hint on assignment: x = row(expr)
    if (ast.type === "assign" && (ast.expr as any).type === "call" &&
        ((ast.expr as any).name === "row" || (ast.expr as any).name === "col") &&
        (ast.expr as any).args?.length === 1) {
      const callExpr = ast.expr as any;
      const innerAst = callExpr.args[0];
      const val = evaluate(innerAst, env);
      env.setVar(ast.name, val);
      const valHtml = callExpr.name === "row" ? renderValueRow(val) : renderValueCol(val);
      const lhs = `<var>${renderVarName(ast.name)}</var>`;
      if (compact) return `<div class="line assign">${lhs} = ${valHtml}</div>`;
      return `<div class="line assign">${lhs} = ${renderNode(innerAst)} = ${valHtml}</div>`;
    }

    const val = evaluate(ast, env);

    if (ast.type === "assign") {
      const valHtml = renderValue(val);
      let lhs = `<var>${renderVarName(ast.name)}</var>`;
      if (ast.indices) {
        const idxStr = ast.indices.map(n => renderNode(n)).join(",");
        lhs += `<sub>${idxStr}</sub>`;
      }
      // Compact mode (inside loops): show only name = value (MATLAB style)
      if (compact) {
        return `<div class="line assign">${lhs} = ${valHtml}</div>`;
      }
      // Render integral() calls with ∫ notation instead of function name
      const callExpr = ast.expr as any;
      if (callExpr.type === "call" &&
          /^(integral[23]?|integrate[23]?|dblintegral|tplintegral)$/.test(callExpr.name)) {
        const intHtml = renderIntegralNotation(callExpr, env);
        if (intHtml) {
          return `<div class="line assign eq">${lhs} = ${intHtml} = ${valHtml}</div>`;
        }
        // fallback: just show result
        return `<div class="line assign">${lhs} = ${valHtml}</div>`;
      }
      return `<div class="line assign">${lhs} = ${renderNode(ast.expr)} = ${valHtml}</div>`;
    }

    // Expression result
    if (compact) {
      return `<div class="line expr">${renderValue(val)}</div>`;
    }
    return `<div class="line expr">${renderNode(ast)} = ${renderValue(val)}</div>`;
  } catch (e: any) {
    return `<div class="line error">${renderInlineText(line)} <span class="err">← ${e.message}</span></div>`;
  }
}

// ─── Directive blocks ────────────────────────────────────
function parseDirectiveBlock(type: string, lines: string[], args?: string, env?: HekatanEnvironment): string {
  switch (type) {
    case "eq": return handleEqBlock(lines, args || "");
    case "plot": return handlePlotBlock(lines, env);
    case "plotly": return handlePlotlyBlock(lines);
    case "svg": return handleSvgBlock(lines);
    case "three": return handleThreeBlock(lines);
    case "draw": return `<!-- draw block (${args || ""}) - rendered in GUI -->`;
    case "text": return lines.map(l => `<p class="comment">${l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>`).join("");
    case "columns": return `<!-- columns block -->`;
    default: return `<pre>${lines.join("\n")}</pre>`;
  }
}

// ─── @{eq} block ─────────────────────────────────────────
function handleEqBlock(lines: string[], args: string): string {
  if (lines.length === 0) return "";
  const alignMatch = args.match(/(left|right|center)/i);
  const align = alignMatch ? alignMatch[1].toLowerCase() : "center";
  const sizeMatch = args.match(/size:(\d+)/i);
  const fontSize = sizeMatch ? sizeMatch[1] : "";
  const fsStyle = fontSize ? `font-size:${fontSize}px;` : "";

  // Parse all lines: extract eq number, detect "=" for alignment
  interface EqParsed { empty?: boolean; left?: string; right?: string; full?: string; hasEquals?: boolean; eqNum?: string; }
  const parsed: EqParsed[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { parsed.push({ empty: true }); continue; }

    // Equation number at end: (1), (2a), (5.11)
    const numMatch = trimmed.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);
    let eqText = trimmed;
    let eqNum = "";
    if (numMatch) {
      eqText = trimmed.slice(0, numMatch.index).trim();
      eqNum = numMatch[1];
    }

    // Split at first " = " (main equality) — not >=, <=, !=, ==
    const eqIdx = eqText.indexOf(" = ");
    if (eqIdx >= 0) {
      parsed.push({ left: eqText.slice(0, eqIdx).trim(), right: eqText.slice(eqIdx + 3).trim(), hasEquals: true, eqNum });
    } else {
      parsed.push({ full: eqText, hasEquals: false, eqNum });
    }
  }

  // Use aligned table layout when: >1 non-empty line AND ≥50% have "="
  const nonEmpty = parsed.filter(p => !p.empty);
  const withEquals = nonEmpty.filter(p => p.hasEquals);
  const useAligned = nonEmpty.length > 1 && withEquals.length >= nonEmpty.length * 0.5;

  if (useAligned) {
    // Aligned mode: 5-column table — spacer | LHS | = | RHS | num(right-aligned)
    // Left/right spacers at 50% width center the equation columns; number goes to far right margin
    let html = `<div class="eq-block" style="margin:8px 0;${fsStyle}">`;
    html += `<table class="eq-align-tbl" style="width:100%;border-collapse:collapse;">`;
    html += `<colgroup><col style="width:50%"><col><col><col><col style="width:50%"></colgroup>`;
    for (const p of parsed) {
      if (p.empty) { html += `<tr><td colspan="5" style="height:4px"></td></tr>`; continue; }
      html += `<tr>`;
      html += `<td></td>`; // left spacer
      if (p.hasEquals) {
        html += `<td class="eq" style="text-align:right;padding:2px 0;white-space:nowrap;line-height:2.2;">${renderEquationText(p.left!)}</td>`;
        html += `<td class="eq" style="text-align:center;padding:2px 4px;white-space:nowrap;line-height:2.2;"> = </td>`;
        html += `<td class="eq" style="text-align:left;padding:2px 0;white-space:nowrap;line-height:2.2;">${renderEquationText(p.right!)}</td>`;
      } else {
        html += `<td class="eq" colspan="3" style="text-align:left;padding:2px 0;white-space:nowrap;line-height:2.2;">${renderEquationText(p.full!)}</td>`;
      }
      html += p.eqNum
        ? `<td style="text-align:right;white-space:nowrap;font-style:normal;line-height:2.2;">(${p.eqNum})</td>`
        : `<td></td>`;
      html += `</tr>`;
    }
    html += `</table></div>`;
    return html;
  }

  // Single line or no alignment needed: original centered behavior
  let html = `<div class="eq-block" style="text-align:${align};margin:8px 0;${fsStyle}">`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { html += '<div style="height:4px"></div>'; continue; }
    const numMatch = trimmed.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);
    let eqText = trimmed;
    let eqNum = "";
    if (numMatch) { eqText = trimmed.slice(0, numMatch.index).trim(); eqNum = numMatch[1]; }
    html += '<p class="eq" style="margin:4px 0;line-height:2.2;">';
    html += renderEquationText(eqText);
    if (eqNum) html += `<span style="float:right;font-style:normal;margin-left:24px">(${eqNum})</span>`;
    html += "</p>";
  }
  return html + "</div>";
}

// ─── @{plot} SVG renderer ────────────────────────────────
function heatColor(t: number): string {
  // t in [0,1] → blue → cyan → green → yellow → red
  t = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (t < 0.25)      { r = 0; g = Math.round(255 * t * 4); b = 255; }
  else if (t < 0.5)  { r = 0; g = 255; b = Math.round(255 * (1 - (t - 0.25) * 4)); }
  else if (t < 0.75) { r = Math.round(255 * (t - 0.5) * 4); g = 255; b = 0; }
  else               { r = 255; g = Math.round(255 * (1 - (t - 0.75) * 4)); b = 0; }
  return `rgb(${r},${g},${b})`;
}

export function handlePlotBlock(lines: string[], outerEnv?: HekatanEnvironment): string {
  let plotW = 600, plotH = 400;
  const PAD = 50;
  let xMin = -5, xMax = 5, yMin = -2, yMax = 2;
  const funcs: { expr: string; color: string; width: number; label: string; style: string }[] = [];
  const annotations: string[] = [];
  let heatmapVar = "";
  let colorbarLabel = "";
  let showMesh = false;
  let title = "", xlabel = "", ylabel = "";
  let showGrid = true;

  // ── Track "function:" numbered properties ──
  // funcMap[n] stores properties for function N (1-based)
  const funcMap: Record<number, { expr?: string; color?: string; linewidth?: number; legend?: string; style?: string }> = {};
  let lastFuncIdx = 0;  // last function index defined via function:/functionN:

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("'")) continue;

    // Title and axis labels
    const titleMatch = t.match(/^title:\s*(.+)/i);
    if (titleMatch) { title = titleMatch[1].trim(); continue; }
    const xlabelMatch = t.match(/^xlabel:\s*(.+)/i);
    if (xlabelMatch) { xlabel = xlabelMatch[1].trim(); continue; }
    const ylabelMatch = t.match(/^ylabel:\s*(.+)/i);
    if (ylabelMatch) { ylabel = ylabelMatch[1].trim(); continue; }

    // Plot dimensions: width: 700, height: 450
    const pwMatch = t.match(/^width:\s*(\d+)\s*$/i);
    if (pwMatch) { plotW = +pwMatch[1]; continue; }
    const phMatch = t.match(/^height:\s*(\d+)\s*$/i);
    if (phMatch) { plotH = +phMatch[1]; continue; }

    // Grid: true/false
    const gridMatch = t.match(/^grid:\s*(true|false)\s*$/i);
    if (gridMatch) { showGrid = gridMatch[1].toLowerCase() === "true"; continue; }

    // showlegend: true/false (ignored for now — legend shows when label set)
    if (/^showlegend:\s*(true|false)\s*$/i.test(t)) continue;

    // Range: x = -5 : 5  OR  xlim: -5, 5
    const xRange = t.match(/^x\s*=\s*([-\d.e]+)\s*:\s*([-\d.e]+)/);
    if (xRange) { xMin = +xRange[1]; xMax = +xRange[2]; continue; }
    const yRange = t.match(/^y\s*=\s*([-\d.e]+)\s*:\s*([-\d.e]+)/);
    if (yRange) { yMin = +yRange[1]; yMax = +yRange[2]; continue; }
    const xlimMatch = t.match(/^xlim:\s*([-\d.e]+)\s*,\s*([-\d.e]+)/i);
    if (xlimMatch) { xMin = +xlimMatch[1]; xMax = +xlimMatch[2]; continue; }
    const ylimMatch = t.match(/^ylim:\s*([-\d.e]+)\s*,\s*([-\d.e]+)/i);
    if (ylimMatch) { yMin = +ylimMatch[1]; yMax = +ylimMatch[2]; continue; }

    // Heatmap: heatmap VARNAME
    const hmMatch = t.match(/^heatmap\s+(\w+)\s*$/i);
    if (hmMatch) { heatmapVar = hmMatch[1]; continue; }

    // Colorbar: colorbar "label"
    const cbMatch = t.match(/^colorbar\s+"([^"]+)"/i);
    if (cbMatch) { colorbarLabel = cbMatch[1]; continue; }

    // Mesh overlay
    if (/^mesh\s*$/i.test(t)) { showMesh = true; continue; }

    // ── function: / functionN: syntax (Hekatan C# compatible) ──
    const funcMatch = t.match(/^function(\d*):\s*(.+)/i);
    if (funcMatch) {
      const idx = funcMatch[1] ? +funcMatch[1] : (lastFuncIdx + 1);
      if (!funcMap[idx]) funcMap[idx] = {};
      funcMap[idx].expr = funcMatch[2].trim();
      lastFuncIdx = idx;
      continue;
    }

    // Per-function properties: colorN:, linewidthN:, legendN:, styleN:
    const colorNMatch = t.match(/^color(\d*):\s*(#[0-9A-Fa-f]{3,8}|\w+)\s*$/i);
    if (colorNMatch) {
      const idx = colorNMatch[1] ? +colorNMatch[1] : lastFuncIdx || 1;
      if (!funcMap[idx]) funcMap[idx] = {};
      funcMap[idx].color = colorNMatch[2];
      continue;
    }
    const lwNMatch = t.match(/^linewidth(\d*):\s*([\d.]+)\s*$/i);
    if (lwNMatch) {
      const idx = lwNMatch[1] ? +lwNMatch[1] : lastFuncIdx || 1;
      if (!funcMap[idx]) funcMap[idx] = {};
      funcMap[idx].linewidth = +lwNMatch[2];
      continue;
    }
    const legNMatch = t.match(/^legend(\d*):\s*(.+)/i);
    if (legNMatch) {
      const idx = legNMatch[1] ? +legNMatch[1] : lastFuncIdx || 1;
      if (!funcMap[idx]) funcMap[idx] = {};
      funcMap[idx].legend = legNMatch[2].trim();
      continue;
    }
    const styNMatch = t.match(/^style(\d*):\s*(\w+)\s*$/i);
    if (styNMatch) {
      const idx = styNMatch[1] ? +styNMatch[1] : lastFuncIdx || 1;
      if (!funcMap[idx]) funcMap[idx] = {};
      funcMap[idx].style = styNMatch[2].trim().toLowerCase();
      continue;
    }

    // ── y = expr | color: ... | width: ... | label: "..." (inline syntax) ──
    const fMatch = t.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);
    if (fMatch) {
      const expr = fMatch[1].trim();
      let color = "#2196f3", width = 2, label = "", style = "solid";
      if (fMatch[2]) {
        const attrs = fMatch[2];
        const cm = attrs.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);
        if (cm) color = cm[1];
        const wm = attrs.match(/width:\s*(\d+)/);
        if (wm) width = +wm[1];
        const lm = attrs.match(/label:\s*"([^"]+)"/);
        if (lm) label = lm[1];
        const sm = attrs.match(/style:\s*(\w+)/);
        if (sm) style = sm[1].toLowerCase();
      }
      funcs.push({ expr, color, width, label, style });
      continue;
    }

    // ── Colon-comma annotations: rect: x, y, w, h, color, fill ──
    const colonAnnMatch = t.match(/^(rect|point|text|eq|line|arrow|proj|hline|vline|dim):\s*(.+)/i);
    if (colonAnnMatch) {
      // Convert "cmd: a, b, c, ..." to "cmd a b c ..." for unified handling
      const cmd = colonAnnMatch[1].toLowerCase();
      const rest = colonAnnMatch[2];
      // Keep quoted strings intact, split others by comma
      const rebuilt: string[] = [cmd];
      let inQuote = false;
      let current = "";
      for (let i = 0; i < rest.length; i++) {
        const ch = rest[i];
        if (ch === '"') { inQuote = !inQuote; current += ch; }
        else if (ch === ',' && !inQuote) { rebuilt.push(current.trim()); current = ""; }
        else { current += ch; }
      }
      if (current.trim()) rebuilt.push(current.trim());
      annotations.push(rebuilt.join(" "));
      continue;
    }

    // Annotations: rect, text, eq, line, point, arrow, proj, hline, vline, dim
    annotations.push(t);
  }

  // ── Merge funcMap entries into funcs array ──
  const defaultColors = ["#0033CC", "#CC0000", "#006600", "#FF6600", "#9900CC", "#009999"];
  const idxList = Object.keys(funcMap).map(Number).sort((a, b) => a - b);
  for (const idx of idxList) {
    const fm = funcMap[idx];
    if (!fm.expr) continue;
    funcs.push({
      expr: fm.expr,
      color: fm.color || defaultColors[(idx - 1) % defaultColors.length],
      width: fm.linewidth ?? 2,
      label: fm.legend || "",
      style: fm.style || "solid",
    });
  }

  // Coordinate transforms
  const W = plotW, H = plotH;
  const sx = (x: number) => PAD + (x - xMin) / (xMax - xMin) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y - yMin) / (yMax - yMin) * (H - 2 * PAD);

  const totalW = colorbarLabel ? W + 50 : W;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" style="max-width:${totalW}px;background:#fff;border:1px solid #ddd;">`;

  // Smart tick interval: aim for ~5-10 grid lines per axis
  function niceStep(range: number): number {
    const rough = range / 8;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let nice: number;
    if (norm < 1.5) nice = 1;
    else if (norm < 3) nice = 2;
    else if (norm < 7) nice = 5;
    else nice = 10;
    return nice * mag;
  }
  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);

  // Grid (conditional)
  if (showGrid) {
    svg += `<g stroke="#e0e0e0" stroke-width="0.5">`;
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      svg += `<line x1="${sx(x)}" y1="${PAD}" x2="${sx(x)}" y2="${H - PAD}"/>`;
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      svg += `<line x1="${PAD}" y1="${sy(y)}" x2="${W - PAD}" y2="${sy(y)}"/>`;
    }
    svg += `</g>`;
  }

  // ── Heatmap rendering (before axes, so axes draw on top) ──
  if (heatmapVar && outerEnv) {
    const hmVal = outerEnv.getVar(heatmapVar);
    if (hmVal !== undefined && Array.isArray(hmVal)) {
      let matrix: number[][] | null = null;
      if (Array.isArray(hmVal[0])) {
        matrix = hmVal as number[][];
      } else {
        // 1D array → single row
        matrix = [hmVal as number[]];
      }
      if (matrix) {
        const nRows = matrix.length, nCols = matrix[0].length;
        // Find min/max
        let vmin = Infinity, vmax = -Infinity;
        for (const r of matrix) for (const v of r) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
        const cellW = (xMax - xMin) / nCols;
        const cellH = (yMax - yMin) / nRows;
        const fmt = (v: number) => { const s = v.toFixed(2); return s.replace(/\.?0+$/, "") || "0"; };
        for (let r = 0; r < nRows; r++) {
          for (let c = 0; c < nCols; c++) {
            const v = matrix[r][c];
            const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
            const color = heatColor(t);
            const x1 = xMin + c * cellW;
            const y1 = yMax - r * cellH;  // row 0 = top
            const px = sx(x1), py = sy(y1);
            const pw = sx(x1 + cellW) - sx(x1);
            const ph = sy(y1 - cellH) - sy(y1);
            svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" stroke="${showMesh ? '#333' : color}" stroke-width="${showMesh ? 1 : 0.5}"/>`;
            // Value label at center
            const tx = sx(x1 + cellW / 2), ty = sy(y1 - cellH / 2);
            const textColor = t > 0.3 && t < 0.7 ? "#000" : "#fff";
            svg += `<text x="${tx}" y="${ty + 1}" fill="${textColor}" font-size="10" text-anchor="middle" dominant-baseline="central" font-weight="bold">${fmt(v)}</text>`;
          }
        }
      }
    }
  }

  // ── Colorbar ──
  if (colorbarLabel && heatmapVar) {
    const cbX = W - PAD + 10, cbY = PAD, cbW = 15, cbH = H - 2 * PAD;
    const hmVal = outerEnv?.getVar(heatmapVar);
    let vmin = 0, vmax = 1;
    if (hmVal && Array.isArray(hmVal)) {
      const flat = Array.isArray(hmVal[0]) ? (hmVal as number[][]).flat() : (hmVal as number[]);
      vmin = Math.min(...flat); vmax = Math.max(...flat);
    }
    // Gradient rectangles
    const nSteps = 20;
    for (let s = 0; s < nSteps; s++) {
      const t = 1 - s / nSteps;
      const ry = cbY + (s / nSteps) * cbH;
      const rh = cbH / nSteps + 0.5;
      svg += `<rect x="${cbX}" y="${ry}" width="${cbW}" height="${rh}" fill="${heatColor(t)}" stroke="none"/>`;
    }
    svg += `<rect x="${cbX}" y="${cbY}" width="${cbW}" height="${cbH}" fill="none" stroke="#333" stroke-width="0.5"/>`;
    // Min/max labels
    const fmt2 = (v: number) => { const s = v.toFixed(2); return s.replace(/\.?0+$/, "") || "0"; };
    svg += `<text x="${cbX + cbW + 3}" y="${cbY + 4}" fill="#333" font-size="9">${fmt2(vmax)}</text>`;
    svg += `<text x="${cbX + cbW + 3}" y="${cbY + cbH}" fill="#333" font-size="9">${fmt2(vmin)}</text>`;
    svg += `<text x="${cbX + cbW / 2}" y="${cbY - 6}" fill="#333" font-size="9" text-anchor="middle">${colorbarLabel}</text>`;
  }

  // Axes
  if (yMin <= 0 && yMax >= 0) svg += `<line x1="${PAD}" y1="${sy(0)}" x2="${W - PAD}" y2="${sy(0)}" stroke="#666" stroke-width="1"/>`;
  if (xMin <= 0 && xMax >= 0) svg += `<line x1="${sx(0)}" y1="${PAD}" x2="${sx(0)}" y2="${H - PAD}" stroke="#666" stroke-width="1"/>`;

  // Axis labels (using smart tick steps)
  const fmtTick = (v: number) => { const s = +v.toPrecision(10); return String(s); };
  svg += `<g font-size="10" fill="#888" text-anchor="middle">`;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    if (Math.abs(x) < xStep * 0.01) continue;
    svg += `<text x="${sx(x)}" y="${H - PAD + 15}">${fmtTick(x)}</text>`;
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    if (Math.abs(y) < yStep * 0.01) continue;
    svg += `<text x="${PAD - 10}" y="${sy(y) + 4}" text-anchor="end">${fmtTick(y)}</text>`;
  }
  svg += `</g>`;

  // Plot functions
  let legendY = PAD + 15;
  for (const f of funcs) {
    const env = new HekatanEnvironment();
    if (outerEnv) { for (const [k, v] of outerEnv.variables) env.setVar(k, v); for (const [k, v] of outerEnv.userFunctions) env.userFunctions.set(k, v); }
    const N = 300;
    const points: string[] = [];
    for (let k = 0; k <= N; k++) {
      const x = xMin + (xMax - xMin) * k / N;
      env.setVar("x", x);
      try {
        const ast = parseExpression(f.expr);
        const y = evaluate(ast, env) as number;
        if (isFinite(y) && y >= yMin - 10 && y <= yMax + 10) {
          points.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
        }
      } catch { /* skip */ }
    }
    if (points.length > 1) {
      const dashAttr = f.style === "dashed" ? ` stroke-dasharray="8,4"` : f.style === "dot" || f.style === "dotted" ? ` stroke-dasharray="3,3"` : "";
      svg += `<polyline points="${points.join(" ")}" fill="none" stroke="${f.color}" stroke-width="${f.width}"${dashAttr}/>`;
    }
    if (f.label) {
      const dashAttr = f.style === "dashed" ? ` stroke-dasharray="8,4"` : f.style === "dot" || f.style === "dotted" ? ` stroke-dasharray="3,3"` : "";
      svg += `<line x1="${W - PAD - 75}" y1="${legendY - 4}" x2="${W - PAD - 55}" y2="${legendY - 4}" stroke="${f.color}" stroke-width="${f.width}"${dashAttr}/>`;
      svg += `<text x="${W - PAD - 50}" y="${legendY}" fill="${f.color}" font-size="11" text-anchor="start">${f.label}</text>`;
      legendY += 18;
    }
  }

  // Annotations
  for (const ann of annotations) {
    const parts = ann.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "rect" && parts.length >= 5) {
      // Support both:  rect x y w h color fill  (width/height from origin y)
      //           and:  rect x1 y1 x2 y2 color  (corner to corner)
      const hasFill = parts[parts.length - 1] === "fill";
      const color = hasFill ? (parts[5] || "#e3f2fd") : (parts[5] || "#e3f2fd");
      if (hasFill) {
        // rect: x, y_bottom, width, height, color, fill  (Riemann rectangles)
        const rx = +parts[1], ry = +parts[2], rw = +parts[3], rh = +parts[4];
        const px = sx(rx), py = sy(ry + rh);
        const pw = sx(rx + rw) - sx(rx);
        const ph = sy(ry) - sy(ry + rh);
        svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" opacity="0.3"/>`;
      } else {
        // rect x1 y1 x2 y2 color  (corner to corner)
        const [, x1, y1, x2, y2] = parts.map(Number);
        const px = Math.min(sx(x1), sx(x2)), py = Math.min(sy(y1), sy(y2));
        const pw = Math.abs(sx(x2) - sx(x1)), ph = Math.abs(sy(y2) - sy(y1));
        svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" opacity="0.3"/>`;
      }
    }
    else if (cmd === "point" && parts.length >= 3) {
      const x = +parts[1], y = +parts[2];
      const color = parts[3] || "#f44336";
      const size = +(parts[4] || "4");
      svg += `<circle cx="${sx(x)}" cy="${sy(y)}" r="${size}" fill="${color}"/>`;
    }
    else if (cmd === "text" && parts.length >= 4) {
      const x = +parts[1], y = +parts[2];
      const textMatch = ann.match(/"([^"]+)"/);
      const txt = textMatch ? textMatch[1] : parts.slice(3).join(" ");
      // Find color (#hex) and font-size (number) after the quoted text
      const afterQuote = ann.slice(ann.lastIndexOf('"') + 1).trim();
      const afterParts = afterQuote.split(/\s+/).filter(Boolean);
      const color = afterParts.find(p => p.startsWith("#")) || "#333";
      const fontSize = afterParts.find(p => /^\d+$/.test(p)) || "12";
      svg += `<text x="${sx(x)}" y="${sy(y)}" fill="${color}" font-size="${fontSize}">${txt}</text>`;
    }
    else if (cmd === "eq" && parts.length >= 4) {
      const x = +parts[1], y = +parts[2];
      const textMatch = ann.match(/"([^"]+)"/);
      const txt = textMatch ? textMatch[1] : parts.slice(3).join(" ");
      const afterQuote = ann.slice(ann.lastIndexOf('"') + 1).trim();
      const afterParts = afterQuote.split(/\s+/).filter(Boolean);
      const color = afterParts.find(p => p.startsWith("#")) || "#333";
      const fontSize = afterParts.find(p => /^\d+$/.test(p)) || "13";
      svg += `<text x="${sx(x)}" y="${sy(y)}" fill="${color}" font-size="${fontSize}" font-style="italic">${txt}</text>`;
    }
    else if (cmd === "line" && parts.length >= 5) {
      const [, x1, y1, x2, y2] = parts.map(Number);
      const color = parts[5] || "#333";
      const w = parts[6] || "1";
      svg += `<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" stroke="${color}" stroke-width="${w}"/>`;
    }
    else if (cmd === "arrow" && parts.length >= 5) {
      const [, x1, y1, x2, y2] = parts.map(Number);
      const color = parts[5] || "#333";
      const id = `arr${Math.random().toString(36).slice(2, 6)}`;
      svg += `<defs><marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker></defs>`;
      svg += `<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" stroke="${color}" stroke-width="1.5" marker-end="url(#${id})"/>`;
    }
    else if (cmd === "proj" && parts.length >= 3) {
      const x = +parts[1], y = +parts[2];
      const color = parts[3] || "#999";
      svg += `<line x1="${sx(x)}" y1="${sy(y)}" x2="${sx(x)}" y2="${sy(0)}" stroke="${color}" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      svg += `<line x1="${sx(x)}" y1="${sy(y)}" x2="${sx(0)}" y2="${sy(y)}" stroke="${color}" stroke-width="0.8" stroke-dasharray="4,3"/>`;
    }
    else if (cmd === "hline" && parts.length >= 2) {
      const y = +parts[1]; const color = parts[2] || "#999";
      svg += `<line x1="${PAD}" y1="${sy(y)}" x2="${W - PAD}" y2="${sy(y)}" stroke="${color}" stroke-width="0.8" stroke-dasharray="5,3"/>`;
    }
    else if (cmd === "vline" && parts.length >= 2) {
      const x = +parts[1]; const color = parts[2] || "#999";
      svg += `<line x1="${sx(x)}" y1="${PAD}" x2="${sx(x)}" y2="${H - PAD}" stroke="${color}" stroke-width="0.8" stroke-dasharray="5,3"/>`;
    }
    else if (cmd === "dim" && parts.length >= 5) {
      const [, x1, y1, x2, y2] = parts.map(Number);
      const textMatch = ann.match(/"([^"]+)"/);
      const txt = textMatch ? textMatch[1] : "";
      const mx = (sx(x1) + sx(x2)) / 2, my = (sy(y1) + sy(y2)) / 2;
      svg += `<line x1="${sx(x1)}" y1="${sy(y1)}" x2="${sx(x2)}" y2="${sy(y2)}" stroke="#666" stroke-width="1"/>`;
      svg += `<text x="${mx}" y="${my - 5}" fill="#666" font-size="11" text-anchor="middle">${txt}</text>`;
    }
  }

  // Title and axis labels
  if (title) svg += `<text x="${W / 2}" y="${PAD - 15}" fill="#333" font-size="14" font-weight="bold" text-anchor="middle">${title}</text>`;
  if (xlabel) svg += `<text x="${W / 2}" y="${H - 5}" fill="#555" font-size="11" text-anchor="middle">${xlabel}</text>`;
  if (ylabel) svg += `<text x="12" y="${H / 2}" fill="#555" font-size="11" text-anchor="middle" transform="rotate(-90, 12, ${H / 2})">${ylabel}</text>`;

  svg += "</svg>";
  return `<div class="plot-container">${svg}</div>`;
}

// ─── @{plotly} block ─────────────────────────────────────
function handlePlotlyBlock(lines: string[]): string {
  const id = `plotly_${Math.random().toString(36).slice(2, 8)}`;
  const code = lines.join("\n");
  return `<div id="${id}" style="width:100%;height:400px;"></div>
<script>if(window.Plotly){(function(){${code};Plotly.newPlot("${id}",data,layout||{})})()}else{document.getElementById("${id}").textContent="Plotly not loaded"}</script>`;
}

// ─── @{svg} block ────────────────────────────────────────
export function handleSvgBlock(lines: string[]): string {
  return `<div class="svg-container">${lines.join("\n")}</div>`;
}

// ─── @{three} block — DSL-to-Three.js converter ─────────
const THREE_DSL_CMDS = new Set([
  "box","sphere","cylinder","cone","torus","plane","line","arrow","darrow",
  "plate","slab","tube","pipe","node","carc3d","dim3d","axes","axeslabeled",
  "axes_labeled","gridhelper","color","opacity","wireframe","metalness",
  "roughness","reset","camera","background","light",
  "beam","deck","pier","cable","hanger","water","text","fit"
]);

function parseThreeOpts(tokens: string[]): { pos: number[], kv: Record<string,string>, text: string|null } {
  const pos: number[] = [], kv: Record<string,string> = {};
  let text: string|null = null;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.includes(":")) { const ci = t.indexOf(":"); kv[t.slice(0,ci).toLowerCase()] = t.slice(ci+1); }
    else if (t.includes(",")) {
      // Expand comma-separated coordinates: "x,y,z" → [x, y, z]
      const parts = t.split(",");
      let allNum = true;
      for (const p of parts) { if (isNaN(parseFloat(p))) { allNum = false; break; } }
      if (allNum) { for (const p of parts) pos.push(parseFloat(p)); }
      else if (text === null) text = t;
    }
    else { const n = parseFloat(t); if (!isNaN(n)) pos.push(n); else if (text === null) text = t; }
  }
  return { pos, kv, text };
}

function splitThreeLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === " " || line[i] === "\t") { i++; continue; }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i]; let j = i+1;
      while (j < line.length && line[j] !== q) j++;
      tokens.push(line.slice(i+1, j)); i = j+1;
    } else {
      let j = i;
      while (j < line.length && line[j] !== " " && line[j] !== "\t") j++;
      tokens.push(line.slice(i, j)); i = j;
    }
  }
  return tokens;
}

function threeColorHex(c: string): string {
  if (!c) return "0x4488ff";
  if (c.startsWith("#")) return "0x" + c.slice(1);
  const named: Record<string,string> = {
    red:"0xff0000",green:"0x00ff00",blue:"0x0000ff",white:"0xffffff",black:"0x000000",
    yellow:"0xffff00",cyan:"0x00ffff",magenta:"0xff00ff",orange:"0xff8800",gray:"0x888888",
    grey:"0x888888",brown:"0x8b4513",pink:"0xff69b4",purple:"0x800080"
  };
  return named[c.toLowerCase()] || "0x4488ff";
}

export function processThreeDSL(lines: string[]): string {
  const js: string[] = [];
  // Persistent state
  let curColor = "#4488ff", curOpacity = "1", curWireframe = "false";
  let curMetalness = "0.1", curRoughness = "0.5";
  let meshIdx = 0;

  const optC = (kv: Record<string,string>) => threeColorHex(kv["color"] || curColor);
  const optO = (kv: Record<string,string>) => kv["opacity"] || curOpacity;
  const optW = (kv: Record<string,string>) => kv["wireframe"] || curWireframe;
  const optM = (kv: Record<string,string>) => kv["metalness"] || curMetalness;
  const optR = (kv: Record<string,string>) => kv["roughness"] || curRoughness;
  const makeMat = (kv: Record<string,string>, def?: string) => {
    const c = def || optC(kv), o = optO(kv), w = optW(kv);
    const trans = parseFloat(o) < 1 ? ",transparent:true" : "";
    return `new THREE.MeshStandardMaterial({color:${c},opacity:${o},wireframe:${w},metalness:${optM(kv)},roughness:${optR(kv)}${trans}})`;
  };
  const addMesh = (geo: string, kv: Record<string,string>, pos: number[], rotKv?: string) => {
    const m = `_m${meshIdx++}`;
    js.push(`{const ${m}=new THREE.Mesh(${geo},${makeMat(kv)});`);
    if (pos.length >= 3) js.push(`${m}.position.set(${pos[0]},${pos[1]},${pos[2]});`);
    if (rotKv) {
      const [rx,ry,rz] = rotKv.split(",").map(Number);
      js.push(`${m}.rotation.set(${(rx||0)*Math.PI/180},${(ry||0)*Math.PI/180},${(rz||0)*Math.PI/180});`);
    }
    js.push(`scene.add(${m});}`);
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    const tokens = splitThreeLine(trimmed);
    if (tokens.length === 0) continue;
    const cmd = tokens[0].toLowerCase();

    // If not a known DSL command, pass as raw JS
    if (!THREE_DSL_CMDS.has(cmd)) { js.push(trimmed); continue; }

    const { pos, kv, text } = parseThreeOpts(tokens);
    const P = (i: number) => i < pos.length ? pos[i] : 0;

    switch (cmd) {
      // ── State ──
      case "color": curColor = tokens[1] || "#4488ff"; break;
      case "opacity": curOpacity = tokens[1] || "1"; break;
      case "wireframe": curWireframe = tokens[1] || "true"; break;
      case "metalness": curMetalness = tokens[1] || "0.1"; break;
      case "roughness": curRoughness = tokens[1] || "0.5"; break;
      case "reset":
        curColor = "#4488ff"; curOpacity = "1"; curWireframe = "false";
        curMetalness = "0.1"; curRoughness = "0.5";
        break;

      // ── Meta ──
      case "camera": {
        if (pos.length >= 3) js.push(`camera.position.set(${P(0)},${P(1)},${P(2)});`);
        if (kv["lookat"]) { const [lx,ly,lz] = kv["lookat"].split(",").map(Number); js.push(`camera.lookAt(${lx||0},${ly||0},${lz||0});`); }
        if (kv["fov"]) js.push(`camera.fov=${kv["fov"]};camera.updateProjectionMatrix();`);
        break;
      }
      case "background":
        js.push(`scene.background=new THREE.Color(${threeColorHex(tokens[1] || "#f5f5f5")});`);
        break;
      case "light": {
        const lc = threeColorHex(kv["color"] || "#ffffff");
        const li = kv["intensity"] || "0.8";
        if (pos.length >= 3) js.push(`{const _l=new THREE.DirectionalLight(${lc},${li});_l.position.set(${P(0)},${P(1)},${P(2)});scene.add(_l);}`);
        else js.push(`{const _l=new THREE.DirectionalLight(${lc},${li});_l.position.set(5,10,7);scene.add(_l);}`);
        break;
      }
      case "gridhelper": {
        const sz = kv["size"] || "10", div = kv["divisions"] || "10";
        js.push(`scene.add(new THREE.GridHelper(${sz},${div}));`);
        break;
      }

      // ── Shapes ──
      case "box": {
        const s = kv["size"] ? kv["size"].split(",").map(Number) : [1,1,1];
        addMesh(`new THREE.BoxGeometry(${s[0]||1},${s[1]||1},${s[2]||1})`, kv, [P(0),P(1),P(2)], kv["rotation"]);
        break;
      }
      case "sphere": {
        const r = kv["r"] || kv["radius"] || "0.5";
        const seg = kv["segments"] || "32";
        addMesh(`new THREE.SphereGeometry(${r},${seg},${seg})`, kv, [P(0),P(1),P(2)]);
        break;
      }
      case "cylinder": {
        const rt = kv["rtop"] || kv["r"] || "0.5", rb = kv["rbottom"] || kv["r"] || "0.5";
        const h = kv["h"] || kv["height"] || "1", seg = kv["segments"] || "32";
        addMesh(`new THREE.CylinderGeometry(${rt},${rb},${h},${seg})`, kv, [P(0),P(1),P(2)], kv["rotation"]);
        break;
      }
      case "cone": {
        const r = kv["r"] || kv["radius"] || "0.5", h = kv["h"] || kv["height"] || "1";
        addMesh(`new THREE.ConeGeometry(${r},${h},32)`, kv, [P(0),P(1),P(2)], kv["rotation"]);
        break;
      }
      case "torus": {
        const r = kv["r"] || "1", rt = kv["tube"] || "0.3";
        addMesh(`new THREE.TorusGeometry(${r},${rt},16,48)`, kv, [P(0),P(1),P(2)], kv["rotation"]);
        break;
      }
      case "plane": {
        const w = kv["width"] || kv["w"] || "5", h = kv["height"] || kv["h"] || "5";
        addMesh(`new THREE.PlaneGeometry(${w},${h})`, kv, [P(0),P(1),P(2)], kv["rotation"] || "-90,0,0");
        break;
      }
      case "plate":
      case "slab": {
        const pw = kv["w"] || kv["width"] || "2", pd = kv["d"] || kv["depth"] || "2", pt = kv["t"] || kv["thickness"] || "0.2";
        addMesh(`new THREE.BoxGeometry(${pw},${pt},${pd})`, kv, [P(0),P(1),P(2)], kv["rotation"]);
        break;
      }

      // ── Lines & Arrows ──
      case "line": {
        const c = optC(kv), lw = kv["width"] || "2";
        js.push(`{const _pts=[new THREE.Vector3(${P(0)},${P(1)},${P(2)}),new THREE.Vector3(${P(3)},${P(4)},${P(5)})];`);
        js.push(`const _g=new THREE.BufferGeometry().setFromPoints(_pts);`);
        js.push(`const _l=new THREE.Line(_g,new THREE.LineBasicMaterial({color:${c},linewidth:${lw}}));scene.add(_l);}`);
        break;
      }
      case "arrow": {
        const c = optC(kv), len = kv["length"];
        const dx = P(3)-P(0), dy = P(4)-P(1), dz = P(5)-P(2);
        const l = len || `Math.sqrt(${dx*dx+dy*dy+dz*dz})`;
        js.push(`{const _dir=new THREE.Vector3(${dx},${dy},${dz}).normalize();`);
        js.push(`const _a=new THREE.ArrowHelper(_dir,new THREE.Vector3(${P(0)},${P(1)},${P(2)}),${l},${c});scene.add(_a);}`);
        break;
      }
      case "darrow": {
        const c = optC(kv);
        const dx = P(3)-P(0), dy = P(4)-P(1), dz = P(5)-P(2);
        const l = `Math.sqrt(${dx}*${dx}+${dy}*${dy}+${dz}*${dz})`;
        js.push(`{const _d=new THREE.Vector3(${dx},${dy},${dz}).normalize();`);
        js.push(`const _a1=new THREE.ArrowHelper(_d,new THREE.Vector3(${P(0)},${P(1)},${P(2)}),${l},${c},${l}*0.12,${l}*0.06);scene.add(_a1);`);
        js.push(`const _a2=new THREE.ArrowHelper(_d.clone().negate(),new THREE.Vector3(${P(3)},${P(4)},${P(5)}),${l},${c},${l}*0.12,${l}*0.06);scene.add(_a2);}`);
        break;
      }

      // ── Engineering: tube/pipe ──
      case "tube":
      case "pipe": {
        const r = kv["r"] || kv["radius"] || "0.05", seg = kv["segments"] || "8";
        js.push(`{const _p=new THREE.LineCurve3(new THREE.Vector3(${P(0)},${P(1)},${P(2)}),new THREE.Vector3(${P(3)},${P(4)},${P(5)}));`);
        js.push(`const _g=new THREE.TubeGeometry(_p,1,${r},${seg},false);`);
        js.push(`const _m=new THREE.Mesh(_g,${makeMat(kv)});scene.add(_m);}`);
        break;
      }

      // ── Engineering: node (sphere + sprite label) ──
      case "node": {
        const r = kv["r"] || "0.1", label = text || kv["label"] || "";
        js.push(`{const _g=new THREE.SphereGeometry(${r},16,16);`);
        js.push(`const _m=new THREE.Mesh(_g,${makeMat(kv, threeColorHex(kv["color"] || "white"))});`);
        js.push(`_m.position.set(${P(0)},${P(1)},${P(2)});scene.add(_m);`);
        if (label) {
          const sz = kv["size"] || "48";
          js.push(`const _c=document.createElement("canvas");_c.width=128;_c.height=64;`);
          js.push(`const _cx=_c.getContext("2d");_cx.fillStyle="white";_cx.fillRect(0,0,128,64);`);
          js.push(`_cx.strokeStyle="black";_cx.strokeRect(0,0,128,64);`);
          js.push(`_cx.font="bold ${sz}px sans-serif";_cx.fillStyle="black";_cx.textAlign="center";_cx.textBaseline="middle";`);
          js.push(`_cx.fillText("${label}",64,32);`);
          js.push(`const _t=new THREE.CanvasTexture(_c);const _sm=new THREE.SpriteMaterial({map:_t});`);
          js.push(`const _s=new THREE.Sprite(_sm);_s.position.set(${P(0)},${P(1)}+${parseFloat(r)*2},${P(2)});_s.scale.set(0.5,0.25,1);scene.add(_s);`);
        }
        js.push(`}`);
        break;
      }

      // ── Engineering: axes / axes_labeled ──
      case "axes":
      case "axeslabeled":
      case "axes_labeled": {
        const len = kv["length"] || kv["l"] || "3";
        js.push(`{const _ax=new THREE.AxesHelper(${len});`);
        if (pos.length >= 3) js.push(`_ax.position.set(${P(0)},${P(1)},${P(2)});`);
        js.push(`scene.add(_ax);`);
        if (cmd !== "axes") {
          // Labels as sprites
          const mkLabel = (t: string, px: string, py: string, pz: string, col: string) => {
            js.push(`{const _c=document.createElement("canvas");_c.width=64;_c.height=64;`);
            js.push(`const _x=_c.getContext("2d");_x.font="bold 48px sans-serif";_x.fillStyle="${col}";_x.textAlign="center";_x.textBaseline="middle";_x.fillText("${t}",32,32);`);
            js.push(`const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));`);
            js.push(`_s.position.set(${px},${py},${pz});_s.scale.set(0.4,0.4,1);scene.add(_s);}`);
          };
          mkLabel(kv["xlabel"] || "X", `${len}*1.1`, "0", "0", "red");
          mkLabel(kv["ylabel"] || "Y", "0", `${len}*1.1`, "0", "green");
          mkLabel(kv["zlabel"] || "Z", "0", "0", `${len}*1.1`, "blue");
        }
        js.push(`}`);
        break;
      }

      // ── Engineering: carc3d (arc with arrowhead) ──
      case "carc3d": {
        const r = kv["r"] || "1";
        const startDeg = parseFloat(kv["start"] || "0"), endDeg = parseFloat(kv["end"] || "270");
        const c = optC(kv);
        const startRad = startDeg * Math.PI / 180, endRad = endDeg * Math.PI / 180;
        const segs = kv["segments"] || "64";
        js.push(`{const _pts=[];`);
        js.push(`for(let i=0;i<=${segs};i++){const a=${startRad}+(${endRad}-${startRad})*i/${segs};_pts.push(new THREE.Vector3(${r}*Math.cos(a)+${P(0)},${P(1)},${r}*Math.sin(a)+${P(2)}));}`);
        js.push(`const _g=new THREE.BufferGeometry().setFromPoints(_pts);`);
        js.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${c}})));`);
        // Arrowhead cone at end
        const coneH = kv["headlength"] || "0.15", coneR = kv["headradius"] || "0.06";
        js.push(`const _ea=${endRad};const _ex=${r}*Math.cos(_ea)+${P(0)},_ez=${r}*Math.sin(_ea)+${P(2)};`);
        js.push(`const _cg=new THREE.ConeGeometry(${coneR},${coneH},12);`);
        js.push(`const _cm=new THREE.Mesh(_cg,new THREE.MeshStandardMaterial({color:${c}}));`);
        js.push(`_cm.position.set(_ex,${P(1)},_ez);`);
        js.push(`_cm.rotation.z=Math.PI/2;_cm.rotation.y=-_ea-Math.PI/2;scene.add(_cm);}`);
        break;
      }

      // ── Engineering: dim3d (3D dimension line with text sprite) ──
      case "dim3d": {
        const c = optC(kv);
        const txt = text || kv["text"] || "";
        js.push(`{const _p1=new THREE.Vector3(${P(0)},${P(1)},${P(2)}),_p2=new THREE.Vector3(${P(3)},${P(4)},${P(5)});`);
        // Line
        js.push(`const _g=new THREE.BufferGeometry().setFromPoints([_p1,_p2]);`);
        js.push(`scene.add(new THREE.Line(_g,new THREE.LineBasicMaterial({color:${c}})));`);
        // Arrows at ends
        js.push(`const _d=_p2.clone().sub(_p1);const _l=_d.length();const _dn=_d.normalize();`);
        js.push(`scene.add(new THREE.ArrowHelper(_dn,_p1,_l,${c},_l*0.08,_l*0.04));`);
        if (txt) {
          js.push(`const _mid=_p1.clone().add(_p2).multiplyScalar(0.5);`);
          js.push(`const _c=document.createElement("canvas");_c.width=256;_c.height=64;`);
          js.push(`const _x=_c.getContext("2d");_x.fillStyle="white";_x.fillRect(0,0,256,64);`);
          js.push(`_x.font="bold 32px sans-serif";_x.fillStyle="black";_x.textAlign="center";_x.textBaseline="middle";`);
          js.push(`_x.fillText("${txt}",128,32);`);
          js.push(`const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));`);
          js.push(`_s.position.copy(_mid);_s.position.y+=0.2;_s.scale.set(1,0.25,1);scene.add(_s);`);
        }
        js.push(`}`);
        break;
      }

      // ── Engineering commands use Z-up convention (swap Y↔Z for Three.js Y-up) ──
      // User writes (x, y, z) where Z=up → Three.js Vector3(x, z, y)

      // ── Engineering: beam (cylinder between two 3D points) ──
      case "beam": {
        const r = kv["r"] || kv["radius"] || "0.3";
        const c = makeMat(kv);
        js.push(`{const _p1=new THREE.Vector3(${P(0)},${P(2)},${P(1)}),_p2=new THREE.Vector3(${P(3)},${P(5)},${P(4)});`);
        js.push(`const _d=_p2.clone().sub(_p1),_l=_d.length(),_mid=_p1.clone().add(_p2).multiplyScalar(0.5);`);
        js.push(`const _g=new THREE.CylinderGeometry(${r},${r},_l,12);`);
        js.push(`const _m=new THREE.Mesh(_g,${c});_m.position.copy(_mid);`);
        js.push(`_m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),_d.normalize());`);
        js.push(`_m.castShadow=true;_m.receiveShadow=true;scene.add(_m);}`);
        break;
      }

      // ── Engineering: deck (flat slab between two points) ──
      case "deck": {
        const w = kv["w"] || kv["width"] || "10";
        const t = kv["t"] || kv["thickness"] || "1";
        const c = makeMat(kv);
        js.push(`{const _p1=new THREE.Vector3(${P(0)},${P(2)},${P(1)}),_p2=new THREE.Vector3(${P(3)},${P(5)},${P(4)});`);
        js.push(`const _d=_p2.clone().sub(_p1),_l=_d.length(),_mid=_p1.clone().add(_p2).multiplyScalar(0.5);`);
        js.push(`const _g=new THREE.BoxGeometry(_l,${t},${w});`);
        js.push(`const _m=new THREE.Mesh(_g,${c});_m.position.copy(_mid);`);
        js.push(`_m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),_d.normalize());`);
        js.push(`_m.castShadow=true;_m.receiveShadow=true;scene.add(_m);}`);
        break;
      }

      // ── Engineering: pier (tapered concrete pier) ──
      case "pier": {
        const h = kv["h"] || kv["height"] || "10";
        const wb = kv["wbot"] || kv["w"] || "4";
        const wt = kv["wtop"] || kv["w"] || "3";
        const d = kv["d"] || kv["depth"] || "4";
        const c = makeMat(kv, threeColorHex(kv["color"] || "#8B7355"));
        // Pier extrudes along Y (Three.js up) — Shape in XY plane, extrude in Z (depth)
        js.push(`{const _hw1=${wb}/2,_hw2=${wt}/2,_h=${h};`);
        js.push(`const _shape=new THREE.Shape();_shape.moveTo(-_hw1,0);_shape.lineTo(_hw1,0);_shape.lineTo(_hw2,_h);_shape.lineTo(-_hw2,_h);_shape.closePath();`);
        js.push(`const _g=new THREE.ExtrudeGeometry(_shape,{depth:${d},bevelEnabled:false});`);
        js.push(`const _m=new THREE.Mesh(_g,${c});`);
        // Z-up swap: user (x,y,z) → Three.js position(x, z, y); pier base at user's z, extrude up
        js.push(`_m.position.set(${P(0)}-${wb}/2,${P(2)},${P(1)}-${d}/2);`);
        js.push(`_m.rotation.x=-Math.PI/2;`);
        js.push(`_m.castShadow=true;_m.receiveShadow=true;scene.add(_m);}`);
        break;
      }

      // ── Engineering: cable (smooth tube through multiple points) ──
      case "cable": {
        const r = kv["r"] || kv["radius"] || "0.15";
        const c = makeMat(kv, threeColorHex(kv["color"] || "#cccccc"));
        // Collect all coordinate triplets from positional args (Z-up → Y-up swap)
        const nPts = Math.floor(pos.length / 3);
        if (nPts >= 2) {
          js.push(`{const _pts=[`);
          for (let pi = 0; pi < nPts; pi++) {
            js.push(`new THREE.Vector3(${pos[pi*3]},${pos[pi*3+2]},${pos[pi*3+1]}),`);
          }
          js.push(`];`);
          js.push(`const _curve=new THREE.CatmullRomCurve3(_pts);`);
          js.push(`const _g=new THREE.TubeGeometry(_curve,_pts.length*8,${r},8,false);`);
          js.push(`const _m=new THREE.Mesh(_g,${c});_m.castShadow=true;scene.add(_m);}`);
        }
        break;
      }

      // ── Engineering: hanger (vertical cable/bar) ──
      case "hanger": {
        const r = kv["r"] || kv["radius"] || "0.1";
        const c = makeMat(kv, threeColorHex(kv["color"] || "#aaaaaa"));
        // hanger x y ztop zbot → Z-up swap: Three.js Vector3(x, ztop, y) to Vector3(x, zbot, y)
        js.push(`{const _p1=new THREE.Vector3(${P(0)},${P(3)},${P(1)}),_p2=new THREE.Vector3(${P(0)},${P(2)},${P(1)});`);
        js.push(`const _d=_p2.clone().sub(_p1),_l=_d.length(),_mid=_p1.clone().add(_p2).multiplyScalar(0.5);`);
        js.push(`const _g=new THREE.CylinderGeometry(${r},${r},_l,8);`);
        js.push(`const _m=new THREE.Mesh(_g,${c});_m.position.copy(_mid);`);
        js.push(`_m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),_d.normalize());`);
        js.push(`scene.add(_m);}`);
        break;
      }

      // ── Engineering: water (semitransparent horizontal plane) ──
      case "water": {
        const w = kv["w"] || kv["width"] || "200";
        const l = kv["l"] || kv["length"] || "200";
        const c = threeColorHex(kv["color"] || "#1a5276");
        // water z → Z-up: Three.js Y = user's Z
        js.push(`{const _g=new THREE.PlaneGeometry(${l},${w});`);
        js.push(`const _m=new THREE.Mesh(_g,new THREE.MeshStandardMaterial({color:${c},metalness:0.3,roughness:0.6,transparent:true,opacity:0.7,side:THREE.DoubleSide}));`);
        js.push(`_m.rotation.x=-Math.PI/2;_m.position.set(0,${P(0)},0);scene.add(_m);}`);
        break;
      }

      // ── Engineering: text (3D sprite label) ──
      case "text": {
        const txt = text || kv["text"] || kv["label"] || "";
        const col = kv["color"] || "#00ff88";
        const sc = kv["scale"] || "1";
        if (txt) {
          // Z-up swap: user (x,y,z) → Three.js (x, z, y)
          js.push(`{const _c=document.createElement("canvas");_c.width=512;_c.height=128;`);
          js.push(`const _cx=_c.getContext("2d");_cx.fillStyle="${col}";_cx.font="bold 48px Consolas,monospace";_cx.textAlign="center";_cx.fillText("${txt}",256,80);`);
          js.push(`const _s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(_c)}));`);
          js.push(`_s.position.set(${P(0)},${P(2)},${P(1)});_s.scale.set(${parseFloat(sc)*5},${parseFloat(sc)*1.2},1);scene.add(_s);}`);
        }
        break;
      }

      // ── Engineering: fit (auto-frame all objects) ──
      case "fit": {
        js.push(`{const _box=new THREE.Box3();scene.traverse(c=>{if(c.isMesh)_box.expandByObject(c);});`);
        js.push(`if(!_box.isEmpty()){const _center=_box.getCenter(new THREE.Vector3());const _size=_box.getSize(new THREE.Vector3());`);
        js.push(`const _maxDim=Math.max(_size.x,_size.y,_size.z);const _dist=_maxDim*1.8;`);
        js.push(`camera.position.set(_center.x+_dist*0.6,_center.y+_dist*0.5,_center.z+_dist*0.4);`);
        js.push(`if(typeof controls!=="undefined"){controls.target.copy(_center);controls.update();}`);
        js.push(`else{camera.lookAt(_center);}}}`);
        break;
      }

      default: js.push(trimmed); break;
    }
  }
  return js.join("\n");
}

export function handleThreeBlock(lines: string[]): string {
  const id = `three_${Math.random().toString(36).slice(2, 8)}`;
  const code = processThreeDSL(lines);
  return `<div id="${id}" style="width:100%;height:400px;border:1px solid #ddd;"></div>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';
(function(){const container=document.getElementById("${id}");
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f5f5);
const camera=new THREE.PerspectiveCamera(50,container.clientWidth/container.clientHeight,0.1,1000);
camera.position.set(5,5,5);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(container.clientWidth,container.clientHeight);
container.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
scene.add(new THREE.AmbientLight(0x404040));
const dirLight=new THREE.DirectionalLight(0xffffff,0.8);dirLight.position.set(5,10,7);scene.add(dirLight);
${code}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
})();</script>`;
}

// ─── Control flow: for / #for ────────────────────────────
function parseFor(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const header = lines[startIdx].trim();
  // Syntax 1: for i = 1 to 10 : 2  OR  #for i = 1 to 10 : 2
  let m = header.match(/^#?for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);
  // Syntax 2: for i = 1:10  OR  for i = 1:10:2  (colon syntax, MATLAB-like)
  if (!m) m = header.match(/^#?for\s+(\w+)\s*=\s*(.+?)\s*:\s*(.+?)(?:\s*:\s*(.+))?\s*$/i);
  if (!m) return { html: `<div class="error">Invalid for: ${header}</div>`, nextLine: startIdx + 1 };

  const varName = m[1];
  const startVal = evalNum(m[2], env);
  const endVal = evalNum(m[3], env);
  const step = m[4] ? evalNum(m[4], env) : 1;

  // Collect body until next/end (with unified depth tracking)
  const body: string[] = [];
  let i = startIdx + 1;
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    // Block openers
    if (/^#?for\s+/i.test(t)) depth++;
    if (/^#?if\s+/i.test(t) && !/^#?else\s+if/i.test(t)) depth++;
    if (/^#?while\s+/i.test(t)) depth++;
    if (/^#?repeat\s*$/i.test(t)) depth++;
    // Block closers
    if (/^#?(next|end)\s*$/i.test(t) || /^#?end\s+if\s*$/i.test(t) ||
        /^#?loop\s*$/i.test(t) || /^#?until\s+/i.test(t)) {
      depth--;
      if (depth === 0) { i++; break; }
    }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
    env.setVar(varName, v);
    const result = parse(body.join("\n"), env, true);  // compact=true (MATLAB style)
    html += result.html;
  }
  return { html, nextLine: i };
}

// ─── Control flow: if / #if ─────────────────────────────
function parseIf(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const branches: { cond: string | null; body: string[] }[] = [];
  let current: { cond: string | null; body: string[] } = {
    cond: lines[startIdx].trim().replace(/^#?if\s+/i, ""), body: []
  };
  let i = startIdx + 1;
  let depth = 1;

  while (i < lines.length) {
    const t = lines[i].trim();
    // Block openers (unified depth tracking)
    if (/^#?if\s+/i.test(t) && !/^#?else\s+if/i.test(t)) { depth++; current.body.push(lines[i]); i++; continue; }
    if (/^#?for\s+/i.test(t)) { depth++; current.body.push(lines[i]); i++; continue; }
    if (/^#?while\s+/i.test(t)) { depth++; current.body.push(lines[i]); i++; continue; }
    if (/^#?repeat\s*$/i.test(t)) { depth++; current.body.push(lines[i]); i++; continue; }
    // Block closers
    if (/^#?end\s+if\s*$/i.test(t) || /^#?(next|end)\s*$/i.test(t) ||
        /^#?loop\s*$/i.test(t) || /^#?until\s+/i.test(t)) {
      depth--;
      if (depth === 0) { branches.push(current); i++; break; }
      current.body.push(lines[i]); i++; continue;
    }
    if (depth === 1 && /^#?else\s+if\s+/i.test(t)) {
      branches.push(current);
      current = { cond: t.replace(/^#?else\s+if\s+/i, ""), body: [] };
      i++; continue;
    }
    if (depth === 1 && /^#?else\s*$/i.test(t)) {
      branches.push(current);
      current = { cond: null, body: [] };
      i++; continue;
    }
    current.body.push(lines[i]);
    i++;
  }

  for (const branch of branches) {
    if (branch.cond === null || evalNum(branch.cond, env)) {
      const result = parse(branch.body.join("\n"), env);
      return { html: result.html, nextLine: i };
    }
  }
  return { html: "", nextLine: i };
}

// ─── Control flow: while / #while ────────────────────────
function parseWhile(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const cond = lines[startIdx].trim().replace(/^#?while\s+/i, "");
  const body: string[] = [];
  let i = startIdx + 1;
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#?while\s+/i.test(t)) depth++;
    if (/^#?loop\s*$/i.test(t)) { depth--; if (depth === 0) { i++; break; } }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  let guard = 0;
  while (evalNum(cond, env) && guard < 10000) {
    const result = parse(body.join("\n"), env);
    html += result.html;
    guard++;
  }
  return { html, nextLine: i };
}

// ─── Control flow: repeat / #repeat ─────────────────────
function parseRepeat(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const body: string[] = [];
  let i = startIdx + 1;
  let untilCond = "";
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#?repeat\s*$/i.test(t)) depth++;
    if (/^#?until\s+/i.test(t)) {
      depth--;
      if (depth === 0) { untilCond = t.replace(/^#?until\s+/i, ""); i++; break; }
    }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  let guard = 0;
  do {
    const result = parse(body.join("\n"), env);
    html += result.html;
    guard++;
  } while (!evalNum(untilCond, env) && guard < 10000);
  return { html, nextLine: i };
}

// ─── Helpers ─────────────────────────────────────────────
function evalNum(expr: string, env: HekatanEnvironment): number {
  try {
    const ast = parseExpression(expr);
    const val = evaluate(ast, env);
    return typeof val === "number" ? val : NaN;
  } catch { return 0; }
}

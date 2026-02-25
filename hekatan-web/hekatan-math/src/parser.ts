/**
 * Hekatan Parser — Parses .hcalc text → HTML output
 *
 * Supports: variables, expressions, #for/#if/#while/#repeat,
 * @{plot}/@{eq}/@{svg}/@{three}/@{plotly} directive blocks,
 * comments, markdown, user functions
 */
import { parseExpression, evaluate, HekatanEnvironment, type ASTNode } from "./evaluator.js";
import { renderNode, renderValue, renderInlineText, renderEquationText } from "./renderer.js";

const BLOCK_OPEN_RE = /^@\{(plot|plotly|svg|three|eq)\b\s*([^}]*)\}\s*$/i;
const BLOCK_CLOSE_RE = /^@\{end\s+(plot|plotly|svg|three|eq)\}\s*$/i;

// ─── Main parse function ─────────────────────────────────
export function parse(source: string): { html: string; env: HekatanEnvironment } {
  const env = new HekatanEnvironment();
  const lines = source.split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) { html += '<div class="spacer"></div>'; i++; continue; }

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
      html += parseDirectiveBlock(blockType, blockLines, blockArgs);
      continue;
    }

    // Control flow: #for
    if (/^#for\s+/i.test(trimmed)) {
      const result = parseFor(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // #if
    if (/^#if\s+/i.test(trimmed)) {
      const result = parseIf(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // #while
    if (/^#while\s+/i.test(trimmed)) {
      const result = parseWhile(lines, i, env);
      html += result.html; i = result.nextLine; continue;
    }
    // #repeat
    if (/^#repeat\s*$/i.test(trimmed)) {
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
    html += parseLine(trimmed, env);
    i++;
  }

  return { html, env };
}

// ─── Parse single line ───────────────────────────────────
function parseLine(line: string, env: HekatanEnvironment): string {
  try {
    const ast = parseExpression(line);
    const val = evaluate(ast, env);

    if (ast.type === "assign") {
      const valHtml = renderValue(val);
      let lhs = `<var>${ast.name}</var>`;
      if (ast.indices) {
        const idxStr = ast.indices.map(n => renderNode(n)).join(",");
        lhs += `<sub>${idxStr}</sub>`;
      }
      return `<div class="line assign">${lhs} = ${renderNode(ast.expr)} = ${valHtml}</div>`;
    }

    // Expression result
    return `<div class="line expr">${renderNode(ast)} = ${renderValue(val)}</div>`;
  } catch (e: any) {
    return `<div class="line error">${renderInlineText(line)} <span class="err">← ${e.message}</span></div>`;
  }
}

// ─── Directive blocks ────────────────────────────────────
function parseDirectiveBlock(type: string, lines: string[], args?: string): string {
  switch (type) {
    case "eq": return handleEqBlock(lines, args || "");
    case "plot": return handlePlotBlock(lines);
    case "plotly": return handlePlotlyBlock(lines);
    case "svg": return handleSvgBlock(lines);
    case "three": return handleThreeBlock(lines);
    default: return `<pre>${lines.join("\n")}</pre>`;
  }
}

// ─── @{eq} block ─────────────────────────────────────────
function handleEqBlock(lines: string[], args: string): string {
  if (lines.length === 0) return "";
  const align = /^(left|right|center)$/i.test(args) ? args.toLowerCase() : "center";
  let html = `<div class="eq-block" style="text-align:${align};margin:8px 0;">`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { html += '<div style="height:4px"></div>'; continue; }

    // Equation number at end: (1), (2a), (5.11)
    const numMatch = trimmed.match(/\((\d+(?:\.\d+)?[a-z]?)\)\s*$/);
    let eqText = trimmed;
    let eqNum = "";
    if (numMatch) {
      eqText = trimmed.slice(0, numMatch.index).trim();
      eqNum = numMatch[1];
    }

    html += '<p class="eq" style="margin:4px 0;line-height:2.2;">';
    html += renderEquationText(eqText);
    if (eqNum) html += `<span style="float:right;font-style:normal;margin-left:24px">(${eqNum})</span>`;
    html += "</p>";
  }
  return html + "</div>";
}

// ─── @{plot} SVG renderer ────────────────────────────────
function handlePlotBlock(lines: string[]): string {
  const W = 600, H = 400, PAD = 50;
  let xMin = -5, xMax = 5, yMin = -2, yMax = 2;
  const funcs: { expr: string; color: string; width: number; label: string }[] = [];
  const annotations: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("'")) continue;

    // Range: x = -5 : 5
    const xRange = t.match(/^x\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);
    if (xRange) { xMin = +xRange[1]; xMax = +xRange[2]; continue; }
    const yRange = t.match(/^y\s*=\s*([-\d.]+)\s*:\s*([-\d.]+)/);
    if (yRange) { yMin = +yRange[1]; yMax = +yRange[2]; continue; }

    // Function: y = sin(x) | color: #F00 | width: 2 | label: "f(x)"
    const fMatch = t.match(/^y\s*=\s*(.+?)(\s*\|.*)?$/);
    if (fMatch) {
      const expr = fMatch[1].trim();
      let color = "#2196f3", width = 2, label = "";
      if (fMatch[2]) {
        const attrs = fMatch[2];
        const cm = attrs.match(/color:\s*(#[0-9A-Fa-f]{3,8}|\w+)/);
        if (cm) color = cm[1];
        const wm = attrs.match(/width:\s*(\d+)/);
        if (wm) width = +wm[1];
        const lm = attrs.match(/label:\s*"([^"]+)"/);
        if (lm) label = lm[1];
      }
      funcs.push({ expr, color, width, label });
      continue;
    }

    // Annotations: rect, text, eq, line, point, arrow, proj, hline, vline, dim
    annotations.push(t);
  }

  // Coordinate transforms
  const sx = (x: number) => PAD + (x - xMin) / (xMax - xMin) * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - (y - yMin) / (yMax - yMin) * (H - 2 * PAD);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;background:#fff;border:1px solid #ddd;">`;

  // Grid
  svg += `<g stroke="#e0e0e0" stroke-width="0.5">`;
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
    svg += `<line x1="${sx(x)}" y1="${PAD}" x2="${sx(x)}" y2="${H - PAD}"/>`;
  }
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
    svg += `<line x1="${PAD}" y1="${sy(y)}" x2="${W - PAD}" y2="${sy(y)}"/>`;
  }
  svg += `</g>`;

  // Axes
  if (yMin <= 0 && yMax >= 0) svg += `<line x1="${PAD}" y1="${sy(0)}" x2="${W - PAD}" y2="${sy(0)}" stroke="#666" stroke-width="1"/>`;
  if (xMin <= 0 && xMax >= 0) svg += `<line x1="${sx(0)}" y1="${PAD}" x2="${sx(0)}" y2="${H - PAD}" stroke="#666" stroke-width="1"/>`;

  // Axis labels
  svg += `<g font-size="10" fill="#888" text-anchor="middle">`;
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
    if (x === 0) continue;
    svg += `<text x="${sx(x)}" y="${H - PAD + 15}">${x}</text>`;
  }
  for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
    if (y === 0) continue;
    svg += `<text x="${PAD - 10}" y="${sy(y) + 4}" text-anchor="end">${y}</text>`;
  }
  svg += `</g>`;

  // Plot functions
  for (const f of funcs) {
    const env = new HekatanEnvironment();
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
      svg += `<polyline points="${points.join(" ")}" fill="none" stroke="${f.color}" stroke-width="${f.width}"/>`;
    }
    if (f.label) {
      svg += `<text x="${W - PAD - 5}" y="${sy(0) - 5}" fill="${f.color}" font-size="12" text-anchor="end">${f.label}</text>`;
    }
  }

  // Annotations
  for (const ann of annotations) {
    const parts = ann.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "rect" && parts.length >= 5) {
      const [, x1, y1, x2, y2] = parts.map(Number);
      const color = parts[5] || "#e3f2fd";
      const px = Math.min(sx(x1), sx(x2)), py = Math.min(sy(y1), sy(y2));
      const pw = Math.abs(sx(x2) - sx(x1)), ph = Math.abs(sy(y2) - sy(y1));
      svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" opacity="0.3"/>`;
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
      const color = parts[parts.length - 1]?.startsWith("#") ? parts[parts.length - 1] : "#333";
      svg += `<text x="${sx(x)}" y="${sy(y)}" fill="${color}" font-size="12">${txt}</text>`;
    }
    else if (cmd === "eq" && parts.length >= 4) {
      const x = +parts[1], y = +parts[2];
      const textMatch = ann.match(/"([^"]+)"/);
      const txt = textMatch ? textMatch[1] : parts.slice(3).join(" ");
      svg += `<text x="${sx(x)}" y="${sy(y)}" fill="#333" font-size="13" font-style="italic">${txt}</text>`;
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
function handleSvgBlock(lines: string[]): string {
  return `<div class="svg-container">${lines.join("\n")}</div>`;
}

// ─── @{three} block ──────────────────────────────────────
function handleThreeBlock(lines: string[]): string {
  const id = `three_${Math.random().toString(36).slice(2, 8)}`;
  const code = lines.join("\n");
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

// ─── Control flow: #for ──────────────────────────────────
function parseFor(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const header = lines[startIdx].trim();
  // #for i = 1 to 10 : 2
  const m = header.match(/^#for\s+(\w+)\s*=\s*(.*?)\s+to\s+(.*?)(?:\s*:\s*(.+))?\s*$/i);
  if (!m) return { html: `<div class="error">Invalid #for: ${header}</div>`, nextLine: startIdx + 1 };

  const varName = m[1];
  const startVal = evalNum(m[2], env);
  const endVal = evalNum(m[3], env);
  const step = m[4] ? evalNum(m[4], env) : 1;

  // Collect body until #next
  const body: string[] = [];
  let i = startIdx + 1;
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#for\s+/i.test(t)) depth++;
    if (/^#next\s*$/i.test(t)) { depth--; if (depth === 0) { i++; break; } }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  for (let v = startVal; step > 0 ? v <= endVal : v >= endVal; v += step) {
    env.setVar(varName, v);
    const result = parse(body.join("\n"));
    html += result.html;
  }
  return { html, nextLine: i };
}

// ─── Control flow: #if ───────────────────────────────────
function parseIf(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const branches: { cond: string | null; body: string[] }[] = [];
  let current: { cond: string | null; body: string[] } = {
    cond: lines[startIdx].trim().replace(/^#if\s+/i, ""), body: []
  };
  let i = startIdx + 1;
  let depth = 1;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#if\s+/i.test(t)) { depth++; current.body.push(lines[i]); i++; continue; }
    if (/^#end\s+if\s*$/i.test(t)) {
      depth--;
      if (depth === 0) { branches.push(current); i++; break; }
      current.body.push(lines[i]); i++; continue;
    }
    if (depth === 1 && /^#else\s+if\s+/i.test(t)) {
      branches.push(current);
      current = { cond: t.replace(/^#else\s+if\s+/i, ""), body: [] };
      i++; continue;
    }
    if (depth === 1 && /^#else\s*$/i.test(t)) {
      branches.push(current);
      current = { cond: null, body: [] };
      i++; continue;
    }
    current.body.push(lines[i]);
    i++;
  }

  for (const branch of branches) {
    if (branch.cond === null || evalNum(branch.cond, env)) {
      const result = parse(branch.body.join("\n"));
      return { html: result.html, nextLine: i };
    }
  }
  return { html: "", nextLine: i };
}

// ─── Control flow: #while ────────────────────────────────
function parseWhile(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const cond = lines[startIdx].trim().replace(/^#while\s+/i, "");
  const body: string[] = [];
  let i = startIdx + 1;
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#while\s+/i.test(t)) depth++;
    if (/^#loop\s*$/i.test(t)) { depth--; if (depth === 0) { i++; break; } }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  let guard = 0;
  while (evalNum(cond, env) && guard < 10000) {
    const result = parse(body.join("\n"));
    html += result.html;
    guard++;
  }
  return { html, nextLine: i };
}

// ─── Control flow: #repeat ───────────────────────────────
function parseRepeat(lines: string[], startIdx: number, env: HekatanEnvironment): { html: string; nextLine: number } {
  const body: string[] = [];
  let i = startIdx + 1;
  let untilCond = "";
  let depth = 1;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^#repeat\s*$/i.test(t)) depth++;
    if (/^#until\s+/i.test(t)) {
      depth--;
      if (depth === 0) { untilCond = t.replace(/^#until\s+/i, ""); i++; break; }
    }
    body.push(lines[i]);
    i++;
  }

  let html = "";
  let guard = 0;
  do {
    const result = parse(body.join("\n"));
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

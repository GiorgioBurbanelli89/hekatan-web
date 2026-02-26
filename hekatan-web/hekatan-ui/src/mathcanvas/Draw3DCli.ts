/**
 * Draw3DCli.ts - Parser CLI del CAD 3D
 * Mismos comandos que CadCli.ts (CAD 2D) pero con coordenadas 3D.
 * line, rect, circle, arc, pline, box, cylinder, sphere, arrow, dim, text, rrect, etc.
 */
import type { Draw3DShape, Draw3DConfig, Draw3DResult } from "./Draw3DTypes.js";

export function parseDraw3D(lines: string[]): Draw3DResult {
  const shapes: Draw3DShape[] = [];
  const config: Draw3DConfig = { grid: true };
  let cc = "#4488ff"; // currentColor

  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t[0] === "#" || t[0] === "'") continue;
    const p = t.replace(/,/g, " ").replace(/\s+/g, " ").split(" ");
    const cmd = p[0].toLowerCase();
    const n = p.map(parseFloat);

    switch (cmd) {
      // ── Config ──
      case "color": cc = p[1] || cc; break;
      case "bg": case "background": config.bg = p[1]; break;
      case "grid":
        if (p[1] === "off") config.grid = false;
        else { config.grid = true; if (!isNaN(n[1])) config.gridSize = n[1]; }
        break;
      case "scale": config.scale = n[1]; break;
      case "unit": config.unit = p[1]; break;
      case "camera": case "cam":
        config.camX = n[1]; config.camY = n[2]; config.camZ = n[3]; break;
      case "views": {
        const va = p.slice(1).map(v => v.toLowerCase());
        config.views = va.includes("all") ? ["front","side","top"] :
          va.filter(v => ["front","side","top"].includes(v));
        break;
      }

      // ── Lineas ──
      case "line": case "l": case "linea":
        shapes.push({ type:"line", x:n[1],y:n[2],z:n[3], x2:n[4],y2:n[5],z2:n[6], color:findColor(p,7)||cc, lw:findLw(p) }); break;
      case "arrow": case "flecha":
        shapes.push({ type:"arrow", x:n[1],y:n[2],z:n[3], x2:n[4],y2:n[5],z2:n[6], color:findColor(p,7)||cc, lw:findLw(p) }); break;
      case "pline": case "pl": case "polilinea":
        shapes.push({ type:"pline", x:0,y:0,z:0, pts:n.slice(1), color:findColor(p,-1)||cc, lw:findLw(p) }); break;

      // ── Formas planas 3D ──
      case "rect": case "r": case "rectangulo":
        shapes.push({ type:"rect", x:n[1],y:n[2],z:n[3], w:n[4],h:n[5], d:n[6]||0, color:findColor(p,7)||cc, plane:findPlane(p), fill:findFill(p) }); break;
      case "rrect":
        shapes.push({ type:"rrect", x:n[1],y:n[2],z:n[3], w:n[4],h:n[5], r:n[6]||0, color:findColor(p,7)||cc, plane:findPlane(p) }); break;
      case "circle": case "c": case "circulo":
        shapes.push({ type:"circle", x:n[1],y:n[2],z:n[3], r:n[4]||1, color:findColor(p,5)||cc, fill:findFill(p) }); break;
      case "ellipse": case "e": case "elipse":
        shapes.push({ type:"ellipse", x:n[1],y:n[2],z:n[3], rx:n[4],ry:n[5], color:findColor(p,6)||cc }); break;
      case "arc": case "a": case "arco":
        shapes.push({ type:"arc", x:n[1],y:n[2],z:n[3], r:n[4], startAngle:n[5],endAngle:n[6], color:findColor(p,7)||cc }); break;

      // ── Solidos 3D ──
      case "box": case "cubo":
        shapes.push(parseBoxCmd(p, cc)); break;
      case "cylinder": case "cyl": case "cilindro":
        shapes.push(parseSolidCmd(p, cc, "cylinder")); break;
      case "sphere": case "esfera":
        shapes.push(parseSolidCmd(p, cc, "sphere")); break;
      case "cone": case "cono":
        shapes.push(parseSolidCmd(p, cc, "cone")); break;

      // ── Anotaciones ──
      case "text": case "texto": {
        const m = raw.match(/text(?:o)?\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+"([^"]+)"(?:\s+(#\w+))?/i);
        if (m) shapes.push({ type:"text", x:+m[1],y:+m[2],z:+m[3], text:m[4], color:m[5]||cc });
        break;
      }
      case "dim": case "cota":
        shapes.push({ type:"dim", x:n[1],y:n[2],z:n[3], x2:n[4],y2:n[5],z2:n[6], offset:n[7]||1, text:findText(p,8), color:findColor(p,8)||cc }); break;
    }
  }
  return { shapes, config };
}

// ── Helpers ──

function findColor(p: string[], afterIdx: number): string | undefined {
  for (let i = Math.max(afterIdx, 1); i < p.length; i++) if (p[i]?.startsWith("#")) return p[i];
  for (let i = 1; i < p.length; i++) if (p[i]?.startsWith("color:")) return p[i].slice(6);
  return undefined;
}
function findFill(p: string[]): string | undefined {
  for (const s of p) if (s.startsWith("fill:")) return s.slice(5);
  return undefined;
}
function findPlane(p: string[]): "xy"|"xz"|"yz"|undefined {
  for (const s of p) if (s === "xy" || s === "xz" || s === "yz") return s;
  return undefined;
}
function findLw(p: string[]): number | undefined {
  for (const s of p) if (s.startsWith("lw:")) return parseFloat(s.slice(3));
  return undefined;
}
function findText(p: string[], afterIdx: number): string | undefined {
  for (let i = afterIdx; i < p.length; i++) if (p[i] && !p[i].startsWith("#")) return p.slice(i).join(" ");
  return undefined;
}

function parseBoxCmd(p: string[], cc: string): Draw3DShape {
  const s: Draw3DShape = { type:"box", x:num(p[1]),y:num(p[2]),z:num(p[3]), color:cc, w:1,h:1,d:1 };
  for (const t of p) {
    if (t.startsWith("size:")) { const v=t.slice(5).split(",").map(Number); s.w=v[0]||1; s.h=v[1]??s.w; s.d=v[2]??s.w; }
    else if (t.startsWith("color:")) s.color=t.slice(6);
    else if (t.startsWith("rotation:")) { const v=t.slice(9).split(",").map(Number); s.rotX=v[0]; s.rotY=v[1]; s.rotZ=v[2]; }
    else if (t.startsWith("#") && p.indexOf(t)>3) s.color=t;
    else if (t.startsWith("fill:")) s.fill=t.slice(5);
  }
  return s;
}

function parseSolidCmd(p: string[], cc: string, type: Draw3DShape["type"]): Draw3DShape {
  const s: Draw3DShape = { type, x:num(p[1]),y:num(p[2]),z:num(p[3]), color:cc, r:0.5, h:1 };
  for (const t of p) {
    if (t.startsWith("r:")) s.r=num(t.slice(2));
    else if (t.startsWith("h:")) s.h=num(t.slice(2));
    else if (t.startsWith("r2:")) s.r2=num(t.slice(3));
    else if (t.startsWith("color:")) s.color=t.slice(6);
    else if (t.startsWith("rotation:")) { const v=t.slice(9).split(",").map(Number); s.rotX=v[0]; s.rotY=v[1]; s.rotZ=v[2]; }
    else if (t.startsWith("#") && p.indexOf(t)>3) s.color=t;
    else if (t.startsWith("fill:")) s.fill=t.slice(5);
  }
  return s;
}

function num(s?: string): number { return parseFloat(s || "0") || 0; }

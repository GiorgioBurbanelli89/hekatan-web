/**
 * CadCli.ts - Parser de comandos CLI del CAD
 * Port de cad-cli.js / cad.exec
 */

import type { CadEngine } from "./CadEngine.js";

// ============================================================================
// execCommands - parsea y ejecuta comandos de texto
// ============================================================================

export function execCommands(engine: CadEngine, cmdText: string): void {
  const lines = cmdText.trim().split("\n");
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed[0] === "#" || trimmed[0] === "'") continue;

    const original = trimmed;  // preserve commas for text content
    const tokens = trimmed.replace(/,/g, " ").replace(/\s+/g, " ").split(" ");
    const cmd = tokens[0].toLowerCase();
    const n = tokens.map(parseFloat);

    // Y-flip helper: transforms Y when yFlip is on (cartesian Y+ upward)
    const Y = (y: number) => engine.yf(y);

    try {
      switch (cmd) {
        // ── Y-flip toggle ──
        case "yflip": case "cartesian":
          engine.yFlip = tokens[1] === "on" || tokens[1] === "yes" || tokens[1] === "true";
          break;

        case "line": case "l": case "linea":
          engine.line(n[1], Y(n[2]), n[3], Y(n[4]), tokens[5]); break;
        case "rect": case "r": case "rectangulo":
          // rect x y w h — y is anchor; without yflip (canvas), anchor = H - y - h so rect extends downward
          engine.rect(n[1], engine.yFlip ? n[2] : engine.canvasH / engine.escala - n[2] - n[4], n[3], n[4], tokens[5]); break;
        case "circle": case "c": case "circulo":
          engine.circle(n[1], Y(n[2]), n[3], tokens[4]); break;
        case "ellipse": case "e": case "elipse":
          // ellipse cx cy rx ry — only flip cy, rx/ry are radii
          engine.ellipse(n[1], Y(n[2]), n[3], n[4], tokens[5]); break;
        case "arc": case "a": case "arco":
          // arc x1 y1 cx cy x2 y2 — flip all 3 Y coords
          engine.arc(n[1], Y(n[2]), n[3], Y(n[4]), n[5], Y(n[6]), tokens[7]); break;
        case "carc":
          engine.carc(n[1], Y(n[2]), n[3], n[4], n[5], tokens[6]); break;
        case "pline": case "pl": case "polilinea": {
          // Apply Y() transform to every Y coordinate (indices 1,3,5...)
          const pcoords = n.slice(1);
          for (let i = 1; i < pcoords.length; i += 2) pcoords[i] = Y(pcoords[i]);
          engine.pline(pcoords); break;
        }
        case "clear":
          engine.clear(); break;
        case "undo": case "u":
          engine.undo(); break;
        case "del": case "delete":
          engine.del(n[1]); break;
        case "move": case "mv":
          engine.move(n[1], n[2], n[3]); break;
        case "copy": case "cp":
          engine.copy(n[1], n[2], n[3]); break;
        case "mirror": case "mi":
          engine.mirror(n[1], n[2], n[3], n[4], n[5]); break;
        case "rotate": case "ro":
          engine.rotate(n[1], n[2], n[3], n[4]); break;
        case "scaleshape": case "ss":
          engine.scaleShape(n[1], n[2], n[3], n[4]); break;
        case "array": case "ar":
          engine.array(n[1], n[2], n[3], n[4], n[5]); break;
        case "polararray": case "pa":
          engine.polarArray(n[1], n[2], n[3], n[4], n[5]); break;
        case "dim": case "cota":
          engine.dim(n[1], Y(n[2]), n[3], Y(n[4]), n[5], tokens[6]); break;
        case "hdim": case "cotah":
          engine.hdim(n[1], Y(n[2]), n[3], Y(n[4]), n[5], tokens[6]); break;
        case "vdim": case "cotav":
          engine.vdim(n[1], Y(n[2]), n[3], Y(n[4]), n[5], tokens[6]); break;
        case "z":
          engine.currentZ = engine.toPx(n[1]); break;
        case "color":
          engine.currentColor = tokens[1]; break;
        case "scale":
          engine.escala = n[1]; break;
        case "unit":
          engine.unidad = tokens[1]; break;
        case "fit": case "zoomfit": case "zf":
          engine.zoomFit(); break;
        case "rrect":
          // rrect x y w h r — same anchor logic as rect
          engine.rrect(n[1], engine.yFlip ? n[2] : engine.canvasH / engine.escala - n[2] - n[4], n[3], n[4], n[5], tokens[6]); break;
        case "stirrup": case "estribo":
          // stirrup x y w h — same anchor logic as rect
          engine.stirrup(n[1], engine.yFlip ? n[2] : engine.canvasH / engine.escala - n[2] - n[4], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "colsection": case "columna": case "columnsection":
          engine.columnSection(n[1], Y(n[2]), n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10]); break;
        case "grid":
          engine.gridOn = tokens[1] !== "off"; break;
        case "labels":
          engine.showDimLabels = tokens[1] !== "off"; break;
        case "bg": case "background": {
          const bgVal = tokens[1]?.toLowerCase() || "white";
          const bgMap: Record<string, string> = {
            book: "#f2eced", bookwarm: "#f2eced", cream: "#fdf6e3",
            white: "#ffffff", black: "#000000", dark: "#1a1a2e",
            gray: "#e0e0e0", grey: "#e0e0e0",
          };
          engine.bgColor = bgMap[bgVal] || bgVal;
          break;
        }
        case "text": case "texto": {
          // Extract text content from original line (preserving commas)
          const textMatch = original.match(/^\S+\s+\S+\s+\S+\s+(.*)/);
          engine.text(n[1], Y(n[2]), textMatch ? textMatch[1] : tokens.slice(3).join(" "));
          break;
        }
        case "otext": case "otexto": case "overbar": {
          // otext x y text — text with overbar line above
          const otMatch = original.match(/^\S+\s+\S+\s+\S+\s+(.*)/);
          engine.otext(n[1], Y(n[2]), otMatch ? otMatch[1] : tokens.slice(3).join(" "));
          break;
        }
        case "arrow": case "flecha":
          engine.arrow(n[1], Y(n[2]), n[3], Y(n[4]), tokens[5]); break;
        case "darrow": case "flechadoble":
          engine.darrow(n[1], Y(n[2]), n[3], Y(n[4]), tokens[5]); break;
        case "beam": case "viga": {
          // beam x1 y1 x2 y2 [width] [color] [hatchSpacing]
          const bw = tokens.length >= 6 && !tokens[5].startsWith("#") ? n[5] : undefined;
          const bc = tokens.length >= 6 && tokens[5].startsWith("#") ? tokens[5]
                   : tokens.length >= 7 && tokens[6].startsWith("#") ? tokens[6] : undefined;
          const bhs = tokens.length >= 8 ? n[7] : undefined;
          engine.beam(n[1], Y(n[2]), n[3], Y(n[4]), bw, bc, bhs);
          break;
        }

        case "cid": case "cnode": case "cn": {
          // cid cx cy label [radius] [color] — circle identifier
          const cnMatch = original.match(/^\S+\s+\S+\s+\S+\s+(\S+)/);
          const cnLabel = cnMatch ? cnMatch[1] : tokens[3] || "?";
          const cnR = tokens.length >= 5 && !tokens[4].startsWith("#") ? n[4] : undefined;
          const cnC = tokens.length >= 5 && tokens[4].startsWith("#") ? tokens[4]
                     : tokens.length >= 6 && tokens[5].startsWith("#") ? tokens[5] : undefined;
          engine.cnode(n[1], Y(n[2]), cnLabel, cnR, cnC);
          break;
        }

        case "tid": case "tnode": case "tn": {
          // tid cx cy label [size] [color] — triangle identifier
          const tnMatch = original.match(/^\S+\s+\S+\s+\S+\s+(\S+)/);
          const tnLabel = tnMatch ? tnMatch[1] : tokens[3] || "?";
          const tnS = tokens.length >= 5 && !tokens[4].startsWith("#") ? n[4] : undefined;
          const tnC = tokens.length >= 5 && tokens[4].startsWith("#") ? tokens[4]
                     : tokens.length >= 6 && tokens[5].startsWith("#") ? tokens[5] : undefined;
          engine.tnode(n[1], Y(n[2]), tnLabel, tnS, tnC);
          break;
        }

        case "axes": case "ejes": {
          // axes x y [length] [2d|3d] [labelX] [labelY] [labelZ]
          const aLen = tokens.length >= 4 && !isNaN(n[3]) ? n[3] : undefined;
          const aMode = tokens.find((t, i) => i >= 3 && /^(2d|3d)$/i.test(t));
          const aLabels = tokens.filter((t, i) => i >= 3 && !t.startsWith("#") && !/^(2d|3d)$/i.test(t) && isNaN(parseFloat(t)));
          engine.axes(n[1], Y(n[2]), aLen, aMode, aLabels[0], aLabels[1], aLabels[2]);
          break;
        }

        case "moment": case "giro": case "momento": {
          // moment cx cy [r] [top|left|right|bottom] [color]
          const mR = tokens.length >= 4 && !isNaN(n[3]) && !tokens[3].startsWith("#") ? n[3] : undefined;
          const mPos = tokens.length >= 5 && /^(top|left|right|bottom|t|l|r|b)$/i.test(tokens[4]) ? tokens[4]
                     : tokens.length >= 4 && /^(top|left|right|bottom|t|l|r|b)$/i.test(tokens[3]) ? tokens[3] : undefined;
          const mC = tokens.find((t, i) => i >= 3 && t.startsWith("#"));
          engine.moment(n[1], Y(n[2]), mR, mPos, mC);
          break;
        }

        // ── 3D projection commands ──
        case "proj": case "projection":
          if (tokens[1] === "oblique" || tokens[1] === "oblicua") {
            engine.projMode = "oblique";
            if (!isNaN(n[2])) engine.projAngle = n[2] * Math.PI / 180;
            if (!isNaN(n[3])) engine.projScale = n[3];
          } else {
            engine.projMode = "2d";
          }
          break;

        // ── 3D drawing commands (X=horiz, Y=depth, Z=vertical) ──
        case "line3d": case "l3d": case "linea3d":
          engine.line3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "arrow3d": case "flecha3d":
          engine.arrow3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "darrow3d": case "flechadoble3d":
          engine.darrow3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "text3d": case "texto3d": {
          const t3dMatch = original.match(/^\S+\s+\S+\s+\S+\s+\S+\s+(.*)/);
          engine.text3d(n[1], n[2], n[3], t3dMatch ? t3dMatch[1] : tokens.slice(4).join(" "));
          break;
        }
        case "pline3d": case "pl3d": case "polilinea3d":
          engine.pline3d(n.slice(1)); break;
        case "circle3d": case "c3d": case "circulo3d":
          engine.circle3d(n[1], n[2], n[3], n[4], tokens[5]); break;
        case "carc3d":
          engine.carc3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;

        // ── New primitives ──
        case "fontsize": case "fs":
          if (!isNaN(n[1])) engine.currentFontSize = n[1]; break;
        case "ff": case "fontfamily":
          engine.currentFontFamily = tokens[1] === "serif" ? "serif" : "mono"; break;
        case "fi": case "fontitalic":
          engine.currentFontItalic = tokens[1] === "on" || tokens[1] === "yes" || tokens[1] === "true"; break;
        case "lw": case "linewidth":
          if (!isNaN(n[1])) engine.currentLineWidth = n[1]; break;
        case "hatch3d": case "h3d": {
          // hatch3d x1 y1 z1 x2 y2 z2 x3 y3 z3 x4 y4 z4 [spacing] [color]
          const sp = tokens.length >= 14 && !tokens[13].startsWith("#") ? n[13] : undefined;
          const hc = tokens.length >= 14 && tokens[13].startsWith("#") ? tokens[13]
                   : tokens.length >= 15 && tokens[14].startsWith("#") ? tokens[14] : undefined;
          engine.hatch3d(n[1], n[2], n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12], sp, hc);
          break;
        }
        case "fillpoly3d": case "fp3d": {
          // fillpoly3d x1 y1 z1 x2 y2 z2 ... [color]
          const args = tokens.slice(1);
          const lastArg = args[args.length - 1];
          const fpColor = lastArg && lastArg.startsWith("#") ? args.pop() : undefined;
          const fpCoords = args.map(parseFloat).filter(v => !isNaN(v));
          engine.fillpoly3d(fpCoords, fpColor);
          break;
        }
        case "label3d": case "lb3d": {
          // label3d x y z text [anchor]
          const anchorOpts = ["left", "right", "above", "below", "center"];
          const lastTok = tokens[tokens.length - 1]?.toLowerCase();
          const hasAnchor = anchorOpts.includes(lastTok);
          const anchor = hasAnchor ? lastTok : undefined;
          const lblText = tokens.slice(4, hasAnchor ? -1 : undefined).join(" ");
          engine.label3d(n[1], n[2], n[3], lblText, anchor);
          break;
        }

        // ── Compound structural elements ──
        case "beam3d": case "bm3d": {
          // beam3d x1 y1 z1 x2 y2 z2 [depth] [label]
          const bdepth = tokens.length >= 8 && !isNaN(n[7]) ? n[7] : undefined;
          const blabel = tokens.length >= 9 ? tokens[8] : undefined;
          engine.beam3d(n[1], n[2], n[3], n[4], n[5], n[6], bdepth, blabel);
          break;
        }
        case "node3d": case "nd3d": {
          // node3d x y z label [radius]
          const nrad = tokens.length >= 6 && !isNaN(n[5]) ? n[5] : undefined;
          engine.node3d(n[1], n[2], n[3], tokens[4], nrad);
          break;
        }
        case "dof3d": {
          // dof3d x y z dx dy dz label
          engine.dof3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]);
          break;
        }
        case "rdof3d": {
          // rdof3d x y z dx dy dz label (rotational DOF - double arrow)
          engine.rdof3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]);
          break;
        }
        case "axes3d": case "ax3d": {
          // axes3d x y z [size] [labelX labelY labelZ]
          const axSize = tokens.length >= 5 ? n[4] : undefined;
          const ax3Labels = tokens.length >= 8 ? [tokens[5], tokens[6], tokens[7]] : undefined;
          engine.axes3d(n[1], n[2], n[3], axSize, ax3Labels);
          break;
        }
        case "axes2d": case "ax2d": {
          // axes2d cx cy [size] [labelH] [labelV]
          const ax2Size = tokens.length >= 4 && !isNaN(n[3]) ? n[3] : undefined;
          const ax2H = tokens.length >= 5 ? tokens[isNaN(n[3]) ? 3 : 4] : undefined;
          const ax2V = tokens.length >= 6 ? tokens[isNaN(n[3]) ? 4 : 5] : undefined;
          engine.axes2d(n[1], n[2], ax2Size, ax2H, ax2V);
          break;
        }
        case "axes2dxyz": case "ax2dxyz": {
          // axes2dxyz cx cy [size] [labelX labelY labelZ]
          const axyzSize = tokens.length >= 4 && !isNaN(n[3]) ? n[3] : undefined;
          const axyzLabels = tokens.length >= 7 ? [tokens[4], tokens[5], tokens[6]] : undefined;
          engine.axes2dxyz(n[1], n[2], axyzSize, axyzLabels);
          break;
        }
        case "support3d": case "sup3d": {
          // support3d x y z type [angle]
          const supAngle = tokens.length >= 6 ? n[5] : undefined;
          engine.support3d(n[1], n[2], n[3], tokens[4], supAngle);
          break;
        }
      }
    } catch (err: any) {
      console.warn(`[CadEngine] Error in: ${trimmed}`, err.message);
    }
  }
}

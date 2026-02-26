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

    const tokens = trimmed.replace(/,/g, " ").replace(/\s+/g, " ").split(" ");
    const cmd = tokens[0].toLowerCase();
    const n = tokens.map(parseFloat);

    try {
      switch (cmd) {
        case "line": case "l": case "linea":
          engine.line(n[1], n[2], n[3], n[4], tokens[5]); break;
        case "rect": case "r": case "rectangulo":
          engine.rect(n[1], n[2], n[3], n[4], tokens[5]); break;
        case "circle": case "c": case "circulo":
          engine.circle(n[1], n[2], n[3], tokens[4]); break;
        case "ellipse": case "e": case "elipse":
          engine.ellipse(n[1], n[2], n[3], n[4], tokens[5]); break;
        case "arc": case "a": case "arco":
          engine.arc(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "carc":
          engine.carc(n[1], n[2], n[3], n[4], n[5], tokens[6]); break;
        case "pline": case "pl": case "polilinea":
          engine.pline(n.slice(1)); break;
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
          engine.dim(n[1], n[2], n[3], n[4], n[5], tokens[6]); break;
        case "hdim": case "cotah":
          engine.hdim(n[1], n[2], n[3], n[4], n[5], tokens[6]); break;
        case "vdim": case "cotav":
          engine.vdim(n[1], n[2], n[3], n[4], n[5], tokens[6]); break;
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
          engine.rrect(n[1], n[2], n[3], n[4], n[5], tokens[6]); break;
        case "stirrup": case "estribo":
          engine.stirrup(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;
        case "colsection": case "columna": case "columnsection":
          engine.columnSection(n[1], n[2], n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10]); break;
        case "grid":
          engine.gridOn = tokens[1] !== "off"; break;
        case "labels":
          engine.showDimLabels = tokens[1] !== "off"; break;
        case "bg": case "background":
          engine.bgColor = tokens[1]; break;
        case "text": case "texto":
          engine.text(n[1], n[2], tokens.slice(3).join(" ")); break;
        case "arrow": case "flecha":
          engine.arrow(n[1], n[2], n[3], n[4], tokens[5]); break;

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
        case "text3d": case "texto3d":
          engine.text3d(n[1], n[2], n[3], tokens.slice(4).join(" ")); break;
        case "pline3d": case "pl3d": case "polilinea3d":
          engine.pline3d(n.slice(1)); break;
        case "circle3d": case "c3d": case "circulo3d":
          engine.circle3d(n[1], n[2], n[3], n[4], tokens[5]); break;
        case "carc3d":
          engine.carc3d(n[1], n[2], n[3], n[4], n[5], n[6], tokens[7]); break;

        // ── New primitives ──
        case "fontsize": case "fs":
          if (!isNaN(n[1])) engine.currentFontSize = n[1]; break;
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
          // axes3d x y z [size]
          const axSize = tokens.length >= 5 ? n[4] : undefined;
          engine.axes3d(n[1], n[2], n[3], axSize);
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

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
      }
    } catch (err: any) {
      console.warn(`[CadEngine] Error in: ${trimmed}`, err.message);
    }
  }
}

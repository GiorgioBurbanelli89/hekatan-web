# Implementar `@{draw}` en CLI y WPF

## Resumen

Agregar soporte para bloques `@{draw W H [align]}` en el pipeline **CLI** y **WPF** de Hekatan.
Actualmente `@{draw}` solo funciona en el MathEditor web (`hekatan-web/hekatan-math/`).
El objetivo es que el CLI/WPF genere un `<canvas>` HTML con JavaScript que renderice los dibujos CAD 2D/3D.

---

## Sintaxis

```
@{draw 600 400}           // centrado, 600x400 px
@{draw 600 400 left}      // alineado a la izquierda
@{draw 100% 300}          // ancho completo (% solo en web)
@{draw}                   // defaults: 600x400 centrado
# Comentario
grid off
bg #ffffff
color #333
line 0 0 10 5
rect 2 2 6 4
circle 5 5 3
arrow 0 0 5 5
text 5 5 Hola
pline 0 0 5 0 5 5 0 5 close
# 3D oblicuo
proj oblique 45 0.5
line3d 0 0 0 20 0 0
arrow3d 0 0 5 0 0 0.5
text3d 10 0 1.5 Elem 1
circle3d 5 5 0 0.2
carc3d 10 0 0 0.8 0.2 4.0
pline3d 0 0 0 5 0 0 5 0 5 close
fit
@{end draw}
```

---

## Arquitectura: Pipeline existente

```
Hekatan Code (.hcalc/.cpd)
    │
    ▼
HekatanProcessor.cs  ─────►  MultLangProcessor.Process()
    │                              │
    │                    Detecta @{draw}...@{end draw}
    │                              │
    │                    ProcessDrawBlock()  ← NUEVO
    │                              │
    │                    Genera HTML+JS con <canvas>
    │                              │
    ▼                              ▼
HekatanOutputProcessor.cs ──► HTML final (template.html)
```

### Flujo actual de bloques similares

| Bloque | Método C# | Output |
|--------|-----------|--------|
| `@{svg}` | `ProcessSvgBlock()` | SVG inline en HTML |
| `@{three}` | `ProcessThreeBlock()` | `<div>` + `<script type='module'>` con Three.js |
| `@{plot}` | `ProcessPlotBlock()` | SVG generado por C# |
| **`@{draw}`** | **`ProcessDrawBlock()`** | **`<canvas>` + `<script>` con Canvas2D JS** |

---

## Archivos a modificar

### 1. `MultLangConfig.json` — Agregar definición del lenguaje

```json
"draw": {
  "command": "",
  "extension": "",
  "directive": "@{draw}",
  "endDirective": "@{end draw}",
  "commentPrefix": "#",
  "keywords": ["line", "rect", "circle", "arrow", "text", "pline", "arc",
               "line3d", "arrow3d", "text3d", "circle3d", "carc3d", "pline3d"],
  "builtins": ["color", "grid", "bg", "proj", "fit", "lw",
               "off", "on", "oblique", "close"],
  "requiresCompilation": false,
  "compileArgs": "",
  "runArgs": "",
  "description": "CAD 2D/3D Drawing DSL - Dibujo tecnico con proyeccion oblicua. Sintaxis: @{draw 600 400} line 0 0 10 5 @{end draw}"
}
```

**Ubicación**: `MultLangConfig.json` → dentro del objeto `"languages": {}`

### 2. `MultLangProcessor.cs` — Agregar detección y procesamiento

#### 2a. En el switch/chain de `else if` dentro de `Process()` (~línea 335)

Agregar **antes** del bloque genérico de ejecución:

```csharp
// Special handling for @{draw} — CAD 2D/3D drawing on Canvas
else if (language.Equals("draw", StringComparison.OrdinalIgnoreCase) ||
         language.StartsWith("draw ", StringComparison.OrdinalIgnoreCase))
{
    var drawDirective = block.StartDirective ?? language;
    if (drawDirective.StartsWith("@{")) drawDirective = drawDirective.Substring(2);
    if (drawDirective.EndsWith("}")) drawDirective = drawDirective.Substring(0, drawDirective.Length - 1);
    output = ProcessDrawBlock(block.Code, drawDirective.Trim(), variables);
}
```

#### 2b. Método `ProcessDrawBlock()` (~800 líneas)

Este es el método principal. Parsea los comandos CAD y genera Canvas2D JavaScript.

```csharp
/// <summary>
/// Processes @{draw W H [align]} blocks.
/// Parses CAD DSL commands and generates HTML <canvas> + JavaScript.
/// Supports 2D primitives and 3D oblique projection.
/// </summary>
private string ProcessDrawBlock(string content, string directive,
                                Dictionary<string, object> variables)
{
    try
    {
        if (string.IsNullOrWhiteSpace(content))
            return "<p style='color:red;'>Error: Bloque @{draw} vacío</p>";

        var processed = ProcessMarkdownVariables(content, variables);
        var lines = processed.Split(new[] { '\n', '\r' },
                                    StringSplitOptions.RemoveEmptyEntries);

        // Parse directive: @{draw 600 400 left}
        int canvasW = 600, canvasH = 400;
        string align = "center";
        var dirParts = directive.Split(new[] { ' ', '\t' },
                                       StringSplitOptions.RemoveEmptyEntries);
        // dirParts[0] = "draw", [1] = W, [2] = H, [3] = align
        if (dirParts.Length >= 3 && int.TryParse(dirParts[1], out int pw)
            && int.TryParse(dirParts[2], out int ph))
        { canvasW = pw; canvasH = ph; }
        else if (dirParts.Length >= 2 && int.TryParse(dirParts[1], out int pw2))
        { canvasW = pw2; canvasH = (int)(pw2 * 0.67); }
        if (dirParts.Length >= 4)
        {
            var a = dirParts[3].ToLower();
            if (a == "left" || a == "right" || a == "center") align = a;
        }

        var containerId = "draw_" + Guid.NewGuid().ToString("N").Substring(0, 8);

        // ─── Parse commands ───
        // State tracking
        string currentColor = "#333333";
        string bgColor = "#ffffff";
        bool gridOn = false;
        double lineWidth = 1.5;
        // 3D projection
        bool is3d = false;
        double projAngle = 45;
        double projScale = 0.5;
        bool autoFit = false;

        var shapes = new List<string>(); // JS draw commands

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;

            var parts = line.Split(new[] { ' ', '\t' },
                                   StringSplitOptions.RemoveEmptyEntries);
            var cmd = parts[0].ToLower();

            switch (cmd)
            {
                case "color":
                    if (parts.Length >= 2) currentColor = parts[1];
                    break;
                case "bg":
                    if (parts.Length >= 2) bgColor = parts[1];
                    break;
                case "grid":
                    gridOn = parts.Length >= 2 && parts[1].ToLower() != "off";
                    break;
                case "lw":
                    if (parts.Length >= 2) double.TryParse(parts[1], out lineWidth);
                    break;
                case "proj":
                    is3d = true;
                    if (parts.Length >= 4)
                    {
                        double.TryParse(parts[2], out projAngle);
                        double.TryParse(parts[3], out projScale);
                    }
                    break;
                case "fit":
                    autoFit = true;
                    break;

                // ── 2D Primitives ──
                case "line":
                    if (parts.Length >= 5)
                        shapes.Add(GenLine2D(parts, currentColor, lineWidth));
                    break;
                case "rect":
                    if (parts.Length >= 5)
                        shapes.Add(GenRect2D(parts, currentColor, lineWidth));
                    break;
                case "circle":
                    if (parts.Length >= 4)
                        shapes.Add(GenCircle2D(parts, currentColor, lineWidth));
                    break;
                case "arrow":
                    if (parts.Length >= 5)
                        shapes.Add(GenArrow2D(parts, currentColor, lineWidth));
                    break;
                case "text":
                    if (parts.Length >= 4)
                        shapes.Add(GenText2D(parts, currentColor));
                    break;
                case "pline":
                    shapes.Add(GenPline2D(parts, currentColor, lineWidth));
                    break;

                // ── 3D Primitives (oblique projection) ──
                case "line3d":
                    if (parts.Length >= 7)
                        shapes.Add(GenLine3D(parts, currentColor, lineWidth));
                    break;
                case "arrow3d":
                    if (parts.Length >= 7)
                        shapes.Add(GenArrow3D(parts, currentColor, lineWidth));
                    break;
                case "text3d":
                    if (parts.Length >= 5)
                        shapes.Add(GenText3D(parts, currentColor));
                    break;
                case "circle3d":
                    if (parts.Length >= 5)
                        shapes.Add(GenCircle3D(parts, currentColor, lineWidth));
                    break;
                case "carc3d":
                    if (parts.Length >= 7)
                        shapes.Add(GenCarc3D(parts, currentColor, lineWidth));
                    break;
                case "pline3d":
                    shapes.Add(GenPline3D(parts, currentColor, lineWidth));
                    break;
            }
        }

        // ─── Generate HTML + JS ───
        var marginStyle = align switch
        {
            "left" => "margin:10px 0;",
            "right" => "margin:10px 0 10px auto;",
            _ => "margin:10px auto;"
        };

        var sb = new StringBuilder();
        sb.AppendLine($"<div style='text-align:{align};'>");
        sb.AppendLine($"  <canvas id='{containerId}' width='{canvasW}' " +
                      $"height='{canvasH}' style='{marginStyle}" +
                      $"display:block;border:1px solid #ccc;" +
                      $"border-radius:4px;background:{bgColor};'></canvas>");
        sb.AppendLine("</div>");
        sb.AppendLine("<script>");
        sb.AppendLine("(function(){");
        sb.AppendLine($"  var c = document.getElementById('{containerId}');");
        sb.AppendLine($"  var ctx = c.getContext('2d');");
        sb.AppendLine($"  var W = {canvasW}, H = {canvasH};");

        // 3D projection helper
        if (is3d)
        {
            sb.AppendLine($"  var projA = {projAngle} * Math.PI / 180;");
            sb.AppendLine($"  var projS = {projScale};");
            sb.AppendLine("  function w2s(x,y,z){");
            sb.AppendLine("    return [x + y*Math.cos(projA)*projS,");
            sb.AppendLine("            z + y*Math.sin(projA)*projS];");
            sb.AppendLine("  }");
        }

        // Auto-fit: calculate bounding box and apply transform
        if (autoFit)
        {
            sb.AppendLine("  // Auto-fit bounds");
            sb.AppendLine("  var _shapes = [");
            foreach (var s in shapes) sb.AppendLine("    " + s + ",");
            sb.AppendLine("  ];");
            sb.AppendLine(GenerateAutoFitJS());
        }
        else
        {
            // Direct render
            foreach (var s in shapes)
                sb.AppendLine("  " + s);
        }

        sb.AppendLine("})();");
        sb.AppendLine("</script>");

        return sb.ToString();
    }
    catch (Exception ex)
    {
        return $"<p style='color:red;'>Error en @{{draw}}: {ex.Message}</p>";
    }
}
```

#### 2c. Métodos auxiliares de generación JS

Cada método retorna una string con código JavaScript Canvas2D:

```csharp
// ── 2D ──
private string GenLine2D(string[] p, string color, double lw)
{
    // line x1 y1 x2 y2
    return $"ctx.beginPath();ctx.strokeStyle='{color}';ctx.lineWidth={lw};" +
           $"ctx.moveTo({p[1]},{p[2]});ctx.lineTo({p[3]},{p[4]});ctx.stroke();";
}

private string GenRect2D(string[] p, string color, double lw)
{
    // rect x y w h [fill]
    var fill = p.Length >= 6 ? p[5] : "";
    var js = $"ctx.strokeStyle='{color}';ctx.lineWidth={lw};" +
             $"ctx.strokeRect({p[1]},{p[2]},{p[3]},{p[4]});";
    if (!string.IsNullOrEmpty(fill))
        js += $"ctx.fillStyle='{fill}';ctx.fillRect({p[1]},{p[2]},{p[3]},{p[4]});";
    return js;
}

private string GenCircle2D(string[] p, string color, double lw)
{
    // circle cx cy r [fill]
    var fill = p.Length >= 5 ? p[4] : "";
    var js = $"ctx.beginPath();ctx.strokeStyle='{color}';ctx.lineWidth={lw};" +
             $"ctx.arc({p[1]},{p[2]},{p[3]},0,2*Math.PI);ctx.stroke();";
    if (!string.IsNullOrEmpty(fill) && fill.StartsWith("#"))
        js += $"ctx.fillStyle='{fill}';ctx.fill();";
    return js;
}

private string GenArrow2D(string[] p, string color, double lw)
{
    // arrow x1 y1 x2 y2
    return $"drawArrow(ctx,{p[1]},{p[2]},{p[3]},{p[4]},'{color}',{lw});";
}

private string GenText2D(string[] p, string color)
{
    // text x y texto con espacios...
    var txt = string.Join(" ", p.Skip(3));
    return $"ctx.fillStyle='{color}';ctx.font='12px sans-serif';" +
           $"ctx.fillText('{EscapeJs(txt)}',{p[1]},{p[2]});";
}

// ── 3D (usan w2s) ──
private string GenLine3D(string[] p, string color, double lw)
{
    // line3d x1 y1 z1 x2 y2 z2
    return $"(function(){{var a=w2s({p[1]},{p[2]},{p[3]})," +
           $"b=w2s({p[4]},{p[5]},{p[6]});" +
           $"ctx.beginPath();ctx.strokeStyle='{color}';ctx.lineWidth={lw};" +
           $"ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}})();";
}

// ... (mismo patrón para arrow3d, text3d, circle3d, carc3d, pline3d)

private string EscapeJs(string s)
{
    return s.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\n", "\\n");
}
```

#### 2d. Auto-fit JavaScript

El auto-fit calcula el bounding box de todas las formas y aplica `ctx.translate()` + `ctx.scale()` para que el dibujo quepa en el canvas con margen:

```csharp
private string GenerateAutoFitJS()
{
    return @"
  // Calculate bounds from shapes, then apply transform
  // Each shape is a function: shapes[i](ctx, tx, ty, sc)
  // For simplicity, do two-pass: first collect points, then draw
  var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  // Shapes store their bounds in _pts array
  var pad = 20;
  // ... (implementar recolección de bounds y transformación)
  // After bounds:
  var rangeX = maxX - minX || 1;
  var rangeY = maxY - minY || 1;
  var sc = Math.min((W - 2*pad) / rangeX, (H - 2*pad) / rangeY);
  var tx = pad - minX * sc + (W - 2*pad - rangeX*sc)/2;
  var ty = pad - minY * sc + (H - 2*pad - rangeY*sc)/2;
  // Flip Y: Canvas Y goes down, world Y goes up
  ctx.save();
  ctx.translate(tx, H - ty);
  ctx.scale(sc, -sc);
  // Draw all shapes...
  ctx.restore();
";
}
```

### 3. `MultLangConfig.json` — Agregar entrada `"draw"`

Ya mostrado arriba en la sección 1.

---

## Estrategia de Auto-Fit (Crítica)

El auto-fit es la parte más importante. Cuando el usuario escribe `fit` al final, el sistema debe:

1. **Recolectar todos los puntos** de todas las formas (incluyendo proyección 3D)
2. **Calcular bounding box** (minX, minY, maxX, maxY) en coordenadas de pantalla
3. **Calcular escala** para que quepa en el canvas con margen
4. **Aplicar transformación** `ctx.translate()` + `ctx.scale()` con flip en Y

### Enfoque recomendado: Dos pasadas

```javascript
// Pasada 1: Recolectar puntos para bounds
var pts = [];
// ... cada comando agrega sus puntos a pts[]

// Calcular transform
var minX = Math.min(...pts.map(p=>p[0]));
var maxX = Math.max(...pts.map(p=>p[0]));
var minY = Math.min(...pts.map(p=>p[1]));
var maxY = Math.max(...pts.map(p=>p[1]));
var pad = 30;
var rangeX = maxX - minX || 1;
var rangeY = maxY - minY || 1;
var sc = Math.min((W - 2*pad) / rangeX, (H - 2*pad) / rangeY);

// Flip Y (Y positivo hacia arriba)
ctx.translate(pad + (W-2*pad - rangeX*sc)/2, H - pad - (H-2*pad - rangeY*sc)/2);
ctx.scale(sc, -sc);
ctx.translate(-minX, -minY);

// Pasada 2: Dibujar todo
// ... ctx.beginPath(), moveTo, lineTo, etc.
```

### Proyección 3D → 2D

Para `fit` con 3D, los puntos se proyectan primero:

```javascript
function w2s(x, y, z) {
    var projA = 45 * Math.PI / 180;
    var projS = 0.5;
    return [x + y * Math.cos(projA) * projS,
            z + y * Math.sin(projA) * projS];
}
```

Cada `line3d x1 y1 z1 x2 y2 z2` genera 2 puntos proyectados para el bounding box.

---

## Referencia: Código TypeScript existente

El CadEngine TypeScript del MathEditor web ya tiene toda la lógica implementada. Usar como referencia para los detalles de cada comando:

| Archivo | Qué contiene | Líneas aprox |
|---------|-------------|-------|
| `hekatan-web/hekatan-math/src/matheditor/CadEngine.ts` | Motor principal, estado, proyección, zoomFit | ~440 |
| `hekatan-web/hekatan-math/src/matheditor/CadDraw.ts` | Primitivas: addLine, addRect, addCircle, addArrow, addText, addPline + versiones 3d | ~234 |
| `hekatan-web/hekatan-math/src/matheditor/CadCli.ts` | Parser CLI: line, rect, circle, arrow, text, proj, fit, etc. | ~120 |
| `hekatan-web/hekatan-math/src/matheditor/CadRender.ts` | Renderizado Canvas2D: renderToCtx, getBounds, drawArrow | ~474 |
| `hekatan-web/hekatan-math/src/matheditor/CadTypes.ts` | Interfaces: Shape, TextShape, etc. | ~30 |

### Cómo funciona CadRender.renderToCtx():

```typescript
renderToCtx(engine: CadEngine, ctx: CanvasRenderingContext2D,
            offX: number, offY: number, drawW: number, drawH: number) {
    // 1. getBounds() → calcula bounding box de todas las formas
    // 2. Calcula escala y offset para fit
    // 3. ctx.save() + ctx.translate() + ctx.scale()
    // 4. Itera engine.shapes[] y dibuja cada forma:
    //    - line: ctx.moveTo/lineTo
    //    - rect: ctx.strokeRect
    //    - circle: ctx.arc
    //    - arrow: drawArrow() con punta triangular
    //    - text: ctx.fillText (con flip para texto legible)
    //    - pline: ctx.moveTo + lineTo[] + optional closePath
    //    - arc: ctx.arc con startAngle/endAngle
    // 5. ctx.restore()
}
```

### Proyección oblicua (CadEngine.ts):

```typescript
w2s3(x: number, y: number, z: number): [number, number] {
    const a = this.projAngle * Math.PI / 180;
    const s = this.projScale;
    return [x + y * Math.cos(a) * s,
            z + y * Math.sin(a) * s];
}
```

---

## Opción alternativa: Compilar CadEngine a JS bundle

En vez de reimplementar en C#, se puede **compilar el TypeScript existente** a un archivo JS standalone y cargarlo en el template.html:

### Pasos:

1. Crear `hekatan-web/hekatan-math/src/matheditor/cad-bundle-entry.ts`:
```typescript
export { CadEngine } from './CadEngine';
export { CadDraw } from './CadDraw';
export { CadCli } from './CadCli';
export { CadRender } from './CadRender';
```

2. Compilar con esbuild/rollup a `cad-engine.min.js` (~15KB):
```bash
npx esbuild src/matheditor/cad-bundle-entry.ts --bundle --minify \
  --format=iife --global-name=HkCad --outfile=dist/cad-engine.min.js
```

3. En el C# `ProcessDrawBlock()`, generar HTML que carga el bundle:
```html
<canvas id="draw_abc123" width="600" height="400"></canvas>
<script src="cad-engine.min.js"></script>
<script>
  var engine = new HkCad.CadEngine();
  engine.exec("line 0 0 10 5\nrect 2 2 6 4\nfit");
  var canvas = document.getElementById('draw_abc123');
  var render = new HkCad.CadRender();
  render.renderToCtx(engine, canvas.getContext('2d'), 0, 0, 600, 400);
</script>
```

4. Agregar `cad-engine.min.js` al template.html del CLI:
   - Archivo: `Hekatan.Cli/doc/template.html`
   - Inline o como recurso embebido

### Ventajas del bundle JS:
- **Reutilización total** del código TypeScript existente (0 reimplementación)
- **Misma lógica exacta** que el MathEditor web
- **Mantenimiento único** — cambios en CadEngine.ts se reflejan automáticamente
- **~15KB** minificado, puede ir inline en el HTML

### Ventajas de reimplementar en C#:
- **Sin dependencia de JS** — funciona en contextos sin navegador
- **Puede generar SVG** — útil para exportar a Word/PDF
- **Más control** sobre el rendering

### Recomendación: **Bundle JS** para fase 1, C# para fase 2 (SVG export)

---

## Pasos de implementación

### Fase 1: Mínimo viable (~2-3 horas)

1. **Agregar `"draw"` a `MultLangConfig.json`** (5 min)
2. **Agregar detección en `MultLangProcessor.Process()`** (10 min)
3. **Implementar `ProcessDrawBlock()` básico** que genera Canvas2D JS inline (2h)
   - Solo los comandos esenciales: line, rect, circle, arrow, text, pline, color, bg, grid, fit
   - Solo 2D por ahora
4. **Probar** con ejemplo simple en CLI

### Fase 2: Proyección 3D (~1-2 horas)

5. **Agregar soporte 3D**: proj, line3d, arrow3d, text3d, circle3d, carc3d, pline3d
6. **Implementar w2s()** en JS generado
7. **Probar** con el ejemplo Grid Frame 3D

### Fase 3: Bundle JS (alternativa, ~1 hora)

8. Compilar CadEngine TypeScript a bundle IIFE
9. Reemplazar el JS inline con carga del bundle
10. Agregar bundle al template.html del CLI y WPF

### Fase 4: Exportación SVG (futuro)

11. Reimplementar la lógica en C# para generar SVG
12. Usar SVG para exportar a Word (OpenXml) y PDF

---

## Ejemplo completo de output esperado

Para este input:
```
@{draw 500 300}
# Viga simplemente apoyada
bg #ffffff
grid off
color #333
line 50 150 450 150
# Apoyo izquierdo (triángulo)
pline 50 150 35 180 65 180 close
# Apoyo derecho (triángulo)
pline 450 150 435 180 465 180 close
# Carga distribuida
color #cc0000
line 100 150 100 80
line 400 150 400 80
line 100 80 400 80
arrow 150 80 150 150
arrow 200 80 200 150
arrow 250 80 250 150
arrow 300 80 300 150
arrow 350 80 350 150
text 230 65 w = 10 kN/m
# Labels
color #333
text 45 195 A
text 445 195 B
text 240 165 L = 6.0 m
fit
@{end draw}
```

El C# genera:
```html
<div style='text-align:center;'>
  <canvas id='draw_a1b2c3d4' width='500' height='300'
    style='margin:10px auto;display:block;border:1px solid #ccc;
    border-radius:4px;background:#ffffff;'></canvas>
</div>
<script>
(function(){
  var c = document.getElementById('draw_a1b2c3d4');
  var ctx = c.getContext('2d');
  var W = 500, H = 300;
  // ... shapes con ctx.beginPath(), moveTo, lineTo, stroke, fillText ...
  // ... auto-fit transform si 'fit' presente ...
})();
</script>
```

---

## Verificación

1. Crear archivo `test-draw.hcalc`:
```
"Test de @{draw}
@{draw 500 300}
color #333
line 0 0 10 0
line 10 0 10 5
line 10 5 0 5
line 0 5 0 0
circle 5 2.5 2
text 5 2.5 OK
fit
@{end draw}
```

2. Ejecutar con CLI: `dotnet run -- test-draw.hcalc`
3. Abrir output HTML y verificar que se ve el rectángulo con círculo
4. Probar ejemplo 3D con Grid Frame

---

## Archivos involucrados (resumen)

| Archivo | Acción | Prioridad |
|---------|--------|-----------|
| `MultLangConfig.json` | Agregar `"draw"` | P1 |
| `Hekatan.Common/MultLangCode/MultLangProcessor.cs` | Agregar `ProcessDrawBlock()` + helpers | P1 |
| `Hekatan.Cli/doc/template.html` | (Opcional) agregar cad-engine.min.js | P2 |
| `Hekatan.Wpf/doc/help.html` | (Opcional) agregar cad-engine.min.js | P2 |
| `hekatan-web/hekatan-math/src/matheditor/CadEngine.ts` | Referencia (no modificar) | — |
| `hekatan-web/hekatan-math/src/matheditor/CadRender.ts` | Referencia (no modificar) | — |
| `hekatan-web/hekatan-math/src/matheditor/CadCli.ts` | Referencia (no modificar) | — |

# Guía: Sistema de Templates CSS para @{} Parsers

## Resumen

El sistema de templates permite personalizar la apariencia visual de cada lenguaje
externo (`@{python}`, `@{maxima}`, `@{bash}`, etc.) mediante archivos CSS
independientes. Todos los archivos viven en:

```
Hekatan.Common/MultLangCode/Templates/
```

Tanto Hekatan.Cli como Hekatan.Wpf usan la **misma fuente de verdad** a través
de Hekatan.Common, eliminando la desincronización de estilos.

---

## Estructura de Archivos

```
Templates/
├── templates.json      ← Índice maestro (lenguaje → CSS + metadata)
├── default.css         ← Estilos base para TODOS los bloques @{}
├── python.css          ← Estilos específicos de Python
├── maxima.css          ← Estilos de Maxima CAS (matrices, fracciones)
├── julia.css           ← Julia
├── r.css               ← R
├── octave.css          ← GNU Octave
├── cpp.css             ← C++
├── bash.css            ← Bash/Shell
└── *.html              ← Templates HTML legacy (no se usan actualmente)
```

---

## Cómo Agregar un Nuevo Lenguaje

### Paso 1: Crear el archivo CSS

Crea `mi_lenguaje.css` en `Templates/`. Usa `default.css` como base:

```css
/* ========== Mi Lenguaje @{mi_lenguaje} Block Styles ========== */

/* Personalizar el contenedor */
.mi-lenguaje-block {
    border: 1px solid #COLOR;
    border-radius: 6px;
    margin: 12px 0;
    overflow: hidden;
}

/* Personalizar el header */
.mi-lenguaje-block .lang-header {
    background: linear-gradient(135deg, #COLOR1, #COLOR2);
}

/* Personalizar la salida */
.mi-lenguaje-block .lang-output-text {
    color: #333;
    background: #fafafa;
}
```

### Paso 2: Registrar en templates.json

Agrega la entrada al archivo `templates.json`:

```json
{
  "mi_lenguaje": {
    "cssFile": "mi_lenguaje.css",
    "containerClass": "mi-lenguaje-block",
    "headerColor": "#COLOR",
    "displayName": "Mi Lenguaje"
  }
}
```

**Campos:**

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `cssFile` | Archivo CSS a cargar | `"python.css"` |
| `containerClass` | Clase CSS del contenedor | `"python-block"` |
| `headerColor` | Color del header (fallback) | `"#3776ab"` |
| `displayName` | Nombre visible al usuario | `"Python"` |

### Paso 3: Registrar en MultLangConfig.json

El lenguaje debe existir también en `MultLangConfig.json` (raíz del proyecto)
para que el sistema @{} lo reconozca y ejecute:

```json
{
  "mi_lenguaje": {
    "command": "mi_lenguaje",
    "extension": ".ml",
    "args": "{file}",
    "description": "Mi Lenguaje personalizado"
  }
}
```

### Paso 4: Compilar y Verificar

```bash
dotnet build Hekatan.Cli/Hekatan.Cli.sln
# Verificar que el .css se copió:
ls Hekatan.Cli/bin/Release/net10.0/MultLangCode/Templates/mi_lenguaje.css
```

---

## Cómo Funciona Internamente

### Flujo de Inyección de CSS

```
1. Documento .cpd contiene @{python} y @{maxima}
2. MultLangProcessor procesa cada bloque @{}
3. LanguageHtmlGenerator.GenerateHtml() llama:
   MultLangTemplateManager.MarkLanguageUsed("python")
   MultLangTemplateManager.MarkLanguageUsed("maxima")
4. Al generar HTML, se llama GetCombinedCssStyleTag():
   → Carga default.css (siempre)
   → Carga python.css (usado)
   → Carga maxima.css (usado)
   → Genera <style> tag con todo el CSS combinado
   → Genera <script> tag con función toggleLangOutput()
5. El CSS se inyecta UNA SOLA VEZ al inicio del output
```

### Clases CSS Clave (de default.css)

| Clase | Propósito |
|-------|-----------|
| `.lang-block` | Contenedor principal del bloque |
| `.lang-header` | Barra de título con color y collapse |
| `.lang-body` | Cuerpo del contenido |
| `.lang-output-text` | Texto de salida (monospace) |
| `.lang-error` | Mensaje de error (rojo) |
| `.lang-success` | Mensaje de éxito (verde) |
| `.lang-no-output` | Placeholder "(sin salida)" |
| `.lang-export` | Variable exportada a Hekatan |
| `.collapse-icon` | Icono de colapsar/expandir |

### Clases de template.html (Hekatan nativo)

Estas clases están definidas en `template.html` y están disponibles
para todos los bloques @{} porque el HTML se inyecta dentro de la página:

| Clase | Propósito |
|-------|-----------|
| `.dvc` | Contenedor de fracción vertical |
| `.dvl` | Línea de división (border-bottom) |
| `.b0` | Paréntesis 120% (normal) |
| `.b1` | Paréntesis 240% (fracciones) |
| `.b2` | Paréntesis 370% (expresiones grandes) |
| `.b3` | Paréntesis 520% (expresiones muy grandes) |
| `.matrix .tr .td` | Tabla de matriz nativa de Hekatan |

---

## Ejemplo: Crear CSS para un Nuevo Parser

### Ejemplo completo: Lenguaje "Lua"

**1. Crear `lua.css`:**

```css
/* ========== Lua @{lua} Block Styles ========== */

.lua-block {
    border: 1px solid #000080;
    border-radius: 6px;
    margin: 12px 0;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.lua-block .lang-header {
    background: linear-gradient(135deg, #000080, #00007a);
}

.lua-block .lang-header:hover {
    background: linear-gradient(135deg, #0000a0, #000090);
}

.lua-block .lang-output-text {
    color: #1a1a1a;
    background: #f0f0ff;
}

@media print {
    .lua-block { break-inside: avoid; box-shadow: none; }
}
```

**2. Agregar a `templates.json`:**

```json
"lua": {
  "cssFile": "lua.css",
  "containerClass": "lua-block",
  "headerColor": "#000080",
  "displayName": "Lua"
}
```

**3. Agregar a `MultLangConfig.json`:**

```json
"lua": {
  "command": "lua",
  "extension": ".lua",
  "args": "{file}",
  "description": "Lua scripting language"
}
```

**4. Verificar:**

Crear archivo `test_lua.cpd`:
```
"Test Lua"
@{lua}
print("Hello from Lua!")
@{end}
```

Ejecutar:
```bash
dotnet run --project Hekatan.Cli/Hekatan.Cli.csproj -- test_lua.cpd
```

---

## Lenguajes que Usan default.css

Estos lenguajes no tienen CSS propio y heredan de `default.css`:

| Lenguaje | Color Header | Display Name |
|----------|-------------|--------------|
| powershell | #012456 | PowerShell |
| cmd | #000000 | Command Prompt |
| csharp | #68217a | C# |
| fortran | #734f96 | Fortran |
| opensees | #e67e22 | OpenSees |
| rust | #dea584 | Rust |
| markdown | #083fa1 | Markdown |

Para darles CSS propio, crear el archivo `.css` y actualizar `templates.json`.

---

## Lenguajes con CSS Propio

| Lenguaje | Archivo CSS | Tamaño | Características Especiales |
|----------|-------------|--------|---------------------------|
| maxima | maxima.css | ~5 KB | Matrices con corchetes, fracciones verticales, tabla In/Out |
| python | python.css | ~1 KB | Header azul/amarillo, tema oscuro de output |
| julia | julia.css | ~500 B | Gradiente multi-color |
| r | r.css | ~500 B | Azul R |
| octave | octave.css | ~500 B | Cian Octave |
| cpp | cpp.css | ~550 B | Azul oscuro C++ |
| bash | bash.css | ~500 B | Verde terminal |

---

## Tips y Buenas Prácticas

1. **Siempre incluir print styles**: `@media print { .mi-block { break-inside: avoid; } }`

2. **Usar selectores específicos**: `.mi-block .lang-header` en vez de `.lang-header` solo,
   para no afectar otros lenguajes.

3. **Reutilizar default.css**: Si solo necesitas cambiar colores, basta con cambiar
   `headerColor` en `templates.json` sin crear un CSS nuevo.

4. **No duplicar clases de template.html**: Las clases `.dvc`, `.dvl`, `.b1` etc. ya
   están disponibles desde el template principal. Solo agregar fallbacks si el HTML
   puede usarse fuera del template.

5. **Collapse/Expand funciona automáticamente**: La función `toggleLangOutput()` se
   inyecta automáticamente. Solo necesitas que el header tenga el atributo
   `onclick='toggleLangOutput("id")'`.

6. **El csproj copia automáticamente**: El wildcard `MultLangCode\Templates\*` en
   Hekatan.Common.csproj copia todos los archivos nuevos sin modificar el proyecto.

# Hekatan Calc

> **The Living Calculation Engine** - Multi-language engineering calculator with formatted output

[![Version](https://img.shields.io/badge/version-1.0.0-gold.svg)](https://github.com/GiorgioBurbanelli89/hekatan)
[![.NET](https://img.shields.io/badge/.NET-10.0-purple.svg)](https://dotnet.microsoft.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork%20of-Calcpad-green.svg)](https://github.com/Proektsoftbg/Calcpad)

---

## About

**Hekatan Calc** is a fork of [Calcpad](https://github.com/Proektsoftbg/Calcpad) by [PROEKTSOFT EOOD](https://calcpad.eu), extended into a multi-language engineering calculation platform.

Everything outside `@{}` blocks is **markdown**. Each language (including Calcpad) lives inside its own `@{language}...@{end language}` block.

### Key Features

- **26 programming languages**: Python, C++, Fortran, Julia, R, Octave, Rust, Go, and more
- **Calcpad math engine**: Formulas, units, vectors, matrices, numerical methods via `@{calcpad}`
- **Symbolic math**: Derivatives, integrals, limits via `@{symbolic}` (AngouriMath)
- **IFC 3D viewer**: Load and visualize structural models via `@{ifc}`
- **Formatted output**: Equations, matrices, SVG, plots, multi-column layouts
- **File formats**: `.hcalc` (native), `.cpd` (Calcpad compatible), `.txt`

> **Original Project:** https://github.com/Proektsoftbg/Calcpad
>
> **Original Author:** Nedyo Zhekov / PROEKTSOFT EOOD

---

## How It Works

```
# My Calculation (this is markdown)

Design of a **reinforced concrete beam** per ACI 318.

@{calcpad}
b = 300mm
h = 500mm
A_s = 4*π*(20mm/2)^2
'Area of steel: A_s
@{end calcpad}

## Python Verification

@{python}
import math
As = 4 * math.pi * (20/2)**2
print(f"As = {As:.1f} mm2")
@{end python}

## Cross Section

@{svg}
<svg viewBox="0 0 400 600">
  <rect x="50" y="50" width="$b" height="$h" fill="#ccc" stroke="black"/>
</svg>
@{end svg}
```

---

## Architecture

```
Hekatan.Wpf / Hekatan.Cli          (UI / command-line entry points)
    |
    v
GlobalParser                        (everything goes through MultLangProcessor)
    |
    v
MultLangProcessor                   (router for all @{} directives)
    |
    +-- Markdown renderer           (text outside @{} blocks)
    +-- LanguageExecutor            (26 external languages)
    +-- ExpressionParser            (@{calcpad} math engine)
    +-- SymbolicParser              (@{symbolic} via AngouriMath)
    +-- ProcessPlotBlock            (@{plot} SVG charts)
    +-- ProcessSvgBlock             (@{svg} inline SVG)
    +-- ProcessTableBlock           (@{table} HTML tables)
    +-- IFC viewers                 (@{ifc}, @{ifc-fragment})
    +-- Markdown/LaTeX/etc          (format converters)
```

| Project | Description |
|---------|-------------|
| **Hekatan.Core** | Native math engine: formulas, units, vectors, matrices, numerical methods |
| **Hekatan.Common** | `@{}` parser system, MultLangProcessor, GlobalParser |
| **Hekatan.Wpf** | Windows desktop app (WPF + WebView2) |
| **Hekatan.Cli** | Cross-platform CLI (`hekatan file.hcalc`) |
| **Hekatan.OpenXml** | Word/Excel export |
| **hekatan-web** | Browser-based MathCanvas editor (TypeScript + Vite) |

---

## Hekatan Web — MathCanvas Editor

**MathCanvas** is the browser-based calculation editor built with TypeScript and Vite. It provides a split-pane interface with a code editor on the left and live-rendered output on the right.

### Web Features

- **Split-pane editor**: Code input with syntax highlighting + formatted output
- **Live calculation**: Auto-run on edit with substitution display (`E*I = 29000*882 = 25578000`)
- **5 visual themes**: Classic, Hekatan, LaTeX, Gabriola, Mathcad
- **Eigen WASM solver**: C++/Eigen compiled to WebAssembly for high-performance matrix operations (sparse LU, Cholesky, SVD, eigenvalues)
- **miniCAS**: Computer Algebra System with symbolic differentiation, integration, simplification
- **Code folding**: Collapse `@{}` blocks in the editor
- **Bilingual help**: Complete documentation in Spanish/English (`help.html`)
- **CLI debug console**: Built-in command system for testing and inspection

### TypeScript Math Engine

```
hekatan-web/
  hekatan-math/          # Math engine library
    src/
      evaluator.ts       # Expression evaluator with variable scope
      parser.ts          # Token-based math parser
      renderer.ts        # HTML output renderer (equations, matrices, vectors)
      mathEngine.ts      # High-level API: parse, evaluate, render
      matheditor/
        CadCli.ts        # @{draw} 2D/3D CAD diagram engine
      wasm/
        eigen_sparse.cpp # C++/Eigen solver (sparse + dense)
        eigenSolver.ts   # TypeScript wrapper for WASM module
        built/
          eigen_sparse.wasm  # Compiled WebAssembly (229 KB)
  hekatan-ui/            # Frontend application
    src/mathcanvas/
      main.ts            # MathCanvas editor (6700+ lines)
      styles.css         # 5-theme stylesheet (2700+ lines)
      index.html         # Entry point
    public/
      help.html          # Bilingual help documentation (800+ lines)
      examples/          # .hcalc example files
```

### Math Functions

| Category | Functions |
|----------|-----------|
| **Arithmetic** | `+`, `-`, `*`, `/`, `^`, `%`, `!`, ternary `?:` |
| **Trigonometry** | `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh` |
| **Exponential** | `exp`, `log`, `log2`, `log10`, `sqrt`, `cbrt`, `pow` |
| **Rounding** | `abs`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max` |
| **Matrix creation** | `range`, `zeros`, `ones`, `identity`, `linspace`, `diag` |
| **Matrix ops** | `det`, `transpose`, `inv`, `lsolve`, `norm`, `dot`, `cross`, `trace` |
| **Eigenvalues** | `eigenvalues`, `eigenvectors`, `svd` (via Eigen WASM for large matrices) |
| **Calculus** | `nderiv`, `lim`, `nsolve`, `bisect`, `secant`, `odesolve` |
| **Statistics** | `mean`, `median`, `std`, `variance`, `sum`, `prod`, `interp`, `linreg` |
| **Number theory** | `gcd`, `lcm`, `fibonacci`, `isprime`, `factorize` |
| **Series** | `arithsum`, `geomsum`, `geominf` |

### @{eq} — Equation Display

Renders formatted mathematical equations with fractions, subscripts, superscripts, matrices, integrals, and summations.

```
@{eq}
K_L = K_{aa} - K_{ab} * K_{bb}^{-1} * K_{ba}
@{end eq}

@{eq}
f(x) = 1/√(2*π*σ^2) * e^{-(x-μ)^2/(2*σ^2)}
@{end eq}

@{eq}
∫_0^L M(x)/EI dx = ∑_{i=1}^n F_i * δ_i    (5.7)
@{end eq}
```

### @{draw} — CAD 2D/3D Diagrams

Engineering diagrams with structural annotations, dimensions, and 3D projections.

```
@{draw 600 300}
proj oblique 30 0.5
line3d 0 0 0  4 0 0  color:#333 lw:2
arrow3d 0 0 0  0 -1.5 0  color:red lw:1.5
text3d 2 -0.3 0  "L = 4.0 m"  fs:12 color:#333
circle3d 0 0 0  0.15  color:green
hdim 0 0  4 0  -0.8  "4000"  fs:11
@{end draw}
```

### 5 Visual Themes

| Theme | Style | Font |
|-------|-------|------|
| **Classic** | Clean engineering look | System default |
| **Hekatan** | Modern dark accents | Inter / system |
| **LaTeX** | Academic typesetting | Latin Modern Math |
| **Gabriola** | Elegant calligraphic | Gabriola |
| **Mathcad** | Mathcad-style worksheet | Cambria Math |

### Running Hekatan Web

```bash
cd hekatan-web
npm install            # Install workspace dependencies
npm run dev            # Start Vite dev server on port 4610
```

Open `http://localhost:4610/src/mathcanvas/index.html` in your browser.

### Building for Production

```bash
npm run build          # Outputs to hekatan-ui/dist/
```

---

## What Hekatan Adds (Not in Official Calcpad)

| Feature | Calcpad | Hekatan |
|---------|:---:|:---:|
| Native math engine | Yes | Yes (via `@{calcpad}`) |
| `@{}` external parser system | **No** | **65+ directives** |
| Multi-language code execution | **No** | **26 languages** |
| Markdown as default text | **No** | **Yes** |
| `.hcalc` file format | **No** | **Yes** |
| Symbolic math (AngouriMath) | **No** | `@{symbolic}` |
| IFC 3D model viewer | **No** | `@{ifc}` |
| Multi-column layout | **No** | `@{columns N}` |
| SVG with variable substitution | **No** | `@{svg}` |
| Equation formatting | **No** | `@{eq}` |
| Interactive charts | **No** | `@{plot}` |
| Three.js 3D visualization | **No** | `@{three}` |
| Browser-based editor | **No** | **MathCanvas** (TypeScript) |
| WASM matrix solver | **No** | **Eigen WASM** (C++/Emscripten) |
| Computer Algebra System | **No** | **miniCAS** |
| CAD 2D/3D diagrams | **No** | `@{draw}` |
| Multiple visual themes | **No** | **5 themes** |

---

## `@{}` Directives

### Language Execution (26 languages)

| Directive | Language | Directive | Language |
|-----------|----------|-----------|----------|
| `@{python}` | Python | `@{julia}` | Julia |
| `@{cpp}` | C++ | `@{r}` | R |
| `@{c}` | C | `@{octave}` | GNU Octave |
| `@{csharp}` | C# | `@{go}` | Go |
| `@{fortran}` | Fortran | `@{lua}` | Lua |
| `@{rust}` | Rust | `@{perl}` | Perl |
| `@{typescript}` | TypeScript | `@{ruby}` | Ruby |
| `@{javascript}` | JavaScript | `@{php}` | PHP |
| `@{haskell}` | Haskell | `@{d}` | D |
| `@{powershell}` | PowerShell | `@{bash}` | Bash |
| `@{opensees}` | OpenSees | `@{cmd}` | Windows Batch |
| `@{wpf}` | WPF GUI | `@{avalonia}` | Avalonia GUI |
| `@{calcpad}` | Calcpad math | `@{qt}` / `@{gtk}` | Qt / GTK |

### Formatting & Rendering

| Directive | Purpose |
|-----------|---------|
| `@{symbolic}` | Symbolic math: derivatives, integrals, limits |
| `@{eq}` | Formatted equation display |
| `@{eqdef}` | Equations with definitions |
| `@{table}` | HTML tables from data |
| `@{plot}` | SVG charts with annotations |
| `@{svg}` | Inline SVG with `$variable` substitution |
| `@{markdown}` | Markdown block with Calcpad variables |
| `@{latex}` | LaTeX to Calcpad converter |
| `@{html}` | HTML pass-through |
| `@{css}` | CSS styling blocks |

### Layout & Visualization

| Directive | Purpose |
|-----------|---------|
| `@{columns N}` | Multi-column layout (2-4 columns) |
| `@{three}` | Three.js 3D visualization |
| `@{ifc}` | IFC 3D model viewer |
| `@{ifc-fragment}` | Optimized IFC viewer (ThatOpen) |
| `@{ifc-create}` | Generate IFC geometry from DSL |
| `@{mcdx}` | Import Mathcad Prime files |

---

## Installation

```bash
git clone https://github.com/GiorgioBurbanelli89/hekatan.git
cd hekatan
dotnet build -c Release
```

### CLI Usage

```bash
# Process .hcalc file to HTML
hekatan file.hcalc output.html -s

# Also supports .cpd and .txt
hekatan file.cpd output.html -s
```

---

## Credits

- **Calcpad:** [Nedyo Zhekov / PROEKTSOFT EOOD](https://github.com/Proektsoftbg/Calcpad) - Core math engine
- **AngouriMath:** [ASC Community](https://github.com/asc-community/AngouriMath) - Symbolic math
- **Markdig:** Markdown processing
- **web-ifc / ThatOpen:** IFC 3D model parsing
- **Three.js:** 3D visualization
- **Eigen:** [Eigen 3.4.0](https://eigen.tuxfamily.org/) - C++ linear algebra (compiled to WASM via Emscripten)
- **Vite:** Frontend build tool for hekatan-web

---

## License

### Hekatan Calc (MIT)

Copyright 2026 Hekatan Calc Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

### Calcpad

The Calcpad parser is based on [Calcpad](https://github.com/Proektsoftbg/Calcpad) by PROEKTSOFT EOOD, distributed under the MIT license.

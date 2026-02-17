# Hekatan Calc

> **The Living Calculation Engine** - Multi-language engineering calculator with formatted output

[![Version](https://img.shields.io/badge/version-1.0.0-gold.svg)](https://github.com/GiorgioBurbanelli89/hekatan)
[![.NET](https://img.shields.io/badge/.NET-10.0-purple.svg)](https://dotnet.microsoft.com/)
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

---

## License

### Hekatan Calc (MIT)

Copyright 2026 Hekatan Calc Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

### Calcpad

The Calcpad parser is based on [Calcpad](https://github.com/Proektsoftbg/Calcpad) by PROEKTSOFT EOOD, distributed under the MIT license.

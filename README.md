# Hekatan Web

> **MathCanvas** - Engineering calculation editor for the browser

[![Version](https://img.shields.io/badge/version-1.0.0-gold.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF.svg)](https://vitejs.dev/)
[![Eigen WASM](https://img.shields.io/badge/Eigen-WASM-orange.svg)](https://eigen.tuxfamily.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why Hekatan Web?

**Hekatan Calc** started as a fork of [Calcpad](https://github.com/Proektsoftbg/Calcpad), an excellent open-source engineering calculator by PROEKTSOFT EOOD. Calcpad provides a solid math engine with units, vectors, matrices, and professional equation formatting - a great foundation for engineering calculations.

However, I wanted to go further: a **browser-based platform** that unifies structural analysis, multi-language computation, and professional document output in a single tool. The desktop C#/.NET version (Hekatan Calc) added 26 programming languages, symbolic math, IFC 3D viewers, and CAD diagrams on top of Calcpad. But the web is the future.

**Hekatan Web** is a complete rewrite in TypeScript/Vite that brings the calculation engine to the browser with modern architecture:

- **High-performance math**: math.js + Eigen C++/WASM solver (sparse LU, Cholesky, SVD, eigenvalues)
- **Professional output**: Fractions, matrices, equation numbering, Greek letters - all rendered in HTML/CSS
- **CAD diagrams**: 2D/3D structural engineering diagrams with `@{draw}` and Three.js scenes with `@{three}`
- **5 visual themes**: Classic, Hekatan, LaTeX, Gabriola, Mathcad

### Inspiration & Vision

The structural analysis examples in this project follow the theory from **"Matrix Structural Analysis" by Mario Paz and William Leigh** - a rigorous treatment of the direct stiffness method.

I also studied [**awatif**](https://github.com/madil4/awatif) (by Mohamed Adil), an excellent open-source FEM framework. awatif's architecture is clean and well-designed, and the Eigen WASM solver in Hekatan Web is based on its approach. However, awatif is still incomplete - it only supports 3-node triangular meshes for plates, and has no shell elements or foundation modeling.

The long-term goal is to build a tool similar to **ETABS** and **SAP 2000** - a comprehensive structural analysis platform that handles frames, plates, shells, and foundations. The main challenges are plate elements (beyond 3-node triangles) and foundation modeling. I'm also drawing from **OpenSees** for advanced capabilities, though with some differences in diaphragm modeling and element formulations.

The first version is open and available to everyone. Future versions will incorporate contributions from collaborators who help develop the platform.

---

## Features

### Split-Pane Live Editor

Write calculations on the left, see formatted results on the right - in real time.

```
# Beam Design

> Design of a reinforced concrete beam

b = 300        // mm
h = 500        // mm
d = h - 60     // effective depth
f_c = 28       // MPa
f_y = 420      // MPa

A_s = 4*pi*(20/2)^2
'Steel area: A_s
```

**Output:**
```
A_s = 4*pi*(20/2)^2 = 4*3.1416*(10)^2 = 1256.637 mm^2
```

---

### Math Engine

Full numerical computation with 100+ functions:

| Category | Functions |
|----------|-----------|
| **Arithmetic** | `+`, `-`, `*`, `/`, `^`, `%`, `!`, ternary `?:` |
| **Trigonometry** | `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh` |
| **Exponential** | `exp`, `log`, `log2`, `log10`, `sqrt`, `cbrt`, `pow` |
| **Rounding** | `abs`, `round`, `floor`, `ceil`, `trunc`, `sign`, `min`, `max` |
| **Matrix creation** | `range`, `zeros`, `ones`, `identity`, `linspace`, `diag` |
| **Matrix ops** | `det`, `transpose`, `inv`, `lsolve`, `norm`, `dot`, `cross`, `trace` |
| **Eigenvalues** | `eigenvalues`, `eigenvectors`, `svd` (via Eigen WASM for large matrices) |
| **Calculus** | `nderiv`, `integral`, `lim`, `nsolve`, `bisect`, `secant`, `odesolve` |
| **Statistics** | `mean`, `median`, `std`, `variance`, `sum`, `prod`, `interp`, `linreg` |
| **Number theory** | `gcd`, `lcm`, `fibonacci`, `isprime`, `factorize` |

**Eigen WASM Solver** (C++/Emscripten, 229 KB): Automatically routes matrices >= 50x50 to the native Eigen library compiled to WebAssembly. Supports sparse LU decomposition, Cholesky factorization, dense inverse, SVD, and eigenvalue decomposition.

---

### Symbolic Equations — `@{eq}`

Renders publication-quality equations with fractions, integrals, summations, matrices, and equation numbering:

```
@{eq}
K_L = K_{aa} - K_{ab} * K_{bb}^{-1} * K_{ba}     (5.7)
@{end eq}

@{eq}
f(x) = 1/sqrt(2*pi*sigma^2) * e^{-(x-mu)^2/(2*sigma^2)}
@{end eq}

@{eq}
integral_0^L M(x)/EI dx = sum_{i=1}^n F_i * delta_i
@{end eq}
```

**Supported notation:**
- Fractions: `a/b` renders as proper fraction
- Subscripts: `X_a` or `X_{abc}`
- Superscripts: `X^2` or `X^{abc}`
- N-ary operators: `integral_a^b`, `sum_{i=1}^n`, `prod_{k=1}^N`
- Matrices: `[a, b; c, d]`
- Piecewise: `f = {x>0: x; x<=0: -x}`
- Equation numbering: `(5.7)` at end of line
- Greek letters: alpha, beta, gamma, delta, sigma, etc.
- Derivatives: `d/dx`, `partial/partial x`

---

### CAD 2D/3D Diagrams — `@{draw}`

Create engineering diagrams with structural annotations, dimensions, and 3D oblique projections:

```
@{draw 600 300}
proj oblique 30 0.5
line3d 0 0 0  4 0 0  color:#333 lw:2
arrow3d 0 0 0  0 -1.5 0  color:red lw:1.5
text3d 2 -0.3 0  "L = 4.0 m"  fs:12 color:#333
circle3d 0 0 0  0.15  color:green fill:green
hdim 0 0  4 0  -0.8  "4000 mm"  fs:11
fit
@{end draw}
```

**Commands:** `line`, `line3d`, `arrow`, `arrow3d`, `circle`, `circle3d`, `arc`, `carc`, `carc3d`, `rect`, `text`, `text3d`, `hdim`, `vdim`, `adim`, `hatch`, `proj oblique`, `proj ortho`, `fit`

---

### Three.js 3D Visualization — `@{three}`

Interactive 3D scenes with a domain-specific language for structural engineering:

```
@{three 800 500}
background #87CEEB

// Bridge deck
deck -50 0 25  50 0 25  w:12 t:1 color:#888888

// Tower
beam 0 0 0  0 0 50  r:1.5 color:#cc4444

// Cables
cable -50,0,25  -25,0,40  0,0,50  r:0.15 color:#333
cable 0,0,50  25,0,40  50,0,25  r:0.15 color:#333

// Hangers
hanger -40 0 50 25 r:0.08 color:#666
hanger -30 0 50 25 r:0.08 color:#666
hanger -20 0 50 25 r:0.08 color:#666

// Water
water -2 w:200 l:200 color:#1a5276

camera 80 60 40
fit
@{end three}
```

**Elements:** `beam`, `deck`, `pier`, `cable`, `hanger`, `box`, `cylinder`, `sphere`, `water`, `text`, `grid`

---

## Example: Direct Stiffness Method (Grid Frame)

A complete structural analysis following Paz & Leigh Chapter 5:

```
# Grid Frame Analysis - Example 5.1

> Direct stiffness method for a grid frame structure

## Material Properties

E = 29000          // ksi - Young's modulus
G = 11200          // ksi - Shear modulus
I_x = 100          // in^4 - Moment of inertia
J = 50             // in^4 - Torsional constant
L1 = 20*12         // in - Member 1 length (20 ft)
L2 = 15*12         // in - Member 2 length (15 ft)

## Element Stiffness Matrix

@{eq}
k = [12*EI/L^3,    6*EI/L^2,   0,          -12*EI/L^3,  6*EI/L^2,   0;
     6*EI/L^2,     4*EI/L,     0,          -6*EI/L^2,   2*EI/L,     0;
     0,            0,          GJ/L,       0,           0,          -GJ/L;
     -12*EI/L^3,   -6*EI/L^2,  0,          12*EI/L^3,   -6*EI/L^2,  0;
     6*EI/L^2,     2*EI/L,     0,          -6*EI/L^2,   4*EI/L,     0;
     0,            0,          -GJ/L,      0,           0,          GJ/L]     (5.7)
@{end eq}

## Assembly and Solution

k1 = stiffness_grid(E, I_x, G, J, L1)
k2 = stiffness_grid(E, I_x, G, J, L2)

// Global stiffness matrix (assembled)
K = zeros(9, 9)
// ... assembly code ...

// Apply boundary conditions and solve
F = [0; 0; 0; -20; 0; 0; 0; 0; 0]
u = lsolve(K_reduced, F_reduced)

// Reactions
R = K * u - F
```

---

## Example: Multi-Language Integration

Execute Python, MATLAB/Octave, JavaScript, and more alongside math:

```
# Comparative Analysis

> Steel beam design with verification in multiple languages

## Hekatan Math Engine

b = 200            // mm - flange width
t_f = 15           // mm - flange thickness
h_w = 400          // mm - web height
t_w = 10           // mm - web thickness

I_x = 2*(b*t_f^3/12 + b*t_f*(h_w/2 + t_f/2)^2) + t_w*h_w^3/12
'Moment of inertia: I_x

## Python Verification

@{python}
b, tf, hw, tw = 200, 15, 400, 10
Ix = 2*(b*tf**3/12 + b*tf*(hw/2 + tf/2)**2) + tw*hw**3/12
print(f"I_x = {Ix:,.0f} mm4")
@{end python}

## Octave/MATLAB

@{octave}
b = 200; tf = 15; hw = 400; tw = 10;
Ix = 2*(b*tf^3/12 + b*tf*(hw/2 + tf/2)^2) + tw*hw^3/12;
printf("I_x = %.0f mm4\n", Ix)
@{end octave}
```

---

## Example: Numerical Integration

```
# Gaussian Quadrature vs Riemann Sums

f(x) = sin(x) * exp(-x/10)

// Riemann sum (1000 intervals)
n = 1000
a = 0
b_val = 10*pi
dx = (b_val - a)/n
S_riemann = sum(range(0, n-1), i, f(a + i*dx) * dx)

// Built-in Gauss-Legendre quadrature
S_gauss = integral(f, a, b_val)

'Riemann sum:  S_riemann
'Gauss-Legendre: S_gauss
'Difference: abs(S_riemann - S_gauss)
```

---

## Example: Eigenvalue Analysis

```
# Modal Analysis of a 3-DOF System

> Natural frequencies and mode shapes

m1 = 2             // kg
m2 = 3             // kg
m3 = 1.5           // kg

k1 = 1000          // N/m
k2 = 1500          // N/m
k3 = 800           // N/m

M = diag([m1, m2, m3])
K_stiff = [[k1+k2, -k2, 0]; [-k2, k2+k3, -k3]; [0, -k3, k3]]

// Solve eigenvalue problem: K*phi = omega^2*M*phi
omega2 = eigenvalues(inv(M) * K_stiff)
omega = sqrt(abs(omega2))
f_nat = omega / (2*pi)

'Natural frequencies (Hz):
f_nat
```

---

## Example: Matrix Operations

```
# Linear Algebra

A = [[3, 1, -1]; [2, 4, 1]; [-1, 2, 5]]
b_vec = [4; 1; 1]

// Direct solution
x = lsolve(A, b_vec)
'Solution x:
x

// Verification
check = A * x
'A*x should equal b:
check

// Matrix properties
'Determinant: det(A)
'Trace: trace(A)
'Condition number: norm(A) * norm(inv(A))
```

---

## Example: Statistics & Regression

```
# Data Analysis

x_data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
y_data = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2, 18.0, 20.1]

// Linear regression
coeffs = linreg(x_data, y_data)
'Slope: coeffs.(1)
'Intercept: coeffs.(2)

// Statistics
'Mean of y: mean(y_data)
'Std dev: std(y_data)
'Median: median(y_data)

// Interpolation
y_interp = interp(x_data, y_data, 5.5)
'Interpolated y at x=5.5: y_interp
```

---

## 5 Visual Themes

| Theme | Style |
|-------|-------|
| **Classic** | Clean, professional engineering look with system fonts |
| **Hekatan** | Modern dark accents with teal highlights |
| **LaTeX** | Academic typesetting with Latin Modern Math font |
| **Gabriola** | Elegant calligraphic style |
| **Mathcad** | Mathcad-style worksheet layout with Cambria Math |

---

## Display Modes

Control how results are shown:

```
x = 5
a = x + 1                    // Default: a = x + 1 = 5 + 1 = 6

@{mode fr}
a = x + 1                    // Formula + Result: a = x + 1 = 6

@{mode r}
a = x + 1                    // Result only: a = 6

@{mode f}
a = x + 1                    // Formula only: a = x + 1

@{mode}                       // Reset to default

@{cells}    |a = x+1|b = 2*x|    // Compact inline row
@{cells fr} |a = x+1|b = 2*x|    // Formula + result row
```

---

## Architecture

```
hekatan-web/
  hekatan-math/               # Math engine library
    src/
      evaluator.ts            # Expression evaluator with variable scope
      parser.ts               # Token-based document parser
      renderer.ts             # HTML output renderer
      mathEngine.ts           # High-level API (math.js + custom functions)
      cas/
        miniCAS.ts            # Symbolic differentiation & integration
      matheditor/
        CadCli.ts             # @{draw} 2D/3D CAD engine
        CadRender.ts          # Canvas rendering
        MathEditor.ts         # Core editor logic
      wasm/
        eigen_sparse.cpp      # C++/Eigen sparse+dense solver
        eigenSolver.ts        # TypeScript WASM wrapper
        built/
          eigen_sparse.wasm   # Compiled WebAssembly (229 KB)
  hekatan-ui/                 # Frontend application
    src/mathcanvas/
      main.ts                 # MathCanvas editor (8500+ lines)
      styles.css              # 5-theme stylesheet
    public/
      help.html               # Bilingual help (ES/EN)
```

---

## Getting Started

```bash
git clone https://github.com/GiorgioBurbanelli89/hekatan-web.git
cd hekatan-web
npm install
npm run dev
```

Open `http://localhost:4610/src/mathcanvas/index.html` in your browser.

### Build for Production

```bash
npm run build     # Outputs to hekatan-ui/dist/
```

---

## Credits

- **[Calcpad](https://github.com/Proektsoftbg/Calcpad)** by Nedyo Zhekov / PROEKTSOFT EOOD - The original math engine that started it all
- **[awatif](https://github.com/madil4/awatif)** by Mohamed Adil - FEM framework; Eigen WASM solver architecture
- **"Matrix Structural Analysis" by Mario Paz & William Leigh** - Theoretical foundation for structural examples
- **[OpenSees](https://opensees.berkeley.edu/)** - Advanced structural analysis concepts
- **[Eigen](https://eigen.tuxfamily.org/)** 3.4.0 - C++ linear algebra (compiled to WASM)
- **[math.js](https://mathjs.org/)** - JavaScript math library
- **[Three.js](https://threejs.org/)** - 3D visualization
- **[Vite](https://vitejs.dev/)** - Frontend build tool

---

## License

MIT License

Copyright 2026 Jorge Burbano / Hekatan

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.

---

**Author:** Jorge Burbano - Founder of Hekatan | Ingeniero Civil | Ecuador

**Desktop version:** [Hekatan Calc](https://github.com/GiorgioBurbanelli89/hekatan) (C#/.NET, WPF, 26 languages)

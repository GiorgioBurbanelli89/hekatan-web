# Bibliotecas C++ de Elementos Finitos - Open Source

Investigacion de bibliotecas FEM/FEA en C++ para posible integracion futura en Hekatan Calc.

---

## 1. MFEM (Lawrence Livermore National Lab)

**La mas ligera y prometedora para Wasm**

- **GitHub**: https://github.com/mfem/mfem
- **Web**: https://mfem.org/
- **Estrellas**: ~1,800
- **Licencia**: BSD-3
- **Lenguaje**: C++ puro
- **Que hace**: Resuelve PDEs con metodo de elementos finitos (elasticidad, vigas, membranas)
- **GPU**: Soporte CUDA, HIP, OCCA, RAJA, OpenMP desde v4.0
- **Wasm**: Viable (ligero, pocas dependencias)

### Ejemplos relevantes

- `ex2.cpp` - Elasticidad lineal con materiales multiples (viga en voladizo)
- `ex10.cpp` - Eigenvalores de elasticidad lineal (viga cantilever)
- `ex21.cpp` - Elasticidad lineal con refinamiento adaptativo (AMR)
- Mallas incluidas: `beam-tri.mesh`, `beam-tet.mesh`, `beam-hex.mesh`

### Ejemplo codigo (elasticidad lineal - viga)

```cpp
#include "mfem.hpp"
using namespace mfem;

int main() {
    Mesh mesh("beam-tri.mesh");
    H1_FECollection fec(1, mesh.Dimension());
    FiniteElementSpace fespace(&mesh, &fec, mesh.Dimension());

    // Condiciones de contorno (extremo empotrado)
    Array<int> ess_bdr(mesh.bdr_attributes.Max());
    ess_bdr = 0; ess_bdr[0] = 1;

    // Carga: fuerza hacia abajo
    LinearForm b(&fespace);
    Vector pull_force(mesh.Dimension());
    pull_force = 0.0; pull_force(1) = -1.0e-2;
    b.AddBoundaryIntegrator(new VectorBoundaryLFIntegrator(pull_force));
    b.Assemble();

    // Rigidez: elasticidad con lambda y mu (Lame)
    BilinearForm a(&fespace);
    ConstantCoefficient lambda(1.0), mu(1.0);
    a.AddDomainIntegrator(new ElasticityIntegrator(lambda, mu));
    a.Assemble();

    // Resolver con gradiente conjugado
    GridFunction x(&fespace);
    x = 0.0;
    CGSolver solver;
    solver.SetOperator(a.SpMat());
    solver.Mult(b, x);
}
```

### Instalacion

```bash
git clone https://github.com/mfem/mfem
cd mfem && mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
```

### Compilar a Wasm

```bash
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make
```

---

## 2. Sparselizard

**Multifisica, muy completa**

- **GitHub**: https://github.com/halbux/sparselizard
- **Web**: https://www.sparselizard.org/
- **Licencia**: MIT
- **Lenguaje**: C++
- **Plataformas**: Linux, Mac, Windows

### 58 ejemplos incluidos

Relevantes para estructuras:
- `elasticity-membrane-3d`
- `nonlinear-truss-elasticity-2d`
- `eigenvalues-elasticity-membrane-3d`
- `eigenvalues-damped-elasticity-membrane-3d`
- `elasticity-geometric-nonlinearity-eigenvalues-3d`
- `thermoacoustic-elasticity-axisymmetry-2d`
- `mesher-extruded-mechanical-structure-3d`
- `reaction-force-computing`

### Capacidades mecanicas

- Elasticidad anisotropa
- No-linealidad geometrica
- Pandeo (buckling)
- Contacto
- Orientacion cristalina
- Analisis transitorio, multiarmonico, modos propios (amortiguado/no amortiguado)

---

## 3. XC - FEM para Ingenieria Civil

**El mas relevante para ingenieria estructural**

- **GitHub**: https://github.com/xcfem/xc
- **Estrellas**: 333
- **Licencia**: GPL-3.0
- **Lenguaje**: C++ (58.8%) + Python (31.8%)

### Capacidades

- Elementos 0D, 1D, 2D y 3D
- Analisis lineal y no lineal (estatico y dinamico)
- **Secciones fibra** para hormigon armado
- Normas: **Eurocode 2/3, ACI 318, SIA**
- Analisis modal y P-Delta
- Hormigon pretensado
- Conexiones acero (CBFEM)
- Integracion IFC (en desarrollo)
- Activacion/desactivacion de elementos (fases constructivas)

### Nota

Es grande y GPL, difícil de compilar a Wasm, pero tiene el paquete mas completo para ingenieria estructural.

---

## 4. nla3d - Framework simple

**Ideal para aprender e integrar**

- **GitHub**: https://github.com/dmitryikh/nla3d
- **Licencia**: MIT
- **Lenguaje**: C++

### Caracteristicas

- Resuelve problemas no lineales 3D
- Newton-Raphson para no-linealidad
- Ejemplo simple de armadura (TRUSS3): dos nodos, area de seccion, modulo de Young
- Codigo muy comentado, facil de extender
- Archivos clave:
  - `src/lib/elements/TRUSS3.h` / `TRUSS3.cpp` - Elemento armadura 3D
  - `src/main_truss.cpp` - Ejemplo completo

### Wasm

Viable por ser pequeno y con pocas dependencias.

---

## 5. PolyFEM

**Moderno, polivalente**

- **GitHub**: https://github.com/polyfem/polyfem
- **Web**: https://polyfem.github.io/
- **Licencia**: MIT
- **Lenguaje**: C++

### Caracteristicas

- Elementos tri/quad/tet/hex hasta orden 4
- p-refinamiento adaptativo
- Mapas geometricos de alto orden
- Interfaz Python
- Tensiones de Von Mises
- Compila con CMake en Windows/Mac/Linux

---

## 6. Otras bibliotecas notables

| Biblioteca | Web | Licencia | Notas |
|---|---|---|---|
| **deal.II** | https://dealii.org/ | LGPL | Muy madura, premio SIAM/ACM 2025 |
| **FEniCS** | https://fenicsproject.org/ | LGPL | Python + C++, muy popular en academia |
| **FreeFEM** | https://freefem.org/ | LGPL | Lenguaje DSL propio, 2D/3D |
| **libMesh** | https://libmesh.github.io/ | LGPL | AMR en paralelo |
| **Feel++** | https://github.com/feelpp/feelpp | GPL | Galerkin continuo/discontinuo |

---

## Caso de exito: SPARSELAB (FEA en el navegador)

- **Web**: https://sparselab.com/
- Motor FEA escrito en **C++ compilado a WebAssembly**
- Corre en el navegador con rendimiento casi nativo
- Maneja mallas de **millones de elementos**
- UI: **Svelte + Three.js**
- Limitacion actual: Wasm 32-bit (max ~4GB RAM)
- Demuestra que FEA en Wasm es totalmente viable

---

## Resumen comparativo para Hekatan

| Biblioteca | Licencia | Wasm viable | Ing. estructural | Complejidad | Recomendacion |
|---|---|---|---|---|---|
| **MFEM** | BSD-3 | Si (ligero) | Media | Media | Mejor balance potencia/tamano |
| **Sparselizard** | MIT | Posible | Media | Media | Buena para multifisica |
| **XC** | GPL-3 | Dificil | **Muy alta** | Alta | Mejor para ing. civil, pero grande |
| **nla3d** | MIT | **Si (pequeno)** | Basica | **Baja** | Mas facil de integrar |
| **PolyFEM** | MIT | Posible | Media | Media | Moderno, buena API |

---

## Posible integracion en Hekatan

### Opcion A: `@{fem}` con nla3d (rapido de implementar)
- Armaduras 2D/3D, vigas basicas
- Compilar nla3d a DLL y llamar desde C#
- O compilar a Wasm para version web

### Opcion B: `@{fem}` con MFEM (mas potente)
- Elasticidad 2D/3D, vigas, membranas
- Mas tipos de elementos y analisis
- Mas complejo de integrar pero mas completo

### Opcion C: Wrapper de XC via Python
- Usar `@{python}` con XC ya instalado
- Aprovecha toda la capacidad de XC
- No requiere compilar a Wasm

---

*Fecha de investigacion: 2026-02-25*

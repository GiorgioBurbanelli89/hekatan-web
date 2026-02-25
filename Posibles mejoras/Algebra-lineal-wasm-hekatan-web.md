# Algebra Lineal en Wasm para Hekatan Web

Investigacion de bibliotecas de algebra lineal compiladas a WebAssembly para uso en Hekatan Web (browser).

---

## 1. Eigen-js (RECOMENDADO - listo para usar)

**Port de Eigen C++ a WebAssembly**

- **npm**: `npm install eigen`
- **GitHub**: https://github.com/BertrandBev/eigen-js
- **Licencia**: MPL-2 (Eigen)
- **Tamano**: ~1-2MB el .wasm
- **Estado**: v0.2.2, funcional pero baja actividad

### Operaciones disponibles

- Matrices densas: crear, sumar, multiplicar, inversa, transpuesta
- Descomposiciones: SVD (JacobiSVD, BDCSVD), LU, QR, Cholesky (LLT/LDLT)
- Eigenvalores y eigenvectores
- Resolver sistemas Ax = b (densos y sparse)
- Matrices sparse (CSR)
- Integra OSQP para optimizacion cuadratica

### Ejemplo de uso

```js
import eig from 'eigen';

await eig.ready;

// Crear matriz
const M = new eig.Matrix([[1, 2], [3, 4]]);
M.print("M");

// Inversa
const Minv = M.inverse();
Minv.print("M^-1");

// Resolver Ax = b
const A = new eig.Matrix([[2, 1], [1, 3]]);
const b = new eig.Matrix([[5], [7]]);
// x = A^-1 * b
const x = A.inverse().matMul(b);
x.print("x");

// Limpiar memoria Wasm
eig.GC.flush();
```

### Manejo de memoria

WebAssembly no tiene garbage collector automatico. Eigen-js implementa uno manual:
- `obj.delete()` - liberar un objeto
- `eig.GC.flush()` - liberar todos los objetos acumulados
- `eig.GC.pushException(obj)` - proteger un objeto del flush

### Integracion en Hekatan Web

```html
<!-- En el HTML de Hekatan Web -->
<script type="module">
import eig from './node_modules/eigen/dist/eigen.js';

await eig.ready;

// Disponible para los calculos de Hekatan Web
window.HekatanLinAlg = {
    Matrix: eig.Matrix,
    solve: (A, b) => A.inverse().matMul(b),
    eigenvalues: (M) => { /* wrapper */ },
    GC: eig.GC
};
</script>
```

---

## 2. Eigen C++ compilado directo (mas control)

**Compilar Eigen tu mismo con Emscripten**

- **Web**: https://libeigen.gitlab.io/
- **Licencia**: MPL-2
- Header-only, sin dependencias
- Acceso a TODO Eigen (no solo el subset de eigen-js)

### Ventajas sobre eigen-js

- Puedes exponer solo las funciones que necesitas (wasm mas pequeno)
- Matrices sparse completas (SimplicialLLT, SparseLU, ConjugateGradient, BiCGSTAB)
- SIMD optimizado
- Control total de la API

### Compilar

```bash
# Instalar Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest

# Compilar tu wrapper
emcc -O3 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 \
     -I/path/to/eigen \
     -s EXPORTED_FUNCTIONS="['_solve', '_eigenvalues', '_matmul']" \
     hekatan_linalg.cpp -o hekatan_linalg.js
```

### Ejemplo wrapper C++

```cpp
#include <Eigen/Dense>
#include <Eigen/Sparse>
#include <emscripten/bind.h>

using namespace Eigen;
using namespace emscripten;

// Resolver sistema denso Ax = b
val solveSystem(val aData, val bData, int n) {
    MatrixXd A(n, n);
    VectorXd b(n);
    // Copiar datos desde JS...
    VectorXd x = A.colPivHouseholderQr().solve(b);
    // Retornar resultado a JS...
    return result;
}

// Eigenvalores de matriz simetrica
val eigenvalues(val data, int n) {
    MatrixXd M(n, n);
    // Copiar datos...
    SelfAdjointEigenSolver<MatrixXd> solver(M);
    VectorXd evals = solver.eigenvalues();
    return result;
}

EMSCRIPTEN_BINDINGS(hekatan) {
    function("solveSystem", &solveSystem);
    function("eigenvalues", &eigenvalues);
}
```

---

## 3. Spectra + Eigen (eigenvalores de matrices grandes)

**Ideal para analisis modal y pandeo**

- **GitHub**: https://github.com/yixuan/spectra
- **Licencia**: MPL-2
- Header-only, depende solo de Eigen
- Calcula k eigenvalores de matrices NxN donde k << N
- Soporta matrices sparse

### Caso de uso en ingenieria estructural

```cpp
#include <Spectra/SymEigsSolver.h>
#include <Spectra/MatOp/SparseSymMatProd.h>

// Matriz de rigidez global (sparse)
SparseMatrix<double> K(n, n);
// ... ensamblar K ...

// Calcular 6 primeros modos de vibracion
SparseSymMatProd<double> op(K);
SymEigsSolver<SparseSymMatProd<double>> eigs(op, 6, 20);
eigs.init();
eigs.compute(SortRule::SmallestAlge);

auto frequencies = eigs.eigenvalues();    // frecuencias naturales
auto modeShapes = eigs.eigenvectors();    // formas modales
```

### Compilable a Wasm

Al ser header-only igual que Eigen, compila a Wasm sin problemas:
```bash
emcc -O3 -s WASM=1 \
     -I/path/to/eigen -I/path/to/spectra/include \
     modal_analysis.cpp -o modal_analysis.js
```

---

## 4. nalgebra (Rust - Wasm nativo)

**Alternativa en Rust con soporte Wasm de primera clase**

- **Web**: https://nalgebra.org/
- **Licencia**: Apache-2.0
- Target: `wasm32-unknown-unknown` (nativo, sin Emscripten)
- **Todo funciona en Wasm**: LU, QR, SVD, Cholesky, eigenvalores
- Tamano Wasm: ~300KB-1MB

### Ventajas

- Rust tiene mejor integracion con Wasm que C++
- wasm-bindgen genera bindings JS automaticos
- Sin problemas de memory leaks (Rust ownership)
- SIMD support

---

## 5. stdlib-js (BLAS/LAPACK en JS puro + Wasm)

**Sin compilar nada, funciona directo**

- **npm**: `@stdlib/blas`
- **GitHub**: https://github.com/stdlib-js/blas
- BLAS Level 1, 2, 3 en JavaScript + C + Wasm
- LAPACK en desarrollo (GSoC 2025)
- Rutinas: daxpy, dgemm, dgemv, dtrsv, etc.

### Ventaja

No necesitas compilar nada. Funciona con `<script>` en el browser.

---

## Comparativa

| Biblioteca | Listo para usar | Sparse | Eigenvalores | Tamano | Rendimiento |
|---|---|---|---|---|---|
| **Eigen-js** | Si (npm) | Si | Si | ~1-2MB | Bueno |
| **Eigen directo** | Compilar | Si | Si | ~500KB-2MB | Muy bueno |
| **Spectra+Eigen** | Compilar | Si (grande) | Optimo | ~500KB | Excelente |
| **nalgebra** | Compilar (Rust) | Si | Si | ~300KB-1MB | Muy bueno |
| **stdlib-js** | Si (npm) | No | No | ~200KB | Medio |

---

## Plan de integracion para Hekatan Web

### Fase 1 - Rapido (eigen-js)
1. `npm install eigen`
2. Importar en Hekatan Web
3. Exponer operaciones de matrices como funciones disponibles en el editor
4. Funciona inmediato para matrices densas medianas (hasta ~1000x1000)

### Fase 2 - Potente (Eigen + Spectra compilado)
1. Crear wrapper C++ con las operaciones especificas de Hekatan
2. Compilar con Emscripten a .wasm
3. Matrices sparse grandes + analisis modal
4. Rendimiento industrial en el browser

### Fase 3 - FEA en browser
1. Integrar con MFEM o nla3d (ver FEM-bibliotecas-cpp.md)
2. Analisis de elementos finitos completo en el browser
3. Similar a lo que hace SPARSELAB (https://sparselab.com/)

---

## Referencia: SPARSELAB (caso de exito)

SPARSELAB ya demuestra que FEA en Wasm funciona:
- Motor C++ compilado a WebAssembly
- UI: Svelte + Three.js
- Mallas de millones de elementos
- Rendimiento casi nativo
- Limitacion: Wasm 32-bit (max ~4GB RAM)

---

*Fecha de investigacion: 2026-02-25*

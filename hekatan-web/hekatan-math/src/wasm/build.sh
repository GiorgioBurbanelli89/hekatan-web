#!/bin/bash
# Build Hekatan Eigen WASM module
# Requires: Emscripten (emsdk) + Eigen headers
#
# Usage:
#   cd hekatan-web/hekatan-math/src/wasm
#   bash build.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EIGEN_DIR="$SCRIPT_DIR/eigen"
EMSDK_DIR="$(cd "$SCRIPT_DIR/../../../../emsdk" 2>/dev/null && pwd)"

# Activate emsdk if available
if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    source "$EMSDK_DIR/emsdk_env.sh" 2>/dev/null
fi

# Check emcc
if ! command -v emcc &>/dev/null; then
    echo "ERROR: emcc not found. Install Emscripten:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi

# Download Eigen headers if not present
if [ ! -d "$EIGEN_DIR/Eigen" ]; then
    echo "Downloading Eigen 3.4.0 headers..."
    curl -sL https://gitlab.com/libeigen/eigen/-/archive/3.4.0/eigen-3.4.0.tar.bz2 | tar xj -C "$SCRIPT_DIR"
    mv "$SCRIPT_DIR/eigen-3.4.0" "$EIGEN_DIR"
    echo "Eigen downloaded to $EIGEN_DIR"
fi

mkdir -p "$SCRIPT_DIR/built"

echo "Compiling eigen_sparse.cpp -> WASM..."

emcc "$SCRIPT_DIR/eigen_sparse.cpp" \
    -o "$SCRIPT_DIR/built/eigen_sparse.js" \
    -O3 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_FUNCTIONS=_malloc,_free,_sparse_lu_solve,_sparse_cholesky_solve,_dense_solve,_dense_inverse,_dense_det,_eigenvalues,_eigen_decompose,_svd,_dense_multiply,_sparse_multiply \
    -s EXPORTED_RUNTIME_METHODS=HEAPF64,HEAP32,HEAPU8 \
    -s INITIAL_MEMORY=16777216 \
    -I "$EIGEN_DIR" \
    --no-entry

STATUS=$?
if [ $STATUS -eq 0 ]; then
    WASM_SIZE=$(du -h "$SCRIPT_DIR/built/eigen_sparse.wasm" | cut -f1)
    echo "Build successful! eigen_sparse.wasm ($WASM_SIZE)"
    echo "Files: built/eigen_sparse.js + built/eigen_sparse.wasm"
else
    echo "Build FAILED (exit code $STATUS)"
    exit $STATUS
fi

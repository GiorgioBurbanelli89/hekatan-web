/**
 * Hekatan Eigen WASM — Sparse & Dense Linear Algebra
 *
 * Minimal C++/Eigen module compiled to WebAssembly via Emscripten.
 * Provides sparse solvers (SparseLU, SimplicialLDLT) for large FEM systems
 * and dense operations (solve, inverse, determinant, eigenvalues, SVD, multiply).
 *
 * Build:
 *   emcc eigen_sparse.cpp -o built/eigen_sparse.js -O3 -msimd128 \
 *     -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 \
 *     -s EXPORTED_FUNCTIONS=_malloc,_free,_sparse_lu_solve,_sparse_cholesky_solve,_dense_solve,_dense_inverse,_dense_det,_eigenvalues,_svd,_dense_multiply \
 *     -s EXPORTED_RUNTIME_METHODS=HEAPF64,HEAP32,HEAPU8 \
 *     -I /path/to/eigen
 *
 * All matrices are column-major (Eigen default) passed as flat double arrays.
 * Sparse matrices use COO (triplet) format: rows[], cols[], vals[].
 * Return 0 = success, -1 = failure.
 */

#include <Eigen/Dense>
#include <Eigen/Sparse>
#include <Eigen/SparseLU>
#include <Eigen/SparseCholesky>
#include <Eigen/Eigenvalues>
#include <Eigen/SVD>
#include <cstring>
#include <vector>

extern "C"
{
    /**
     * Sparse LU solve: A·x = b  (general square sparse systems)
     *
     * @param n     Matrix dimension (n×n)
     * @param nnz   Number of non-zero entries
     * @param rows  Row indices    [nnz]
     * @param cols  Column indices [nnz]
     * @param vals  Values         [nnz]
     * @param b     RHS vector     [n]
     * @param x     Solution out   [n]  (caller-allocated)
     * @return 0 on success, -1 on failure
     */
    int sparse_lu_solve(
        int n, int nnz,
        int *rows, int *cols, double *vals,
        double *b, double *x)
    {
        // Build sparse matrix from COO triplets
        std::vector<Eigen::Triplet<double>> triplets;
        triplets.reserve(nnz);
        for (int i = 0; i < nnz; i++)
        {
            triplets.emplace_back(rows[i], cols[i], vals[i]);
        }

        Eigen::SparseMatrix<double> A(n, n);
        A.setFromTriplets(triplets.begin(), triplets.end());

        // Map RHS vector (zero-copy)
        Eigen::Map<Eigen::VectorXd> bVec(b, n);

        // SparseLU with column reordering (COLAMD)
        Eigen::SparseLU<Eigen::SparseMatrix<double>, Eigen::COLAMDOrdering<int>> solver;
        solver.analyzePattern(A);
        solver.factorize(A);
        if (solver.info() != Eigen::Success)
            return -1;

        Eigen::VectorXd result = solver.solve(bVec);
        if (solver.info() != Eigen::Success)
            return -1;

        std::memcpy(x, result.data(), n * sizeof(double));
        return 0;
    }

    /**
     * Sparse Cholesky solve: A·x = b  (symmetric positive definite — FEM stiffness)
     * Faster than SparseLU for SPD matrices (typical FEM K matrices).
     */
    int sparse_cholesky_solve(
        int n, int nnz,
        int *rows, int *cols, double *vals,
        double *b, double *x)
    {
        std::vector<Eigen::Triplet<double>> triplets;
        triplets.reserve(nnz);
        for (int i = 0; i < nnz; i++)
        {
            triplets.emplace_back(rows[i], cols[i], vals[i]);
        }

        Eigen::SparseMatrix<double> A(n, n);
        A.setFromTriplets(triplets.begin(), triplets.end());

        Eigen::Map<Eigen::VectorXd> bVec(b, n);

        // SimplicialLDLT — optimal for SPD sparse matrices
        Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> solver;
        solver.compute(A);
        if (solver.info() != Eigen::Success)
            return -1;

        Eigen::VectorXd result = solver.solve(bVec);
        if (solver.info() != Eigen::Success)
            return -1;

        std::memcpy(x, result.data(), n * sizeof(double));
        return 0;
    }

    /**
     * Dense LU solve: A·x = b  (general dense system, partial pivoting)
     * A is row-major flat array [n*n], b is [n], x is [n].
     */
    int dense_solve(int n, double *A, double *b, double *x)
    {
        // Map as row-major (natural for JS 2D arrays flattened row by row)
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, n, n);
        Eigen::Map<Eigen::VectorXd> bVec(b, n);

        Eigen::VectorXd result = mat.partialPivLu().solve(bVec);

        std::memcpy(x, result.data(), n * sizeof(double));
        return 0;
    }

    /**
     * Dense matrix inverse.
     * A [n*n] row-major in, result [n*n] row-major out.
     */
    int dense_inverse(int n, double *A, double *result)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, n, n);

        if (std::abs(mat.determinant()) < 1e-14)
            return -1;

        Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> inv = mat.inverse();

        std::memcpy(result, inv.data(), n * n * sizeof(double));
        return 0;
    }

    /**
     * Determinant of dense matrix A [n*n] row-major.
     */
    double dense_det(int n, double *A)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, n, n);
        return mat.determinant();
    }

    /**
     * Eigenvalues of dense square matrix A [n*n] row-major.
     * real_out [n] = real parts, imag_out [n] = imaginary parts.
     */
    int eigenvalues(int n, double *A, double *real_out, double *imag_out)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, n, n);

        Eigen::EigenSolver<Eigen::MatrixXd> solver(mat, false); // eigenvalues only
        if (solver.info() != Eigen::Success)
            return -1;

        auto evals = solver.eigenvalues();
        for (int i = 0; i < n; i++)
        {
            real_out[i] = evals(i).real();
            imag_out[i] = evals(i).imag();
        }
        return 0;
    }

    /**
     * Eigenvalues + eigenvectors of dense square matrix A [n*n] row-major.
     * real_out [n], imag_out [n], vectors_out [n*n] row-major (each column = eigenvector).
     */
    int eigen_decompose(int n, double *A, double *real_out, double *imag_out, double *vectors_out)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, n, n);

        Eigen::EigenSolver<Eigen::MatrixXd> solver(mat, true); // with eigenvectors
        if (solver.info() != Eigen::Success)
            return -1;

        auto evals = solver.eigenvalues();
        auto evecs = solver.eigenvectors();
        for (int i = 0; i < n; i++)
        {
            real_out[i] = evals(i).real();
            imag_out[i] = evals(i).imag();
            for (int j = 0; j < n; j++)
            {
                // Store eigenvectors row-major: vectors_out[j*n + i] = evecs(j, i).real()
                vectors_out[j * n + i] = evecs(j, i).real();
            }
        }
        return 0;
    }

    /**
     * SVD: A = U · diag(S) · V^T
     * A [m*n] row-major, U [m*m] out, S [min(m,n)] out, V [n*n] out (all row-major).
     */
    int svd(int m, int n, double *A, double *U_out, double *S_out, double *V_out)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> mat(A, m, n);

        Eigen::JacobiSVD<Eigen::MatrixXd> solver(mat, Eigen::ComputeFullU | Eigen::ComputeFullV);

        // U [m×m]
        Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> U = solver.matrixU();
        std::memcpy(U_out, U.data(), m * m * sizeof(double));

        // S [min(m,n)]
        int k = std::min(m, n);
        auto S = solver.singularValues();
        std::memcpy(S_out, S.data(), k * sizeof(double));

        // V [n×n]
        Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> V = solver.matrixV();
        std::memcpy(V_out, V.data(), n * n * sizeof(double));

        return 0;
    }

    /**
     * Dense matrix multiply: C = A · B
     * A [m*k] row-major, B [k*n] row-major, C [m*n] row-major out.
     */
    void dense_multiply(int m, int k, int n, double *A, double *B, double *C)
    {
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> matA(A, m, k);
        Eigen::Map<Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> matB(B, k, n);
        Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> result = matA * matB;
        std::memcpy(C, result.data(), m * n * sizeof(double));
    }

    /**
     * Sparse matrix-vector multiply: y = A · x
     * A in COO format, x [n], y [m] out.
     */
    void sparse_multiply(
        int m, int n, int nnz,
        int *rows, int *cols, double *vals,
        double *x_in, double *y_out)
    {
        std::vector<Eigen::Triplet<double>> triplets;
        triplets.reserve(nnz);
        for (int i = 0; i < nnz; i++)
        {
            triplets.emplace_back(rows[i], cols[i], vals[i]);
        }

        Eigen::SparseMatrix<double> A(m, n);
        A.setFromTriplets(triplets.begin(), triplets.end());

        Eigen::Map<Eigen::VectorXd> xVec(x_in, n);
        Eigen::VectorXd result = A * xVec;

        std::memcpy(y_out, result.data(), m * sizeof(double));
    }
}

# Spec: Sparse Matrix Operations for WebAssembly (Phase 1)

**Status:** Approved  
**Initiative:** Sparse Matrix Operations for WebAssembly  
**Standard:** EARS (Easy Approach to Requirements Syntax)  
**Target:** WebAssembly (Emscripten) C++ Export  

---

## 1. Overview & Architectural Scope

This specification defines Phase 1 of Sparse Matrix operations for `eigen-wasm`. It establishes standard representations, conversion routines, basic arithmetic, and products for sparse linear algebra in WebAssembly using Eigen's `Eigen::SparseMatrix` template family.

All routines are exposed as pure C functions with `EMSCRIPTEN_KEEPALIVE` and `extern "C"`. Memory allocation is strictly caller-managed: caller provides buffers allocated via `Module._malloc()` and frees them via `Module._free()`.

### Canonical Data Representations

1. **Compressed Sparse Storage (CSC / CSR)**:
   - `values`: contiguous array of `double` (size `nnz`).
   - `innerIndices`: contiguous array of `int32_t` (size `nnz`) storing row indices (for CSC) or column indices (for CSR).
   - `outerStarts`: contiguous array of `int32_t` (size `outerSize + 1`) storing start offsets. For CSC, `outerSize = cols`; for CSR, `outerSize = rows`.
   - `storageOrder`: `0` for CSC (Column-Major, Eigen default), `1` for CSR (Row-Major).

2. **Coordinate Format (Triplet / COO)**:
   - Three contiguous parallel arrays: `rows` (`int32_t*`), `cols` (`int32_t*`), `values` (`double*`), of length `tripletCount`.
   - Used for initial matrix assembly; duplicate coordinates are summed automatically, matching `Eigen::SparseMatrix::setFromTriplets()`.

3. **Status Codes (`ComputationInfo`)**:
   - `0` (`Success`): Routine executed and valid output written.
   - `1` (`NumericalIssue`): Decomposition or numeric instability detected.
   - `2` (`NoConvergence`): Iterative process did not converge.
   - `3` (`InvalidInput`): Invalid arguments (null pointers, bounds violation, non-monotonic outer pointers, dimension mismatch).

---

## 2. ABI Function Declarations

```c
// Conversion & Assembly
int sparseFromTriplets(
    int rows, int cols, int tripletCount,
    const int* tripletRows, const int* tripletCols, const double* tripletValues,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts, int* outNnz
);

// Sparse-Dense Matrix-Vector Product: y = A * x
int sparseMatMulVec(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const const int* aOuterStarts,
    int storageOrder,
    const double* x, double* outY
);

// Sparse-Dense Matrix-Matrix Product: C = A * B (B and C dense, row-major)
int sparseMatMulDense(
    int rowsA, int colsA, int colsB, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    const double* b, double* outC
);

// Sparse Addition: C = A + B (Two-Pass Query & Execution)
int sparseAddGetNnz(
    int rows, int cols,
    int nnzA, const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int nnzB, const double* bValues, const int* bInnerIndices, const int* bOuterStarts,
    int storageOrder,
    int* outNnz
);

int sparseAdd(
    int rows, int cols,
    int nnzA, const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int nnzB, const double* bValues, const int* bInnerIndices, const int* bOuterStarts,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts
);

// Sparse Scalar Multiplication: B = alpha * A
int sparseScale(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    double alpha,
    double* outValues, int* outInnerIndices, int* outOuterStarts
);

// Sparse Transposition: B = A^T
int sparseTranspose(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts
);
```

---

## 3. EARS Requirements Specification

### Group 1: Triplet Assembly & Compression (`sparseFromTriplets`)

- **REQ-SP-001 (Ubiquitous):**  
  The system shall assemble a compressed sparse matrix (CSC or CSR) from input coordinate triplets (`tripletRows`, `tripletCols`, `tripletValues`).
- **REQ-SP-002 (Event-driven):**  
  When coordinate triplets contain duplicate entries with identical `(row, col)`, the system shall sum their corresponding values into a single non-zero entry.
- **REQ-SP-003 (Event-driven):**  
  When `storageOrder == 0`, the system shall emit compressed column pointers into `outOuterStarts` with size `cols + 1` and row indices into `outInnerIndices`.
- **REQ-SP-004 (Event-driven):**  
  When `storageOrder == 1`, the system shall emit compressed row pointers into `outOuterStarts` with size `rows + 1` and column indices into `outInnerIndices`.
- **REQ-SP-005 (Event-driven):**  
  When assembly finishes successfully, the system shall write the total unique non-zero count into `outNnz` and return `0` (`Success`).
- **REQ-SP-006 (Unwanted-behavior):**  
  If any pointer argument is null, or `rows <= 0`, or `cols <= 0`, or `tripletCount < 0`, or `storageOrder` is neither `0` nor `1`, then the system shall return `3` (`InvalidInput`) and leave output buffers untouched.
- **REQ-SP-007 (Unwanted-behavior):**  
  If any triplet has `row < 0`, `row >= rows`, `col < 0`, or `col >= cols`, then the system shall return `3` (`InvalidInput`) and leave output buffers untouched.

### Group 2: Sparse-Dense Matrix-Vector Product (`sparseMatMulVec`)

- **REQ-SP-010 (Ubiquitous):**  
  The system shall compute the matrix-vector product `y = A * x` where `A` is a sparse matrix and `x, y` are dense vectors.
- **REQ-SP-011 (Event-driven):**  
  When `sparseMatMulVec` is invoked with valid arguments, the system shall compute `y[i] = sum(A[i, j] * x[j])` for each row `i` and return `0` (`Success`).
- **REQ-SP-012 (State-driven):**  
  While evaluating `sparseMatMulVec`, the system shall accept `storageOrder == 0` (CSC) or `storageOrder == 1` (CSR).
- **REQ-SP-013 (Unwanted-behavior):**  
  If any pointer (`aValues`, `aInnerIndices`, `aOuterStarts`, `x`, `outY`) is null, or `rows <= 0`, or `cols <= 0`, or `nnz < 0`, or `nnz > rows * cols`, then the system shall return `3` (`InvalidInput`) and preserve `outY` untouched.
- **REQ-SP-014 (Unwanted-behavior):**  
  If `aOuterStarts[0] != 0` or `aOuterStarts[outerSize] != nnz`, or `aOuterStarts` is non-monotonic, then the system shall return `3` (`InvalidInput`) and preserve `outY` untouched.

### Group 3: Sparse-Dense Matrix Product (`sparseMatMulDense`)

- **REQ-SP-020 (Ubiquitous):**  
  The system shall compute the product `C = A * B` where `A` is sparse (`rowsA` by `colsA`), `B` is row-major dense (`colsA` by `colsB`), and `C` is row-major dense (`rowsA` by `colsB`).
- **REQ-SP-021 (Event-driven):**  
  When `sparseMatMulDense` executes with valid inputs, the system shall write the dense result to `outC` and return `0` (`Success`).
- **REQ-SP-022 (Unwanted-behavior):**  
  If any pointer is null, or `rowsA <= 0`, `colsA <= 0`, `colsB <= 0`, `nnz < 0`, or `storageOrder` is invalid, then the system shall return `3` (`InvalidInput`) and preserve `outC` untouched.

### Group 4: Sparse Addition (`sparseAddGetNnz` & `sparseAdd`)

- **REQ-SP-030 (Ubiquitous):**  
  The system shall compute the sum `C = A + B` of two sparse matrices having identical dimensions (`rows`, `cols`) and matching `storageOrder`.
- **REQ-SP-031 (Event-driven):**  
  When `sparseAddGetNnz` is called, the system shall compute the exact non-zero count of `A + B`, write it to `outNnz`, and return `0` (`Success`).
- **REQ-SP-032 (Event-driven):**  
  When `sparseAdd` is called with pre-allocated buffers sized according to `outNnz`, the system shall write the resulting `outValues`, `outInnerIndices`, and `outOuterStarts`, and return `0` (`Success`).
- **REQ-SP-033 (Unwanted-behavior):**  
  If any pointer is null, or dimensions do not match, or outer pointer invariants are violated, then the system shall return `3` (`InvalidInput`) and preserve all output buffers untouched.

### Group 5: Sparse Scalar Multiplication (`sparseScale`)

- **REQ-SP-040 (Ubiquitous):**  
  The system shall compute `B = alpha * A` preserving the sparsity pattern of `A`.
- **REQ-SP-041 (Event-driven):**  
  When `sparseScale` executes with valid inputs, the system shall copy `innerIndices` and `outerStarts` to the output buffers, scale each entry in `values` by `alpha`, and return `0` (`Success`).
- **REQ-SP-042 (Optional-feature):**  
  Where `outValues` aliases `aValues`, `outInnerIndices` aliases `aInnerIndices`, and `outOuterStarts` aliases `aOuterStarts`, the system shall perform in-place scaling safely.
- **REQ-SP-043 (Unwanted-behavior):**  
  If any required pointer is null, or `rows <= 0`, `cols <= 0`, `nnz < 0`, then the system shall return `3` (`InvalidInput`) and preserve output buffers untouched.

### Group 6: Sparse Transposition (`sparseTranspose`)

- **REQ-SP-050 (Ubiquitous):**  
  The system shall compute `B = A^T` swapping dimensions `rows` and `cols` with identical `nnz`.
- **REQ-SP-051 (Event-driven):**  
  When `sparseTranspose` is invoked on a CSC matrix (`storageOrder == 0`), the system shall produce a valid CSC matrix of dimensions `cols` by `rows` and return `0` (`Success`).
- **REQ-SP-052 (Unwanted-behavior):**  
  If any required pointer is null, or buffer parameters are invalid, then the system shall return `3` (`InvalidInput`) and leave output buffers untouched.

### Group 7: Dimension Limits & Safety Invariants

- **REQ-SP-060 (Ubiquitous):**  
  The system shall support matrix dimensions up to `1,000,000` rows and columns, and up to `10,000,000` non-zeros, bounded only by the 4 GB WebAssembly heap limit.
- **REQ-SP-061 (Unwanted-behavior):**  
  If `rows > 1000000` or `cols > 1000000` or `nnz > 10000000`, then the system shall return `3` (`InvalidInput`) and preserve output buffers untouched.
- **REQ-SP-062 (Ubiquitous):**  
  The system shall never throw unhandled C++ exceptions across the WASM boundary; all internal exceptions (e.g. `std::bad_alloc`) shall be caught and converted to `1` (`NumericalIssue`) or `3` (`InvalidInput`).

---

## 4. Upstream C++ Test Adaptation Mapping

Using `graphify` and upstream Eigen tests under `deps/eigen/test/`:

| Routine | Upstream C++ Test Suite | Node.js Test Suite Target |
|---|---|---|
| `sparseFromTriplets` | `deps/eigen/test/sparse_basic.cpp` | `test/test_sparse_triplets.js` |
| `sparseMatMulVec` | `deps/eigen/test/sparse_product.cpp` | `test/test_sparse_spmv.js` |
| `sparseMatMulDense` | `deps/eigen/test/sparse_product.cpp` | `test/test_sparse_spmm.js` |
| `sparseAddGetNnz`, `sparseAdd` | `deps/eigen/test/sparse_basic.cpp` | `test/test_sparse_add.js` |
| `sparseScale` | `deps/eigen/test/sparse_basic.cpp` | `test/test_sparse_ops.js` |
| `sparseTranspose` | `deps/eigen/test/sparse_basic.cpp` | `test/test_sparse_ops.js` |
| Bounds & Invalid Input | `deps/eigen/test/sparse_basic.cpp` | `test/test_sparse_validation.js` |

---

## 5. Implementation & Ticket Decomposition Plan

- **Ticket 023:** Sparse Data Types, Header `src/sparse_wasm.hpp`, and Triplet Assembly (`sparseFromTriplets`).
- **Ticket 024:** Sparse Matrix-Vector Product (`sparseMatMulVec`) and Sparse-Dense Product (`sparseMatMulDense`).
- **Ticket 025:** Sparse Matrix Addition via Two-Pass Query (`sparseAddGetNnz` and `sparseAdd`).
- **Ticket 026:** Sparse Scalar Scaling (`sparseScale`) and Transposition (`sparseTranspose`).
- **Ticket 027:** Comprehensive Integrity Validation, Untouched Invariants, and Build Integration.

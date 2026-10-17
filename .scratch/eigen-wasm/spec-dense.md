# Eigen WASM: Dense Routines Spec

Objective: expose the dense linear algebra of Eigen to JavaScript callers over WebAssembly,
so a caller can compute determinants, inverses, factorizations, solutions and spectral
decompositions without shipping a native numeric stack.

This spec supersedes the MVP scope recorded in `.scratch/eigen-wasm/issues/`. It assumes the
MVP already delivered: an Emscripten build of a single C++ translation unit exporting
`matMul3x3` over raw row-major pointers, a Node test suite, and a GitHub Actions job.

## Terms

These are canonical for the WASM surface. They are added to `.scratch/eigen-wasm/GLOSSARY.md`.

**Dense routine**: one exported function that computes one mathematical object, taking a
matrix or vector in WASM memory and writing its result into caller-provided buffers. It is
identified by the object it produces, not by the Eigen class it uses.

**Factorization**: a decomposition that may fail to exist. Cholesky of a matrix that is not
positive definite, or QR that is handed a matrix it cannot reflect, produce no result. The
contract must say so.

**Solution**: the vector or matrix x satisfying A x = b. Distinct from a factorization
because it has its own failure condition: a singular or rank-deficient A has no unique
solution.

**Spectral decomposition**: a factorization that produces both values and vectors. Singular
values and U, V for SVD; eigenvalues and eigenvectors for the eigensolvers.

**Reduction**: a computation whose output is a scalar or a short vector. Determinant, rank,
trace. Cannot "fail" in the way a factorization can.

**ComputationInfo**: the enum Eigen already uses to report whether a decomposition succeeded.
Four values: `Success`, `NumericalIssue`, `NoConvergence`, `InvalidInput`. The WASM surface
exposes this enum rather than inventing its own, so that a failure a caller can see is the
same failure the Eigen test suite asserts on.

**Residual**: for a claimed solution or factorization, the norm of the difference between the
claimed result and the result re-derived from it. `||L L^T - A||` for Cholesky,
`||A x - b||` for a solve. A residual is the verification available when no independent
expected value exists.

## Problem Statement

A caller who wants determinant, inverse, LU solve, QR, Cholesky or SVD in the browser has no
way to get them from this module. The module exports exactly one function, `matMul3x3`, which
is the one dense operation whose result can be written out as nine hand-computed numbers.
Everything else is unavailable, so the module cannot be used for any real linear algebra.

The obstacle is not that the algorithms are missing. Every factorization wanted here is
header-only and reachable from the `Eigen/Dense` umbrella header with no external library:
no BLAS, no LAPACK, no SuiteSparse. The obstacle is that the C surface, the error contract
and the verification strategy were designed for one operation and do not generalize.

Three specific gaps block expansion today:

- The build invokes `emcc`, which links no C++ runtime. `matMul3x3` survives only because a
  3x3 product touches no libstdc++ symbol. Any decomposition fails at link time on
  `__cxa_allocate_exception`. This is already fixed; the spec records it because every
  routine below depends on it.

- A null pointer passed to `matMul3x3` causes a silent write near address zero. The module
  does not trap and stays alive. With a single fixed-size operation this is a caller mistake
  with one signature. With dynamic sizes and a dozen routines it becomes an API that cannot
  report its own misuse.

- No routine reports whether it succeeded. A singular matrix and a valid one both produce
  plausible output.

## Solution

Expose the dense routines as one exported function per mathematical object, taking dynamic
dimensions, returning `int` carrying Eigen's own `ComputationInfo`, and validating its own
preconditions.

Caller-allocated buffers, as today. JS allocates through the exported `_malloc`, fills via
`setValue`, and reads via `getValue`. Typed-array heap views are not used, because
`ALLOW_MEMORY_GROWTH` detaches them on growth.

Dynamic sizes, not fixed 3x3. Dimensions are parameters. `EIGEN_TEST_MAX_SIZE` in the Eigen
test suite is 320, and the ceiling this spec applies is 255 because 320 traps on this target. The
reference suite's cases are transferable up to 255. See "Sizes" for the measurement.

Verification in three layers, because no single layer covers everything:

1. **Independent literals**, where they exist. The Eigen suite constructs exact expected
   values for the spectral routines: companion and Jordan matrices for the Schur solver,
   polynomial roots for the generic eigensolver, graded singular values for bidiagonalization,
   prescribed singular values for pivoted QR. Those matrices and values transfer directly.

2. **Residual checks**, where no independent value exists. LU and Cholesky have no expected-value
   table in the Eigen suite either; it verifies `L L^T == A` and `A x == b`. The same
   identities apply. The residual is exported and compared in JS, not computed in C++ and
   returned as a boolean, so a failure reaches the caller with the numbers that produced it.

3. **Contract checks** on the error channel: null pointers, zero and negative dimensions,
   non-square input to a square-only routine, and the failure codes themselves.

## User Stories

1. As a JavaScript caller, I want the determinant of an n-by-n matrix, so that I can test singularity or scale without implementing elimination.
2. As a JavaScript caller, I want the inverse of an n-by-n matrix, so that I can solve systems by forming the inverse once.
3. As a JavaScript caller, I want to solve A x = b by LU, so that I can invert a matrix I factor repeatedly.
4. As a JavaScript caller, I want to solve A x = b by Cholesky, so that I can exploit symmetry when I know the matrix is positive definite.
5. As a JavaScript caller, I want the Cholesky factor L of a symmetric positive definite matrix, so that I can use the factor for multiple right-hand sides.
6. As a JavaScript caller, I want the LDL^T factor of a symmetric matrix, so that I can handle a semidefinite matrix that LLT refuses.
7. As a JavaScript caller, I want an LDL^T factor with pivoting for a symmetric indefinite matrix, so that I am not restricted to positive definite input.
8. As a JavaScript caller, I want a QR factorization, so that I can solve a least-squares system without forming normal equations.
9. As a JavaScript caller, I want the column-pivoted QR factorization with its rank and column permutation, so that I can detect rank deficiency.
10. As a JavaScript caller, I want the singular values and singular vectors from an SVD, so that I can do low-rank approximation and pseudoinversion.
11. As a JavaScript caller, I want the eigenvalues and eigenvectors of a symmetric matrix, so that I can analyse a quadratic form.
12. As a JavaScript caller, I want the eigenvalues and eigenvectors of a general real matrix, so that I can analyse a non-symmetric system.
13. As a JavaScript caller, I want the singular values only, without the vectors, so that I can get the spectrum cheaply when that is all I need.
14. As a JavaScript caller, I want the rank of a matrix, so that I can decide whether a system is solvable.
15. As a JavaScript caller, I want to know which routines failed and why, so that I do not act on a result that was never computed.
16. As a JavaScript caller, I want a null pointer to be rejected rather than silently dereferenced, so that a wiring mistake surfaces as an error instead of corrupted memory.
17. As a JavaScript caller, I want a non-square matrix to be rejected by the square-only routines, so that the failure is a message rather than a wrong answer.
18. As a JavaScript caller, I want zero and negative dimensions rejected, so that I cannot request a nonsensical buffer.
19. As a JavaScript caller, I want a singular matrix reported as such, so that I do not trust the solution buffer after a failed solve.
20. As a JavaScript caller, I want a non-positive-definite matrix reported by the Cholesky routine, so that I fall back to LDL^T.
21. As a JavaScript caller, I want a routine that failed not to write to my output buffers, so that stale contents are never mistaken for a result.
22. As a JavaScript caller, I want buffers of my choosing as output, so that I control lifetime and can reuse one allocation across calls.
23. As a JavaScript caller, I want to know the buffer size a routine requires before I allocate, so that I do not have to guess.
24. As a JavaScript caller, I want row-major layout, consistent with the existing product, so that I do not maintain two conventions.
25. As a JavaScript caller, I want the module small enough to download on a mobile connection, so that the library is usable at all.
26. As a JavaScript caller, I want the existing `matMul3x3` to keep working unchanged, so that my current code does not break.
27. As a maintainer, I want each routine to be one exported function returning one `ComputationInfo`, so that the surface is predictable.
28. As a maintainer, I want the error vocabulary to be Eigen's, so that documentation written about the Eigen API describes this surface too.
29. As a maintainer, I want the module's size attributable per routine, so that I can defend each addition against a size budget.
30. As a maintainer, I want the build to stay under GitHub Actions, so that the suite is a gate rather than a claim.
31. As a maintainer, I want Cholesky and LU verified by the same identities the Eigen suite uses, so that a passing test here means the same thing as a passing test upstream.
32. As a maintainer, I want the spectral routines verified against the exact matrices the Eigen suite constructs, so that equivalence is demonstrable rather than asserted.
33. As a maintainer, I want a test to fail if a routine's output layout changes, so that a silent API break is caught.
34. As a maintainer, I want the module to build from a clean checkout with one command, so that CI and my laptop run the same thing.
35. As a maintainer, I want to know which routines are header-only and need no external library, so that adding one does not silently introduce a dependency.
36. As a maintainer, I want matrix generation to stay in C++ where Eigen's own generators work, so that verification is not limited to matrices I can construct in JavaScript.
37. As a maintainer, I want the ceiling on matrix size to match the reference suite, so that reference cases transfer without reinterpretation.

## Implementation Decisions

### Routine granularity

One exported function per mathematical object, not per Eigen class and not per component.
Roughly a dozen functions, covering determinant, inverse, LU solve, Cholesky, LDL^T,
pivoted LDL^T, QR, pivoted QR with rank, SVD, symmetric eigen, general eigen, and rank.

`svd3(a, u, s, vt)` rather than `svdU`, `svdS`, `svdV`. The caller asks for what the
decomposition produces. Splitting by component multiplies the surface without adding
capability, and the size cost of instantiating the decomposition is paid once either way.

Inverse and LU solve are both exported even though one subsumes the other. A caller who
needs the inverse repeatedly should form it once rather than refactor per solve, and a caller
who needs one solve should not pay for a factorization it will not reuse.

### Eigen classes

Header-only throughout, no external library, all reachable from the `Eigen/Dense` umbrella:
FullPivLU, LLT, LDLT, BunchKaufman, HouseholderQR, ColPivHouseholderQR, JacobiSVD,
SelfAdjointEigenSolver, EigenSolver over RealSchur.

All fourteen candidate classes expose a public `info()` returning `ComputationInfo`,
including the two SVD classes, which inherit it from their shared base rather than declaring
it. That is what makes a uniform error contract possible without special cases.

### Error contract

Every routine returns `int`, carrying `ComputationInfo` verbatim. The four values are
`Success`, `NumericalIssue`, `NoConvergence`, and `InvalidInput`. No mapping, no negative
codes, no reinterpretation.

`InvalidInput` is the fourth value and matters more than it first appears. It is what the
SVD classes return for non-finite input, and it is what a default-constructed LDL^T reports.
It is the value that means "the caller gave me something I cannot even attempt", and it is
distinguishable from "I attempted and it went wrong".

A routine that does not return `Success` must not have written to any output buffer. A caller
holding a stale buffer must never be able to mistake it for a result.

The routine validates its own preconditions before touching Eigen: null pointers, zero and
negative dimensions, and non-square input to a square-only routine. It returns `InvalidInput`
for each. This is the fix for the existing null-pointer defect, and it is not optional at
this size: with dynamic dimensions a caller can no longer infer a mistake from the signature.

The `eigen_assert` mechanism is not available as the guard. `-O3` defines `NDEBUG`, which
compiles assertions out. That is why the guard is explicit code rather than an assertion.

### Memory and layout

Row-major throughout, consistent with the existing product and with the JS-side convention
of reading coefficients linearly.

Caller-allocated buffers, unchanged. The module exports `_malloc` and `_free` and does not
manage buffers itself.

All `_malloc`, `_free` and `setValue`/`getValue` access stays. Retained typed-array views are
forbidden because `ALLOW_MEMORY_GROWTH` detaches them when the heap grows.

### Sizes

Dynamic, dimensions passed as parameters, maximum 255. The Eigen test suite's `EIGEN_TEST_MAX_SIZE` is
320, and 320 is the number this spec originally adopted so that reference cases would transfer without
reinterpretation. Measurement on this target contradicts it. At dimension 256 and above, the blocked LU
behind `determinant()` raises its block size from 16 to 32 and its nested panel update reads out of
bounds. Reproduced across six matrix shapes, four decompositions and six optimisation levels;
`INITIAL_MEMORY`, `STACK_SIZE` and address sanitisation do not change the boundary. 255 computes, 256
traps every time.

The ceiling is therefore 255, and it is enforced in the wrapper rather than in Eigen, which is frozen.
What the guard buys is the difference between a call that is rejected and an instance that dies. A trap in
WebAssembly is not a return value: it ends the module and leaves the caller's buffers in a state nobody
reported. Every routine takes the same guard, so this one finding constrains all of them.

The cost of the divergence is that reference cases sized between 256 and 320 cannot transfer directly. The
practical effect is small, since the Eigen suite draws its sizes from a random source and rarely produces
them, but the reason for deviating is recorded here rather than left to be rediscovered.

### Verification architecture

Three layers, matching the three test seams.

**Independent literals** where the Eigen suite constructs them. The Schur companion and
Jordan matrices, the polynomial-root eigenvalues of the generic eigensolver, the graded
singular values, and the prescribed-singular-value matrices for pivoted QR.

**Residual checks** where the Eigen suite itself has no literal, which is LU, Cholesky, LDL^T
and the geometry routines. The Eigen suite verifies these by round-trip identity, and so does
this. The residual is computed and exported; JS compares it against a threshold and prints the
numbers. It is not computed in C++ and returned as a boolean, because a boolean that arrives
at the caller as `0` names nothing.

**Contract checks** on the error channel itself: that each failure mode produces its
specified `ComputationInfo`, that a failed routine leaves output buffers untouched, and that
each routine writes the output layout it documents.

Relative comparison uses the Eigen formulas rather than a JS approximation: a difference
passes when it is at most the smaller magnitude times the precision, and a residual passes
when it is at most the reference magnitude times the precision. Precision for double is 1e-6,
matching the reference suite. The comparison requires both operands finite; a NaN result
fails rather than passing.

### Matrix generation stays in C++

The Eigen suite's matrix generators build on `std::rand`. The C library on the Emscripten
target is musl, whose `rand` differs from the host libc. Matrices generated by the upstream
suite and matrices generated inside the module are therefore different matrices even at the
same seed.

Verification is not weakened by this, because generation and decomposition both happen inside
the module and only the comparison happens in JS. The suite seeds the module explicitly so a
run is reproducible, which the upstream suite does not guarantee: its ctest invocation passes
no seed, and its matrix dimensions are themselves drawn from the same random source, so an
upstream run is not reproducible without setting the seed by hand.

Generating matrices in JS instead would require reimplementing Householder QR in JavaScript
to build the partial-isometry inputs the spectral tests rely on. That would put the
implementation under test and the reference for the test in the same code.

### Binary size

Measured with the current build flags, at fixed 3x3 instantiations. Whole-module totals, and
each module's contribution:

| Module | gzip | note |
|---|---|---|
| Core only, product | 0.4 KB | current |
| Cholesky | 2.6 KB | LLT, LDLT, BunchKaufman |
| Geometry | 6.3 KB | |
| Eigenvalues | 28.7 KB | |
| QR | 28 KB | FullPivHouseholderQR is most of it |
| SVD | 98 KB | JacobiSVD is negligible next to BDCSVD |
| Whole `Eigen/Dense` | 134 KB | |

The allocator accounts for roughly 2.9 KB gzipped of the current 7.6 KB binary. The Eigen
arithmetic itself is under 1 KB, so the shipped binary is dominated by the memory allocator
rather than by the numerics.

BDCSVD is the single largest lever. It is most of the SVD cost and most of the whole-module
cost. JacobiSVD alone costs almost nothing by comparison. If the size budget requires a cut,
BDCSVD is the cut, and the JacobiSVD-based SVD is retained.

No `-Oz` or `-flto` was measured. The ranking above holds for the flags in use; the ranking
under size-optimizing flags is inferred, not measured.

### Unchanged

`matMul3x3` keeps its signature, its aliasing guarantee and its tests. The aliasing contract
stays pinned by test, because it rests on Eigen evaluating the product into a temporary before
storing into the output, which is an evaluator implementation detail.

`em++` remains the compiler and is not configurable. `EXPORT_ES6`, `MODULARIZE` and
`ALLOW_MEMORY_GROWTH` remain set. The example remains a file the test suite executes rather
than a snippet in the README.

## Testing Decisions

A good test here exercises only the exported C surface and only the exported C surface, which
is also the highest available seam: the artifact is a list of exports, so nothing above that
seam exists to test. No test touches `Eigen::Map`, no Eigen type, or any Eigen header
directly. A test that passes while the wrapper misreads a coefficient is a bad test, which is
why the aliasing and layout cases assert on the exact numbers rather than on a residual.

Three seams:

1. **The exported ABI.** Contract of every routine: argument validity, dimensions, output
   layout, return value. This is also where the `matMul3x3` regression tests live.

2. **Exported residuals.** Correctness of a factorization or solution, where no independent
   expected value exists.

3. **Independent literals.** Exact correctness where a constructed value exists. Literal and
   hand-computed, never recomputed by the code under test.

Prior art is the Eigen suite itself, and the intent is that a passing test here asserts the
same property a passing test upstream asserts.

- The Schur tests construct companion and Jordan matrices and compare against analytically
  known results. Transfer those matrices and values.
- The generic eigensolver tests construct matrices as companions of polynomials and compare
  against the polynomial's known roots, independent of any solver. Transfer.
- The bidiagonalization tests use graded singular values in a fixed geometric progression.
  Transfer.
- The pivoted QR tests build matrices with prescribed singular values to pin rank detection.
  Transfer.
- The LU, Cholesky and LDL^T tests verify round-trip identities rather than comparing against
  a table, because no table exists. Apply the same identities through the residual seam.
- The geometry tests verify identities as well. Apply the same treatment if geometry is
  exposed.

The failure paths are tested directly, because the contract claims specific codes:
Cholesky of a non-positive-definite matrix reports `NumericalIssue`, matching the reference
suite's assertion. A non-finite input to the SVD routines reports `InvalidInput`. An
exhausted iteration budget in the Schur solver reports `NoConvergence`, and the Eigen suite
asserts the same value on the same condition.

A routine that reports a failure must leave its output buffers untouched, and there is a test
for that per routine, because it is the property that makes a failure safe for a caller.

Every routine gets a mutated implementation at least once, and the test must go red. The
precedent is the aliasing mutation: replacing a correct product with a naive loop that reads
its inputs in place, and confirming that the aliasing cases fail while the separate-buffer
cases pass. A test that cannot fail constrains nothing.

Sizes are exercised at the boundaries: 1, 2, 3, and the maximum, and at least one
non-square case for the rectangular-capable routines. The reference suite draws sizes from a
random source; this suite states them, so a failure is reproducible.

## Out of Scope

Sparse matrices and every sparse solver. The measured cost is 58 KB gzipped with little
overlap against Dense, and the non-goal in the MVP spec stands.

Complex scalars. Two spectral classes require a real scalar, so a complex surface would be a
partial and confusing one.

Float and custom scalars. Every routine here is instantiated for double only.

Non-linear optimization, automatic differentiation, FFT, matrix functions, splines,
polynomials and the remaining `unsupported/` and `contrib/` modules.

Geometry as a first-class surface. Its cost is small, but it is a group of operations rather
than linear algebra, and it should be a separate decision rather than folded into this one.

Browser-side execution tests. The module is built for the browser and tested under Node.
Closing that gap is a separate piece of work and is not claimed here.

A benchmark harness, and any claim about performance relative to native Eigen.

Editing anything under `Eigen/`, `test/`, `ci/` or `.gitlab-ci.yml`. That code is frozen
upstream; this work reads it and never writes it.

## Further Notes

The error vocabulary was chosen to avoid inventing a translation layer. Eigen already
distinguishes a factorisation that does not exist from one that failed to converge, and its
entire test suite depends on that distinction. Mapping those onto locally invented codes
would discard information that already exists and is already tested.

The allocation cost is worth revisiting separately. At roughly 2.9 KB gzipped, the allocator
is a larger share of the shipped binary than the numerics, and it grows with every routine
added only because more output buffers are needed. A fixed buffer pool owned by the module
would remove the caller-visible allocation problem and the unbounded-growth hazard that
`ALLOW_MEMORY_GROWTH` creates. That is a different API contract and was not decided here.

The size figures were measured at fixed 3x3 instantiations. Dynamic-size instantiations will
shift them, most likely upward, and were not measured. A build at the dimension ceiling is also
unmeasured and should be, before the size table is quoted as a budget.
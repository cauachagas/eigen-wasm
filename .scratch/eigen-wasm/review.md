```json
[
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 185,
      "summary": "matMul does not verify A.cols == B.rows before multiplication",
      "failure_scenario": "Caller passes A 2x3 and B 2x2 with rowsA=2 colsA=3 colsB=2. The function maps A as 2x3 and B as 3x2 (colsA rows 
  for B) even though B only contains 4 doubles. Eigen then reads past the B allocation while computing A*B, causing an out-of-bounds 
  read/trap and undefined output instead of InvalidInput."
    },
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 145,
      "summary": "QR R matrix constructed from triangularView leaves lower triangle uninitialized",
      "failure_scenario": "RowMajorMatrix R = householderQr.matrixQR().template triangularView<Eigen::Upper>() copies only the view into a
  default-constructed matrix. Lower-triangular entries of R are left uninitialized, so the caller receives garbage in R[i,j] for i>j.
  Reconstruction Q*R and downstream residuals become non-deterministic."
    },
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 164,
      "summary": "solveLeastSquares does not validate b length matches rows",
      "failure_scenario": "Caller supplies a rows x cols matrix A and a b pointer whose allocation is shorter than rows. The Map<const
  Eigen::VectorXd> rhs(b, rows) and householderQr.solve(rhs) read past the b buffer, causing out-of-bounds memory access and a possible WASM
  trap instead of rejecting the call."
    },
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 111,
      "summary": "Cholesky symmetry check uses an absolute 1e-12 guard combined with relative 1e-6 tolerance",
      "failure_scenario": "A symmetric positive-definite matrix with entries near zero, e.g. a[i,j]=a[j,i]=1e-13, yields diff=0 but
  mag=1e-13. The test diff>1e-12 && diff>mag*1e-6 is false, so it passes. With tiny round-off asymmetry of 2e-13, diff>1e-12 becomes true
  and the matrix is rejected as InvalidInput even though it is numerically symmetric, causing spurious InvalidInput for near-zero data."
    },
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 58,
      "summary": "solveLU returns NumericalIssue on singular matrix but never checks lu.info() after solve",
      "failure_scenario": "FullPivLU::isInvertible() is true for a nearly singular but rank-full matrix. lu.solve(rhs) can produce Inf/NaN
  or a very large residual. The function still returns Success and writes the bad x to out, so callers see Success with an unusable solution
  instead of NumericalIssue."
    },
    {
      "file": "wasm/eigen_wasm.cpp",
      "line": 13,
      "summary": "Dimension ceiling guard kMaxDimension is duplicated in nine exported functions",
      "failure_scenario": "Guard logic lives in determinant, solveLU, inv, cholesky, qr, solveLeastSquares, matMul, svd, symmetricEigen.
  Adding a new routine or changing the ceiling requires editing every site. A missed edit lets a new function trap the module at dimension
  256 instead of returning InvalidInput, breaking the invariant that oversize requests are rejected."
    }
  ]
```
Como anda o code review? O diff adiciona determinant, solveLU, inv, cholesky, qr, solveLeastSquares, matMul, svd e symmetricEigen com
guarda de dimensão 255. Os pontos críticos acima são validação de dimensões em matMul/solveLeastSquares, inicialização do triângulo
inferior de R no QR, tolerância de simetria no Cholesky/SymmetricEigen e a duplicação da guarda de dimensão que aumenta risco de
regressão.

## Status parcial do code-review (high-effort, master...HEAD, dense-routines):

- Escopo já examinado: wasm/eigen_wasm.cpp inteiro (+268 linhas), wasm/build.sh, testes JS test_determinant.js, test_lu.js, test_qr.js,
wasm/README.md, GLOSSARY.md, spec-dense.md e os tickets .scratch/eigen-wasm/issues/*.
- Padrões verificados: guarda de dimensão 255 kMaxDimension, retornos Eigen::ComputationInfo verbatim, “output untouched on failure” com
sentinel, checks de ponteiros/nulos, maxDimension() exposta.

Findings preliminares já consolidados (6, ranked por severidade):

1. wasm/eigen_wasm.cpp:185 – matMul não valida compatibilidade A.cols == B.rows
    Falha: leitura fora do buffer de B e resultado indefinido em vez de InvalidInput.
2. wasm/eigen_wasm.cpp:145 – QR R construído com triangularView<Eigen::Upper>() sem zero do triângulo inferior
    Falha: entradas i>j de R ficam não-inicializadas → reconstrução Q*R inconsistente.
3. wasm/eigen_wasm.cpp:164 – solveLeastSquares não valida tamanho de b
    Falha: VectorXd mapeado para um buffer menor que rows → acesso fora dos limites.
4. wasm/eigen_wasm.cpp:111/263 – checagem de simetria com diff>1e-12 && diff>mag*1e-6
    Falha: rejeita matrizes simétricas numericamente válidas com entradas próximas de zero; falso positivo de InvalidInput.
5. wasm/eigen_wasm.cpp:58 – solveLU confia só em isInvertible()
    Falha: matriz mal condicionada pode passar e devolver solução com Inf/NaN com Success.
6. wasm/eigen_wasm.cpp:13 – guarda de dimensão duplicada em 9 funções exportadas
    Falha de manutenção: mudança do teto exige edição espalhada; risco de nova rotina travar em 256 em vez de retornar InvalidInput.

Próximos passos em andamento: traçar chamadas nos testes JS para matMul/solveLeastSquares/qr, auditar os “removed-behavior” dos guards e completar os ângulos de cleanup/altitude/convenções (CLAUDE.md). Ainda não finalizei a dedup final nem a saída JSON completa — entrega o bloco final assim que terminar o varrimento dos 8 ângulos.    
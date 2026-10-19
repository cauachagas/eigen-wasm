# Code Review: Dense Routines (Tickets 004-013)

Resumo dos achados no padrão ASD-STE100:

5 findings confirmados em wasm/eigen_wasm.cpp:

- linha 68 – solveTriangularImpl compara zero exato para singularidade da diagonal
  → diag ~1e-16 é aceita como não singular; pode retornar Inf/NaN em vez de NumericalIssue.
- linha 56 – solveTriangularImpl não verifica se a matriz de entrada é triangular
  → matriz densa não triangular é resolvida ignorando entradas fora da triangular.
- linha 830 – pseudoInverse não checa CompleteOrthogonalDecomposition::info() antes de usar pseudoInverse
  → decomposição falha silenciosamente e produz NaNs.
- linha 797 – cod copia apenas o bloco r×r superior-esquerdo de matrixT com view Upper
  → para rank r < min(rows,cols) o T trapezoidal completo é truncado.
- linha 50 – isPartialPivLUInvertible rejeita matrizes com diagonais de magnitude muito pequena via ratio/rcond
  → matriz bem escalada mas mal condicionada pode ser rejeitada de forma conservadora demais.

Arquivos afetados: wasm/eigen_wasm.cpp

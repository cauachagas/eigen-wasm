Let's scan code for bugs.

1. wasm/eigen_wasm.cpp:167 — QR R construída com triangularView<Upper> deixa triângulo inferior não inicializado → r_out contém lixo para i>j, reconstrução Q*R não determinística.
2. wasm/eigen_wasm.cpp:376 — ColPivHouseholderQR tem o mesmo problema de triangularView<Upper> para R → r_out corrompido.
3. wasm/eigen_wasm.cpp:206 — matMul não valida a alocação real do buffer de B. Com rowsA,colsA,colsB válidos individualmente, B mapeado como colsA x colsB pode ler além do que o caller alocou → out-of-bounds / WASM trap em vez de InvalidInput.
4. wasm/eigen_wasm.cpp:186 — solveLeastSquares mapeia rhs(b,rows) sem verificar tamanho do buffer b → leitura fora dos limites.
5. wasm/eigen_wasm.cpp:27 — isSymmetric agora usa max(|a|,|b|) para magnitude; a tolerância muda de semântica vs implementação anterior (que usava min). Pode aceitar matrizes não simétricas com entradas muito diferentes como simétricas → Cholesky/SelfAdjointEigenSolver operam sobre dado inválido.
6. wasm/eigen_wasm.cpp:164 — qr não verifica householderQr.info() antes de escrever Q/R → pode retornar Success com fatores inválidos.
7. wasm/eigen_wasm.cpp:191 — solveLeastSquares não checa finitude de x antes de retornar Success → Inf/NaN podem ser devolvidos como solução válida.
8. wasm/eigen_wasm.cpp:68 — determinant não rejeita entrada não-finitas (NaN/Inf) antes do Map → NaN se propaga em vez de InvalidInput.

Parece que alguns dos 6 problemas do review anterior persistem (QR R não inicializado, validação de matMul/solveLeastSquares, checagem de simetria) e surgiram novos pontos de contrato (info check, finitude, NaN).

## O agente confirmou o que o relatório final já mostrou:

- Diff coletado master...HEAD e wasm/eigen_wasm.cpp revisado por completo (helpers validDim/isSymmetric, matMul, qr, solveLeastSquares,
contratos).
- Os 6 findings do review anterior foram verificados:
a. matMul sem validação de compatibilidade de buffers
b. QR R com triangularView sem inicialização do triângulo inferior
c. solveLeastSquares sem validação de tamanho de b
d. Tolerância de simetria alterada (max vs min)
e. solveLU só isInvertible
f. Duplicação de guarda de dimensão

- Duplicação de guarda foi centralizada via validDim/isSymmetric no commit ff32d03a3.
- Novas incidências identificadas: padrão triangularView sem zero (também em ColPivHouseholderQR), ausência de checks de info/finitude e
validações de buffer.

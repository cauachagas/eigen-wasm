# 016: Elevação do teto de dimensão para 2048

**What to build:** Elevação do teto canônico `kMaxDimension` de 255 para 2048 em `wasm/eigen_wasm.cpp`, expansão das flags de compilação no `wasm/build.sh` (`STACK_SIZE=16MB`, `INITIAL_MEMORY=128MB`, `MAXIMUM_MEMORY=4GB`), sincronização com `ABI_CONTRACT.md`, `GLOSSARY.md` e `wasm/README.md`, e atualização das suítes de teste para validar a fronteira em N = 2048 e rejeição em N = 2049 com buffers intocados.

**Blocked by:** 015

**Status:** resolved

- [x] Atualização de `wasm/build.sh` com `-s STACK_SIZE=16MB`, `-s INITIAL_MEMORY=128MB` e `-s MAXIMUM_MEMORY=4GB`
- [x] Atualização de `kMaxDimension = 2048` em `wasm/eigen_wasm.cpp`
- [x] Atualização de `ABI_CONTRACT.md`, `GLOSSARY.md` e `wasm/README.md` refletindo o novo teto de 2048 e aviso de Web Workers
- [x] Atualização das suítes de teste (`wasm/test_*.js`) garantindo que `MAX_DIMENSION + 1` (2049) retorna `InvalidInput` com buffers intocados
- [x] Adição de teste focado de scaling com N = 2048 (`wasm/test_ceiling_2048.js`)
- [x] Recompilação e validação de 100% das suítes de teste

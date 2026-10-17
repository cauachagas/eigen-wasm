# Eigen WASM MVP Spec

Objective: Reproduce Eigen build in WebAssembly with Core+Dense.

Build: build.sh using emcc -O3 --bind -s ALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1 -s MODULARIZE=1

Deliverables:
- eigen_wasm.cpp exposing matMul(MatrixXd,MatrixXd) -> MatrixXd
- build.sh produces eigen_wasm.js + .wasm
- Node/browser test validates matMul result

Non-goals: Sparse, SVD, threading.

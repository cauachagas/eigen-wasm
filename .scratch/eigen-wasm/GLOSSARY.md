# Glossary

**Eigen WASM**: Build of Eigen C++ headers compiled to WebAssembly via Emscripten.

**matMul3x3**: Exported function computing `out = a * b` for row-major 3x3
matrices passed as three `double` pointers.

**Row-major**: Memory layout where element (i, j) of a 3x3 lives at index
`3 * i + j`.

**EXPORT_ES6**: Emscripten flag for ES module output.

# Ticket 002: WASM wrapper

Create eigen_wasm.cpp exposing matMul for Core+Dense.

> As built: exposed `matMul3x3(const double*, const double*, double*)` over
> row-major buffers, not `matMul(MatrixXd, MatrixXd) -> MatrixXd`.

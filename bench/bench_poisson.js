// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// bench_poisson.js: Dedicated benchmark suite for 2D and 3D Poisson sparse systems in WebAssembly.
// Evaluates SpMV throughput, Direct Cholesky factorization & solve, and Iterative CG/BiCGSTAB.
// Supports comparative benchmarking against a native C++ baseline (-O3) when a C++ compiler is detected.
// Run with: npm run bench (or node bench/bench_poisson.js [--quick] [--full] [--no-native] [--dim2d=N] [--dim3d=N])

import { performance } from 'node:perf_hooks';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generatePoisson2D, generatePoisson3D } from './poisson.js';
import createEigenModule from '../test/eigen_wasm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const isFull = args.includes('--full') || (!isQuick && !args.some(a => a.startsWith('--dim2d') || a.startsWith('--dim3d')));
const skipNative = args.includes('--no-native');

function parseArg(prefix, defaultVal) {
  const arg = args.find(a => a.startsWith(`${prefix}=`));
  if (arg) {
    const val = Number(arg.split('=')[1]);
    if (!Number.isNaN(val) && val > 0) return val;
  }
  return defaultVal;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node bench/bench_poisson.js [options]

Options:
  --quick          Run smaller grid sizes suitable for fast verification (2D: N=50, 3D: N=15)
  --full           Run standard production benchmark grid sizes (2D: N=100, 3D: N=25) [default]
  --dim2d=N        Custom grid dimension for 2D Poisson (n = N^2)
  --dim3d=N        Custom grid dimension for 3D Poisson (n = N^3)
  --tol=T          Convergence tolerance for iterative solvers (default: 1e-6)
  --max_iters=M    Maximum iteration budget for iterative solvers (default: 2 * n)
  --no-native      Skip compiling and running the native C++ comparison baseline
  --help, -h       Display this help message
`);
  process.exit(0);
}

const customDim2D = parseArg('--dim2d', null);
const customDim3D = parseArg('--dim3d', null);
const tol = parseArg('--tol', 1e-6);
const maxItersArg = parseArg('--max_iters', 0);

// Determine problem dimensions
let dim2D = customDim2D ? customDim2D : (isQuick ? 50 : 100);
let dim3D = customDim3D ? customDim3D : (isQuick ? 15 : 25);

const problems = [];
if (customDim2D || (!customDim2D && !customDim3D)) {
  problems.push({ type: '2D', N: dim2D, generator: () => generatePoisson2D(dim2D) });
}
if (customDim3D || (!customDim2D && !customDim3D)) {
  problems.push({ type: '3D', N: dim3D, generator: () => generatePoisson3D(dim3D) });
}

console.log('='.repeat(108));
console.log(' Eigen WebAssembly Poisson Benchmark Suite');
console.log('='.repeat(108));
console.log(`Node: ${process.version} | OS: ${os.type()} ${os.arch()} | CPUs: ${os.cpus().length}`);
console.log(`Preset: ${isQuick ? 'QUICK (CI)' : 'FULL (Standard)'} | Tolerance: ${tol.toExponential(1)}`);
console.log('='.repeat(108));

// -----------------------------------------------------------------------------
// Native C++ Baseline Execution (Optional, when compiler is present)
// -----------------------------------------------------------------------------
let nativeRecords = null;

if (!skipNative) {
  let compiler = null;
  try {
    const checkClang = execSync('which clang++ 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (checkClang) compiler = checkClang;
  } catch (_) {
    try {
      const checkGpp = execSync('which g++ 2>/dev/null', { encoding: 'utf-8' }).trim();
      if (checkGpp) compiler = checkGpp;
    } catch (_) {}
  }

  if (compiler) {
    try {
      const buildDir = path.join(rootDir, 'build');
      if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

      const nativeBin = path.join(buildDir, 'native_poisson');
      const nativeSrc = path.join(rootDir, 'bench', 'native_poisson.cpp');
      const eigenHeaders = path.join(rootDir, 'deps', 'eigen');

      let needsCompile = !fs.existsSync(nativeBin);
      if (!needsCompile) {
        const binStat = fs.statSync(nativeBin);
        const srcStat = fs.statSync(nativeSrc);
        if (srcStat.mtimeMs > binStat.mtimeMs) needsCompile = true;
      }

      if (needsCompile) {
        process.stdout.write(`Compiling native C++ baseline (${path.basename(compiler)} -O3)... `);
        execSync(`"${compiler}" -O3 -std=c++17 -I "${eigenHeaders}" "${nativeSrc}" -o "${nativeBin}"`, {
          cwd: rootDir,
          stdio: 'pipe'
        });
        console.log('Done.');
      }

      const forwardArgs = [];
      if (isQuick) forwardArgs.push('--quick');
      else if (isFull) forwardArgs.push('--full');
      if (customDim2D) forwardArgs.push(`--dim2d=${customDim2D}`);
      if (customDim3D) forwardArgs.push(`--dim3d=${customDim3D}`);
      if (tol) forwardArgs.push(`--tol=${tol}`);
      if (maxItersArg) forwardArgs.push(`--max_iters=${maxItersArg}`);
      forwardArgs.push('--json');

      const nativeOut = execSync(`"${nativeBin}" ${forwardArgs.join(' ')}`, {
        cwd: rootDir,
        encoding: 'utf-8'
      });

      nativeRecords = JSON.parse(nativeOut);
      console.log(`Native baseline compiled and executed successfully (${nativeRecords.length} records captured).`);
    } catch (e) {
      console.log(`Note: Native C++ baseline skipped (${e.message.split('\n')[0]}). Continuing with Wasm benchmark.`);
    }
  } else {
    console.log('Note: No C++ compiler (clang++ or g++) detected on PATH. Native baseline comparison skipped.');
  }
}

// -----------------------------------------------------------------------------
// WebAssembly Benchmark Execution
// -----------------------------------------------------------------------------
const Module = await createEigenModule();

function copyToWasmDouble(typedArray) {
  const len = typedArray.length;
  const ptr = Module._malloc(len * 8);
  for (let i = 0; i < len; i++) {
    Module.setValue(ptr + i * 8, typedArray[i], 'double');
  }
  return ptr;
}

function copyToWasmInt(typedArray) {
  const len = typedArray.length;
  const ptr = Module._malloc(len * 4);
  for (let i = 0; i < len; i++) {
    Module.setValue(ptr + i * 4, typedArray[i], 'i32');
  }
  return ptr;
}

function computeRelativeResidual(n, nnz, pVals, pInner, pOuter, pX, pB, bNorm) {
  const pAx = Module._malloc(n * 8);
  Module._sparseMatMulVec(n, n, nnz, pVals, pInner, pOuter, 0, pX, pAx);

  let diffNormSq = 0.0;
  for (let i = 0; i < n; i++) {
    const ax = Module.getValue(pAx + i * 8, 'double');
    const b = Module.getValue(pB + i * 8, 'double');
    const diff = ax - b;
    diffNormSq += diff * diff;
  }
  Module._free(pAx);

  return Math.sqrt(diffNormSq) / (bNorm > 0.0 ? bNorm : 1.0);
}

const wasmResults = [];

for (const prob of problems) {
  console.log(`\nAssembling Poisson ${prob.type} matrix with N = ${prob.N}...`);
  const tGenStart = performance.now();
  const mat = prob.generator();
  const tGen = performance.now() - tGenStart;
  console.log(`  Matrix assembled in ${tGen.toFixed(1)} ms (Dimension n = ${mat.n.toLocaleString()}, NNZ = ${mat.nnz.toLocaleString()})`);

  const n = mat.n;
  const nnz = mat.nnz;

  const pVals = copyToWasmDouble(mat.values);
  const pInner = copyToWasmInt(mat.innerIndices);
  const pOuter = copyToWasmInt(mat.outerStarts);

  const bData = new Float64Array(n).fill(1.0);
  const pB = copyToWasmDouble(bData);
  const bNorm = Math.sqrt(n);

  // 1. SpMV Benchmark
  {
    const xData = new Float64Array(n).fill(1.0);
    const pX = copyToWasmDouble(xData);
    const pY = Module._malloc(n * 8);

    // Warm up
    Module._sparseMatMulVec(n, n, nnz, pVals, pInner, pOuter, 0, pX, pY);
    Module._sparseMatMulVec(n, n, nnz, pVals, pInner, pOuter, 0, pX, pY);

    const iters = isQuick ? 20 : 50;
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) {
      Module._sparseMatMulVec(n, n, nnz, pVals, pInner, pOuter, 0, pX, pY);
    }
    const totalTimeMs = performance.now() - t0;
    const avgTimeMs = totalTimeMs / iters;
    const opsSec = iters / (totalTimeMs / 1000.0);
    const mflops = ((2.0 * nnz) / (avgTimeMs * 1000.0)).toFixed(1);

    wasmResults.push({
      problem: `Poisson ${prob.type} (N=${prob.N})`,
      op: 'SpMV (A * x)',
      n,
      nnz,
      timeMs: avgTimeMs,
      opsSec,
      mflops,
      iters: '-',
      residual: '-'
    });

    Module._free(pX);
    Module._free(pY);
  }

  // 2. Direct Cholesky: SimplicialLDLT
  {
    const pHandle = Module._malloc(4);
    const pOutX = Module._malloc(n * 8);

    const tFact0 = performance.now();
    const factStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
    const tFact = performance.now() - tFact0;

    if (factStatus === 0) {
      const handle = Module.getValue(pHandle, 'i32');

      const tSolve0 = performance.now();
      const solveStatus = Module._sparseCholeskySolve(handle, pB, 1, pOutX);
      const tSolve = performance.now() - tSolve0;

      const resNorm = (solveStatus === 0)
        ? computeRelativeResidual(n, nnz, pVals, pInner, pOuter, pOutX, pB, bNorm)
        : -1.0;

      wasmResults.push({
        problem: `Poisson ${prob.type} (N=${prob.N})`,
        op: 'SimplicialLDLT (Fact)',
        n,
        nnz,
        timeMs: tFact,
        opsSec: 1000.0 / tFact,
        mflops: '-',
        iters: '-',
        residual: '-'
      });

      wasmResults.push({
        problem: `Poisson ${prob.type} (N=${prob.N})`,
        op: 'SimplicialLDLT (Solve)',
        n,
        nnz,
        timeMs: tSolve,
        opsSec: 1000.0 / tSolve,
        mflops: '-',
        iters: '1',
        residual: resNorm.toExponential(2)
      });

      Module._sparseCholeskyDestroy(handle);
    }

    Module._free(pHandle);
    Module._free(pOutX);
  }

  // 3. Direct Cholesky: SimplicialLLT
  {
    const pHandle = Module._malloc(4);
    const pOutX = Module._malloc(n * 8);

    const tFact0 = performance.now();
    const factStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 1, pHandle);
    const tFact = performance.now() - tFact0;

    if (factStatus === 0) {
      const handle = Module.getValue(pHandle, 'i32');

      const tSolve0 = performance.now();
      const solveStatus = Module._sparseCholeskySolve(handle, pB, 1, pOutX);
      const tSolve = performance.now() - tSolve0;

      const resNorm = (solveStatus === 0)
        ? computeRelativeResidual(n, nnz, pVals, pInner, pOuter, pOutX, pB, bNorm)
        : -1.0;

      wasmResults.push({
        problem: `Poisson ${prob.type} (N=${prob.N})`,
        op: 'SimplicialLLT (Fact)',
        n,
        nnz,
        timeMs: tFact,
        opsSec: 1000.0 / tFact,
        mflops: '-',
        iters: '-',
        residual: '-'
      });

      wasmResults.push({
        problem: `Poisson ${prob.type} (N=${prob.N})`,
        op: 'SimplicialLLT (Solve)',
        n,
        nnz,
        timeMs: tSolve,
        opsSec: 1000.0 / tSolve,
        mflops: '-',
        iters: '1',
        residual: resNorm.toExponential(2)
      });

      Module._sparseCholeskyDestroy(handle);
    }

    Module._free(pHandle);
    Module._free(pOutX);
  }

  // 4. Iterative Solver: Conjugate Gradient (CG)
  {
    const pOutX = Module._malloc(n * 8);
    const pIters = Module._malloc(4);
    const pError = Module._malloc(8);

    const maxIters = maxItersArg > 0 ? maxItersArg : 2 * n;

    const t0 = performance.now();
    const status = Module._sparseConjugateGradient(
      pVals, pInner, pOuter, n, nnz, 0,
      pB, 1, pOutX, maxIters, tol, pIters, pError
    );
    const timeMs = performance.now() - t0;
    const iters = Module.getValue(pIters, 'i32');

    const resNorm = (status === 0 || status === 2)
      ? computeRelativeResidual(n, nnz, pVals, pInner, pOuter, pOutX, pB, bNorm)
      : -1.0;

    wasmResults.push({
      problem: `Poisson ${prob.type} (N=${prob.N})`,
      op: 'ConjugateGradient',
      n,
      nnz,
      timeMs,
      opsSec: 1000.0 / timeMs,
      mflops: ((2.0 * nnz * iters) / (timeMs * 1000.0)).toFixed(1),
      iters: String(iters),
      residual: resNorm.toExponential(2)
    });

    Module._free(pOutX);
    Module._free(pIters);
    Module._free(pError);
  }

  // 5. Iterative Solver: BiCGSTAB
  {
    const pOutX = Module._malloc(n * 8);
    const pIters = Module._malloc(4);
    const pError = Module._malloc(8);

    const maxIters = maxItersArg > 0 ? maxItersArg : 2 * n;

    const t0 = performance.now();
    const status = Module._sparseBiCGSTAB(
      pVals, pInner, pOuter, n, nnz, 0,
      pB, 1, pOutX, maxIters, tol, pIters, pError
    );
    const timeMs = performance.now() - t0;
    const iters = Module.getValue(pIters, 'i32');

    const resNorm = (status === 0 || status === 2)
      ? computeRelativeResidual(n, nnz, pVals, pInner, pOuter, pOutX, pB, bNorm)
      : -1.0;

    wasmResults.push({
      problem: `Poisson ${prob.type} (N=${prob.N})`,
      op: 'BiCGSTAB',
      n,
      nnz,
      timeMs,
      opsSec: 1000.0 / timeMs,
      mflops: ((4.0 * nnz * iters) / (timeMs * 1000.0)).toFixed(1),
      iters: String(iters),
      residual: resNorm.toExponential(2)
    });

    Module._free(pOutX);
    Module._free(pIters);
    Module._free(pError);
  }

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
}

// -----------------------------------------------------------------------------
// Format and Print Benchmark Table
// -----------------------------------------------------------------------------
function pad(str, len, align = 'left') {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  const diff = len - s.length;
  if (align === 'right') return ' '.repeat(diff) + s;
  return s + ' '.repeat(diff);
}

if (nativeRecords && nativeRecords.length > 0) {
  // Map native records for O(1) lookup: key = `${problem}::${op}`
  const nativeMap = new Map();
  for (const nr of nativeRecords) {
    nativeMap.set(`${nr.problem}::${nr.op}`, nr);
  }

  console.log('\n' + '='.repeat(130));
  console.log(' SIDE-BY-SIDE BENCHMARK RESULTS: WEBASSEMBLY vs NATIVE C++ (-O3)');
  console.log('='.repeat(130));

  const headers = ['Problem', 'Operation', 'Dim (n)', 'NNZ', 'Wasm (ms)', 'Native (ms)', 'Wasm/Native', 'Wasm MFLOPS', 'Native MFLOPS', 'Iters', 'Residual'];
  const colWidths = [19, 24, 11, 10, 11, 12, 13, 13, 14, 7, 10];

  const sepLine = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  console.log(sepLine);
  console.log('| ' + headers.map((h, i) => pad(h, colWidths[i], i >= 2 ? 'right' : 'left')).join(' | ') + ' |');
  console.log(sepLine);

  for (const w of wasmResults) {
    const key = `${w.problem}::${w.op}`;
    const nRec = nativeMap.get(key);

    const nativeMsStr = nRec ? (nRec.timeMs < 0.01 ? nRec.timeMs.toFixed(3) : nRec.timeMs.toFixed(2)) : '-';
    const wasmMsStr = typeof w.timeMs === 'number' ? (w.timeMs < 0.01 ? w.timeMs.toFixed(3) : w.timeMs.toFixed(2)) : w.timeMs;

    let ratioStr = '-';
    if (nRec && typeof w.timeMs === 'number' && nRec.timeMs > 0) {
      const ratio = w.timeMs / nRec.timeMs;
      ratioStr = `${ratio.toFixed(2)}x`;
    }

    const nativeMflopsStr = nRec && nRec.mflops !== '-' && typeof nRec.mflops === 'number'
      ? nRec.mflops.toFixed(1)
      : (nRec && nRec.mflops !== '-' ? String(nRec.mflops) : '-');

    const row = [
      pad(w.problem, colWidths[0], 'left'),
      pad(w.op, colWidths[1], 'left'),
      pad(w.n.toLocaleString(), colWidths[2], 'right'),
      pad(w.nnz.toLocaleString(), colWidths[3], 'right'),
      pad(wasmMsStr, colWidths[4], 'right'),
      pad(nativeMsStr, colWidths[5], 'right'),
      pad(ratioStr, colWidths[6], 'right'),
      pad(w.mflops, colWidths[7], 'right'),
      pad(nativeMflopsStr, colWidths[8], 'right'),
      pad(w.iters, colWidths[9], 'right'),
      pad(w.residual, colWidths[10], 'right')
    ];
    console.log('| ' + row.join(' | ') + ' |');
  }

  console.log(sepLine);
  console.log('Comparative benchmark complete. Ratio indicates Wasm execution time relative to Native C++.\n');

} else {
  // Wasm-only Table
  console.log('\n' + '='.repeat(116));
  console.log(' BENCHMARK RESULTS SUMMARY (WebAssembly)');
  console.log('='.repeat(116));

  const headers = ['Problem', 'Operation', 'Dimension (n)', 'NNZ', 'Time (ms)', 'Throughput', 'MFLOPS', 'Iters', 'Residual'];
  const colWidths = [20, 24, 15, 13, 11, 14, 10, 8, 12];

  const sepLine = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  console.log(sepLine);
  console.log('| ' + headers.map((h, i) => pad(h, colWidths[i], i >= 2 ? 'right' : 'left')).join(' | ') + ' |');
  console.log(sepLine);

  for (const r of wasmResults) {
    const row = [
      pad(r.problem, colWidths[0], 'left'),
      pad(r.op, colWidths[1], 'left'),
      pad(r.n.toLocaleString(), colWidths[2], 'right'),
      pad(r.nnz.toLocaleString(), colWidths[3], 'right'),
      pad(typeof r.timeMs === 'number' ? r.timeMs.toFixed(2) : r.timeMs, colWidths[4], 'right'),
      pad(typeof r.opsSec === 'number' ? (r.opsSec < 100 ? r.opsSec.toFixed(1) : Math.round(r.opsSec).toLocaleString()) + ' ops/s' : '-', colWidths[5], 'right'),
      pad(r.mflops, colWidths[6], 'right'),
      pad(r.iters, colWidths[7], 'right'),
      pad(r.residual, colWidths[8], 'right')
    ];
    console.log('| ' + row.join(' | ') + ' |');
  }

  console.log(sepLine);
  console.log('Benchmark execution complete.\n');
}

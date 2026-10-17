import { performance } from 'node:perf_hooks';
import EigenWasmModule from '../../wasm/eigen_wasm.js';

// Parse CLI arguments: supports positional `<size> <iterations>` or `--size=<N> --iterations=<N>` / `-s <N> -i <N>`
function parseArgs() {
  const args = process.argv.slice(2);
  let size = 100;
  let iterations = 100;

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node .scratch/eigen-wasm/run_benchmark.mjs [size] [iterations]
       node .scratch/eigen-wasm/run_benchmark.mjs --size=<N> --iterations=<N>

Parameters:
  size         Matrix dimension (NxN). Default: 100 (Max: 255)
  iterations   Number of multiplications. Default: 100

Examples:
  node .scratch/eigen-wasm/run_benchmark.mjs
  node .scratch/eigen-wasm/run_benchmark.mjs 50 200
  node .scratch/eigen-wasm/run_benchmark.mjs --size=150 --iterations=50
`);
    process.exit(0);
  }

  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--size=')) {
      size = parseInt(arg.split('=')[1], 10);
    } else if (arg === '-s' && i + 1 < args.length) {
      size = parseInt(args[++i], 10);
    } else if (arg.startsWith('--iterations=') || arg.startsWith('--iter=')) {
      iterations = parseInt(arg.split('=')[1], 10);
    } else if ((arg === '-i' || arg === '-n') && i + 1 < args.length) {
      iterations = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      positional.push(parseInt(arg, 10));
    }
  }

  if (positional.length >= 1 && !isNaN(positional[0])) size = positional[0];
  if (positional.length >= 2 && !isNaN(positional[1])) iterations = positional[1];

  return { size, iterations };
}

const { size, iterations } = parseArgs();

if (isNaN(size) || size < 1) {
  console.error('Error: size must be a positive integer.');
  process.exit(1);
}
if (isNaN(iterations) || iterations < 1) {
  console.error('Error: iterations must be a positive integer.');
  process.exit(1);
}

const Module = await EigenWasmModule();
const matMul = Module.cwrap('matMul', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);
const MAX_DIM = maxDimension();

if (size > MAX_DIM) {
  console.error(`Error: size ${size} exceeds WASM maximum dimension ceiling (${MAX_DIM}).`);
  process.exit(1);
}

function createMatrix(type, size, reuseBuffer = true) {
  const bytes = size * size * 8;
  const ptr = Module._malloc(bytes);
  const outPtr = reuseBuffer ? Module._malloc(bytes) : 0;

  for (let i = 0; i < size * size; i++) {
    // Fill with predictable deterministic pseudo-random values
    const val = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    Module.setValue(ptr + i * 8, val, 'double');
  }

  return {
    type,
    size,
    ptr,
    outPtr,
    matMul(other) {
      const dest = reuseBuffer ? this.outPtr : Module._malloc(bytes);
      const code = matMul(this.ptr, other.ptr, this.size, this.size, other.size, dest);
      if (!reuseBuffer) {
        Module._free(dest);
      }
      return code;
    },
    destroy() {
      if (ptr) Module._free(ptr);
      if (outPtr) Module._free(outPtr);
    }
  };
}

console.log(`=== Eigen WASM Benchmark (Matrix: ${size}x${size}, Iterations: ${iterations}) ===\n`);

// Warm-up (10% of iterations, min 3, max 10)
const warmIters = Math.min(Math.max(Math.floor(iterations * 0.1), 3), 10);
const warmA = createMatrix('eig', size, true);
const warmB = createMatrix('eig', size, true);
for (let k = 0; k < warmIters; k++) {
  warmA.matMul(warmB);
}
warmA.destroy();
warmB.destroy();

// 1. Benchmark with preallocated buffer (reusable out buffer)
{
  const A = createMatrix('eig', size, true);
  const B = createMatrix('eig', size, true);

  const start = performance.now();
  for (let k = 0; k < iterations; k++) {
    A.matMul(B);
  }
  const end = performance.now();
  const elapsedMs = end - start;
  const avgMs = elapsedMs / iterations;
  // Matrix multiplication of size N requires 2 * N^3 floating point ops (N^3 mul + N^3 add)
  const flopsPerMatMul = 2 * Math.pow(size, 3);
  const totalGFlops = (flopsPerMatMul * iterations) / (elapsedMs / 1000) / 1e9;

  console.log(`[Reuse Buffer Mode]:`);
  console.log(`  - Total Time:         ${elapsedMs.toFixed(3)} ms`);
  console.log(`  - Avg Time / iter:    ${avgMs.toFixed(3)} ms (${(avgMs * 1000).toFixed(1)} µs)`);
  console.log(`  - Throughput:         ${totalGFlops.toFixed(3)} GFLOPS`);

  A.destroy();
  B.destroy();
}

// 2. Benchmark with per-call malloc/free
{
  const A = createMatrix('eig', size, false);
  const B = createMatrix('eig', size, false);

  const start = performance.now();
  for (let k = 0; k < iterations; k++) {
    A.matMul(B);
  }
  const end = performance.now();
  const elapsedMs = end - start;
  const avgMs = elapsedMs / iterations;
  const flopsPerMatMul = 2 * Math.pow(size, 3);
  const totalGFlops = (flopsPerMatMul * iterations) / (elapsedMs / 1000) / 1e9;

  console.log(`\n[Per-Call Malloc/Free Mode]:`);
  console.log(`  - Total Time:         ${elapsedMs.toFixed(3)} ms`);
  console.log(`  - Avg Time / iter:    ${avgMs.toFixed(3)} ms (${(avgMs * 1000).toFixed(1)} µs)`);
  console.log(`  - Throughput:         ${totalGFlops.toFixed(3)} GFLOPS`);

  A.destroy();
  B.destroy();
}

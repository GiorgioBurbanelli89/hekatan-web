/**
 * Hekatan GPU — WebGPU compute shaders for matrix operations
 *
 * Uses WGSL (WebGPU Shading Language) for GPU-accelerated:
 * - Matrix multiplication
 * - Matrix-vector multiplication (Ax = b assembly)
 * - Jacobi iterative solver (for large sparse-like systems)
 */

// ─── WGSL Shaders ──────────────────────────────────────

/** Matrix multiplication: C = A × B */
const MATMUL_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> b : array<f32>;
@group(0) @binding(2) var<storage, read_write> c : array<f32>;
@group(0) @binding(3) var<uniform> dims : vec3<u32>; // M, N, K

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let row = gid.x;
  let col = gid.y;
  let M = dims.x;
  let N = dims.y;
  let K = dims.z;

  if (row >= M || col >= N) { return; }

  var sum : f32 = 0.0;
  for (var i : u32 = 0u; i < K; i = i + 1u) {
    sum = sum + a[row * K + i] * b[i * N + col];
  }
  c[row * N + col] = sum;
}
`;

/** Jacobi iterative solver: solve Ax = b */
const JACOBI_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a : array<f32>;       // matrix A (N×N)
@group(0) @binding(1) var<storage, read> b : array<f32>;       // vector b (N)
@group(0) @binding(2) var<storage, read> x_old : array<f32>;   // x previous iteration
@group(0) @binding(3) var<storage, read_write> x_new : array<f32>; // x next iteration
@group(0) @binding(4) var<uniform> size : u32;                 // N

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let N = size;
  if (i >= N) { return; }

  var sigma : f32 = 0.0;
  let diag = a[i * N + i];

  for (var j : u32 = 0u; j < N; j = j + 1u) {
    if (j != i) {
      sigma = sigma + a[i * N + j] * x_old[j];
    }
  }

  x_new[i] = (b[i] - sigma) / diag;
}
`;

/** Matrix-vector multiply: y = A × x */
const MATVEC_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> a : array<f32>;
@group(0) @binding(1) var<storage, read> x : array<f32>;
@group(0) @binding(2) var<storage, read_write> y : array<f32>;
@group(0) @binding(3) var<uniform> size : u32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let N = size;
  if (i >= N) { return; }

  var sum : f32 = 0.0;
  for (var j : u32 = 0u; j < N; j = j + 1u) {
    sum = sum + a[i * N + j] * x[j];
  }
  y[i] = sum;
}
`;

// ─── GPU Engine ─────────────────────────────────────────

export interface GPUEngine {
  device: GPUDevice;
  matmul(a: Float32Array, b: Float32Array, M: number, N: number, K: number): Promise<Float32Array>;
  matvec(a: Float32Array, x: Float32Array, N: number): Promise<Float32Array>;
  jacobiSolve(a: Float32Array, b: Float32Array, N: number, maxIter?: number, tol?: number): Promise<{ x: Float32Array; iterations: number; residual: number }>;
}

export async function createGPUEngine(): Promise<GPUEngine> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("WebGPU not supported — no adapter found");

  const device = await adapter.requestDevice();

  // ── Helper: create buffer ──
  function createBuffer(data: Float32Array | Uint32Array, usage: number): GPUBuffer {
    const buf = device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });
    if (data instanceof Float32Array) {
      new Float32Array(buf.getMappedRange()).set(data);
    } else {
      new Uint32Array(buf.getMappedRange()).set(data);
    }
    buf.unmap();
    return buf;
  }

  function createEmptyBuffer(size: number, usage: number): GPUBuffer {
    return device.createBuffer({ size, usage });
  }

  // ── Matrix multiplication ──
  async function matmul(a: Float32Array, b: Float32Array, M: number, N: number, K: number): Promise<Float32Array> {
    const module = device.createShaderModule({ code: MATMUL_SHADER });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const bufA = createBuffer(a, GPUBufferUsage.STORAGE);
    const bufB = createBuffer(b, GPUBufferUsage.STORAGE);
    const bufC = createEmptyBuffer(M * N * 4, usage);
    const bufDims = createBuffer(new Uint32Array([M, N, K]), GPUBufferUsage.UNIFORM);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufA } },
        { binding: 1, resource: { buffer: bufB } },
        { binding: 2, resource: { buffer: bufC } },
        { binding: 3, resource: { buffer: bufDims } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(M / 16), Math.ceil(N / 16));
    pass.end();

    const readBuf = createEmptyBuffer(M * N * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    encoder.copyBufferToBuffer(bufC, 0, readBuf, 0, M * N * 4);
    device.queue.submit([encoder.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();

    [bufA, bufB, bufC, bufDims, readBuf].forEach(b => b.destroy());
    return result;
  }

  // ── Matrix-vector multiply ──
  async function matvec(a: Float32Array, x: Float32Array, N: number): Promise<Float32Array> {
    const module = device.createShaderModule({ code: MATVEC_SHADER });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
    const bufA = createBuffer(a, GPUBufferUsage.STORAGE);
    const bufX = createBuffer(x, GPUBufferUsage.STORAGE);
    const bufY = createEmptyBuffer(N * 4, usage);
    const bufN = createBuffer(new Uint32Array([N]), GPUBufferUsage.UNIFORM);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: bufA } },
        { binding: 1, resource: { buffer: bufX } },
        { binding: 2, resource: { buffer: bufY } },
        { binding: 3, resource: { buffer: bufN } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(N / 64));
    pass.end();

    const readBuf = createEmptyBuffer(N * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    encoder.copyBufferToBuffer(bufY, 0, readBuf, 0, N * 4);
    device.queue.submit([encoder.finish()]);

    await readBuf.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();

    [bufA, bufX, bufY, bufN, readBuf].forEach(b => b.destroy());
    return result;
  }

  // ── Jacobi iterative solver ──
  async function jacobiSolve(
    a: Float32Array, b: Float32Array, N: number,
    maxIter = 1000, tol = 1e-6
  ): Promise<{ x: Float32Array; iterations: number; residual: number }> {
    const module = device.createShaderModule({ code: JACOBI_SHADER });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    const bufA = createBuffer(a, GPUBufferUsage.STORAGE);
    const bufB = createBuffer(b, GPUBufferUsage.STORAGE);
    const bufN = createBuffer(new Uint32Array([N]), GPUBufferUsage.UNIFORM);

    let xOld = new Float32Array(N); // initial guess = 0
    let bufXOld = createBuffer(xOld, storageUsage);
    let bufXNew = createEmptyBuffer(N * 4, storageUsage);

    let iterations = 0;
    let residual = Infinity;

    for (let iter = 0; iter < maxIter; iter++) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bufA } },
          { binding: 1, resource: { buffer: bufB } },
          { binding: 2, resource: { buffer: bufXOld } },
          { binding: 3, resource: { buffer: bufXNew } },
          { binding: 4, resource: { buffer: bufN } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(N / 64));
      pass.end();

      // Read back to check convergence every 50 iterations
      if ((iter + 1) % 50 === 0 || iter === maxIter - 1) {
        const readBuf = createEmptyBuffer(N * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
        encoder.copyBufferToBuffer(bufXNew, 0, readBuf, 0, N * 4);
        device.queue.submit([encoder.finish()]);

        await readBuf.mapAsync(GPUMapMode.READ);
        const xNew = new Float32Array(readBuf.getMappedRange().slice(0));
        readBuf.unmap();
        readBuf.destroy();

        // Compute residual ||x_new - x_old||
        residual = 0;
        for (let i = 0; i < N; i++) {
          residual += (xNew[i] - xOld[i]) ** 2;
        }
        residual = Math.sqrt(residual);
        iterations = iter + 1;
        xOld = xNew;

        if (residual < tol) break;

        // Update bufXOld for next batch
        bufXOld.destroy();
        bufXOld = createBuffer(xOld, storageUsage);
        bufXNew.destroy();
        bufXNew = createEmptyBuffer(N * 4, storageUsage);
      } else {
        // Swap buffers
        encoder.copyBufferToBuffer(bufXNew, 0, bufXOld, 0, N * 4);
        device.queue.submit([encoder.finish()]);
      }
    }

    [bufA, bufB, bufN, bufXOld, bufXNew].forEach(b => b.destroy());
    return { x: xOld, iterations, residual };
  }

  return { device, matmul, matvec, jacobiSolve };
}

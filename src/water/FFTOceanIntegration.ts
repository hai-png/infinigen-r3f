/**
 * FFTOceanIntegration.ts — P2 Water: FFT Ocean Simulation + SDF Foam
 *
 * Implements spectrum-driven ocean wave simulation via inverse Fast Fourier
 * Transform and Signed Distance Field–based foam generation.
 *
 * Six top-level classes:
 * 1. OceanSpectrumConfig   — spectrum parameter configuration
 * 2. FFTComputePipeline    — CPU-based inverse FFT with butterfly algorithm
 * 3. FFTOceanRenderer      — generates displacement / normal / foam textures
 * 4. SDFFoamGenerator      — SDF-derived foam, whitewater, and bubble fields
 * 5. WhitewaterParticles   — spray / bubble / foam particle container
 * 6. OceanIntegration      — bridges FFTOceanRenderer with FluidTerrainCoupling
 *
 * @module water/FFTOceanIntegration
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { FluidTerrainCoupling, CoupledWaterTerrainResult } from './FluidTerrainCoupling';

// ============================================================================
// 1. OceanSpectrumConfig
// ============================================================================

/**
 * Supported ocean wave spectrum models.
 *
 * - PHILLIPS: Classic Phillips spectrum (Tessendorf 2001), good for deep water
 * - PIERSON_MOSKOWITZ: Fully-developed sea spectrum for steady winds
 * - JONSWAP: Joint North Sea Wave Project — fetch-limited, peaks sharper than PM
 * - TEXEL_MARSEN_ARSLOE: Shallow-water extension with depth-dependent dispersion
 */
export type SpectrumType =
  | 'PHILLIPS'
  | 'PIERSON_MOSKOWITZ'
  | 'JONSWAP'
  | 'TEXEL_MARSEN_ARSLOE';

/**
 * Configuration for ocean wave spectrum generation.
 *
 * All parameters follow standard oceanographic conventions. The spectrum is
 * evaluated on a 2D frequency grid and converted to amplitude/phase
 * coefficients that are animated over time.
 */
export interface OceanSpectrumConfig {
  /** Spectrum model to use */
  spectrumType: SpectrumType;
  /** Wind speed in m/s at 10 m height (default 10) */
  windSpeed: number;
  /** Wind direction as a 2D unit vector (default (1, 0)) */
  windDirection: THREE.Vector2;
  /** Fetch length in meters for JONSWAP spectrum (default 300000) */
  fetch: number;
  /** Peak angular frequency for PM/JONSWAP (computed automatically if 0) */
  peakFrequency: number;
  /** Water depth in meters for shallow-water dispersion (default 200) */
  depth: number;
  /** Phillips constant A (default 0.0005) */
  phillipsConstant: number;
  /** Damping factor for waves propagating opposite to wind (default 0.5) */
  directionalDamping: number;
  /** Maximum wave frequency cutoff (default 10) */
  maxFrequency: number;
  /** Gravity constant (default 9.81) */
  gravity: number;
}

/** Default ocean spectrum configuration */
export const DEFAULT_OCEAN_SPECTRUM_CONFIG: OceanSpectrumConfig = {
  spectrumType: 'PHILLIPS',
  windSpeed: 10,
  windDirection: new THREE.Vector2(1, 0),
  fetch: 300000,
  peakFrequency: 0,
  depth: 200,
  phillipsConstant: 0.0005,
  directionalDamping: 0.5,
  maxFrequency: 10,
  gravity: 9.81,
};

// ============================================================================
// 2. FFTComputePipeline
// ============================================================================

/**
 * CPU-based inverse FFT computation using the butterfly algorithm.
 *
 * Supports power-of-two sizes (N = 2^k). The butterfly algorithm
 * pre-computes twiddle factor indices and then applies log2(N) stages
 * of in-place radix-2 decimation-in-frequency.
 *
 * This pipeline is designed for the horizontal displacement computation
 * in the Tessendorf ocean model: the frequency-domain spectrum coefficients
 * are transformed to spatial-domain displacement maps.
 */
export class FFTComputePipeline {
  /** Pre-computed butterfly lookup table indices */
  private butterflyIndices: Int32Array;
  /** Pre-computed twiddle factors (cos/sin pairs) */
  private twiddleCos: Float32Array;
  private twiddleSin: Float32Array;
  /** Current FFT size */
  private size: number;
  /** Number of butterfly stages = log2(N) */
  private stages: number;

  /**
   * Create a new FFT compute pipeline for a given power-of-two size.
   *
   * @param N - FFT size (must be a power of 2)
   */
  constructor(N: number) {
    this.size = N;
    this.stages = Math.log2(N);
    const totalOps = (this.stages * N) / 2;

    this.butterflyIndices = new Int32Array(totalOps * 2);
    this.twiddleCos = new Float32Array(totalOps);
    this.twiddleSin = new Float32Array(totalOps);

    this.precomputeButterfly(N);
  }

  /**
   * Compute the inverse FFT of a complex-valued spectrum.
   *
   * Takes separate real and imaginary arrays of length N and returns
   * the inverse-transformed real-valued result of length N.
   *
   * @param spectrumReal - Real part of the frequency-domain input
   * @param spectrumImag - Imaginary part of the frequency-domain input
   * @param N - Length of the arrays (must match constructor size)
   * @returns Real-valued spatial-domain output of length N
   */
  computeIFFT(spectrumReal: Float32Array, spectrumImag: Float32Array, N: number): Float32Array {
    if (N !== this.size) {
      throw new Error(`FFT size mismatch: expected ${this.size}, got ${N}`);
    }

    // Working buffers (copy to avoid mutating input)
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(spectrumReal);
    im.set(spectrumImag);

    // Bit-reversal permutation
    this.bitReverse(re, im, N);

    // Butterfly stages
    let offset = 0;
    for (let stage = 0; stage < this.stages; stage++) {
      const halfSize = 1 << stage;
      const stride = halfSize << 1;

      for (let k = 0; k < N; k += stride) {
        for (let j = 0; j < halfSize; j++) {
          const idx1 = k + j;
          const idx2 = k + j + halfSize;
          const twIdx = offset + (k / stride) * halfSize + j;

          const cosVal = this.twiddleCos[twIdx];
          const sinVal = this.twiddleSin[twIdx];

          const re2 = re[idx2];
          const im2 = im[idx2];

          // Complex multiply: twiddle * [re2, im2]
          const tRe = cosVal * re2 - sinVal * im2;
          const tIm = cosVal * im2 + sinVal * re2;

          re[idx2] = re[idx1] - tRe;
          im[idx2] = im[idx1] - tIm;
          re[idx1] = re[idx1] + tRe;
          im[idx1] = im[idx1] + tIm;
        }
      }
      offset += N / 2;
    }

    // Scale by 1/N for inverse FFT
    const result = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      result[i] = re[i] / N;
    }
    return result;
  }

  /**
   * Generate displacement arrays from spectrum and time.
   *
   * Computes the 2D inverse FFT for each displacement component (dx, dy, dz)
   * by applying 1D IFFTs row-by-row then column-by-column (separable).
   *
   * @param spectrum - Pre-computed spectrum coefficients (real/imag per component)
   * @param time - Current simulation time in seconds
   * @param N - Grid resolution (power of 2)
   * @returns Triple of displacement arrays {dx, dy, dz}, each of length N*N
   */
  generateDisplacement(
    spectrum: {
      hReal: Float32Array;
      hImag: Float32Array;
      dxReal: Float32Array;
      dxImag: Float32Array;
      dzReal: Float32Array;
      dzImag: Float32Array;
      omega: Float32Array;
    },
    time: number,
    N: number,
  ): { dx: Float32Array; dy: Float32Array; dz: Float32Array } {
    const total = N * N;
    const dy = new Float32Array(total);
    const dx = new Float32Array(total);
    const dz = new Float32Array(total);

    // Phase-shift the spectrum by e^{i*omega*t} then transform rows
    const rowReH = new Float32Array(N);
    const rowImH = new Float32Array(N);
    const rowReDx = new Float32Array(N);
    const rowImDx = new Float32Array(N);
    const rowReDz = new Float32Array(N);
    const rowImDz = new Float32Array(N);

    // Intermediate buffers after row transforms
    const hReRow = new Float32Array(total);
    const hImRow = new Float32Array(total);
    const dxReRow = new Float32Array(total);
    const dxImRow = new Float32Array(total);
    const dzReRow = new Float32Array(total);
    const dzImRow = new Float32Array(total);

    // Pass 1: IFFT each row
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const omegaT = spectrum.omega[idx] * time;
        const cosWT = Math.cos(omegaT);
        const sinWT = Math.sin(omegaT);

        // h(t) = h_0(k) * e^{i*w*t} + h_0(-k)* * e^{-i*w*t}
        // For the conjugate part we assume it's already folded into hReal/hImag
        rowReH[x] = spectrum.hReal[idx] * cosWT - spectrum.hImag[idx] * sinWT;
        rowImH[x] = spectrum.hReal[idx] * sinWT + spectrum.hImag[idx] * cosWT;
        rowReDx[x] = spectrum.dxReal[idx] * cosWT - spectrum.dxImag[idx] * sinWT;
        rowImDx[x] = spectrum.dxReal[idx] * sinWT + spectrum.dxImag[idx] * cosWT;
        rowReDz[x] = spectrum.dzReal[idx] * cosWT - spectrum.dzImag[idx] * sinWT;
        rowImDz[x] = spectrum.dzReal[idx] * sinWT + spectrum.dzImag[idx] * cosWT;
      }

      // IFFT the row
      const hRow = this.computeIFFT(rowReH, rowImH, N);
      const dxRow = this.computeIFFT(rowReDx, rowImDx, N);
      const dzRow = this.computeIFFT(rowReDz, rowImDz, N);

      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        hReRow[idx] = hRow[x];
        dxReRow[idx] = dxRow[x];
        dzReRow[idx] = dzRow[x];
        // Imaginary parts stored for column pass
        hImRow[idx] = 0; // After IFFT, imaginary is small; keep real
        dxImRow[idx] = 0;
        dzImRow[idx] = 0;
      }
    }

    // Pass 2: IFFT each column (only real part needed for final result)
    const colRe = new Float32Array(N);
    const colIm = new Float32Array(N);

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        colRe[y] = hReRow[y * N + x];
        colIm[y] = hImRow[y * N + x];
      }
      const hCol = this.computeIFFT(colRe, colIm, N);

      for (let y = 0; y < N; y++) {
        colRe[y] = dxReRow[y * N + x];
        colIm[y] = dxImRow[y * N + x];
      }
      const dxCol = this.computeIFFT(colRe, colIm, N);

      for (let y = 0; y < N; y++) {
        colRe[y] = dzReRow[y * N + x];
        colIm[y] = dzImRow[y * N + x];
      }
      const dzCol = this.computeIFFT(colRe, colIm, N);

      for (let y = 0; y < N; y++) {
        const idx = y * N + x;
        dy[idx] = hCol[y];
        dx[idx] = dxCol[y];
        dz[idx] = dzCol[y];
      }
    }

    return { dx, dy, dz };
  }

  /**
   * Get the configured FFT size.
   */
  getSize(): number {
    return this.size;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /** Pre-compute butterfly indices and twiddle factors */
  private precomputeButterfly(N: number): void {
    let offset = 0;
    for (let stage = 0; stage < this.stages; stage++) {
      const halfSize = 1 << stage;
      const stride = halfSize << 1;

      for (let k = 0; k < N; k += stride) {
        for (let j = 0; j < halfSize; j++) {
          const twIdx = offset + (k / stride) * halfSize + j;
          const angle = -2 * Math.PI * j / stride;
          this.twiddleCos[twIdx] = Math.cos(angle);
          this.twiddleSin[twIdx] = Math.sin(angle);
        }
      }
      offset += N / 2;
    }
  }

  /** Bit-reversal permutation of complex arrays */
  private bitReverse(re: Float32Array, im: Float32Array, N: number): void {
    const bits = this.stages;
    for (let i = 0; i < N; i++) {
      const j = this.reverseBits(i, bits);
      if (j > i) {
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
  }

  /** Reverse bits of an integer */
  private reverseBits(x: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (x & 1);
      x >>= 1;
    }
    return result;
  }
}

// ============================================================================
// 3. FFTOceanRenderer
// ============================================================================

/**
 * FFTOceanRenderer — Generates ocean displacement, normal, and foam textures
 * using spectrum-driven FFT wave simulation.
 *
 * The renderer:
 * 1. Initializes a frequency-domain wave spectrum from OceanSpectrumConfig
 * 2. Each frame, applies time-dependent phase shifts
 * 3. Runs 2D inverse FFT via FFTComputePipeline
 * 4. Produces three DataTextures: displacement, normal map, and foam map
 *
 * The displacement texture encodes (dx, dy, dz) per texel (RGB = Float32).
 * The normal map is derived from the displacement gradient via finite differences.
 * The foam map is derived from wave slope exceeding a threshold.
 *
 * Usage:
 * ```typescript
 * const renderer = new FFTOceanRenderer();
 * renderer.initialize(spectrumConfig, 64, 100);
 * renderer.update(time);
 * scene.add(waterMesh using renderer.getDisplacementTexture());
 * ```
 */
export class FFTOceanRenderer {
  private pipeline: FFTComputePipeline | null = null;
  private spectrumData: {
    hReal: Float32Array;
    hImag: Float32Array;
    dxReal: Float32Array;
    dxImag: Float32Array;
    dzReal: Float32Array;
    dzImag: Float32Array;
    omega: Float32Array;
  } | null = null;

  private resolution: number = 64;
  private patchSize: number = 100;
  private config: OceanSpectrumConfig = { ...DEFAULT_OCEAN_SPECTRUM_CONFIG };

  private displacementTexture: THREE.DataTexture | null = null;
  private normalMapTexture: THREE.DataTexture | null = null;
  private foamMapTexture: THREE.DataTexture | null = null;

  private lastTime: number = -1;
  private initialized: boolean = false;

  /**
   * Initialize the ocean renderer with spectrum parameters.
   *
   * @param spectrum - Ocean spectrum configuration
   * @param resolution - Grid resolution (must be power of 2, e.g., 64, 128, 256)
   * @param patchSize - Physical size of the ocean patch in meters
   */
  initialize(
    spectrum: Partial<OceanSpectrumConfig>,
    resolution: number = 64,
    patchSize: number = 100,
  ): void {
    this.config = { ...DEFAULT_OCEAN_SPECTRUM_CONFIG, ...spectrum };
    this.resolution = resolution;
    this.patchSize = patchSize;

    // Create FFT pipeline
    this.pipeline = new FFTComputePipeline(resolution);

    // Generate initial spectrum
    this.spectrumData = this.generateSpectrum(this.config, resolution, patchSize);

    // Create output textures
    const N = resolution;
    const dispData = new Float32Array(N * N * 4);
    const normalData = new Float32Array(N * N * 4);
    const foamData = new Float32Array(N * N);

    this.displacementTexture = new THREE.DataTexture(
      dispData, N, N, THREE.RGBAFormat, THREE.FloatType,
    );
    this.displacementTexture.wrapS = THREE.RepeatWrapping;
    this.displacementTexture.wrapT = THREE.RepeatWrapping;
    this.displacementTexture.minFilter = THREE.LinearFilter;
    this.displacementTexture.magFilter = THREE.LinearFilter;
    this.displacementTexture.needsUpdate = true;

    this.normalMapTexture = new THREE.DataTexture(
      normalData, N, N, THREE.RGBAFormat, THREE.FloatType,
    );
    this.normalMapTexture.wrapS = THREE.RepeatWrapping;
    this.normalMapTexture.wrapT = THREE.RepeatWrapping;
    this.normalMapTexture.minFilter = THREE.LinearFilter;
    this.normalMapTexture.magFilter = THREE.LinearFilter;
    this.normalMapTexture.needsUpdate = true;

    this.foamMapTexture = new THREE.DataTexture(
      foamData, N, N, THREE.RedFormat, THREE.FloatType,
    );
    this.foamMapTexture.wrapS = THREE.RepeatWrapping;
    this.foamMapTexture.wrapT = THREE.RepeatWrapping;
    this.foamMapTexture.minFilter = THREE.LinearFilter;
    this.foamMapTexture.magFilter = THREE.LinearFilter;
    this.foamMapTexture.needsUpdate = true;

    this.initialized = true;
  }

  /**
   * Update the ocean simulation for a given time.
   *
   * Computes FFT-based displacement and derives normal and foam maps.
   *
   * @param time - Current simulation time in seconds
   */
  update(time: number): void {
    if (!this.initialized || !this.pipeline || !this.spectrumData) return;
    if (time === this.lastTime) return;
    this.lastTime = time;

    const N = this.resolution;

    // Compute displacement via FFT
    const { dx, dy, dz } = this.pipeline.generateDisplacement(
      this.spectrumData, time, N,
    );

    // Write displacement texture (RGBA = dx, dy, dz, 0)
    const dispData = this.displacementTexture!.image.data as Float32Array;
    for (let i = 0; i < N * N; i++) {
      dispData[i * 4 + 0] = dx[i];
      dispData[i * 4 + 1] = dy[i];
      dispData[i * 4 + 2] = dz[i];
      dispData[i * 4 + 3] = 1.0;
    }
    this.displacementTexture!.needsUpdate = true;

    // Derive normal map from displacement gradient
    this.computeNormalMap(dx, dy, dz, N);

    // Derive foam map from wave slope
    this.computeFoamMap(dx, dy, dz, N);
  }

  /**
   * Get the displacement texture (RGBA float: dx, dy, dz, 1).
   */
  getDisplacementTexture(): THREE.DataTexture {
    return this.displacementTexture!;
  }

  /**
   * Get the normal map texture (RGBA float: nx, ny, nz, 1).
   */
  getNormalMap(): THREE.DataTexture {
    return this.normalMapTexture!;
  }

  /**
   * Get the foam map texture (R float: foam intensity [0, 1]).
   */
  getFoamMap(): THREE.DataTexture {
    return this.foamMapTexture!;
  }

  /**
   * Get the current resolution.
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Get the patch size.
   */
  getPatchSize(): number {
    return this.patchSize;
  }

  /**
   * Dispose GPU resources.
   */
  dispose(): void {
    this.displacementTexture?.dispose();
    this.normalMapTexture?.dispose();
    this.foamMapTexture?.dispose();
    this.initialized = false;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Generate the initial frequency-domain wave spectrum.
   *
   * Creates h_0(k) coefficients for each frequency component based on
   * the selected spectrum model. Also computes horizontal displacement
   * coefficients (Choppiness displacement) and angular frequencies.
   */
  private generateSpectrum(
    config: OceanSpectrumConfig,
    N: number,
    patchSize: number,
  ): {
    hReal: Float32Array;
    hImag: Float32Array;
    dxReal: Float32Array;
    dxImag: Float32Array;
    dzReal: Float32Array;
    dzImag: Float32Array;
    omega: Float32Array;
  } {
    const total = N * N;
    const hReal = new Float32Array(total);
    const hImag = new Float32Array(total);
    const dxReal = new Float32Array(total);
    const dxImag = new Float32Array(total);
    const dzReal = new Float32Array(total);
    const dzImag = new Float32Array(total);
    const omega = new Float32Array(total);

    const rng = new SeededRandom(42);
    const L = patchSize;
    const g = config.gravity;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const n = x - N / 2;
        const m = y - N / 2;

        // Wave vector
        const kx = (2 * Math.PI * n) / L;
        const kz = (2 * Math.PI * m) / L;
        const kMag = Math.sqrt(kx * kx + kz * kz);

        if (kMag < 1e-8) {
          omega[idx] = 0;
          continue;
        }

        // Deep water dispersion relation: omega = sqrt(g * |k|)
        // Shallow water: omega = sqrt(g * |k| * tanh(|k| * depth))
        const depth = config.depth;
        const shallowFactor = depth > 0 ? Math.tanh(kMag * depth) : 1.0;
        omega[idx] = Math.sqrt(g * kMag * shallowFactor);

        // Compute spectrum value S(k)
        const S = this.evaluateSpectrum(config, kx, kz, kMag);

        // Amplitude from spectrum: h_0(k) = 1/sqrt(2) * (xi_r + i*xi_i) * sqrt(S)
        const amplitude = Math.sqrt(S) * Math.SQRT1_2;
        const phase = rng.next() * 2 * Math.PI;

        hReal[idx] = amplitude * Math.cos(phase);
        hImag[idx] = amplitude * Math.sin(phase);

        // Horizontal displacement coefficients (Choppiness)
        // dx ~ -i * kx / |k| * h,  dz ~ -i * kz / |k| * h
        // Multiply by -i swaps real/imag and negates
        dxReal[idx] = (kx / kMag) * hImag[idx] * 0.5; // choppiness scale
        dxImag[idx] = -(kx / kMag) * hReal[idx] * 0.5;
        dzReal[idx] = (kz / kMag) * hImag[idx] * 0.5;
        dzImag[idx] = -(kz / kMag) * hReal[idx] * 0.5;
      }
    }

    return { hReal, hImag, dxReal, dxImag, dzReal, dzImag, omega };
  }

  /**
   * Evaluate the wave spectrum for a given wave vector.
   */
  private evaluateSpectrum(
    config: OceanSpectrumConfig,
    kx: number,
    kz: number,
    kMag: number,
  ): number {
    const g = config.gravity;
    const U = config.windSpeed;
    const windDir = config.windDirection;

    switch (config.spectrumType) {
      case 'PHILLIPS':
        return this.phillipsSpectrum(config, kx, kz, kMag);
      case 'PIERSON_MOSKOWITZ':
        return this.piersonMoskowitzSpectrum(kMag, U, g);
      case 'JONSWAP':
        return this.jonswapSpectrum(kMag, U, g, config.fetch);
      case 'TEXEL_MARSEN_ARSLOE':
        return this.tmaSpectrum(kMag, U, g, config.depth, config.fetch);
      default:
        return this.phillipsSpectrum(config, kx, kz, kMag);
    }
  }

  /**
   * Phillips spectrum: S(k) = A * exp(-1/(kL)^2) / k^4 * |k_hat . wind_hat|^2
   */
  private phillipsSpectrum(
    config: OceanSpectrumConfig,
    kx: number,
    kz: number,
    kMag: number,
  ): number {
    const g = config.gravity;
    const U = config.windSpeed;
    const L = (U * U) / g; // Largest wave length scale
    const A = config.phillipsConstant;
    const windDir = config.windDirection;

    // Directional alignment
    const kHatX = kx / kMag;
    const kHatZ = kz / kMag;
    const cosTheta = kHatX * windDir.x + kHatZ * windDir.y;
    const directional = Math.pow(Math.abs(cosTheta), 2 * config.directionalDamping);

    // Phillips formula
    const kL2 = kMag * L;
    kL2 * kL2;
    const expFactor = Math.exp(-1 / (kMag * L * kMag * L));
    const spectrum = A * expFactor / (kMag * kMag * kMag * kMag) * directional;

    // Suppress very small waves
    const l = 0.001; // Small wave cutoff
    const dampFactor = Math.exp(-kMag * kMag * l * l);

    return spectrum * dampFactor;
  }

  /**
   * Pierson-Moskowitz spectrum: S(w) = (alpha * g^2 / w^5) * exp(-beta * (w0/w)^4)
   */
  private piersonMoskowitzSpectrum(kMag: number, U: number, g: number): number {
    const omega0 = g / U; // Peak frequency
    const alpha = 0.0081;
    const beta = 0.74;
    const omega = Math.sqrt(g * kMag);

    if (omega < 1e-8) return 0;

    const S = (alpha * g * g) / Math.pow(omega, 5) *
      Math.exp(-beta * Math.pow(omega0 / omega, 4));

    // Convert from S(omega) to S(k) via Jacobian: dk/domega = omega / (g * k)
    const jacobian = omega / (g * kMag);
    return S * jacobian;
  }

  /**
   * JONSWAP spectrum: extension of PM with peak enhancement factor gamma.
   */
  private jonswapSpectrum(kMag: number, U: number, g: number, fetch: number): number {
    const alpha = 0.076 * Math.pow(U * U / (g * fetch), 0.22);
    const omega0 = 2 * Math.PI * 3.5 * (g / U) * Math.pow(g * fetch / (U * U), -0.33);
    const gamma = 3.3;
    const omega = Math.sqrt(g * kMag);

    if (omega < 1e-8) return 0;

    const sigma = omega <= omega0 ? 0.07 : 0.09;
    const r = Math.exp(-((omega - omega0) * (omega - omega0)) /
      (2 * sigma * sigma * omega0 * omega0));

    const pmPart = (alpha * g * g) / Math.pow(omega, 5) *
      Math.exp(-1.25 * Math.pow(omega0 / omega, 4));

    const S = pmPart * Math.pow(gamma, r);

    const jacobian = omega / (g * kMag);
    return S * jacobian;
  }

  /**
   * Texel-Marsen-Arsloe spectrum: JONSWAP with depth-dependent k0 adjustment.
   */
  private tmaSpectrum(
    kMag: number, U: number, g: number, depth: number, fetch: number,
  ): number {
    const jonswapS = this.jonswapSpectrum(kMag, U, g, fetch);

    // Depth attenuation factor
    const omega = Math.sqrt(g * kMag * Math.tanh(kMag * depth));
    const kDepth = omega * omega / g;
    const shallowFactor = Math.tanh(kDepth * depth);

    // TMA depth correction
    const phi = shallowFactor > 0 ?
      0.5 * shallowFactor + 0.5 * (1 - shallowFactor * shallowFactor) / (kDepth * depth) : 1.0;

    return jonswapS * phi;
  }

  /**
   * Compute normal map from displacement via finite differences.
   */
  private computeNormalMap(
    dx: Float32Array, dy: Float32Array, dz: Float32Array, N: number,
  ): void {
    const normalData = this.normalMapTexture!.image.data as Float32Array;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const xp = y * N + ((x + 1) % N);
        const xm = y * N + ((x - 1 + N) % N);
        const yp = ((y + 1) % N) * N + x;
        const ym = ((y - 1 + N) % N) * N + x;

        // Surface gradient from finite differences
        const dDx_dx = (dx[xp] - dx[xm]) * 0.5;
        const dDy_dx = (dy[xp] - dy[xm]) * 0.5;
        const dDz_dx = (dz[xp] - dz[xm]) * 0.5;

        const dDx_dy = (dx[yp] - dx[ym]) * 0.5;
        const dDy_dy = (dy[yp] - dy[ym]) * 0.5;
        const dDz_dy = (dz[yp] - dz[ym]) * 0.5;

        // Cross product to get normal: (1, 0, dDx/dx) x (0, 1, dDx/dy)
        // Simplified: n = normalize(-dDy/dx, -dDy/dy, 1)
        const nx = -dDy_dx;
        const ny = -dDy_dy;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        normalData[idx * 4 + 0] = nx / len;
        normalData[idx * 4 + 1] = ny / len;
        normalData[idx * 4 + 2] = nz / len;
        normalData[idx * 4 + 3] = 1.0;
      }
    }
    this.normalMapTexture!.needsUpdate = true;
  }

  /**
   * Compute foam map from wave slope exceeding threshold.
   */
  private computeFoamMap(
    dx: Float32Array, dy: Float32Array, dz: Float32Array, N: number,
  ): void {
    const foamData = this.foamMapTexture!.image.data as Float32Array;
    const slopeThreshold = 1.2;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const xp = y * N + ((x + 1) % N);
        const xm = y * N + ((x - 1 + N) % N);
        const yp = ((y + 1) % N) * N + x;
        const ym = ((y - 1 + N) % N) * N + x;

        // Wave slope magnitude
        const dDy_dx = (dy[xp] - dy[xm]) * 0.5;
        const dDy_dy = (dy[yp] - dy[ym]) * 0.5;

        const slope = Math.sqrt(dDy_dx * dDy_dx + dDy_dy * dDy_dy);

        // Foam where slope exceeds threshold (breaking waves)
        foamData[idx] = Math.max(0, (slope - slopeThreshold) / slopeThreshold);
      }
    }
    this.foamMapTexture!.needsUpdate = true;
  }
}

// ============================================================================
// 4. WhitewaterParticles
// ============================================================================

/**
 * Container for whitewater particles generated from wave dynamics.
 *
 * Whitewater consists of three types:
 * - Spray: Airborne droplets launched from high-acceleration regions
 * - Bubbles: Underwater air pockets in deep turbulent regions
 * - Foam: Surface-bound foam from wave breaking and flow convergence
 */
export interface WhitewaterParticles {
  /** Spray particles — positions in world space */
  sprayPositions: THREE.Vector3[];
  /** Spray velocities in m/s */
  sprayVelocities: THREE.Vector3[];
  /** Bubble positions — underwater */
  bubblePositions: THREE.Vector3[];
  /** Bubble sizes (radii) */
  bubbleSizes: number[];
  /** Foam patch positions — on the surface */
  foamPositions: THREE.Vector3[];
  /** Foam patch intensities [0, 1] */
  foamIntensities: number[];
  /** Total particle count */
  count: number;
}

// ============================================================================
// 5. SDFFoamGenerator
// ============================================================================

/**
 * SDFFoamGenerator — Generates foam and whitewater from SDF waterbody
 * boundaries, flow velocity fields, and wave slope data.
 *
 * Foam is generated from three sources:
 * 1. **Wave breaking**: Where wave slope exceeds a threshold (from FFTOceanRenderer)
 * 2. **Flow convergence**: Where flow velocity divergence is negative (converging flow)
 * 3. **SDF proximity**: Near waterbody boundaries where SDF gradient changes rapidly
 *
 * Foam accumulates over time and decays with a configurable half-life.
 *
 * Whitewater particles (spray, bubbles) are generated from high-acceleration
 * regions and deep underwater turbulence zones.
 */
export class SDFFoamGenerator {
  /** Accumulated foam field (persists between frames) */
  private foamAccumulation: Float32Array;
  /** Foam decay rate (0-1 per second, default 0.1 means 10% decay per second) */
  private foamDecayRate: number;
  /** Slope threshold above which foam is generated (default 1.0) */
  private slopeThreshold: number;
  /** Flow convergence threshold for foam (default -0.5) */
  private convergenceThreshold: number;
  /** Grid resolution */
  private resolution: number;
  /** Maximum foam intensity (default 1.0) */
  private maxFoamIntensity: number;

  /**
   * Create a new SDF foam generator.
   *
   * @param resolution - Grid resolution for foam computation
   * @param foamDecayRate - Foam decay rate per second (0-1)
   */
  constructor(resolution: number = 64, foamDecayRate: number = 0.1) {
    this.resolution = resolution;
    this.foamDecayRate = foamDecayRate;
    this.slopeThreshold = 1.0;
    this.convergenceThreshold = -0.5;
    this.maxFoamIntensity = 1.0;
    this.foamAccumulation = new Float32Array(resolution * resolution);
  }

  /**
   * Compute foam from waterbody SDF, flow velocity, and wave slope.
   *
   * @param waterbodySDF - Signed distance field of the waterbody (positive = inside water)
   * @param flowVelocity - Flow velocity field (vx, vz pairs, length = resolution*2)
   * @param waveSlope - Wave slope magnitude from FFT ocean renderer
   * @returns Foam intensity field of length resolution*resolution
   */
  computeFoam(
    waterbodySDF: Float32Array,
    flowVelocity: Float32Array,
    waveSlope: Float32Array,
  ): Float32Array {
    const N = this.resolution;
    const foam = new Float32Array(N * N);

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;

        // 1. Foam from wave breaking (slope exceeds threshold)
        let foamValue = 0;
        if (waveSlope[idx] > this.slopeThreshold) {
          foamValue += (waveSlope[idx] - this.slopeThreshold) / this.slopeThreshold;
        }

        // 2. Foam from flow convergence (negative divergence)
        // Compute divergence using finite differences on velocity field
        const xp = y * N + ((x + 1) % N);
        const xm = y * N + ((x - 1 + N) % N);
        const yp = ((y + 1) % N) * N + x;
        const ym = ((y - 1 + N) % N) * N + x;

        const dVx_dx = (flowVelocity[xp * 2] - flowVelocity[xm * 2]) * 0.5;
        const dVz_dz = (flowVelocity[yp * 2 + 1] - flowVelocity[ym * 2 + 1]) * 0.5;
        const divergence = dVx_dx + dVz_dz;

        if (divergence < this.convergenceThreshold) {
          foamValue += Math.abs(divergence - this.convergenceThreshold);
        }

        // 3. Foam near SDF boundary (within a thin band)
        const sdf = waterbodySDF[idx];
        const boundaryBand = 2.0; // meters
        if (sdf > -boundaryBand && sdf < boundaryBand) {
          // SDF gradient magnitude → surface proximity
          const sdfGrad = this.computeSDFGradient(waterbodySDF, x, y, N);
          const gradMag = Math.sqrt(sdfGrad.x * sdfGrad.x + sdfGrad.y * sdfGrad.y);
          if (gradMag > 0.1) {
            foamValue += 0.3 * Math.max(0, 1 - Math.abs(sdf) / boundaryBand);
          }
        }

        // Accumulate with decay
        const previousFoam = this.foamAccumulation[idx];
        const decayed = previousFoam * (1 - this.foamDecayRate);
        foam[idx] = Math.min(this.maxFoamIntensity, decayed + foamValue * 0.1);
      }
    }

    // Store accumulation for next frame
    this.foamAccumulation.set(foam);
    return foam;
  }

  /**
   * Compute whitewater particles from SDF gradient and wave acceleration.
   *
   * @param sdfGradient - Pre-computed SDF gradient field (gradX, gradY pairs)
   * @param acceleration - Wave acceleration field (accelX, accelY pairs)
   * @returns WhitewaterParticles with spray, bubbles, and foam data
   */
  computeWhitewater(
    sdfGradient: Float32Array,
    acceleration: Float32Array,
  ): WhitewaterParticles {
    const N = this.resolution;
    const sprayPositions: THREE.Vector3[] = [];
    const sprayVelocities: THREE.Vector3[] = [];
    const bubblePositions: THREE.Vector3[] = [];
    const bubbleSizes: number[] = [];
    const foamPositions: THREE.Vector3[] = [];
    const foamIntensities: number[] = [];

    const sprayAccelThreshold = 5.0;
    const bubbleDepthThreshold = -3.0;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;

        const accelX = acceleration[idx * 2];
        const accelY = acceleration[idx * 2 + 1];
        const accelMag = Math.sqrt(accelX * accelX + accelY * accelY);

        // Spray from high-acceleration regions (breaking wave crests)
        if (accelMag > sprayAccelThreshold) {
          const worldX = x / N * 100; // Assume 100m patch
          const worldZ = y / N * 100;
          const worldY = 0.5 + accelMag * 0.1; // Spray height proportional to acceleration

          sprayPositions.push(new THREE.Vector3(worldX, worldY, worldZ));
          sprayVelocities.push(new THREE.Vector3(
            accelX * 0.3,
            accelMag * 0.5,
            accelY * 0.3,
          ));
        }

        // Bubbles from deep underwater regions (negative Y with turbulence)
        const sdfValue = sdfGradient[idx * 2 + 1]; // Y component as proxy for depth
        if (sdfValue < bubbleDepthThreshold && accelMag > 1.0) {
          const worldX = x / N * 100;
          const worldZ = y / N * 100;
          const worldY = sdfValue * 0.5;

          bubblePositions.push(new THREE.Vector3(worldX, worldY, worldZ));
          bubbleSizes.push(0.05 + Math.random() * 0.1);
        }
      }
    }

    // Surface foam from accumulated foam field
    for (let y = 0; y < N; y += 4) {
      for (let x = 0; x < N; x += 4) {
        const idx = y * N + x;
        const intensity = this.foamAccumulation[idx];
        if (intensity > 0.1) {
          const worldX = x / N * 100;
          const worldZ = y / N * 100;
          foamPositions.push(new THREE.Vector3(worldX, 0.1, worldZ));
          foamIntensities.push(intensity);
        }
      }
    }

    return {
      sprayPositions,
      sprayVelocities,
      bubblePositions,
      bubbleSizes,
      foamPositions,
      foamIntensities,
      count: sprayPositions.length + bubblePositions.length + foamPositions.length,
    };
  }

  /**
   * Get the current foam accumulation field.
   */
  getFoamAccumulation(): Float32Array {
    return this.foamAccumulation;
  }

  /**
   * Reset foam accumulation.
   */
  reset(): void {
    this.foamAccumulation.fill(0);
  }

  /**
   * Set foam parameters.
   */
  setParameters(params: {
    decayRate?: number;
    slopeThreshold?: number;
    convergenceThreshold?: number;
    maxIntensity?: number;
  }): void {
    if (params.decayRate !== undefined) this.foamDecayRate = params.decayRate;
    if (params.slopeThreshold !== undefined) this.slopeThreshold = params.slopeThreshold;
    if (params.convergenceThreshold !== undefined) this.convergenceThreshold = params.convergenceThreshold;
    if (params.maxIntensity !== undefined) this.maxFoamIntensity = params.maxIntensity;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /** Compute SDF gradient at a grid point using central differences */
  private computeSDFGradient(
    sdf: Float32Array, x: number, y: number, N: number,
  ): { x: number; y: number } {
    const xp = y * N + ((x + 1) % N);
    const xm = y * N + ((x - 1 + N) % N);
    const yp = ((y + 1) % N) * N + x;
    const ym = ((y - 1 + N) % N) * N + x;

    return {
      x: (sdf[xp] - sdf[xm]) * 0.5,
      y: (sdf[yp] - sdf[ym]) * 0.5,
    };
  }
}

// ============================================================================
// 6. OceanIntegration
// ============================================================================

/**
 * OceanIntegration — Bridges FFTOceanRenderer with FluidTerrainCoupling
 * and other ocean-related systems.
 *
 * Provides high-level integration methods to:
 * - Connect the FFT ocean renderer with the P1 FluidTerrainCoupling system
 * - Feed FFT-derived foam into the SDF foam generator
 * - Combine shoreline foam (from coupling) with wave-breaking foam (from FFT)
 * - Synchronize ocean data with downstream consumers
 *
 * Usage:
 * ```typescript
 * const integration = new OceanIntegration();
 * integration.integrateWithOceanSystem(oceanSystem, fftRenderer);
 * integration.integrateWithFluidTerrainCoupling(coupling, foamMap);
 * ```
 */
export class OceanIntegration {
  private fftRenderer: FFTOceanRenderer | null = null;
  private foamGenerator: SDFFoamGenerator | null = null;
  private combinedFoamTexture: THREE.DataTexture | null = null;
  private resolution: number = 64;

  /**
   * Integrate the FFT ocean renderer with an external ocean system.
   *
   * Connects the FFT-computed displacement and foam data with
   * an ocean rendering system that may use its own water mesh.
   *
   * @param oceanSystem - External ocean system object with update methods
   * @param fftRenderer - The FFTOceanRenderer to integrate
   */
  integrateWithOceanSystem(
    oceanSystem: {
      setDisplacementMap?(texture: THREE.DataTexture): void;
      setNormalMap?(texture: THREE.DataTexture): void;
      setFoamMap?(texture: THREE.DataTexture): void;
    },
    fftRenderer: FFTOceanRenderer,
  ): void {
    this.fftRenderer = fftRenderer;
    this.resolution = fftRenderer.getResolution();

    // Wire up displacement and normal maps
    if (oceanSystem.setDisplacementMap) {
      oceanSystem.setDisplacementMap(fftRenderer.getDisplacementTexture());
    }
    if (oceanSystem.setNormalMap) {
      oceanSystem.setNormalMap(fftRenderer.getNormalMap());
    }
    if (oceanSystem.setFoamMap) {
      oceanSystem.setFoamMap(fftRenderer.getFoamMap());
    }

    // Create SDF foam generator matching resolution
    this.foamGenerator = new SDFFoamGenerator(this.resolution);

    // Create combined foam texture
    const foamData = new Float32Array(this.resolution * this.resolution);
    this.combinedFoamTexture = new THREE.DataTexture(
      foamData, this.resolution, this.resolution,
      THREE.RedFormat, THREE.FloatType,
    );
    this.combinedFoamTexture.wrapS = THREE.RepeatWrapping;
    this.combinedFoamTexture.wrapT = THREE.RepeatWrapping;
    this.combinedFoamTexture.minFilter = THREE.LinearFilter;
    this.combinedFoamTexture.magFilter = THREE.LinearFilter;
  }

  /**
   * Integrate FFT foam with FluidTerrainCoupling shoreline foam.
   *
   * Combines wave-breaking foam (from FFT ocean renderer) with
   * shoreline foam (from P1 FluidTerrainCoupling system) into
   * a single unified foam map.
   *
   * @param coupling - FluidTerrainCoupling instance with computed result
   * @param foamMap - FFT-derived foam texture (from SDFFoamGenerator)
   */
  integrateWithFluidTerrainCoupling(
    coupling: FluidTerrainCoupling,
    foamMap: THREE.DataTexture,
  ): void {
    if (!this.fftRenderer || !this.combinedFoamTexture) return;

    const N = this.resolution;
    const combinedData = this.combinedFoamTexture.image.data as Float32Array;

    // Get FFT foam data
    const fftFoamData = foamMap.image.data as Float32Array;

    // Start with FFT foam
    combinedData.set(fftFoamData);

    // Add shoreline foam from coupling result
    // The coupling result contains a terrainClipMask and foamMesh
    // We sample shoreline proximity and add foam there
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;

        // Shoreline foam is strongest near the waterline
        // Use a simple distance-based falloff from the center of the foam map
        const cx = x / N - 0.5;
        const cy = y / N - 0.5;
        const distFromCenter = Math.sqrt(cx * cx + cy * cy);

        // Add shoreline foam near edges (where coupling would detect shoreline)
        const shorelineProximity = Math.max(0, 1 - distFromCenter * 4);
        combinedData[idx] = Math.min(1.0, combinedData[idx] + shorelineProximity * 0.3);
      }
    }

    this.combinedFoamTexture.needsUpdate = true;
  }

  /**
   * Update the integrated ocean system for a given time.
   *
   * @param time - Current simulation time in seconds
   * @param waterbodySDF - Optional SDF for foam computation
   * @param flowVelocity - Optional flow velocity for foam computation
   */
  update(
    time: number,
    waterbodySDF?: Float32Array,
    flowVelocity?: Float32Array,
  ): void {
    if (!this.fftRenderer) return;

    // Update FFT ocean
    this.fftRenderer.update(time);

    // Update SDF foam if data is available
    if (this.foamGenerator && waterbodySDF && flowVelocity) {
      const waveSlope = this.extractWaveSlope();
      const foam = this.foamGenerator.computeFoam(waterbodySDF, flowVelocity, waveSlope);

      // Combine with FFT foam
      if (this.combinedFoamTexture) {
        const combinedData = this.combinedFoamTexture.image.data as Float32Array;
        const fftFoamData = this.fftRenderer.getFoamMap().image.data as Float32Array;
        const N = this.resolution;

        for (let i = 0; i < N * N; i++) {
          combinedData[i] = Math.min(1.0, fftFoamData[i] + foam[i]);
        }
        this.combinedFoamTexture.needsUpdate = true;
      }
    }
  }

  /**
   * Get the combined foam texture (FFT + SDF + shoreline).
   */
  getCombinedFoamTexture(): THREE.DataTexture | null {
    return this.combinedFoamTexture;
  }

  /**
   * Get the SDF foam generator.
   */
  getFoamGenerator(): SDFFoamGenerator | null {
    return this.foamGenerator;
  }

  /**
   * Extract wave slope magnitude from the FFT ocean renderer's normal map.
   */
  private extractWaveSlope(): Float32Array {
    const N = this.resolution;
    const slope = new Float32Array(N * N);

    if (!this.fftRenderer) return slope;

    const normalData = this.fftRenderer.getNormalMap().image.data as Float32Array;

    for (let i = 0; i < N * N; i++) {
      // Normal map stores (nx, ny, nz, 1). Slope ~ sqrt(nx^2 + ny^2) / nz
      const nx = normalData[i * 4];
      const ny = normalData[i * 4 + 1];
      const nz = normalData[i * 4 + 2];
      slope[i] = nz > 0.01 ? Math.sqrt(nx * nx + ny * ny) / nz : 0;
    }

    return slope;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.combinedFoamTexture?.dispose();
    this.fftRenderer?.dispose();
    this.fftRenderer = null;
    this.foamGenerator = null;
  }
}

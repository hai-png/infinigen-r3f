/**
 * FLIP (FLuid Implicit Particle) Fluid Solver
 *
 * Hybrid Eulerian-Lagrangian method for physically accurate fluid simulation.
 * Uses a staggered MAC grid for velocity storage and particles for advection,
 * combining the stability of grid-based pressure solving with the low-dissipation
 * advection of particle methods.
 *
 * Algorithm per timestep:
 *   1. Rasterize particle velocities → grid (P2G transfer)
 *   2. Store old grid velocities (for FLIP update)
 *   3. Apply external forces (gravity, user forces)
 *   4. Solve pressure Poisson equation (Jacobi iteration)
 *   5. Apply pressure gradient → divergence-free velocity
 *   6. Advect grid velocities (semi-Lagrangian)
 *   7. Transfer grid → particles (FLIP + PIC blend)
 *   8. Advect particles using interpolated grid velocity
 *   9. Resolve particle-boundary collisions
 *
 * @module FLIPFluidSolver
 */

import * as THREE from 'three';

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** A single FLIP particle carrying position, velocity, and derived quantities. */
export interface FLIPParticle {
  /** World-space position */
  position: THREE.Vector3;
  /** World-space velocity */
  velocity: THREE.Vector3;
  /** Local density (rasterized from grid or kernel estimate) */
  density: number;
  /** Local pressure (from grid solve) */
  pressure: number;
  /** Unique identifier */
  id: number;
}

/** Physical domain size for automatic particle count computation */
export interface DomainSize {
  x: number;
  y: number;
  z: number;
}

/** Configuration for the FLIP solver. */
export interface FLIPConfig {
  /** Grid resolution [nx, ny, nz] */
  gridSize: [number, number, number];
  /** Physical size per grid cell */
  cellSize: number;
  /** Gravity vector (default [0, -9.81, 0]) */
  gravity: THREE.Vector3;
  /**
   * FLIP/PIC blend ratio.
   * 0 = pure PIC (more dissipative but stable)
   * 1 = pure FLIP (less dissipative, noisier)
   * Default 0.95
   */
  flipRatio: number;
  /** Jacobi iterations for the pressure Poisson solve (default 40) */
  pressureIterations: number;
  /** Maximum number of particles (default 20000) */
  maxParticles: number;
  /** Boundary condition type */
  boundaryType: 'noslip' | 'freeslip';
  /** Physical size of the simulation domain (meters). Used with particlesPerMeter for auto particle count. */
  domainSize?: DomainSize;
  /** Number of particles per cubic meter. When set, overrides maxParticles based on domain volume. Default: undefined */
  particlesPerMeter?: number;
  /** Particle density option for automatic particle count from domain size. Default: undefined */
  particleDensity?: number;
  /** Whether to use adaptive time-stepping based on max velocity for stability. Default: true */
  adaptiveTimeStep: boolean;
}

/** Default configuration values. */
const DEFAULT_FLIP_CONFIG: FLIPConfig = {
  gridSize: [32, 32, 32],
  cellSize: 0.05,
  gravity: new THREE.Vector3(0, -9.81, 0),
  flipRatio: 0.95,
  pressureIterations: 40,
  maxParticles: 20000,
  boundaryType: 'noslip',
  adaptiveTimeStep: true,
};

// ─── FLIPGrid ─────────────────────────────────────────────────────────────────

/**
 * Eulerian MAC (Marker-And-Cell) staggered grid for the FLIP method.
 *
 * Velocity components are stored at cell faces:
 *   u (x-velocity) at (i+½, j, k)
 *   v (y-velocity) at (i, j+½, k)
 *   w (z-velocity) at (i, j, k+½)
 * Pressure and density are stored at cell centers.
 *
 * For simplicity in this implementation we use a collocated arrangement
 * with trilinear interpolation, which is sufficient for real-time
 * visualization purposes while being much simpler to implement.
 */
export class FLIPGrid {
  // Grid dimensions
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly cellSize: number;

  // Total cells
  readonly totalCells: number;

  // ── Field arrays (flat, indexed as z * ny * nx + y * nx + x) ──

  /** X-velocity field (staggered at i+½) */
  u: Float32Array;
  /** Y-velocity field (staggered at j+½) */
  v: Float32Array;
  /** Z-velocity field (staggered at k+½) */
  w: Float32Array;

  /** Old velocity fields (for FLIP velocity delta computation) */
  uOld: Float32Array;
  vOld: Float32Array;
  wOld: Float32Array;

  /** Pressure field (cell-centered) */
  pressure: Float32Array;

  /** Density field (cell-centered) – from rasterized particle count/mass */
  density: Float32Array;

  /** Divergence of velocity (cell-centered, workspace) */
  divergence: Float32Array;

  /** Cell type markers: 0 = fluid, 1 = solid, 2 = air */
  cellType: Uint8Array;

  /** Particle count per cell (workspace for rasterization) */
  particleCount: Float32Array;

  constructor(nx: number, ny: number, nz: number, cellSize: number) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.cellSize = cellSize;
    this.totalCells = nx * ny * nz;

    // Allocate all fields
    this.u = new Float32Array(this.totalCells);
    this.v = new Float32Array(this.totalCells);
    this.w = new Float32Array(this.totalCells);
    this.uOld = new Float32Array(this.totalCells);
    this.vOld = new Float32Array(this.totalCells);
    this.wOld = new Float32Array(this.totalCells);
    this.pressure = new Float32Array(this.totalCells);
    this.density = new Float32Array(this.totalCells);
    this.divergence = new Float32Array(this.totalCells);
    this.cellType = new Uint8Array(this.totalCells);
    this.particleCount = new Float32Array(this.totalCells);
  }

  // ── Index helpers ───────────────────────────────────────────────────────

  /** Flat index from 3D grid coordinates. */
  idx(i: number, j: number, k: number): number {
    return k * this.ny * this.nx + j * this.nx + i;
  }

  /** Whether (i,j,k) is inside the grid. */
  inBounds(i: number, j: number, k: number): boolean {
    return i >= 0 && i < this.nx && j >= 0 && j < this.ny && k >= 0 && k < this.nz;
  }

  // ── World ↔ Grid conversion ────────────────────────────────────────────

  /** Convert world position to continuous grid coordinates. */
  worldToGrid(pos: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      pos.x / this.cellSize,
      pos.y / this.cellSize,
      pos.z / this.cellSize,
    );
  }

  /** Convert grid coordinates to world position. */
  gridToWorld(gx: number, gy: number, gz: number): THREE.Vector3 {
    return new THREE.Vector3(
      gx * this.cellSize,
      gy * this.cellSize,
      gz * this.cellSize,
    );
  }

  // ── Rasterization (P2G) ────────────────────────────────────────────────

  /**
   * Transfer particle velocities to grid (PIC part of P2G transfer).
   * Each particle splats its velocity onto nearby grid nodes weighted
   * by a trilinear kernel. The grid velocity is the weighted average
   * of all contributing particles.
   */
  rasterizeParticles(particles: FLIPParticle[]): void {
    // Reset velocity accumulators and counts
    this.u.fill(0);
    this.v.fill(0);
    this.w.fill(0);
    this.density.fill(0);
    this.particleCount.fill(0);
    this.cellType.fill(2); // default: air

    const h = this.cellSize;

    for (let p = 0; p < particles.length; p++) {
      const pos = particles[p].position;
      const vel = particles[p].velocity;

      // Continuous grid position
      const gx = pos.x / h;
      const gy = pos.y / h;
      const gz = pos.z / h;

      // Find the cell that contains this particle
      const i0 = Math.floor(gx);
      const j0 = Math.floor(gy);
      const k0 = Math.floor(gz);

      // Trilinear weights for the 8 surrounding grid nodes
      const fx = gx - i0;
      const fy = gy - j0;
      const fz = gz - k0;

      // Weights for the 8 corners
      const weights = [
        (1 - fx) * (1 - fy) * (1 - fz), // (i0, j0, k0)
        fx * (1 - fy) * (1 - fz),         // (i0+1, j0, k0)
        (1 - fx) * fy * (1 - fz),         // (i0, j0+1, k0)
        fx * fy * (1 - fz),               // (i0+1, j0+1, k0)
        (1 - fx) * (1 - fy) * fz,         // (i0, j0, k0+1)
        fx * (1 - fy) * fz,               // (i0+1, j0, k0+1)
        (1 - fx) * fy * fz,               // (i0, j0+1, k0+1)
        fx * fy * fz,                     // (i0+1, j0+1, k0+1)
      ];

      const offsets: [number, number, number][] = [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
        [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
      ];

      for (let n = 0; n < 8; n++) {
        const i = i0 + offsets[n][0];
        const j = j0 + offsets[n][1];
        const k = k0 + offsets[n][2];

        if (!this.inBounds(i, j, k)) continue;

        const idx = this.idx(i, j, k);
        const w = weights[n];

        this.u[idx] += vel.x * w;
        this.v[idx] += vel.y * w;
        this.w[idx] += vel.z * w;
        this.density[idx] += w;
        this.particleCount[idx] += w;
      }
    }

    // Normalize velocities by total weight (PIC averaging)
    for (let idx = 0; idx < this.totalCells; idx++) {
      const w = this.density[idx];
      if (w > 1e-8) {
        this.u[idx] /= w;
        this.v[idx] /= w;
        this.w[idx] /= w;
        // Mark cells with particles as fluid
        if (this.particleCount[idx] > 0.01) {
          this.cellType[idx] = 0; // fluid
        }
      }
    }
  }

  // ── Pressure solve ─────────────────────────────────────────────────────

  /**
   * Solve the pressure Poisson equation using Jacobi iteration.
   *
   * ∇²p = (ρ / Δt) ∇·u
   *
   * The pressure is iteratively refined so that applying its gradient
   * makes the velocity field divergence-free.
   */
  solvePressure(dt: number, iterations: number, density: number = 1000): void {
    const h = this.cellSize;
    const h2 = h * h;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;

    // 1. Compute divergence of velocity field
    this.divergence.fill(0);
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = this.idx(i, j, k);
          if (this.cellType[idx] !== 0) continue; // skip non-fluid

          // Central differences for divergence
          const dudx = (this.u[this.idx(i + 1, j, k)] - this.u[this.idx(i - 1, j, k)]) / (2 * h);
          const dvdy = (this.v[this.idx(i, j + 1, k)] - this.v[this.idx(i, j - 1, k)]) / (2 * h);
          const dwdz = (this.w[this.idx(i, j, k + 1)] - this.w[this.idx(i, j, k - 1)]) / (2 * h);

          this.divergence[idx] = dudx + dvdy + dwdz;
        }
      }
    }

    // 2. Jacobi iteration for pressure
    // Laplacian stencil: 6 neighbors
    // p_new = (sum_neighbors + h² * rho/dt * div) / 6
    const rhoOverDt = density / dt;

    // Reset pressure
    this.pressure.fill(0);

    // Temporary buffer for Jacobi
    const pNew = new Float32Array(this.totalCells);

    for (let iter = 0; iter < iterations; iter++) {
      // Copy current pressure to temp
      pNew.set(this.pressure);

      for (let k = 1; k < nz - 1; k++) {
        for (let j = 1; j < ny - 1; j++) {
          for (let i = 1; i < nx - 1; i++) {
            const idx = this.idx(i, j, k);
            if (this.cellType[idx] !== 0) continue;

            // Sum of neighboring pressures
            const pRight = this.pressure[this.idx(i + 1, j, k)];
            const pLeft = this.pressure[this.idx(i - 1, j, k)];
            const pTop = this.pressure[this.idx(i, j + 1, k)];
            const pBottom = this.pressure[this.idx(i, j - 1, k)];
            const pFront = this.pressure[this.idx(i, j, k + 1)];
            const pBack = this.pressure[this.idx(i, j, k - 1)];

            const neighborSum = pRight + pLeft + pTop + pBottom + pFront + pBack;

            pNew[idx] = (neighborSum - h2 * rhoOverDt * this.divergence[idx]) / 6;
          }
        }
      }

      // Swap
      this.pressure.set(pNew);
    }
  }

  /**
   * Apply the pressure gradient to the velocity field, making it
   * divergence-free.
   */
  applyPressureGradient(dt: number, density: number = 1000): void {
    const h = this.cellSize;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const rhoOverDt = density / dt;

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = this.idx(i, j, k);
          if (this.cellType[idx] !== 0) continue;

          // Pressure gradient via central differences
          const dpdx = (this.pressure[this.idx(i + 1, j, k)] - this.pressure[this.idx(i - 1, j, k)]) / (2 * h);
          const dpdy = (this.pressure[this.idx(i, j + 1, k)] - this.pressure[this.idx(i, j - 1, k)]) / (2 * h);
          const dpdz = (this.pressure[this.idx(i, j, k + 1)] - this.pressure[this.idx(i, j, k - 1)]) / (2 * h);

          this.u[idx] -= dpdx / rhoOverDt;
          this.v[idx] -= dpdy / rhoOverDt;
          this.w[idx] -= dpdz / rhoOverDt;
        }
      }
    }
  }

  // ── Boundary conditions ────────────────────────────────────────────────

  /**
   * Enforce boundary conditions at domain walls.
   * - No-slip: velocity at boundary = 0 (fluid "sticks" to walls)
   * - Free-slip: normal velocity = 0, tangential velocity preserved
   */
  enforceBoundaryConditions(boundaryType: 'noslip' | 'freeslip'): void {
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const isBoundary =
            i === 0 || i === nx - 1 ||
            j === 0 || j === ny - 1 ||
            k === 0 || k === nz - 1;

          if (!isBoundary) continue;

          const idx = this.idx(i, j, k);

          if (boundaryType === 'noslip') {
            // No-slip: all velocity components = 0
            this.u[idx] = 0;
            this.v[idx] = 0;
            this.w[idx] = 0;
          } else {
            // Free-slip: only normal component = 0
            if (i === 0 || i === nx - 1) this.u[idx] = 0;
            if (j === 0 || j === ny - 1) this.v[idx] = 0;
            if (k === 0 || k === nz - 1) this.w[idx] = 0;
          }

          // Mark boundary cells as solid
          this.cellType[idx] = 1;
        }
      }
    }
  }

  // ── Advection ──────────────────────────────────────────────────────────

  /**
   * Advect grid velocities using semi-Lagrangian method.
   * Trace backwards from each grid point and interpolate the old velocity.
   */
  advectGrid(dt: number): void {
    const h = this.cellSize;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;

    // Save current velocities as old
    this.uOld.set(this.u);
    this.vOld.set(this.v);
    this.wOld.set(this.w);

    const uNew = new Float32Array(this.totalCells);
    const vNew = new Float32Array(this.totalCells);
    const wNew = new Float32Array(this.totalCells);

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = this.idx(i, j, k);
          if (this.cellType[idx] === 1) continue; // skip solid

          // Current velocity at this grid point
          const ux = this.u[idx];
          const uy = this.v[idx];
          const uz = this.w[idx];

          // Trace back
          const backX = i - ux * dt / h;
          const backY = j - uy * dt / h;
          const backZ = k - uz * dt / h;

          // Interpolate old velocity at the back-traced position
          const result = this.interpolateVelocityInternal(backX, backY, backZ, this.uOld, this.vOld, this.wOld);

          uNew[idx] = result.x;
          vNew[idx] = result.y;
          wNew[idx] = result.z;
        }
      }
    }

    this.u.set(uNew);
    this.v.set(vNew);
    this.w.set(wNew);
  }

  // ── Interpolation ──────────────────────────────────────────────────────

  /**
   * Internal trilinear interpolation at continuous grid coordinates.
   * Uses provided field arrays for velocity components.
   */
  private interpolateVelocityInternal(
    gx: number,
    gy: number,
    gz: number,
    uField: Float32Array,
    vField: Float32Array,
    wField: Float32Array,
  ): THREE.Vector3 {
    // Clamp to valid grid range
    const cx = Math.max(0.5, Math.min(this.nx - 1.5, gx));
    const cy = Math.max(0.5, Math.min(this.ny - 1.5, gy));
    const cz = Math.max(0.5, Math.min(this.nz - 1.5, gz));

    const i0 = Math.floor(cx);
    const j0 = Math.floor(cy);
    const k0 = Math.floor(cz);

    const fx = cx - i0;
    const fy = cy - j0;
    const fz = cz - k0;

    // Clamp neighbors to grid
    const i1 = Math.min(i0 + 1, this.nx - 1);
    const j1 = Math.min(j0 + 1, this.ny - 1);
    const k1 = Math.min(k0 + 1, this.nz - 1);

    const ci0 = Math.max(0, i0);
    const cj0 = Math.max(0, j0);
    const ck0 = Math.max(0, k0);

    // 8 corner indices
    const idx000 = this.idx(ci0, cj0, ck0);
    const idx100 = this.idx(i1, cj0, ck0);
    const idx010 = this.idx(ci0, j1, ck0);
    const idx110 = this.idx(i1, j1, ck0);
    const idx001 = this.idx(ci0, cj0, k1);
    const idx101 = this.idx(i1, cj0, k1);
    const idx011 = this.idx(ci0, j1, k1);
    const idx111 = this.idx(i1, j1, k1);

    // Trilinear interpolation
    const lerp = (
      v000: number, v100: number, v010: number, v110: number,
      v001: number, v101: number, v011: number, v111: number,
    ): number => {
      return (
        v000 * (1 - fx) * (1 - fy) * (1 - fz) +
        v100 * fx * (1 - fy) * (1 - fz) +
        v010 * (1 - fx) * fy * (1 - fz) +
        v110 * fx * fy * (1 - fz) +
        v001 * (1 - fx) * (1 - fy) * fz +
        v101 * fx * (1 - fy) * fz +
        v011 * (1 - fx) * fy * fz +
        v111 * fx * fy * fz
      );
    };

    return new THREE.Vector3(
      lerp(
        uField[idx000], uField[idx100], uField[idx010], uField[idx110],
        uField[idx001], uField[idx101], uField[idx011], uField[idx111],
      ),
      lerp(
        vField[idx000], vField[idx100], vField[idx010], vField[idx110],
        vField[idx001], vField[idx101], vField[idx011], vField[idx111],
      ),
      lerp(
        wField[idx000], wField[idx100], wField[idx010], wField[idx110],
        wField[idx001], wField[idx101], wField[idx011], wField[idx111],
      ),
    );
  }

  /**
   * Trilinear interpolation of the velocity field at a world-space position.
   * Public API for particle advection.
   */
  interpolateVelocity(pos: THREE.Vector3): THREE.Vector3 {
    const h = this.cellSize;
    return this.interpolateVelocityInternal(
      pos.x / h,
      pos.y / h,
      pos.z / h,
      this.u,
      this.v,
      this.w,
    );
  }

  /**
   * Interpolate the *old* velocity field at a world-space position.
   * Used for FLIP velocity delta computation.
   */
  interpolateOldVelocity(pos: THREE.Vector3): THREE.Vector3 {
    const h = this.cellSize;
    return this.interpolateVelocityInternal(
      pos.x / h,
      pos.y / h,
      pos.z / h,
      this.uOld,
      this.vOld,
      this.wOld,
    );
  }

  /**
   * Get the velocity vector at a specific grid cell.
   */
  getGridVelocity(i: number, j: number, k: number): THREE.Vector3 {
    if (!this.inBounds(i, j, k)) {
      return new THREE.Vector3(0, 0, 0);
    }
    const idx = this.idx(i, j, k);
    return new THREE.Vector3(this.u[idx], this.v[idx], this.w[idx]);
  }

  /**
   * Get the pressure at a specific grid cell.
   */
  getGridPressure(i: number, j: number, k: number): number {
    if (!this.inBounds(i, j, k)) return 0;
    return this.pressure[this.idx(i, j, k)];
  }

  /**
   * Get the density at a specific grid cell.
   */
  getGridDensity(i: number, j: number, k: number): number {
    if (!this.inBounds(i, j, k)) return 0;
    return this.density[this.idx(i, j, k)];
  }

  /**
   * Store current velocities as "old" for FLIP delta computation.
   */
  saveOldVelocities(): void {
    this.uOld.set(this.u);
    this.vOld.set(this.v);
    this.wOld.set(this.w);
  }

  /**
   * Reset all grid fields to zero.
   */
  reset(): void {
    this.u.fill(0);
    this.v.fill(0);
    this.w.fill(0);
    this.uOld.fill(0);
    this.vOld.fill(0);
    this.wOld.fill(0);
    this.pressure.fill(0);
    this.density.fill(0);
    this.divergence.fill(0);
    this.cellType.fill(2);
    this.particleCount.fill(0);
  }
}

// ─── FLIPFluidSolver ─────────────────────────────────────────────────────────

/**
 * Main FLIP fluid solver.
 *
 * Manages particles and grid, orchestrating the P2G → solve → G2P pipeline
 * each timestep. Supports configurable FLIP/PIC blending, gravity, and
 * boundary conditions.
 */
export class FLIPFluidSolver {
  private config: FLIPConfig;
  private grid: FLIPGrid;
  private particles: FLIPParticle[] = [];
  private nextId: number = 0;
  private fluidDensity: number = 1000; // kg/m³ (water)

  // Domain bounds in world space
  private domainMin: THREE.Vector3;
  private domainMax: THREE.Vector3;

  constructor(config: Partial<FLIPConfig> = {}) {
    this.config = { ...DEFAULT_FLIP_CONFIG, ...config };

    // Ensure gridSize is set properly
    if (!config.gridSize) {
      this.config.gridSize = DEFAULT_FLIP_CONFIG.gridSize;
    }
    if (!config.gravity) {
      this.config.gravity = DEFAULT_FLIP_CONFIG.gravity.clone();
    }

    // Auto-compute maxParticles from domainSize and particlesPerMeter if provided
    if (this.config.domainSize && this.config.particlesPerMeter) {
      const volume = this.config.domainSize.x * this.config.domainSize.y * this.config.domainSize.z;
      const autoParticles = Math.round(volume * Math.pow(this.config.particlesPerMeter, 3));
      // Use the computed value, but cap at a reasonable limit
      this.config.maxParticles = Math.max(1000, Math.min(100000, autoParticles));
    } else if (this.config.particleDensity) {
      // Compute from grid resolution and particle density
      const [nx, ny, nz] = this.config.gridSize;
      const cellVolume = Math.pow(this.config.cellSize, 3);
      const totalCells = nx * ny * nz;
      // Assume ~20% of cells are fluid at any time
      this.config.maxParticles = Math.round(totalCells * 0.2 * this.config.particleDensity);
      this.config.maxParticles = Math.max(5000, Math.min(100000, this.config.maxParticles));
    }

    const [nx, ny, nz] = this.config.gridSize;
    this.grid = new FLIPGrid(nx, ny, nz, this.config.cellSize);

    // Compute domain bounds
    this.domainMin = new THREE.Vector3(0, 0, 0);
    this.domainMax = new THREE.Vector3(
      nx * this.config.cellSize,
      ny * this.config.cellSize,
      nz * this.config.cellSize,
    );
  }

  // ── Initialization ─────────────────────────────────────────────────────

  /**
   * Initialize the solver with a set of particles.
   */
  initialize(particles: FLIPParticle[]): void {
    this.particles = [];
    this.nextId = 0;

    const maxP = this.config.maxParticles;
    const count = Math.min(particles.length, maxP);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      this.particles.push({
        position: p.position.clone(),
        velocity: p.velocity.clone(),
        density: p.density,
        pressure: p.pressure,
        id: this.nextId++,
      });
    }

    this.grid.reset();
  }

  /**
   * Initialize particles in a rectangular block.
   * Useful for dam-break scenarios or river sources.
   */
  initializeBlock(
    min: THREE.Vector3,
    max: THREE.Vector3,
    spacing: number,
    initialVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  ): void {
    this.particles = [];
    this.nextId = 0;

    const sx = Math.max(1, Math.floor((max.x - min.x) / spacing));
    const sy = Math.max(1, Math.floor((max.y - min.y) / spacing));
    const sz = Math.max(1, Math.floor((max.z - min.z) / spacing));

    for (let ix = 0; ix < sx; ix++) {
      for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
          if (this.particles.length >= this.config.maxParticles) break;

          const px = min.x + (ix + 0.5) * spacing;
          const py = min.y + (iy + 0.5) * spacing;
          const pz = min.z + (iz + 0.5) * spacing;

          this.particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: initialVelocity.clone(),
            density: this.fluidDensity,
            pressure: 0,
            id: this.nextId++,
          });
        }
      }
    }

    this.grid.reset();
  }

  // ── Main timestep ──────────────────────────────────────────────────────

  /**
   * Advance the simulation by dt seconds.
   *
   * Full FLIP timestep:
   *   a. Rasterize particle velocities to grid (P2G)
   *   b. Store grid velocities (for FLIP velocity update)
   *   c. Add external forces (gravity)
   *   d. Solve pressure (Poisson equation)
   *   e. Apply pressure gradient to velocity
   *   f. Advect grid velocities
   *   g. Transfer back to particles using FLIP formula
   *   h. Advect particles using new grid velocity
   *   i. Resolve particle-boundary collisions
   */
  step(dt: number): void {
    if (this.particles.length === 0) return;

    // Clamp dt for stability
    dt = Math.min(dt, 0.02);

    // Adaptive time-stepping: adjust dt based on max velocity
    if (this.config.adaptiveTimeStep) {
      let maxVel = 0;
      for (const p of this.particles) {
        const v = p.velocity.length();
        if (v > maxVel) maxVel = v;
      }
      // CFL condition: dt * maxVel < cellSize
      if (maxVel > 0.01) {
        const cflDt = this.config.cellSize / maxVel * 0.5;
        dt = Math.min(dt, cflDt);
      }
    }

    // Sub-stepping for stability at larger dt
    const maxSubDt = this.config.cellSize * 0.5;
    const subSteps = Math.max(1, Math.ceil(dt / maxSubDt));
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.subStep(subDt);
    }
  }

  private subStep(dt: number): void {
    // (a) Rasterize particle velocities to grid
    this.grid.rasterizeParticles(this.particles);

    // (b) Store old grid velocities for FLIP update
    this.grid.saveOldVelocities();

    // (c) Add external forces (gravity)
    this.applyGravity(dt);

    // (d) Solve pressure
    this.grid.solvePressure(dt, this.config.pressureIterations, this.fluidDensity);

    // (e) Apply pressure gradient
    this.grid.applyPressureGradient(dt, this.fluidDensity);

    // (f) Enforce boundary conditions
    this.grid.enforceBoundaryConditions(this.config.boundaryType);

    // (g) Advect grid velocities (semi-Lagrangian)
    this.grid.advectGrid(dt);

    // (h) Enforce boundary conditions again after advection
    this.grid.enforceBoundaryConditions(this.config.boundaryType);

    // (i) Transfer back to particles (FLIP + PIC blend)
    this.transferToParticles();

    // (j) Advect particles
    this.advectParticles(dt);

    // (k) Resolve boundary collisions
    this.resolveBoundaryCollisions();
  }

  // ── External forces ────────────────────────────────────────────────────

  /**
   * Apply gravity to the grid velocity field.
   * Only affects fluid cells.
   */
  private applyGravity(dt: number): void {
    const gx = this.config.gravity.x * dt;
    const gy = this.config.gravity.y * dt;
    const gz = this.config.gravity.z * dt;
    const grid = this.grid;

    for (let idx = 0; idx < grid.totalCells; idx++) {
      if (grid.cellType[idx] === 0) { // fluid cell
        grid.u[idx] += gx;
        grid.v[idx] += gy;
        grid.w[idx] += gz;
      }
    }
  }

  // ── G2P Transfer ───────────────────────────────────────────────────────

  /**
   * Transfer grid velocities back to particles using the FLIP formula:
   *
   *   v_new = v_old + flipRatio * (v_grid_new - v_grid_old)  [FLIP part]
   *         + (1 - flipRatio) * v_grid_new                     [PIC part]
   *
   * This blends:
   * - FLIP: updates velocity by the *change* in grid velocity → low dissipation
   * - PIC:  sets velocity directly from grid → more damping but stable
   */
  private transferToParticles(): void {
    const flipRatio = this.config.flipRatio;

    for (let p = 0; p < this.particles.length; p++) {
      const particle = this.particles[p];

      // Interpolate new and old grid velocities at particle position
      const newGridVel = this.grid.interpolateVelocity(particle.position);
      const oldGridVel = this.grid.interpolateOldVelocity(particle.position);

      // FLIP velocity delta
      const deltaU = newGridVel.x - oldGridVel.x;
      const deltaV = newGridVel.y - oldGridVel.y;
      const deltaW = newGridVel.z - oldGridVel.z;

      // Blended update:
      // FLIP: v_particle += delta_v_grid
      // PIC:  v_particle = v_grid_new
      particle.velocity.x = flipRatio * (particle.velocity.x + deltaU) + (1 - flipRatio) * newGridVel.x;
      particle.velocity.y = flipRatio * (particle.velocity.y + deltaV) + (1 - flipRatio) * newGridVel.y;
      particle.velocity.z = flipRatio * (particle.velocity.z + deltaW) + (1 - flipRatio) * newGridVel.z;
    }
  }

  // ── Particle advection ─────────────────────────────────────────────────

  /**
   * Advect particles using their current velocity (which was set from
   * the grid in the G2P transfer step).
   */
  private advectParticles(dt: number): void {
    for (let p = 0; p < this.particles.length; p++) {
      const particle = this.particles[p];
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;
    }
  }

  // ── Boundary collision ─────────────────────────────────────────────────

  /**
   * Resolve particle-boundary collisions.
   * Particles are pushed back inside the domain and their velocity
   * is reflected with damping.
   */
  private resolveBoundaryCollisions(): void {
    const damping = 0.3;
    const min = this.domainMin;
    const max = this.domainMax;
    const eps = this.config.cellSize * 0.01;

    for (let p = 0; p < this.particles.length; p++) {
      const pos = this.particles[p].position;
      const vel = this.particles[p].velocity;

      // X boundaries
      if (pos.x < min.x + eps) {
        pos.x = min.x + eps;
        vel.x = Math.abs(vel.x) * damping;
      } else if (pos.x > max.x - eps) {
        pos.x = max.x - eps;
        vel.x = -Math.abs(vel.x) * damping;
      }

      // Y boundaries (floor and ceiling)
      if (pos.y < min.y + eps) {
        pos.y = min.y + eps;
        vel.y = Math.abs(vel.y) * damping;
        // Friction on floor
        vel.x *= 0.95;
        vel.z *= 0.95;
      } else if (pos.y > max.y - eps) {
        pos.y = max.y - eps;
        vel.y = -Math.abs(vel.y) * damping;
      }

      // Z boundaries
      if (pos.z < min.z + eps) {
        pos.z = min.z + eps;
        vel.z = Math.abs(vel.z) * damping;
      } else if (pos.z > max.z - eps) {
        pos.z = max.z - eps;
        vel.z = -Math.abs(vel.z) * damping;
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /** Get the current particle array. */
  getParticles(): FLIPParticle[] {
    return this.particles;
  }

  /** Get the Eulerian grid. */
  getGrid(): FLIPGrid {
    return this.grid;
  }

  /** Get the solver configuration. */
  getConfig(): FLIPConfig {
    return this.config;
  }

  /** Get the domain bounds. */
  getDomainMin(): THREE.Vector3 {
    return this.domainMin.clone();
  }

  getDomainMax(): THREE.Vector3 {
    return this.domainMax.clone();
  }

  /** Get the number of active particles. */
  getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * Add a single particle to the simulation.
   * Respects the maxParticles limit.
   */
  addParticle(position: THREE.Vector3, velocity: THREE.Vector3 = new THREE.Vector3()): boolean {
    if (this.particles.length >= this.config.maxParticles) return false;

    this.particles.push({
      position: position.clone(),
      velocity: velocity.clone(),
      density: this.fluidDensity,
      pressure: 0,
      id: this.nextId++,
    });

    return true;
  }

  /**
   * Add particles in a block region (e.g., for continuous fluid sources).
   */
  addBlockParticles(
    min: THREE.Vector3,
    max: THREE.Vector3,
    spacing: number,
    velocity: THREE.Vector3 = new THREE.Vector3(),
  ): number {
    let added = 0;
    const sx = Math.max(1, Math.floor((max.x - min.x) / spacing));
    const sy = Math.max(1, Math.floor((max.y - min.y) / spacing));
    const sz = Math.max(1, Math.floor((max.z - min.z) / spacing));

    for (let ix = 0; ix < sx; ix++) {
      for (let iy = 0; iy < sy; iy++) {
        for (let iz = 0; iz < sz; iz++) {
          if (this.particles.length >= this.config.maxParticles) return added;

          const px = min.x + (ix + 0.5) * spacing;
          const py = min.y + (iy + 0.5) * spacing;
          const pz = min.z + (iz + 0.5) * spacing;

          this.particles.push({
            position: new THREE.Vector3(px, py, pz),
            velocity: velocity.clone(),
            density: this.fluidDensity,
            pressure: 0,
            id: this.nextId++,
          });
          added++;
        }
      }
    }

    return added;
  }

  /**
   * Remove particles that are outside a given region.
   * Useful for simulating fluid that flows out of the domain.
   */
  cullParticles(keepMin: THREE.Vector3, keepMax: THREE.Vector3): number {
    const before = this.particles.length;
    this.particles = this.particles.filter(p => {
      return (
        p.position.x >= keepMin.x && p.position.x <= keepMax.x &&
        p.position.y >= keepMin.y && p.position.y <= keepMax.y &&
        p.position.z >= keepMin.z && p.position.z <= keepMax.z
      );
    });
    return before - this.particles.length;
  }

  /**
   * Update particle density/pressure from the grid.
   * Call after step() if you need per-particle density/pressure values.
   */
  updateParticleProperties(): void {
    const h = this.config.cellSize;
    for (const p of this.particles) {
      const gi = Math.floor(p.position.x / h);
      const gj = Math.floor(p.position.y / h);
      const gk = Math.floor(p.position.z / h);

      p.density = this.grid.getGridDensity(gi, gj, gk);
      p.pressure = this.grid.getGridPressure(gi, gj, gk);
    }
  }

  /**
   * Set the gravity vector.
   */
  setGravity(gravity: THREE.Vector3): void {
    this.config.gravity.copy(gravity);
  }

  /**
   * Reset the simulation.
   */
  reset(): void {
    this.particles = [];
    this.nextId = 0;
    this.grid.reset();
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.particles = [];
    this.grid.reset();
  }
}

export default FLIPFluidSolver;

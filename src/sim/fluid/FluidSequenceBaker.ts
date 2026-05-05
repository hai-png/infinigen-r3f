/**
 * FluidSequenceBaker.ts — Fluid Simulation Sequence Baking & Caching
 *
 * Provides complete sequence baking for FLIP fluid simulations, caching
 * both particle data and extracted surface meshes per frame. Enables
 * offline simulation baking with full playback of mesh sequences.
 *
 * Key components:
 *   1. CachedMeshFrame  — Per-frame particle + surface mesh data
 *   2. BakeConfig       — Configuration for sequence baking
 *   3. BakedFluidSequence — Multi-frame cache with export/import
 *   4. FluidSequenceBaker — Baking engine (runs solver, extracts surfaces)
 *   5. MeshCachePlayer  — Mesh-aware playback with interpolation
 *
 * @module sim/fluid/FluidSequenceBaker
 */

import * as THREE from 'three';
import { FluidSimulationCache } from '@/sim/SimulationCaching';
import type { FLIPFluidSolver, FLIPParticle } from './FLIPFluidSolver';
import type { FLIPGrid } from './FLIPFluidSolver';
import { FLIPSurfaceExtractor } from './FLIPSurfaceExtractor';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CachedMeshFrame Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single cached frame containing both particle data and extracted surface mesh.
 *
 * Combines the particle-level cache from FluidSimulationCache with
 * the extracted surface mesh geometry for complete per-frame state.
 */
export interface CachedMeshFrame {
  /** Frame index in the sequence */
  frameIndex: number;
  /** Extracted surface mesh geometry (from marching cubes) */
  meshGeometry: THREE.BufferGeometry;
  /** Flat particle positions: [x0,y0,z0, x1,y1,z1, ...] */
  particlePositions: Float32Array;
  /** Flat particle velocities: [vx0,vy0,vz0, vx1,vy1,vz1, ...] */
  particleVelocities: Float32Array;
  /** Timestamp when this frame was captured (ms since epoch) */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BakeConfig Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for sequence baking.
 */
export interface BakeConfig {
  /** Number of solver substeps per baked frame (default 2) */
  substepsPerFrame: number;
  /** Whether to extract surface mesh per frame (default true) */
  extractSurface: boolean;
  /** Marching cubes resolution for surface extraction (default 64) */
  surfaceResolution: number;
  /** Whether to cache particle data (default true) */
  cacheParticles: boolean;
  /** Progress callback: (currentFrame, totalFrames) */
  onProgress: (frame: number, total: number) => void;
  /** Per-frame completion callback with the completed frame */
  onFrameComplete: (frame: CachedMeshFrame) => void;
}

/** Default bake configuration */
export const DEFAULT_BAKE_CONFIG: BakeConfig = {
  substepsPerFrame: 2,
  extractSurface: true,
  surfaceResolution: 64,
  cacheParticles: true,
  onProgress: () => {},
  onFrameComplete: () => {},
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Binary Format Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Binary format for BakedFluidSequence:
 *
 *   [Header: 128 bytes]
 *   [Frame 0 metadata: 32 bytes]
 *   [Frame 0 mesh: vertexCount*3*4 | indexCount*4 | normalCount*3*4]
 *   [Frame 0 particles: positions | velocities]
 *   [Frame 1 ...]
 *
 * Header layout (128 bytes):
 *   Bytes 0-3:    Magic number "FBSQ" (0x46425351)
 *   Bytes 4-7:    Version (2)
 *   Bytes 8-11:   Frame count (uint32)
 *   Bytes 12-15:  Max particles per frame (uint32)
 *   Bytes 16-19:  Has mesh data flag (uint32)
 *   Bytes 20-23:  Surface resolution (uint32)
 *   Bytes 24-27:  Substeps per frame (uint32)
 *   Bytes 28-127: Reserved (zeros)
 *
 * Frame metadata (32 bytes each):
 *   Bytes 0-3:    Frame index (uint32)
 *   Bytes 4-7:    Particle count (uint32)
 *   Bytes 8-11:   Vertex count (uint32)
 *   Bytes 12-15:  Index count (uint32)
 *   Bytes 16-19:  Timestamp (float32 as uint32 bits)
 *   Bytes 20-23:  Mesh data size in bytes (uint32)
 *   Bytes 24-27:  Particle data size in bytes (uint32)
 *   Bytes 28-31:  Reserved (zeros)
 */
const BAKE_MAGIC = 0x46425351; // "FBSQ"
const BAKE_VERSION = 2;
const HEADER_SIZE = 128;
const FRAME_METADATA_SIZE = 32;

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BakedFluidSequence Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Holds all cached frames for a baked fluid sequence.
 *
 * Stores both particle and mesh data per frame, supports random-access
 * retrieval, range queries, and compact binary export/import for
 * persistent caching of baked sequences.
 *
 * Usage:
 * ```ts
 * const sequence = new BakedFluidSequence();
 * sequence.addFrame(cachedFrame);
 *
 * // Retrieve frames
 * const frame = sequence.getFrame(0);
 * const range = sequence.getFrameRange(0, 10);
 *
 * // Export / Import
 * const buffer = sequence.exportToBinary();
 * const loaded = new BakedFluidSequence();
 * loaded.importFromBinary(buffer);
 *
 * // Cleanup
 * sequence.dispose();
 * ```
 */
export class BakedFluidSequence {
  /** Cached frames indexed by frame number */
  private frames: Map<number, CachedMeshFrame> = new Map();

  /** Underlying particle-level cache (for compatibility) */
  private particleCache: FluidSimulationCache;

  /** Estimated memory usage in bytes */
  private memoryUsage: number = 0;

  /** Whether mesh data is present in this sequence */
  private hasMeshData: boolean = false;

  /** Surface resolution used during baking */
  private surfaceResolution: number = 64;

  /** Substeps per frame used during baking */
  private substepsPerFrame: number = 2;

  constructor() {
    this.particleCache = new FluidSimulationCache();
  }

  // ── Frame Management ───────────────────────────────────────────────────

  /**
   * Add a cached frame to the sequence.
   * If a frame with the same index already exists, it is replaced.
   *
   * @param frame The cached frame to add
   */
  addFrame(frame: CachedMeshFrame): void {
    const existing = this.frames.get(frame.frameIndex);
    if (existing) {
      this.memoryUsage -= this.computeFrameMemorySize(existing);
      existing.meshGeometry.dispose();
    }

    this.frames.set(frame.frameIndex, frame);
    this.memoryUsage += this.computeFrameMemorySize(frame);

    if (frame.meshGeometry.getAttribute('position')) {
      this.hasMeshData = true;
    }

    // Also add to the particle cache for compatibility
    const particleCount = frame.particlePositions.length / 3;
    const types = new Uint8Array(particleCount); // default: all fluid
    const obstaclePositions = new Float32Array(0);
    this.particleCache.cacheFrameRaw(
      frame.frameIndex,
      frame.particlePositions,
      frame.particleVelocities,
      types,
      obstaclePositions,
    );
  }

  /**
   * Get a cached frame by index.
   *
   * @param index Frame index to retrieve
   * @returns Cached frame, or undefined if not cached
   */
  getFrame(index: number): CachedMeshFrame | undefined {
    return this.frames.get(index);
  }

  /**
   * Get a range of cached frames.
   *
   * @param start Start frame index (inclusive)
   * @param end   End frame index (exclusive)
   * @returns Array of CachedMeshFrame objects sorted by index
   */
  getFrameRange(start: number, end: number): CachedMeshFrame[] {
    const result: CachedMeshFrame[] = [];
    for (let i = start; i < end; i++) {
      const frame = this.frames.get(i);
      if (frame) {
        result.push(frame);
      }
    }
    return result;
  }

  /**
   * Get the number of cached frames.
   */
  getFrameCount(): number {
    return this.frames.size;
  }

  /**
   * Get sorted frame indices.
   */
  getFrameIndices(): number[] {
    return Array.from(this.frames.keys()).sort((a, b) => a - b);
  }

  /**
   * Check if a specific frame is cached.
   */
  hasFrame(index: number): boolean {
    return this.frames.has(index);
  }

  /**
   * Remove a specific frame and dispose its geometry.
   *
   * @param index Frame index to remove
   * @returns True if the frame was removed
   */
  removeFrame(index: number): boolean {
    const frame = this.frames.get(index);
    if (!frame) return false;

    this.memoryUsage -= this.computeFrameMemorySize(frame);
    frame.meshGeometry.dispose();
    this.frames.delete(index);
    this.particleCache.removeFrame(index);
    return true;
  }

  // ── Export / Import ────────────────────────────────────────────────────

  /**
   * Export the entire sequence as a compact binary ArrayBuffer.
   *
   * Serializes all frame data including mesh geometry (positions, normals,
   * indices) and particle data (positions, velocities) into a single
   * contiguous buffer.
   *
   * @returns ArrayBuffer containing the binary sequence data
   */
  exportToBinary(): ArrayBuffer {
    const sortedIndices = this.getFrameIndices();
    const frameCount = sortedIndices.length;

    if (frameCount === 0) {
      const buffer = new ArrayBuffer(HEADER_SIZE);
      const view = new DataView(buffer);
      this.writeHeader(view, 0, 0, false, this.surfaceResolution, this.substepsPerFrame);
      return buffer;
    }

    // Determine max particles
    let maxParticles = 0;
    for (const idx of sortedIndices) {
      const frame = this.frames.get(idx)!;
      const count = frame.particlePositions.length / 3;
      if (count > maxParticles) maxParticles = count;
    }

    // Pre-compute total size
    let totalDataSize = 0;
    const frameDataSizes: number[] = [];

    for (const idx of sortedIndices) {
      const frame = this.frames.get(idx)!;
      const meshSize = this.computeMeshBinarySize(frame.meshGeometry);
      const particleSize = frame.particlePositions.byteLength + frame.particleVelocities.byteLength;
      frameDataSizes.push(meshSize + particleSize);
      totalDataSize += FRAME_METADATA_SIZE + meshSize + particleSize;
    }

    const totalSize = HEADER_SIZE + totalDataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write header
    this.writeHeader(view, frameCount, maxParticles, this.hasMeshData, this.surfaceResolution, this.substepsPerFrame);

    // Write frame data
    let offset = HEADER_SIZE;

    for (let f = 0; f < frameCount; f++) {
      const frame = this.frames.get(sortedIndices[f])!;
      const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
      const normAttr = frame.meshGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
      const indexAttr = frame.meshGeometry.getIndex();

      const vertexCount = posAttr ? posAttr.count : 0;
      const indexCount = indexAttr ? indexAttr.count : 0;
      const particleCount = frame.particlePositions.length / 3;
      const meshDataSize = this.computeMeshBinarySize(frame.meshGeometry);
      const particleDataSize = frame.particlePositions.byteLength + frame.particleVelocities.byteLength;

      // Write frame metadata
      view.setUint32(offset, frame.frameIndex, true);
      offset += 4;
      view.setUint32(offset, particleCount, true);
      offset += 4;
      view.setUint32(offset, vertexCount, true);
      offset += 4;
      view.setUint32(offset, indexCount, true);
      offset += 4;
      // Store timestamp as float64 split into two uint32s
      const tsHigh = Math.floor(frame.timestamp / 4294967296);
      const tsLow = frame.timestamp % 4294967296;
      view.setUint32(offset, tsLow, true);
      offset += 4;
      view.setUint32(offset, tsHigh, true);
      offset += 4;
      view.setUint32(offset, meshDataSize, true);
      offset += 4;
      view.setUint32(offset, particleDataSize, true);
      offset += 4;

      // Write mesh positions
      if (posAttr && vertexCount > 0) {
        const posArray = posAttr.array as Float32Array;
        const posView = new Float32Array(buffer, offset, vertexCount * 3);
        posView.set(posArray.subarray(0, vertexCount * 3));
        offset += vertexCount * 3 * 4;
      }

      // Write mesh normals
      if (normAttr && vertexCount > 0) {
        const normArray = normAttr.array as Float32Array;
        const normView = new Float32Array(buffer, offset, vertexCount * 3);
        normView.set(normArray.subarray(0, vertexCount * 3));
        offset += vertexCount * 3 * 4;
      }

      // Write mesh indices
      if (indexAttr && indexCount > 0) {
        const indexArray = indexAttr.array as Uint16Array | Uint32Array;
        if (indexArray instanceof Uint32Array) {
          const idxView = new Uint32Array(buffer, offset, indexCount);
          idxView.set(indexArray.subarray(0, indexCount));
          offset += indexCount * 4;
        } else {
          // Convert Uint16 to Uint32 for consistent format
          const idxView = new Uint32Array(buffer, offset, indexCount);
          for (let i = 0; i < indexCount; i++) {
            idxView[i] = indexArray[i];
          }
          offset += indexCount * 4;
        }
      }

      // Write particle positions
      const posParticleView = new Float32Array(buffer, offset, particleCount * 3);
      posParticleView.set(frame.particlePositions);
      offset += particleCount * 3 * 4;

      // Write particle velocities
      const velParticleView = new Float32Array(buffer, offset, particleCount * 3);
      velParticleView.set(frame.particleVelocities);
      offset += particleCount * 3 * 4;
    }

    return buffer;
  }

  /**
   * Import a baked sequence from a binary ArrayBuffer.
   * Clears any existing cached data before importing.
   *
   * @param buffer ArrayBuffer containing the binary sequence data
   */
  importFromBinary(buffer: ArrayBuffer): void {
    this.dispose();
    this.particleCache.clear();

    const view = new DataView(buffer);

    // Read and validate header
    const magic = view.getUint32(0, true);
    if (magic !== BAKE_MAGIC) {
      throw new Error(
        `[BakedFluidSequence] Invalid binary file: bad magic number ` +
        `(expected 0x${BAKE_MAGIC.toString(16)}, got 0x${magic.toString(16)})`
      );
    }

    const version = view.getUint32(4, true);
    if (version !== BAKE_VERSION) {
      throw new Error(
        `[BakedFluidSequence] Unsupported version: ${version} (expected ${BAKE_VERSION})`
      );
    }

    const frameCount = view.getUint32(8, true);
    const _maxParticles = view.getUint32(12, true);
    const hasMesh = view.getUint32(16, true) !== 0;
    this.surfaceResolution = view.getUint32(20, true);
    this.substepsPerFrame = view.getUint32(24, true);
    this.hasMeshData = hasMesh;

    if (frameCount === 0) {
      console.log('[BakedFluidSequence] Imported empty sequence (0 frames)');
      return;
    }

    let offset = HEADER_SIZE;

    for (let f = 0; f < frameCount; f++) {
      // Read frame metadata
      const frameIndex = view.getUint32(offset, true);
      offset += 4;
      const particleCount = view.getUint32(offset, true);
      offset += 4;
      const vertexCount = view.getUint32(offset, true);
      offset += 4;
      const indexCount = view.getUint32(offset, true);
      offset += 4;
      const tsLow = view.getUint32(offset, true);
      offset += 4;
      const tsHigh = view.getUint32(offset, true);
      offset += 4;
      const _meshDataSize = view.getUint32(offset, true);
      offset += 4;
      const _particleDataSize = view.getUint32(offset, true);
      offset += 4;

      const timestamp = tsHigh * 4294967296 + tsLow;

      // Read mesh geometry
      const geometry = new THREE.BufferGeometry();

      if (hasMesh && vertexCount > 0) {
        // Read positions
        const positions = new Float32Array(vertexCount * 3);
        const posView = new Float32Array(buffer, offset, vertexCount * 3);
        positions.set(posView);
        offset += vertexCount * 3 * 4;

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Read normals
        const normals = new Float32Array(vertexCount * 3);
        const normView = new Float32Array(buffer, offset, vertexCount * 3);
        normals.set(normView);
        offset += vertexCount * 3 * 4;

        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

        // Read indices
        if (indexCount > 0) {
          const indices = new Uint32Array(indexCount);
          const idxView = new Uint32Array(buffer, offset, indexCount);
          indices.set(idxView);
          offset += indexCount * 4;

          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        }

        geometry.computeBoundingSphere();
      } else {
        // Skip mesh data size if no mesh
        // No-op: offset already past the metadata
      }

      // Read particle positions
      const particlePositions = new Float32Array(particleCount * 3);
      const ppView = new Float32Array(buffer, offset, particleCount * 3);
      particlePositions.set(ppView);
      offset += particleCount * 3 * 4;

      // Read particle velocities
      const particleVelocities = new Float32Array(particleCount * 3);
      const pvView = new Float32Array(buffer, offset, particleCount * 3);
      particleVelocities.set(pvView);
      offset += particleCount * 3 * 4;

      const frame: CachedMeshFrame = {
        frameIndex,
        meshGeometry: geometry,
        particlePositions,
        particleVelocities,
        timestamp,
      };

      this.frames.set(frameIndex, frame);
      this.memoryUsage += this.computeFrameMemorySize(frame);
    }

    console.log(
      `[BakedFluidSequence] Imported ${frameCount} frames ` +
      `(${this.hasMeshData ? 'with' : 'without'} mesh data, ` +
      `resolution=${this.surfaceResolution})`
    );
  }

  // ── Statistics ─────────────────────────────────────────────────────────

  /**
   * Get sequence statistics.
   *
   * @returns Object with total frames, memory usage, and frame rate info
   */
  getSequenceStats(): {
    totalFrames: number;
    memoryUsageMB: number;
    memoryUsageBytes: number;
    hasMeshData: boolean;
    surfaceResolution: number;
    substepsPerFrame: number;
    frameIndices: number[];
    averageParticleCount: number;
    averageVertexCount: number;
  } {
    let totalParticles = 0;
    let totalVertices = 0;

    for (const frame of this.frames.values()) {
      totalParticles += frame.particlePositions.length / 3;
      const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
      totalVertices += posAttr ? posAttr.count : 0;
    }

    const count = this.frames.size;

    return {
      totalFrames: count,
      memoryUsageMB: this.memoryUsage / (1024 * 1024),
      memoryUsageBytes: this.memoryUsage,
      hasMeshData: this.hasMeshData,
      surfaceResolution: this.surfaceResolution,
      substepsPerFrame: this.substepsPerFrame,
      frameIndices: this.getFrameIndices(),
      averageParticleCount: count > 0 ? Math.round(totalParticles / count) : 0,
      averageVertexCount: count > 0 ? Math.round(totalVertices / count) : 0,
    };
  }

  /**
   * Get estimated memory usage in megabytes.
   */
  getMemoryUsageMB(): number {
    return this.memoryUsage / (1024 * 1024);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Dispose all cached geometry and free memory.
   */
  dispose(): void {
    for (const frame of this.frames.values()) {
      frame.meshGeometry.dispose();
    }
    this.frames.clear();
    this.memoryUsage = 0;
    this.hasMeshData = false;
    this.particleCache.clear();
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Compute memory size of a single CachedMeshFrame.
   */
  private computeFrameMemorySize(frame: CachedMeshFrame): number {
    let size = 0;
    size += frame.particlePositions.byteLength;
    size += frame.particleVelocities.byteLength;

    // Estimate mesh geometry size
    const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (posAttr) {
      size += posAttr.array.byteLength;
    }
    const normAttr = frame.meshGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    if (normAttr) {
      size += normAttr.array.byteLength;
    }
    const indexAttr = frame.meshGeometry.getIndex();
    if (indexAttr) {
      size += indexAttr.array.byteLength;
    }

    return size;
  }

  /**
   * Compute the binary size of mesh geometry data.
   */
  private computeMeshBinarySize(geometry: THREE.BufferGeometry): number {
    let size = 0;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (posAttr) {
      size += posAttr.count * 3 * 4; // Float32 positions
    }
    const normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    if (normAttr) {
      size += normAttr.count * 3 * 4; // Float32 normals
    }
    const indexAttr = geometry.getIndex();
    if (indexAttr) {
      size += indexAttr.count * 4; // Uint32 indices
    }
    return size;
  }

  /**
   * Write the binary sequence header.
   */
  private writeHeader(
    view: DataView,
    frameCount: number,
    maxParticles: number,
    hasMesh: boolean,
    surfaceResolution: number,
    substepsPerFrame: number,
  ): void {
    view.setUint32(0, BAKE_MAGIC, true);
    view.setUint32(4, BAKE_VERSION, true);
    view.setUint32(8, frameCount, true);
    view.setUint32(12, maxParticles, true);
    view.setUint32(16, hasMesh ? 1 : 0, true);
    view.setUint32(20, surfaceResolution, true);
    view.setUint32(24, substepsPerFrame, true);
    // Bytes 28-127: reserved (already zero from ArrayBuffer init)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FluidSequenceBaker Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Baking engine for FLIP fluid simulations.
 *
 * Runs a FLIP solver for a specified number of frames, caching both
 * particle data and extracted surface meshes per frame. Supports
 * progress reporting and per-frame callbacks.
 *
 * Usage:
 * ```ts
 * const baker = new FluidSequenceBaker();
 *
 * // Bake a sequence
 * const sequence = baker.bakeSequence(solver, { start: 0, end: 120 }, {
 *   substepsPerFrame: 2,
 *   extractSurface: true,
 *   onProgress: (frame, total) => console.log(`${frame}/${total}`),
 * });
 *
 * // Or bake and export in one step
 * const buffer = baker.bakeAndExport(solver, { start: 0, end: 120 }, config);
 *
 * // Load later
 * const loaded = baker.loadBakedSequence(buffer);
 * ```
 */
export class FluidSequenceBaker {
  /** Surface extractor for mesh generation */
  private surfaceExtractor: FLIPSurfaceExtractor;

  /** Current surface resolution used by the extractor */
  private currentSurfaceResolution: number = 64;

  constructor() {
    this.surfaceExtractor = new FLIPSurfaceExtractor({
      gridResolution: 64,
      smoothingRadius: 0.1,
      isoThreshold: 0.5,
    });
    this.currentSurfaceResolution = 64;
  }

  // ── Main Baking API ────────────────────────────────────────────────────

  /**
   * Run a FLIP solver for N frames, caching each frame.
   *
   * For each frame:
   *   1. Step the solver (with configured substeps)
   *   2. Extract surface mesh (if enabled)
   *   3. Cache particle positions + velocities
   *   4. Report progress via callback
   *
   * @param solver     The FLIP solver to run
   * @param frameRange Object with start and end frame indices
   * @param config     Baking configuration
   * @returns          BakedFluidSequence with all cached frames
   */
  bakeSequence(
    solver: FLIPFluidSolver,
    frameRange: { start: number; end: number },
    config: Partial<BakeConfig> = {},
  ): BakedFluidSequence {
    const bakeConfig: BakeConfig = { ...DEFAULT_BAKE_CONFIG, ...config };
    const sequence = new BakedFluidSequence();

    // Configure surface extractor resolution
    if (bakeConfig.extractSurface && bakeConfig.surfaceResolution !== this.currentSurfaceResolution) {
      this.surfaceExtractor = new FLIPSurfaceExtractor({
        gridResolution: bakeConfig.surfaceResolution,
        smoothingRadius: 0.1,
        isoThreshold: 0.5,
      });
      this.currentSurfaceResolution = bakeConfig.surfaceResolution;
    }

    const totalFrames = frameRange.end - frameRange.start;
    const frameDt = 1.0 / 30.0; // 30 fps default frame time
    const subDt = frameDt / bakeConfig.substepsPerFrame;

    for (let f = frameRange.start; f < frameRange.end; f++) {
      // Step solver with substeps
      for (let s = 0; s < bakeConfig.substepsPerFrame; s++) {
        solver.step(subDt);
      }

      // Update particle properties for accurate density/pressure
      solver.updateParticleProperties();

      // Get current particles
      const particles = solver.getParticles();
      const grid = solver.getGrid();

      // Build frame data
      const frame = this.captureFrame(
        f,
        particles,
        grid,
        bakeConfig,
      );

      // Add to sequence
      sequence.addFrame(frame);

      // Report progress
      const currentFrame = f - frameRange.start + 1;
      bakeConfig.onProgress(currentFrame, totalFrames);
      bakeConfig.onFrameComplete(frame);
    }

    return sequence;
  }

  /**
   * Bake a sequence and export to binary in one step.
   *
   * @param solver     The FLIP solver to run
   * @param frameRange Frame range to bake
   * @param config     Baking configuration
   * @returns          ArrayBuffer containing the binary sequence data
   */
  bakeAndExport(
    solver: FLIPFluidSolver,
    frameRange: { start: number; end: number },
    config: Partial<BakeConfig> = {},
  ): ArrayBuffer {
    const sequence = this.bakeSequence(solver, frameRange, config);
    const buffer = sequence.exportToBinary();
    sequence.dispose();
    return buffer;
  }

  /**
   * Load a previously baked sequence from binary.
   *
   * @param buffer ArrayBuffer containing the baked sequence data
   * @returns      BakedFluidSequence loaded from the buffer
   */
  loadBakedSequence(buffer: ArrayBuffer): BakedFluidSequence {
    const sequence = new BakedFluidSequence();
    sequence.importFromBinary(buffer);
    return sequence;
  }

  // ── Frame Access ───────────────────────────────────────────────────────

  /**
   * Get the cached surface mesh for a specific frame.
   *
   * @param sequence  The baked sequence
   * @param frameIndex Frame index to retrieve
   * @returns         THREE.BufferGeometry of the surface mesh, or null
   */
  getFrameMesh(sequence: BakedFluidSequence, frameIndex: number): THREE.BufferGeometry | null {
    const frame = sequence.getFrame(frameIndex);
    if (!frame) return null;
    const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (!posAttr || posAttr.count === 0) return null;
    return frame.meshGeometry;
  }

  /**
   * Get the cached particle positions for a specific frame.
   *
   * @param sequence  The baked sequence
   * @param frameIndex Frame index to retrieve
   * @returns         Float32Array of particle positions, or null
   */
  getFrameParticles(sequence: BakedFluidSequence, frameIndex: number): Float32Array | null {
    const frame = sequence.getFrame(frameIndex);
    if (!frame) return null;
    return frame.particlePositions;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Capture a single frame from the current solver state.
   */
  private captureFrame(
    frameIndex: number,
    particles: FLIPParticle[],
    grid: FLIPGrid,
    config: BakeConfig,
  ): CachedMeshFrame {
    const particleCount = particles.length;

    // Extract particle data
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    if (config.cacheParticles) {
      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        const i3 = i * 3;
        positions[i3] = p.position.x;
        positions[i3 + 1] = p.position.y;
        positions[i3 + 2] = p.position.z;
        velocities[i3] = p.velocity.x;
        velocities[i3 + 1] = p.velocity.y;
        velocities[i3 + 2] = p.velocity.z;
      }
    }

    // Extract surface mesh
    let meshGeometry: THREE.BufferGeometry;
    if (config.extractSurface) {
      meshGeometry = this.surfaceExtractor.extractSurface(particles, grid);
    } else {
      meshGeometry = new THREE.BufferGeometry(); // empty geometry
    }

    return {
      frameIndex,
      meshGeometry,
      particlePositions: positions,
      particleVelocities: velocities,
      timestamp: Date.now(),
    };
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // Surface extractor has no disposable resources
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MeshCachePlayer Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the mesh cache player.
 */
export interface MeshCachePlayerConfig {
  /** Playback frames per second (default 30) */
  fps: number;
  /** Whether to loop playback (default true) */
  loop: boolean;
  /** Whether to interpolate between frames for smooth playback (default true) */
  interpolate: boolean;
  /** Water material properties */
  waterColor: THREE.Color;
  waterOpacity: number;
  waterRoughness: number;
  waterMetalness: number;
  waterTransmission: number;
  waterIOR: number;
}

/** Default mesh cache player configuration */
export const DEFAULT_MESH_CACHE_PLAYER_CONFIG: MeshCachePlayerConfig = {
  fps: 30,
  loop: true,
  interpolate: true,
  waterColor: new THREE.Color(0.1, 0.3, 0.5),
  waterOpacity: 0.85,
  waterRoughness: 0.05,
  waterMetalness: 0.0,
  waterTransmission: 0.9,
  waterIOR: 1.33,
};

/**
 * Plays back cached mesh sequences (not just point clouds).
 *
 * Supports smooth interpolation between frames for fluid-like
 * visual continuity at arbitrary playback speeds. Creates and
 * manages a THREE.Mesh with water-like material properties.
 *
 * Usage:
 * ```ts
 * const player = new MeshCachePlayer(sequence);
 * player.play();
 *
 * // In animation loop:
 * player.update(deltaTime);
 * const currentMesh = player.getCurrentMesh();
 * scene.add(currentMesh);
 *
 * // Control playback
 * player.seek(30);
 * player.setPlaybackSpeed(0.5);
 * player.pause();
 * ```
 */
export class MeshCachePlayer {
  private sequence: BakedFluidSequence;
  private config: MeshCachePlayerConfig;

  // Playback state
  private currentFrameIndex: number = 0;
  private fractionalFrame: number = 0;
  private playing: boolean = false;
  private playbackSpeed: number = 1.0;
  private accumulatedTime: number = 0;

  // Rendered mesh
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.MeshPhysicalMaterial | null = null;

  // Frame indices cache
  private frameIndices: number[] = [];

  constructor(
    sequence: BakedFluidSequence,
    config: Partial<MeshCachePlayerConfig> = {},
  ) {
    this.sequence = sequence;
    this.config = { ...DEFAULT_MESH_CACHE_PLAYER_CONFIG, ...config };
    this.frameIndices = sequence.getFrameIndices();

    if (this.frameIndices.length > 0) {
      this.currentFrameIndex = this.frameIndices[0];
    }
  }

  // ── Playback Controls ──────────────────────────────────────────────────

  /**
   * Start playback from the current frame.
   */
  play(): void {
    this.playing = true;
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.playing = false;
  }

  /**
   * Seek to a specific frame index.
   *
   * @param frameIndex Frame number to seek to
   */
  seek(frameIndex: number): void {
    this.currentFrameIndex = frameIndex;
    this.fractionalFrame = frameIndex;
    this.accumulatedTime = 0;
    this.updateMeshFromFrame(frameIndex);
  }

  /**
   * Set the playback speed multiplier.
   *
   * @param speed Speed multiplier (1.0 = normal, 0.5 = half, 2.0 = double)
   */
  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.01, speed);
  }

  /**
   * Get the current playback speed.
   */
  getPlaybackSpeed(): number {
    return this.playbackSpeed;
  }

  // ── Update Loop ────────────────────────────────────────────────────────

  /**
   * Update the player with elapsed time.
   * Call this from the animation loop.
   *
   * @param deltaTime Time elapsed since last update in seconds
   */
  update(deltaTime: number): void {
    if (!this.playing) return;
    if (this.frameIndices.length === 0) return;

    this.accumulatedTime += deltaTime * this.playbackSpeed;
    const frameInterval = 1.0 / this.config.fps;

    if (this.accumulatedTime >= frameInterval) {
      this.accumulatedTime -= frameInterval;

      // Advance frame
      const currentPos = this.frameIndices.indexOf(this.currentFrameIndex);

      if (currentPos === -1) {
        // Current frame not in sequence; reset to start
        this.currentFrameIndex = this.frameIndices[0];
        this.fractionalFrame = this.currentFrameIndex;
      } else {
        const nextPos = currentPos + 1;

        if (nextPos < this.frameIndices.length) {
          this.currentFrameIndex = this.frameIndices[nextPos];
        } else if (this.config.loop) {
          this.currentFrameIndex = this.frameIndices[0];
        } else {
          this.playing = false;
          return;
        }
      }

      this.fractionalFrame = this.currentFrameIndex;
    }

    // Update fractional frame for interpolation
    this.fractionalFrame += (deltaTime * this.playbackSpeed) / frameInterval;
    const maxFrame = this.frameIndices[this.frameIndices.length - 1];
    const minFrame = this.frameIndices[0];

    if (this.fractionalFrame > maxFrame) {
      if (this.config.loop) {
        this.fractionalFrame = minFrame + (this.fractionalFrame - maxFrame - 1);
      } else {
        this.fractionalFrame = maxFrame;
      }
    }

    // Update mesh
    if (this.config.interpolate) {
      this.updateMeshInterpolated(this.fractionalFrame);
    } else {
      this.updateMeshFromFrame(this.currentFrameIndex);
    }
  }

  // ── Mesh Access ────────────────────────────────────────────────────────

  /**
   * Get the current frame's mesh (THREE.Mesh with water material).
   *
   * @returns The current mesh, or null if no data available
   */
  getCurrentMesh(): THREE.Mesh | null {
    const frame = this.sequence.getFrame(this.currentFrameIndex);
    if (!frame) return null;

    const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (!posAttr || posAttr.count === 0) return null;

    if (!this.mesh) {
      this.createMesh(frame);
    }

    return this.mesh;
  }

  /**
   * Get the current frame index.
   */
  getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /**
   * Get whether playback is active.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  // ── Private Mesh Management ────────────────────────────────────────────

  /**
   * Create the mesh object from a frame's geometry.
   */
  private createMesh(frame: CachedMeshFrame): void {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }

    this.geometry = frame.meshGeometry.clone();
    this.material = new THREE.MeshPhysicalMaterial({
      color: this.config.waterColor,
      transparent: true,
      opacity: this.config.waterOpacity,
      roughness: this.config.waterRoughness,
      metalness: this.config.waterMetalness,
      transmission: this.config.waterTransmission,
      ior: this.config.waterIOR,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'FluidMeshCachePlayer';
    this.mesh.frustumCulled = false;
  }

  /**
   * Update mesh from a specific frame index (no interpolation).
   */
  private updateMeshFromFrame(frameIndex: number): void {
    const frame = this.sequence.getFrame(frameIndex);
    if (!frame) return;

    const posAttr = frame.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
    if (!posAttr || posAttr.count === 0) return;

    if (!this.mesh) {
      this.createMesh(frame);
      return;
    }

    this.copyGeometry(frame.meshGeometry);
  }

  /**
   * Update mesh with interpolation between two adjacent frames.
   */
  private updateMeshInterpolated(fractionalFrame: number): void {
    if (this.frameIndices.length < 2) {
      this.updateMeshFromFrame(this.currentFrameIndex);
      return;
    }

    const lowerFrame = Math.floor(fractionalFrame);
    const upperFrame = Math.ceil(fractionalFrame);

    // Find the closest available frame indices
    const lower = this.findClosestFrame(lowerFrame);
    const upper = this.findClosestFrame(upperFrame);

    if (lower === upper) {
      this.updateMeshFromFrame(lower);
      return;
    }

    const frameA = this.sequence.getFrame(lower);
    const frameB = this.sequence.getFrame(upper);

    if (!frameA || !frameB) {
      this.updateMeshFromFrame(this.currentFrameIndex);
      return;
    }

    const posAttrA = frameA.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;
    const posAttrB = frameB.meshGeometry.getAttribute('position') as THREE.BufferAttribute | null;

    if (!posAttrA || !posAttrB || posAttrA.count !== posAttrB.count) {
      this.updateMeshFromFrame(this.currentFrameIndex);
      return;
    }

    // Compute interpolation factor
    const t = (fractionalFrame - lower) / (upper - lower);
    const clampedT = Math.max(0, Math.min(1, t));

    // Create or update geometry
    if (!this.mesh || !this.geometry) {
      this.createMesh(frameA);
    }

    // Interpolate positions
    const posArrayA = posAttrA.array as Float32Array;
    const posArrayB = posAttrB.array as Float32Array;
    const vertexCount = posAttrA.count;

    const currentPosAttr = this.geometry!.getAttribute('position') as THREE.BufferAttribute;
    if (currentPosAttr.count !== vertexCount) {
      // Rebuild geometry if vertex count changed
      this.geometry!.dispose();
      this.geometry = frameA.meshGeometry.clone();
      this.mesh!.geometry = this.geometry;
      return;
    }

    const currentPosArray = currentPosAttr.array as Float32Array;

    for (let i = 0; i < vertexCount * 3; i++) {
      currentPosArray[i] = posArrayA[i] * (1 - clampedT) + posArrayB[i] * clampedT;
    }
    currentPosAttr.needsUpdate = true;

    // Interpolate normals if both frames have them
    const normAttrA = frameA.meshGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const normAttrB = frameB.meshGeometry.getAttribute('normal') as THREE.BufferAttribute | null;

    if (normAttrA && normAttrB && normAttrA.count === normAttrB.count) {
      const normArrayA = normAttrA.array as Float32Array;
      const normArrayB = normAttrB.array as Float32Array;
      const currentNormAttr = this.geometry!.getAttribute('normal') as THREE.BufferAttribute;

      if (currentNormAttr && currentNormAttr.count === normAttrA.count) {
        const currentNormArray = currentNormAttr.array as Float32Array;

        for (let i = 0; i < normAttrA.count * 3; i++) {
          const nx = normArrayA[i] * (1 - clampedT) + normArrayB[i] * clampedT;
          currentNormArray[i] = nx;
        }

        // Re-normalize interpolated normals
        for (let v = 0; v < normAttrA.count; v++) {
          const i3 = v * 3;
          const len = Math.sqrt(
            currentNormArray[i3] * currentNormArray[i3] +
            currentNormArray[i3 + 1] * currentNormArray[i3 + 1] +
            currentNormArray[i3 + 2] * currentNormArray[i3 + 2]
          );
          if (len > 1e-8) {
            const invLen = 1.0 / len;
            currentNormArray[i3] *= invLen;
            currentNormArray[i3 + 1] *= invLen;
            currentNormArray[i3 + 2] *= invLen;
          }
        }
        currentNormAttr.needsUpdate = true;
      }
    }

    this.geometry!.computeBoundingSphere();
  }

  /**
   * Find the closest available frame index to a target.
   */
  private findClosestFrame(targetFrame: number): number {
    if (this.frameIndices.length === 0) return 0;

    let closest = this.frameIndices[0];
    let minDist = Math.abs(targetFrame - closest);

    for (const idx of this.frameIndices) {
      const dist = Math.abs(targetFrame - idx);
      if (dist < minDist) {
        minDist = dist;
        closest = idx;
      }
    }

    return closest;
  }

  /**
   * Copy geometry from a source BufferGeometry to the current mesh geometry.
   */
  private copyGeometry(source: THREE.BufferGeometry): void {
    if (!this.geometry) {
      this.geometry = source.clone();
      if (this.mesh) {
        this.mesh.geometry = this.geometry;
      }
      return;
    }

    const srcPosAttr = source.getAttribute('position') as THREE.BufferAttribute | null;
    if (!srcPosAttr) return;

    const currentPosAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;

    // If vertex count changed, rebuild geometry
    if (currentPosAttr.count !== srcPosAttr.count) {
      this.geometry.dispose();
      this.geometry = source.clone();
      if (this.mesh) {
        this.mesh.geometry = this.geometry;
      }
      return;
    }

    // Copy positions
    const srcPosArray = srcPosAttr.array as Float32Array;
    const currentPosArray = currentPosAttr.array as Float32Array;
    currentPosArray.set(srcPosArray.subarray(0, srcPosAttr.count * 3));
    currentPosAttr.needsUpdate = true;

    // Copy normals
    const srcNormAttr = source.getAttribute('normal') as THREE.BufferAttribute | null;
    if (srcNormAttr) {
      const currentNormAttr = this.geometry.getAttribute('normal') as THREE.BufferAttribute | null;
      if (currentNormAttr && currentNormAttr.count === srcNormAttr.count) {
        const srcNormArray = srcNormAttr.array as Float32Array;
        const currentNormArray = currentNormAttr.array as Float32Array;
        currentNormArray.set(srcNormArray.subarray(0, srcNormAttr.count * 3));
        currentNormAttr.needsUpdate = true;
      }
    }

    // Copy indices
    const srcIndex = source.getIndex();
    const currentIndex = this.geometry.getIndex();
    if (srcIndex && currentIndex && currentIndex.count === srcIndex.count) {
      const srcIdxArray = srcIndex.array;
      const curIdxArray = currentIndex.array as (Uint16Array | Uint32Array);

      if (curIdxArray instanceof Uint32Array && srcIdxArray instanceof Uint32Array) {
        curIdxArray.set(srcIdxArray.subarray(0, srcIndex.count));
      } else if (curIdxArray instanceof Uint16Array && srcIdxArray instanceof Uint16Array) {
        curIdxArray.set(srcIdxArray.subarray(0, srcIndex.count));
      } else {
        // Mixed types: just clone the geometry
        this.geometry.dispose();
        this.geometry = source.clone();
        if (this.mesh) {
          this.mesh.geometry = this.geometry;
        }
        return;
      }
      currentIndex.needsUpdate = true;
    }

    this.geometry.computeBoundingSphere();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.mesh = null;
  }
}

export default FluidSequenceBaker;

/**
 * SimulationCaching.ts — Fluid Simulation Cache System
 *
 * Provides efficient caching for FLIP fluid simulation frames,
 * enabling replay without re-simulation, export/import of cached
 * data, and memory-efficient storage using flat Float32Array buffers.
 *
 * Key components:
 * - CachedFluidFrame: Per-frame particle and obstacle data
 * - FluidSimulationCache: Multi-frame cache with export/import
 *
 * @module sim/caching
 */

import * as THREE from 'three';
import type { FLIPParticle } from './fluid/FLIPFluidSolver';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A single cached frame of fluid simulation data.
 *
 * Stores particle positions, velocities, and types in flat Float32Array
 * buffers for memory efficiency and fast serialization. Obstacle positions
 * are stored separately.
 */
export interface CachedFluidFrame {
  /** Flat array of particle positions: [x0,y0,z0, x1,y1,z1, ...] */
  positions: Float32Array;
  /** Flat array of particle velocities: [vx0,vy0,vz0, vx1,vy1,vz1, ...] */
  velocities: Float32Array;
  /** Per-particle type markers (0=fluid, 1=solid, 2=air, etc.) */
  types: Uint8Array;
  /** Flat array of obstacle positions: [x0,y0,z0, x1,y1,z1, ...] */
  obstaclePositions: Float32Array;
}

/**
 * Configuration for the fluid simulation cache.
 */
export interface FluidCacheConfig {
  /** Maximum number of frames to cache (0 = unlimited) */
  maxFrames: number;
  /** Maximum number of particles per frame (pre-allocates buffers) */
  maxParticles: number;
  /** Maximum number of obstacles per frame */
  maxObstacles: number;
  /** Whether to compress cached data when exporting */
  compressOnExport: boolean;
  /** Memory warning threshold in MB (logs warning when exceeded) */
  memoryWarningMB: number;
}

/**
 * Default cache configuration.
 */
export const DEFAULT_FLUID_CACHE_CONFIG: FluidCacheConfig = {
  maxFrames: 300,
  maxParticles: 50000,
  maxObstacles: 1000,
  compressOnExport: false,
  memoryWarningMB: 512,
};

/**
 * Header structure for binary cache files.
 *
 * Binary format:
 *   [Header: 64 bytes]
 *   [Frame 0: positions | velocities | types | obstaclePositions]
 *   [Frame 1: ...]
 *   ...
 *
 * Header layout (64 bytes):
 *   Bytes 0-3:   Magic number "FCHE" (0x46434845)
 *   Bytes 4-7:   Version (1)
 *   Bytes 8-11:  Frame count (uint32)
 *   Bytes 12-15: Particles per frame (uint32)
 *   Bytes 16-19: Obstacles per frame (uint32)
 *   Bytes 20-23: Flags (uint32) — bit 0 = compressed
 *   Bytes 24-63: Reserved (zeros)
 */
export interface CacheFileHeader {
  /** Magic number for file identification */
  magic: number;
  /** File format version */
  version: number;
  /** Number of cached frames */
  frameCount: number;
  /** Number of particles per frame */
  particlesPerFrame: number;
  /** Number of obstacles per frame */
  obstaclesPerFrame: number;
  /** Bit flags: bit 0 = compressed */
  flags: number;
}

/** Magic number for cache files: "FCHE" in ASCII */
const CACHE_MAGIC = 0x46434845;
/** Current cache file format version */
const CACHE_VERSION = 1;
/** Header size in bytes */
const HEADER_SIZE = 64;

// ============================================================================
// FluidSimulationCache
// ============================================================================

/**
 * Efficient multi-frame cache for FLIP fluid simulation data.
 *
 * Stores per-frame particle positions, velocities, types, and obstacle
 * positions using flat Float32Array/Uint8Array buffers. Supports:
 * - Random-access frame retrieval
 * - Binary export/import for persistent caching
 * - Memory usage tracking
 * - Frame range queries
 *
 * Usage:
 * ```ts
 * const cache = new FluidSimulationCache();
 * cache.initialize(300, 20000);
 *
 * // Cache a frame during simulation
 * cache.cacheFrame(0, particles, obstacles);
 *
 * // Retrieve cached frame for replay
 * const frame = cache.getCachedFrame(0);
 *
 * // Export to disk
 * cache.exportCache('/path/to/cache.bin');
 * ```
 */
export class FluidSimulationCache {
  /** Cached frames indexed by frame number */
  private frames: Map<number, CachedFluidFrame> = new Map();

  /** Cache configuration */
  private config: FluidCacheConfig;

  /** Pre-allocated buffer sizes (particles) */
  private allocatedParticleCount: number = 0;

  /** Pre-allocated buffer sizes (obstacles) */
  private allocatedObstacleCount: number = 0;

  /** Total memory usage estimate in bytes */
  private memoryUsage: number = 0;

  constructor(config: Partial<FluidCacheConfig> = {}) {
    this.config = { ...DEFAULT_FLUID_CACHE_CONFIG, ...config };
  }

  // ── Initialization ─────────────────────────────────────────────────────

  /**
   * Initialize the cache for a given number of frames and particles.
   *
   * Pre-computes buffer sizes and clears any existing cached data.
   * Does NOT pre-allocate all frames (lazy allocation per frame).
   *
   * @param frameCount    Total number of frames expected
   * @param particleCount Number of particles per frame
   */
  initialize(frameCount: number, particleCount: number): void {
    this.frames.clear();
    this.memoryUsage = 0;
    this.allocatedParticleCount = particleCount;
    this.allocatedObstacleCount = this.config.maxObstacles;

    // Estimate total memory if all frames are cached
    const bytesPerFrame = this.computeFrameSize(particleCount, this.allocatedObstacleCount);
    const totalEstimate = bytesPerFrame * Math.min(frameCount, this.config.maxFrames);

    if (totalEstimate / (1024 * 1024) > this.config.memoryWarningMB) {
      console.warn(
        `[FluidSimulationCache] Estimated memory usage: ` +
        `${(totalEstimate / (1024 * 1024)).toFixed(1)} MB exceeds warning threshold ` +
        `of ${this.config.memoryWarningMB} MB`
      );
    }
  }

  // ── Frame Caching ──────────────────────────────────────────────────────

  /**
   * Cache a single frame of simulation data.
   *
   * Converts FLIPParticle objects to flat arrays for efficient storage.
   * If the frame already exists, it is overwritten.
   *
   * @param frameIndex  Frame number to cache
   * @param particles   Array of FLIP particles to cache
   * @param obstacles   Optional array of obstacle positions (Vector3[])
   */
  cacheFrame(
    frameIndex: number,
    particles: FLIPParticle[],
    obstacles: THREE.Vector3[] = [],
  ): void {
    // Check frame limit
    if (this.config.maxFrames > 0 && this.frames.size >= this.config.maxFrames) {
      // Remove the oldest frame (lowest index)
      const oldestKey = Math.min(...this.frames.keys());
      const oldFrame = this.frames.get(oldestKey)!;
      this.memoryUsage -= this.computeFrameDataSize(oldFrame);
      this.frames.delete(oldestKey);
    }

    const particleCount = Math.min(particles.length, this.config.maxParticles);
    const obstacleCount = Math.min(obstacles.length, this.config.maxObstacles);

    // Allocate flat buffers
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const types = new Uint8Array(particleCount);
    const obstaclePositions = new Float32Array(obstacleCount * 3);

    // Copy particle data into flat arrays
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i];
      const i3 = i * 3;

      positions[i3] = p.position.x;
      positions[i3 + 1] = p.position.y;
      positions[i3 + 2] = p.position.z;

      velocities[i3] = p.velocity.x;
      velocities[i3 + 1] = p.velocity.y;
      velocities[i3 + 2] = p.velocity.z;

      // Type: derive from density (simplified heuristic)
      // 0 = fluid, 1 = solid boundary particle, 2 = spray/foam
      if (p.density > 800) {
        types[i] = 0; // fluid
      } else if (p.density > 400) {
        types[i] = 2; // spray/foam
      } else {
        types[i] = 0; // default fluid
      }
    }

    // Copy obstacle positions
    for (let i = 0; i < obstacleCount; i++) {
      const obs = obstacles[i];
      const i3 = i * 3;
      obstaclePositions[i3] = obs.x;
      obstaclePositions[i3 + 1] = obs.y;
      obstaclePositions[i3 + 2] = obs.z;
    }

    const frame: CachedFluidFrame = {
      positions,
      velocities,
      types,
      obstaclePositions,
    };

    // If overwriting an existing frame, subtract old memory usage
    const existing = this.frames.get(frameIndex);
    if (existing) {
      this.memoryUsage -= this.computeFrameDataSize(existing);
    }

    this.frames.set(frameIndex, frame);
    this.memoryUsage += this.computeFrameDataSize(frame);
  }

  /**
   * Cache a frame from raw flat arrays (no FLIPParticle conversion needed).
   *
   * Useful when data is already in flat array format, e.g., after import.
   *
   * @param frameIndex       Frame number
   * @param positions        Flat position array
   * @param velocities       Flat velocity array
   * @param types            Per-particle type array
   * @param obstaclePositions Flat obstacle position array
   */
  cacheFrameRaw(
    frameIndex: number,
    positions: Float32Array,
    velocities: Float32Array,
    types: Uint8Array,
    obstaclePositions: Float32Array,
  ): void {
    const frame: CachedFluidFrame = {
      positions: new Float32Array(positions),
      velocities: new Float32Array(velocities),
      types: new Uint8Array(types),
      obstaclePositions: new Float32Array(obstaclePositions),
    };

    const existing = this.frames.get(frameIndex);
    if (existing) {
      this.memoryUsage -= this.computeFrameDataSize(existing);
    }

    this.frames.set(frameIndex, frame);
    this.memoryUsage += this.computeFrameDataSize(frame);
  }

  // ── Frame Retrieval ────────────────────────────────────────────────────

  /**
   * Get a cached frame by index.
   *
   * @param frameIndex Frame number to retrieve
   * @returns Cached frame data, or undefined if not cached
   */
  getCachedFrame(frameIndex: number): CachedFluidFrame | undefined {
    return this.frames.get(frameIndex);
  }

  /**
   * Check whether a specific frame is cached.
   *
   * @param frameIndex Frame number to check
   * @returns True if the frame exists in the cache
   */
  isFrameCached(frameIndex: number): boolean {
    return this.frames.has(frameIndex);
  }

  /**
   * Get the particle count for a specific cached frame.
   *
   * @param frameIndex Frame number
   * @returns Number of particles in the frame, or 0 if not cached
   */
  getFrameParticleCount(frameIndex: number): number {
    const frame = this.frames.get(frameIndex);
    if (!frame) return 0;
    return frame.positions.length / 3;
  }

  /**
   * Get the obstacle count for a specific cached frame.
   *
   * @param frameIndex Frame number
   * @returns Number of obstacles in the frame, or 0 if not cached
   */
  getFrameObstacleCount(frameIndex: number): number {
    const frame = this.frames.get(frameIndex);
    if (!frame) return 0;
    return frame.obstaclePositions.length / 3;
  }

  /**
   * Get all cached frame indices.
   *
   * @returns Sorted array of cached frame indices
   */
  getCachedFrameIndices(): number[] {
    return Array.from(this.frames.keys()).sort((a, b) => a - b);
  }

  /**
   * Get a range of cached frames.
   *
   * @param startFrame Start frame index (inclusive)
   * @param endFrame   End frame index (exclusive)
   * @returns Array of [frameIndex, CachedFluidFrame] pairs
   */
  getFrameRange(startFrame: number, endFrame: number): Array<[number, CachedFluidFrame]> {
    const result: Array<[number, CachedFluidFrame]> = [];
    for (let i = startFrame; i < endFrame; i++) {
      const frame = this.frames.get(i);
      if (frame) {
        result.push([i, frame]);
      }
    }
    return result;
  }

  /**
   * Convert a cached frame back to FLIPParticle objects.
   *
   * Useful for re-injecting cached data into the FLIP solver.
   *
   * @param frameIndex Frame number to reconstruct
   * @returns Array of FLIPParticle objects, or empty array if not cached
   */
  getFrameAsParticles(frameIndex: number): FLIPParticle[] {
    const frame = this.frames.get(frameIndex);
    if (!frame) return [];

    const count = frame.positions.length / 3;
    const particles: FLIPParticle[] = [];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      particles.push({
        position: new THREE.Vector3(
          frame.positions[i3],
          frame.positions[i3 + 1],
          frame.positions[i3 + 2],
        ),
        velocity: new THREE.Vector3(
          frame.velocities[i3],
          frame.velocities[i3 + 1],
          frame.velocities[i3 + 2],
        ),
        density: 1000, // default water density
        pressure: 0,
        id: i,
      });
    }

    return particles;
  }

  // ── Export / Import ────────────────────────────────────────────────────

  /**
   * Export all cached frames to a binary ArrayBuffer.
   *
   * Binary format:
   *   [Header: 64 bytes]
   *   [Frame 0 data: positions | velocities | types | obstaclePositions]
   *   [Frame 1 data: ...]
   *   ...
   *
   * Each frame's data is stored contiguously:
   *   - positions: particleCount * 3 * 4 bytes (Float32)
   *   - velocities: particleCount * 3 * 4 bytes (Float32)
   *   - types: particleCount * 1 bytes (Uint8)
   *   - obstaclePositions: obstacleCount * 3 * 4 bytes (Float32)
   *
   * @returns ArrayBuffer containing the binary cache data
   */
  exportCache(): ArrayBuffer {
    const sortedIndices = this.getCachedFrameIndices();
    const frameCount = sortedIndices.length;

    if (frameCount === 0) {
      // Return header-only buffer
      const buffer = new ArrayBuffer(HEADER_SIZE);
      const view = new DataView(buffer);
      this.writeHeader(view, 0, 0, 0);
      return buffer;
    }

    // Determine particle and obstacle counts (use the first frame as reference)
    const firstFrame = this.frames.get(sortedIndices[0])!;
    const particleCount = firstFrame.positions.length / 3;
    const obstacleCount = firstFrame.obstaclePositions.length / 3;

    // Compute frame data size
    const frameDataSize = this.computeFrameSize(particleCount, obstacleCount);
    const totalSize = HEADER_SIZE + frameDataSize * frameCount;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write header
    this.writeHeader(view, frameCount, particleCount, obstacleCount);

    // Write frame data
    let offset = HEADER_SIZE;
    for (const frameIndex of sortedIndices) {
      const frame = this.frames.get(frameIndex)!;

      // Write frame index (uint32)
      view.setUint32(offset, frameIndex, true);
      offset += 4;

      // Write positions
      const posView = new Float32Array(buffer, offset, particleCount * 3);
      posView.set(frame.positions);
      offset += particleCount * 3 * 4;

      // Write velocities
      const velView = new Float32Array(buffer, offset, particleCount * 3);
      velView.set(frame.velocities);
      offset += particleCount * 3 * 4;

      // Write types
      const typeView = new Uint8Array(buffer, offset, particleCount);
      typeView.set(frame.types);
      offset += particleCount;

      // Write obstacle positions
      const obsView = new Float32Array(buffer, offset, obstacleCount * 3);
      obsView.set(frame.obstaclePositions);
      offset += obstacleCount * 3 * 4;
    }

    return buffer;
  }

  /**
   * Export cached data and provide as a downloadable Blob.
   *
   * Convenience method for browser-based applications.
   *
   * @returns Blob containing the binary cache data
   */
  exportCacheAsBlob(): Blob {
    const buffer = this.exportCache();
    return new Blob([buffer], { type: 'application/octet-stream' });
  }

  /**
   * Import cached simulation data from a binary ArrayBuffer.
   *
   * Parses the binary format written by exportCache() and populates
   * the cache with the imported frames. Existing cached data is cleared.
   *
   * @param inputPathOrBuffer ArrayBuffer containing cached data
   *                          (parameter name is historical; accepts buffer)
   */
  importCache(inputPathOrBuffer: ArrayBuffer): void {
    this.frames.clear();
    this.memoryUsage = 0;

    const view = new DataView(inputPathOrBuffer);

    // Read header
    const header = this.readHeader(view);

    if (header.magic !== CACHE_MAGIC) {
      throw new Error(
        `[FluidSimulationCache] Invalid cache file: bad magic number ` +
        `(expected 0x${CACHE_MAGIC.toString(16)}, got 0x${header.magic.toString(16)})`
      );
    }

    if (header.version !== CACHE_VERSION) {
      throw new Error(
        `[FluidSimulationCache] Unsupported cache version: ${header.version} ` +
        `(expected ${CACHE_VERSION})`
      );
    }

    if (header.frameCount === 0) {
      console.log('[FluidSimulationCache] Imported empty cache (0 frames)');
      return;
    }

    const { frameCount, particlesPerFrame, obstaclesPerFrame } = header;
    const particleCount = particlesPerFrame;
    const obstacleCount = obstaclesPerFrame;

    this.allocatedParticleCount = particleCount;
    this.allocatedObstacleCount = obstacleCount;

    // Compute frame data size (including the frame index uint32 prefix)
    const frameDataSize =
      4 + // frame index
      particleCount * 3 * 4 + // positions
      particleCount * 3 * 4 + // velocities
      particleCount + // types
      obstacleCount * 3 * 4;  // obstacles

    let offset = HEADER_SIZE;

    for (let f = 0; f < frameCount; f++) {
      // Read frame index
      const frameIndex = view.getUint32(offset, true);
      offset += 4;

      // Read positions
      const positions = new Float32Array(particleCount * 3);
      const posView = new Float32Array(inputPathOrBuffer, offset, particleCount * 3);
      positions.set(posView);
      offset += particleCount * 3 * 4;

      // Read velocities
      const velocities = new Float32Array(particleCount * 3);
      const velView = new Float32Array(inputPathOrBuffer, offset, particleCount * 3);
      velocities.set(velView);
      offset += particleCount * 3 * 4;

      // Read types
      const types = new Uint8Array(particleCount);
      const typeView = new Uint8Array(inputPathOrBuffer, offset, particleCount);
      types.set(typeView);
      offset += particleCount;

      // Read obstacle positions
      const obstaclePositions = new Float32Array(obstacleCount * 3);
      const obsView = new Float32Array(inputPathOrBuffer, offset, obstacleCount * 3);
      obstaclePositions.set(obsView);
      offset += obstacleCount * 3 * 4;

      const frame: CachedFluidFrame = {
        positions,
        velocities,
        types,
        obstaclePositions,
      };

      this.frames.set(frameIndex, frame);
      this.memoryUsage += this.computeFrameDataSize(frame);
    }

    console.log(
      `[FluidSimulationCache] Imported ${frameCount} frames ` +
      `(${particleCount} particles, ${obstacleCount} obstacles per frame)`
    );
  }

  // ── Memory Management ──────────────────────────────────────────────────

  /**
   * Get estimated memory usage in megabytes.
   *
   * @returns Memory usage in MB
   */
  getMemoryUsage(): number {
    return this.memoryUsage / (1024 * 1024);
  }

  /**
   * Get estimated memory usage in bytes.
   *
   * @returns Memory usage in bytes
   */
  getMemoryUsageBytes(): number {
    return this.memoryUsage;
  }

  /**
   * Get the number of cached frames.
   */
  getFrameCount(): number {
    return this.frames.size;
  }

  /**
   * Clear all cached frames and reset memory tracking.
   */
  clear(): void {
    this.frames.clear();
    this.memoryUsage = 0;
  }

  /**
   * Remove a specific frame from the cache.
   *
   * @param frameIndex Frame number to remove
   * @returns True if the frame was removed, false if it wasn't cached
   */
  removeFrame(frameIndex: number): boolean {
    const frame = this.frames.get(frameIndex);
    if (!frame) return false;

    this.memoryUsage -= this.computeFrameDataSize(frame);
    this.frames.delete(frameIndex);
    return true;
  }

  /**
   * Remove frames outside the given range.
   *
   * Useful for keeping only a window of cached frames during streaming playback.
   *
   * @param keepStart Start of range to keep (inclusive)
   * @param keepEnd   End of range to keep (inclusive)
   * @returns Number of frames removed
   */
  trimToRange(keepStart: number, keepEnd: number): number {
    let removed = 0;
    for (const [index, frame] of this.frames) {
      if (index < keepStart || index > keepEnd) {
        this.memoryUsage -= this.computeFrameDataSize(frame);
        this.frames.delete(index);
        removed++;
      }
    }
    return removed;
  }

  // ── Statistics ─────────────────────────────────────────────────────────

  /**
   * Get cache statistics.
   *
   * @returns Object with cache statistics
   */
  getStats(): {
    frameCount: number;
    memoryUsageMB: number;
    cachedFrames: number[];
    averageParticleCount: number;
    averageObstacleCount: number;
  } {
    let totalParticles = 0;
    let totalObstacles = 0;

    for (const frame of this.frames.values()) {
      totalParticles += frame.positions.length / 3;
      totalObstacles += frame.obstaclePositions.length / 3;
    }

    const count = this.frames.size;

    return {
      frameCount: count,
      memoryUsageMB: this.getMemoryUsage(),
      cachedFrames: this.getCachedFrameIndices(),
      averageParticleCount: count > 0 ? Math.round(totalParticles / count) : 0,
      averageObstacleCount: count > 0 ? Math.round(totalObstacles / count) : 0,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Compute the byte size of a single frame for given particle and obstacle counts.
   */
  private computeFrameSize(particleCount: number, obstacleCount: number): number {
    return (
      4 + // frame index (uint32)
      particleCount * 3 * 4 + // positions (Float32 × 3)
      particleCount * 3 * 4 + // velocities (Float32 × 3)
      particleCount + // types (Uint8)
      obstacleCount * 3 * 4   // obstaclePositions (Float32 × 3)
    );
  }

  /**
   * Compute the byte size of a CachedFluidFrame's data.
   */
  private computeFrameDataSize(frame: CachedFluidFrame): number {
    return (
      frame.positions.byteLength +
      frame.velocities.byteLength +
      frame.types.byteLength +
      frame.obstaclePositions.byteLength
    );
  }

  /**
   * Write the cache file header to a DataView at offset 0.
   */
  private writeHeader(
    view: DataView,
    frameCount: number,
    particleCount: number,
    obstacleCount: number,
  ): void {
    view.setUint32(0, CACHE_MAGIC, true);          // Magic
    view.setUint32(4, CACHE_VERSION, true);         // Version
    view.setUint32(8, frameCount, true);            // Frame count
    view.setUint32(12, particleCount, true);        // Particles per frame
    view.setUint32(16, obstacleCount, true);        // Obstacles per frame
    view.setUint32(20, this.config.compressOnExport ? 1 : 0, true); // Flags
    // Bytes 24-63: reserved (already zero from ArrayBuffer initialization)
  }

  /**
   * Read the cache file header from a DataView.
   */
  private readHeader(view: DataView): CacheFileHeader {
    return {
      magic: view.getUint32(0, true),
      version: view.getUint32(4, true),
      frameCount: view.getUint32(8, true),
      particlesPerFrame: view.getUint32(12, true),
      obstaclesPerFrame: view.getUint32(16, true),
      flags: view.getUint32(20, true),
    };
  }
}

// ============================================================================
// FluidCachePlayer — Replay cached frames on a THREE.Points mesh
// ============================================================================

/**
 * Configuration for the cache player.
 */
export interface CachePlayerConfig {
  /** Playback frames per second (default 30) */
  fps: number;
  /** Whether to loop playback (default true) */
  loop: boolean;
  /** Point size for particle rendering (default 0.05) */
  pointSize: number;
  /** Base color for fluid particles (default: blue) */
  fluidColor: THREE.Color;
  /** Base color for spray/foam particles (default: white) */
  sprayColor: THREE.Color;
}

/**
 * Default cache player configuration.
 */
export const DEFAULT_CACHE_PLAYER_CONFIG: CachePlayerConfig = {
  fps: 30,
  loop: true,
  pointSize: 0.05,
  fluidColor: new THREE.Color(0.2, 0.4, 0.9),
  sprayColor: new THREE.Color(0.9, 0.95, 1.0),
};

/**
 * Plays back cached fluid simulation frames on a THREE.Points object.
 *
 * Creates a point cloud from the cached particle data and updates it
 * per frame. Supports play/pause/seek and looped playback.
 *
 * Usage:
 * ```ts
 * const player = new FluidCachePlayer(cache, scene, camera);
 * player.play();
 * // In animation loop:
 * player.update(deltaTime);
 * ```
 */
export class FluidCachePlayer {
  private cache: FluidSimulationCache;
  private config: CachePlayerConfig;
  private currentFrame: number = 0;
  private playing: boolean = false;
  private accumulatedTime: number = 0;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.PointsMaterial | null = null;

  constructor(
    cache: FluidSimulationCache,
    config: Partial<CachePlayerConfig> = {},
  ) {
    this.cache = cache;
    this.config = { ...DEFAULT_CACHE_PLAYER_CONFIG, ...config };
  }

  /**
   * Create or update the THREE.Points mesh for the current frame.
   *
   * @returns THREE.Points object, or null if no cached data available
   */
  createPointsMesh(): THREE.Points | null {
    const frame = this.cache.getCachedFrame(this.currentFrame);
    if (!frame) return null;

    const particleCount = frame.positions.length / 3;

    if (!this.geometry) {
      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(frame.positions, 3),
      );

      // Color attribute: per-particle color based on type
      const colors = new Float32Array(particleCount * 3);
      this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      this.material = new THREE.PointsMaterial({
        size: this.config.pointSize,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      this.points = new THREE.Points(this.geometry, this.material);
      this.points.name = 'FluidCachePlayer';
    }

    // Update positions
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr.count !== particleCount) {
      this.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(frame.positions), 3),
      );
      this.geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3),
      );
    } else {
      posAttr.array.set(frame.positions);
      posAttr.needsUpdate = true;
    }

    // Update colors based on particle type
    const colorAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      const type = frame.types[i];
      const i3 = i * 3;

      if (type === 2) {
        // Spray/foam
        colorAttr.array[i3] = this.config.sprayColor.r;
        colorAttr.array[i3 + 1] = this.config.sprayColor.g;
        colorAttr.array[i3 + 2] = this.config.sprayColor.b;
      } else {
        // Fluid
        colorAttr.array[i3] = this.config.fluidColor.r;
        colorAttr.array[i3 + 1] = this.config.fluidColor.g;
        colorAttr.array[i3 + 2] = this.config.fluidColor.b;
      }
    }
    colorAttr.needsUpdate = true;

    this.geometry.computeBoundingSphere();
    return this.points;
  }

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
   * Seek to a specific frame.
   *
   * @param frameIndex Frame number to seek to
   */
  seek(frameIndex: number): void {
    this.currentFrame = frameIndex;
    this.accumulatedTime = 0;
    this.createPointsMesh();
  }

  /**
   * Update the player with elapsed time.
   *
   * Call this from the animation loop.
   *
   * @param deltaTime Time elapsed since last update in seconds
   */
  update(deltaTime: number): void {
    if (!this.playing) return;

    this.accumulatedTime += deltaTime;
    const frameInterval = 1.0 / this.config.fps;

    if (this.accumulatedTime >= frameInterval) {
      this.accumulatedTime -= frameInterval;

      // Advance frame
      const cachedIndices = this.cache.getCachedFrameIndices();
      if (cachedIndices.length === 0) return;

      const currentPos = cachedIndices.indexOf(this.currentFrame);
      const nextPos = currentPos + 1;

      if (nextPos < cachedIndices.length) {
        this.currentFrame = cachedIndices[nextPos];
      } else if (this.config.loop) {
        this.currentFrame = cachedIndices[0];
      } else {
        this.playing = false;
        return;
      }

      this.createPointsMesh();
    }
  }

  /**
   * Get the current playback frame index.
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * Get whether playback is active.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Get the THREE.Points mesh.
   */
  getPointsMesh(): THREE.Points | null {
    return this.points;
  }

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
    this.points = null;
  }
}

export default FluidSimulationCache;

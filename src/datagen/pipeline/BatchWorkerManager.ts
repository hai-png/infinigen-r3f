/**
 * BatchWorkerManager — WebWorker-based parallel scene generation
 *
 * Spawns WebWorkers for parallel scene generation. Each worker generates
 * one scene with a different seed, enabling reproducible, concurrent
 * dataset creation without blocking the main thread.
 *
 * Usage:
 *   const manager = new BatchWorkerManager({ workerCount: 4, seedRange: [0, 99] });
 *   const results = await manager.run(config);
 *   manager.dispose();
 *
 * @module pipeline
 */

import { Logger } from '@/core/util/Logger';
import { SeededRandom } from '@/core/util/MathUtils';
import { DatasetManifest, ManifestSceneEntry } from './DatasetManifest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchWorkerConfig {
  /** Number of WebWorkers to spawn (default: navigator.hardwareConcurrency - 1) */
  workerCount: number;
  /** Seed range [start, end] inclusive — each worker gets a unique seed */
  seedRange: [number, number];
  /** Scene generation config passed to each worker */
  sceneConfig?: Record<string, unknown>;
  /** Per-worker timeout in ms (default 120 000) */
  timeoutMs?: number;
}

export interface WorkerSceneResult {
  sceneId: string;
  seed: number;
  /** Blob URLs or data URLs for generated images */
  images: string[];
  /** Ground truth data (serialized) */
  groundTruth?: SerializedGT;
  /** Any error message */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

export interface SerializedGT {
  depth?: number[];
  normal?: number[];
  objectSegmentation?: number[];
  instanceSegmentation?: number[];
  width: number;
  height: number;
  objectMap: Array<[number, string]>;
  instanceMap: Array<[number, string]>;
}

export interface BatchWorkerProgress {
  /** Total scenes to generate */
  total: number;
  /** Scenes completed so far */
  completed: number;
  /** Scenes that failed */
  failed: number;
  /** Currently running workers */
  running: number;
  /** Per-scene progress callback */
  onSceneComplete?: (result: WorkerSceneResult) => void;
}

// ---------------------------------------------------------------------------
// Inline Worker source
// ---------------------------------------------------------------------------

/**
 * The worker script is inlined as a string so that no separate file is
 * needed at build time. The worker receives a seed + config, generates a
 * scene, and posts the result back.
 */
const WORKER_SOURCE = `
  // --- BatchWorker inline script ---
  self.onmessage = async function(e) {
    const { sceneId, seed, sceneConfig, timeoutMs } = e.data;

    const startTime = performance.now();

    try {
      // Set up a seeded RNG for reproducibility
      let rngState = seed;
      const rng = () => {
        rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
        return rngState / 0x7fffffff;
      };

      // Generate a simple procedural scene description.
      // In production this would call the full scene generator.
      const objectCount = Math.floor(rng() * 10) + 3;
      const objects = [];
      for (let i = 0; i < objectCount; i++) {
        objects.push({
          id: 'obj_' + i,
          type: rng() > 0.5 ? 'cube' : 'sphere',
          position: [rng() * 10 - 5, rng() * 5, rng() * 10 - 5],
          scale: [0.5 + rng(), 0.5 + rng(), 0.5 + rng()],
          label: ['chair', 'table', 'lamp', 'sofa', 'shelf'][Math.floor(rng() * 5)],
        });
      }

      // Simulate rendering delay (proportional to complexity)
      const renderDelay = 50 + objectCount * 10;
      await new Promise(r => setTimeout(r, renderDelay));

      // Build ground truth (simplified)
      const width = sceneConfig?.imageWidth ?? 640;
      const height = sceneConfig?.imageHeight ?? 480;
      const pixelCount = width * height;

      // Generate segmentation map
      const objectSegmentation = new Array(pixelCount);
      const objectMapEntries = [];
      for (let i = 0; i < objectCount; i++) {
        objectMapEntries.push([i + 1, objects[i].label]);
      }
      for (let p = 0; p < pixelCount; p++) {
        objectSegmentation[p] = Math.floor(rng() * objectCount) + 1;
      }

      const durationMs = performance.now() - startTime;

      self.postMessage({
        sceneId,
        seed,
        images: [],
        groundTruth: {
          objectSegmentation,
          width,
          height,
          objectMap: objectMapEntries,
          instanceMap: objectMapEntries,
        },
        durationMs,
      });
    } catch (err) {
      self.postMessage({
        sceneId,
        seed,
        images: [],
        durationMs: performance.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
`;

// ---------------------------------------------------------------------------
// BatchWorkerManager
// ---------------------------------------------------------------------------

export class BatchWorkerManager {
  private config: BatchWorkerConfig;
  private workers: Worker[] = [];
  private manifest: DatasetManifest;
  private disposed: boolean = false;

  constructor(config: Partial<BatchWorkerConfig> = {}) {
    const defaultWorkerCount =
      typeof navigator !== 'undefined'
        ? Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1)
        : 2;

    this.config = {
      workerCount: config.workerCount ?? defaultWorkerCount,
      seedRange: config.seedRange ?? [0, 9],
      sceneConfig: config.sceneConfig ?? {},
      timeoutMs: config.timeoutMs ?? 120_000,
    };

    this.manifest = new DatasetManifest();
  }

  /**
   * Run batch generation: spawn workers, distribute seeds, collect results.
   *
   * @param overrides - Optional overrides applied to the sceneConfig for this run
   * @returns The dataset manifest with all scene entries
   */
  async run(
    overrides?: Record<string, unknown>,
    progress?: BatchWorkerProgress,
  ): Promise<DatasetManifest> {
    if (this.disposed) {
      throw new Error('BatchWorkerManager has been disposed');
    }

    const [seedStart, seedEnd] = this.config.seedRange;
    const totalScenes = seedEnd - seedStart + 1;
    const seeds = Array.from({ length: totalScenes }, (_, i) => seedStart + i);

    if (progress) {
      progress.total = totalScenes;
      progress.completed = 0;
      progress.failed = 0;
      progress.running = 0;
    }

    // Create workers
    this.createWorkers();

    const results: WorkerSceneResult[] = [];
    let nextSeedIndex = 0;

    // Distribute seeds to workers using a simple queue
    const assignWork = (worker: Worker): Promise<void> => {
      return new Promise((resolve) => {
        if (nextSeedIndex >= seeds.length) {
          resolve();
          return;
        }

        const seed = seeds[nextSeedIndex++];
        const sceneId = `scene_seed_${seed}`;
        const sceneConfig = { ...this.config.sceneConfig, ...overrides };

        const timer = setTimeout(() => {
          // Timeout — treat as failure
          results.push({
            sceneId,
            seed,
            images: [],
            durationMs: this.config.timeoutMs!,
            error: `Timed out after ${this.config.timeoutMs}ms`,
          });
          if (progress) {
            progress.failed++;
            progress.running = Math.max(0, progress.running - 1);
          }
          resolve();
        }, this.config.timeoutMs);

        worker.onmessage = (e: MessageEvent) => {
          clearTimeout(timer);
          const result: WorkerSceneResult = e.data;
          results.push(result);

          if (progress) {
            if (result.error) {
              progress.failed++;
            } else {
              progress.completed++;
            }
            progress.running = Math.max(0, progress.running - 1);
            progress.onSceneComplete?.(result);
          }

          // Continue assigning work
          assignWork(worker).then(resolve);
        };

        worker.onerror = (err) => {
          clearTimeout(timer);
          results.push({
            sceneId,
            seed,
            images: [],
            durationMs: 0,
            error: `Worker error: ${err.message || String(err)}`,
          });
          if (progress) {
            progress.failed++;
            progress.running = Math.max(0, progress.running - 1);
          }
          resolve();
        };

        if (progress) progress.running++;
        worker.postMessage({ sceneId, seed, sceneConfig, timeoutMs: this.config.timeoutMs });
      });
    };

    // Start all workers
    const workerPromises = this.workers.map((worker) => assignWork(worker));
    await Promise.all(workerPromises);

    // Record results into the manifest
    for (const result of results) {
      if (result.error) {
        Logger.warn('BatchWorkerManager', `Scene ${result.sceneId} failed: ${result.error}`);
        continue;
      }

      const entry: ManifestSceneEntry = {
        scene_id: result.sceneId,
        seed: result.seed,
        parameters: { ...this.config.sceneConfig, ...overrides },
        ground_truth_files: result.images,
        metadata: {
          durationMs: result.durationMs,
          objectMap: result.groundTruth?.objectMap ?? [],
          instanceMap: result.groundTruth?.instanceMap ?? [],
          width: result.groundTruth?.width,
          height: result.groundTruth?.height,
        },
      };

      this.manifest.addScene(entry);
    }

    Logger.info(
      'BatchWorkerManager',
      `Batch complete: ${this.manifest.getManifest().scenes.length} scenes, ` +
        `${results.filter((r) => r.error).length} failures`,
    );

    return this.manifest;
  }

  /**
   * Get the current manifest (available after run())
   */
  getManifest(): DatasetManifest {
    return this.manifest;
  }

  /**
   * Create WebWorkers from the inline source
   */
  private createWorkers(): void {
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    for (let i = 0; i < this.config.workerCount; i++) {
      const worker = new Worker(url);
      this.workers.push(worker);
    }

    // Revoke after workers are created (they've already loaded the script)
    URL.revokeObjectURL(url);
  }

  /**
   * Dispose workers and release resources
   */
  dispose(): void {
    this.disposed = true;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
  }
}

export default BatchWorkerManager;

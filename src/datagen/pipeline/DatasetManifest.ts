/**
 * DatasetManifest — Reproducible dataset generation manifest
 *
 * Records every scene generated in a batch run so that the dataset can be
 * reproduced, inspected, and extended. The manifest is a JSON document
 * with metadata about the generation process plus a per-scene entry list.
 *
 * Schema:
 *   {
 *     "version": "1.0",
 *     "created_at": "2025-01-01T00:00:00.000Z",
 *     "generator": "infinigen-r3f",
 *     "config": { ... },            // global generation config
 *     "scenes": [
 *       {
 *         "scene_id": "scene_seed_42",
 *         "seed": 42,
 *         "parameters": { ... },
 *         "ground_truth_files": ["depth.png", "normal.png", ...],
 *         "metadata": { ... }
 *       },
 *       ...
 *     ]
 *   }
 *
 * @module pipeline
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManifestSceneEntry {
  /** Unique scene identifier */
  scene_id: string;
  /** Random seed used for generation */
  seed: number;
  /** Generation parameters (scene config, render settings, etc.) */
  parameters: Record<string, unknown>;
  /** Paths / URLs to ground truth output files */
  ground_truth_files: string[];
  /** Arbitrary metadata (duration, stats, etc.) */
  metadata: Record<string, unknown>;
}

export interface ManifestRoot {
  /** Manifest format version */
  version: string;
  /** ISO timestamp of manifest creation */
  created_at: string;
  /** Generator name */
  generator: string;
  /** Global generation config applied to all scenes */
  config: Record<string, unknown>;
  /** Per-scene entries */
  scenes: ManifestSceneEntry[];
}

// ---------------------------------------------------------------------------
// DatasetManifest
// ---------------------------------------------------------------------------

export class DatasetManifest {
  private root: ManifestRoot;
  private sceneIndex: Map<string, number> = new Map(); // scene_id → index

  constructor(config: Record<string, unknown> = {}) {
    this.root = {
      version: '1.0',
      created_at: new Date().toISOString(),
      generator: 'infinigen-r3f',
      config,
      scenes: [],
    };
  }

  // -----------------------------------------------------------------------
  // Mutation API
  // -----------------------------------------------------------------------

  /**
   * Add a scene entry to the manifest.
   *
   * If a scene with the same scene_id already exists it is replaced.
   *
   * @returns The index of the added entry
   */
  addScene(entry: ManifestSceneEntry): number {
    const existing = this.sceneIndex.get(entry.scene_id);
    if (existing !== undefined) {
      // Replace existing entry
      this.root.scenes[existing] = entry;
      return existing;
    }
    const idx = this.root.scenes.length;
    this.root.scenes.push(entry);
    this.sceneIndex.set(entry.scene_id, idx);
    return idx;
  }

  /**
   * Remove a scene entry by scene_id.
   *
   * @returns true if the entry was found and removed
   */
  removeScene(sceneId: string): boolean {
    const idx = this.sceneIndex.get(sceneId);
    if (idx === undefined) return false;

    this.root.scenes.splice(idx, 1);
    // Rebuild index (splice shifts later elements)
    this.sceneIndex.clear();
    this.root.scenes.forEach((entry, i) => {
      this.sceneIndex.set(entry.scene_id, i);
    });
    return true;
  }

  /**
   * Update the global config (merged into existing config).
   */
  updateConfig(partial: Record<string, unknown>): void {
    this.root.config = { ...this.root.config, ...partial };
  }

  // -----------------------------------------------------------------------
  // Query API
  // -----------------------------------------------------------------------

  /**
   * Return the full manifest object (read-only reference).
   */
  getManifest(): ManifestRoot {
    return this.root;
  }

  /**
   * Get a specific scene entry by scene_id.
   */
  getScene(sceneId: string): ManifestSceneEntry | undefined {
    const idx = this.sceneIndex.get(sceneId);
    return idx !== undefined ? this.root.scenes[idx] : undefined;
  }

  /**
   * Number of scenes in the manifest.
   */
  get sceneCount(): number {
    return this.root.scenes.length;
  }

  /**
   * Get all scene IDs.
   */
  get sceneIds(): string[] {
    return this.root.scenes.map((s) => s.scene_id);
  }

  /**
   * Get all seeds used.
   */
  get seeds(): number[] {
    return this.root.scenes.map((s) => s.seed);
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /**
   * Export the manifest as a JSON string.
   */
  exportJSON(pretty: boolean = true): string {
    return JSON.stringify(this.root, null, pretty ? 2 : 0);
  }

  /**
   * Export the manifest as a downloadable Blob (browser environment).
   */
  toBlob(): Blob {
    return new Blob([this.exportJSON()], { type: 'application/json' });
  }

  /**
   * Trigger a browser download of the manifest JSON.
   */
  download(filename: string = 'dataset_manifest.json'): void {
    if (typeof window === 'undefined') return;

    const url = URL.createObjectURL(this.toBlob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Write the manifest to disk (Node.js environment).
   */
  async writeToFile(outputPath: string): Promise<void> {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('fs');
      const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, this.exportJSON(), 'utf-8');
    } else {
      this.download(outputPath.split('/').pop() ?? 'manifest.json');
    }
  }

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  /**
   * Create a DatasetManifest from a previously exported JSON string.
   */
  static fromJSON(json: string): DatasetManifest {
    const parsed: ManifestRoot = JSON.parse(json);
    const manifest = new DatasetManifest(parsed.config);
    manifest.root.version = parsed.version ?? '1.0';
    manifest.root.created_at = parsed.created_at ?? new Date().toISOString();
    manifest.root.generator = parsed.generator ?? 'infinigen-r3f';
    for (const scene of parsed.scenes ?? []) {
      manifest.addScene(scene);
    }
    return manifest;
  }

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------

  /**
   * Compute summary statistics over the manifest.
   */
  getStatistics(): {
    totalScenes: number;
    uniqueSeeds: number;
    totalGroundTruthFiles: number;
    avgGroundTruthFilesPerScene: number;
    parameterKeys: string[];
  } {
    const seeds = new Set(this.root.scenes.map((s) => s.seed));
    const totalGT = this.root.scenes.reduce(
      (sum, s) => sum + s.ground_truth_files.length,
      0,
    );
    const paramKeys = new Set<string>();
    this.root.scenes.forEach((s) => {
      Object.keys(s.parameters).forEach((k) => paramKeys.add(k));
    });

    return {
      totalScenes: this.root.scenes.length,
      uniqueSeeds: seeds.size,
      totalGroundTruthFiles: totalGT,
      avgGroundTruthFilesPerScene:
        this.root.scenes.length > 0 ? totalGT / this.root.scenes.length : 0,
      parameterKeys: Array.from(paramKeys),
    };
  }
}

export default DatasetManifest;

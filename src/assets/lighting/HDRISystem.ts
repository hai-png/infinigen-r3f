/**
 * HDRISystem.ts — Enhanced HDRI Lighting System
 *
 * Extends the existing HDRI lighting in the infinigen-r3f project with:
 *   - EXR format support via EXRLoader from Three.js examples
 *   - Random HDRI selection from a directory
 *   - HDRI rotation control (Z-axis rotation of environment map)
 *   - HDRI preview (generate a small preview DataTexture)
 *   - Integration with Three.js PMREMGenerator for PBR environment maps
 *
 * Supports both .hdr (Radiance HDR) and .exr (OpenEXR) formats.
 *
 * @module lighting
 */

import * as THREE from 'three';

// ============================================================================
// Type Declarations for Three.js Example Loaders
// ============================================================================

/**
 * Minimal type interface for the RGBELoader dynamically imported from
 * three/examples/jsm/loaders/RGBELoader.js
 */
interface RGBELoaderType {
  new (manager?: THREE.LoadingManager): RGBELoaderType;
  load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent | Error) => void,
  ): void;
  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<THREE.Texture>;
  setDataType(type: THREE.TextureDataType): this;
}

/**
 * Minimal type interface for the EXRLoader dynamically imported from
 * three/examples/jsm/loaders/EXRLoader.js
 */
interface EXRLoaderType {
  new (manager?: THREE.LoadingManager): EXRLoaderType;
  load(
    url: string,
    onLoad: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent | Error) => void,
  ): void;
  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<THREE.Texture>;
  setDataType(type: THREE.TextureDataType): this;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the HDRI system.
 */
export interface HDRIConfig {
  /** Default intensity for environment lighting (default 1.0) */
  intensity: number;
  /** Background blurriness for the scene (default 0) */
  backgroundBlurriness: number;
  /** Background intensity (default 1.0) */
  backgroundIntensity: number;
  /** Environment intensity multiplier (default 1.0) */
  environmentIntensity: number;
  /** Preview resolution for generatePreview() (default 128) */
  previewResolution: number;
  /** Whether to use PMREMGenerator for PBR environment map (default true) */
  usePMREM: boolean;
}

/** Default HDRI configuration */
const DEFAULT_HDRI_CONFIG: HDRIConfig = {
  intensity: 1.0,
  backgroundBlurriness: 0,
  backgroundIntensity: 1.0,
  environmentIntensity: 1.0,
  previewResolution: 128,
  usePMREM: true,
};

// ============================================================================
// HDRISystem
// ============================================================================

/**
 * Enhanced HDRI lighting system with EXR support, rotation control,
 * random selection, and preview generation.
 *
 * Usage:
 * ```typescript
 * const hdri = new HDRISystem();
 *
 * // Load a specific HDRI file
 * const texture = await hdri.loadHDRI('/path/to/sky.hdr');
 * hdri.applyToScene(scene, texture);
 *
 * // Load a random HDRI from a directory
 * const randomTex = await hdri.loadRandomHDRI('/path/to/hdri/dir');
 *
 * // Rotate the environment map
 * hdri.setRotation(Math.PI / 4);
 *
 * // Generate a small preview
 * const preview = hdri.generatePreview(texture);
 *
 * // Cleanup
 * hdri.dispose();
 * ```
 */
export class HDRISystem {
  /** Configuration */
  readonly config: HDRIConfig;

  /** Currently loaded HDRI texture */
  private currentTexture: THREE.Texture | null = null;

  /** Original equirectangular texture (before PMREM processing) */
  private originalTexture: THREE.Texture | null = null;

  /** Current Z-axis rotation in radians */
  private rotation: number = 0;

  /** Cached RGBELoader instance */
  private rgeLoader: RGBELoaderType | null = null;

  /** Cached EXRLoader instance */
  private exrLoader: EXRLoaderType | null = null;

  /** List of known HDRI files in the last scanned directory */
  private knownFiles: string[] = [];

  /** Renderer reference for PMREMGenerator */
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(config: Partial<HDRIConfig> = {}, renderer?: THREE.WebGLRenderer) {
    this.config = { ...DEFAULT_HDRI_CONFIG, ...config };
    this.renderer = renderer ?? null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Load an HDRI file (.hdr or .exr) and return the texture.
   *
   * Automatically detects the file format from the extension and
   * uses the appropriate loader. The texture is configured as an
   * equirectangular reflection map.
   *
   * @param path - URL or file path to the HDRI file
   * @returns The loaded texture (equirectangular mapping)
   * @throws Error if the file format is unsupported or loading fails
   */
  async loadHDRI(path: string): Promise<THREE.Texture> {
    const extension = path.split('.').pop()?.toLowerCase();

    let texture: THREE.Texture;

    if (extension === 'hdr') {
      texture = await this.loadHDR(path);
    } else if (extension === 'exr') {
      texture = await this.loadEXR(path);
    } else {
      throw new Error(
        `[HDRISystem] Unsupported HDRI format '.${extension}'. Supported: .hdr, .exr`,
      );
    }

    // Configure as equirectangular
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;

    // Store reference
    this.disposeCurrentTexture();
    this.originalTexture = texture;
    this.currentTexture = texture;

    return texture;
  }

  /**
   * Load a random HDRI from a directory.
   *
   * Picks a random .hdr or .exr file from the specified directory.
   * The directory listing is cached after the first call for
   * efficiency; use `forceRefresh = true` to rescan.
   *
   * @param directory - URL or path to the directory containing HDRI files
   * @param forceRefresh - Whether to rescan the directory (default false)
   * @returns The loaded texture (equirectangular mapping)
   * @throws Error if no HDRI files are found in the directory
   */
  async loadRandomHDRI(directory: string, forceRefresh: boolean = false): Promise<THREE.Texture> {
    // Scan directory for HDRI files
    if (forceRefresh || this.knownFiles.length === 0) {
      this.knownFiles = await this.scanDirectoryForHDRI(directory);
    }

    if (this.knownFiles.length === 0) {
      throw new Error(`[HDRISystem] No HDRI files found in '${directory}'`);
    }

    // Pick a random file
    const randomIndex = Math.floor(Math.random() * this.knownFiles.length);
    const selectedFile = this.knownFiles[randomIndex];

    // Construct full path
    const fullPath = directory.endsWith('/')
      ? `${directory}${selectedFile}`
      : `${directory}/${selectedFile}`;

    return this.loadHDRI(fullPath);
  }

  /**
   * Set the Z-axis rotation of the environment map.
   *
   * Rotates the HDRI environment around the vertical axis by
   * the specified angle. This is useful for aligning the sun
   * position in the HDRI with the scene's directional light.
   *
   * @param rotation - Rotation angle in radians (0 = no rotation)
   */
  setRotation(rotation: number): void {
    this.rotation = rotation;

    if (this.originalTexture) {
      this.originalTexture.rotation = rotation;
      this.originalTexture.updateMatrix();
    }
  }

  /**
   * Get the current Z-axis rotation in radians.
   */
  getRotation(): number {
    return this.rotation;
  }

  /**
   * Apply an HDRI texture to a Three.js scene.
   *
   * Sets both the scene's environment map (for PBR reflections)
   * and background. If a renderer is available and `usePMREM` is
   * enabled, the texture is processed through PMREMGenerator for
   * optimal PBR quality.
   *
   * @param scene - The Three.js scene to apply the HDRI to
   * @param texture - The HDRI texture (should be equirectangular mapping)
   */
  applyToScene(scene: THREE.Scene, texture: THREE.Texture): void {
    // Apply rotation to texture
    texture.rotation = this.rotation;

    if (this.config.usePMREM && this.renderer) {
      // Process through PMREMGenerator for PBR environment map
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      pmremGenerator.compileEquirectangularShader();

      let envMap: THREE.Texture;

      if (texture.mapping === THREE.EquirectangularReflectionMapping) {
        envMap = pmremGenerator.fromEquirectangular(texture).texture;
      } else {
        envMap = pmremGenerator.fromScene(new THREE.Scene()).texture;
      }

      scene.environment = envMap;
      scene.background = envMap;
      scene.backgroundBlurriness = this.config.backgroundBlurriness;
      scene.backgroundIntensity = this.config.backgroundIntensity;
      scene.environmentIntensity = this.config.environmentIntensity;

      // Dispose PMREM generator but keep the processed texture
      pmremGenerator.dispose();

      // Update current texture reference to the PMREM-processed one
      if (this.currentTexture !== envMap) {
        this.currentTexture = envMap;
      }
    } else {
      // Apply texture directly without PMREM processing
      scene.environment = texture;
      scene.background = texture;
      scene.backgroundBlurriness = this.config.backgroundBlurriness;
      scene.backgroundIntensity = this.config.backgroundIntensity;
      scene.environmentIntensity = this.config.environmentIntensity;
    }
  }

  /**
   * Generate a small preview DataTexture from an HDRI texture.
   *
   * Creates a low-resolution equirectangular preview suitable for
   * UI display (thumbnails, sky selection panels, etc.).
   *
   * @param texture - The HDRI texture to generate a preview from
   * @param resolution - Preview resolution (default from config)
   * @returns A DataTexture containing the preview, or null if the
   *          texture cannot be read
   */
  generatePreview(
    texture: THREE.Texture,
    resolution?: number,
  ): THREE.DataTexture | null {
    const size = resolution ?? this.config.previewResolution;

    // If we have a renderer, we can render the texture to a small RT
    // and read back the pixels. Otherwise, generate a simple gradient.
    if (this.renderer && texture.image) {
      try {
        return this.renderPreview(texture, size);
      } catch {
        // Fall back to gradient preview
      }
    }

    // Fallback: generate a simple sky gradient preview
    return this.generateGradientPreview(size);
  }

  /**
   * Set the WebGL renderer (needed for PMREM processing and preview).
   *
   * @param renderer - The WebGL renderer
   */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  /**
   * Get the currently loaded texture.
   */
  getCurrentTexture(): THREE.Texture | null {
    return this.currentTexture;
  }

  /**
   * Get the list of known HDRI files from the last directory scan.
   */
  getKnownFiles(): readonly string[] {
    return this.knownFiles;
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<HDRIConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.disposeCurrentTexture();
    this.rgeLoader = null;
    this.exrLoader = null;
    this.knownFiles = [];
    this.rotation = 0;
  }

  // ── Private Implementation ──────────────────────────────────────────────

  /**
   * Load a .hdr (Radiance HDR) file using RGBELoader.
   */
  private async loadHDR(path: string): Promise<THREE.Texture> {
    if (!this.rgeLoader) {
      const { RGBELoader } = await import(
        /* webpackChunkName: "rgbe-loader" */
        'three/examples/jsm/loaders/RGBELoader.js'
      );
      this.rgeLoader = new (RGBELoader as unknown as new () => RGBELoaderType)();
      this.rgeLoader.setDataType(THREE.HalfFloatType);
    }

    return new Promise<THREE.Texture>((resolve, reject) => {
      this.rgeLoader!.load(
        path,
        (texture) => resolve(texture),
        undefined,
        (error) => reject(
          new Error(`[HDRISystem] Failed to load HDR file '${path}': ${error}`),
        ),
      );
    });
  }

  /**
   * Load an .exr (OpenEXR) file using EXRLoader.
   */
  private async loadEXR(path: string): Promise<THREE.Texture> {
    if (!this.exrLoader) {
      const { EXRLoader } = await import(
        /* webpackChunkName: "exr-loader" */
        'three/examples/jsm/loaders/EXRLoader.js'
      );
      this.exrLoader = new (EXRLoader as unknown as new () => EXRLoaderType)();
      this.exrLoader.setDataType(THREE.HalfFloatType);
    }

    return new Promise<THREE.Texture>((resolve, reject) => {
      this.exrLoader!.load(
        path,
        (texture) => resolve(texture),
        undefined,
        (error) => reject(
          new Error(`[HDRISystem] Failed to load EXR file '${path}': ${error}`),
        ),
      );
    });
  }

  /**
   * Scan a directory for HDRI files.
   *
   * In a browser environment, this attempts to fetch a directory listing.
   * Falls back to common HDRI filenames if directory listing is unavailable.
   */
  private async scanDirectoryForHDRI(directory: string): Promise<string[]> {
    const extensions = ['.hdr', '.exr'];
    const files: string[] = [];

    try {
      // Try to fetch a directory index (common on static file servers)
      const response = await fetch(directory);
      if (response.ok) {
        const text = await response.text();

        // Parse HTML directory listing for HDRI files
        const linkPattern = /href="([^"]+)"/g;
        let match: RegExpExecArray | null;
        while ((match = linkPattern.exec(text)) !== null) {
          const filename = match[1];
          const ext = filename.split('.').pop()?.toLowerCase();
          if (ext && extensions.includes(`.${ext}`)) {
            files.push(filename);
          }
        }
      }
    } catch {
      // Directory listing unavailable; fall back to common names
    }

    // If no files found, try common HDRI filenames
    if (files.length === 0) {
      const commonNames = [
        'sky', 'environment', 'studio', 'outdoor', 'indoor',
        'sunset', 'night', 'noon', 'morning', 'overcast',
      ];
      for (const name of commonNames) {
        for (const ext of extensions) {
          files.push(`${name}${ext}`);
        }
      }
    }

    return files;
  }

  /**
   * Render a preview of an HDRI texture using the WebGL renderer.
   */
  private renderPreview(texture: THREE.Texture, size: number): THREE.DataTexture | null {
    if (!this.renderer) return null;

    // Create a small render target
    const rt = new THREE.WebGLRenderTarget(size, Math.floor(size / 2), {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Create a fullscreen quad with the HDRI texture
    const previewScene = new THREE.Scene();
    const previewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: texture },
        uRotation: { value: this.rotation },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap;
        uniform float uRotation;
        varying vec2 vUv;

        void main() {
          // Apply rotation around center
          vec2 centered = vUv - 0.5;
          float cosR = cos(uRotation);
          float sinR = sin(uRotation);
          vec2 rotated = vec2(
            centered.x * cosR - centered.y * sinR,
            centered.x * sinR + centered.y * cosR
          ) + 0.5;

          // Clamp to valid range
          vec2 uv = clamp(rotated, 0.0, 1.0);

          vec4 color = texture2D(tMap, uv);

          // Simple tone mapping for preview
          color.rgb = color.rgb / (color.rgb + vec3(1.0));
          color.rgb = pow(color.rgb, vec3(1.0 / 2.2));

          gl_FragColor = color;
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    previewScene.add(quad);

    // Render
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(previewScene, previewCamera);
    this.renderer.setRenderTarget(null);

    // Read back pixels
    const width = size;
    const height = Math.floor(size / 2);
    const buffer = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, buffer);

    // Create DataTexture from readback
    const dataTexture = new THREE.DataTexture(buffer, width, height, THREE.RGBAFormat);
    dataTexture.needsUpdate = true;
    dataTexture.flipY = true;

    // Cleanup
    rt.dispose();
    material.dispose();
    quad.geometry.dispose();

    return dataTexture;
  }

  /**
   * Generate a simple sky gradient preview as fallback.
   */
  private generateGradientPreview(size: number): THREE.DataTexture {
    const width = size;
    const height = Math.floor(size / 2);
    const data = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      const v = y / height;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Sky gradient: deep blue at top → pale blue → warm horizon
        const r = Math.floor(40 + 180 * v * v);
        const g = Math.floor(60 + 140 * v);
        const b = Math.floor(140 + 80 * (1 - v));

        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, g);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.flipY = true;
    return texture;
  }

  /**
   * Dispose the current texture and original texture.
   */
  private disposeCurrentTexture(): void {
    if (this.currentTexture && this.currentTexture !== this.originalTexture) {
      this.currentTexture.dispose();
    }
    if (this.originalTexture) {
      this.originalTexture.dispose();
    }
    this.currentTexture = null;
    this.originalTexture = null;
  }
}

/**
 * Convenience factory function to create an HDRISystem instance.
 */
export function createHDRISystem(
  config: Partial<HDRIConfig> = {},
  renderer?: THREE.WebGLRenderer,
): HDRISystem {
  return new HDRISystem(config, renderer);
}

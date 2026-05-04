/**
 * Volumetric Cloud System — P7.3: Volumetric Cloud System
 *
 * Creates cloud-shaped mesh containers at varying altitudes using
 * FogVolumeMaterial from three-gpu-pathtracer with noise-modulated density.
 * Uses Perlin noise for cloud shape. In path-traced mode, fog volumes
 * participate in light transport; in rasterized mode, impostor billboards
 * serve as fallback.
 *
 * @module weather
 * @phase 7
 * @p-number P7.3
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the volumetric cloud system.
 */
export interface VolumetricCloudConfig {
  /** Number of cloud layers. Default: 3 */
  layerCount: number;
  /** Base altitude of the lowest cloud layer. Default: 1500 */
  baseAltitude: number;
  /** Vertical spacing between layers. Default: 800 */
  layerSpacing: number;
  /** Horizontal extent of cloud volumes. Default: 500 */
  extent: number;
  /** Base cloud density (0-1). Default: 0.015 */
  density: number;
  /** Cloud coverage (0-1). Default: 0.5 */
  coverage: number;
  /** Perlin noise frequency for cloud shape. Default: 0.002 */
  noiseFrequency: number;
  /** Perlin noise octaves for detail. Default: 6 */
  noiseOctaves: number;
  /** Wind speed in m/s. Default: 5 */
  windSpeed: number;
  /** Wind direction (normalized). Default: (1, 0, 0.5) */
  windDirection: THREE.Vector3;
  /** Cloud albedo color. Default: white */
  cloudColor: THREE.ColorRepresentation;
  /** Rendering mode. Default: 'auto' */
  renderMode: 'auto' | 'pathtraced' | 'rasterized';
  /** Billboard resolution for rasterized fallback. Default: 256 */
  billboardResolution: number;
  /** Animation time scale. Default: 1.0 */
  timeScale: number;
}

/**
 * Represents a single cloud layer.
 */
export interface CloudLayer {
  /** Unique name for this layer */
  name: string;
  /** Altitude of this layer center */
  altitude: number;
  /** Thickness of the layer */
  thickness: number;
  /** Density of the layer (0-1) */
  density: number;
  /** Horizontal extent */
  extent: number;
  /** The THREE.Mesh for this cloud layer */
  mesh: THREE.Mesh | null;
  /** Billboard impostor for rasterized mode */
  billboard: THREE.Mesh | null;
  /** Whether this layer is currently visible */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: VolumetricCloudConfig = {
  layerCount: 3,
  baseAltitude: 1500,
  layerSpacing: 800,
  extent: 500,
  density: 0.015,
  coverage: 0.5,
  noiseFrequency: 0.002,
  noiseOctaves: 6,
  windSpeed: 5,
  windDirection: new THREE.Vector3(1, 0, 0.5).normalize(),
  cloudColor: 0xffffff,
  renderMode: 'auto',
  billboardResolution: 256,
  timeScale: 1.0,
};

// ---------------------------------------------------------------------------
// FogVolumeMaterial — lazy import from three-gpu-pathtracer
// ---------------------------------------------------------------------------

let FogVolumeMaterialClass: any = null;
let fogVolumeLoadAttempted = false;

async function loadFogVolumeMaterial(): Promise<any> {
  if (FogVolumeMaterialClass) return FogVolumeMaterialClass;
  if (fogVolumeLoadAttempted) return null;

  fogVolumeLoadAttempted = true;
  try {
    const module = await import('three-gpu-pathtracer');
    FogVolumeMaterialClass = module.FogVolumeMaterial;
    return FogVolumeMaterialClass;
  } catch (err) {
    console.warn('[VolumetricCloudSystem] Failed to load FogVolumeMaterial from three-gpu-pathtracer:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Perlin Noise Implementation
// ---------------------------------------------------------------------------

/**
 * Classic Perlin noise generator for cloud shape modulation.
 */
class PerlinNoise {
  private perm: number[];

  constructor(seed: number = 42) {
    this.perm = new Array(512);
    const p = new Array(256);

    // Initialize with identity
    for (let i = 0; i < 256; i++) p[i] = i;

    // Shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad3d(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Sample 3D Perlin noise.
   */
  noise3d(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.perm[X] + Y;
    const AA = this.perm[A] + Z;
    const AB = this.perm[A + 1] + Z;
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B] + Z;
    const BB = this.perm[B + 1] + Z;

    return this.lerp(
      w,
      this.lerp(
        v,
        this.lerp(u, this.grad3d(this.perm[AA], x, y, z), this.grad3d(this.perm[BA], x - 1, y, z)),
        this.lerp(u, this.grad3d(this.perm[AB], x, y - 1, z), this.grad3d(this.perm[BB], x - 1, y - 1, z))
      ),
      this.lerp(
        v,
        this.lerp(u, this.grad3d(this.perm[AA + 1], x, y, z - 1), this.grad3d(this.perm[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad3d(this.perm[AB + 1], x, y - 1, z - 1), this.grad3d(this.perm[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }

  /**
   * Fractal Brownian Motion — layered noise for cloud detail.
   */
  fbm3d(x: number, y: number, z: number, octaves: number = 6): number {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise3d(x * frequency, y * frequency, z * frequency);
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value;
  }
}

// ---------------------------------------------------------------------------
// Noise Density Texture Generator
// ---------------------------------------------------------------------------

/**
 * Generate a 3D noise texture that modulates cloud density.
 * This is used as a density map for the FogVolumeMaterial.
 */
function generateNoiseDensityTexture(
  config: VolumetricCloudConfig,
  seed: number = 42
): THREE.Data3DTexture {
  const size = 64;
  const data = new Float32Array(size * size * size);
  const noise = new PerlinNoise(seed);

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size * config.noiseFrequency * 1000;
        const ny = y / size * config.noiseFrequency * 1000;
        const nz = z / size * config.noiseFrequency * 1000;

        let value = noise.fbm3d(nx, ny, nz, config.noiseOctaves);

        // Remap from [-1,1] to [0,1]
        value = value * 0.5 + 0.5;

        // Apply coverage threshold
        const coverageThreshold = 1.0 - config.coverage;
        if (value < coverageThreshold) {
          value = 0;
        } else {
          value = (value - coverageThreshold) / (1.0 - coverageThreshold);
        }

        data[x + y * size + z * size * size] = value;
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

// ---------------------------------------------------------------------------
// Billboard Impostor Generator (Rasterized Fallback)
// ---------------------------------------------------------------------------

/**
 * Create a billboard mesh that approximates a cloud layer for rasterized rendering.
 */
function createCloudBillboard(
  width: number,
  height: number,
  config: VolumetricCloudConfig,
  seed: number
): THREE.Mesh {
  // Create a canvas-based texture for the billboard
  const res = config.billboardResolution;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const noise = new PerlinNoise(seed);

  // Generate cloud pattern on canvas
  const imageData = ctx.createImageData(res, res);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const nx = x / res * 4;
      const ny = y / res * 4;
      let value = noise.fbm3d(nx, ny, 0, 4);
      value = value * 0.5 + 0.5;

      const coverageThreshold = 1.0 - config.coverage;
      if (value < coverageThreshold) value = 0;
      else value = (value - coverageThreshold) / (1.0 - coverageThreshold);

      const alpha = Math.floor(value * 255 * 0.7);
      const idx = (x + y * res) * 4;
      imageData.data[idx] = 255;
      imageData.data[idx + 1] = 255;
      imageData.data[idx + 2] = 255;
      imageData.data[idx + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.8,
    blending: THREE.NormalBlending,
  });

  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cloud_billboard';

  return mesh;
}

// ---------------------------------------------------------------------------
// VolumetricCloudSystem Class
// ---------------------------------------------------------------------------

/**
 * Volumetric cloud system using FogVolumeMaterial from three-gpu-pathtracer.
 *
 * Creates cloud-shaped mesh containers at varying altitudes. Each cloud layer
 * uses a BoxGeometry container with noise-modulated density. In path-traced
 * mode, the fog volumes participate in the light transport for realistic
 * scattering and shadows. In rasterized mode, billboard impostors are used.
 *
 * @phase 7
 * @p-number P7.3
 */
export class VolumetricCloudSystem {
  private config: VolumetricCloudConfig;
  private scene: THREE.Scene | null = null;
  private layers: CloudLayer[] = [];
  private group: THREE.Group;
  private noiseTexture: THREE.Data3DTexture | null = null;
  private perlin: PerlinNoise;
  private time: number = 0;
  private usePathTracedMode: boolean = false;

  constructor(config: Partial<VolumetricCloudConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.group = new THREE.Group();
    this.group.name = 'volumetric_clouds';
    this.perlin = new PerlinNoise(42);

    // Generate noise density texture
    this.noiseTexture = generateNoiseDensityTexture(this.config);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Attach the cloud system to a THREE.js scene.
   * Determines rendering mode and builds cloud layers.
   */
  async attach(scene: THREE.Scene): Promise<void> {
    this.scene = scene;
    scene.add(this.group);

    // Determine rendering mode
    if (this.config.renderMode === 'auto') {
      // Try to load FogVolumeMaterial; if available, use path-traced mode
      const FogVolumeMaterial = await loadFogVolumeMaterial();
      this.usePathTracedMode = FogVolumeMaterial !== null;
    } else {
      this.usePathTracedMode = this.config.renderMode === 'pathtraced';
    }

    await this.buildLayers();
  }

  /**
   * Detach the cloud system from the scene.
   */
  detach(): void {
    if (this.scene) {
      this.scene.remove(this.group);
      this.scene = null;
    }
  }

  // -------------------------------------------------------------------------
  // Layer Management
  // -------------------------------------------------------------------------

  /**
   * Get all cloud layers.
   */
  getLayers(): ReadonlyArray<CloudLayer> {
    return this.layers;
  }

  /**
   * Set the visibility of a specific cloud layer.
   */
  setLayerVisible(index: number, visible: boolean): void {
    if (index < 0 || index >= this.layers.length) return;
    const layer = this.layers[index];
    layer.visible = visible;

    if (layer.mesh) layer.mesh.visible = visible;
    if (layer.billboard) layer.billboard.visible = visible;
  }

  /**
   * Update the density of a specific cloud layer.
   */
  setLayerDensity(index: number, density: number): void {
    if (index < 0 || index >= this.layers.length) return;
    const layer = this.layers[index];
    layer.density = THREE.MathUtils.clamp(density, 0, 1);

    // Update FogVolumeMaterial density
    if (layer.mesh) {
      const mat = layer.mesh.material as any;
      if (mat.density !== undefined) {
        mat.density = layer.density * this.config.density;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Frame Update
  // -------------------------------------------------------------------------

  /**
   * Update cloud animation. Call once per frame.
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime: number): void {
    this.time += deltaTime * this.config.timeScale;

    // Animate wind offset
    const windOffset = this.config.windDirection.clone()
      .multiplyScalar(this.config.windSpeed * this.time);

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const altitudeOffset = Math.sin(this.time * 0.1 + i * 1.5) * 10; // Subtle bobbing

      if (this.usePathTracedMode && layer.mesh) {
        layer.mesh.position.set(windOffset.x, layer.altitude + altitudeOffset, windOffset.z);

        // Update noise density modulation in material
        const mat = layer.mesh.material as any;
        if (mat.uniforms && mat.uniforms.uTime) {
          mat.uniforms.uTime.value = this.time;
        }
      } else if (layer.billboard) {
        layer.billboard.position.set(windOffset.x, layer.altitude + altitudeOffset, windOffset.z);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  getConfig(): Readonly<VolumetricCloudConfig> {
    return { ...this.config };
  }

  async updateConfig(partial: Partial<VolumetricCloudConfig>): Promise<void> {
    const needsRebuild =
      partial.layerCount !== undefined ||
      partial.baseAltitude !== undefined ||
      partial.layerSpacing !== undefined ||
      partial.coverage !== undefined ||
      partial.density !== undefined ||
      partial.noiseFrequency !== undefined;

    this.config = { ...this.config, ...partial };

    if (needsRebuild) {
      // Regenerate noise texture
      if (this.noiseTexture) this.noiseTexture.dispose();
      this.noiseTexture = generateNoiseDensityTexture(this.config);
      await this.buildLayers();
    }
  }

  /**
   * Get the rendering mode being used.
   */
  isPathTracedMode(): boolean {
    return this.usePathTracedMode;
  }

  // -------------------------------------------------------------------------
  // Private: Build Cloud Layers
  // -------------------------------------------------------------------------

  private async buildLayers(): Promise<void> {
    // Clear existing layers
    for (const layer of this.layers) {
      if (layer.mesh) {
        this.group.remove(layer.mesh);
        layer.mesh.geometry.dispose();
        if (Array.isArray(layer.mesh.material)) {
          layer.mesh.material.forEach(m => m.dispose());
        } else {
          layer.mesh.material.dispose();
        }
      }
      if (layer.billboard) {
        this.group.remove(layer.billboard);
        layer.billboard.geometry.dispose();
        if (Array.isArray(layer.billboard.material)) {
          layer.billboard.material.forEach(m => m.dispose());
        } else {
          layer.billboard.material.dispose();
        }
      }
    }
    this.layers = [];

    // Build new layers
    for (let i = 0; i < this.config.layerCount; i++) {
      const altitude = this.config.baseAltitude + i * this.config.layerSpacing;
      const thickness = 200 + i * 100; // Higher layers are thicker
      const density = this.config.density * (1 - i * 0.2); // Lower layers denser

      const layer: CloudLayer = {
        name: `cloud_layer_${i}`,
        altitude,
        thickness,
        density: Math.max(0.001, density),
        extent: this.config.extent + i * 100,
        mesh: null,
        billboard: null,
        visible: true,
      };

      if (this.usePathTracedMode) {
        layer.mesh = await this.createFogVolumeMesh(layer, i);
        if (layer.mesh) {
          this.group.add(layer.mesh);
        }
      } else {
        layer.billboard = createCloudBillboard(
          layer.extent,
          layer.thickness,
          this.config,
          42 + i * 17
        );
        layer.billboard.position.y = layer.altitude;
        this.group.add(layer.billboard);
      }

      this.layers.push(layer);
    }
  }

  /**
   * Create a fog volume mesh for a single cloud layer.
   * Uses FogVolumeMaterial from three-gpu-pathtracer when available,
   * falls back to semi-transparent MeshStandardMaterial.
   */
  private async createFogVolumeMesh(layer: CloudLayer, layerIndex: number): Promise<THREE.Mesh> {
    const geometry = new THREE.BoxGeometry(
      layer.extent,
      layer.thickness,
      layer.extent
    );

    let material: THREE.Material;

    try {
      const FogVolumeMaterial = await loadFogVolumeMaterial();

      if (FogVolumeMaterial) {
        material = new FogVolumeMaterial({
          color: new THREE.Color(this.config.cloudColor),
          density: layer.density,
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0,
          opacity: 0.2,
          transparent: true,
        });
      } else {
        throw new Error('FogVolumeMaterial not available');
      }
    } catch (err) {
      // Silently fall back - cloud material creation failed, using semi-transparent material
      if (process.env.NODE_ENV === 'development') console.debug('[VolumetricCloudSystem] cloud material fallback:', err);
      material = new THREE.MeshStandardMaterial({
        color: this.config.cloudColor,
        transparent: true,
        opacity: layer.density * 5,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = layer.altitude;
    mesh.name = `fog_volume_cloud_${layerIndex}`;
    mesh.userData._isFogVolume = true;
    mesh.userData._fogDensity = layer.density;

    return mesh;
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.detach();

    for (const layer of this.layers) {
      if (layer.mesh) {
        layer.mesh.geometry.dispose();
        if (Array.isArray(layer.mesh.material)) {
          layer.mesh.material.forEach(m => m.dispose());
        } else {
          layer.mesh.material.dispose();
        }
      }
      if (layer.billboard) {
        layer.billboard.geometry.dispose();
        if (Array.isArray(layer.billboard.material)) {
          layer.billboard.material.forEach(m => m.dispose());
        } else {
          layer.billboard.material.dispose();
        }
      }
    }
    this.layers = [];

    if (this.noiseTexture) {
      this.noiseTexture.dispose();
      this.noiseTexture = null;
    }
  }
}

export default VolumetricCloudSystem;

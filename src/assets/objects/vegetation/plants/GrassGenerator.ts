/**
 * @deprecated Use `GrassSystem` from `@/assets/objects/vegetation/GrassSystem` instead.
 *
 * This file is superseded by the consolidated GrassSystem which provides a
 * unified API for grass generation, scattering, and wind animation.
 * GrassGenerator remains for backward compatibility but will not receive
 * further updates.
 *
 * Migration guide:
 *   - `GrassGenerator.generateGrassField()`  → `GrassSystem.createGrassField()`
 *   - `GrassGenerator.generateGrassClumps()` → `GrassSystem.createGrassClumps()`
 *   - `GrassGenerator.generateTallGrass()`   → `GrassSystem.createTallGrass()`
 *   - `GrassGenerator.updateWind()`           → `GrassSystem.updateWind()`
 */

/**
 * GrassGenerator - Procedural grass field generation with blade clusters
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 * Wind parameters produce actual vertex shader displacement for animated grass sway.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface GrassConfig {
  bladeHeight: number;
  bladeWidth: number;
  density: number;
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  windAmplitude: number;
  windFrequency: number;
  count: number;
  spreadArea: { width: number; depth: number };
  variety: 'fine' | 'coarse' | 'mixed';
}

// Custom shader material for wind-animated grass
const grassVertexShader = `
  uniform float uTime;
  uniform float uWindAmplitude;
  uniform float uWindFrequency;
  uniform float uBladeHeight;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;

    vec3 pos = position;

    // Height factor: 0 at base, 1 at tip (grass blade grows along Y)
    float heightFactor = (pos.y + uBladeHeight * 0.5) / uBladeHeight;
    heightFactor = clamp(heightFactor, 0.0, 1.0);

    // Wind displacement: sine wave that increases with height
    float windPhase = pos.x * 0.5 + pos.z * 0.3 + uTime * uWindFrequency;
    float sway = sin(windPhase) * uWindAmplitude * heightFactor * heightFactor;

    // Secondary gentle cross-wind for more natural motion
    float crossPhase = pos.z * 0.7 - uTime * uWindFrequency * 0.6;
    float crossSway = sin(crossPhase) * uWindAmplitude * 0.3 * heightFactor * heightFactor;

    pos.x += sway;
    pos.z += crossSway;

    // Slight leaning from wind
    pos.x += uWindAmplitude * 0.2 * heightFactor * heightFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const grassFragmentShader = `
  uniform vec3 uColor;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    // Simple lighting based on normal
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;

    // Darken toward base
    float heightFade = smoothstep(0.0, 0.3, vUv.y);
    vec3 color = uColor * diffuse * (0.7 + 0.3 * heightFade);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class GrassGenerator {
  private materialCache: Map<string, THREE.ShaderMaterial>;
  private windTime: number;
  private animating: boolean;

  constructor() {
    this.materialCache = new Map();
    this.windTime = 0;
    this.animating = false;
  }

  /**
   * Start wind animation. Call this in a render loop to animate grass.
   * @param deltaTime - time since last frame in seconds
   */
  updateWind(deltaTime: number): void {
    if (this.animating) {
      this.windTime += deltaTime;
      this.materialCache.forEach((mat) => {
        if (mat.uniforms.uTime) {
          mat.uniforms.uTime.value = this.windTime;
        }
      });
    }
  }

  /**
   * Enable/disable wind animation
   */
  setWindEnabled(enabled: boolean): void {
    this.animating = enabled;
  }

  generateGrassField(config: Partial<GrassConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    const finalConfig: GrassConfig = {
      bladeHeight: 0.3 + rng.uniform(0, 0.2),
      bladeWidth: 0.02 + rng.uniform(0, 0.01),
      density: 0.7,
      colorBase: new THREE.Color(0x4a7c23),
      colorVariation: new THREE.Color(0x3d6b1f),
      windAmplitude: 0.05,
      windFrequency: 0.5,
      count: 1000,
      spreadArea: { width: 10, depth: 10 },
      variety: 'mixed',
      ...config,
    };

    const baseGeometry = this.createGrassBladeGeometry(finalConfig);
    const material = this.getGrassMaterial(finalConfig);

    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      const x = (rng.next() - 0.5) * finalConfig.spreadArea.width;
      const z = (rng.next() - 0.5) * finalConfig.spreadArea.depth;

      if (rng.next() > finalConfig.density) continue;

      const heightVariation = 0.7 + rng.uniform(0, 0.6);
      const scale = finalConfig.bladeWidth * heightVariation;

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, heightVariation, scale);
      dummy.rotation.y = rng.uniform(0, Math.PI * 2);
      dummy.rotation.x = (rng.next() - 0.5) * 0.2;
      dummy.rotation.z = (rng.next() - 0.5) * 0.2;
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);

      // Color variation
      if (rng.next() > 0.5) {
        const color = finalConfig.colorBase.clone();
        const variation = (rng.next() - 0.5) * 0.2;
        color.offsetHSL(0, 0, variation);
        instancedMesh.setColorAt(instanceIndex - 1, color);
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    return instancedMesh;
  }

  private createGrassBladeGeometry(config: GrassConfig): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(config.bladeWidth, config.bladeHeight, 1, 4);
    const positions = geometry.attributes.position.array as Float32Array;

    // Store original height for shader reference and add UV-based height
    const uvAttribute = geometry.attributes.uv;
    const heightFactors = new Float32Array(uvAttribute.count);

    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + config.bladeHeight / 2) / config.bladeHeight;
      const taper = 0.3 + 0.7 * (1 - t);
      positions[i] *= taper;
      if (y > 0) positions[i + 2] = Math.sin(t * Math.PI) * config.bladeWidth * 0.3;
    }

    // Store per-vertex height factor for the shader
    for (let i = 0; i < uvAttribute.count; i++) {
      const y = positions[i * 3 + 1];
      const t = (y + config.bladeHeight / 2) / config.bladeHeight;
      heightFactors[i] = t;
    }

    geometry.setAttribute('aHeightFactor', new THREE.BufferAttribute(heightFactors, 1));
    geometry.computeVertexNormals();
    return geometry;
  }

  private getGrassMaterial(config: GrassConfig): THREE.ShaderMaterial {
    const cacheKey = `grass-shader-${config.colorBase.getHex()}-${config.windAmplitude}-${config.windFrequency}`;
    if (this.materialCache.has(cacheKey)) return this.materialCache.get(cacheKey)!;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: this.windTime },
        uWindAmplitude: { value: config.windAmplitude },
        uWindFrequency: { value: config.windFrequency },
        uBladeHeight: { value: config.bladeHeight },
        uColor: { value: config.colorBase.clone() },
      },
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      side: THREE.DoubleSide,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  generateGrassClumps(config: Partial<GrassConfig> & { clumpCount: number; clumpSize: number }, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const group = new THREE.Group();
    const clumpConfig = {
      bladeHeight: 0.35, bladeWidth: 0.025, density: 0.9,
      colorBase: new THREE.Color(0x508025), colorVariation: new THREE.Color(0x407020),
      windAmplitude: 0.06, windFrequency: 0.6, count: 50,
      spreadArea: { width: 1, depth: 1 }, variety: 'mixed' as const,
      clumpCount: 20, clumpSize: 0.5, ...config,
    };

    for (let i = 0; i < clumpConfig.clumpCount; i++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const radius = rng.uniform(0, clumpConfig.clumpSize);
      const clump = this.generateGrassField({
        count: clumpConfig.count,
        spreadArea: { width: clumpConfig.clumpSize, depth: clumpConfig.clumpSize },
        bladeHeight: clumpConfig.bladeHeight * rng.uniform(0.8, 1.2),
        density: clumpConfig.density,
        colorBase: clumpConfig.colorBase.clone(),
        windAmplitude: clumpConfig.windAmplitude,
        windFrequency: clumpConfig.windFrequency,
      }, seed + i);
      clump.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      group.add(clump);
    }
    return group;
  }

  generateTallGrass(config: Partial<GrassConfig> = {}, seed: number = 12345): THREE.InstancedMesh {
    const rng = new SeededRandom(seed);
    return this.generateGrassField({
      bladeHeight: 0.6 + rng.uniform(0, 0.4),
      bladeWidth: 0.03 + rng.uniform(0, 0.015),
      density: 0.5,
      colorBase: new THREE.Color(0x6b8e3a),
      variety: 'coarse',
      ...config,
    }, seed);
  }

  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}

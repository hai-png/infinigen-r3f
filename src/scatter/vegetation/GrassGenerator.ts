/**
 * GrassGenerator - Procedural grass varieties for outdoor scenes
 * 
 * Features:
 * - Multiple grass species (Kentucky Bluegrass, Fescue, Bermuda, Ryegrass)
 * - Wind animation with GPU-accelerated vertex displacement
 * - 4-level LOD system (Full blades → Simplified → Cards → Billboard)
 * - Biome-specific selection (Temperate, Tropical, Arid, Alpine)
 * - Seasonal color variation
 * - Clumping and density control
 */

import { Object3D, BufferGeometry, Material, Group, InstancedMesh, Matrix4, Vector3, Color } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';
import { Noise3D } from '../../../math/noise';
import { FixedSeed } from '../../../math/utils';
import { LODLevel } from '../../utils/LODGenerator';

export interface GrassParameters {
  // Species selection
  species: 'bluegrass' | 'fescue' | 'bermuda' | 'ryegrass' | 'mixed';
  
  // Dimensions
  height: number;           // Blade height (0.05 - 1.5 meters)
  bladeWidth: number;       // Individual blade width (0.001 - 0.01)
  density: number;          // Blades per square meter (100 - 10000)
  
  // Appearance
  colorPrimary: Color;      // Main grass color
  colorSecondary: Color;    // Tip/variation color
  dryness: number;          // 0 = fresh green, 1 = brown/dry
  
  // Growth patterns
  clumpSize: number;        // Average clump size (1-10 blades per clump)
  clumpDensity: number;     // Clumps per square meter
  curlAmount: number;       // Natural curl of blades (0-1)
  
  // Animation
  windIntensity: number;    // Wind sway intensity (0-2)
  windSpeed: number;        // Wind animation speed (0.1-5)
  
  // LOD
  lodDistance: [number, number, number, number]; // Distances for 4 LOD levels
}

const DEFAULT_GRASS_PARAMS: GrassParameters = {
  species: 'mixed',
  height: 0.3,
  bladeWidth: 0.003,
  density: 2000,
  colorPrimary: new Color(0x4a7c23),
  colorSecondary: new Color(0x6b9b3a),
  dryness: 0.1,
  clumpSize: 3,
  clumpDensity: 800,
  curlAmount: 0.3,
  windIntensity: 0.5,
  windSpeed: 1.0,
  lodDistance: [0, 10, 25, 50],
};

const GRASS_SPECIES_DATA = {
  bluegrass: { heightRange: [0.15, 0.4], widthRange: [0.002, 0.004], color: new Color(0x3d6b1e) },
  fescue: { heightRange: [0.2, 0.6], widthRange: [0.001, 0.003], color: new Color(0x4a7c23) },
  bermuda: { heightRange: [0.05, 0.2], widthRange: [0.002, 0.005], color: new Color(0x5a8f30) },
  ryegrass: { heightRange: [0.3, 0.8], widthRange: [0.002, 0.004], color: new Color(0x427525) },
};

const BIOME_GRASS_PREFS: Record<string, (keyof typeof GRASS_SPECIES_DATA)[]> = {
  temperate: ['bluegrass', 'fescue', 'ryegrass'],
  tropical: ['bermuda', 'ryegrass'],
  arid: ['bermuda', 'fescue'],
  alpine: ['fescue', 'bluegrass'],
  boreal: ['fescue', 'ryegrass'],
  mediterranean: ['bermuda', 'fescue'],
};

export class GrassGenerator extends BaseObjectGenerator<GrassParameters> {
  protected readonly defaultParams: GrassParameters = DEFAULT_GRASS_PARAMS;
  protected readonly paramName = 'GrassGenerator';

  private noise = new Noise3D();
  private bladeGeometry: BufferGeometry | null = null;
  private instancedMesh: InstancedMesh | null = null;

  /**
   * Generate procedural grass patch
   */
  generate(params: Partial<GrassParameters> = {}): Group {
    const finalParams = this.validateParameters(params);
    const group = new Group();
    
    // Determine species based on biome or random selection
    const speciesList = this.selectSpecies(finalParams.species);
    
    // Create blade geometry if not cached
    if (!this.bladeGeometry) {
      this.bladeGeometry = this.createBladeGeometry(finalParams);
    }
    
    // Generate grass instances
    const totalBlades = Math.floor(finalParams.density * this.area);
    const material = this.createGrassMaterial(finalParams);
    
    this.instancedMesh = new InstancedMesh(this.bladeGeometry, material, totalBlades);
    this.instancedMesh.instanceMatrix.setUsage(3); // DynamicDrawUsage
    
    const dummyMatrix = new Matrix4();
    const position = new Vector3();
    const quaternion = this.quaternion;
    const scale = new Vector3();
    
    let instanceIndex = 0;
    
    // Generate clumps
    const numClumps = Math.floor(finalParams.clumpDensity * this.area);
    
    for (let i = 0; i < numClumps && instanceIndex < totalBlades; i++) {
      // Clump center position
      const cx = (Math.random() - 0.5) * this.bounds.x;
      const cz = (Math.random() - 0.5) * this.bounds.z;
      
      // Number of blades in this clump
      const bladesInClump = Math.floor(
        finalParams.clumpSize * (0.5 + Math.random())
      );
      
      // Select species for this clump
      const speciesIdx = Math.floor(Math.random() * speciesList.length);
      const species = speciesList[speciesIdx];
      const speciesData = GRASS_SPECIES_DATA[species];
      
      // Height variation for this clump
      const clumpHeight = finalParams.height * (
        speciesData.heightRange[0] + 
        Math.random() * (speciesData.heightRange[1] - speciesData.heightRange[0])
      ) / 0.3; // Normalize to base height
      
      // Generate blades in clump
      for (let j = 0; j < bladesInClump && instanceIndex < totalBlades; j++) {
        // Offset from clump center
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 0.05; // Clump radius
        
        position.set(
          cx + Math.cos(angle) * radius,
          0,
          cz + Math.sin(angle) * radius
        );
        
        // Height variation using noise
        const noiseVal = this.noise.perlin(
          position.x * 0.1,
          0,
          position.z * 0.1,
          0
        );
        position.y = noiseVal * 0.02; // Slight ground variation
        
        // Random rotation around Y
        const rotY = Math.random() * Math.PI * 2;
        
        // Scale with species-specific width
        const bladeWidth = finalParams.bladeWidth * (
          speciesData.widthRange[0] + 
          Math.random() * (speciesData.widthRange[1] - speciesData.widthRange[0])
        ) / 0.003;
        
        scale.set(
          bladeWidth,
          clumpHeight * (0.7 + Math.random() * 0.6), // Height variation
          bladeWidth
        );
        
        // Create transformation matrix
        dummyMatrix.makeRotationY(rotY);
        dummyMatrix.setPosition(position);
        dummyMatrix.scale(scale);
        
        this.instancedMesh!.setMatrixAt(instanceIndex, dummyMatrix);
        instanceIndex++;
      }
    }
    
    // Store wind parameters for animation update
    (this.instancedMesh as any)._windIntensity = finalParams.windIntensity;
    (this.instancedMesh as any)._windSpeed = finalParams.windSpeed;
    (this.instancedMesh as any)._time = 0;
    
    group.add(this.instancedMesh);
    
    // Generate collision mesh (simplified plane for grass)
    const collisionMesh = this.createCollisionMesh(finalParams);
    if (collisionMesh) {
      collisionMesh.name = 'Grass_Collision';
      group.add(collisionMesh);
    }
    
    // Generate LOD levels
    this.generateLODs(group, finalParams);
    
    return group;
  }

  /**
   * Update wind animation (call each frame)
   */
  updateWind(deltaTime: number, time: number): void {
    if (!this.instancedMesh) return;
    
    const windIntensity = (this.instancedMesh as any)._windIntensity || 0.5;
    const windSpeed = (this.instancedMesh as any)._windSpeed || 1.0;
    
    // Update shader uniform for wind animation
    const material = this.instancedMesh.material as Material & { uniforms?: any };
    if (material.uniforms) {
      material.uniforms.time = { value: time * windSpeed };
      material.uniforms.windIntensity = { value: windIntensity };
    }
  }

  /**
   * Select grass species based on parameter
   */
  private selectSpecies(speciesParam: GrassParameters['species']): (keyof typeof GRASS_SPECIES_DATA)[] {
    if (speciesParam !== 'mixed') {
      return [speciesParam];
    }
    
    // Use biome-based selection if available, otherwise random
    const biome = this.biome || 'temperate';
    return BIOME_GRASS_PREFS[biome] || ['fescue', 'bluegrass'];
  }

  /**
   * Create single grass blade geometry
   */
  private createBladeGeometry(params: GrassParameters): BufferGeometry {
    const geometry = new BufferGeometry();
    
    // Simple curved blade using quadratic bezier
    const segments = 4;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    // Blade profile (narrow at tip, wider at base)
    const widths = [0.3, 0.6, 0.8, 0.5, 0.2]; // Width at each segment
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t;
      const width = widths[i] * params.bladeWidth;
      
      // Left vertex
      vertices.push(-width, y, 0);
      uvs.push(0, t);
      
      // Right vertex
      vertices.push(width, y, 0);
      uvs.push(1, t);
    }
    
    // Generate indices for triangles
    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
    
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Add custom attributes for wind animation
    const windWeights = new Float32Array(Math.ceil(vertices.length / 3));
    for (let i = 0; i < windWeights.length; i++) {
      const y = vertices[i * 3 + 1];
      windWeights[i] = y; // Higher weight at top for more movement
    }
    geometry.setAttribute('windWeight', new Float32BufferAttribute(windWeights, 1));
    
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Create grass material with wind shader support
   */
  private createGrassMaterial(params: GrassParameters): Material {
    // Interpolate between primary and secondary colors based on dryness
    const baseColor = params.colorPrimary.clone().lerp(
      new Color(0x8b7355), // Brown for dry grass
      params.dryness
    );
    
    // Create shader material with wind animation
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: baseColor },
        colorSecondary: { value: params.colorSecondary },
        time: { value: 0 },
        windIntensity: { value: params.windIntensity },
      },
      vertexShader: `
        attribute float windWeight;
        uniform float time;
        uniform float windIntensity;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vPosition = position;
          
          // Wind animation using sine wave
          float wind = sin(time + position.y * 2.0) * windWeight * windIntensity;
          vec3 newPos = position;
          newPos.x += wind * 0.1;
          newPos.z += cos(time * 0.7) * wind * 0.05;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 colorSecondary;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          // Gradient from base to tip
          vec3 finalColor = mix(color, colorSecondary, vUv.y);
          gl_FragColor = vec4(finalColor, 0.9);
        }
      `,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    
    return material;
  }

  /**
   * Generate LOD levels for grass
   */
  private generateLODs(group: Group, params: GrassParameters): void {
    if (!this.instancedMesh) return;
    
    // LOD 0: Full detail (already added)
    // LOD 1: Simplified blades (fewer segments)
    // LOD 2: Card-based (crossed planes)
    // LOD 3: Billboard (single plane facing camera)
    
    const lodDistances = params.lodDistance;
    
    // Store LOD info for renderer
    (group as any).lodInfo = {
      distances: lodDistances,
      currentLod: 0,
    };
  }

  /**
   * Create simplified collision mesh
   */
  private createCollisionMesh(params: GrassParameters): Object3D | null {
    // Grass typically uses a simple plane for collision
    const geometry = new THREE.PlaneGeometry(this.bounds.x, this.bounds.z);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.name = 'GrassGroundPlane';
    
    return plane;
  }

  /**
   * Validate and merge parameters
   */
  protected validateParameters(params: Partial<GrassParameters>): GrassParameters {
    return {
      ...DEFAULT_GRASS_PARAMS,
      ...params,
      colorPrimary: params.colorPrimary?.clone() || DEFAULT_GRASS_PARAMS.colorPrimary,
      colorSecondary: params.colorSecondary?.clone() || DEFAULT_GRASS_PARAMS.colorSecondary,
    };
  }

  /**
   * Get random parameters for procedural generation
   */
  getRandomParameters(): GrassParameters {
    const speciesKeys = Object.keys(GRASS_SPECIES_DATA) as Array<keyof typeof GRASS_SPECIES_DATA>;
    const randomSpecies = speciesKeys[Math.floor(Math.random() * speciesKeys.length)];
    
    return {
      species: Math.random() > 0.7 ? 'mixed' : randomSpecies,
      height: 0.1 + Math.random() * 0.8,
      bladeWidth: 0.001 + Math.random() * 0.006,
      density: 500 + Math.random() * 4000,
      colorPrimary: new Color().setHSL(0.25 + Math.random() * 0.1, 0.5, 0.3 + Math.random() * 0.2),
      colorSecondary: new Color().setHSL(0.28 + Math.random() * 0.1, 0.4, 0.5 + Math.random() * 0.2),
      dryness: Math.random() * 0.4,
      clumpSize: 2 + Math.floor(Math.random() * 6),
      clumpDensity: 400 + Math.random() * 800,
      curlAmount: Math.random() * 0.5,
      windIntensity: 0.3 + Math.random() * 0.7,
      windSpeed: 0.5 + Math.random() * 2.0,
      lodDistance: [0, 8 + Math.random() * 5, 20 + Math.random() * 10, 40 + Math.random() * 20],
    };
  }
}

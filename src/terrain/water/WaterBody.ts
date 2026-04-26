/**
 * Water Body System
 * 
 * Manages lakes, rivers, oceans with realistic shorelines,
 * wave simulation, and fluid dynamics integration.
 * 
 * @module WaterBody
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';
import { FluidDynamics } from './FluidDynamics';

export interface WaterBodyParams {
  baseLevel: number;
  surfaceSize: THREE.Vector2;
  resolution: number;
  waveHeight: number;
  waveSpeed: number;
  waveFrequency: number;
  foamIntensity: number;
  transparency: number;
  colorDeep: THREE.Color;
  colorShallow: THREE.Color;
  enableFluidDynamics: boolean;
}

export interface ShorelinePoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  wetness: number;
}

export class WaterBody {
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.ShaderMaterial;
  private params: WaterBodyParams;
  private noise: NoiseFunction3D;
  private time: number = 0;
  private fluidDynamics: FluidDynamics | null = null;
  private shorelinePoints: ShorelinePoint[] = [];

  constructor(params: Partial<WaterBodyParams> = {}) {
    this.params = {
      baseLevel: 0,
      surfaceSize: new THREE.Vector2(100, 100),
      resolution: 64,
      waveHeight: 0.5,
      waveSpeed: 1.0,
      waveFrequency: 0.5,
      foamIntensity: 0.3,
      transparency: 0.7,
      colorDeep: new THREE.Color(0x006994),
      colorShallow: new THREE.Color(0x40a8d4),
      enableFluidDynamics: false,
      ...params
    };

    this.noise = createNoise3D();

    // Create water surface geometry
    this.geometry = new THREE.PlaneGeometry(
      this.params.surfaceSize.x,
      this.params.surfaceSize.y,
      this.params.resolution,
      this.params.resolution
    );
    this.geometry.rotateX(-Math.PI / 2);

    // Create custom shader material for water
    this.material = this.createWaterShader();

    // Initialize fluid dynamics if enabled
    if (this.params.enableFluidDynamics) {
      this.fluidDynamics = new FluidDynamics();
    }
  }

  /**
   * Create WebGL shader material for realistic water rendering
   */
  private createWaterShader(): THREE.ShaderMaterial {
    const uniforms = {
      uTime: { value: 0 },
      uWaveHeight: { value: this.params.waveHeight },
      uWaveSpeed: { value: this.params.waveSpeed },
      uWaveFrequency: { value: this.params.waveFrequency },
      uColorDeep: { value: this.params.colorDeep },
      uColorShallow: { value: this.params.colorShallow },
      uTransparency: { value: this.params.transparency },
      uFoamIntensity: { value: this.params.foamIntensity },
      uBaseLevel: { value: this.params.baseLevel }
    };

    const vertexShader = `
      uniform float uTime;
      uniform float uWaveHeight;
      uniform float uWaveSpeed;
      uniform float uWaveFrequency;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying vec2 vUv;
      
      // Simplex noise functions
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        
        i = mod289(i);
        vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
      
      void main() {
        vUv = uv;
        vPosition = position;
        
        // Multi-layer wave simulation
        float wave1 = snoise(vec3(position.x * uWaveFrequency, position.z * uWaveFrequency, uTime * uWaveSpeed));
        float wave2 = snoise(vec3(position.x * uWaveFrequency * 2.0, position.z * uWaveFrequency * 2.0, uTime * uWaveSpeed * 1.5));
        float wave3 = snoise(vec3(position.x * uWaveFrequency * 4.0, position.z * uWaveFrequency * 4.0, uTime * uWaveSpeed * 2.0));
        
        float totalWave = (wave1 * 0.6 + wave2 * 0.3 + wave3 * 0.1) * uWaveHeight;
        vWaveHeight = totalWave;
        
        vec3 newPos = position;
        newPos.y = totalWave;
        
        // Calculate normal from wave gradient
        float epsilon = 0.1;
        float h1 = snoise(vec3((position.x + epsilon) * uWaveFrequency, position.z * uWaveFrequency, uTime * uWaveSpeed));
        float h2 = snoise(vec3((position.x - epsilon) * uWaveFrequency, position.z * uWaveFrequency, uTime * uWaveSpeed));
        float h3 = snoise(vec3(position.x * uWaveFrequency, (position.z + epsilon) * uWaveFrequency, uTime * uWaveSpeed));
        float h4 = snoise(vec3(position.x * uWaveFrequency, (position.z - epsilon) * uWaveFrequency, uTime * uWaveSpeed));
        
        vec3 tangent = vec3(2.0 * epsilon, h1 - h2, 0.0);
        vec3 bitangent = vec3(0.0, h3 - h4, 2.0 * epsilon);
        vNormal = normalize(cross(tangent, bitangent));
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uColorDeep;
      uniform vec3 uColorShallow;
      uniform float uTransparency;
      uniform float uFoamIntensity;
      uniform float uBaseLevel;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying vec2 vUv;
      
      void main() {
        // Depth-based color blending
        float depth = smoothstep(-2.0, 2.0, vWaveHeight);
        vec3 waterColor = mix(uColorShallow, uColorDeep, depth);
        
        // Specular highlights
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        vec3 viewDir = normalize(-vPosition);
        vec3 reflectDir = reflect(-lightDir, vNormal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        vec3 specular = vec3(1.0) * spec * 0.5;
        
        // Foam at wave peaks
        float foam = smoothstep(0.8, 1.0, vWaveHeight) * uFoamIntensity;
        vec3 foamColor = vec3(1.0) * foam;
        
        // Fresnel effect for edge glow
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);
        
        vec3 finalColor = waterColor + specular + foamColor;
        finalColor = mix(finalColor, vec3(1.0), fresnel * 0.3);
        
        gl_FragColor = vec4(finalColor, uTransparency);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  /**
   * Update water simulation
   */
  update(deltaTime: number): void {
    this.time += deltaTime;
    
    if (this.material.uniforms) {
      this.material.uniforms.uTime.value = this.time;
    }

    // Update fluid dynamics if enabled
    if (this.fluidDynamics) {
      this.fluidDynamics.update(deltaTime);
    }
  }

  /**
   * Generate shoreline points where water meets terrain
   */
  generateShoreline(terrainGeometry: THREE.Geometry | THREE.BufferGeometry): ShorelinePoint[] {
    this.shorelinePoints = [];
    
    // Simplified shoreline detection
    // In production, would use marching squares on heightmap
    const positions = (terrainGeometry as THREE.BufferGeometry).attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Check if point is near water level
      const diff = Math.abs(y - this.params.baseLevel);
      if (diff < 0.5) {
        const point: ShorelinePoint = {
          position: new THREE.Vector3(x, y, z),
          normal: new THREE.Vector3(0, 1, 0), // Simplified
          wetness: 1.0 - diff / 0.5
        };
        this.shorelinePoints.push(point);
      }
    }
    
    return this.shorelinePoints;
  }

  /**
   * Create Three.js mesh for water body
   */
  createMesh(): THREE.Mesh {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = this.params.baseLevel;
    this.mesh.renderOrder = 999; // Render water last for transparency
    return this.mesh;
  }

  /**
   * Get fluid dynamics instance
   */
  getFluidDynamics(): FluidDynamics | null {
    return this.fluidDynamics;
  }

  /**
   * Set wave parameters dynamically
   */
  setWaveParams(height: number, speed: number, frequency: number): void {
    this.params.waveHeight = height;
    this.params.waveSpeed = speed;
    this.params.waveFrequency = frequency;
    
    if (this.material.uniforms) {
      this.material.uniforms.uWaveHeight.value = height;
      this.material.uniforms.uWaveSpeed.value = speed;
      this.material.uniforms.uWaveFrequency.value = frequency;
    }
  }

  /**
   * Get shoreline points
   */
  getShorelinePoints(): ShorelinePoint[] {
    return this.shorelinePoints;
  }
}

export default WaterBody;

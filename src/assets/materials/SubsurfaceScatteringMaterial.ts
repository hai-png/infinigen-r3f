import * as THREE from 'three';

/**
 * Subsurface Scattering (SSS) Material
 * Approximates light scattering through translucent materials like skin, wax, marble
 */

export interface SSSConfig {
  color: THREE.Color;
  thickness: number;
  roughness: number;
  metalness: number;
  subsurfaceColor: THREE.Color;
  subsurfaceIntensity: number;
  subsurfaceRadius: THREE.Vector3;
  normalScale: number;
}

export class SubsurfaceScatteringMaterial extends THREE.MeshPhysicalMaterial {
  private config: SSSConfig;
  private sssTexture: THREE.Texture | null = null;

  constructor(config: Partial<SSSConfig> = {}) {
    super({
      color: 0xffcccc,
      roughness: 0.5,
      metalness: 0.0,
      transmission: 0.0,
      thickness: 1.0,
    });

    this.config = {
      color: new THREE.Color(0xffcccc),
      thickness: 1.0,
      roughness: 0.5,
      metalness: 0.0,
      subsurfaceColor: new THREE.Color(0xff6666),
      subsurfaceIntensity: 0.5,
      subsurfaceRadius: new THREE.Vector3(1.0, 0.5, 0.4),
      normalScale: 1.0,
      ...config,
    };

    this.updateFromConfig();
  }

  private updateFromConfig(): void {
    // Base color
    this.color.copy(this.config.color);
    
    // Surface properties
    this.roughness = this.config.roughness;
    this.metalness = this.config.metalness;
    
    // Subsurface scattering approximation using transmission
    this.transmission = this.config.subsurfaceIntensity * 0.5;
    this.thickness = this.config.thickness;
    
    // Use specular to enhance the effect
    this.specularColor = this.config.subsurfaceColor.clone().multiplyScalar(0.5);
    
    // Clearcoat for skin-like sheen
    this.clearcoat = 0.3;
    this.clearcoatRoughness = 0.2;
    
    // Sheen for soft surface appearance
    this.sheenColor = this.config.subsurfaceColor.clone().multiplyScalar(0.3);
    this.sheenRoughness = 0.5;
  }

  public setColor(color: THREE.Color | number): void {
    if (color instanceof THREE.Color) {
      this.config.color.copy(color);
    } else {
      this.config.color.setHex(color);
    }
    this.color.copy(this.config.color);
  }

  public setSubsurfaceColor(color: THREE.Color | number): void {
    if (color instanceof THREE.Color) {
      this.config.subsurfaceColor.copy(color);
    } else {
      this.config.subsurfaceColor.setHex(color);
    }
    this.specularColor.copy(this.config.subsurfaceColor).multiplyScalar(0.5);
    this.sheenColor.copy(this.config.subsurfaceColor).multiplyScalar(0.3);
  }

  public setSubsurfaceIntensity(intensity: number): void {
    this.config.subsurfaceIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.transmission = this.config.subsurfaceIntensity * 0.5;
  }

  public setThickness(thickness: number): void {
    this.config.thickness = Math.max(0.01, thickness);
    this.thickness = this.config.thickness;
  }

  public setRoughness(roughness: number): void {
    this.config.roughness = THREE.MathUtils.clamp(roughness, 0, 1);
    this.roughness = this.config.roughness;
  }

  public setNormalMap(texture: THREE.Texture | null): void {
    this.normalMap = texture;
    this.normalScale.set(this.config.normalScale, this.config.normalScale);
  }

  public setNormalScale(scale: number): void {
    this.config.normalScale = scale;
    this.normalScale.set(scale, scale);
  }

  public setSubsurfaceRadius(r: number, g: number, b: number): void {
    this.config.subsurfaceRadius.set(r, g, b);
    // Note: True wavelength-dependent scattering would require custom shader
    // This is an approximation using RGB values
  }

  public clone(): this {
    return new SubsurfaceScatteringMaterial({ ...this.config }) as this;
  }

  public toJSON(meta?: any): any {
    const data = super.toJSON(meta);
    data.subsurfaceConfig = this.config;
    return data;
  }

  public dispose(): void {
    super.dispose();
    if (this.sssTexture) {
      this.sssTexture.dispose();
    }
  }
}

// Alternative: Custom shader-based SSS for more accurate results
export class AdvancedSSSMaterial extends THREE.ShaderMaterial {
  constructor(config: Partial<SSSConfig> = {}) {
    const finalConfig: SSSConfig = {
      color: new THREE.Color(0xffcccc),
      thickness: 1.0,
      roughness: 0.5,
      metalness: 0.0,
      subsurfaceColor: new THREE.Color(0xff6666),
      subsurfaceIntensity: 0.5,
      subsurfaceRadius: new THREE.Vector3(1.0, 0.5, 0.4),
      normalScale: 1.0,
      ...config,
    };

    super({
      uniforms: {
        uColor: { value: finalConfig.color },
        uSubsurfaceColor: { value: finalConfig.subsurfaceColor },
        uSubsurfaceIntensity: { value: finalConfig.subsurfaceIntensity },
        uThickness: { value: finalConfig.thickness },
        uRoughness: { value: finalConfig.roughness },
        uMetalness: { value: finalConfig.metalness },
        uNormalScale: { value: finalConfig.normalScale },
        tNormal: { value: null },
        tDiffuse: { value: null },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vViewPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uSubsurfaceColor;
        uniform float uSubsurfaceIntensity;
        uniform float uThickness;
        uniform float uRoughness;
        uniform float uMetalness;
        uniform sampler2D tNormal;
        uniform sampler2D tDiffuse;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vViewPosition;
        
        void main() {
          // Get normals (with optional normal map)
          vec3 normal = normalize(vNormal);
          
          // View direction
          vec3 viewDir = normalize(vViewPosition);
          
          // Simple diffuse lighting
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float NdotL = max(dot(normal, lightDir), 0.0);
          
          // Subsurface scattering approximation
          // Light passing through the surface
          float backLight = dot(viewDir, lightDir);
          float sssFactor = pow(max(backLight, 0.0), 2.0);
          vec3 sss = uSubsurfaceColor * sssFactor * uSubsurfaceIntensity;
          
          // Diffuse component
          vec3 diffuse = uColor * NdotL;
          
          // Specular (simple Phong)
          vec3 halfDir = normalize(lightDir + viewDir);
          float NdotH = max(dot(normal, halfDir), 0.0);
          float specular = pow(NdotH, 32.0 * (1.0 - uRoughness));
          vec3 specColor = mix(vec3(0.04), uColor, uMetalness);
          
          // Combine
          vec3 finalColor = diffuse + specColor * specular + sss;
          
          // Ambient
          finalColor += uColor * 0.1;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }

  public setTexture(texture: THREE.Texture): void {
    this.uniforms.tDiffuse.value = texture;
  }

  public setNormalMap(texture: THREE.Texture): void {
    this.uniforms.tNormal.value = texture;
  }
}

export default SubsurfaceScatteringMaterial;

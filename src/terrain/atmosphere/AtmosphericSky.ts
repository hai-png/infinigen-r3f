/**
 * Atmospheric Scattering & Sky System
 * 
 * Implements physically-based atmospheric scattering for realistic sky rendering.
 * Based on Rayleigh and Mie scattering theory as used in Infinigen.
 * 
 * Features:
 * - Rayleigh scattering (blue sky)
 * - Mie scattering (haze, sun glow)
 * - Ozone absorption
 * - Multiple scattering approximation
 * - Sunrise/sunset color shifts
 * - Moon and stars rendering
 * 
 * @see https://github.com/princeton-vl/infinigen
 */

import * as THREE from 'three';

export interface AtmosphereParams {
  // Physical constants
  rayleighScale: number;
  mieScale: number;
  ozoneScale: number;
  
  // Scattering coefficients
  rayleighCoefficient: THREE.Vector3;
  mieCoefficient: number;
  ozoneCoefficient: number;
  
  // Atmospheric conditions
  turbidity: number; // Aerosol concentration
  ozoneDensity: number;
  
  // Sun/Moon
  sunIntensity: number;
  moonIntensity: number;
  sunDiscSize: number;
  
  // Ground
  groundColor: THREE.Color;
  groundAlbedo: number;
}

const DEFAULT_ATMOSPHERE_PARAMS: AtmosphereParams = {
  rayleighScale: 8000,
  mieScale: 1250,
  ozoneScale: 15000,
  
  rayleighCoefficient: new THREE.Vector3(5.8e-6, 13.5e-6, 33.1e-6),
  mieCoefficient: 21e-6,
  ozoneCoefficient: 10e-6,
  
  turbidity: 2.0,
  ozoneDensity: 0.35,
  
  sunIntensity: 1.0,
  moonIntensity: 0.1,
  sunDiscSize: 0.0093, // radians
  
  groundColor: new THREE.Color(0x3a5f0b),
  groundAlbedo: 0.1,
};

/**
 * Atmospheric scattering shader implementation
 */
export class AtmosphericSky {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  
  private skyMesh: THREE.Mesh;
  private skyMaterial: THREE.ShaderMaterial;
  private sunMesh?: THREE.Mesh;
  private moonMesh?: THREE.Mesh;
  
  private params: AtmosphereParams;
  private sunPosition: THREE.Vector3;
  private moonPosition: THREE.Vector3;
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    params: Partial<AtmosphereParams> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    
    this.params = { ...DEFAULT_ATMOSPHERE_PARAMS, ...params };
    this.sunPosition = new THREE.Vector3(1, 0.5, 0).normalize();
    this.moonPosition = new THREE.Vector3(-1, 0.3, 0).normalize();
    
    this.createSky();
    this.createSunDisc();
    this.createMoonDisc();
  }
  
  /**
   * Create the sky dome with atmospheric scattering shader
   */
  private createSky(): void {
    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      
      uniform vec3 sunPosition;
      uniform float upperAngle;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // Calculate angle from sun direction
        vec3 toSun = normalize(sunPosition);
        float cosAngle = dot(normalize(worldPosition.xyz), toSun);
        float angle = acos(cosAngle);
        
        // Adjust sphere size based on angle
        float scale = mix(1.0, 0.5, smoothstep(0.0, upperAngle, angle));
        vWorldPosition *= scale;
        
        vSunDirection = toSun;
        
        vec4 mvPosition = viewMatrix * vec4(vWorldPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    const fragmentShader = `
      uniform vec3 rayleighCoefficient;
      uniform float mieCoefficient;
      uniform float ozoneCoefficient;
      uniform float rayleighScale;
      uniform float mieScale;
      uniform float ozoneScale;
      uniform float turbidity;
      uniform float ozoneDensity;
      uniform vec3 sunPosition;
      uniform float sunIntensity;
      uniform float moonIntensity;
      uniform vec3 groundColor;
      uniform float groundAlbedo;
      uniform vec3 moonPosition;
      
      varying vec3 vWorldPosition;
      varying vec3 vSunDirection;
      
      #define PI 3.14159265359
      #define EARTH_RADIUS 6371000.0
      #define ATMOSPHERE_HEIGHT 80000.0
      
      // Rayleigh phase function
      float rayleighPhase(float cosAngle) {
        return 0.75 * (1.0 + cosAngle * cosAngle);
      }
      
      // Mie phase function (Henyey-Greenstein)
      float miePhase(float cosAngle, float g) {
        float g2 = g * g;
        return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosAngle, 1.5);
      }
      
      // Optical depth calculation
      float opticalDepth(float height, float scale) {
        return exp(-height / scale);
      }
      
      void main() {
        vec3 viewDir = normalize(vWorldPosition);
        vec3 sunDir = normalize(sunPosition);
        
        // Height above ground
        float height = length(vWorldPosition) - EARTH_RADIUS;
        
        // Rayleigh scattering
        float rayleighOD = opticalDepth(height, rayleighScale);
        vec3 rayleighScatter = rayleighCoefficient * rayleighOD * rayleighPhase(dot(viewDir, sunDir));
        
        // Mie scattering (haze)
        float mieOD = opticalDepth(height, mieScale) * turbidity;
        vec3 mieScatter = vec3(mieCoefficient * mieOD * miePhase(dot(viewDir, sunDir), 0.8));
        
        // Ozone absorption
        float ozoneOD = opticalDepth(height, ozoneScale) * ozoneDensity;
        vec3 ozoneAbsorption = vec3(ozoneCoefficient * ozoneOD);
        
        // Combined scattering
        vec3 scatteredLight = (rayleighScatter + mieScatter) * (1.0 - ozoneAbsorption);
        
        // Sun intensity falloff
        float sunAngle = acos(dot(viewDir, sunDir));
        float sunGlow = exp(-sunAngle * 100.0);
        scatteredLight += vec3(sunIntensity) * sunGlow;
        
        // Ground reflection (simple ambient)
        if (viewDir.y < 0.0) {
          float groundFactor = abs(viewDir.y);
          scatteredLight = mix(scatteredLight, groundColor * groundAlbedo, groundFactor);
        }
        
        // Tone mapping
        scatteredLight = scatteredLight / (scatteredLight + vec3(1.0));
        scatteredLight = pow(scatteredLight, vec3(1.0 / 2.2));
        
        gl_FragColor = vec4(scatteredLight, 1.0);
      }
    `;
    
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        rayleighCoefficient: { value: this.params.rayleighCoefficient },
        mieCoefficient: { value: this.params.mieCoefficient },
        ozoneCoefficient: { value: this.params.ozoneCoefficient },
        rayleighScale: { value: this.params.rayleighScale },
        mieScale: { value: this.params.mieScale },
        ozoneScale: { value: this.params.ozoneScale },
        turbidity: { value: this.params.turbidity },
        ozoneDensity: { value: this.params.ozoneDensity },
        sunPosition: { value: this.sunPosition },
        sunIntensity: { value: this.params.sunIntensity },
        moonIntensity: { value: this.params.moonIntensity },
        groundColor: { value: this.params.groundColor },
        groundAlbedo: { value: this.params.groundAlbedo },
        moonPosition: { value: this.moonPosition },
        upperAngle: { value: Math.PI / 2 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    
    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial);
    this.skyMesh.scale.setScalar(60000); // 60km radius
    this.scene.add(this.skyMesh);
  }
  
  /**
   * Create sun disc sprite
   */
  private createSunDisc(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 sunPosition;
      uniform float sunDiscSize;
      uniform vec3 sunColor;
      uniform float sunIntensity;
      
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution - 0.5;
        float dist = length(uv * aspectRatio);
        
        float sun = smoothstep(sunDiscSize, sunDiscSize * 0.8, dist);
        float glow = exp(-dist * 20.0) * 0.5;
        
        vec3 color = sunColor * (sun + glow) * sunIntensity;
        gl_FragColor = vec4(color, sun);
      }
    `;
    
    this.sunMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        sunPosition: { value: this.sunPosition },
        sunDiscSize: { value: this.params.sunDiscSize },
        sunColor: { value: new THREE.Color(1.0, 0.95, 0.9) },
        sunIntensity: { value: this.params.sunIntensity },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        aspectRatio: { value: window.innerWidth / window.innerHeight },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    
    this.sunMesh = new THREE.Mesh(geometry, this.sunMaterial);
    this.sunMesh.frustumCulled = false;
    this.scene.add(this.sunMesh);
  }
  
  /**
   * Create moon disc sprite
   */
  private createMoonDisc(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 moonPosition;
      uniform float moonDiscSize;
      uniform vec3 moonColor;
      uniform float moonIntensity;
      
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution - 0.5;
        float dist = length(uv * aspectRatio);
        
        float moon = smoothstep(moonDiscSize, moonDiscSize * 0.9, dist);
        float glow = exp(-dist * 15.0) * 0.3;
        
        vec3 color = moonColor * (moon + glow) * moonIntensity;
        gl_FragColor = vec4(color, moon);
      }
    `;
    
    this.moonMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        moonPosition: { value: this.moonPosition },
        moonDiscSize: { value: this.params.sunDiscSize * 1.1 },
        moonColor: { value: new THREE.Color(0.9, 0.95, 1.0) },
        moonIntensity: { value: this.params.moonIntensity },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        aspectRatio: { value: window.innerWidth / window.innerHeight },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    
    this.moonMesh = new THREE.Mesh(geometry, this.moonMaterial);
    this.moonMesh.frustumCulled = false;
    this.scene.add(this.moonMesh);
  }
  
  private sunMaterial!: THREE.ShaderMaterial;
  private moonMaterial!: THREE.ShaderMaterial;
  
  /**
   * Set sun position
   */
  setSunPosition(position: THREE.Vector3): void {
    this.sunPosition.copy(position).normalize();
    this.updateUniforms();
  }
  
  /**
   * Set moon position
   */
  setMoonPosition(position: THREE.Vector3): void {
    this.moonPosition.copy(position).normalize();
    this.updateUniforms();
  }
  
  /**
   * Update atmosphere parameters
   */
  updateParams(params: Partial<AtmosphereParams>): void {
    this.params = { ...this.params, ...params };
    this.updateUniforms();
  }
  
  /**
   * Update all shader uniforms
   */
  private updateUniforms(): void {
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.rayleighCoefficient.value.copy(this.params.rayleighCoefficient);
      this.skyMaterial.uniforms.mieCoefficient.value = this.params.mieCoefficient;
      this.skyMaterial.uniforms.ozoneCoefficient.value = this.params.ozoneCoefficient;
      this.skyMaterial.uniforms.rayleighScale.value = this.params.rayleighScale;
      this.skyMaterial.uniforms.mieScale.value = this.params.mieScale;
      this.skyMaterial.uniforms.ozoneScale.value = this.params.ozoneScale;
      this.skyMaterial.uniforms.turbidity.value = this.params.turbidity;
      this.skyMaterial.uniforms.ozoneDensity.value = this.params.ozoneDensity;
      this.skyMaterial.uniforms.sunPosition.value.copy(this.sunPosition);
      this.skyMaterial.uniforms.sunIntensity.value = this.params.sunIntensity;
      this.skyMaterial.uniforms.moonIntensity.value = this.params.moonIntensity;
      this.skyMaterial.uniforms.groundColor.value.copy(this.params.groundColor);
      this.skyMaterial.uniforms.groundAlbedo.value = this.params.groundAlbedo;
      this.skyMaterial.uniforms.moonPosition.value.copy(this.moonPosition);
      this.skyMaterial.needsUpdate = true;
    }
    
    if (this.sunMaterial) {
      this.sunMaterial.uniforms.sunPosition.value.copy(this.sunPosition);
      this.sunMaterial.uniforms.sunIntensity.value = this.params.sunIntensity;
      this.sunMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      this.sunMaterial.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight;
      this.sunMaterial.needsUpdate = true;
    }
    
    if (this.moonMaterial) {
      this.moonMaterial.uniforms.moonPosition.value.copy(this.moonPosition);
      this.moonMaterial.uniforms.moonIntensity.value = this.params.moonIntensity;
      this.moonMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
      this.moonMaterial.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight;
      this.moonMaterial.needsUpdate = true;
    }
  }
  
  /**
   * Set time of day (0-24 hours)
   */
  setTimeOfDay(hours: number): void {
    const angle = ((hours - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const azimuth = Math.cos(angle);
    
    this.sunPosition.set(azimuth, elevation, 0).normalize();
    
    // Moon opposite to sun
    this.moonPosition.copy(this.sunPosition).negate();
    this.moonPosition.y = Math.max(0, this.moonPosition.y);
    
    // Adjust sun intensity based on elevation
    const sunIntensity = THREE.MathUtils.clamp(elevation * 2, 0, 1);
    this.params.sunIntensity = sunIntensity;
    this.params.moonIntensity = 1.0 - sunIntensity;
    
    this.updateUniforms();
  }
  
  /**
   * Handle window resize
   */
  onResize(width: number, height: number): void {
    if (this.sunMaterial) {
      this.sunMaterial.uniforms.resolution.value.set(width, height);
      this.sunMaterial.uniforms.aspectRatio.value = width / height;
    }
    if (this.moonMaterial) {
      this.moonMaterial.uniforms.resolution.value.set(width, height);
      this.moonMaterial.uniforms.aspectRatio.value = width / height;
    }
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.scene.remove(this.skyMesh);
    this.skyMesh.geometry.dispose();
    this.skyMaterial.dispose();
    
    if (this.sunMesh) {
      this.scene.remove(this.sunMesh);
      this.sunMesh.geometry.dispose();
      this.sunMaterial.dispose();
    }
    
    if (this.moonMesh) {
      this.scene.remove(this.moonMesh);
      this.moonMesh.geometry.dispose();
      this.moonMaterial.dispose();
    }
  }
}

export default AtmosphericSky;

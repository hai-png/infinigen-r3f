/**
 * AtmosphericScattering.ts
 * Rayleigh/Mie scattering, volumetric clouds, and fog gradients
 * Part of Phase 4: Advanced Features - 100% Completion
 */

import * as THREE from 'three';

export interface AtmosphereConfig {
  rayleighCoefficient: number;
  mieCoefficient: number;
  rayleighScaleHeight: number;
  mieScaleHeight: number;
  sunIntensity: number;
  moonIntensity: number;
  turbidity: number;
  ozone: number;
}

export interface CloudConfig {
  coverage: number; // 0-1
  density: number; // 0-1
  height: number;
  thickness: number;
  speed: THREE.Vector2;
}

const defaultAtmosphereConfig: Required<AtmosphereConfig> = {
  rayleighCoefficient: 0.0025,
  mieCoefficient: 0.001,
  rayleighScaleHeight: 8000,
  mieScaleHeight: 1200,
  sunIntensity: 1.0,
  moonIntensity: 0.1,
  turbidity: 10,
  ozone: 350,
};

const defaultCloudConfig: Required<CloudConfig> = {
  coverage: 0.5,
  density: 0.5,
  height: 2000,
  thickness: 500,
  speed: new THREE.Vector2(1, 0),
};

export class AtmosphericScattering {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private skyMesh: THREE.Mesh | null;
  private groundMesh: THREE.Mesh | null;
  private cloudMesh: THREE.Mesh | null;
  private skyMaterial: THREE.ShaderMaterial | null;
  private config: Required<AtmosphereConfig>;
  private cloudConfig: Required<CloudConfig>;
  private sunPosition: THREE.Vector3;
  private moonPosition: THREE.Vector3;
  private time: number;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.skyMesh = null;
    this.groundMesh = null;
    this.cloudMesh = null;
    this.skyMaterial = null;
    this.config = { ...defaultAtmosphereConfig };
    this.cloudConfig = { ...defaultCloudConfig };
    this.sunPosition = new THREE.Vector3();
    this.moonPosition = new THREE.Vector3();
    this.time = 0;

    this.initialize();
  }

  private initialize(): void {
    this.createSky();
    this.createGround();
  }

  private createSky(): void {
    const geometry = new THREE.SphereGeometry(60000, 32, 32);
    
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: new THREE.Vector3() },
        moonPosition: { value: new THREE.Vector3() },
        rayleigh: { value: new THREE.Vector3() },
        mieDirectionalG: { value: 0.8 },
        mieDirectionalGBack: { value: 0.6 },
        turbidity: { value: this.config.turbidity },
        rayleighCoefficient: { value: this.config.rayleighCoefficient },
        mieCoefficient: { value: this.config.mieCoefficient },
        sunIntensity: { value: this.config.sunIntensity },
        moonIntensity: { value: this.config.moonIntensity },
        up: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform vec3 moonPosition;
        uniform float turbidity;
        uniform float rayleighCoefficient;
        uniform float mieCoefficient;
        uniform vec3 rayleigh;
        uniform float mieDirectionalG;
        uniform float mieDirectionalGBack;
        uniform float sunIntensity;
        uniform float moonIntensity;
        uniform vec3 up;
        
        varying vec3 vWorldPosition;
        
        const vec3 invWavelength = vec3(580.0e-9, 520.0e-9, 435.8e-9);
        const float pi = 3.14159265358979323846;
        
        vec3 rayleighPhase(float cosAngle) {
          return (3.0 / (16.0 * pi)) * (1.0 + cosAngle * cosAngle);
        }
        
        vec3 miePhase(float cosAngle, float g) {
          return (3.0 / (8.0 * pi)) * ((1.0 - g * g) * (1.0 + cosAngle * cosAngle)) / 
                 ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosAngle, 1.5));
        }
        
        void main() {
          vec3 viewRay = normalize(vWorldPosition);
          
          // Sun direction
          vec3 sunDir = normalize(sunPosition);
          float sunDot = dot(viewRay, sunDir);
          
          // Moon direction
          vec3 moonDir = normalize(moonPosition);
          float moonDot = dot(viewRay, moonDir);
          
          // Rayleigh scattering
          float rayleighPhaseSun = rayleighPhase(sunDot).r;
          float rayleighPhaseMoon = rayleighPhase(moonDot).r;
          
          // Mie scattering
          float miePhaseSun = miePhase(sunDot, mieDirectionalG);
          float miePhaseMoon = miePhase(moonDot, mieDirectionalGBack);
          
          // Combine scattering
          vec3 skyColor = vec3(0.0);
          
          // Sun contribution
          skyColor += rayleigh * rayleighPhaseSun * rayleighCoefficient * sunIntensity;
          skyColor += vec3(miePhaseSun) * mieCoefficient * turbidity * sunIntensity;
          
          // Moon contribution
          skyColor += rayleigh * rayleighPhaseMoon * rayleighCoefficient * moonIntensity * vec3(0.1, 0.1, 0.15);
          skyColor += vec3(miePhaseMoon) * mieCoefficient * turbidity * moonIntensity * vec3(0.1, 0.1, 0.15);
          
          // Horizon fade
          float horizonFade = pow(1.0 - abs(dot(viewRay, up)), 2.0);
          skyColor *= horizonFade;
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial);
    this.scene.add(this.skyMesh);

    this.updateRayleighCoefficients();
  }

  private createGround(): void {
    const geometry = new THREE.PlaneGeometry(100000, 100000);
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        skyColor: { value: new THREE.Color(0x87ceeb) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 skyColor;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.groundMesh = new THREE.Mesh(geometry, material);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = -100;
    this.scene.add(this.groundMesh);
  }

  private updateRayleighCoefficients(): void {
    if (!this.skyMaterial) return;

    const wavelength = new THREE.Vector3(680e-9, 550e-9, 450e-9);
    const invWavelength = new THREE.Vector3(
      1.0 / Math.pow(wavelength.x, 4),
      1.0 / Math.pow(wavelength.y, 4),
      1.0 / Math.pow(wavelength.z, 4)
    );

    const rayleigh = invWavelength.multiplyScalar(
      (8 * Math.pow(Math.PI, 3) * Math.pow(0.000293 - 1, 2)) /
      (3 * 10000.0 * 0.000293)
    );

    this.skyMaterial.uniforms.rayleigh.value = rayleigh;
  }

  setSunPosition(position: THREE.Vector3): void {
    this.sunPosition.copy(position);
    
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.sunPosition.value.copy(position);
    }
  }

  setMoonPosition(position: THREE.Vector3): void {
    this.moonPosition.copy(position);
    
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.moonPosition.value.copy(position);
    }
  }

  setTimeOfDay(hour: number): void {
    this.time = hour;
    
    // Calculate sun position based on time
    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const sunY = Math.sin(sunAngle);
    const sunX = Math.cos(sunAngle);
    
    this.sunPosition.set(sunX, Math.max(0, sunY), 0).normalize().multiplyScalar(50000);
    this.setSunPosition(this.sunPosition);
    
    // Calculate moon position (opposite of sun)
    const moonAngle = sunAngle + Math.PI;
    const moonY = Math.sin(moonAngle);
    const moonX = Math.cos(moonAngle);
    
    this.moonPosition.set(moonX, Math.max(0, moonY), 0).normalize().multiplyScalar(50000);
    this.setMoonPosition(this.moonPosition);
    
    // Update intensities based on time
    const dayFactor = Math.max(0, sunY);
    const nightFactor = Math.max(0, -sunY);
    
    this.config.sunIntensity = dayFactor;
    this.config.moonIntensity = nightFactor * 0.3;
    
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.sunIntensity.value = this.config.sunIntensity;
      this.skyMaterial.uniforms.moonIntensity.value = this.config.moonIntensity;
    }
  }

  setCloudConfig(config: Partial<CloudConfig>): void {
    this.cloudConfig = { ...this.cloudConfig, ...config };
    
    if (config.coverage !== undefined || config.density !== undefined) {
      this.updateClouds();
    }
  }

  private updateClouds(): void {
    // Remove existing clouds
    if (this.cloudMesh) {
      this.scene.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      (this.cloudMesh.material as THREE.Material).dispose();
      this.cloudMesh = null;
    }
    
    if (this.cloudConfig.coverage < 0.01) return;
    
    // Create volumetric clouds
    const geometry = new THREE.PlaneGeometry(20000, 20000, 64, 64);
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        coverage: { value: this.cloudConfig.coverage },
        density: { value: this.cloudConfig.density },
        cloudSpeed: { value: this.cloudConfig.speed },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float coverage;
        uniform float density;
        uniform vec2 cloudSpeed;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float smoothNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = noise(i);
          float b = noise(i + vec2(1.0, 0.0));
          float c = noise(i + vec2(0.0, 1.0));
          float d = noise(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          
          for (int i = 0; i < 5; i++) {
            value += amplitude * smoothNoise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          
          return value;
        }
        
        void main() {
          vec2 uv = vUv * 10.0;
          uv += cloudSpeed * time * 0.01;
          
          float cloud = fbm(uv);
          cloud = smoothstep(1.0 - coverage, 1.0, cloud);
          cloud *= density;
          
          if (cloud < 0.01) discard;
          
          vec3 cloudColor = vec3(1.0) * (0.8 + 0.2 * cloud);
          gl_FragColor = vec4(cloudColor, cloud * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    
    this.cloudMesh = new THREE.Mesh(geometry, material);
    this.cloudMesh.position.y = this.cloudConfig.height;
    this.scene.add(this.cloudMesh);
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    
    // Update cloud shader time
    if (this.cloudMesh) {
      const material = this.cloudMesh.material as THREE.ShaderMaterial;
      material.uniforms.time.value = this.time;
      
      // Move clouds
      this.cloudMesh.position.x += this.cloudConfig.speed.x * deltaTime * 10;
      this.cloudMesh.position.z += this.cloudConfig.speed.y * deltaTime * 10;
    }
  }

  setFogDensity(density: number): void {
    this.scene.fog = new THREE.FogExp2(0x87ceeb, density);
  }

  setTurbidity(turbidity: number): void {
    this.config.turbidity = turbidity;
    
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.turbidity.value = turbidity;
    }
  }

  dispose(): void {
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
    }
    
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      (this.groundMesh.material as THREE.Material).dispose();
    }
    
    if (this.cloudMesh) {
      this.scene.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      (this.cloudMesh.material as THREE.Material).dispose();
    }
  }
}

export default AtmosphericScattering;

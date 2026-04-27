import * as THREE from 'three';

/**
 * Screen-Space Caustics Post-Processing Pass
 * Simulates caustic light patterns from refractive/reflective surfaces
 */

export interface CausticsConfig {
  intensity: number;
  scale: number;
  speed: number;
  distortion: number;
  color: THREE.Color;
}

export class CausticsPass extends THREE.ShaderMaterial {
  private config: CausticsConfig;
  private time: number = 0;
  private depthTexture: THREE.Texture | null = null;
  private normalTexture: THREE.Texture | null = null;

  constructor(config: Partial<CausticsConfig> = {}) {
    super({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tNormal: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
        uScale: { value: 20.0 },
        uSpeed: { value: 0.5 },
        uDistortion: { value: 0.1 },
        uColor: { value: new THREE.Color(0x88ccff) },
        uResolution: { value: new THREE.Vector2() },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tNormal;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uScale;
        uniform float uSpeed;
        uniform float uDistortion;
        uniform vec3 uColor;
        uniform vec2 uResolution;
        
        varying vec2 vUv;
        
        // Simplex noise function
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                              -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                                 + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                                  dot(x12.zw,x12.zw)), 0.0);
          m = m*m;
          m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }
        
        void main() {
          vec4 baseColor = texture2D(tDiffuse, vUv);
          
          // Calculate UV with time-based animation
          vec2 uv = vUv * uScale;
          uv.x += uTime * uSpeed;
          
          // Generate caustic pattern using layered noise
          float caustic = 0.0;
          caustic += snoise(uv) * 0.5;
          caustic += snoise(uv * 2.0 + uTime * 0.3) * 0.25;
          caustic += snoise(uv * 4.0 + uTime * 0.1) * 0.125;
          
          // Apply distortion based on depth/normal
          if (tNormal != NULL) {
            vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
            uv += normal.xy * uDistortion;
            caustic += dot(normal.xy, vec2(0.707, 0.707)) * 0.2;
          }
          
          // Normalize and shape caustic pattern
          caustic = normalize(caustic + 0.5);
          caustic = pow(caustic, 3.0) * 2.0;
          
          // Apply color
          vec3 causticColor = uColor * caustic * uIntensity;
          
          // Blend with base color
          vec3 finalColor = baseColor.rgb + causticColor;
          
          gl_FragColor = vec4(finalColor, baseColor.a);
        }
      `,
      transparent: true,
    });

    this.config = {
      intensity: 1.0,
      scale: 20.0,
      speed: 0.5,
      distortion: 0.1,
      color: new THREE.Color(0x88ccff),
      ...config,
    };

    this.updateUniforms();
  }

  private updateUniforms(): void {
    this.uniforms.uIntensity.value = this.config.intensity;
    this.uniforms.uScale.value = this.config.scale;
    this.uniforms.uSpeed.value = this.config.speed;
    this.uniforms.uDistortion.value = this.config.distortion;
    this.uniforms.uColor.value.copy(this.config.color);
  }

  public update(dt: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
  }

  public setDepthTexture(texture: THREE.Texture): void {
    this.depthTexture = texture;
    this.uniforms.tDepth.value = texture;
  }

  public setNormalTexture(texture: THREE.Texture): void {
    this.normalTexture = texture;
    this.uniforms.tNormal.value = texture;
  }

  public setIntensity(intensity: number): void {
    this.config.intensity = intensity;
    this.uniforms.uIntensity.value = intensity;
  }

  public setResolution(width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
  }

  public dispose(): void {
    super.dispose();
  }
}

export default CausticsPass;

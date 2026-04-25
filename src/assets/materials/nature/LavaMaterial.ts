import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Configuration for lava material properties
 */
export interface LavaMaterialConfig {
  baseColor: THREE.Color;
  glowColor: THREE.Color;
  temperature: number; // 0-1, affects glow intensity
  flowSpeed: number;
  turbulenceScale: number;
  bubbleDensity: number;
  crustEnabled: boolean;
  crustCoverage: number; // 0-1
  emissiveIntensity: number;
}

/**
 * Procedural lava material generator with animated flow and glow effects
 */
export class LavaMaterial {
  private static readonly DEFAULT_CONFIG: LavaMaterialConfig = {
    baseColor: new THREE.Color(0xff4500), // Orange-red
    glowColor: new THREE.Color(0xff6600),
    temperature: 0.8,
    flowSpeed: 0.3,
    turbulenceScale: 2.0,
    bubbleDensity: 0.3,
    crustEnabled: true,
    crustCoverage: 0.2,
    emissiveIntensity: 1.5,
  };

  private timeUniform: { value: number } = { value: 0 };

  /**
   * Generate a lava material with animated shader
   */
  public static generate(config: Partial<LavaMaterialConfig> = {}): THREE.ShaderMaterial {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const timeUniform = { value: 0 };

    // Custom shader for animated lava effect
    const uniforms = {
      time: timeUniform,
      baseColor: { value: finalConfig.baseColor },
      glowColor: { value: finalConfig.glowColor },
      temperature: { value: finalConfig.temperature },
      flowSpeed: { value: finalConfig.flowSpeed },
      turbulenceScale: { value: finalConfig.turbulenceScale },
      bubbleDensity: { value: finalConfig.bubbleDensity },
      crustEnabled: { value: finalConfig.crustEnabled ? 1.0 : 0.0 },
      crustCoverage: { value: finalConfig.crustCoverage },
      emissiveIntensity: { value: finalConfig.emissiveIntensity },
    };

    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float time;
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      uniform float temperature;
      uniform float flowSpeed;
      uniform float turbulenceScale;
      uniform float bubbleDensity;
      uniform float crustEnabled;
      uniform float crustCoverage;
      uniform float emissiveIntensity;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      
      // Simplex noise function
      vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
      
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
            + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
            dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      
      void main() {
        vec2 uv = vUv;
        
        // Animated noise for lava flow
        float noise1 = snoise(vec2(uv.x * turbulenceScale + time * flowSpeed, 
                                    uv.y * turbulenceScale));
        float noise2 = snoise(vec2(uv.x * turbulenceScale * 2.0 - time * flowSpeed * 0.5,
                                    uv.y * turbulenceScale * 2.0 + time * flowSpeed * 0.3));
        float noise3 = snoise(vec2(uv.x * turbulenceScale * 4.0 + time * flowSpeed * 2.0,
                                    uv.y * turbulenceScale * 4.0));
        
        float combinedNoise = noise1 * 0.6 + noise2 * 0.3 + noise3 * 0.1;
        
        // Create lava color gradient based on noise
        vec3 color = mix(baseColor, glowColor, combinedNoise * 0.5 + 0.5);
        
        // Add hot spots (brighter areas)
        float hotSpots = smoothstep(0.6, 0.9, combinedNoise);
        color = mix(color, vec3(1.0, 0.8, 0.2), hotSpots * temperature);
        
        // Add bubbles
        if (bubbleDensity > 0.0) {
          float bubbleNoise = snoise(vec2(uv.x * 20.0 + time * 0.5, 
                                           uv.y * 20.0 + time * 0.3));
          float bubbles = smoothstep(1.0 - bubbleDensity, 1.0, bubbleNoise);
          color = mix(color, vec3(0.2, 0.1, 0.0), bubbles * 0.5);
        }
        
        // Add cooling crust
        if (crustEnabled > 0.5) {
          float crustNoise = snoise(vec2(uv.x * 5.0, uv.y * 5.0));
          float crust = smoothstep(1.0 - crustCoverage, 1.0, crustNoise);
          vec3 crustColor = vec3(0.1, 0.05, 0.0);
          color = mix(color, crustColor, crust * 0.7);
          
          // Glowing cracks in crust
          float crackEdges = smoothstep(0.4, 0.5, crustNoise) * 
                            (1.0 - smoothstep(0.5, 0.6, crustNoise));
          color = mix(color, glowColor, crackEdges * temperature * 0.8);
        }
        
        // Calculate emissive intensity based on temperature and noise
        float emissiveFactor = emissiveIntensity * (0.5 + combinedNoise * 0.5) * temperature;
        
        gl_FragColor = vec4(color, 1.0);
        
        // Store emissive in alpha for post-processing
        gl_FragColor.a = emissiveFactor;
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: false,
      side: THREE.FrontSide,
    });

    // Animation loop
    const animate = () => {
      timeUniform.value += 0.016; // ~60fps
      requestAnimationFrame(animate);
    };
    
    // Start animation if in browser environment
    if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
      animate();
    }

    return material;
  }

  /**
   * Create preset configurations for different lava types
   */
  public static getPreset(lavaType: string): LavaMaterialConfig {
    const presets: Record<string, LavaMaterialConfig> = {
      basaltic: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xff3300),
        glowColor: new THREE.Color(0xff5500),
        temperature: 0.9,
        flowSpeed: 0.4,
        crustEnabled: true,
        crustCoverage: 0.15,
      },
      andesitic: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xcc3300),
        glowColor: new THREE.Color(0xff4400),
        temperature: 0.7,
        flowSpeed: 0.2,
        crustEnabled: true,
        crustCoverage: 0.3,
      },
      rhyolitic: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x992200),
        glowColor: new THREE.Color(0xff3300),
        temperature: 0.6,
        flowSpeed: 0.1,
        crustEnabled: true,
        crustCoverage: 0.4,
        bubbleDensity: 0.5,
      },
      pahoehoe: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xff4500),
        glowColor: new THREE.Color(0xff6600),
        temperature: 0.85,
        flowSpeed: 0.35,
        crustEnabled: true,
        crustCoverage: 0.1,
        turbulenceScale: 3.0,
      },
      aa: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xdd3300),
        glowColor: new THREE.Color(0xff4400),
        temperature: 0.75,
        flowSpeed: 0.15,
        crustEnabled: true,
        crustCoverage: 0.5,
        turbulenceScale: 4.0,
      },
    };

    return presets[lavaType.toLowerCase()] || this.DEFAULT_CONFIG;
  }

  /**
   * Update material time uniform for animation
   */
  public static updateMaterialTime(material: THREE.ShaderMaterial, deltaTime: number): void {
    if (material.uniforms && material.uniforms.time) {
      material.uniforms.time.value += deltaTime;
    }
  }
}

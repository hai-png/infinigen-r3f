import { Effect } from '@react-three/postprocessing';
import * as THREE from 'three';
const DEFAULT_PROPS = {
    radius: 1.0,
    samples: 8,
    direction: [0, 0],
    enabled: true,
    blurType: 'gaussian',
};
export class BlurEffect extends Effect {
    constructor(props = {}) {
        super('BlurEffect');
        this.props = { ...DEFAULT_PROPS, ...props };
        this.uniforms = {
            radius: new THREE.Uniform(this.props.radius),
            samples: new THREE.Uniform(this.props.samples),
            direction: new THREE.Uniform(new THREE.Vector2(...this.props.direction)),
        };
    }
    /**
     * Update blur radius
     */
    setRadius(value) {
        this.uniforms.radius.value = Math.max(0, value);
    }
    /**
     * Update number of samples
     */
    setSamples(value) {
        this.uniforms.samples.value = Math.max(1, Math.floor(value));
    }
    /**
     * Set blur direction
     */
    setDirection(x, y) {
        this.uniforms.direction.value.set(x, y);
    }
    /**
     * Set uniform blur (no direction)
     */
    setUniformBlur() {
        this.uniforms.direction.value.set(0, 0);
    }
    /**
     * Set horizontal blur
     */
    setHorizontalBlur() {
        this.uniforms.direction.value.set(1, 0);
    }
    /**
     * Set vertical blur
     */
    setVerticalBlur() {
        this.uniforms.direction.value.set(0, 1);
    }
    /**
     * Get current blur parameters
     */
    getParams() {
        return {
            radius: this.uniforms.radius.value,
            samples: this.uniforms.samples.value,
            direction: [
                this.uniforms.direction.value.x,
                this.uniforms.direction.value.y,
            ],
            enabled: this.enabled,
            blurType: this.props.blurType,
        };
    }
}
/**
 * GLSL fragment shader for gaussian blur
 */
export const blurFragmentShader = `
  uniform float radius;
  uniform float samples;
  uniform vec2 direction;
  
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  
  // Gaussian weight function
  float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * 3.14159) * sigma);
  }
  
  void main() {
    vec4 baseColor = texture2D(inputBuffer, vUv);
    
    // If no direction specified, use uniform blur
    vec2 dir = normalize(direction);
    if (length(direction) < 0.0001) {
      // Uniform blur - sample in circular pattern
      vec3 color = vec3(0.0);
      float totalWeight = 0.0;
      float sigma = radius * 0.5;
      
      int sampleCount = int(samples);
      for (int i = -4; i <= 4; i++) {
        for (int j = -4; j <= 4; j++) {
          if (i == 0 && j == 0) continue;
          
          float dist = sqrt(float(i * i + j * j));
          if (dist > samples) continue;
          
          float weight = gaussian(dist / samples, sigma);
          vec2 offset = vec2(float(i), float(j)) / resolution * radius;
          color += texture2D(inputBuffer, vUv + offset).rgb * weight;
          totalWeight += weight;
        }
      }
      
      // Add center pixel
      color += baseColor.rgb * gaussian(0.0, sigma);
      totalWeight += gaussian(0.0, sigma);
      
      gl_FragColor = vec4(color / totalWeight, baseColor.a);
    } else {
      // Directional blur
      vec3 color = vec3(0.0);
      float totalWeight = 0.0;
      float sigma = radius * 0.5;
      
      int sampleCount = int(samples);
      for (int i = -4; i <= 4; i++) {
        float weight = gaussian(float(i) / samples, sigma);
        vec2 offset = dir * float(i) / resolution * radius;
        color += texture2D(inputBuffer, vUv + offset).rgb * weight;
        totalWeight += weight;
      }
      
      gl_FragColor = vec4(color / totalWeight, baseColor.a);
    }
  }
`;
/**
 * Create a subtle blur preset
 */
export function createSubtleBlur() {
    return {
        radius: 0.5,
        samples: 6,
        direction: [0, 0],
        blurType: 'gaussian',
    };
}
/**
 * Create a strong blur preset (for depth of field backgrounds)
 */
export function createStrongBlur() {
    return {
        radius: 3.0,
        samples: 12,
        direction: [0, 0],
        blurType: 'gaussian',
    };
}
/**
 * Create a motion blur preset (horizontal)
 */
export function createMotionBlur(speed = 2.0) {
    return {
        radius: speed,
        samples: 10,
        direction: [1, 0],
        blurType: 'motion',
    };
}
/**
 * Create a tilt-shift style blur (vertical)
 */
export function createTiltShiftBlur() {
    return {
        radius: 2.0,
        samples: 8,
        direction: [0, 1],
        blurType: 'gaussian',
    };
}
export default BlurEffect;
//# sourceMappingURL=BlurEffect.js.map
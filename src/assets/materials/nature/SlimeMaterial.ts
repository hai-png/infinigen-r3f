import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Configuration for slime material properties
 */
export interface SlimeMaterialConfig {
  baseColor: THREE.Color;
  transparency: number;
  roughness: number;
  iridescence: number; // 0-1, rainbow effect strength
  viscosity: number; // Affects surface detail scale
  bubbleEnabled: boolean;
  bubbleSize: number;
  glowIntensity: number;
  normalScale: number;
}

/**
 * Procedural slime material generator with translucent and iridescent effects
 */
export class SlimeMaterial {
  private static readonly DEFAULT_CONFIG: SlimeMaterialConfig = {
    baseColor: new THREE.Color(0x32cd32), // Lime green
    transparency: 0.7,
    roughness: 0.2,
    iridescence: 0.5,
    viscosity: 1.0,
    bubbleEnabled: true,
    bubbleSize: 0.05,
    glowIntensity: 0.3,
    normalScale: 1.0,
  };

  /**
   * Generate a slime material with procedural textures
   */
  public static generate(config: Partial<SlimeMaterialConfig> = {}): THREE.MeshPhysicalMaterial {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get 2D context for slime material generation');
    }

    // Generate slime texture with bubbles and surface detail
    this.generateSlimeTexture(ctx, size, finalConfig);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Generate normal map for surface viscosity
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d');
    
    if (normalCtx) {
      this.generateNormalMap(normalCtx, size, finalConfig);
    }

    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;

    // Generate iridescence texture
    const iridescenceCanvas = document.createElement('canvas');
    iridescenceCanvas.width = size;
    iridescenceCanvas.height = size;
    const iridescenceCtx = iridescenceCanvas.getContext('2d');
    
    if (iridescenceCtx) {
      this.generateIridescenceTexture(iridescenceCtx, size, finalConfig);
    }

    const iridescenceTexture = new THREE.CanvasTexture(iridescenceCanvas);
    iridescenceTexture.wrapS = THREE.RepeatWrapping;
    iridescenceTexture.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshPhysicalMaterial({
      map: texture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(finalConfig.normalScale, finalConfig.normalScale),
      roughness: finalConfig.roughness,
      metalness: 0.1,
      transparent: finalConfig.transparency < 1.0,
      opacity: finalConfig.transparency,
      transmission: finalConfig.transparency * 0.8, // Glass-like transmission
      thickness: 0.5,
      iridescence: finalConfig.iridescence,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [0, 1000],
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      emissive: finalConfig.baseColor.clone().multiplyScalar(0.1),
      emissiveIntensity: finalConfig.glowIntensity,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Generate slime texture with bubbles and viscous surface
   */
  private static generateSlimeTexture(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: SlimeMaterialConfig
  ): void {
    // Base color gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, config.baseColor.getStyle());
    gradient.addColorStop(1, config.baseColor.clone().multiplyScalar(0.7).getStyle());

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    // Add viscous surface patterns using noise
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        const noise1 = NoiseUtils.perlin2D(nx * 4 * config.viscosity, ny * 4 * config.viscosity);
        const noise2 = NoiseUtils.perlin2D(nx * 8 * config.viscosity + 100, ny * 8 * config.viscosity + 100);
        
        const combinedNoise = noise1 * 0.7 + noise2 * 0.3;
        const variation = combinedNoise * 0.15;
        
        const idx = (y * size + x) * 4;
        
        data[idx] = Math.min(255, data[idx] * (1 + variation));
        data[idx + 1] = Math.min(255, data[idx + 1] * (1 + variation));
        data[idx + 2] = Math.min(255, data[idx + 2] * (1 + variation));
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Add bubbles
    if (config.bubbleEnabled) {
      this.addBubbles(ctx, size, config);
    }
  }

  /**
   * Generate normal map for viscous surface detail
   */
  private static generateNormalMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: SlimeMaterialConfig
  ): void {
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        const noise1 = NoiseUtils.perlin2D(nx * 4 * config.viscosity, ny * 4 * config.viscosity);
        const noise2 = NoiseUtils.perlin2D(nx * 8 * config.viscosity, ny * 8 * config.viscosity);
        
        const bumpStrength = 0.2 * config.viscosity;
        const normalX = noise1 * bumpStrength;
        const normalY = noise2 * bumpStrength;
        const normalZ = Math.sqrt(Math.max(0, 1 - normalX * normalX - normalY * normalY));

        const idx = (y * size + x) * 4;
        
        data[idx] = Math.floor((normalX + 1) * 127.5);
        data[idx + 1] = Math.floor((normalY + 1) * 127.5);
        data[idx + 2] = Math.floor(normalZ * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Generate iridescence texture for rainbow effect
   */
  private static generateIridescenceTexture(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: SlimeMaterialConfig
  ): void {
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        const noise = NoiseUtils.perlin2D(nx * 6, ny * 6);
        
        // Create rainbow colors based on noise and position
        const hue = (noise + nx + ny) * 360 * config.iridescence;
        const saturation = 0.5 + noise * 0.3;
        const lightness = 0.6 + noise * 0.2;
        
        const rgb = hslToRgb(hue / 360, saturation, lightness);
        
        const idx = (y * size + x) * 4;
        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = Math.floor(config.iridescence * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Add bubbles to slime surface
   */
  private static addBubbles(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: SlimeMaterialConfig
  ): void {
    const numBubbles = Math.floor(20 * config.bubbleSize * 10);
    
    for (let i = 0; i < numBubbles; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * config.bubbleSize * size * 0.5 + 2;

      // Bubble highlight
      const gradient = ctx.createRadialGradient(
        x - radius * 0.3,
        y - radius * 0.3,
        0,
        x,
        y,
        radius
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Create preset configurations for different slime types
   */
  public static getPreset(slimeType: string): SlimeMaterialConfig {
    const presets: Record<string, SlimeMaterialConfig> = {
      toxic: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x32cd32),
        transparency: 0.7,
        iridescence: 0.3,
        glowIntensity: 0.5,
      },
      magical: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x9370db),
        transparency: 0.8,
        iridescence: 0.8,
        glowIntensity: 0.7,
        bubbleEnabled: true,
      },
      acidic: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x7fff00),
        transparency: 0.6,
        iridescence: 0.2,
        viscosity: 1.5,
        glowIntensity: 0.4,
      },
      ghostly: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xe6e6fa),
        transparency: 0.9,
        iridescence: 0.6,
        viscosity: 0.8,
        glowIntensity: 0.6,
        bubbleEnabled: false,
      },
      lava: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xff4500),
        transparency: 0.5,
        iridescence: 0.4,
        viscosity: 2.0,
        glowIntensity: 0.9,
        bubbleEnabled: true,
        bubbleSize: 0.08,
      },
    };

    return presets[slimeType.toLowerCase()] || this.DEFAULT_CONFIG;
  }
}

/**
 * Helper function to convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

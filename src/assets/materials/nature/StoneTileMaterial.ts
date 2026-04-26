import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Configuration for stone tile material properties
 */
export interface StoneTileMaterialConfig {
  baseColor: THREE.Color;
  mortarColor: THREE.Color;
  tileSize: number; // Width and height of tiles
  mortarWidth: number;
  roughness: number;
  normalScale: number;
  weatheringEnabled: boolean;
  weatheringIntensity: number;
  crackDensity: number;
  mossCoverage: number; // 0-1
}

/**
 * Procedural stone tile material generator for floors, walls, and paths
 */
export class StoneTileMaterial {
  private static readonly DEFAULT_CONFIG: StoneTileMaterialConfig = {
    baseColor: new THREE.Color(0x808080), // Gray
    mortarColor: new THREE.Color(0x696969), // Dim gray
    tileSize: 0.5,
    mortarWidth: 0.02,
    roughness: 0.7,
    normalScale: 1.0,
    weatheringEnabled: true,
    weatheringIntensity: 0.3,
    crackDensity: 0.1,
    mossCoverage: 0.0,
  };

  /**
   * Generate a stone tile material with procedural textures
   */
  public static generate(config: Partial<StoneTileMaterialConfig> = {}): THREE.MeshStandardMaterial {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get 2D context for stone tile material generation');
    }

    // Generate tile texture
    this.generateTileTexture(ctx, size, finalConfig);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);

    // Generate normal map for tile surface detail
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
    normalTexture.repeat.set(2, 2);

    // Generate roughness map
    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = size;
    roughnessCanvas.height = size;
    const roughnessCtx = roughnessCanvas.getContext('2d');
    
    if (roughnessCtx) {
      this.generateRoughnessMap(roughnessCtx, size, finalConfig);
    }

    const roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
    roughnessTexture.wrapS = THREE.RepeatWrapping;
    roughnessTexture.wrapT = THREE.RepeatWrapping;
    roughnessTexture.repeat.set(2, 2);

    return new THREE.MeshStandardMaterial({
      map: texture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(finalConfig.normalScale, finalConfig.normalScale),
      roughnessMap: roughnessTexture,
      roughness: finalConfig.roughness,
      metalness: 0.0,
      side: THREE.FrontSide,
    });
  }

  /**
   * Generate tile texture with mortar lines and weathering
   */
  private static generateTileTexture(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: StoneTileMaterialConfig
  ): void {
    // Calculate tiles per texture
    const tilesPerRow = Math.floor(1 / config.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const mortarPixelWidth = Math.max(1, config.mortarWidth * size);

    // Fill with mortar color
    ctx.fillStyle = config.mortarColor.getStyle();
    ctx.fillRect(0, 0, size, size);

    // Draw individual tiles
    for (let row = 0; row < tilesPerRow; row++) {
      for (let col = 0; col < tilesPerRow; col++) {
        const x = col * tilePixelSize + mortarPixelWidth / 2;
        const y = row * tilePixelSize + mortarPixelWidth / 2;
        const tileWidth = tilePixelSize - mortarPixelWidth;
        const tileHeight = tilePixelSize - mortarPixelWidth;

        // Draw tile base
        ctx.fillStyle = config.baseColor.getStyle();
        ctx.fillRect(x, y, tileWidth, tileHeight);

        // Add stone variation using noise
        const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(tileWidth), Math.floor(tileHeight));
        const data = imageData.data;

        for (let ty = 0; ty < imageData.height; ty++) {
          for (let tx = 0; tx < imageData.width; tx++) {
            const nx = (col * tilePixelSize + tx) / size;
            const ny = (row * tilePixelSize + ty) / size;
            
            const noise1 = NoiseUtils.perlin2D(nx * 8, ny * 8);
            const noise2 = NoiseUtils.perlin2D(nx * 16 + 50, ny * 16 + 50);
            
            const combinedNoise = noise1 * 0.7 + noise2 * 0.3;
            const variation = combinedNoise * config.weatheringIntensity * 0.2;
            
            const idx = (ty * imageData.width + tx) * 4;
            
            data[idx] = Math.min(255, Math.max(0, data[idx] * (1 + variation)));
            data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * (1 + variation)));
            data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * (1 + variation)));
          }
        }

        ctx.putImageData(imageData, Math.floor(x), Math.floor(y));

        // Add cracks
        if (config.crackDensity > 0 && Math.random() < config.crackDensity) {
          this.addCrack(ctx, x, y, tileWidth, tileHeight, config);
        }

        // Add moss
        if (config.mossCoverage > 0) {
          this.addMoss(ctx, x, y, tileWidth, tileHeight, config);
        }
      }
    }

    // Add weathering overlay
    if (config.weatheringEnabled) {
      this.addWeathering(ctx, size, config);
    }
  }

  /**
   * Generate normal map for tile surface
   */
  private static generateNormalMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: StoneTileMaterialConfig
  ): void {
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    const tilesPerRow = Math.floor(1 / config.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const mortarPixelWidth = Math.max(1, config.mortarWidth * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        // Check if in mortar region
        const tileX = Math.floor(nx * tilesPerRow);
        const tileY = Math.floor(ny * tilesPerRow);
        const localX = (nx * tilesPerRow - tileX) * tilePixelSize;
        const localY = (ny * tilesPerRow - tileY) * tilePixelSize;
        
        const inMortar = localX < mortarPixelWidth || localY < mortarPixelWidth;
        
        let normalX = 0;
        let normalY = 0;
        let normalZ = 1;
        
        if (!inMortar) {
          // Add surface detail to tiles
          const noise1 = NoiseUtils.perlin2D(nx * 8, ny * 8);
          const noise2 = NoiseUtils.perlin2D(nx * 16, ny * 16);
          
          const bumpStrength = 0.15;
          normalX = (noise1 - 0.5) * bumpStrength;
          normalY = (noise2 - 0.5) * bumpStrength;
          normalZ = Math.sqrt(Math.max(0, 1 - normalX * normalX - normalY * normalY));
        } else {
          // Mortar is slightly recessed
          normalZ = 0.95;
        }

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
   * Generate roughness map
   */
  private static generateRoughnessMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: StoneTileMaterialConfig
  ): void {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        const noise = NoiseUtils.perlin2D(nx * 8, ny * 8);
        const roughness = 128 + noise * 64;
        
        const idx = (y * size + x) * 4;
        data[idx] = roughness;
        data[idx + 1] = roughness;
        data[idx + 2] = roughness;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Add crack details to a tile
   */
  private static addCrack(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    config: StoneTileMaterialConfig
  ): void {
    const startX = x + Math.random() * width * 0.3;
    const startY = y + Math.random() * height * 0.3;
    
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    
    let cx = startX;
    let cy = startY;
    const segments = 5 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < segments; i++) {
      cx += (Math.random() - 0.5) * width * 0.3;
      cy += (Math.random() - 0.5) * height * 0.3;
      ctx.lineTo(cx, cy);
    }
    
    ctx.stroke();
  }

  /**
   * Add moss growth to tiles
   */
  private static addMoss(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    config: StoneTileMaterialConfig
  ): void {
    const mossColor = new THREE.Color(0x228b22);
    const numPatches = Math.floor(config.mossCoverage * 10);
    
    for (let i = 0; i < numPatches; i++) {
      const px = x + Math.random() * width;
      const py = y + Math.random() * height;
      const radius = Math.random() * width * 0.15 + 5;
      
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, mossColor.clone().setAlpha(0.6).getStyle());
      gradient.addColorStop(1, mossColor.clone().setAlpha(0).getStyle());
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Add overall weathering effect
   */
  private static addWeathering(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: StoneTileMaterialConfig
  ): void {
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        const noise = NoiseUtils.perlin2D(nx * 4, ny * 4);
        const weathering = noise * config.weatheringIntensity * 30;
        
        const idx = (y * size + x) * 4;
        
        data[idx] = Math.min(255, Math.max(0, data[idx] - weathering));
        data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] - weathering));
        data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] - weathering));
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Create preset configurations for different stone tile types
   */
  public static getPreset(tileType: string): StoneTileMaterialConfig {
    const presets: Record<string, StoneTileMaterialConfig> = {
      cobblestone: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x696969),
        tileSize: 0.3,
        mortarWidth: 0.03,
        weatheringIntensity: 0.5,
        crackDensity: 0.2,
      },
      flagstone: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x8b7355),
        tileSize: 0.6,
        mortarWidth: 0.015,
        weatheringIntensity: 0.4,
        crackDensity: 0.15,
      },
      marble: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0xf5f5f5),
        mortarColor: new THREE.Color(0xd3d3d3),
        tileSize: 0.5,
        mortarWidth: 0.01,
        roughness: 0.3,
        weatheringIntensity: 0.1,
        crackDensity: 0.05,
      },
      slate: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x2f4f4f),
        mortarColor: new THREE.Color(0x1a1a1a),
        tileSize: 0.4,
        mortarWidth: 0.02,
        roughness: 0.6,
        weatheringIntensity: 0.3,
      },
      ancient: {
        ...this.DEFAULT_CONFIG,
        baseColor: new THREE.Color(0x8b7d6b),
        tileSize: 0.5,
        mortarWidth: 0.025,
        weatheringIntensity: 0.7,
        crackDensity: 0.3,
        mossCoverage: 0.4,
      },
    };

    return presets[tileType.toLowerCase()] || this.DEFAULT_CONFIG;
  }
}

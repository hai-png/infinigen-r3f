import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Configuration for mosaic material properties
 */
export interface MosaicMaterialConfig {
  tileColors: THREE.Color[];
  tileSize: number;
  groutColor: THREE.Color;
  groutWidth: number;
  patternType: 'random' | 'checkerboard' | 'stripes' | 'diagonal' | 'custom';
  roughness: number;
  normalScale: number;
  metallic: number;
  variationIntensity: number;
}

/**
 * Procedural mosaic material generator for decorative floors and walls
 */
export class MosaicMaterial {
  private static readonly DEFAULT_CONFIG: MosaicMaterialConfig = {
    tileColors: [
      new THREE.Color(0xffffff),
      new THREE.Color(0x000000),
      new THREE.Color(0xffd700),
      new THREE.Color(0x4169e1),
      new THREE.Color(0xdc143c),
    ],
    tileSize: 0.05,
    groutColor: new THREE.Color(0x808080),
    groutWidth: 0.005,
    patternType: 'random',
    roughness: 0.5,
    normalScale: 0.5,
    metallic: 0.0,
    variationIntensity: 0.2,
  };

  /**
   * Generate a mosaic material with procedural textures
   */
  public static generate(config: Partial<MosaicMaterialConfig> = {}): THREE.MeshStandardMaterial {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get 2D context for mosaic material generation');
    }

    // Generate mosaic texture based on pattern type
    this.generateMosaicTexture(ctx, size, finalConfig);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    // Calculate repeat based on tile size
    const tilesPerTexture = Math.floor(1 / finalConfig.tileSize);
    texture.repeat.set(tilesPerTexture, tilesPerTexture);

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
    normalTexture.repeat.set(tilesPerTexture, tilesPerTexture);

    return new THREE.MeshStandardMaterial({
      map: texture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(finalConfig.normalScale, finalConfig.normalScale),
      roughness: finalConfig.roughness,
      metalness: finalConfig.metallic,
      side: THREE.FrontSide,
    });
  }

  /**
   * Generate mosaic texture based on pattern type
   */
  private static generateMosaicTexture(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: MosaicMaterialConfig
  ): void {
    // Fill with grout color
    ctx.fillStyle = config.groutColor.getStyle();
    ctx.fillRect(0, 0, size, size);

    const tilesPerRow = Math.floor(1 / config.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const groutPixelWidth = Math.max(1, config.groutWidth * size);

    for (let row = 0; row < tilesPerRow; row++) {
      for (let col = 0; col < tilesPerRow; col++) {
        const x = col * tilePixelSize + groutPixelWidth / 2;
        const y = row * tilePixelSize + groutPixelWidth / 2;
        const tileWidth = tilePixelSize - groutPixelWidth;
        const tileHeight = tilePixelSize - groutPixelWidth;

        // Determine tile color based on pattern
        let tileColor: THREE.Color;
        
        switch (config.patternType) {
          case 'checkerboard':
            tileColor = (row + col) % 2 === 0 
              ? config.tileColors[0] 
              : config.tileColors[1];
            break;
            
          case 'stripes':
            tileColor = row % 2 === 0 
              ? config.tileColors[0] 
              : config.tileColors[1 % config.tileColors.length];
            break;
            
          case 'diagonal':
            tileColor = config.tileColors[(row + col) % config.tileColors.length];
            break;
            
          case 'random':
          default:
            tileColor = config.tileColors[Math.floor(Math.random() * config.tileColors.length)];
            break;
        }

        // Draw tile
        ctx.fillStyle = tileColor.getStyle();
        ctx.fillRect(x, y, tileWidth, tileHeight);

        // Add color variation
        if (config.variationIntensity > 0) {
          this.addTileVariation(ctx, x, y, tileWidth, tileHeight, tileColor, config);
        }

        // Add tile texture/detail
        this.addTileDetail(ctx, x, y, tileWidth, tileHeight, config);
      }
    }
  }

  /**
   * Add color variation to individual tiles
   */
  private static addTileVariation(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    baseColor: THREE.Color,
    config: MosaicMaterialConfig
  ): void {
    const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
    const data = imageData.data;

    for (let ty = 0; ty < imageData.height; ty++) {
      for (let tx = 0; tx < imageData.width; tx++) {
        const nx = tx / imageData.width;
        const ny = ty / imageData.height;
        
        const noise = NoiseUtils.perlin2D(nx * 4, ny * 4);
        const variation = (noise - 0.5) * config.variationIntensity;
        
        const idx = (ty * imageData.width + tx) * 4;
        
        data[idx] = Math.min(255, Math.max(0, data[idx] * (1 + variation)));
        data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * (1 + variation)));
        data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * (1 + variation)));
      }
    }

    ctx.putImageData(imageData, Math.floor(x), Math.floor(y));
  }

  /**
   * Add surface detail to tiles
   */
  private static addTileDetail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    config: MosaicMaterialConfig
  ): void {
    // Add subtle bevel effect at edges
    const bevelSize = Math.min(width, height) * 0.1;
    
    // Top-left highlight
    const highlightGradient = ctx.createLinearGradient(x, y, x + bevelSize, y + bevelSize);
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = highlightGradient;
    ctx.fillRect(x, y, bevelSize, height);
    ctx.fillRect(x, y, width, bevelSize);
    
    // Bottom-right shadow
    const shadowGradient = ctx.createLinearGradient(
      x + width - bevelSize,
      y + height - bevelSize,
      x + width,
      y + height
    );
    shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
    shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = shadowGradient;
    ctx.fillRect(x + width - bevelSize, y, bevelSize, height);
    ctx.fillRect(x, y + height - bevelSize, width, bevelSize);
  }

  /**
   * Generate normal map for mosaic surface
   */
  private static generateNormalMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    config: MosaicMaterialConfig
  ): void {
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    const tilesPerRow = Math.floor(1 / config.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const groutPixelWidth = Math.max(1, config.groutWidth * size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        
        // Check if in grout region
        const tileX = Math.floor(nx * tilesPerRow);
        const tileY = Math.floor(ny * tilesPerRow);
        const localX = (nx * tilesPerRow - tileX) * tilePixelSize;
        const localY = (ny * tilesPerRow - tileY) * tilePixelSize;
        
        const inGrout = localX < groutPixelWidth || localY < groutPixelWidth;
        
        let normalX = 0;
        let normalY = 0;
        let normalZ = 1;
        
        if (!inGrout) {
          // Tile is slightly raised
          const edgeDistance = Math.min(
            localX,
            localY,
            tilePixelSize - localX,
            tilePixelSize - localY
          );
          
          const bevelStrength = Math.min(1, edgeDistance / (groutPixelWidth * 2));
          normalZ = 0.9 + bevelStrength * 0.1;
          
          // Add slight surface variation
          const noise = NoiseUtils.perlin2D(nx * 8, ny * 8);
          normalX = (noise - 0.5) * 0.05;
          normalY = (noise - 0.5) * 0.05;
        } else {
          // Grout is recessed
          normalZ = 0.85;
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
   * Create preset configurations for different mosaic styles
   */
  public static getPreset(mosaicType: string): MosaicMaterialConfig {
    const presets: Record<string, MosaicMaterialConfig> = {
      roman: {
        ...this.DEFAULT_CONFIG,
        tileColors: [
          new THREE.Color(0xffffff),
          new THREE.Color(0x1a1a1a),
          new THREE.Color(0x8b0000),
          new THREE.Color(0xffd700),
          new THREE.Color(0x2f4f4f),
        ],
        tileSize: 0.03,
        patternType: 'random',
        variationIntensity: 0.3,
      },
      byzantine: {
        ...this.DEFAULT_CONFIG,
        tileColors: [
          new THREE.Color(0xffd700),
          new THREE.Color(0x4169e1),
          new THREE.Color(0xdc143c),
          new THREE.Color(0x228b22),
          new THREE.Color(0xffffff),
        ],
        tileSize: 0.02,
        patternType: 'diagonal',
        metallic: 0.3,
        variationIntensity: 0.1,
      },
      checkerboard: {
        ...this.DEFAULT_CONFIG,
        tileColors: [
          new THREE.Color(0xffffff),
          new THREE.Color(0x000000),
        ],
        tileSize: 0.1,
        patternType: 'checkerboard',
        variationIntensity: 0.0,
      },
      artDeco: {
        ...this.DEFAULT_CONFIG,
        tileColors: [
          new THREE.Color(0x000000),
          new THREE.Color(0xffd700),
          new THREE.Color(0xc0c0c0),
          new THREE.Color(0x1a1a1a),
        ],
        tileSize: 0.05,
        patternType: 'stripes',
        metallic: 0.2,
        variationIntensity: 0.15,
      },
      mediterranean: {
        ...this.DEFAULT_CONFIG,
        tileColors: [
          new THREE.Color(0x0066cc),
          new THREE.Color(0xffffff),
          new THREE.Color(0xffcc00),
          new THREE.Color(0xcc3300),
          new THREE.Color(0x009933),
        ],
        tileSize: 0.04,
        patternType: 'random',
        variationIntensity: 0.25,
      },
    };

    return presets[mosaicType.toLowerCase()] || this.DEFAULT_CONFIG;
  }
}

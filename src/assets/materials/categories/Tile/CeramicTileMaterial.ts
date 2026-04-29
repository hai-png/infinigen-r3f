import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

export interface CeramicTileMaterialConfig {
  baseColor: THREE.Color;
  groutColor: THREE.Color;
  tileSize: number;
  groutWidth: number;
  roughness: number;
  enablePattern: boolean;
  pattern: 'straight' | 'herringbone' | 'basketweave' | 'diagonal';
  enableWear: boolean;
  wearAmount: number;
}

export class CeramicTileMaterial {
  private config: CeramicTileMaterialConfig;
  private material: THREE.MeshStandardMaterial;

  constructor(config?: Partial<CeramicTileMaterialConfig>) {
    this.config = {
      baseColor: new THREE.Color(0xffffff),
      groutColor: new THREE.Color(0x9e9e9e),
      tileSize: 0.3,
      groutWidth: 0.02,
      roughness: 0.3,
      enablePattern: false,
      pattern: 'straight',
      enableWear: false,
      wearAmount: 0.2,
      ...config,
    };
    this.material = this.createMaterial();
  }

  private createMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: this.config.baseColor,
      roughness: this.config.roughness,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    
    this.generateTileTexture(material);
    return material;
  }

  private generateTileTexture(material: THREE.MeshStandardMaterial): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    const imageData = ctx.createImageData(size, size);
    const tilesPerUnit = 1 / this.config.tileSize;
    const scale = size * tilesPerUnit;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        let u = x / scale;
        let v = y / scale;
        
        // Apply pattern transformation
        if (this.config.enablePattern) {
          switch (this.config.pattern) {
            case 'herringbone':
              [u, v] = this.transformHerringbone(u, v);
              break;
            case 'basketweave':
              [u, v] = this.transformBasketweave(u, v);
              break;
            case 'diagonal':
              [u, v] = this.transformDiagonal(u, v);
              break;
          }
        }
        
        // Calculate tile position
        const tileU = u - Math.floor(u);
        const tileV = v - Math.floor(v);
        
        // Check if in grout area
        const inGrout = tileU < this.config.groutWidth || tileV < this.config.groutWidth;
        
        let r, g, b;
        if (inGrout) {
          r = this.config.groutColor.r;
          g = this.config.groutColor.g;
          b = this.config.groutColor.b;
        } else {
          r = this.config.baseColor.r;
          g = this.config.baseColor.g;
          b = this.config.baseColor.b;
          
          // Add subtle variation
          const noise = NoiseUtils.perlin2D(x * 0.01, y * 0.01) * 0.05;
          r += noise;
          g += noise;
          b += noise;
          
          // Add wear if enabled
          if (this.config.enableWear) {
            const wearNoise = NoiseUtils.perlin2D(x * 0.02, y * 0.02);
            if (wearNoise > 0.7) {
              const wearFactor = (wearNoise - 0.7) / 0.3 * this.config.wearAmount;
              r *= (1 - wearFactor);
              g *= (1 - wearFactor);
              b *= (1 - wearFactor);
            }
          }
        }
        
        imageData.data[index] = Math.min(255, Math.floor(r * 255));
        imageData.data[index + 1] = Math.min(255, Math.floor(g * 255));
        imageData.data[index + 2] = Math.min(255, Math.floor(b * 255));
        imageData.data[index + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    material.map = texture;
  }

  private transformHerringbone(u: number, v: number): [number, number] {
    const row = Math.floor(v);
    const offset = (row % 2) * 0.5;
    return [(u + offset) % 1, v];
  }

  private transformBasketweave(u: number, v: number): [number, number] {
    const blockU = Math.floor(u / 2);
    const blockV = Math.floor(v / 2);
    const localU = u % 2;
    const localV = v % 2;
    
    if ((blockU + blockV) % 2 === 0) {
      return [localV, localU];
    }
    return [localU, localV];
  }

  private transformDiagonal(u: number, v: number): [number, number] {
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);
    const newU = u * cos - v * sin;
    const newV = u * sin + v * cos;
    return [newU, newV];
  }

  getMaterial(): THREE.MeshStandardMaterial {
    return this.material;
  }

  static createPreset(preset: 'bathroom' | 'kitchen' | 'floor' | 'mosaic' | 'vintage'): CeramicTileMaterial {
    switch (preset) {
      case 'bathroom':
        return new CeramicTileMaterial({
          baseColor: new THREE.Color(0xe3f2fd),
          groutColor: new THREE.Color(0xb0bec5),
          tileSize: 0.2,
          roughness: 0.2,
        });
      case 'kitchen':
        return new CeramicTileMaterial({
          baseColor: new THREE.Color(0xffffff),
          groutColor: new THREE.Color(0x9e9e9e),
          tileSize: 0.15,
          roughness: 0.3,
        });
      case 'floor':
        return new CeramicTileMaterial({
          baseColor: new THREE.Color(0xd7ccc8),
          groutColor: new THREE.Color(0x8d6e63),
          tileSize: 0.4,
          roughness: 0.4,
          enableWear: true,
          wearAmount: 0.3,
        });
      case 'mosaic':
        return new CeramicTileMaterial({
          baseColor: new THREE.Color(0x4fc3f7),
          groutColor: new THREE.Color(0xffffff),
          tileSize: 0.05,
          groutWidth: 0.005,
          enablePattern: true,
          pattern: 'diagonal',
        });
      case 'vintage':
        return new CeramicTileMaterial({
          baseColor: new THREE.Color(0xfff9c4),
          groutColor: new THREE.Color(0xa1887f),
          tileSize: 0.25,
          roughness: 0.5,
          enablePattern: true,
          pattern: 'herringbone',
          enableWear: true,
          wearAmount: 0.4,
        });
      default:
        return new CeramicTileMaterial();
    }
  }
}

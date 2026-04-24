/**
 * Ceramic Material Generator
 * Generates procedural ceramic materials including porcelain, stoneware, earthenware, and tiles
 */

import { Color, Texture, CanvasTexture } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../BaseMaterialGenerator';
import { FixedSeed } from '../../../core/util/math/utils';
import { Noise3D } from '../../../core/util/math/noise';

export interface CeramicParams {
  type: 'porcelain' | 'stoneware' | 'earthenware' | 'terracotta' | 'tile';
  color: Color;
  glazeType: 'glossy' | 'matte' | 'satin' | 'crackle';
  glazeThickness: number;
  surfaceRoughness: number;
  patternType: 'none' | 'floral' | 'geometric' | 'striped' | 'dotted';
  patternIntensity: number;
  edgeWear: number;
  dirtAccumulation: number;
  tileGroutWidth?: number;
  tileGroutColor?: Color;
  tileSize?: number;
}

export class CeramicGenerator extends BaseMaterialGenerator<CeramicParams> {
  private static readonly DEFAULT_PARAMS: CeramicParams = {
    type: 'porcelain',
    color: new Color(0xffffff),
    glazeType: 'glossy',
    glazeThickness: 0.8,
    surfaceRoughness: 0.15,
    patternType: 'none',
    patternIntensity: 0.5,
    edgeWear: 0.0,
    dirtAccumulation: 0.0,
    tileGroutWidth: 0.02,
    tileGroutColor: new Color(0x888888),
    tileSize: 0.3,
  };

  constructor() {
    super();
  }

  getDefaultParams(): CeramicParams {
    return { ...CeramicGenerator.DEFAULT_PARAMS };
  }

  generate(params: Partial<CeramicParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(CeramicGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
    
    const material = this.createBaseMaterial();
    
    // Generate base ceramic color with subtle variations
    const baseColor = this.generateBaseColor(finalParams.color, finalParams.type, rng);
    material.map = this.createTextureFromColor(baseColor);
    
    // Apply glaze effects
    this.applyGlaze(material, finalParams, rng);
    
    // Add patterns if requested
    if (finalParams.patternType !== 'none') {
      this.applyPattern(material, finalParams, rng);
    }
    
    // Generate roughness based on glaze type and wear
    this.generateRoughnessMap(material, finalParams, rng);
    
    // Add edge wear
    if (finalParams.edgeWear > 0) {
      this.applyEdgeWear(material, finalParams, rng);
    }
    
    // Add dirt accumulation in crevices
    if (finalParams.dirtAccumulation > 0) {
      this.applyDirt(material, finalParams, rng);
    }
    
    // Handle tile-specific generation
    if (finalParams.type === 'tile' && finalParams.tileGroutWidth !== undefined) {
      this.applyTileGrout(material, finalParams, rng);
    }
    
    // Generate normal map for surface detail
    material.normalMap = this.generateNormalMap(finalParams, rng);
    
    // Generate AO map for depth
    material.aoMap = this.generateAOMap(finalParams, rng);
    
    return {
      material,
      maps: {
        map: material.map,
        roughnessMap: material.roughnessMap,
        normalMap: material.normalMap,
        aoMap: material.aoMap,
      },
      params: finalParams,
    };
  }

  private generateBaseColor(baseColor: Color, type: string, rng: FixedSeed): Color {
    const noise = new Noise3D(rng.seed);
    const variation = 0.05;
    
    // Sample noise for subtle color variation
    const n = noise.perlin(0.5, 0.5, rng.nextFloat());
    
    const r = Math.max(0, Math.min(1, baseColor.r + n * variation));
    const g = Math.max(0, Math.min(1, baseColor.g + n * variation));
    const b = Math.max(0, Math.min(1, baseColor.b + n * variation));
    
    return new Color(r, g, b);
  }

  private applyGlaze(material: any, params: CeramicParams, rng: FixedSeed): void {
    let roughness: number;
    let metalness = 0.0;
    
    switch (params.glazeType) {
      case 'glossy':
        roughness = 0.05;
        break;
      case 'satin':
        roughness = 0.3;
        break;
      case 'matte':
        roughness = 0.6;
        break;
      case 'crackle':
        roughness = 0.4;
        this.applyCrackleEffect(material, params, rng);
        break;
      default:
        roughness = 0.2;
    }
    
    // Adjust based on glaze thickness
    roughness *= (1 - params.glazeThickness * 0.3);
    
    material.roughness = Math.max(0.02, roughness);
    material.metalness = metalness;
    
    // Generate roughness texture for variation
    material.roughnessMap = this.createRoughnessTexture(params, rng);
  }

  private applyCrackleEffect(material: any, params: CeramicParams, rng: FixedSeed): void {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Create crackle pattern
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    
    // Generate random crackle lines
    for (let i = 0; i < 150; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const length = 20 + rng.nextFloat() * 50;
      const angle = rng.nextFloat() * Math.PI * 2;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    
    material.displacementMap = new CanvasTexture(canvas);
    material.displacementScale = 0.02;
  }

  private applyPattern(material: any, params: CeramicParams, rng: FixedSeed): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Draw base
    ctx.fillStyle = `#${material.map.image instanceof HTMLCanvasElement ? 
      this.getPixelColor(material.map.image, 0, 0) : 'ffffff'}`;
    ctx.fillRect(0, 0, size, size);
    
    const patternColor = params.color.clone().multiplyScalar(0.7);
    ctx.strokeStyle = `#${patternColor.getHexString()}`;
    ctx.lineWidth = 2;
    
    switch (params.patternType) {
      case 'floral':
        this.drawFloralPattern(ctx, size, rng);
        break;
      case 'geometric':
        this.drawGeometricPattern(ctx, size, rng);
        break;
      case 'striped':
        this.drawStripedPattern(ctx, size, rng);
        break;
      case 'dotted':
        this.drawDottedPattern(ctx, size, rng);
        break;
    }
    
    const patternTexture = new CanvasTexture(canvas);
    patternTexture.wrapS = patternTexture.wrapT = 1; // RepeatWrapping
    
    // Blend pattern with base
    material.map = patternTexture;
  }

  private drawFloralPattern(ctx: CanvasRenderingContext2D, size: number, rng: FixedSeed): void {
    const flowers = 8 + Math.floor(rng.nextFloat() * 12);
    
    for (let i = 0; i < flowers; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const radius = 15 + rng.nextFloat() * 25;
      
      // Draw petals
      for (let p = 0; p < 5; p++) {
        const angle = (p / 5) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Draw center
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
    }
  }

  private drawGeometricPattern(ctx: CanvasRenderingContext2D, size: number, rng: FixedSeed): void {
    const gridSize = 8;
    const cellSize = size / gridSize;
    
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = col * cellSize;
        const y = row * cellSize;
        
        if (rng.nextFloat() > 0.5) {
          ctx.strokeRect(x + 5, y + 5, cellSize - 10, cellSize - 10);
        } else {
          ctx.beginPath();
          ctx.arc(x + cellSize/2, y + cellSize/2, cellSize * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  private drawStripedPattern(ctx: CanvasRenderingContext2D, size: number, rng: FixedSeed): void {
    const stripes = 10 + Math.floor(rng.nextFloat() * 10);
    const stripeWidth = size / stripes;
    
    for (let i = 0; i < stripes; i += 2) {
      ctx.fillRect(i * stripeWidth, 0, stripeWidth * 0.8, size);
    }
  }

  private drawDottedPattern(ctx: CanvasRenderingContext2D, size: number, rng: FixedSeed): void {
    const dotsPerRow = 15;
    const dotSpacing = size / dotsPerRow;
    
    for (let row = 0; row < dotsPerRow; row++) {
      for (let col = 0; col < dotsPerRow; col++) {
        if ((row + col) % 2 === 0) {
          const x = col * dotSpacing + dotSpacing / 2;
          const y = row * dotSpacing + dotSpacing / 2;
          const radius = dotSpacing * 0.2;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private generateRoughnessMap(material: any, params: CeramicParams, rng: FixedSeed): void {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const baseRoughness = material.roughness || 0.2;
    const grayscale = Math.floor(baseRoughness * 255);
    
    ctx.fillStyle = `rgb(${grayscale}, ${grayscale}, ${grayscale})`;
    ctx.fillRect(0, 0, size, size);
    
    // Add variation
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 100, y / 100, 0) * 30;
        const value = Math.max(0, Math.min(255, grayscale + n));
        ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    
    material.roughnessMap = new CanvasTexture(canvas);
  }

  private applyEdgeWear(material: any, params: CeramicParams, rng: FixedSeed): void {
    // Edge wear would be applied via AO map or vertex colors in actual implementation
    // For now, we adjust roughness to simulate worn edges
    material.roughness = Math.min(1.0, material.roughness + params.edgeWear * 0.3);
  }

  private applyDirt(material: any, params: CeramicParams, rng: FixedSeed): void {
    // Dirt accumulation affects AO and color
    const dirtColor = new Color(0x3d2817);
    const baseColor = params.color.clone().lerp(dirtColor, params.dirtAccumulation * 0.3);
    
    if (material.map) {
      // In a full implementation, we'd blend textures here
      material.color = baseColor;
    }
  }

  private applyTileGrout(material: any, params: CeramicParams, rng: FixedSeed): void {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const tileSize = params.tileSize || 0.3;
    const groutWidth = params.tileGroutWidth || 0.02;
    const scale = size / tileSize;
    const groutPixels = groutWidth * scale;
    
    // Fill with tile color
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    
    // Draw grout lines
    ctx.strokeStyle = `#${params.tileGroutColor?.getHexString() || '888888'}`;
    ctx.lineWidth = groutPixels;
    
    const step = size / (size / tileSize / tileSize);
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    
    material.map = new CanvasTexture(canvas);
  }

  private generateNormalMap(params: CeramicParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return new CanvasTexture(canvas);
    
    // Generate subtle normal variation for ceramic surface
    ctx.fillStyle = '#8080ff'; // Neutral normal map color
    ctx.fillRect(0, 0, size, size);
    
    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin(x / 50, y / 50, 0) * 10;
        const r = 128 + n;
        const g = 128 + n;
        ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    
    return new CanvasTexture(canvas);
  }

  private generateAOMap(params: CeramicParams, rng: FixedSeed): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return new CanvasTexture(canvas);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Add subtle AO for surface details
    if (params.patternType !== 'none' || params.edgeWear > 0) {
      const noise = new Noise3D(rng.seed);
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const n = noise.perlin(x / 80, y / 80, 1) * 0.1;
          const value = Math.max(200, Math.floor(255 * (1 - n)));
          ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    
    return new CanvasTexture(canvas);
  }

  private createRoughnessTexture(params: CeramicParams, rng: FixedSeed): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return new CanvasTexture(canvas);
    
    const baseValue = Math.floor((material?.roughness || 0.2) * 255);
    ctx.fillStyle = `rgb(${baseValue}, ${baseValue}, ${baseValue})`;
    ctx.fillRect(0, 0, size, size);
    
    return new CanvasTexture(canvas);
  }

  getVariations(count: number): CeramicParams[] {
    const variations: CeramicParams[] = [];
    const types: CeramicParams['type'][] = ['porcelain', 'stoneware', 'earthenware', 'terracotta', 'tile'];
    const glazeTypes: CeramicParams['glazeType'][] = ['glossy', 'matte', 'satin', 'crackle'];
    const patternTypes: CeramicParams['patternType'][] = ['none', 'floral', 'geometric', 'striped', 'dotted'];
    
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat(), 0.3, 0.5 + this.rng.nextFloat() * 0.3),
        glazeType: glazeTypes[this.rng.nextInt(0, glazeTypes.length - 1)],
        glazeThickness: 0.5 + this.rng.nextFloat() * 0.5,
        surfaceRoughness: this.rng.nextFloat() * 0.5,
        patternType: patternTypes[this.rng.nextInt(0, patternTypes.length - 1)],
        patternIntensity: this.rng.nextFloat(),
        edgeWear: this.rng.nextFloat() * 0.3,
        dirtAccumulation: this.rng.nextFloat() * 0.2,
        tileGroutWidth: 0.01 + this.rng.nextFloat() * 0.03,
        tileGroutColor: new Color().setHSL(this.rng.nextFloat(), 0.1, 0.5),
        tileSize: 0.2 + this.rng.nextFloat() * 0.4,
      });
    }
    
    return variations;
  }
}

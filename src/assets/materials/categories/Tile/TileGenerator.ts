/**
 * Tile Material Generator - Tile grid with grout lines
 * Supports ceramic, stone, and mosaic tiles with various patterns
 */
import { Color, Texture, CanvasTexture, MeshStandardMaterial, RepeatWrapping } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface TileParams {
  [key: string]: unknown;
  type: 'ceramic' | 'stone' | 'mosaic' | 'subway' | 'hexagonal';
  tileColor: Color;
  groutColor: Color;
  tileSize: number;
  groutWidth: number;
  roughness: number;
  pattern: 'straight' | 'herringbone' | 'basketweave' | 'diagonal' | 'offset';
  edgeWear: number;
  surfaceVariation: number;
}

export class TileGenerator extends BaseMaterialGenerator<TileParams> {
  private static readonly DEFAULT_PARAMS: TileParams = {
    type: 'ceramic',
    tileColor: new Color(0xffffff),
    groutColor: new Color(0x9e9e9e),
    tileSize: 0.3,
    groutWidth: 0.02,
    roughness: 0.3,
    pattern: 'straight',
    edgeWear: 0.0,
    surfaceVariation: 0.05,
  };

  constructor() { super(); }
  getDefaultParams(): TileParams { return { ...TileGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshStandardMaterial for tiles
   */
  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0,
    });
  }

  generate(params: Partial<TileParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(TileGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial();

    material.roughness = finalParams.roughness;
    material.metalness = 0.0;
    material.color = finalParams.tileColor;

    // Generate tile grid texture with grout lines
    material.map = this.generateTileTexture(finalParams, rng);
    material.normalMap = this.generateTileNormalMap(finalParams, rng);
    material.roughnessMap = this.generateTileRoughnessMap(finalParams, rng);

    // Edge wear on tiles
    if (finalParams.edgeWear > 0) {
      material.roughness = Math.min(1.0, material.roughness + finalParams.edgeWear * 0.2);
    }

    return {
      material,
      maps: {
        map: material.map,
        roughnessMap: material.roughnessMap,
        normalMap: material.normalMap,
      },
      params: finalParams,
    };
  }

  private generateTileTexture(params: TileParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const tilesPerRow = Math.round(1 / params.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const groutPixels = Math.max(1, Math.floor(params.groutWidth * size));

    // Fill with grout color
    ctx.fillStyle = `#${params.groutColor.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    // Draw tiles based on pattern
    switch (params.pattern) {
      case 'straight':
        this.drawStraightTiles(ctx, size, tilesPerRow, tilePixelSize, groutPixels, params, noise);
        break;
      case 'herringbone':
        this.drawHerringboneTiles(ctx, size, tilePixelSize, groutPixels, params, noise);
        break;
      case 'offset':
        this.drawOffsetTiles(ctx, size, tilesPerRow, tilePixelSize, groutPixels, params, noise);
        break;
      case 'diagonal':
        this.drawDiagonalTiles(ctx, size, tilesPerRow, tilePixelSize, groutPixels, params, noise, rng);
        break;
      case 'basketweave':
        this.drawBasketweaveTiles(ctx, size, tilePixelSize, groutPixels, params, noise);
        break;
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private drawStraightTiles(
    ctx: CanvasRenderingContext2D, size: number, tilesPerRow: number,
    tilePixelSize: number, groutPixels: number, params: TileParams, noise: Noise3D
  ): void {
    for (let row = 0; row < tilesPerRow; row++) {
      for (let col = 0; col < tilesPerRow; col++) {
        const x = col * tilePixelSize + groutPixels / 2;
        const y = row * tilePixelSize + groutPixels / 2;
        const w = tilePixelSize - groutPixels;
        const h = tilePixelSize - groutPixels;

        const n = noise.perlin(row * 0.5, col * 0.5, 0) * params.surfaceVariation;
        const tileColor = params.tileColor.clone().offsetHSL(0, 0, n);
        ctx.fillStyle = `#${tileColor.getHexString()}`;
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  private drawOffsetTiles(
    ctx: CanvasRenderingContext2D, size: number, tilesPerRow: number,
    tilePixelSize: number, groutPixels: number, params: TileParams, noise: Noise3D
  ): void {
    for (let row = 0; row < tilesPerRow; row++) {
      const offset = (row % 2) * tilePixelSize / 2;
      for (let col = -1; col < tilesPerRow + 1; col++) {
        const x = col * tilePixelSize + offset + groutPixels / 2;
        const y = row * tilePixelSize + groutPixels / 2;
        const w = tilePixelSize - groutPixels;
        const h = tilePixelSize - groutPixels;

        const n = noise.perlin(row * 0.5, col * 0.5, 0) * params.surfaceVariation;
        const tileColor = params.tileColor.clone().offsetHSL(0, 0, n);
        ctx.fillStyle = `#${tileColor.getHexString()}`;
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  private drawHerringboneTiles(
    ctx: CanvasRenderingContext2D, size: number, tilePixelSize: number,
    groutPixels: number, params: TileParams, noise: Noise3D
  ): void {
    const halfTile = tilePixelSize / 2;
    for (let row = 0; row < size / halfTile + 1; row++) {
      for (let col = 0; col < size / halfTile + 1; col++) {
        const isVertical = (row + col) % 2 === 0;
        const x = col * halfTile + groutPixels / 2;
        const y = row * halfTile + groutPixels / 2;

        const n = noise.perlin(row * 0.3, col * 0.3, 0) * params.surfaceVariation;
        const tileColor = params.tileColor.clone().offsetHSL(0, 0, n);
        ctx.fillStyle = `#${tileColor.getHexString()}`;

        if (isVertical) {
          ctx.fillRect(x, y, halfTile - groutPixels, tilePixelSize - groutPixels);
        } else {
          ctx.fillRect(x, y, tilePixelSize - groutPixels, halfTile - groutPixels);
        }
      }
    }
  }

  private drawDiagonalTiles(
    ctx: CanvasRenderingContext2D, size: number, tilesPerRow: number,
    tilePixelSize: number, groutPixels: number, params: TileParams, noise: Noise3D, rng: SeededRandom
  ): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-size * 1.5 / 2, -size * 1.5 / 2);

    const diagTiles = tilesPerRow * 2;
    const diagSize = (size * 1.5) / diagTiles;

    for (let row = 0; row < diagTiles; row++) {
      for (let col = 0; col < diagTiles; col++) {
        const x = col * diagSize + groutPixels / 2;
        const y = row * diagSize + groutPixels / 2;

        const n = noise.perlin(row * 0.3, col * 0.3, 0) * params.surfaceVariation;
        const tileColor = params.tileColor.clone().offsetHSL(0, 0, n);
        ctx.fillStyle = `#${tileColor.getHexString()}`;
        ctx.fillRect(x, y, diagSize - groutPixels, diagSize - groutPixels);
      }
    }
    ctx.restore();
  }

  private drawBasketweaveTiles(
    ctx: CanvasRenderingContext2D, size: number, tilePixelSize: number,
    groutPixels: number, params: TileParams, noise: Noise3D
  ): void {
    const unitSize = tilePixelSize * 2;
    for (let row = 0; row < size / unitSize + 1; row++) {
      for (let col = 0; col < size / unitSize + 1; col++) {
        const baseX = col * unitSize;
        const baseY = row * unitSize;
        const isHorizontal = (row + col) % 2 === 0;

        const n = noise.perlin(row * 0.3, col * 0.3, 0) * params.surfaceVariation;
        const tileColor = params.tileColor.clone().offsetHSL(0, 0, n);
        ctx.fillStyle = `#${tileColor.getHexString()}`;

        if (isHorizontal) {
          ctx.fillRect(baseX + groutPixels / 2, baseY + groutPixels / 2,
            unitSize - groutPixels, tilePixelSize - groutPixels);
        } else {
          ctx.fillRect(baseX + groutPixels / 2, baseY + groutPixels / 2,
            tilePixelSize - groutPixels, unitSize - groutPixels);
        }
      }
    }
  }

  private generateTileNormalMap(params: TileParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Grout lines appear as indentations in the normal map
    const tilesPerRow = Math.round(1 / params.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const groutPixels = Math.max(1, Math.floor(params.groutWidth * size));

    for (let row = 0; row < tilesPerRow; row++) {
      for (let col = 0; col < tilesPerRow; col++) {
        const x = col * tilePixelSize;
        const y = row * tilePixelSize;
        const halfGrout = groutPixels / 2;

        // Top edge
        ctx.fillStyle = '#6060ff';
        ctx.fillRect(x, y, tilePixelSize, halfGrout);
        // Left edge
        ctx.fillRect(x, y, halfGrout, tilePixelSize);
        // Bottom edge
        ctx.fillStyle = '#a0a0ff';
        ctx.fillRect(x, y + tilePixelSize - halfGrout, tilePixelSize, halfGrout);
        // Right edge
        ctx.fillRect(x + tilePixelSize - halfGrout, y, halfGrout, tilePixelSize);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateTileRoughnessMap(params: TileParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Tile surface is smoother than grout
    const tileValue = Math.floor(params.roughness * 255);
    const groutValue = Math.min(255, tileValue + 60);

    ctx.fillStyle = `rgb(${tileValue},${tileValue},${tileValue})`;
    ctx.fillRect(0, 0, size, size);

    // Draw grout lines with higher roughness
    const tilesPerRow = Math.round(1 / params.tileSize);
    const tilePixelSize = size / tilesPerRow;
    const groutPixels = Math.max(1, Math.floor(params.groutWidth * size));

    ctx.fillStyle = `rgb(${groutValue},${groutValue},${groutValue})`;
    for (let i = 0; i <= tilesPerRow; i++) {
      ctx.fillRect(i * tilePixelSize - groutPixels / 2, 0, groutPixels, size);
      ctx.fillRect(0, i * tilePixelSize - groutPixels / 2, size, groutPixels);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  getVariations(count: number): TileParams[] {
    const variations: TileParams[] = [];
    const types: TileParams['type'][] = ['ceramic', 'stone', 'mosaic', 'subway', 'hexagonal'];
    const patterns: TileParams['pattern'][] = ['straight', 'herringbone', 'basketweave', 'diagonal', 'offset'];

    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        tileColor: new Color().setHSL(this.rng.nextFloat(), 0.2 + this.rng.nextFloat() * 0.3, 0.5 + this.rng.nextFloat() * 0.4),
        groutColor: new Color().setHSL(this.rng.nextFloat(), 0.1, 0.3 + this.rng.nextFloat() * 0.3),
        tileSize: 0.1 + this.rng.nextFloat() * 0.5,
        groutWidth: 0.005 + this.rng.nextFloat() * 0.03,
        roughness: 0.2 + this.rng.nextFloat() * 0.4,
        pattern: patterns[this.rng.nextInt(0, patterns.length - 1)],
        edgeWear: this.rng.nextFloat() * 0.3,
        surfaceVariation: 0.02 + this.rng.nextFloat() * 0.08,
      });
    }
    return variations;
  }
}

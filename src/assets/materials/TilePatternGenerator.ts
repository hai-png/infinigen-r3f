/**
 * Tile Pattern Generator for InfiniGen R3F Port
 * 
 * Generates procedural tile patterns including geometric patterns,
 * decorative tiles, wood flooring, and mosaics.
 * 
 * Features:
 * - Hexagon, herringbone, basket weave patterns
 * - Ceramic tile layouts (subway, Moroccan, Portuguese)
 * - Wood parquet and plank variations
 * - Mosaic tile systems
 * - Grout control (color, width, depth)
 * - Wear and distress effects
 * 
 * @author InfiniGen R3F Team
 * @version 1.0.0
 */

import { CanvasTexture, Color, Vector2 } from 'three';

/**
 * Geometric pattern types
 */
export enum GeometricPatternType {
  HEXAGON = 'hexagon',
  HERRINGBONE_45 = 'herringbone_45',
  HERRINGBONE_90 = 'herringbone_90',
  DOUBLE_HERRINGBONE = 'double_herringbone',
  BASKET_WEAVE = 'basket_weave',
  BASKET_WEAVE_DIAGONAL = 'basket_weave_diagonal',
  DIAMOND = 'diamond',
  STAR = 'star',
  SUBWAY = 'subway',
  MOROCCAN = 'moroccan',
  PARQUET = 'parquet'
}

/**
 * Tile material types
 */
export enum TileMaterialType {
  CERAMIC = 'ceramic',
  PORCELAIN = 'porcelain',
  STONE = 'stone',
  WOOD = 'wood',
  GLASS = 'glass',
  METAL = 'metal',
  CEMENT = 'cement'
}

/**
 * Configuration for tile pattern generation
 */
export interface TilePatternConfig {
  // Pattern settings
  patternType: GeometricPatternType;
  tileSize: number;
  tileAspectRatio?: number;
  
  // Grout settings
  groutWidth: number;
  groutColor: Color;
  groutDepth?: number;
  
  // Material settings
  materialType: TileMaterialType;
  baseColor: Color;
  variationColor?: Color;
  colorVariationStrength?: number;
  
  // Surface properties
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  
  // Wear and aging
  wearAmount?: number;
  dirtAmount?: number;
  edgeWear?: boolean;
  
  // Tiling
  repeatX?: number;
  repeatY?: number;
  
  // Randomization seed
  seed?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<TilePatternConfig, 'patternType'> = {
  tileSize: 0.3,
  tileAspectRatio: 1.0,
  groutWidth: 0.005,
  groutColor: new Color(0x808080),
  groutDepth: 0.002,
  materialType: TileMaterialType.CERAMIC,
  baseColor: new Color(0xd4c4b0),
  colorVariationStrength: 0.15,
  roughness: 0.6,
  metalness: 0.0,
  normalScale: 1.0,
  wearAmount: 0.0,
  dirtAmount: 0.0,
  edgeWear: false,
  repeatX: 4,
  repeatY: 4,
  seed: Math.random()
};

/**
 * Tile Pattern Generator Class
 * 
 * Generates procedural tile patterns with customizable parameters
 */
export class TilePatternGenerator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentConfig: TilePatternConfig | null = null;
  
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  /**
   * Generate a complete tile pattern texture set
   */
  public generate(config: TilePatternConfig): {
    baseColor: CanvasTexture;
    roughness: CanvasTexture;
    normal: CanvasTexture;
    ao: CanvasTexture;
    height: CanvasTexture;
  } {
    this.currentConfig = { ...DEFAULT_CONFIG, ...config };
    
    const size = 1024;
    this.canvas.width = size;
    this.canvas.height = size;
    
    // Generate base color map
    this.drawPattern(this.ctx, size, size);
    const baseColorMap = this.createTexture();
    
    // Generate roughness map
    this.generateRoughnessMap(size);
    const roughnessMap = this.createTexture();
    
    // Generate normal map
    this.generateNormalMap(size);
    const normalMap = this.createTexture();
    
    // Generate AO map
    this.generateAOMap(size);
    const aoMap = this.createTexture();
    
    // Generate height map
    this.generateHeightMap(size);
    const heightMap = this.createTexture();
    
    return {
      baseColor: baseColorMap,
      roughness: roughnessMap,
      normal: normalMap,
      ao: aoMap,
      height: heightMap
    };
  }
  
  /**
   * Draw the main pattern based on type
   */
  private drawPattern(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const config = this.currentConfig!;
    const rng = this.createSeededRandom(config.seed || Math.random());
    
    ctx.fillStyle = this.colorToHex(config.groutColor);
    ctx.fillRect(0, 0, width, height);
    
    switch (config.patternType) {
      case GeometricPatternType.HEXAGON:
        this.drawHexagonPattern(ctx, width, height, rng);
        break;
      case GeometricPatternType.HERRINGBONE_45:
        this.drawHerringbonePattern(ctx, width, height, 45, rng);
        break;
      case GeometricPatternType.HERRINGBONE_90:
        this.drawHerringbonePattern(ctx, width, height, 90, rng);
        break;
      case GeometricPatternType.DOUBLE_HERRINGBONE:
        this.drawDoubleHerringbone(ctx, width, height, rng);
        break;
      case GeometricPatternType.BASKET_WEAVE:
        this.drawBasketWeave(ctx, width, height, false, rng);
        break;
      case GeometricPatternType.BASKET_WEAVE_DIAGONAL:
        this.drawBasketWeave(ctx, width, height, true, rng);
        break;
      case GeometricPatternType.DIAMOND:
        this.drawDiamondPattern(ctx, width, height, rng);
        break;
      case GeometricPatternType.STAR:
        this.drawStarPattern(ctx, width, height, rng);
        break;
      case GeometricPatternType.SUBWAY:
        this.drawSubwayPattern(ctx, width, height, rng);
        break;
      case GeometricPatternType.MOROCCAN:
        this.drawMoroccanPattern(ctx, width, height, rng);
        break;
      case GeometricPatternType.PARQUET:
        this.drawParquetPattern(ctx, width, height, rng);
        break;
    }
    
    // Apply wear effects if configured
    if (config.wearAmount && config.wearAmount > 0) {
      this.applyWearEffects(ctx, width, height, rng);
    }
    
    // Apply dirt if configured
    if (config.dirtAmount && config.dirtAmount > 0) {
      this.applyDirt(ctx, width, height, rng);
    }
  }
  
  /**
   * Draw hexagon tile pattern
   */
  private drawHexagonPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const tileRadius = config.tileSize * 0.5;
    const horizontalSpacing = tileRadius * Math.sqrt(3);
    const verticalSpacing = tileRadius * 1.5;
    
    const cols = Math.ceil(width / horizontalSpacing) + 2;
    const rows = Math.ceil(height / verticalSpacing) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * horizontalSpacing + (row % 2 === 0 ? 0 : horizontalSpacing / 2);
        const y = row * verticalSpacing;
        
        // Get tile color with variation
        const tileColor = this.getTileColor(rng);
        ctx.fillStyle = tileColor;
        
        // Draw hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = x + tileRadius * Math.cos(angle);
          const hy = y + tileRadius * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(hx, hy);
          } else {
            ctx.lineTo(hx, hy);
          }
        }
        ctx.closePath();
        ctx.fill();
        
        // Add subtle texture to tile
        if (config.materialType === TileMaterialType.STONE) {
          this.addStoneTexture(ctx, x, y, tileRadius * 2, rng);
        } else if (config.materialType === TileMaterialType.WOOD) {
          this.addWoodGrain(ctx, x, y, tileRadius * 2, rng);
        }
      }
    }
  }
  
  /**
   * Draw herringbone pattern
   */
  private drawHerringbonePattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    angle: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const tileWidth = config.tileSize;
    const tileHeight = config.tileSize * (config.tileAspectRatio || 0.5);
    
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    const cols = Math.ceil(width / tileWidth) + 2;
    const rows = Math.ceil(height / tileHeight) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const baseX = col * tileWidth;
        const baseY = row * tileHeight;
        
        // Alternate orientation
        const isAlternate = (row + col) % 2 === 0;
        const rotationAngle = isAlternate ? angleRad : angleRad + Math.PI / 2;
        
        this.drawRotatedTile(ctx, baseX, baseY, tileWidth, tileHeight, rotationAngle, rng);
      }
    }
  }
  
  /**
   * Draw double herringbone pattern
   */
  private drawDoubleHerringbone(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const tileWidth = config.tileSize;
    const tileHeight = config.tileSize * (config.tileAspectRatio || 0.5);
    
    const pairWidth = tileWidth * 2;
    const pairHeight = tileHeight * 2;
    
    const cols = Math.ceil(width / pairWidth) + 2;
    const rows = Math.ceil(height / pairHeight) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const baseX = col * pairWidth;
        const baseY = row * pairHeight;
        
        // Draw pair of tiles at 45 degrees
        this.drawRotatedTile(ctx, baseX, baseY, tileWidth, tileHeight, Math.PI / 4, rng);
        this.drawRotatedTile(ctx, baseX + tileWidth, baseY, tileWidth, tileHeight, Math.PI / 4, rng);
        
        // Draw pair of tiles at -45 degrees
        this.drawRotatedTile(ctx, baseX, baseY + tileHeight, tileWidth, tileHeight, -Math.PI / 4, rng);
        this.drawRotatedTile(ctx, baseX + tileWidth, baseY + tileHeight, tileWidth, tileHeight, -Math.PI / 4, rng);
      }
    }
  }
  
  /**
   * Draw basket weave pattern
   */
  private drawBasketWeave(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    diagonal: boolean,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const unitSize = config.tileSize * 2;
    
    const cols = Math.ceil(width / unitSize) + 2;
    const rows = Math.ceil(height / unitSize) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const baseX = col * unitSize;
        const baseY = row * unitSize;
        
        const isHorizontal = (row + col) % 2 === 0;
        
        if (isHorizontal) {
          // Horizontal pairs
          this.drawTile(ctx, baseX, baseY, unitSize / 2, unitSize / 4, rng);
          this.drawTile(ctx, baseX + unitSize / 2, baseY, unitSize / 2, unitSize / 4, rng);
          this.drawTile(ctx, baseX, baseY + unitSize / 4, unitSize / 2, unitSize / 4, rng);
          this.drawTile(ctx, baseX + unitSize / 2, baseY + unitSize / 4, unitSize / 2, unitSize / 4, rng);
        } else {
          // Vertical pairs
          this.drawTile(ctx, baseX, baseY, unitSize / 4, unitSize / 2, rng);
          this.drawTile(ctx, baseX + unitSize / 4, baseY, unitSize / 4, unitSize / 2, rng);
          this.drawTile(ctx, baseX, baseY + unitSize / 2, unitSize / 4, unitSize / 2, rng);
          this.drawTile(ctx, baseX + unitSize / 4, baseY + unitSize / 2, unitSize / 4, unitSize / 2, rng);
        }
      }
    }
  }
  
  /**
   * Draw diamond pattern
   */
  private drawDiamondPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const diamondSize = config.tileSize * Math.SQRT2;
    
    const cols = Math.ceil(width / diamondSize) + 2;
    const rows = Math.ceil(height / diamondSize) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * diamondSize + (row % 2 === 0 ? 0 : diamondSize / 2);
        const y = row * diamondSize / 2;
        
        const tileColor = this.getTileColor(rng);
        ctx.fillStyle = tileColor;
        
        // Draw diamond (rotated square)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);
        ctx.restore();
        
        // Add material texture
        if (config.materialType === TileMaterialType.STONE) {
          this.addStoneTexture(ctx, x, y, diamondSize, rng);
        }
      }
    }
  }
  
  /**
   * Draw star tessellation pattern
   */
  private drawStarPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const starSize = config.tileSize * 2;
    
    const cols = Math.ceil(width / starSize) + 2;
    const rows = Math.ceil(height / starSize) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * starSize + (row % 2 === 0 ? 0 : starSize / 2);
        const y = row * starSize;
        
        const tileColor = this.getTileColor(rng);
        ctx.fillStyle = tileColor;
        
        // Draw 8-pointed star
        this.drawEightPointedStar(ctx, x, y, starSize / 2, starSize / 6);
        
        // Fill gaps with smaller diamonds
        const gapColor = this.getTileColor(rng);
        ctx.fillStyle = gapColor;
        this.drawDiamondAt(ctx, x + starSize / 2, y, starSize / 4);
        this.drawDiamondAt(ctx, x - starSize / 2, y, starSize / 4);
        this.drawDiamondAt(ctx, x, y + starSize / 2, starSize / 4);
        this.drawDiamondAt(ctx, x, y - starSize / 2, starSize / 4);
      }
    }
  }
  
  /**
   * Draw subway tile pattern
   */
  private drawSubwayPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const tileWidth = config.tileSize * 2;
    const tileHeight = config.tileSize;
    
    const cols = Math.ceil(width / tileWidth) + 2;
    const rows = Math.ceil(height / tileHeight) + 2;
    
    for (let row = -1; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : tileWidth / 2;
      
      for (let col = -1; col < cols; col++) {
        const x = col * tileWidth + offset;
        const y = row * tileHeight;
        
        this.drawTile(ctx, x, y, tileWidth, tileHeight, rng);
      }
    }
  }
  
  /**
   * Draw Moroccan zellige pattern
   */
  private drawMoroccanPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const motifSize = config.tileSize * 3;
    
    const cols = Math.ceil(width / motifSize) + 2;
    const rows = Math.ceil(height / motifSize) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * motifSize;
        const y = row * motifSize;
        
        // Draw central star
        const starColor = this.getTileColor(rng);
        ctx.fillStyle = starColor;
        this.drawTwelvePointedStar(ctx, x + motifSize / 2, y + motifSize / 2, motifSize / 3, motifSize / 8);
        
        // Draw surrounding shapes
        for (let i = 0; i < 4; i++) {
          const angle = (Math.PI / 2) * i;
          const px = x + motifSize / 2 + Math.cos(angle) * motifSize / 3;
          const py = y + motifSize / 2 + Math.sin(angle) * motifSize / 3;
          
          const shapeColor = this.getTileColor(rng);
          ctx.fillStyle = shapeColor;
          this.drawKiteShape(ctx, px, py, motifSize / 6, motifSize / 4, angle);
        }
      }
    }
  }
  
  /**
   * Draw parquet wood flooring pattern
   */
  private drawParquetPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const blockSize = config.tileSize * 1.5;
    
    const cols = Math.ceil(width / blockSize) + 2;
    const rows = Math.ceil(height / blockSize) + 2;
    
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const x = col * blockSize;
        const y = row * blockSize;
        
        const isAlternate = (row + col) % 2 === 0;
        
        if (isAlternate) {
          // Chevron pattern
          this.drawChevronBlock(ctx, x, y, blockSize, rng);
        } else {
          // Square pattern
          this.drawSquareParquetBlock(ctx, x, y, blockSize, rng);
        }
      }
    }
  }
  
  /**
   * Helper: Draw a single tile with material texture
   */
  private drawTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const tileColor = this.getTileColor(rng);
    
    ctx.fillStyle = tileColor;
    ctx.fillRect(x, y, width, height);
    
    // Add material-specific texture
    switch (config.materialType) {
      case TileMaterialType.STONE:
        this.addStoneTexture(ctx, x + width / 2, y + height / 2, Math.min(width, height), rng);
        break;
      case TileMaterialType.WOOD:
        this.addWoodGrain(ctx, x + width / 2, y + height / 2, Math.min(width, height), rng);
        break;
      case TileMaterialType.CERAMIC:
      case TileMaterialType.PORCELAIN:
        this.addCeramicGlaze(ctx, x + width / 2, y + height / 2, Math.min(width, height), rng);
        break;
    }
    
    // Apply edge wear if enabled
    if (config.edgeWear) {
      this.addEdgeWear(ctx, x, y, width, height, rng);
    }
  }
  
  /**
   * Helper: Draw rotated tile
   */
  private drawRotatedTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    rng: () => number
  ): void {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(angle);
    this.drawTile(ctx, -width / 2, -height / 2, width, height, rng);
    ctx.restore();
  }
  
  /**
   * Helper: Draw 8-pointed star
   */
  private drawEightPointedStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI / 8) * i;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Helper: Draw 12-pointed star
   */
  private drawTwelvePointedStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number
  ): void {
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI / 12) * i;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Helper: Draw diamond shape at position
   */
  private drawDiamondAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Helper: Draw kite shape
   */
  private drawKiteShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    ctx.beginPath();
    ctx.moveTo(0, -height / 2);
    ctx.lineTo(width / 2, 0);
    ctx.lineTo(0, height / 2);
    ctx.lineTo(-width / 2, 0);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
  
  /**
   * Helper: Draw chevron parquet block
   */
  private drawChevronBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rng: () => number
  ): void {
    const plankWidth = size / 6;
    
    for (let i = 0; i < 6; i++) {
      const plankColor = this.getWoodColor(rng);
      ctx.fillStyle = plankColor;
      
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.rotate(Math.PI / 4);
      
      const offsetX = (i - 2.5) * plankWidth;
      ctx.fillRect(offsetX - plankWidth / 2, -size / 2, plankWidth, size);
      
      ctx.restore();
    }
  }
  
  /**
   * Helper: Draw square parquet block
   */
  private drawSquareParquetBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rng: () => number
  ): void {
    const subSize = size / 3;
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const isCenter = row === 1 && col === 1;
        const plankColor = this.getWoodColor(rng);
        ctx.fillStyle = plankColor;
        
        const px = x + col * subSize;
        const py = y + row * subSize;
        
        if (isCenter) {
          ctx.fillRect(px, py, subSize, subSize);
        } else {
          // Alternating direction
          const isHorizontal = (row + col) % 2 === 0;
          if (isHorizontal) {
            ctx.fillRect(px, py, subSize, subSize / 3);
            ctx.fillRect(px, py + subSize / 3, subSize, subSize / 3);
            ctx.fillRect(px, py + 2 * subSize / 3, subSize, subSize / 3);
          } else {
            ctx.fillRect(px, py, subSize / 3, subSize);
            ctx.fillRect(px + subSize / 3, py, subSize / 3, subSize);
            ctx.fillRect(px + 2 * subSize / 3, py, subSize / 3, subSize);
          }
        }
      }
    }
  }
  
  /**
   * Add stone texture to area
   */
  private addStoneTexture(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const noiseScale = 0.05;
    
    ctx.save();
    ctx.globalAlpha = 0.1;
    
    for (let i = 0; i < 50; i++) {
      const nx = x + (rng() - 0.5) * size;
      const ny = y + (rng() - 0.5) * size;
      const nr = size * (0.02 + rng() * 0.05);
      
      const shade = 0.3 + rng() * 0.4;
      ctx.fillStyle = `rgba(${shade * 255}, ${shade * 255}, ${shade * 255}, 0.3)`;
      
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Add wood grain to area
   */
  private addWoodGrain(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rng: () => number
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.15;
    
    const grainCount = Math.floor(size / 3);
    for (let i = 0; i < grainCount; i++) {
      const gy = y - size / 2 + (i / grainCount) * size;
      
      ctx.strokeStyle = `rgba(60, 40, 20, ${0.1 + rng() * 0.1})`;
      ctx.lineWidth = 1 + rng() * 2;
      
      ctx.beginPath();
      ctx.moveTo(x - size / 2, gy);
      
      let prevX = x - size / 2;
      let prevY = gy;
      
      for (let j = 0; j < 20; j++) {
        const gx = prevX + size / 20;
        const gy2 = prevY + (rng() - 0.5) * 5;
        ctx.lineTo(gx, gy2);
        prevX = gx;
        prevY = gy2;
      }
      
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  /**
   * Add ceramic glaze effect
   */
  private addCeramicGlaze(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    rng: () => number
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.08;
    
    // Subtle color variations in glaze
    for (let i = 0; i < 20; i++) {
      const nx = x + (rng() - 0.5) * size * 0.8;
      const ny = y + (rng() - 0.5) * size * 0.8;
      const nr = size * (0.05 + rng() * 0.1);
      
      const hueShift = (rng() - 0.5) * 20;
      ctx.fillStyle = `hsla(${200 + hueShift}, 30%, 70%, 0.3)`;
      
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Add edge wear effect
   */
  private addEdgeWear(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    rng: () => number
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.3;
    
    const edgeWidth = Math.min(width, height) * 0.05;
    
    // Top edge
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x, y, width, edgeWidth);
    
    // Bottom edge
    ctx.fillRect(x, y + height - edgeWidth, width, edgeWidth);
    
    // Left edge
    ctx.fillRect(x, y, edgeWidth, height);
    
    // Right edge
    ctx.fillRect(x + width - edgeWidth, y, edgeWidth, height);
    
    // Random chips
    for (let i = 0; i < 5; i++) {
      const chipX = x + rng() * width;
      const chipY = y + rng() * height;
      const chipSize = edgeWidth * (0.5 + rng());
      
      ctx.beginPath();
      ctx.arc(chipX, chipY, chipSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Apply wear effects across pattern
   */
  private applyWearEffects(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const wearIntensity = config.wearAmount || 0;
    
    ctx.save();
    ctx.globalAlpha = wearIntensity * 0.3;
    
    // Scratches
    for (let i = 0; i < 30 * wearIntensity; i++) {
      const sx = rng() * width;
      const sy = rng() * height;
      const slength = 10 + rng() * 50;
      const sangle = rng() * Math.PI * 2;
      
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 0.5 + rng();
      
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(
        sx + Math.cos(sangle) * slength,
        sy + Math.sin(sangle) * slength
      );
      ctx.stroke();
    }
    
    // Scuffs
    for (let i = 0; i < 20 * wearIntensity; i++) {
      const cx = rng() * width;
      const cy = rng() * height;
      const cr = 2 + rng() * 8;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Apply dirt accumulation
   */
  private applyDirt(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rng: () => number
  ): void {
    const config = this.currentConfig!;
    const dirtIntensity = config.dirtAmount || 0;
    
    ctx.save();
    ctx.globalAlpha = dirtIntensity * 0.4;
    ctx.globalCompositeOperation = 'multiply';
    
    // Dirt speckles
    for (let i = 0; i < 200 * dirtIntensity; i++) {
      const dx = rng() * width;
      const dy = rng() * height;
      const dr = 0.5 + rng() * 2;
      
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  /**
   * Generate roughness map
   */
  private generateRoughnessMap(size: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      const roughness = config.roughness || 0.5;
      
      // Adjust roughness based on material type
      let adjustedRoughness = roughness;
      if (config.materialType === TileMaterialType.GLASS) {
        adjustedRoughness *= 0.3;
      } else if (config.materialType === TileMaterialType.METAL) {
        adjustedRoughness *= 0.5;
      } else if (config.materialType === TileMaterialType.PORCELAIN) {
        adjustedRoughness *= 0.6;
      }
      
      const value = Math.min(255, Math.max(0, (luminance * adjustedRoughness + (1 - adjustedRoughness)) * 255));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate normal map (simplified)
   */
  private generateNormalMap(size: number): void {
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    // Create simple bump from grayscale
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      
      // Encode as normal map (flat surface with slight variation)
      data[i] = 128 + luminance * 20; // R
      data[i + 1] = 128 + luminance * 20; // G
      data[i + 2] = 255; // B (pointing up)
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate ambient occlusion map
   */
  private generateAOMap(size: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      
      // Darken grout areas
      const isGrout = luminance < 0.4;
      const aoValue = isGrout ? 0.6 : 0.9 + luminance * 0.1;
      
      const value = Math.min(255, Math.max(0, aoValue * 255));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Generate height/displacement map
   */
  private generateHeightMap(size: number): void {
    const config = this.currentConfig!;
    const imageData = this.ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      
      // Grout is lower, tiles are higher
      const heightValue = luminance < 0.4 ? 0.3 : 0.7 + luminance * 0.3;
      
      const value = Math.min(255, Math.max(0, heightValue * 255));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
    
    this.ctx.putImageData(imageData, 0, 0);
  }
  
  /**
   * Get tile color with variation
   */
  private getTileColor(rng: () => number): string {
    const config = this.currentConfig!;
    const variationStrength = config.colorVariationStrength || 0.15;
    
    const r = config.baseColor.r;
    const g = config.baseColor.g;
    const b = config.baseColor.b;
    
    const variation = (rng() - 0.5) * 2 * variationStrength;
    
    const nr = Math.min(1, Math.max(0, r + variation));
    const ng = Math.min(1, Math.max(0, g + variation));
    const nb = Math.min(1, Math.max(0, b + variation));
    
    return `rgb(${Math.round(nr * 255)}, ${Math.round(ng * 255)}, ${Math.round(nb * 255)})`;
  }
  
  /**
   * Get wood color with natural variation
   */
  private getWoodColor(rng: () => number): string {
    const config = this.currentConfig!;
    const baseR = config.baseColor.r;
    const baseG = config.baseColor.g;
    const baseB = config.baseColor.b;
    
    const variation = (rng() - 0.5) * 0.3;
    
    const r = Math.min(1, Math.max(0, baseR + variation));
    const g = Math.min(1, Math.max(0, baseG + variation * 0.7));
    const b = Math.min(1, Math.max(0, baseB + variation * 0.5));
    
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  
  /**
   * Create texture from canvas
   */
  private createTexture(): CanvasTexture {
    const texture = new CanvasTexture(this.canvas);
    texture.wrapS = texture.wrapT = 1000; // RepeatWrapping
    texture.flipY = false;
    return texture;
  }
  
  /**
   * Convert Color to hex string
   */
  private colorToHex(color: Color): string {
    return `#${color.getHexString()}`;
  }
  
  /**
   * Create seeded random number generator
   */
  private createSeededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  }
}

/**
 * Preset configurations for common tile patterns
 */
export const TilePresets = {
  // Classic bathroom tiles
  classicWhiteSubway: {
    patternType: GeometricPatternType.SUBWAY,
    tileSize: 0.15,
    tileAspectRatio: 0.5,
    groutWidth: 0.003,
    groutColor: new Color(0xffffff),
    materialType: TileMaterialType.CERAMIC,
    baseColor: new Color(0xf5f5f5),
    roughness: 0.4
  },
  
  // Kitchen floor
  checkeredFloor: {
    patternType: GeometricPatternType.DIAMOND,
    tileSize: 0.2,
    groutWidth: 0.004,
    groutColor: new Color(0x404040),
    materialType: TileMaterialType.CERAMIC,
    baseColor: new Color(0xe8e8e8),
    variationColor: new Color(0x202020),
    roughness: 0.5
  },
  
  // Terracotta tiles
  terracottaHex: {
    patternType: GeometricPatternType.HEXAGON,
    tileSize: 0.1,
    groutWidth: 0.005,
    groutColor: new Color(0xc4a574),
    materialType: TileMaterialType.CERAMIC,
    baseColor: new Color(0xd46a4a),
    colorVariationStrength: 0.2,
    roughness: 0.7
  },
  
  // Marble bathroom
  marbleHerringbone: {
    patternType: GeometricPatternType.HERRINGBONE_45,
    tileSize: 0.1,
    tileAspectRatio: 0.25,
    groutWidth: 0.002,
    groutColor: new Color(0xd0d0d0),
    materialType: TileMaterialType.STONE,
    baseColor: new Color(0xf0f0f0),
    colorVariationStrength: 0.1,
    roughness: 0.3
  },
  
  // Wooden parquet
  oakParquet: {
    patternType: GeometricPatternType.PARQUET,
    tileSize: 0.25,
    groutWidth: 0.001,
    groutColor: new Color(0x8b6f47),
    materialType: TileMaterialType.WOOD,
    baseColor: new Color(0xc4a574),
    colorVariationStrength: 0.15,
    roughness: 0.6
  },
  
  // Moroccan zellige
  moroccanBlue: {
    patternType: GeometricPatternType.MOROCCAN,
    tileSize: 0.15,
    groutWidth: 0.006,
    groutColor: new Color(0x8b7355),
    materialType: TileMaterialType.CERAMIC,
    baseColor: new Color(0x4a90a4),
    colorVariationStrength: 0.25,
    roughness: 0.5
  },
  
  // Industrial concrete
  concreteLarge: {
    patternType: GeometricPatternType.HERRINGBONE_90,
    tileSize: 0.4,
    tileAspectRatio: 0.5,
    groutWidth: 0.008,
    groutColor: new Color(0x606060),
    materialType: TileMaterialType.CEMENT,
    baseColor: new Color(0x808080),
    colorVariationStrength: 0.1,
    roughness: 0.8,
    wearAmount: 0.3
  },
  
  // Glass mosaic
  glassMosaic: {
    patternType: GeometricPatternType.DIAMOND,
    tileSize: 0.05,
    groutWidth: 0.002,
    groutColor: new Color(0xa0a0a0),
    materialType: TileMaterialType.GLASS,
    baseColor: new Color(0x60a0c0),
    colorVariationStrength: 0.3,
    roughness: 0.1,
    metalness: 0.2
  },
  
  // Aged cobblestone
  agedCobble: {
    patternType: GeometricPatternType.HEXAGON,
    tileSize: 0.15,
    groutWidth: 0.01,
    groutColor: new Color(0x404040),
    materialType: TileMaterialType.STONE,
    baseColor: new Color(0x606060),
    colorVariationStrength: 0.2,
    roughness: 0.9,
    wearAmount: 0.5,
    dirtAmount: 0.3,
    edgeWear: true
  },
  
  // Luxury marble basket weave
  luxuryMarble: {
    patternType: GeometricPatternType.BASKET_WEAVE,
    tileSize: 0.2,
    groutWidth: 0.002,
    groutColor: new Color(0xe0e0e0),
    materialType: TileMaterialType.STONE,
    baseColor: new Color(0xf5f0e8),
    colorVariationStrength: 0.08,
    roughness: 0.25
  }
};

export default TilePatternGenerator;

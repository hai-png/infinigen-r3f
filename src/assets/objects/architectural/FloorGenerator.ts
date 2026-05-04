import { SeededRandom } from '@/core/util/MathUtils';
/**
 * FloorGenerator - Procedural flooring generation
 * FIX: All patterns (herringbone, parquet, basketweave, carpet) now produce distinct geometry
 * Each pattern creates individual plank/tile meshes with proper UVs and slight gaps
 */
import { Group, Mesh, BoxGeometry, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Color, Texture, CanvasTexture, RepeatWrapping } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface FloorParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  thickness: number;
  floorType: 'hardwood' | 'tile' | 'carpet' | 'concrete' | 'laminate';
  pattern: 'plank' | 'parquet' | 'herringbone' | 'basketweave' | 'uniform';
  plankWidth: number;
  plankLength: number;
  tileWidth: number;
  material: string;
  hasBorder: boolean;
  borderWidth: number;
  borderMaterial: string;
}

const DEFAULT_PARAMS: FloorParams = {
  width: 5.0,
  depth: 5.0,
  thickness: 0.05,
  floorType: 'hardwood',
  pattern: 'plank',
  plankWidth: 0.15,
  plankLength: 1.0,
  tileWidth: 0.3,
  material: 'oak',
  hasBorder: false,
  borderWidth: 0.1,
  borderMaterial: 'walnut',
};

export class FloorGenerator extends BaseObjectGenerator<FloorParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): FloorParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<FloorParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, thickness, floorType, pattern, plankWidth, plankLength, tileWidth, hasBorder, borderWidth, material } = finalParams;

    // Base substrate (dark underlayment visible through gaps)
    const underMat = new MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const underGeom = new BoxGeometry(width, thickness * 0.3, depth);
    const underlay = new Mesh(underGeom, underMat);
    underlay.position.set(0, thickness * 0.15, 0);
    underlay.receiveShadow = true;
    underlay.name = 'underlayment';
    group.add(underlay);

    // Generate pattern-specific planks/tiles
    switch (pattern) {
      case 'plank':
        this.addPlankPattern(group, width, depth, thickness, plankWidth, plankLength, material);
        break;
      case 'herringbone':
        this.addHerringbonePattern(group, width, depth, thickness, plankWidth, material);
        break;
      case 'parquet':
        this.addParquetPattern(group, width, depth, thickness, tileWidth, material);
        break;
      case 'basketweave':
        this.addBasketweavePattern(group, width, depth, thickness, plankWidth, material);
        break;
      case 'uniform':
        this.addUniformPattern(group, width, depth, thickness, floorType, material);
        break;
    }

    // Add border if requested
    if (hasBorder) {
      const borderMat = this.getFloorMaterial(floorType, finalParams.borderMaterial);

      const topBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth), borderMat);
      topBorder.position.set(0, thickness / 2, -depth / 2 + borderWidth / 2);
      topBorder.receiveShadow = true;
      topBorder.name = 'border_top';
      group.add(topBorder);

      const bottomBorder = new Mesh(new BoxGeometry(width, thickness, borderWidth), borderMat);
      bottomBorder.position.set(0, thickness / 2, depth / 2 - borderWidth / 2);
      bottomBorder.receiveShadow = true;
      bottomBorder.name = 'border_bottom';
      group.add(bottomBorder);

      const innerDepth = depth - borderWidth * 2;
      const leftBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth), borderMat);
      leftBorder.position.set(-width / 2 + borderWidth / 2, thickness / 2, 0);
      leftBorder.receiveShadow = true;
      leftBorder.name = 'border_left';
      group.add(leftBorder);

      const rightBorder = new Mesh(new BoxGeometry(borderWidth, thickness, innerDepth), borderMat);
      rightBorder.position.set(width / 2 - borderWidth / 2, thickness / 2, 0);
      rightBorder.receiveShadow = true;
      rightBorder.name = 'border_right';
      group.add(rightBorder);
    }

    return group;
  }

  // ===== PLANK: Staggered rows of planks =====
  private addPlankPattern(
    group: Group, width: number, depth: number, thickness: number,
    plankWidth: number, plankLength: number, material: string
  ): void {
    const gap = 0.003;
    const numPlanksZ = Math.ceil(depth / (plankWidth + gap));
    let plankIndex = 0;

    for (let iz = 0; iz < numPlanksZ; iz++) {
      const z = -depth / 2 + iz * (plankWidth + gap) + plankWidth / 2;
      if (z > depth / 2) break;

      // Stagger offset for each row
      const rowOffset = (iz % 3) * (plankLength / 3);
      let x = -width / 2 + rowOffset;
      let firstInRow = true;

      while (x < width / 2) {
        const remainingWidth = width / 2 - x;
        const currentLength = firstInRow && rowOffset > 0
          ? Math.min(rowOffset, remainingWidth)
          : Math.min(plankLength, remainingWidth);

        if (currentLength < 0.05) break;

        const actualWidth = Math.min(plankWidth, depth / 2 - z + plankWidth / 2);
        if (actualWidth <= 0) break;

        const plankMat = this.getVariedFloorMaterial(material, plankIndex);
        const plankGeo = new BoxGeometry(currentLength - gap, thickness, actualWidth - gap);
        const plank = new Mesh(plankGeo, plankMat);
        plank.position.set(x + currentLength / 2, thickness / 2 + thickness * 0.15, z);
        plank.receiveShadow = true;
        plank.castShadow = true;
        plank.name = `plank_${plankIndex}`;
        group.add(plank);

        x += currentLength;
        plankIndex++;
        firstInRow = false;
      }
    }
  }

  // ===== HERRINGBONE: Diagonal zigzag plank pattern (45° alternating direction) =====
  private addHerringbonePattern(
    group: Group, width: number, depth: number, thickness: number,
    plankWidth: number, material: string
  ): void {
    const gap = 0.003;
    const plankLen = plankWidth * 4; // herringbone planks are longer than they are wide
    const diagOffset = plankLen / Math.SQRT2; // offset at 45 degrees
    let plankIndex = 0;

    // Cover the area with V-shaped herringbone pairs
    const halfW = width / 2 + plankLen;
    const halfD = depth / 2 + plankLen;
    const stepX = plankWidth * Math.SQRT2;
    const stepZ = plankWidth * Math.SQRT2;

    for (let bz = -halfD; bz < halfD; bz += stepZ) {
      for (let bx = -halfW; bx < halfW; bx += stepX) {
        // Each herringbone unit is two planks forming a V
        for (const dir of [-1, 1]) {
          const plankMat = this.getVariedFloorMaterial(material, plankIndex);
          const plankGeo = new BoxGeometry(plankLen - gap, thickness, plankWidth - gap);
          const plank = new Mesh(plankGeo, plankMat);

          // Position at the base of the V
          plank.position.set(
            bx + (dir === 1 ? diagOffset / 2 : 0),
            thickness / 2 + thickness * 0.15,
            bz + (dir === 1 ? 0 : diagOffset / 2)
          );
          plank.rotation.y = dir * Math.PI / 4;
          plank.receiveShadow = true;
          plank.castShadow = true;

          // Only add if within bounds
          if (
            plank.position.x > -width / 2 - plankWidth &&
            plank.position.x < width / 2 + plankWidth &&
            plank.position.z > -depth / 2 - plankWidth &&
            plank.position.z < depth / 2 + plankWidth
          ) {
            plank.name = `herringbone_plank_${plankIndex}`;
            group.add(plank);
          }
          plankIndex++;
        }
      }
    }
  }

  // ===== PARQUET: Square tiles with alternating grain direction =====
  private addParquetPattern(
    group: Group, width: number, depth: number, thickness: number,
    tileSize: number, material: string
  ): void {
    const gap = 0.003;
    const numTilesX = Math.ceil(width / tileSize);
    const numTilesZ = Math.ceil(depth / tileSize);
    let tileIndex = 0;

    for (let iz = 0; iz < numTilesZ; iz++) {
      for (let ix = 0; ix < numTilesX; ix++) {
        const x = -width / 2 + ix * (tileSize + gap) + tileSize / 2;
        const z = -depth / 2 + iz * (tileSize + gap) + tileSize / 2;

        if (x > width / 2 || z > depth / 2) continue;

        const actualW = Math.min(tileSize, width / 2 - x + tileSize / 2);
        const actualD = Math.min(tileSize, depth / 2 - z + tileSize / 2);
        if (actualW <= 0 || actualD <= 0) continue;

        const tileMat = this.getVariedFloorMaterial(material, tileIndex);
        const tileGeo = new BoxGeometry(actualW - gap, thickness, actualD - gap);
        const tile = new Mesh(tileGeo, tileMat);
        tile.position.set(x, thickness / 2 + thickness * 0.15, z);
        // Alternate grain direction: even/odd checkerboard pattern
        tile.rotation.y = (ix + iz) % 2 === 0 ? 0 : Math.PI / 2;
        tile.receiveShadow = true;
        tile.castShadow = true;
        tile.name = `parquet_tile_${tileIndex}`;
        group.add(tile);

        tileIndex++;
      }
    }
  }

  // ===== BASKETWEAVE: Groups of 3 horizontal planks alternating with 3 vertical planks =====
  private addBasketweavePattern(
    group: Group, width: number, depth: number, thickness: number,
    plankWidth: number, material: string
  ): void {
    const gap = 0.003;
    const groupSize = 3;
    const unitSize = plankWidth * groupSize; // each group is 3 plank widths
    let plankIndex = 0;

    const numUnitsX = Math.ceil(width / unitSize);
    const numUnitsZ = Math.ceil(depth / unitSize);

    for (let iz = 0; iz < numUnitsZ; iz++) {
      for (let ix = 0; ix < numUnitsX; ix++) {
        const baseX = -width / 2 + ix * (unitSize + gap);
        const baseZ = -depth / 2 + iz * (unitSize + gap);

        // Checkerboard: some cells are horizontal, some vertical
        const isHorizontal = (ix + iz) % 2 === 0;

        if (isHorizontal) {
          // 3 horizontal planks side by side (running in X direction)
          for (let p = 0; p < groupSize; p++) {
            const x = baseX + unitSize / 2;
            const z = baseZ + p * (plankWidth + gap) + plankWidth / 2;

            if (x > width / 2 + plankWidth || z > depth / 2 + plankWidth) continue;

            const actualLen = Math.min(unitSize, width / 2 - baseX + unitSize / 2);
            if (actualLen <= 0) continue;

            const plankMat = this.getVariedFloorMaterial(material, plankIndex);
            const plankGeo = new BoxGeometry(actualLen - gap, thickness, plankWidth - gap);
            const plank = new Mesh(plankGeo, plankMat);
            plank.position.set(x, thickness / 2 + thickness * 0.15, z);
            plank.receiveShadow = true;
            plank.castShadow = true;
            plank.name = `basketweave_plank_${plankIndex}`;
            group.add(plank);
            plankIndex++;
          }
        } else {
          // 3 vertical planks side by side (running in Z direction)
          for (let p = 0; p < groupSize; p++) {
            const x = baseX + p * (plankWidth + gap) + plankWidth / 2;
            const z = baseZ + unitSize / 2;

            if (x > width / 2 + plankWidth || z > depth / 2 + plankWidth) continue;

            const actualLen = Math.min(unitSize, depth / 2 - baseZ + unitSize / 2);
            if (actualLen <= 0) continue;

            const plankMat = this.getVariedFloorMaterial(material, plankIndex);
            const plankGeo = new BoxGeometry(plankWidth - gap, thickness, actualLen - gap);
            const plank = new Mesh(plankGeo, plankMat);
            plank.position.set(x, thickness / 2 + thickness * 0.15, z);
            plank.receiveShadow = true;
            plank.castShadow = true;
            plank.name = `basketweave_plank_${plankIndex}`;
            group.add(plank);
            plankIndex++;
          }
        }
      }
    }
  }

  // ===== UNIFORM / CARPET: Flat colored surface =====
  private addUniformPattern(
    group: Group, width: number, depth: number, thickness: number,
    floorType: string, material: string
  ): void {
    const floorMat = this.getFloorMaterial(floorType, material);

    if (floorType === 'carpet') {
      // Carpet: flat colored surface with subtle fiber texture
      // Create a slightly rougher material with fine noise
      const carpetMat = new MeshStandardMaterial({
        color: this.getCarpetColor(material),
        roughness: 0.95,
        metalness: 0.0,
      });

      // Generate a subtle fiber normal map
      const fiberNormalMap = this.generateCarpetNormalMap();
      carpetMat.normalMap = fiberNormalMap;

      const mainGeom = new BoxGeometry(width, thickness, depth);
      const carpet = new Mesh(mainGeom, carpetMat);
      carpet.position.set(0, thickness / 2, 0);
      carpet.receiveShadow = true;
      carpet.name = 'carpet';
      group.add(carpet);
    } else {
      // Concrete or other uniform surface
      const mainGeom = new BoxGeometry(width, thickness, depth);
      const floor = new Mesh(mainGeom, floorMat);
      floor.position.set(0, thickness / 2, 0);
      floor.receiveShadow = true;
      floor.name = 'floor';
      group.add(floor);
    }
  }

  // ===== Generate carpet fiber normal map (fine noise) =====
  private generateCarpetNormalMap(): Texture | null {
    try {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Base normal color (flat)
      ctx.fillStyle = '#8080ff';
      ctx.fillRect(0, 0, size, size);

      // Fine fiber noise perturbation
      const imgData = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          // Small random perturbation for fiber look
          const nx = (this.rng.next() - 0.5) * 15;
          const ny = (this.rng.next() - 0.5) * 15;
          imgData.data[idx] = Math.max(0, Math.min(255, 128 + nx));     // R = X normal
          imgData.data[idx + 1] = Math.max(0, Math.min(255, 128 + ny)); // G = Y normal
          // B stays 255 (pointing up)
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const tex = new CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.repeat.set(4, 4);
      return tex;
    } catch (err) {
      // Silently fall back - floor texture generation may fail
      if (process.env.NODE_ENV === 'development') console.debug('[FloorGenerator] texture generation fallback:', err);
      return null;
    }
  }

  // ===== Material with per-plank/tile color variation =====
  private getVariedFloorMaterial(material: string, index: number): MeshStandardMaterial {
    const base = this.getFloorMaterial('hardwood', material);
    // Apply slight color variation per plank/tile using index as seed
    const variation = (this.deterministicRandom(index) - 0.5) * 0.06; // ±3% color shift
    const baseColor = base.color as Color;
    const newColor = new Color(
      Math.max(0, Math.min(1, baseColor.r + variation)),
      Math.max(0, Math.min(1, baseColor.g + variation * 0.8)),
      Math.max(0, Math.min(1, baseColor.b + variation * 0.6))
    );
    return new MeshStandardMaterial({
      color: newColor,
      roughness: base.roughness + (this.deterministicRandom(index + 100) - 0.5) * 0.1,
      metalness: base.metalness,
    });
  }

  private deterministicRandom(index: number): number {
    // Simple hash-based deterministic random for per-plank variation
    let seed = index * 2654435761;
    seed = ((seed >>> 16) ^ seed) * 0x45d9f3b;
    seed = ((seed >>> 16) ^ seed) * 0x45d9f3b;
    seed = (seed >>> 16) ^ seed;
    return (seed >>> 0) / 4294967296;
  }

  private getCarpetColor(material: string): number {
    const colors: Record<string, number> = {
      wool: 0x8b7d6b,
      nylon: 0x6b7d8b,
      berber: 0xc4b896,
      shag: 0x7a6a5a,
      frieze: 0x9a8a7a,
    };
    return colors[material] || 0x8b7d6b;
  }

  private getFloorMaterial(floorType: string, material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      oak: { color: 0x8b6914, roughness: 0.6, metalness: 0.0 },
      walnut: { color: 0x5c4033, roughness: 0.65, metalness: 0.0 },
      maple: { color: 0xc4a35a, roughness: 0.55, metalness: 0.0 },
      cherry: { color: 0x8b3a3a, roughness: 0.55, metalness: 0.0 },
      pine: { color: 0xc4a35a, roughness: 0.7, metalness: 0.0 },
      porcelain: { color: 0xeeeeee, roughness: 0.3, metalness: 0.05 },
      ceramic: { color: 0xdddddd, roughness: 0.4, metalness: 0.0 },
      marble: { color: 0xf0ece0, roughness: 0.2, metalness: 0.05 },
      wool: { color: 0x8b7d6b, roughness: 0.95, metalness: 0.0 },
      nylon: { color: 0x6b7d8b, roughness: 0.9, metalness: 0.0 },
      polished_concrete: { color: 0xaaaaaa, roughness: 0.2, metalness: 0.1 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
    };
    const config = configs[material] || configs.oak;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
  }

  getStylePresets(): Record<string, Partial<FloorParams>> {
    return {
      hardwood_plank: { floorType: 'hardwood', pattern: 'plank', material: 'oak' },
      hardwood_herringbone: { floorType: 'hardwood', pattern: 'herringbone', material: 'oak' },
      hardwood_parquet: { floorType: 'hardwood', pattern: 'parquet', material: 'walnut' },
      hardwood_basketweave: { floorType: 'hardwood', pattern: 'basketweave', material: 'cherry' },
      tile_modern: { floorType: 'tile', pattern: 'uniform', tileWidth: 0.6, material: 'porcelain' },
      carpet: { floorType: 'carpet', pattern: 'uniform', material: 'wool' },
      concrete: { floorType: 'concrete', pattern: 'uniform', material: 'polished_concrete' },
    };
  }
}

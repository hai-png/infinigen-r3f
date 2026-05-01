/**
 * ShrubGenerator - Procedural shrub and bush generation: multiple stems + leaf clusters
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';

export interface ShrubSpeciesConfig {
  name: string;
  height: { min: number; max: number };
  width: { min: number; max: number };
  density: number;
  branchPattern: 'spherical' | 'elliptical' | 'irregular' | 'flat';
  leafColor: THREE.Color;
  stemColor: THREE.Color;
  seasonalColors?: { spring?: THREE.Color; summer?: THREE.Color; autumn?: THREE.Color; winter?: THREE.Color };
  hasBerries?: boolean;
  berryColor?: THREE.Color;
  isEvergreen?: boolean;
}

export const ShrubSpeciesPresets: Record<string, ShrubSpeciesConfig> = {
  boxwood: { name: 'Boxwood', height: { min: 0.5, max: 1.2 }, width: { min: 0.4, max: 1.0 }, density: 0.9, branchPattern: 'spherical', leafColor: new THREE.Color(0x3d5c3d), stemColor: new THREE.Color(0x6b4423), isEvergreen: true },
  hydrangea: { name: 'Hydrangea', height: { min: 1.0, max: 2.0 }, width: { min: 1.0, max: 1.8 }, density: 0.75, branchPattern: 'spherical', leafColor: new THREE.Color(0x4a7c4e), stemColor: new THREE.Color(0x5c4033) },
  lavender: { name: 'Lavender', height: { min: 0.4, max: 0.8 }, width: { min: 0.3, max: 0.6 }, density: 0.6, branchPattern: 'elliptical', leafColor: new THREE.Color(0x7c9473), stemColor: new THREE.Color(0x6b8e23) },
  holly: { name: 'Holly', height: { min: 1.5, max: 3.0 }, width: { min: 1.0, max: 2.0 }, density: 0.85, branchPattern: 'irregular', leafColor: new THREE.Color(0x2d5016), stemColor: new THREE.Color(0x4a3728), hasBerries: true, berryColor: new THREE.Color(0xdc143c), isEvergreen: true },
  rose: { name: 'Rose Bush', height: { min: 0.8, max: 1.5 }, width: { min: 0.6, max: 1.2 }, density: 0.7, branchPattern: 'irregular', leafColor: new THREE.Color(0x3d6b3d), stemColor: new THREE.Color(0x5c4033) },
  fern: { name: 'Fern', height: { min: 0.3, max: 0.8 }, width: { min: 0.4, max: 0.9 }, density: 0.5, branchPattern: 'flat', leafColor: new THREE.Color(0x558b2f), stemColor: new THREE.Color(0x6b4423), isEvergreen: false },
};

export type ShrubConfig = ShrubSpeciesConfig;

export class ShrubGenerator {
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.materialCache = new Map();
  }

  generateShrub(
    species: string | ShrubSpeciesConfig,
    seed: number,
    options: { season?: 'spring' | 'summer' | 'autumn' | 'winter'; lod?: number; includeFlowers?: boolean } = {}
  ): THREE.Group {
    const config = typeof species === 'string' ? ShrubSpeciesPresets[species] || ShrubSpeciesPresets.boxwood : species;
    const season = options.season || 'summer';
    const rng = new SeededRandom(seed);

    const shrubGroup = new THREE.Group();

    // Multiple stems
    const stemMesh = this.generateStems(config, rng);
    shrubGroup.add(stemMesh);

    // Leaf clusters
    const foliageMesh = this.generateFoliage(config, season, rng);
    shrubGroup.add(foliageMesh);

    // Berries
    if (config.hasBerries && config.berryColor) {
      const berriesMesh = this.generateBerries(config, rng);
      shrubGroup.add(berriesMesh);
    }

    return shrubGroup;
  }

  private generateStems(config: ShrubSpeciesConfig, rng: SeededRandom): THREE.Group {
    const stemsGroup = new THREE.Group();
    const stemCount = rng.nextInt(3, 8);

    for (let i = 0; i < stemCount; i++) {
      const height = rng.uniform(config.height.min * 0.3, config.height.max * 0.5);
      const radius = rng.uniform(0.02, 0.05);
      const geometry = new THREE.CylinderGeometry(radius * 0.7, radius, height, 6);
      const material = this.getStemMaterial(config.stemColor, config.name);
      const stemMesh = new THREE.Mesh(geometry, material);

      const offsetX = rng.uniform(-0.2, 0.2);
      const offsetZ = rng.uniform(-0.2, 0.2);
      const tiltAngle = rng.uniform(-0.2, 0.2);

      stemMesh.position.set(offsetX, height / 2, offsetZ);
      stemMesh.rotation.z = tiltAngle;
      stemMesh.rotation.x = rng.uniform(-0.1, 0.1);
      stemMesh.castShadow = true;
      stemsGroup.add(stemMesh);
    }
    return stemsGroup;
  }

  private generateFoliage(config: ShrubSpeciesConfig, season: string, rng: SeededRandom): THREE.Mesh {
    const width = rng.uniform(config.width.min, config.width.max);
    const height = rng.uniform(config.height.min, config.height.max);

    let geometry: THREE.BufferGeometry;

    switch (config.branchPattern) {
      case 'spherical':
        geometry = new THREE.SphereGeometry(width / 2, 10, 8);
        break;
      case 'elliptical':
        geometry = new THREE.SphereGeometry(width / 2, 10, 8);
        geometry.scale(1, height / width, 1);
        break;
      case 'flat':
        geometry = this.createFlatFoliage(width, height, rng);
        break;
      default:
        geometry = new THREE.SphereGeometry(width / 2, 10, 8);
        geometry.scale(1, height / width, 1);
    }

    const leafColor = this.getSeasonalColor(config, season);
    const material = this.getLeafMaterial(leafColor, config.name, config.density);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height * 0.6;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create flat foliage — properly merges all frond geometries
   */
  private createFlatFoliage(width: number, height: number, rng: SeededRandom): THREE.BufferGeometry {
    const frondCount = 6;
    const geometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < frondCount; i++) {
      const frondWidth = width * rng.uniform(0.3, 0.7);
      const frondLength = height * rng.uniform(0.4, 0.7);
      const frondGeometry = new THREE.BoxGeometry(frondWidth, 0.05, frondLength);
      const rotationY = (i / frondCount) * Math.PI * 2;
      frondGeometry.rotateY(rotationY);
      frondGeometry.rotateX(-0.2 - rng.uniform(0, 0.3));
      geometries.push(frondGeometry);
    }

    return this.mergeGeometries(geometries);
  }

  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVertices = 0;
    let totalIndices = 0;
    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
      if (geo.index) totalIndices += geo.index.count;
      else totalIndices += geo.attributes.position.count;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedIndices: number[] = [];
    let vertexOffset = 0;

    for (const geo of geometries) {
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;

      for (let i = 0; i < posAttr.count; i++) {
        mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
        mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
        mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);
        if (normAttr) {
          mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
          mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
          mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
        }
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) mergedIndices.push(geo.index.getX(i) + vertexOffset);
      } else {
        for (let i = 0; i < posAttr.count; i++) mergedIndices.push(vertexOffset + i);
      }
      vertexOffset += posAttr.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setIndex(mergedIndices);
    merged.computeVertexNormals();
    return merged;
  }

  private generateBerries(config: ShrubSpeciesConfig, rng: SeededRandom): THREE.Group {
    const berriesGroup = new THREE.Group();
    const berryCount = rng.nextInt(10, 30);
    const berryGeometry = new THREE.SphereGeometry(0.03, 6, 4);
    const berryMaterial = new THREE.MeshStandardMaterial({ color: config.berryColor, roughness: 0.4, metalness: 0.1 });

    for (let i = 0; i < berryCount; i++) {
      const berryMesh = new THREE.Mesh(berryGeometry, berryMaterial);
      const angle = (i / berryCount) * Math.PI * 2;
      const radius = rng.uniform(0.2, 0.4);
      const height = rng.uniform(0.3, 0.7);
      berryMesh.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      berriesGroup.add(berryMesh);
    }
    return berriesGroup;
  }

  private getStemMaterial(color: THREE.Color, key: string): THREE.MeshStandardMaterial {
    const cacheKey = `stem_${key}`;
    if (!this.materialCache.has(cacheKey)) {
      this.materialCache.set(cacheKey, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 }));
    }
    return this.materialCache.get(cacheKey)!;
  }

  private getLeafMaterial(color: THREE.Color, key: string, density: number): THREE.MeshStandardMaterial {
    const cacheKey = `leaf_${key}_${density}`;
    if (!this.materialCache.has(cacheKey)) {
      this.materialCache.set(cacheKey, new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
        transparent: density < 0.7, opacity: Math.min(1, density + 0.2),
      }));
    }
    return this.materialCache.get(cacheKey)!;
  }

  private getSeasonalColor(config: ShrubSpeciesConfig, season: string): THREE.Color {
    if (config.isEvergreen && (season === 'winter' || season === 'autumn')) return config.leafColor;
    if (config.seasonalColors && config.seasonalColors[season as keyof typeof config.seasonalColors]) {
      return config.seasonalColors[season as keyof typeof config.seasonalColors]!;
    }
    return config.leafColor;
  }

  generateUndergrowth(
    count: number, areaSize: number, speciesList: string[], seed: number,
    options: { season?: 'spring' | 'summer' | 'autumn' | 'winter'; treePositions?: THREE.Vector3[] } = {}
  ): THREE.Group {
    const undergrowthGroup = new THREE.Group();
    const season = options.season || 'summer';
    const rng = new SeededRandom(seed);

    for (let i = 0; i < count; i++) {
      const shrubSeed = seed + i;
      const species = rng.choice(speciesList);
      const x = (rng.next() - 0.5) * areaSize;
      const z = (rng.next() - 0.5) * areaSize;

      if (options.treePositions) {
        let tooClose = false;
        for (const treePos of options.treePositions) {
          if (Math.sqrt((x - treePos.x) ** 2 + (z - treePos.z) ** 2) < 1.5) { tooClose = true; break; }
        }
        if (tooClose) continue;
      }

      const shrub = this.generateShrub(species, shrubSeed, { season });
      shrub.position.set(x, 0, z);
      shrub.rotation.y = rng.uniform(0, Math.PI * 2);
      shrub.scale.setScalar(0.7 + rng.uniform(0, 0.6));
      undergrowthGroup.add(shrub);
    }
    return undergrowthGroup;
  }
}

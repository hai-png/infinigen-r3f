/**
 * VineGenerator - Curved stem + leaf PAIRS
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/math/index';
import { Noise3D } from '../../../../core/util/math/noise';

export interface VineSpeciesConfig {
  species: 'ivy' | 'wisteria' | 'grapevine' | 'creeper';
  growthPattern: 'climbing' | 'hanging' | 'spreading';
  length: number;
  stemThickness: number;
  leafDensity: number;
  leafSize: number;
  hasFlowers: boolean;
  flowerColor?: THREE.Color;
}

export const VineSpeciesPresets: Record<string, VineSpeciesConfig> = {
  ivy: { species: 'ivy', growthPattern: 'climbing', length: 2.0, stemThickness: 0.01, leafDensity: 0.7, leafSize: 0.05, hasFlowers: false },
  wisteria: { species: 'wisteria', growthPattern: 'hanging', length: 3.0, stemThickness: 0.015, leafDensity: 0.6, leafSize: 0.04, hasFlowers: true, flowerColor: new THREE.Color(0x9b59b6) },
  grapevine: { species: 'grapevine', growthPattern: 'climbing', length: 2.5, stemThickness: 0.02, leafDensity: 0.8, leafSize: 0.06, hasFlowers: true, flowerColor: new THREE.Color(0x27ae60) },
  creeper: { species: 'creeper', growthPattern: 'spreading', length: 1.5, stemThickness: 0.008, leafDensity: 0.9, leafSize: 0.03, hasFlowers: false },
};

export interface VineConfig {
  species: 'ivy' | 'wisteria' | 'grapevine' | 'creeper';
  growthPattern: 'climbing' | 'hanging' | 'spreading';
  length: number;
  stemThickness: number;
  leafDensity: number;
  leafSize: number;
  hasFlowers: boolean;
  flowerColor?: THREE.Color;
  attachmentPoints?: THREE.Vector3[];
  growthDirection: THREE.Vector3;
}

export class VineGenerator {
  private defaultConfig: VineConfig = {
    species: 'ivy', growthPattern: 'climbing', length: 2.0, stemThickness: 0.01,
    leafDensity: 0.7, leafSize: 0.05, hasFlowers: false, growthDirection: new THREE.Vector3(0, 1, 0),
  };

  public generate(config: Partial<VineConfig> = {}, seed: number = 12345): THREE.Group {
    const rng = new SeededRandom(seed);
    const finalConfig = { ...this.defaultConfig, ...config };
    const group = new THREE.Group();

    // Curved stem(s)
    const stems = this.generateStems(finalConfig, rng);
    stems.forEach(stem => group.add(stem));

    // Leaf pairs along stem
    if (finalConfig.leafDensity > 0) {
      const leaves = this.generateLeafPairs(finalConfig, rng);
      leaves.forEach(leaf => group.add(leaf));
    }

    // Flowers
    if (finalConfig.hasFlowers && finalConfig.flowerColor) {
      const flowers = this.generateFlowers(finalConfig, rng);
      flowers.forEach(flower => group.add(flower));
    }

    return group;
  }

  private generateStems(config: VineConfig, rng: SeededRandom): THREE.Mesh[] {
    const noise = new Noise3D(rng.seed);
    switch (config.growthPattern) {
      case 'climbing': return this.generateClimbingStems(config, rng, noise);
      case 'hanging': return this.generateHangingStems(config, rng);
      case 'spreading': return this.generateSpreadingStems(config, rng);
      default: return this.generateClimbingStems(config, rng, noise);
    }
  }

  private generateClimbingStems(config: VineConfig, rng: SeededRandom, noise: Noise3D): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const stemCount = Math.max(1, Math.floor(config.length / 0.5));
    const material = this.getStemMaterial(config);

    for (let i = 0; i < stemCount; i++) {
      const segments = Math.floor(config.length / 0.1);
      const points: THREE.Vector3[] = [];
      let currentPos = new THREE.Vector3(rng.uniform(-0.3, 0.3), 0, rng.uniform(-0.3, 0.3));
      points.push(currentPos.clone());

      for (let s = 0; s < segments; s++) {
        const t = s / segments;
        const wanderX = noise.perlin(t * 0.5, i, 0) * 0.1;
        const wanderZ = noise.perlin(t * 0.5, i, 100) * 0.1;
        currentPos = new THREE.Vector3(currentPos.x + wanderX, currentPos.y + config.length / segments, currentPos.z + wanderZ);
        points.push(currentPos.clone());
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness, 6, false);
      stems.push(new THREE.Mesh(geometry, material));
    }
    return stems;
  }

  private generateHangingStems(config: VineConfig, rng: SeededRandom): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const stemCount = Math.max(1, Math.floor(config.length / 0.3));
    const material = this.getStemMaterial(config);

    for (let i = 0; i < stemCount; i++) {
      const segments = Math.floor(config.length / 0.1);
      const points: THREE.Vector3[] = [];
      const startX = rng.uniform(-0.5, 0.5);
      const startZ = rng.uniform(-0.5, 0.5);
      let currentPos = new THREE.Vector3(startX, config.length, startZ);
      points.push(currentPos.clone());

      let t = 0;
      for (let s = 0; s < segments; s++) {
        t = s / segments;
        const sway = Math.sin(t * Math.PI * 2) * 0.05;
        currentPos = new THREE.Vector3(currentPos.x + sway * 0.1, currentPos.y - config.length / segments, currentPos.z + rng.uniform(-0.02, 0.02));
        points.push(currentPos.clone());
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness * (1 - t), 6, false);
      stems.push(new THREE.Mesh(geometry, material));
    }
    return stems;
  }

  private generateSpreadingStems(config: VineConfig, rng: SeededRandom): THREE.Mesh[] {
    const stems: THREE.Mesh[] = [];
    const material = this.getStemMaterial(config);
    const segments = Math.floor(config.length / 0.1);
    const points: THREE.Vector3[] = [];
    let currentPos = new THREE.Vector3(0, 0.02, 0);
    points.push(currentPos.clone());

    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const angle = t * Math.PI * 4;
      const radius = 0.05 * t;
      currentPos = new THREE.Vector3(currentPos.x + Math.cos(angle) * radius, 0.02, currentPos.z + Math.sin(angle) * radius);
      points.push(currentPos.clone());
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, config.stemThickness, 6, false);
    stems.push(new THREE.Mesh(geometry, material));

    // Branch stems
    const branchCount = Math.floor(config.length / 0.3);
    for (let b = 0; b < branchCount; b++) {
      const branchLength = config.length * 0.3;
      const branchSegments = Math.floor(branchLength / 0.1);
      const branchPoints: THREE.Vector3[] = [];
      const attachIndex = Math.floor((b / branchCount) * segments);
      const attachPos = points[Math.min(attachIndex, points.length - 1)];
      branchPoints.push(attachPos.clone());
      let branchPos = attachPos.clone();
      const branchAngle = (b / branchCount) * Math.PI * 2;

      for (let s = 0; s < branchSegments; s++) {
        branchPos = new THREE.Vector3(branchPos.x + Math.cos(branchAngle) * 0.03, 0.02, branchPos.z + Math.sin(branchAngle) * 0.03);
        branchPoints.push(branchPos.clone());
      }

      const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
      const branchGeometry = new THREE.TubeGeometry(branchCurve, branchSegments, config.stemThickness * 0.7, 6, false);
      stems.push(new THREE.Mesh(branchGeometry, material));
    }
    return stems;
  }

  /**
   * Generate leaf PAIRS along the stem — two leaves at each node, opposite sides
   */
  private generateLeafPairs(config: VineConfig, rng: SeededRandom): THREE.Mesh[] {
    const leaves: THREE.Mesh[] = [];
    const material = this.getLeafMaterial(config);
    const pairCount = Math.floor(config.length * config.leafDensity * 4);

    for (let i = 0; i < pairCount; i++) {
      const t = i / pairCount;
      const y = t * config.length;
      const xOffset = rng.uniform(-0.1, 0.1) * config.length;
      const zOffset = rng.uniform(-0.1, 0.1) * config.length;
      const angle = rng.uniform(0, Math.PI * 2);

      // Create a pair of leaves — opposite sides
      for (const side of [-1, 1]) {
        const leafGeometry = this.createLeafGeometry(config.species, config.leafSize, rng);
        const leaf = new THREE.Mesh(leafGeometry, material);
        leaf.position.set(
          xOffset + Math.cos(angle + side * Math.PI / 2) * 0.05,
          y,
          zOffset + Math.sin(angle + side * Math.PI / 2) * 0.05
        );
        leaf.rotation.set(
          (rng.next() - 0.5) * 0.5,
          angle + side * Math.PI / 2,
          side * 0.3
        );
        leaves.push(leaf);
      }
    }
    return leaves;
  }

  private generateFlowers(config: VineConfig, rng: SeededRandom): THREE.Mesh[] {
    const flowers: THREE.Mesh[] = [];
    const material = new THREE.MeshStandardMaterial({ color: config.flowerColor!, roughness: 0.5, metalness: 0.0 });
    const flowerCount = Math.floor(config.length * 2);

    for (let i = 0; i < flowerCount; i++) {
      const flowerGeometry = new THREE.SphereGeometry(0.02, 8, 8);
      const flower = new THREE.Mesh(flowerGeometry, material);
      flower.position.set(
        (rng.next() - 0.5) * config.length * 0.3,
        rng.uniform(0, config.length),
        (rng.next() - 0.5) * config.length * 0.3
      );
      flowers.push(flower);
    }
    return flowers;
  }

  private getStemMaterial(config: VineConfig): THREE.MeshStandardMaterial {
    const colors: Record<string, number> = { ivy: 0x3d4a23, wisteria: 0x5c4a3d, grapevine: 0x4a3d23, creeper: 0x2d3a18 };
    return new THREE.MeshStandardMaterial({ color: colors[config.species] || 0x4a5d23, roughness: 0.8, metalness: 0.0 });
  }

  private getLeafMaterial(config: VineConfig): THREE.MeshStandardMaterial {
    const colors: Record<string, number> = { ivy: 0x1a3d1a, wisteria: 0x3d5a2d, grapevine: 0x4a6b3a, creeper: 0x2d4a1a };
    return new THREE.MeshStandardMaterial({ color: colors[config.species] || 0x2d5a27, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
  }

  private createLeafGeometry(species: string, size: number, rng: SeededRandom): THREE.BufferGeometry {
    if (species === 'ivy') {
      const shape = new THREE.Shape();
      const points = 8;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const r = size * (0.5 + 0.5 * Math.sin(angle * 3));
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      return new THREE.ShapeGeometry(shape);
    }
    // Default simple leaf shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(size * 0.5, size, 0, size * 2);
    shape.quadraticCurveTo(-size * 0.5, size, 0, 0);
    const geo = new THREE.ShapeGeometry(shape);
    return geo;
  }
}

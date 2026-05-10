/**
 * EnhancedFruitSystem.ts — Extended Fruit Generation
 *
 * Adds new fruit types and features beyond the base FruitFlowerSystem:
 *   - Pineapple: spiral phyllotaxis scale arrangement
 *   - Fruit cross-section rendering (reveals internal structure)
 *   - Seed library for internal fruit detail
 *   - Stem library for attachment points
 *   - Coconut hairy/green variant support
 *   - Cross-section rendering for Starfruit and others
 *
 * @module assets/objects/vegetation
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Extended Fruit Types
// ============================================================================

/** Extended fruit types beyond the base system */
export enum ExtendedFruitType {
  PINEAPPLE = 'pineapple',
  COCONUT_HAIRY = 'coconut_hairy',
  COCONUT_GREEN = 'coconut_green',
}

// ============================================================================
// Seed Library
// ============================================================================

/**
 * Seed descriptor for fruit internal detail.
 */
export interface SeedDescriptor {
  /** Seed shape */
  shape: 'ellipsoid' | 'flat' | 'teardrop' | 'angular';
  /** Seed size relative to fruit radius */
  relativeSize: number;
  /** Seed color */
  color: THREE.Color;
  /** Arrangement pattern */
  arrangement: 'radial' | 'random' | 'spiral' | 'segmented';
  /** Count of seeds */
  count: number;
}

/**
 * Library of seed descriptors for various fruit types.
 */
export const SEED_LIBRARY: Record<string, SeedDescriptor> = {
  apple: {
    shape: 'teardrop',
    relativeSize: 0.05,
    color: new THREE.Color(0x5a3a1a),
    arrangement: 'radial',
    count: 8,
  },
  orange: {
    shape: 'ellipsoid',
    relativeSize: 0.04,
    color: new THREE.Color(0xf5e050),
    arrangement: 'segmented',
    count: 12,
  },
  lemon: {
    shape: 'ellipsoid',
    relativeSize: 0.03,
    color: new THREE.Color(0xf5e8a0),
    arrangement: 'radial',
    count: 6,
  },
  pineapple: {
    shape: 'flat',
    relativeSize: 0.02,
    color: new THREE.Color(0x3a2a0a),
    arrangement: 'spiral',
    count: 50,
  },
  strawberry: {
    shape: 'angular',
    relativeSize: 0.04,
    color: new THREE.Color(0xd4aa00),
    arrangement: 'random',
    count: 20,
  },
  starfruit: {
    shape: 'flat',
    relativeSize: 0.03,
    color: new THREE.Color(0xd4aa00),
    arrangement: 'radial',
    count: 5,
  },
  coconut: {
    shape: 'ellipsoid',
    relativeSize: 0.2,
    color: new THREE.Color(0xf5f0e0),
    arrangement: 'random',
    count: 1,
  },
  pomegranate: {
    shape: 'angular',
    relativeSize: 0.06,
    color: new THREE.Color(0xcc1133),
    arrangement: 'random',
    count: 30,
  },
  durian: {
    shape: 'ellipsoid',
    relativeSize: 0.05,
    color: new THREE.Color(0xf5e050),
    arrangement: 'segmented',
    count: 5,
  },
  blackberry: {
    shape: 'ellipsoid',
    relativeSize: 0.01,
    color: new THREE.Color(0x4a2a10),
    arrangement: 'random',
    count: 1, // Each drupelet is one seed
  },
  plum: {
    shape: 'ellipsoid',
    relativeSize: 0.1,
    color: new THREE.Color(0x5a3a1a),
    arrangement: 'radial',
    count: 1,
  },
  cherry: {
    shape: 'ellipsoid',
    relativeSize: 0.15,
    color: new THREE.Color(0xf5e0a0),
    arrangement: 'radial',
    count: 1,
  },
};

// ============================================================================
// Stem Library
// ============================================================================

/**
 * Stem descriptor for fruit attachment.
 */
export interface StemDescriptor {
  /** Stem type */
  type: 'simple' | 'curved' | 'calyx' | 'crown' | 'husk';
  /** Length relative to fruit size */
  relativeLength: number;
  /** Thickness relative to fruit size */
  relativeThickness: number;
  /** Color */
  color: THREE.Color;
  /** Whether to include a small leaf */
  hasLeaf: boolean;
}

/**
 * Library of stem descriptors for various fruit types.
 */
export const STEM_LIBRARY: Record<string, StemDescriptor> = {
  apple: {
    type: 'curved', relativeLength: 0.5, relativeThickness: 0.05,
    color: new THREE.Color(0x3d2b1f), hasLeaf: true,
  },
  orange: {
    type: 'simple', relativeLength: 0.25, relativeThickness: 0.06,
    color: new THREE.Color(0x3d5a1e), hasLeaf: true,
  },
  lemon: {
    type: 'simple', relativeLength: 0.3, relativeThickness: 0.04,
    color: new THREE.Color(0x3d5a1e), hasLeaf: true,
  },
  pineapple: {
    type: 'crown', relativeLength: 0.4, relativeThickness: 0.05,
    color: new THREE.Color(0x3d7a2a), hasLeaf: false,
  },
  strawberry: {
    type: 'calyx', relativeLength: 0.3, relativeThickness: 0.03,
    color: new THREE.Color(0x2d7a1e), hasLeaf: false,
  },
  starfruit: {
    type: 'simple', relativeLength: 0.4, relativeThickness: 0.04,
    color: new THREE.Color(0x3d2b1f), hasLeaf: false,
  },
  coconut: {
    type: 'husk', relativeLength: 0.3, relativeThickness: 0.08,
    color: new THREE.Color(0x3d5a1e), hasLeaf: false,
  },
  pomegranate: {
    type: 'crown', relativeLength: 0.4, relativeThickness: 0.05,
    color: new THREE.Color(0x7a3a1e), hasLeaf: false,
  },
  durian: {
    type: 'simple', relativeLength: 0.3, relativeThickness: 0.06,
    color: new THREE.Color(0x3d2b1f), hasLeaf: false,
  },
  cherry: {
    type: 'curved', relativeLength: 2.0, relativeThickness: 0.03,
    color: new THREE.Color(0x3d5a1e), hasLeaf: false,
  },
  blackberry: {
    type: 'simple', relativeLength: 0.3, relativeThickness: 0.04,
    color: new THREE.Color(0x2d5a1e), hasLeaf: false,
  },
  plum: {
    type: 'simple', relativeLength: 0.4, relativeThickness: 0.04,
    color: new THREE.Color(0x3d2b1f), hasLeaf: false,
  },
};

// ============================================================================
// EnhancedFruitFactory
// ============================================================================

/**
 * Factory for generating enhanced fruit types with cross-section rendering,
 * seed library integration, and stem library attachment.
 */
export class EnhancedFruitFactory {
  /**
   * Generate a pineapple fruit.
   * Features: spiral phyllotaxis scale arrangement, crown of leaves at top.
   */
  static generatePineapple(params: {
    size: number;
    seed: number;
    color?: THREE.Color;
  }): THREE.Group {
    const { size, seed } = params;
    const rng = new SeededRandom(seed);
    const group = new THREE.Group();

    const r = size;
    const height = r * 3;

    // Main body: elongated oval with scale pattern
    const bodyPoints: THREE.Vector2[] = [];
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let pr = Math.sin(t * Math.PI) * r * 0.8;
      // Taper at tip
      if (t > 0.7) {
        pr *= 1 - ((t - 0.7) / 0.3) * 0.8;
      }
      bodyPoints.push(new THREE.Vector2(Math.max(0.001, pr), t * height));
    }

    const bodyGeo = new THREE.LatheGeometry(bodyPoints, 12);
    const bodyColor = params.color ?? new THREE.Color(0xb89a1a).offsetHSL(
      rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05),
    );
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.85,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Scale pattern: small raised bumps in spiral arrangement
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const scaleCount = 40;
    const scaleGeo = new THREE.SphereGeometry(r * 0.08, 4, 3);
    scaleGeo.scale(1.2, 0.5, 1.2);
    const scaleMat = new THREE.MeshStandardMaterial({
      color: bodyColor.clone().offsetHSL(0, -0.1, -0.05),
      roughness: 0.9,
      metalness: 0.0,
    });

    for (let i = 0; i < scaleCount; i++) {
      const t = i / scaleCount;
      const y = t * height * 0.9;
      const angle = i * goldenAngle;
      const localR = r * 0.8 * Math.sin(t * Math.PI) * 0.95;

      const scale = new THREE.Mesh(scaleGeo, scaleMat);
      scale.position.set(
        Math.cos(angle) * localR,
        y,
        Math.sin(angle) * localR,
      );

      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
      scale.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      scale.castShadow = true;
      group.add(scale);
    }

    // Crown of leaves at top
    const crownLeafCount = rng.nextInt(5, 10);
    for (let i = 0; i < crownLeafCount; i++) {
      const angle = (i / crownLeafCount) * Math.PI * 2 + rng.uniform(-0.2, 0.2);
      const leafLen = r * rng.uniform(0.8, 1.5);
      const leafWidth = leafLen * 0.15;

      const leafShape = new THREE.Shape();
      leafShape.moveTo(0, 0);
      leafShape.quadraticCurveTo(leafWidth * 0.5, leafLen * 0.4, leafWidth * 0.2, leafLen * 0.7);
      leafShape.quadraticCurveTo(0, leafLen, -leafWidth * 0.2, leafLen * 0.7);
      leafShape.quadraticCurveTo(-leafWidth * 0.5, leafLen * 0.4, 0, 0);

      const leafGeo = new THREE.ShapeGeometry(leafShape, 3);
      const leafMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x3a7a1e).offsetHSL(rng.uniform(-0.03, 0.03), rng.uniform(-0.1, 0.1), rng.uniform(-0.05, 0.05)),
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = height * 0.95;
      leaf.rotation.y = angle;
      leaf.rotation.x = -0.3 - rng.uniform(0, 0.5);
      leaf.castShadow = true;
      group.add(leaf);
    }

    return group;
  }

  /**
   * Generate a fruit cross-section revealing internal structure.
   *
   * @param fruitType The type of fruit to create a cross-section for
   * @param size The fruit radius
   * @param rng Seeded random
   * @returns Group with the cross-section geometry
   */
  static generateCrossSection(
    fruitType: string,
    size: number,
    rng: SeededRandom,
  ): THREE.Group {
    const group = new THREE.Group();
    const seedDesc = SEED_LIBRARY[fruitType];

    if (!seedDesc) return group;

    // Create flat cross-section disc
    const discGeo = new THREE.CircleGeometry(size, 16);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0xf5e8c0,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.castShadow = true;
    disc.receiveShadow = true;
    group.add(disc);

    // Section-specific details
    switch (fruitType) {
      case 'orange':
      case 'lemon': {
        // Segmented cross-section
        const segmentCount = fruitType === 'orange' ? 10 : 8;
        for (let i = 0; i < segmentCount; i++) {
          const angle = (i / segmentCount) * Math.PI * 2;
          const segShape = new THREE.Shape();
          const segR = size * 0.7;
          const segAngle = (Math.PI * 2 / segmentCount) * 0.4;
          segShape.moveTo(0, 0);
          segShape.lineTo(Math.cos(angle - segAngle) * segR, Math.sin(angle - segAngle) * segR);
          segShape.quadraticCurveTo(
            Math.cos(angle) * segR * 1.1,
            Math.sin(angle) * segR * 1.1,
            Math.cos(angle + segAngle) * segR,
            Math.sin(angle + segAngle) * segR,
          );
          segShape.closePath();

          const segGeo = new THREE.ShapeGeometry(segShape, 2);
          const segMat = new THREE.MeshStandardMaterial({
            color: fruitType === 'orange' ? 0xffa030 : 0xf5e050,
            roughness: 0.6,
            metalness: 0.0,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
          });
          const seg = new THREE.Mesh(segGeo, segMat);
          seg.position.z = 0.001;
          group.add(seg);
        }
        break;
      }

      case 'starfruit': {
        // 5-pointed star cross-section with seeds
        const starPoints = 5;
        const innerR = size * 0.3;
        const outerR = size * 0.9;
        const starShape = new THREE.Shape();
        for (let i = 0; i < starPoints * 2; i++) {
          const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
          const r2 = i % 2 === 0 ? outerR : innerR;
          const x = Math.cos(angle) * r2;
          const y = Math.sin(angle) * r2;
          if (i === 0) starShape.moveTo(x, y);
          else starShape.lineTo(x, y);
        }
        starShape.closePath();

        const starGeo = new THREE.ShapeGeometry(starShape, 3);
        const starMat = new THREE.MeshStandardMaterial({
          color: 0xd4aa00,
          roughness: 0.6,
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        });
        const star = new THREE.Mesh(starGeo, starMat);
        star.position.z = 0.001;
        group.add(star);

        // Seeds in each point
        for (let i = 0; i < starPoints; i++) {
          const angle = (i / starPoints) * Math.PI * 2 - Math.PI / 2;
          const seedR = size * 0.35;
          const seedGeo = new THREE.SphereGeometry(size * 0.03, 4, 3);
          seedGeo.scale(1, 2, 1);
          const seedMat = new THREE.MeshStandardMaterial({
            color: 0xd4aa00,
            roughness: 0.5,
            metalness: 0.0,
          });
          const seed = new THREE.Mesh(seedGeo, seedMat);
          seed.position.set(
            Math.cos(angle) * seedR,
            Math.sin(angle) * seedR,
            0.002,
          );
          seed.rotation.z = angle;
          group.add(seed);
        }
        break;
      }

      case 'pomegranate': {
        // Many small seeds (arils) inside
        const arilCount = seedDesc.count;
        const arilGeo = new THREE.SphereGeometry(seedDesc.relativeSize * size, 5, 4);
        const arilMat = new THREE.MeshStandardMaterial({
          color: seedDesc.color,
          roughness: 0.4,
          metalness: 0.0,
          transparent: true,
          opacity: 0.85,
        });

        for (let i = 0; i < arilCount; i++) {
          const angle = rng.uniform(0, Math.PI * 2);
          const dist = rng.uniform(0, size * 0.8);
          const aril = new THREE.Mesh(arilGeo, arilMat);
          aril.position.set(
            Math.cos(angle) * dist,
            Math.sin(angle) * dist,
            0.002,
          );
          aril.castShadow = true;
          group.add(aril);
        }
        break;
      }

      case 'apple':
      case 'pear': {
        // Core with seeds in star pattern
        const coreShape = new THREE.Shape();
        const coreR = size * 0.3;
        for (let i = 0; i <= 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const r2 = coreR * (0.9 + Math.sin(angle * 5) * 0.1);
          const x = Math.cos(angle) * r2;
          const y = Math.sin(angle) * r2;
          if (i === 0) coreShape.moveTo(x, y);
          else coreShape.lineTo(x, y);
        }
        const coreGeo = new THREE.ShapeGeometry(coreShape, 2);
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0xd0c890,
          roughness: 0.7,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.z = 0.001;
        group.add(core);

        // Seeds
        const seedCount = seedDesc.count;
        for (let i = 0; i < seedCount; i++) {
          const angle = (i / seedCount) * Math.PI * 2;
          const sr = coreR * 0.5;
          const seedMesh = new THREE.Mesh(
            new THREE.SphereGeometry(seedDesc.relativeSize * size, 4, 3),
            new THREE.MeshStandardMaterial({ color: seedDesc.color, roughness: 0.6 }),
          );
          seedMesh.position.set(Math.cos(angle) * sr, Math.sin(angle) * sr, 0.003);
          group.add(seedMesh);
        }
        break;
      }

      default: {
        // Generic cross-section with random seeds
        if (seedDesc) {
          const seedGeo = new THREE.SphereGeometry(seedDesc.relativeSize * size, 4, 3);
          const seedMat = new THREE.MeshStandardMaterial({
            color: seedDesc.color,
            roughness: 0.6,
            metalness: 0.0,
          });

          for (let i = 0; i < Math.min(seedDesc.count, 20); i++) {
            const angle = rng.uniform(0, Math.PI * 2);
            const dist = rng.uniform(0, size * 0.7);
            const seed = new THREE.Mesh(seedGeo, seedMat);
            seed.position.set(
              Math.cos(angle) * dist,
              Math.sin(angle) * dist,
              0.002,
            );
            group.add(seed);
          }
        }
        break;
      }
    }

    // Outer skin ring
    const ringGeo = new THREE.RingGeometry(size * 0.9, size, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a1a,
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = -0.001;
    group.add(ring);

    return group;
  }

  /**
   * Create a stem from the stem library.
   */
  static createStemFromLibrary(
    fruitType: string,
    fruitSize: number,
    rng: SeededRandom,
  ): THREE.Mesh | null {
    const desc = STEM_LIBRARY[fruitType];
    if (!desc) return null;

    const length = desc.relativeLength * fruitSize;
    const thickness = desc.relativeThickness * fruitSize;

    switch (desc.type) {
      case 'simple': {
        const geo = new THREE.CylinderGeometry(thickness * 0.6, thickness, length, 5);
        const mat = new THREE.MeshStandardMaterial({
          color: desc.color,
          roughness: 0.7,
          metalness: 0.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = fruitSize + length * 0.5;
        mesh.castShadow = true;
        return mesh;
      }

      case 'curved': {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(rng.uniform(-0.01, 0.01), length * 0.5, rng.uniform(-0.01, 0.01)),
          new THREE.Vector3(rng.uniform(-0.02, 0.02), length, rng.uniform(-0.02, 0.02)),
        );
        const geo = new THREE.TubeGeometry(curve, 6, thickness, 4, false);
        const mat = new THREE.MeshStandardMaterial({
          color: desc.color,
          roughness: 0.7,
          metalness: 0.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = fruitSize * 0.9;
        mesh.castShadow = true;
        return mesh;
      }

      case 'calyx': {
        // Green sepal ring at top
        const calyxGroup = new THREE.Group();
        const sepalCount = rng.nextInt(5, 8);
        for (let i = 0; i < sepalCount; i++) {
          const angle = (i / sepalCount) * Math.PI * 2;
          const sepalLen = length;
          const sepalWidth = sepalLen * 0.4;
          const shape = new THREE.Shape();
          shape.moveTo(0, 0);
          shape.quadraticCurveTo(sepalWidth * 0.5, sepalLen * 0.4, 0, sepalLen);
          shape.quadraticCurveTo(-sepalWidth * 0.5, sepalLen * 0.4, 0, 0);
          const sepalGeo = new THREE.ShapeGeometry(shape, 2);
          const sepalMat = new THREE.MeshStandardMaterial({
            color: desc.color,
            roughness: 0.6,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
          const sepal = new THREE.Mesh(sepalGeo, sepalMat);
          sepal.position.set(
            Math.cos(angle) * thickness * 2,
            fruitSize * 0.95,
            Math.sin(angle) * thickness * 2,
          );
          sepal.rotation.set(-Math.PI / 3, angle, 0);
          sepal.castShadow = true;
          calyxGroup.add(sepal);
        }
        // Return as a single mesh by creating a simple stem
        const geo = new THREE.CylinderGeometry(thickness * 0.5, thickness, length * 0.5, 5);
        const mat = new THREE.MeshStandardMaterial({ color: desc.color, roughness: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = fruitSize;
        mesh.castShadow = true;
        return mesh;
      }

      case 'crown': {
        // Spiky crown (like pineapple top)
        const geo = new THREE.CylinderGeometry(thickness, thickness * 2, length * 0.3, 5);
        const mat = new THREE.MeshStandardMaterial({ color: desc.color, roughness: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = fruitSize;
        mesh.castShadow = true;
        return mesh;
      }

      case 'husk': {
        // Thick husk connection (like coconut)
        const geo = new THREE.CylinderGeometry(thickness, thickness * 1.5, length, 6);
        const mat = new THREE.MeshStandardMaterial({ color: desc.color, roughness: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = fruitSize;
        mesh.castShadow = true;
        return mesh;
      }

      default:
        return null;
    }
  }

  /**
   * Generate seeds from the seed library for a given fruit type.
   */
  static generateSeedsFromLibrary(
    fruitType: string,
    fruitSize: number,
    rng: SeededRandom,
  ): THREE.InstancedMesh | null {
    const desc = SEED_LIBRARY[fruitType];
    if (!desc) return null;

    const seedSize = desc.relativeSize * fruitSize;
    let seedGeo: THREE.BufferGeometry;

    switch (desc.shape) {
      case 'ellipsoid':
        seedGeo = new THREE.SphereGeometry(seedSize, 5, 4);
        seedGeo.scale(1, 1.5, 0.8);
        break;
      case 'flat':
        seedGeo = new THREE.SphereGeometry(seedSize, 5, 4);
        seedGeo.scale(1.2, 0.5, 1);
        break;
      case 'teardrop':
        seedGeo = new THREE.ConeGeometry(seedSize * 0.5, seedSize * 1.5, 5);
        break;
      case 'angular':
      default:
        seedGeo = new THREE.OctahedronGeometry(seedSize, 0);
        break;
    }

    const seedMat = new THREE.MeshStandardMaterial({
      color: desc.color,
      roughness: 0.6,
      metalness: 0.0,
    });

    const count = Math.min(desc.count, 30);
    const instanced = new THREE.InstancedMesh(seedGeo, seedMat, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      let x: number, y: number, z: number;

      switch (desc.arrangement) {
        case 'radial': {
          const angle = (i / count) * Math.PI * 2;
          const r = fruitSize * 0.3;
          x = Math.cos(angle) * r;
          y = fruitSize * 0.5 + rng.uniform(-fruitSize * 0.1, fruitSize * 0.1);
          z = Math.sin(angle) * r;
          break;
        }
        case 'spiral': {
          const goldenAngle = Math.PI * (3 - Math.sqrt(5));
          const t = i / count;
          const angle = i * goldenAngle;
          const r = fruitSize * 0.5 * Math.sqrt(t);
          x = Math.cos(angle) * r;
          y = t * fruitSize;
          z = Math.sin(angle) * r;
          break;
        }
        case 'segmented': {
          const angle = (i / count) * Math.PI * 2;
          const r = fruitSize * rng.uniform(0.1, 0.5);
          x = Math.cos(angle) * r;
          y = rng.uniform(0, fruitSize);
          z = Math.sin(angle) * r;
          break;
        }
        case 'random':
        default: {
          const theta = rng.uniform(0, Math.PI * 2);
          const phi = Math.acos(rng.uniform(-1, 1));
          const r = fruitSize * rng.uniform(0.1, 0.6);
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta) + fruitSize * 0.5;
          z = r * Math.cos(phi);
          break;
        }
      }

      dummy.position.set(x, y, z);
      dummy.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI * 2), rng.uniform(0, Math.PI));
      dummy.scale.setScalar(rng.uniform(0.7, 1.3));
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = true;
    return instanced;
  }
}

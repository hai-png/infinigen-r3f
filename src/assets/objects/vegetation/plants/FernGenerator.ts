/**
 * FernGenerator - Procedural fern: central stem + frond leaves (visible pinnae)
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type FernSpecies = 'boston' | 'maidenhair' | 'bird_nest' | 'staghorn' | 'tree_fern';

export interface FernConfig extends BaseGeneratorConfig {
  frondCount: number;
  frondLength: number;
  pinnaePerFrond: number;
  curvature: number;
  species: FernSpecies;
  size: number;
}

export class FernGenerator extends BaseObjectGenerator<FernConfig> {
  getDefaultConfig(): FernConfig {
    return {
      frondCount: 12,
      frondLength: 0.4,
      pinnaePerFrond: 16,
      curvature: 0.5,
      species: 'boston',
      size: 1.0
    };
  }

  generate(config: Partial<FernConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Central stem base (small)
    const baseGeom = new THREE.CylinderGeometry(0.008, 0.012, 0.05, 6);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.7, metalness: 0.0 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.025;
    group.add(base);

    // Generate fronds radiating outward and upward
    for (let i = 0; i < fullConfig.frondCount; i++) {
      const frond = this.createFrond(fullConfig, rng, i);
      group.add(frond);
    }

    group.userData.tags = ['vegetation', 'fern', fullConfig.species];
    return group;
  }

  private createFrond(config: FernConfig, rng: SeededRandom, index: number): THREE.Group {
    const frondGroup = new THREE.Group();
    // Spread fronds in a fan around the base
    const baseAngle = (index / config.frondCount) * Math.PI * 2;
    const tiltAngle = rng.uniform(0.3, 0.7); // How much the frond tilts outward

    frondGroup.rotation.y = baseAngle;
    frondGroup.rotation.x = -tiltAngle;

    // Create rachis (central stem of frond) as a curved tube
    const rachis = this.createRachis(config, rng);
    frondGroup.add(rachis);

    // Create pinnae (leaflets) — alternating on both sides, with visible thickness
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, config.frondLength * 0.5, config.curvature * 0.1),
      new THREE.Vector3(0, config.frondLength, config.curvature * 0.2)
    ]);

    for (let i = 0; i < config.pinnaePerFrond; i++) {
      const t = (i + 1) / (config.pinnaePerFrond + 1);
      const point = curve.getPoint(t);
      // Pinnae get shorter toward the tip
      const pinnaLength = config.frondLength * 0.25 * (1 - t * 0.7);
      const side = (i % 2 === 0) ? 1 : -1;

      const pinna = this.createPinna(pinnaLength, rng, side);
      pinna.position.copy(point);
      pinna.rotation.z = side * (Math.PI / 2 - t * 0.3);
      pinna.rotation.y = side * 0.2;
      frondGroup.add(pinna);
    }

    return frondGroup;
  }

  private createRachis(config: FernConfig, rng: SeededRandom): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, config.frondLength * 0.5, config.curvature * 0.1),
      new THREE.Vector3(0, config.frondLength, config.curvature * 0.2)
    ]);
    const geometry = new THREE.TubeGeometry(curve, 12, 0.006, 4, false);
    const material = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.7, metalness: 0.0 });
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Create a single pinna (leaflet) — visible shape with proper thickness
   */
  private createPinna(length: number, rng: SeededRandom, side: number): THREE.Mesh {
    const width = 0.015;
    // Use a tapered shape for visibility
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width * 2, length * 0.4, 0, length);
    shape.quadraticCurveTo(-width * 2, length * 0.4, 0, 0);

    const geometry = new THREE.ShapeGeometry(shape, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3d7a2f,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geometry, material);
  }
}

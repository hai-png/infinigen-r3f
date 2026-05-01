/**
 * PalmGenerator - Palm trees: curved trunk + radiating fronds
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type PalmType = 'coconut' | 'date' | 'fan' | 'sago';
export interface PalmConfig extends BaseGeneratorConfig {
  trunkHeight: number;
  trunkRadius: number;
  frondCount: number;
  frondLength: number;
  palmType: PalmType;
  curvature: number;
}

export class PalmGenerator extends BaseObjectGenerator<PalmConfig> {
  getDefaultConfig(): PalmConfig {
    return { trunkHeight: 4.0, trunkRadius: 0.15, frondCount: 12, frondLength: 1.5, palmType: 'coconut', curvature: 0.3 };
  }

  generate(config: Partial<PalmConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Curved trunk
    const trunk = this.createCurvedTrunk(fullConfig, rng);
    group.add(trunk);

    // Radiating fronds at top of trunk
    const fronds = this.createFronds(fullConfig, rng);
    fronds.position.y = fullConfig.trunkHeight;
    group.add(fronds);

    // Coconuts for coconut type
    if (fullConfig.palmType === 'coconut') {
      const coconuts = this.createCoconuts(rng);
      coconuts.position.y = fullConfig.trunkHeight - 0.2;
      group.add(coconuts);
    }

    group.userData.tags = ['vegetation', 'tree', 'palm', fullConfig.palmType];
    return group;
  }

  private createCurvedTrunk(config: PalmConfig, rng: SeededRandom): THREE.Mesh {
    // Create a curved trunk using CatmullRomCurve3
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(config.curvature * 0.5, config.trunkHeight * 0.3, rng.uniform(-0.1, 0.1)),
      new THREE.Vector3(config.curvature, config.trunkHeight * 0.7, rng.uniform(-0.1, 0.1)),
      new THREE.Vector3(config.curvature * 0.8, config.trunkHeight, 0),
    ]);
    const geom = new THREE.TubeGeometry(curve, 16, config.trunkRadius, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create radiating fronds — each frond has a stem + leaf blades
   */
  private createFronds(config: PalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    for (let i = 0; i < config.frondCount; i++) {
      const angle = (i / config.frondCount) * Math.PI * 2 + rng.uniform(-0.05, 0.05);
      const frond = this.createSingleFrond(config, rng);
      frond.rotation.y = angle;
      frond.rotation.x = -0.3 - rng.uniform(0, 0.4); // droop
      group.add(frond);
    }

    return group;
  }

  private createSingleFrond(config: PalmConfig, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();

    // Frond stem (tube along curve)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(config.frondLength * 0.5, 0.2, 0),
      new THREE.Vector3(config.frondLength, -0.3, 0),
    ]);
    const stemGeom = new THREE.TubeGeometry(curve, 12, 0.025, 4, false);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.7, metalness: 0.0 });
    const stem = new THREE.Mesh(stemGeom, stemMat);
    group.add(stem);

    // Frond leaf blades along the stem
    const bladeCount = 10;
    for (let j = 1; j <= bladeCount; j++) {
      const t = j / (bladeCount + 1);
      const point = curve.getPoint(t);
      const bladeLength = config.frondLength * 0.3 * (1 - t * 0.5);
      const bladeWidth = 0.1 * (1 - t * 0.3);

      for (const side of [-1, 1]) {
        const bladeShape = new THREE.Shape();
        bladeShape.moveTo(0, 0);
        bladeShape.quadraticCurveTo(side * bladeWidth, bladeLength * 0.5, 0, bladeLength);
        bladeShape.quadraticCurveTo(side * bladeWidth * 0.3, bladeLength * 0.5, 0, 0);

        const bladeGeom = new THREE.ShapeGeometry(bladeShape, 3);
        const bladeMat = new THREE.MeshStandardMaterial({
          color: 0x3d8a2f,
          roughness: 0.6,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
        const blade = new THREE.Mesh(bladeGeom, bladeMat);
        blade.position.copy(point);
        blade.rotation.y = side * 0.5;
        blade.rotation.x = -0.3 * t;
        group.add(blade);
      }
    }

    return group;
  }

  private createCoconuts(rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const count = rng.nextInt(2, 5);
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8, metalness: 0.0 });

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const geom = new THREE.SphereGeometry(0.06, 8, 8);
      const mesh = new THREE.Mesh(geom, coconutMat);
      mesh.position.set(Math.cos(angle) * 0.1, 0, Math.sin(angle) * 0.1);
      group.add(mesh);
    }
    return group;
  }
}

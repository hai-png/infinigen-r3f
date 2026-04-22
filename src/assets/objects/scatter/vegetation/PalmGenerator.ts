/**
 * PalmGenerator - Palm trees
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';

export type PalmType = 'coconut' | 'date' | 'fan' | 'sago';
export interface PalmConfig {
  trunkHeight: number;
  trunkRadius: number;
  frondCount: number;
  frondLength: number;
  palmType: PalmType;
}

export class PalmGenerator extends BaseObjectGenerator<PalmConfig> {
  getDefaultConfig(): PalmConfig {
    return { trunkHeight: 4.0, trunkRadius: 0.15, frondCount: 12, frondLength: 1.5, palmType: 'coconut' };
  }

  generate(config: Partial<PalmConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const group = new THREE.Group();
    const trunk = this.createTrunk(fullConfig);
    group.add(trunk);
    for (let i = 0; i < fullConfig.frondCount; i++) {
      const frond = this.createFrond(fullConfig, i);
      frond.position.y = fullConfig.trunkHeight;
      group.add(frond);
    }
    group.userData.tags = ['vegetation', 'tree', 'palm', fullConfig.palmType];
    return group;
  }

  private createTrunk(config: PalmConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.trunkRadius * 0.8, config.trunkRadius, config.trunkHeight, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
    return new THREE.Mesh(geom, mat);
  }

  private createFrond(config: PalmConfig, index: number): THREE.Group {
    const group = new THREE.Group();
    const angle = (index / config.frondCount) * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(angle) * config.frondLength * 0.5, -0.5, Math.sin(angle) * config.frondLength * 0.5),
      new THREE.Vector3(Math.cos(angle) * config.frondLength, -1.0, Math.sin(angle) * config.frondLength)
    ]);
    const geom = new THREE.TubeGeometry(curve, 16, 0.03, 6, false);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f });
    const frond = new THREE.Mesh(geom, mat);
    frond.rotation.y = angle;
    group.add(frond);
    return group;
  }
}

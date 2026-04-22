/**
 * IvyGenerator - Climbing plants with segmented growth
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';

export interface IvyConfig {
  vineLength: number;
  segmentCount: number;
  leafSize: number;
  leafDensity: number;
  curvature: number;
}

export class IvyGenerator extends BaseObjectGenerator<IvyConfig> {
  getDefaultConfig(): IvyConfig {
    return { vineLength: 1.0, segmentCount: 20, leafSize: 0.05, leafDensity: 0.7, curvature: 0.3 };
  }

  generate(config: Partial<IvyConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    const vine = this.createVine(fullConfig, rng);
    group.add(vine);
    group.userData.tags = ['vegetation', 'ivy', 'climbing'];
    return group;
  }

  private createVine(config: IvyConfig, rng: SeededRandom): THREE.Group {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= config.segmentCount; i++) {
      const t = i / config.segmentCount;
      points.push(new THREE.Vector3(
        Math.sin(t * Math.PI * 2) * config.curvature * t,
        t * config.vineLength,
        Math.cos(t * Math.PI * 2) * config.curvature * t
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const vineGeom = new THREE.TubeGeometry(curve, config.segmentCount, 0.005, 6, false);
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f });
    const vine = new THREE.Mesh(vineGeom, vineMat);

    for (let i = 0; i < config.segmentCount * config.leafDensity; i++) {
      const t = i / (config.segmentCount * config.leafDensity);
      const point = curve.getPoint(t);
      const leaf = this.createLeaf(config, rng);
      leaf.position.copy(point);
      leaf.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI), rng.uniform(0, Math.PI));
      vine.add(leaf);
    }
    return vine;
  }

  private createLeaf(config: IvyConfig, rng: SeededRandom): THREE.Mesh {
    const shape = new THREE.Shape();
    const s = config.leafSize;
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.5, s, s, 0);
    shape.quadraticCurveTo(s * 0.5, -s, 0, 0);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.001, bevelEnabled: false });
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d7a2f, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }
}

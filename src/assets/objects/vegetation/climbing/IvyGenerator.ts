/**
 * IvyGenerator - Climbing plants with BRANCHING vine + leaves
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export interface IvyConfig extends BaseGeneratorConfig {
  vineLength: number;
  segmentCount: number;
  leafSize: number;
  leafDensity: number;
  curvature: number;
  branchCount: number;
}

export class IvyGenerator extends BaseObjectGenerator<IvyConfig> {
  getDefaultConfig(): IvyConfig {
    return { vineLength: 1.0, segmentCount: 20, leafSize: 0.05, leafDensity: 0.7, curvature: 0.3, branchCount: 4 };
  }

  generate(config: Partial<IvyConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Main vine
    const mainVine = this.createVine(fullConfig, rng, 0);
    group.add(mainVine);

    // Branching vines
    for (let b = 0; b < fullConfig.branchCount; b++) {
      const branchConfig = { ...fullConfig };
      branchConfig.vineLength = fullConfig.vineLength * rng.uniform(0.3, 0.6);
      branchConfig.segmentCount = Math.max(5, Math.floor(fullConfig.segmentCount * 0.5));
      branchConfig.curvature = fullConfig.curvature * rng.uniform(0.5, 1.5);

      const branch = this.createVine(branchConfig, rng, b + 1);

      // Position branch at a point along the main vine
      const attachT = rng.uniform(0.2, 0.8);
      const attachY = attachT * fullConfig.vineLength;
      const sideAngle = (b / fullConfig.branchCount) * Math.PI * 2;
      branch.position.set(
        Math.cos(sideAngle) * 0.05,
        attachY,
        Math.sin(sideAngle) * 0.05
      );
      branch.rotation.y = sideAngle;

      group.add(branch);
    }

    group.userData.tags = ['vegetation', 'ivy', 'climbing'];
    return group;
  }

  private createVine(config: IvyConfig, rng: SeededRandom, vineIndex: number): THREE.Group {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= config.segmentCount; i++) {
      const t = i / config.segmentCount;
      points.push(new THREE.Vector3(
        Math.sin(t * Math.PI * 2 + vineIndex) * config.curvature * t,
        t * config.vineLength,
        Math.cos(t * Math.PI * 2 + vineIndex) * config.curvature * t
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const vineGeom = new THREE.TubeGeometry(curve, config.segmentCount, 0.005, 6, false);
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.8, metalness: 0.0 });
    const vineMesh = new THREE.Mesh(vineGeom, vineMat);
    vineMesh.castShadow = true;

    const vine = new THREE.Group();
    vine.add(vineMesh);

    // Leaves along the vine
    const leafCount = Math.floor(config.segmentCount * config.leafDensity);
    for (let i = 0; i < leafCount; i++) {
      const t = i / leafCount;
      const point = curve.getPoint(t);
      const leaf = this.createLeaf(config, rng);
      leaf.position.copy(point);
      leaf.rotation.set(rng.uniform(0, Math.PI), rng.uniform(0, Math.PI), rng.uniform(0, Math.PI));
      vine.add(leaf);
    }

    return vine;
  }

  private createLeaf(config: IvyConfig, rng: SeededRandom): THREE.Mesh {
    const s = config.leafSize;
    const shape = new THREE.Shape();
    // Ivy-like leaf shape — pointed lobes
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.3, s * 0.5, s * 0.2, s * 0.8);
    shape.quadraticCurveTo(s * 0.5, s * 1.0, 0, s * 1.2);
    shape.quadraticCurveTo(-s * 0.5, s * 1.0, -s * 0.2, s * 0.8);
    shape.quadraticCurveTo(-s * 0.3, s * 0.5, 0, 0);
    const geom = new THREE.ShapeGeometry(shape, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d7a2f, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }
}

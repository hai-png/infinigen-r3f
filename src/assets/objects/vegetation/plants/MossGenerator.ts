/**
 * MossGenerator - Moss and lichen: bumpy patches
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type MossType = 'sheet' | 'clump' | 'lichen';
export interface MossConfig extends BaseGeneratorConfig {
  patchSize: number;
  density: number;
  height: number;
  mossType: MossType;
  color: number;
}

export class MossGenerator extends BaseObjectGenerator<MossConfig> {
  getDefaultConfig(): MossConfig {
    return { patchSize: 0.5, density: 100, height: 0.02, mossType: 'sheet', color: 0x4a7c23 };
  }

  generate(config: Partial<MossConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    switch (fullConfig.mossType) {
      case 'clump':
        group.add(this.createClumpPatch(fullConfig, rng));
        break;
      case 'lichen':
        group.add(this.createLichenPatch(fullConfig, rng));
        break;
      default:
        group.add(this.createSheetPatch(fullConfig, rng));
    }

    group.userData.tags = ['vegetation', 'moss', fullConfig.mossType];
    return group;
  }

  /**
   * Sheet moss — bumpy ground patch using displaced geometry
   */
  private createSheetPatch(config: MossConfig, rng: SeededRandom): THREE.Mesh {
    // Create a flat plane with enough vertices for bumps
    const segments = Math.max(8, Math.floor(Math.sqrt(config.density)));
    const geometry = new THREE.PlaneGeometry(config.patchSize * 2, config.patchSize * 2, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Displace vertices to create bumpy surface
    const posAttr = geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      // Create organic bumps using layered sin
      const bump = (
        Math.sin(x * 15 + rng.next() * 2) * 0.5 +
        Math.sin(z * 12 + rng.next() * 2) * 0.3 +
        Math.sin((x + z) * 8) * 0.2
      ) * config.height;
      posAttr.setY(i, bump);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = config.height;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Clump moss — sphere cluster for raised moss
   */
  private createClumpPatch(config: MossConfig, rng: SeededRandom): THREE.Mesh {
    const count = Math.min(config.density, 80);
    const geom = new THREE.SphereGeometry(0.02, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.9, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geom, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = rng.uniform(-config.patchSize, config.patchSize);
      const z = rng.uniform(-config.patchSize, config.patchSize);
      const y = config.height + rng.uniform(0, config.height * 2);
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.5 + rng.uniform(0, 1.0));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Lichen — flat patch with color variation
   */
  private createLichenPatch(config: MossConfig, rng: SeededRandom): THREE.Mesh {
    const segments = Math.max(6, Math.floor(Math.sqrt(config.density * 0.5)));
    const geometry = new THREE.PlaneGeometry(config.patchSize * 1.5, config.patchSize * 1.5, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Subtle bumps
    const posAttr = geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const bump = Math.sin(x * 20 + z * 15) * config.height * 0.5;
      posAttr.setY(i, bump);
    }
    geometry.computeVertexNormals();

    // Lichen is typically pale green/gray
    const lichenColor = new THREE.Color(config.color).lerp(new THREE.Color(0xcccccc), 0.3);
    const material = new THREE.MeshStandardMaterial({
      color: lichenColor,
      roughness: 0.95,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = config.height * 0.5;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

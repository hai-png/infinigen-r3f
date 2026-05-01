/**
 * MushroomGenerator - Mushroom varieties: stem + cap
 * All geometries in Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */
import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

export type MushroomType = 'button' | 'shiitake' | 'fly_agaric' | 'puffball' | 'morel';
export interface MushroomConfig extends BaseGeneratorConfig {
  capSize: number;
  stemHeight: number;
  stemThickness: number;
  mushroomType: MushroomType;
  gillDetail: boolean;
}

export class MushroomGenerator extends BaseObjectGenerator<MushroomConfig> {
  getDefaultConfig(): MushroomConfig {
    return { capSize: 0.1, stemHeight: 0.15, stemThickness: 0.03, mushroomType: 'button', gillDetail: true };
  }

  generate(config: Partial<MushroomConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const group = new THREE.Group();
    const stem = this.createStem(fullConfig);
    const cap = this.createCap(fullConfig);
    cap.position.y = fullConfig.stemHeight;
    group.add(stem, cap);
    if (fullConfig.gillDetail && fullConfig.mushroomType !== 'puffball') {
      const gills = this.createGills(fullConfig);
      gills.position.y = fullConfig.stemHeight;
      group.add(gills);
    }
    group.userData.tags = ['vegetation', 'mushroom', fullConfig.mushroomType];
    return group;
  }

  private createStem(config: MushroomConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.stemThickness * 0.8, config.stemThickness, config.stemHeight, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.8, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = config.stemHeight / 2;
    mesh.castShadow = true;
    return mesh;
  }

  private createCap(config: MushroomConfig): THREE.Mesh {
    let geom: THREE.BufferGeometry;
    switch (config.mushroomType) {
      case 'fly_agaric':
        // Half-sphere cap (dome shape)
        geom = new THREE.SphereGeometry(config.capSize, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        break;
      case 'morel':
        // Elongated conical cap
        geom = new THREE.ConeGeometry(config.capSize * 0.8, config.capSize * 2, 12);
        break;
      case 'puffball':
        // Nearly full sphere
        geom = new THREE.SphereGeometry(config.capSize, 16, 12);
        break;
      default:
        // Button / shiitake — dome-shaped cap
        geom = new THREE.SphereGeometry(config.capSize, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    }

    const colorMap: Record<string, number> = {
      fly_agaric: 0xff0000,
      morel: 0x8b6914,
      puffball: 0xf0ead6,
      shiitake: 0x8b6914,
      button: 0xf5f5dc,
    };
    const color = colorMap[config.mushroomType] || 0x8b4513;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private createGills(config: MushroomConfig): THREE.Group {
    const group = new THREE.Group();
    const count = 16;
    const gillMat = new THREE.MeshStandardMaterial({ color: 0xffc0cb, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const gillGeom = new THREE.PlaneGeometry(config.capSize * 0.8, 0.02);
      const gill = new THREE.Mesh(gillGeom, gillMat);
      gill.rotation.x = Math.PI / 2;
      gill.rotation.z = angle;
      gill.position.y = -0.01;
      group.add(gill);
    }
    return group;
  }
}

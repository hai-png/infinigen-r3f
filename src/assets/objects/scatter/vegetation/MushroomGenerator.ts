/**
 * MushroomGenerator - Mushroom varieties
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../math/distributions';

export type MushroomType = 'button' | 'shiitake' | 'fly_agaric' | 'puffball' | 'morel';
export interface MushroomConfig {
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
      group.add(gills);
    }
    group.userData.tags = ['vegetation', 'mushroom', fullConfig.mushroomType];
    return group;
  }

  private createStem(config: MushroomConfig): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(config.stemThickness * 0.8, config.stemThickness, config.stemHeight, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc });
    return new THREE.Mesh(geom, mat);
  }

  private createCap(config: MushroomConfig): THREE.Mesh {
    let geom: THREE.SphereGeometry;
    switch (config.mushroomType) {
      case 'fly_agaric':
        geom = new THREE.SphereGeometry(config.capSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        break;
      case 'morel':
        geom = new THREE.SphereGeometry(config.capSize, 16, 16, 0, Math.PI * 2, 0, Math.PI / 3);
        break;
      default:
        geom = new THREE.SphereGeometry(config.capSize, 16, 16);
    }
    const color = config.mushroomType === 'fly_agaric' ? 0xff0000 : 0x8b4513;
    const mat = new THREE.MeshStandardMaterial({ color });
    return new THREE.Mesh(geom, mat);
  }

  private createGills(config: MushroomConfig): THREE.Group {
    const group = new THREE.Group();
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const gill = new THREE.Mesh(
        new THREE.PlaneGeometry(config.capSize * 0.8, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffc0cb, side: THREE.DoubleSide })
      );
      gill.rotation.x = Math.PI / 2;
      gill.rotation.z = angle;
      gill.position.y = -0.01;
      group.add(gill);
    }
    return group;
  }
}

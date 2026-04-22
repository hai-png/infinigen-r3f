/**
 * SeasonalVariation - Season changes system
 */
import * as THREE from 'three';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export interface SeasonalConfig {
  season: Season;
  leafColorSpring: number;
  leafColorSummer: number;
  leafColorAutumn: number;
  snowCoverage: number;
}

export class SeasonalVariation {
  private config: SeasonalConfig;
  
  constructor(config: Partial<SeasonalConfig> = {}) {
    this.config = {
      season: 'summer',
      leafColorSpring: 0x90ee90,
      leafColorSummer: 0x2d5a1f,
      leafColorAutumn: 0xff6347,
      snowCoverage: 0.5,
      ...config
    };
  }

  applySeason(object: THREE.Object3D, season: Season): void {
    this.config.season = season;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        this.modifyMaterial(child.material, season);
      }
    });
  }

  private modifyMaterial(material: THREE.MeshStandardMaterial, season: Season): void {
    if (season === 'spring') {
      material.color.setHex(this.config.leafColorSpring);
    } else if (season === 'summer') {
      material.color.setHex(this.config.leafColorSummer);
    } else if (season === 'autumn') {
      material.color.setHex(this.config.leafColorAutumn);
    } else if (season === 'winter') {
      material.color.setHex(0xffffff);
      material.opacity = 0.8;
      material.transparent = true;
    }
  }

  getSeasonProgress(from: Season, to: Season, t: number): SeasonalConfig {
    // Simple interpolation placeholder
    return this.config;
  }
}

/**
 * SeasonalVariation - Season changes system
 */
import * as THREE from 'three';
export class SeasonalVariation {
    constructor(config = {}) {
        this.config = {
            season: 'summer',
            leafColorSpring: 0x90ee90,
            leafColorSummer: 0x2d5a1f,
            leafColorAutumn: 0xff6347,
            snowCoverage: 0.5,
            ...config
        };
    }
    applySeason(object, season) {
        this.config.season = season;
        object.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                this.modifyMaterial(child.material, season);
            }
        });
    }
    modifyMaterial(material, season) {
        if (season === 'spring') {
            material.color.setHex(this.config.leafColorSpring);
        }
        else if (season === 'summer') {
            material.color.setHex(this.config.leafColorSummer);
        }
        else if (season === 'autumn') {
            material.color.setHex(this.config.leafColorAutumn);
        }
        else if (season === 'winter') {
            material.color.setHex(0xffffff);
            material.opacity = 0.8;
            material.transparent = true;
        }
    }
    getSeasonProgress(from, to, t) {
        // Simple interpolation placeholder
        return this.config;
    }
}
//# sourceMappingURL=SeasonalVariation.js.map
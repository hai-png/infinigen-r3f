/**
 * AmphibianGenerator - Procedural amphibian generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class AmphibianGenerator extends CreatureBase {
    getDefaultParameters() {
        return {
            ...super.getDefaultParameters(),
            creatureType: CreatureType.AMPHIBIAN,
            skinTexture: 'smooth',
            hasTail: false,
            webbedFeet: true,
            primaryColor: '#228B22',
        };
    }
    generate(species, params = {}) {
        const parameters = { ...this.getDefaultParameters(), ...params };
        this.applySpeciesDefaults(species, parameters);
        const amphibian = new Group();
        amphibian.name = `Amphibian_${species}`;
        amphibian.add(this.generateBody(parameters));
        if (parameters.hasTail) {
            amphibian.add(this.generateTail(parameters));
        }
        return amphibian;
    }
    applySpeciesDefaults(species, params) {
        switch (species) {
            case 'frog':
                params.hasTail = false;
                params.size = 0.1;
                params.webbedFeet = true;
                params.primaryColor = '#32CD32';
                break;
            case 'salamander':
                params.hasTail = true;
                params.size = 0.2;
                params.skinTexture = 'smooth';
                params.primaryColor = '#FF8C00';
                break;
            case 'newt':
                params.hasTail = true;
                params.size = 0.15;
                params.primaryColor = '#FFD700';
                break;
            case 'toad':
                params.hasTail = false;
                params.size = 0.12;
                params.skinTexture = 'warty';
                params.primaryColor = '#8B4513';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.4);
        const material = new Mesh.StandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    generateTail(params) {
        const geometry = this.createCylinderGeometry(params.size * 0.05, params.size * 0.02, params.size * 0.3);
        const material = new Mesh.StandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
}
//# sourceMappingURL=AmphibianGenerator.js.map
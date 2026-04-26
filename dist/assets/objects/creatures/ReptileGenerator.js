/**
 * ReptileGenerator - Procedural reptile generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
import { LegGenerator } from './parts/LegGenerator';
import { TailGenerator } from './parts/TailGenerator';
export class ReptileGenerator extends CreatureBase {
    constructor(seed) {
        super(seed);
    }
    getDefaultParameters() {
        return {
            ...super.getDefaultParameters(),
            creatureType: CreatureType.REPTILE,
            scalePattern: 'keeled',
            limbCount: 4,
            hasShell: false,
            primaryColor: '#228B22',
        };
    }
    generate(species, params = {}) {
        const parameters = { ...this.getDefaultParameters(), ...params };
        this.applySpeciesDefaults(species, parameters);
        const reptile = new Group();
        reptile.name = `Reptile_${species}`;
        const body = this.generateBody(parameters);
        reptile.add(body);
        if (parameters.limbCount > 0) {
            const legs = new LegGenerator(this.seed).generate('reptilian', parameters.limbCount, parameters.size * 0.25);
            reptile.add(legs);
        }
        const tail = new TailGenerator(this.seed).generate('tapered', parameters.size * 0.5);
        reptile.add(tail);
        return reptile;
    }
    applySpeciesDefaults(species, params) {
        switch (species) {
            case 'snake':
                params.limbCount = 0;
                params.size = 1.5;
                params.primaryColor = '#8B0000';
                break;
            case 'lizard':
                params.limbCount = 4;
                params.size = 0.3;
                params.primaryColor = '#228B22';
                break;
            case 'turtle':
                params.hasShell = true;
                params.limbCount = 4;
                params.size = 0.4;
                params.primaryColor = '#556B2F';
                break;
            case 'crocodile':
                params.limbCount = 4;
                params.size = 3.0;
                params.primaryColor = '#2F4F4F';
                break;
            case 'gecko':
                params.limbCount = 4;
                params.size = 0.15;
                params.scalePattern = 'granular';
                params.primaryColor = '#DAA520';
                break;
            case 'iguana':
                params.limbCount = 4;
                params.size = 0.8;
                params.primaryColor = '#32CD32';
                break;
        }
    }
    generateBody(params) {
        const geometry = params.hasShell
            ? this.createShellGeometry(params.size)
            : this.createElongatedGeometry(params.size);
        const material = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    createShellGeometry(size) {
        return this.createSphereGeometry(size * 0.5, 16, 8);
    }
    createElongatedGeometry(size) {
        return this.createCylinderGeometry(size * 0.1, size * 0.08, size, 8);
    }
}
//# sourceMappingURL=ReptileGenerator.js.map
/**
 * ReptileGenerator - Procedural reptile generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class ReptileGenerator extends CreatureBase {
    constructor(params = {}) {
        super({ ...params, seed: params.seed || Math.random() * 10000 });
    }
    getDefaultConfig() {
        return {
            ...this.params,
            creatureType: CreatureType.REPTILE,
            scalePattern: 'smooth',
            limbCount: 4,
            hasShell: false,
            primaryColor: '#228B22',
        };
    }
    generate(species = 'lizard', params = {}) {
        const parameters = this.mergeParameters(this.getDefaultConfig(), params);
        this.applySpeciesDefaults(species, parameters);
        const reptile = new Group();
        reptile.name = `Reptile_${species}`;
        reptile.add(this.generateBody(parameters));
        return reptile;
    }
    generateBodyCore() {
        return this.generateBody(this.getDefaultConfig());
    }
    generateHead() {
        return this.generateBody(this.getDefaultConfig());
    }
    generateLimbs() {
        return [];
    }
    generateAppendages() {
        return [];
    }
    applySkin(materials) {
        return materials;
    }
    applySpeciesDefaults(species, params) {
        switch (species) {
            case 'lizard':
                params.size = 0.3;
                params.scalePattern = 'smooth';
                params.limbCount = 4;
                params.hasShell = false;
                params.primaryColor = '#228B22';
                break;
            case 'snake':
                params.size = 1.0;
                params.scalePattern = 'smooth';
                params.limbCount = 0;
                params.hasShell = false;
                params.primaryColor = '#228B22';
                break;
            case 'turtle':
                params.size = 0.5;
                params.scalePattern = 'keeled';
                params.limbCount = 4;
                params.hasShell = true;
                params.primaryColor = '#2E8B57';
                break;
            case 'crocodile':
                params.size = 2.0;
                params.scalePattern = 'keeled';
                params.limbCount = 4;
                params.hasShell = false;
                params.primaryColor = '#556B2F';
                break;
            case 'gecko':
                params.size = 0.1;
                params.scalePattern = 'granular';
                params.limbCount = 4;
                params.hasShell = false;
                params.primaryColor = '#32CD32';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
        const material = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    createShellGeometry() {
        return this.createSphereGeometry(0.5);
    }
}
//# sourceMappingURL=ReptileGenerator.js.map
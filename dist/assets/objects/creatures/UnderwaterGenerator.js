/**
 * UnderwaterGenerator - Procedural underwater creature generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class UnderwaterGenerator extends CreatureBase {
    constructor(params = {}) {
        super({ ...params, seed: params.seed || Math.random() * 10000 });
    }
    getDefaultConfig() {
        return {
            ...this.params,
            creatureType: CreatureType.INVERTEBRATE,
            hasShell: false,
            swimMode: 'propulsion',
            depthRange: 'shallow',
            primaryColor: '#4169E1',
            secondaryColor: '#87CEEB',
        };
    }
    generate(species = 'jellyfish', params = {}) {
        const parameters = this.mergeParameters(this.getDefaultConfig(), params);
        this.applySpeciesDefaults(species, parameters);
        const marine = new Group();
        marine.name = `Marine_${species}`;
        marine.add(this.generateBody(parameters));
        if (parameters.hasShell) {
            marine.add(this.generateShell(parameters));
        }
        return marine;
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
            case 'jellyfish':
                params.size = 0.3;
                params.hasShell = false;
                params.swimMode = 'drift';
                params.primaryColor = '#FF69B4';
                params.secondaryColor = '#FFFFFF';
                break;
            case 'crab':
                params.size = 0.2;
                params.hasShell = true;
                params.swimMode = 'propulsion';
                params.primaryColor = '#FF6347';
                break;
            case 'starfish':
                params.size = 0.15;
                params.hasShell = false;
                params.swimMode = 'drift';
                params.primaryColor = '#FF8C00';
                break;
            case 'octopus':
                params.size = 0.4;
                params.hasShell = false;
                params.swimMode = 'jet';
                params.primaryColor = '#8B4513';
                break;
            case 'whale':
                params.size = 5.0;
                params.hasShell = false;
                params.swimMode = 'propulsion';
                params.depthRange = 'mid';
                params.primaryColor = '#2F2F2F';
                params.secondaryColor = '#FFFFFF';
                break;
            case 'dolphin':
                params.size = 1.5;
                params.hasShell = false;
                params.swimMode = 'propulsion';
                params.depthRange = 'shallow';
                params.primaryColor = '#708090';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
        const material = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    generateShell(params) {
        const geometry = this.createSphereGeometry(params.size * 0.2);
        const material = new MeshStandardMaterial({ color: params.secondaryColor });
        return new Mesh(geometry, material);
    }
}
//# sourceMappingURL=UnderwaterGenerator.js.map
/**
 * InsectGenerator - Procedural insect generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class InsectGenerator extends CreatureBase {
    constructor(params = {}) {
        super({ ...params, seed: params.seed || Math.random() * 10000 });
    }
    getDefaultConfig() {
        return {
            ...this.params,
            creatureType: CreatureType.INSECT,
            legCount: 6,
            hasWings: false,
            bodySegments: 3,
            primaryColor: '#2F2F2F',
        };
    }
    generate(species = 'ant', params = {}) {
        const parameters = this.mergeParameters(this.getDefaultConfig(), params);
        this.applySpeciesDefaults(species, parameters);
        const insect = new Group();
        insect.name = `Insect_${species}`;
        insect.add(this.generateBody(parameters));
        if (parameters.hasWings) {
            insect.add(this.generateWings(parameters));
        }
        return insect;
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
            case 'ant':
                params.size = 0.02;
                params.legCount = 6;
                params.hasWings = false;
                params.primaryColor = '#2F2F2F';
                break;
            case 'bee':
                params.size = 0.03;
                params.legCount = 6;
                params.hasWings = true;
                params.primaryColor = '#FFD700';
                break;
            case 'beetle':
                params.size = 0.05;
                params.legCount = 6;
                params.hasWings = true;
                params.primaryColor = '#228B22';
                break;
            case 'butterfly':
                params.size = 0.08;
                params.legCount = 6;
                params.hasWings = true;
                params.primaryColor = '#FF69B4';
                break;
            case 'spider':
                params.size = 0.04;
                params.legCount = 8;
                params.hasWings = false;
                params.primaryColor = '#2F2F2F';
                break;
            case 'grasshopper':
                params.size = 0.06;
                params.legCount = 6;
                params.hasWings = true;
                params.primaryColor = '#228B22';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
        const material = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    generateWings(params) {
        const geometry = this.createBoxGeometry(params.size * 0.5, 0.001, params.size * 0.3);
        const material = new MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5 });
        return new Mesh(geometry, material);
    }
    generateAntennae(_params) {
        const geometry = this.createCylinderGeometry(0.001, 0.001, 0.05);
        const material = new MeshStandardMaterial({ color: '#2F2F2F' });
        return new Mesh(geometry, material);
    }
}
//# sourceMappingURL=InsectGenerator.js.map
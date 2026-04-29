/**
 * FishGenerator - Procedural fish generation
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class FishGenerator extends CreatureBase {
    constructor(params = {}) {
        super({ ...params, seed: params.seed || Math.random() * 10000 });
    }
    getDefaultConfig() {
        return {
            ...this.params,
            creatureType: CreatureType.FISH,
            tailType: 'forked',
            scaleType: 'smooth',
            hasFins: true,
            primaryColor: '#FF8C00',
            secondaryColor: '#FFFFFF',
        };
    }
    generate(species = 'goldfish', params = {}) {
        const parameters = this.mergeParameters(this.getDefaultConfig(), params);
        this.applySpeciesDefaults(species, parameters);
        const fish = new Group();
        fish.name = `Fish_${species}`;
        fish.add(this.generateBody(parameters));
        if (parameters.hasFins) {
            fish.add(this.generateFins(parameters));
        }
        return fish;
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
        return this.generateFins(this.getDefaultConfig());
    }
    applySkin(materials) {
        return materials;
    }
    applySpeciesDefaults(species, params) {
        switch (species) {
            case 'goldfish':
                params.size = 0.1;
                params.tailType = 'rounded';
                params.primaryColor = '#FF8C00';
                break;
            case 'tuna':
                params.size = 2.0;
                params.tailType = 'forked';
                params.primaryColor = '#4169E1';
                break;
            case 'clownfish':
                params.size = 0.1;
                params.tailType = 'rounded';
                params.primaryColor = '#FF6347';
                break;
            case 'anglerfish':
                params.size = 0.5;
                params.tailType = 'forked';
                params.primaryColor = '#2F2F2F';
                break;
            case 'seahorse':
                params.size = 0.15;
                params.tailType = 'square';
                params.primaryColor = '#FFD700';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createEllipsoidGeometry(params.size * 0.3, params.size * 0.2, params.size * 0.5);
        const material = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    generateFins(params) {
        const geometry = this.createTriangleGeometry();
        const material = new MeshStandardMaterial({ color: params.secondaryColor, transparent: true });
        return new Mesh(geometry, material);
    }
    createTriangleGeometry() {
        return this.createBoxGeometry(0.1, 0.1, 0.05);
    }
}
//# sourceMappingURL=FishGenerator.js.map
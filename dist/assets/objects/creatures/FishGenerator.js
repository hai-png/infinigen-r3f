/**
 * FishGenerator - Procedural fish generation
 */
import { Group, Mesh } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class FishGenerator extends CreatureBase {
    getDefaultParameters() {
        return {
            ...super.getDefaultParameters(),
            creatureType: CreatureType.FISH,
            finType: 'rounded',
            scalePattern: 'cycloid',
            bodyShape: 'fusiform',
            primaryColor: '#FF6347',
        };
    }
    generate(species, params = {}) {
        const parameters = { ...this.getDefaultParameters(), ...params };
        this.applySpeciesDefaults(species, parameters);
        const fish = new Group();
        fish.name = `Fish_${species}`;
        fish.add(this.generateBody(parameters));
        fish.add(this.generateFins(parameters));
        return fish;
    }
    applySpeciesDefaults(species, params) {
        switch (species) {
            case 'tropical':
                params.size = 0.15;
                params.primaryColor = '#00BFFF';
                params.bodyShape = 'compressed';
                break;
            case 'shark':
                params.size = 2.0;
                params.primaryColor = '#708090';
                params.finType = 'pointed';
                params.bodyShape = 'fusiform';
                break;
            case 'goldfish':
                params.size = 0.2;
                params.primaryColor = '#FFD700';
                params.tailType = 'fan';
                break;
            case 'bass':
                params.size = 0.5;
                params.primaryColor = '#556B2F';
                break;
            case 'clownfish':
                params.size = 0.12;
                params.primaryColor = '#FF4500';
                params.scalePattern = 'ctenoid';
                break;
            case 'stingray':
                params.size = 0.8;
                params.primaryColor = '#8B4513';
                params.bodyShape = 'depressed';
                break;
        }
    }
    generateBody(params) {
        const geometry = this.createElongatedGeometry(params.size, params.bodyShape);
        const material = new Mesh.StandardMaterial({ color: params.primaryColor });
        return new Mesh(geometry, material);
    }
    generateFins(params) {
        const fins = new Group();
        const finGeometry = this.createFinGeometry(params.finType, params.size * 0.2);
        const finMaterial = new Mesh.StandardMaterial({ color: params.primaryColor, transparent: true, opacity: 0.8 });
        const dorsal = new Mesh(finGeometry, finMaterial);
        const leftPectoral = new Mesh(finGeometry, finMaterial);
        const rightPectoral = new Mesh(finGeometry, finMaterial);
        dorsal.position.set(0, params.size * 0.15, 0);
        leftPectoral.position.set(-params.size * 0.1, 0, params.size * 0.1);
        rightPectoral.position.set(params.size * 0.1, 0, params.size * 0.1);
        fins.add(dorsal, leftPectoral, rightPectoral);
        return fins;
    }
    createElongatedGeometry(size, shape) {
        return this.createCapsuleGeometry(size * 0.15, size * 0.6);
    }
    createFinGeometry(finType, size) {
        return this.createBoxGeometry(size * 0.3, size, 0.02);
    }
}
//# sourceMappingURL=FishGenerator.js.map
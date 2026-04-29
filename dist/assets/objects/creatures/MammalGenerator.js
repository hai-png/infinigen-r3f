/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 */
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureType } from './CreatureBase';
export class MammalGenerator extends CreatureBase {
    constructor(seed) {
        super({ seed: seed || Math.random() * 10000 });
        this._seed = 0;
        this._seed = this.params.seed;
    }
    getDefaultConfig() {
        return {
            ...this.params,
            creatureType: CreatureType.MAMMAL,
            furLength: 0.05,
            furPattern: 'solid',
            earShape: 'rounded',
            tailType: 'bushy',
            legType: 'digitigrade',
            primaryColor: '#8B4513',
            secondaryColor: '#D2691E',
        };
    }
    generate(species = 'dog', params = {}) {
        const parameters = this.mergeParameters(this.getDefaultConfig(), params);
        this.applySpeciesDefaults(species, parameters);
        const mammal = new Group();
        mammal.name = `Mammal_${species}`;
        mammal.userData.parameters = parameters;
        const body = this.generateBody(parameters);
        mammal.add(body);
        const head = this.generateHead(parameters);
        head.position.set(0, parameters.size * 0.3, parameters.size * 0.4);
        mammal.add(head);
        if (parameters.tailType !== 'none') {
            const tail = this.generateTail(parameters);
            tail.position.z = -parameters.size * 0.4;
            mammal.add(tail);
        }
        const ears = this.generateEars(parameters);
        ears.position.copy(head.position);
        mammal.add(ears);
        return mammal;
    }
    generateBodyCore() {
        return this.generateBody(this.getDefaultConfig());
    }
    generateHead() {
        return this.generateHead(this.getDefaultConfig());
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
            case 'dog':
                params.size = 0.6;
                params.furLength = 0.03;
                params.furPattern = 'solid';
                params.earShape = 'floppy';
                params.tailType = 'bushy';
                params.legType = 'digitigrade';
                params.primaryColor = '#8B4513';
                break;
            case 'cat':
                params.size = 0.4;
                params.furLength = 0.02;
                params.furPattern = 'striped';
                params.earShape = 'pointed';
                params.tailType = 'thin';
                params.legType = 'digitigrade';
                params.primaryColor = '#696969';
                break;
            case 'deer':
                params.size = 1.2;
                params.furLength = 0.02;
                params.furPattern = 'spotted';
                params.earShape = 'pointed';
                params.tailType = 'thin';
                params.legType = 'unguligrade';
                params.primaryColor = '#CD853F';
                break;
            case 'bear':
                params.size = 1.8;
                params.furLength = 0.08;
                params.furPattern = 'solid';
                params.earShape = 'rounded';
                params.tailType = 'none';
                params.legType = 'plantigrade';
                params.primaryColor = '#2F1B0C';
                break;
            case 'rabbit':
                params.size = 0.3;
                params.furLength = 0.03;
                params.furPattern = 'solid';
                params.earShape = 'tufted';
                params.tailType = 'bushy';
                params.legType = 'digitigrade';
                params.primaryColor = '#FFFFFF';
                break;
            case 'fox':
                params.size = 0.5;
                params.furLength = 0.04;
                params.furPattern = 'gradient';
                params.earShape = 'pointed';
                params.tailType = 'bushy';
                params.legType = 'digitigrade';
                params.primaryColor = '#FF4500';
                break;
            case 'elephant':
                params.size = 3.0;
                params.furLength = 0.001;
                params.furPattern = 'solid';
                params.earShape = 'floppy';
                params.tailType = 'thin';
                params.legType = 'unguligrade';
                params.primaryColor = '#808080';
                break;
            case 'giraffe':
                params.size = 4.0;
                params.furLength = 0.01;
                params.furPattern = 'spotted';
                params.earShape = 'rounded';
                params.tailType = 'thin';
                params.legType = 'unguligrade';
                params.primaryColor = '#FFD700';
                params.secondaryColor = '#8B4513';
                break;
        }
    }
    generateBody(params) {
        const bodyGeometry = this.createEllipsoidGeometry(params.size * 0.4, params.size * 0.35, params.size * 0.5);
        const bodyMaterial = this.createFurMaterial(params.primaryColor, params.furLength, params.furPattern);
        return new Mesh(bodyGeometry, bodyMaterial);
    }
    generateHead(params) {
        const headGeometry = this.createSphereGeometry(params.size * 0.2);
        const headMaterial = this.createFurMaterial(params.primaryColor, params.furLength * 0.8, params.furPattern);
        return new Mesh(headGeometry, headMaterial);
    }
    generateTail(params) {
        const tailGeometry = this.createCylinderGeometry(params.size * 0.05, params.size * 0.02, params.size * 0.4);
        const tailMaterial = new MeshStandardMaterial({ color: params.primaryColor });
        return new Mesh(tailGeometry, tailMaterial);
    }
    generateEars(params) {
        const ears = new Group();
        const earGeometry = this.createBoxGeometry(params.size * 0.1, params.size * 0.15, params.size * 0.01);
        const earMaterial = this.createFurMaterial(params.secondaryColor, params.furLength * 0.5, 'solid');
        const leftEar = new Mesh(earGeometry, earMaterial);
        const rightEar = new Mesh(earGeometry, earMaterial);
        leftEar.position.set(-params.size * 0.15, params.size * 0.1, 0);
        rightEar.position.set(params.size * 0.15, params.size * 0.1, 0);
        ears.add(leftEar, rightEar);
        return ears;
    }
    createFurMaterial(color, _length, _pattern) {
        return new MeshStandardMaterial({ color });
    }
}
//# sourceMappingURL=MammalGenerator.js.map
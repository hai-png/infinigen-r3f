/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */
import { Group, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, ConeGeometry, CapsuleGeometry } from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export var CreatureType;
(function (CreatureType) {
    CreatureType["MAMMAL"] = "mammal";
    CreatureType["BIRD"] = "bird";
    CreatureType["REPTILE"] = "reptile";
    CreatureType["AMPHIBIAN"] = "amphibian";
    CreatureType["FISH"] = "fish";
    CreatureType["INSECT"] = "insect";
    CreatureType["INVERTEBRATE"] = "invertebrate";
})(CreatureType || (CreatureType = {}));
export class CreatureBase extends BaseObjectGenerator {
    constructor(params = {}) {
        super(0);
        this.params = {
            seed: Math.random() * 10000,
            species: 'unknown',
            size: 1.0,
            age: 'adult',
            gender: 'neutral',
            health: 1.0,
            biome: 'temperate',
            ...params
        };
        this.rng = new SeededRandom(this.params.seed);
    }
    getDefaultConfig() {
        return this.params;
    }
    generate() {
        return new Group();
    }
    createEllipsoidGeometry(x, y, z) {
        // Three.js doesn't have EllipsoidGeometry, use scaled SphereGeometry instead
        const geometry = new SphereGeometry(1, 32, 32);
        geometry.scale(x, y, z);
        return geometry;
    }
    createSphereGeometry(radius) {
        return new SphereGeometry(radius);
    }
    createBoxGeometry(width, height, depth) {
        return new BoxGeometry(width, height, depth);
    }
    createCylinderGeometry(radiusTop, radiusBottom, height) {
        return new CylinderGeometry(radiusTop, radiusBottom, height);
    }
    createConeGeometry(radius, height) {
        return new ConeGeometry(radius, height);
    }
    createCapsuleGeometry(radius, length) {
        return new CapsuleGeometry(radius, length);
    }
    createStandardMaterial(params) {
        return new MeshStandardMaterial(params);
    }
    createFinGeometry(shape, params) {
        return new BoxGeometry(1, 1, 1);
    }
    createEarGeometry(params) {
        return new BoxGeometry(1, 1, 1);
    }
    createShellGeometry(params) {
        return new BoxGeometry(1, 1, 1);
    }
    get seed() { return this.params.seed; }
    mergeParameters(base, override) {
        return { ...base, ...override };
    }
}
//# sourceMappingURL=CreatureBase.js.map
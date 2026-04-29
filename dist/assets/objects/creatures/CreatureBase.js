/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, and animation hooks
 */
import { Group, SphereGeometry, BoxGeometry, CylinderGeometry, MeshStandardMaterial, ConeGeometry, CapsuleGeometry, EllipsoidGeometry } from 'three';
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
        return new EllipsoidGeometry(x, y, z);
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
        return new Geometry();
    }
    createEarGeometry(params) {
        return new Geometry();
    }
    createShellGeometry(params) {
        return new Geometry();
    }
    get seed() { return this.params.seed; }
    mergeParameters(base, override) {
        return { ...base, ...override };
    }
    getBoundingBox() {
        const sizeMultipliers = {
            tiny: 0.1,
            small: 0.3,
            medium: 1.0,
            large: 2.5,
            huge: 5.0
        };
        const mult = sizeMultipliers[this.params.size.toString()] || 1.0;
        return {
            min: [-0.5 * mult, 0, -0.5 * mult],
            max: [0.5 * mult, 1.0 * mult, 0.5 * mult]
        };
    }
    getSkeletonStructure() {
        return {
            root: 'pelvis',
            spine: ['spine_01', 'spine_02', 'spine_03'],
            neck: 'neck_01',
            head: 'head',
            limbs: {
                front_left: ['shoulder_l', 'arm_l', 'hand_l'],
                front_right: ['shoulder_r', 'arm_r', 'hand_r'],
                back_left: ['hip_l', 'leg_l', 'foot_l'],
                back_right: ['hip_r', 'leg_r', 'foot_r']
            }
        };
    }
    validateParams() {
        const validSizes = [0.1, 0.3, 1.0, 2.5, 5.0];
        const validAges = ['juvenile', 'adult', 'elder'];
        const validGenders = ['male', 'female', 'neutral'];
        return (validAges.includes(this.params.age) &&
            validGenders.includes(this.params.gender) &&
            this.params.health >= 0 &&
            this.params.health <= 1);
    }
}
class Geometry extends BoxGeometry {
    constructor() {
        super(1, 1, 1);
    }
}
//# sourceMappingURL=CreatureBase.js.map
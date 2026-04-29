import { Group, Bone } from 'three';
export class SkeletonBuilder {
    constructor(seed) {
        this.seed = seed;
    }
    buildBones(creatureType) {
        const bones = [];
        const root = new Bone();
        const spine = new Bone();
        spine.position.y = 0.5;
        root.add(spine);
        bones.push(root, spine);
        return bones;
    }
    createRig(mesh, bones) {
        const rig = new Group();
        bones.forEach(bone => rig.add(bone));
        rig.add(mesh);
        return rig;
    }
}
//# sourceMappingURL=SkeletonBuilder.js.map
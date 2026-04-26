import { Group, Bone, SkinnedMesh } from 'three';
export declare class SkeletonBuilder {
    private seed?;
    constructor(seed?: number | undefined);
    buildBones(creatureType: string): Bone[];
    createRig(mesh: SkinnedMesh, bones: Bone[]): Group;
}
//# sourceMappingURL=SkeletonBuilder.d.ts.map
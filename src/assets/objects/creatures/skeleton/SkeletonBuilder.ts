import { Group, Bone, SkinnedMesh } from 'three';
export class SkeletonBuilder {
  constructor(private seed?: number) {}
  buildBones(creatureType: string): Bone[] {
    const bones: Bone[] = [];
    const root = new Bone();
    const spine = new Bone();
    spine.position.y = 0.5;
    root.add(spine);
    bones.push(root, spine);
    return bones;
  }
  createRig(mesh: SkinnedMesh, bones: Bone[]): Group {
    const rig = new Group();
    bones.forEach(bone => rig.add(bone));
    rig.add(mesh);
    return rig;
  }
}

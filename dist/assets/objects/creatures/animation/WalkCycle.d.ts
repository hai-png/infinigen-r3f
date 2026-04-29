import { AnimationClip } from 'three';
export declare class WalkCycle {
    private seed?;
    constructor(seed?: number | undefined);
    generate(gait: 'biped' | 'quadruped' | 'hexapod', speed: number): AnimationClip;
}
//# sourceMappingURL=WalkCycle.d.ts.map
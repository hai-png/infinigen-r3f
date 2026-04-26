import { AnimationClip } from 'three';
export declare class IdleAnimation {
    private seed?;
    constructor(seed?: number | undefined);
    generate(behaviors: Array<'breathing' | 'headTracking' | 'tailWagging'>): AnimationClip;
}
//# sourceMappingURL=IdleAnimation.d.ts.map
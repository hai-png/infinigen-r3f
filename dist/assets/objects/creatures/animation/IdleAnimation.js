import { AnimationClip } from 'three';
export class IdleAnimation {
    constructor(seed) {
        this.seed = seed;
    }
    generate(behaviors) {
        const tracks = [];
        return new AnimationClip('idle', 2.0, tracks);
    }
}
//# sourceMappingURL=IdleAnimation.js.map
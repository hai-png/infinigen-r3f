import { AnimationClip } from 'three';
export class WalkCycle {
    constructor(seed) {
        this.seed = seed;
    }
    generate(gait, speed) {
        const tracks = [];
        const duration = 1.0 / speed;
        return new AnimationClip('walk', duration, tracks);
    }
}
//# sourceMappingURL=WalkCycle.js.map
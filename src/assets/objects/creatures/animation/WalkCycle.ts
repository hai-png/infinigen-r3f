import { AnimationClip, KeyframeTrack } from 'three';
export class WalkCycle {
  constructor(private seed?: number) {}
  generate(gait: 'biped' | 'quadruped' | 'hexapod', speed: number): AnimationClip {
    const tracks: KeyframeTrack[] = [];
    const duration = 1.0 / speed;
    return new AnimationClip('walk', duration, tracks);
  }
}

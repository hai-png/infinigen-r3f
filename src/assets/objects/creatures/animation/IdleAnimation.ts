import { AnimationClip, KeyframeTrack } from 'three';

export class IdleAnimation {
  constructor(private seed?: number) {}

  generate(behaviors: Array<'breathing' | 'headTracking' | 'tailWagging'>): AnimationClip {
    const tracks: KeyframeTrack[] = [];
    return new AnimationClip('idle', 2.0, tracks);
  }
}

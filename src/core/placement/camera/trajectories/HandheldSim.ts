/**
 * Handheld Camera Shake Simulation
 *
 * Simulates realistic handheld camera motion using layered Perlin noise.
 * Includes drift, breath modulation, high-frequency jitter, startle response,
 * and smooth interpolation between keyframes with noise overlay.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../util/MathUtils';
import { SeededNoiseGenerator } from '../../../util/math/noise';
import { Keyframe, TrajectorySample, InterpolationMode, generateTrajectory } from './TrajectoryGenerator';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HandheldConfig {
  /** Base camera position (center of the shake volume) */
  basePosition: THREE.Vector3;
  /** Look-at target (if null, target drifts with camera) */
  target?: THREE.Vector3;
  /** Duration in seconds */
  duration?: number;
  /** Overall shake intensity (amplitude in metres) */
  intensity?: number;
  /** Base shake frequency (Hz) */
  frequency?: number;
  /** Random seed for deterministic results */
  seed?: number;
  /** Samples per second for the generated keyframes */
  samplesPerSecond?: number;

  // --- Drift ---
  /** Slow random walk amplitude (fraction of intensity) */
  driftAmplitude?: number;
  /** Drift frequency (Hz) — very slow */
  driftFrequency?: number;

  // --- Breath modulation ---
  /** Breath oscillation amplitude (fraction of intensity, vertical only) */
  breathAmplitude?: number;
  /** Breath frequency (Hz) — typical ≈0.25 */
  breathFrequency?: number;

  // --- Jitter ---
  /** High-frequency jitter amplitude (fraction of intensity) */
  jitterAmplitude?: number;
  /** Jitter frequency (Hz) — high */
  jitterFrequency?: number;

  // --- Startle response ---
  /** Probability of a startle event per second */
  startleRate?: number;
  /** Startle displacement amplitude (fraction of intensity) */
  startleAmplitude?: number;
  /** Startle decay time (seconds) */
  startleDecay?: number;
}

// ---------------------------------------------------------------------------
// Internal: Perlin Noise Helper
// ---------------------------------------------------------------------------

class NoiseSource {
  private generator: SeededNoiseGenerator;
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.generator = new SeededNoiseGenerator(seed);
  }

  /**
   * Sample 1D Perlin-like noise using the 3D generator with fixed y,z.
   * Returns value in approximately [-1, 1].
   */
  sample(t: number, channel: number = 0): number {
    return this.generator.perlin3D(t, channel * 17.3, this.seed * 0.01);
  }

  /**
   * Sample FBM noise for smoother, more organic motion.
   */
  sampleFBM(t: number, channel: number = 0, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxVal = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.generator.perlin3D(
        t * frequency,
        channel * 17.3 + i * 31.7,
        this.seed * 0.01 + i * 7.3
      );
      maxVal += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    return value / maxVal;
  }
}

// ---------------------------------------------------------------------------
// Internal: Startle Generator
// ---------------------------------------------------------------------------

interface StartleEvent {
  time: number;
  intensity: number;
  direction: THREE.Vector3;
}

function generateStartleEvents(
  duration: number,
  rate: number,
  amplitude: number,
  rng: SeededRandom
): StartleEvent[] {
  const events: StartleEvent[] = [];
  let t = 0;

  while (t < duration) {
    // Poisson-like arrival: next event at random interval
    const nextInterval = -Math.log(1 - rng.next()) / Math.max(rate, 0.001);
    t += nextInterval;

    if (t >= duration) break;

    // Random direction for startle
    const theta = rng.nextFloat(0, Math.PI * 2);
    const phi = rng.nextFloat(-Math.PI / 4, Math.PI / 4);

    events.push({
      time: t,
      intensity: amplitude * rng.nextFloat(0.5, 1.0),
      direction: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi) * 0.3,
        Math.sin(theta) * Math.cos(phi)
      ).normalize(),
    });
  }

  return events;
}

function evaluateStartle(
  time: number,
  events: StartleEvent[],
  decayTime: number
): THREE.Vector3 {
  const result = new THREE.Vector3();

  for (const event of events) {
    const dt = time - event.time;
    if (dt < 0 || dt > decayTime * 3) continue;

    // Exponential decay with an initial sharp spike
    const envelope = Math.exp(-dt / decayTime) * (dt < 0.05 ? dt / 0.05 : 1.0);
    result.add(event.direction.clone().multiplyScalar(event.intensity * envelope));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main: Create Handheld Simulation
// ---------------------------------------------------------------------------

/**
 * Create a handheld camera simulation with Perlin noise–driven shake,
 * drift, breath modulation, jitter, and optional startle response.
 *
 * @returns Array of Keyframes suitable for the TrajectoryGenerator pipeline.
 */
export function createHandheldSim(config: HandheldConfig): Keyframe[] {
  const {
    basePosition,
    target,
    duration = 5,
    intensity = 0.05,
    frequency = 2,
    seed = 42,
    samplesPerSecond = 60,

    driftAmplitude = 0.3,
    driftFrequency = 0.15,

    breathAmplitude = 0.15,
    breathFrequency = 0.25,

    jitterAmplitude = 0.2,
    jitterFrequency = 12,

    startleRate = 0.3,
    startleAmplitude = 2.0,
    startleDecay = 0.3,
  } = config;

  const keyframes: Keyframe[] = [];
  const totalSamples = Math.ceil(duration * samplesPerSecond);

  // Create separate noise sources for each axis and layer
  const noiseDrift = new NoiseSource(seed);
  const noiseBreath = new NoiseSource(seed + 100);
  const noiseJitter = new NoiseSource(seed + 200);
  const noiseRoll = new NoiseSource(seed + 300);

  // Generate startle events
  const rng = new SeededRandom(seed);
  const startleEvents = generateStartleEvents(
    duration,
    startleRate,
    intensity * startleAmplitude,
    rng
  );

  // Drift target: slow random walk
  let driftOffset = new THREE.Vector3();

  for (let i = 0; i <= totalSamples; i++) {
    const t = i / totalSamples;
    const time = t * duration;

    // ----- 1. Drift: slow random walk of camera target -----
    const driftScale = intensity * driftAmplitude;
    driftOffset.set(
      noiseDrift.sampleFBM(time * driftFrequency, 0, 3) * driftScale,
      noiseDrift.sampleFBM(time * driftFrequency, 1, 3) * driftScale * 0.5,
      noiseDrift.sampleFBM(time * driftFrequency, 2, 3) * driftScale,
    );

    // ----- 2. Breath modulation: subtle periodic vertical oscillation -----
    const breathCycle = Math.sin(time * breathFrequency * 2 * Math.PI);
    const breathNoise = noiseBreath.sample(time * breathFrequency, 0) * 0.3;
    const breathOffset = (breathCycle + breathNoise) * intensity * breathAmplitude;

    // ----- 3. Base shake: layered sine waves + Perlin noise -----
    const shakeX =
      Math.sin(time * frequency * 2 * Math.PI) * intensity +
      Math.sin(time * frequency * 3.7 * Math.PI) * intensity * 0.5 +
      noiseDrift.sampleFBM(time * frequency, 3, 2) * intensity * 0.4;

    const shakeY =
      Math.sin(time * frequency * 2.5 * Math.PI) * intensity * 0.8 +
      Math.sin(time * frequency * 4.1 * Math.PI) * intensity * 0.3 +
      breathOffset;

    const shakeZ =
      Math.sin(time * frequency * 1.8 * Math.PI) * intensity * 0.5 +
      Math.sin(time * frequency * 2.9 * Math.PI) * intensity * 0.2;

    // ----- 4. Jitter: high-frequency random displacement -----
    const jitterScale = intensity * jitterAmplitude;
    const jitterX = noiseJitter.sample(time * jitterFrequency, 0) * jitterScale;
    const jitterY = noiseJitter.sample(time * jitterFrequency, 1) * jitterScale;
    const jitterZ = noiseJitter.sample(time * jitterFrequency, 2) * jitterScale * 0.5;

    // ----- 5. Startle response -----
    const startleOffset = evaluateStartle(time, startleEvents, startleDecay);

    // ----- Combine all layers -----
    const position = new THREE.Vector3(
      basePosition.x + shakeX + driftOffset.x + jitterX + startleOffset.x,
      basePosition.y + shakeY + driftOffset.y + jitterY + startleOffset.y,
      basePosition.z + shakeZ + driftOffset.z + jitterZ + startleOffset.z,
    );

    // ----- Roll: subtle camera roll from noise -----
    const roll =
      noiseRoll.sampleFBM(time * frequency * 0.5, 0, 2) * 0.02 +
      (startleOffset.length() > intensity ? Math.sign(startleOffset.x) * 0.03 : 0);

    // ----- Target: drift with the camera if fixed target not provided -----
    const adjustedTarget = target
      ? target.clone().add(driftOffset.clone().multiplyScalar(0.5))
      : undefined;

    keyframes.push({
      time,
      position,
      target: adjustedTarget,
      fov: 75,
      roll,
    });
  }

  return keyframes;
}

// ---------------------------------------------------------------------------
// Trajectory Generation
// ---------------------------------------------------------------------------

/**
 * Generate a fully sampled trajectory from a handheld simulation config.
 */
export function generateHandheldTrajectory(config: HandheldConfig): TrajectorySample[] {
  const keyframes = createHandheldSim(config);
  return generateTrajectory(keyframes, {
    keyframes,
    interpolation: InterpolationMode.CatmullRom,
    duration: config.duration ?? 5,
    samplesPerSecond: config.samplesPerSecond ?? 60,
  });
}

// ---------------------------------------------------------------------------
// Real-Time Evaluation
// ---------------------------------------------------------------------------

/**
 * Stateful handheld simulator for real-time per-frame evaluation.
 * Useful when you need to sample the handheld motion at arbitrary times,
 * not just pre-generated keyframes.
 */
export class HandheldSimulator {
  private noiseDrift: NoiseSource;
  private noiseBreath: NoiseSource;
  private noiseJitter: NoiseSource;
  private noiseRoll: NoiseSource;
  private rng: SeededRandom;
  private config: Required<HandheldConfig>;
  private startleEvents: StartleEvent[];

  constructor(config: HandheldConfig) {
    this.config = {
      basePosition: config.basePosition ?? new THREE.Vector3(),
      target: config.target,
      duration: config.duration ?? 5,
      intensity: config.intensity ?? 0.05,
      frequency: config.frequency ?? 2,
      seed: config.seed ?? 42,
      samplesPerSecond: config.samplesPerSecond ?? 60,
      driftAmplitude: config.driftAmplitude ?? 0.3,
      driftFrequency: config.driftFrequency ?? 0.15,
      breathAmplitude: config.breathAmplitude ?? 0.15,
      breathFrequency: config.breathFrequency ?? 0.25,
      jitterAmplitude: config.jitterAmplitude ?? 0.2,
      jitterFrequency: config.jitterFrequency ?? 12,
      startleRate: config.startleRate ?? 0.3,
      startleAmplitude: config.startleAmplitude ?? 2.0,
      startleDecay: config.startleDecay ?? 0.3,
    };

    const seed = this.config.seed;
    this.noiseDrift = new NoiseSource(seed);
    this.noiseBreath = new NoiseSource(seed + 100);
    this.noiseJitter = new NoiseSource(seed + 200);
    this.noiseRoll = new NoiseSource(seed + 300);
    this.rng = new SeededRandom(seed);

    this.startleEvents = generateStartleEvents(
      this.config.duration,
      this.config.startleRate,
      this.config.intensity * this.config.startleAmplitude,
      this.rng
    );
  }

  /**
   * Evaluate the handheld camera state at a given time.
   * Returns position and roll displacement from the base position.
   */
  evaluate(time: number): { position: THREE.Vector3; roll: number; targetOffset: THREE.Vector3 } {
    const { intensity, frequency, driftAmplitude, driftFrequency,
            breathAmplitude, breathFrequency, jitterAmplitude, jitterFrequency,
            startleDecay, basePosition } = this.config;

    // Drift
    const driftScale = intensity * driftAmplitude;
    const driftOffset = new THREE.Vector3(
      this.noiseDrift.sampleFBM(time * driftFrequency, 0, 3) * driftScale,
      this.noiseDrift.sampleFBM(time * driftFrequency, 1, 3) * driftScale * 0.5,
      this.noiseDrift.sampleFBM(time * driftFrequency, 2, 3) * driftScale,
    );

    // Breath
    const breathCycle = Math.sin(time * breathFrequency * 2 * Math.PI);
    const breathNoise = this.noiseBreath.sample(time * breathFrequency, 0) * 0.3;
    const breathOffset = (breathCycle + breathNoise) * intensity * breathAmplitude;

    // Shake
    const shakeX =
      Math.sin(time * frequency * 2 * Math.PI) * intensity +
      Math.sin(time * frequency * 3.7 * Math.PI) * intensity * 0.5 +
      this.noiseDrift.sampleFBM(time * frequency, 3, 2) * intensity * 0.4;
    const shakeY =
      Math.sin(time * frequency * 2.5 * Math.PI) * intensity * 0.8 +
      Math.sin(time * frequency * 4.1 * Math.PI) * intensity * 0.3 +
      breathOffset;
    const shakeZ =
      Math.sin(time * frequency * 1.8 * Math.PI) * intensity * 0.5 +
      Math.sin(time * frequency * 2.9 * Math.PI) * intensity * 0.2;

    // Jitter
    const jitterScale = intensity * jitterAmplitude;
    const jitterX = this.noiseJitter.sample(time * jitterFrequency, 0) * jitterScale;
    const jitterY = this.noiseJitter.sample(time * jitterFrequency, 1) * jitterScale;
    const jitterZ = this.noiseJitter.sample(time * jitterFrequency, 2) * jitterScale * 0.5;

    // Startle
    const startleOffset = evaluateStartle(time, this.startleEvents, startleDecay);

    const position = new THREE.Vector3(
      basePosition.x + shakeX + driftOffset.x + jitterX + startleOffset.x,
      basePosition.y + shakeY + driftOffset.y + jitterY + startleOffset.y,
      basePosition.z + shakeZ + driftOffset.z + jitterZ + startleOffset.z,
    );

    const roll =
      this.noiseRoll.sampleFBM(time * frequency * 0.5, 0, 2) * 0.02 +
      (startleOffset.length() > intensity ? Math.sign(startleOffset.x) * 0.03 : 0);

    return { position, roll, targetOffset: driftOffset.clone().multiplyScalar(0.5) };
  }
}

// Legacy re-exports for backwards compatibility
export { createHandheldSim as simulateHandheld };

export default {
  createHandheldSim,
  generateHandheldTrajectory,
  HandheldSimulator,
  simulateHandheld: createHandheldSim,
};

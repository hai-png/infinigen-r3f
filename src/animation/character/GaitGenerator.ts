import { Vector3 } from '../../math/vector';

/**
 * Gait Types for procedural locomotion
 */
export type GaitType = 'walk' | 'trot' | 'run' | 'gallop' | 'crawl' | 'amble';

/**
 * Leg Configuration
 */
export interface LegConfig {
  name: string;
  startPosition: Vector3;
  restPosition: Vector3;
  strideLength?: number;
  strideHeight?: number;
  phaseOffset?: number; // 0-1, phase offset in gait cycle
}

/**
 * Gait Configuration
 */
export interface GaitConfig {
  gaitType: GaitType;
  legs: LegConfig[];
  speed?: number;
  strideFrequency?: number;
  stanceDuration?: number; // Portion of cycle in contact (0-1)
}

/**
 * Leg State
 */
export interface LegState {
  config: LegConfig;
  currentPosition: Vector3;
  isStance: boolean; // true if foot is on ground
  phase: number; // Current phase in gait cycle (0-1)
  liftProgress: number; // 0-1 progress of leg lift
}

/**
 * Gait Generator
 * 
 * Generates procedural walking/running cycles for multi-legged creatures.
 * Supports bipeds, quadrupeds, hexapods, and arbitrary leg configurations.
 */
export class GaitGenerator {
  private config: GaitConfig;
  private time: number;
  private legStates: LegState[];
  private gaitSpeed: number;
  private strideFrequency: number;

  constructor(config: GaitConfig) {
    this.config = {
      ...config,
      speed: config.speed ?? 1,
      strideFrequency: config.strideFrequency ?? 1,
      stanceDuration: config.stanceDuration ?? 0.6,
    };

    this.time = 0;
    this.gaitSpeed = config.speed ?? 1;
    this.strideFrequency = config.strideFrequency ?? 1;

    // Initialize leg states
    this.legStates = config.legs.map((legConfig, index) => {
      // Calculate default phase offsets based on gait type
      let phaseOffset = legConfig.phaseOffset;
      if (phaseOffset === undefined) {
        phaseOffset = this.calculatePhaseOffset(index, config.legs.length, config.gaitType);
      }

      return {
        config: {
          ...legConfig,
          phaseOffset,
          strideLength: legConfig.strideLength ?? 1,
          strideHeight: legConfig.strideHeight ?? 0.2,
        },
        currentPosition: legConfig.restPosition.clone(),
        isStance: false,
        phase: phaseOffset,
        liftProgress: 0,
      };
    });
  }

  /**
   * Calculate default phase offset for a leg based on gait type
   */
  private calculatePhaseOffset(legIndex: number, totalLegs: number, gaitType: GaitType): number {
    switch (gaitType) {
      case 'walk':
        // Quadruped walk: diagonal legs move together with offset
        if (totalLegs === 4) {
          const phases = [0, 0.5, 0.75, 0.25]; // LF, RF, LH, RH
          return phases[legIndex] || 0;
        }
        // Hexapod walk: tripod gait
        if (totalLegs === 6) {
          return legIndex % 2 === 0 ? 0 : 0.5;
        }
        // Default: evenly spaced
        return legIndex / totalLegs;

      case 'trot':
        // Diagonal pairs move together
        if (totalLegs === 4) {
          return legIndex < 2 ? 0 : 0.5;
        }
        return legIndex / totalLegs;

      case 'run':
        // Similar to trot but faster with aerial phase
        if (totalLegs === 4) {
          return legIndex < 2 ? 0 : 0.5;
        }
        return legIndex / totalLegs;

      case 'gallop':
        // Asymmetric gait
        if (totalLegs === 4) {
          const phases = [0, 0.1, 0.5, 0.6];
          return phases[legIndex] || 0;
        }
        return legIndex / totalLegs;

      case 'crawl':
        // Slow, stable gait - legs move one at a time
        return legIndex / totalLegs;

      case 'amble':
        // Lateral pair gait
        if (totalLegs === 4) {
          return legIndex % 2 === 0 ? 0 : 0.5;
        }
        return legIndex / totalLegs;

      default:
        return legIndex / totalLegs;
    }
  }

  /**
   * Update gait state
   * @param deltaTime - Time delta in seconds
   */
  update(deltaTime: number): void {
    this.time += deltaTime;
    const cycleTime = this.time * this.strideFrequency;

    // Update each leg
    for (const legState of this.legStates) {
      const legConfig = legState.config;
      
      // Calculate current phase in gait cycle
      const phase = (cycleTime + legConfig.phaseOffset!) % 1;
      legState.phase = phase;

      // Determine if leg is in stance (on ground) or swing (in air)
      const stanceDuration = this.config.stanceDuration ?? 0.6;
      legState.isStance = phase < stanceDuration;

      // Calculate foot position
      if (legState.isStance) {
        // Stance phase: foot moves backward relative to body
        const stanceProgress = phase / stanceDuration;
        const strideLength = legConfig.strideLength!;
        
        // Foot stays planted, body moves forward
        const xOffset = -strideLength * stanceProgress;
        
        legState.currentPosition.set(
          legConfig.restPosition.x + xOffset,
          legConfig.restPosition.y,
          legConfig.restPosition.z
        );
        legState.liftProgress = 0;
      } else {
        // Swing phase: leg lifts and moves forward
        const swingProgress = (phase - stanceDuration) / (1 - stanceDuration);
        legState.liftProgress = swingProgress;

        const strideLength = legConfig.strideLength!;
        const strideHeight = legConfig.strideHeight!;

        // Parabolic arc for smooth foot trajectory
        const liftHeight = Math.sin(swingProgress * Math.PI) * strideHeight;
        const xLerp = swingProgress * strideLength - strideLength / 2;

        legState.currentPosition.set(
          legConfig.restPosition.x + xLerp,
          legConfig.restPosition.y + liftHeight,
          legConfig.restPosition.z
        );
      }
    }
  }

  /**
   * Get all leg positions
   */
  getLegPositions(): Map<string, Vector3> {
    const positions = new Map<string, Vector3>();
    for (const legState of this.legStates) {
      positions.set(legState.config.name, legState.currentPosition.clone());
    }
    return positions;
  }

  /**
   * Get specific leg position
   */
  getLegPosition(legName: string): Vector3 | null {
    const legState = this.legStates.find(ls => ls.config.name === legName);
    return legState ? legState.currentPosition.clone() : null;
  }

  /**
   * Check if specific leg is in stance phase
   */
  isLegInStance(legName: string): boolean {
    const legState = this.legStates.find(ls => ls.config.name === legName);
    return legState?.isStance ?? false;
  }

  /**
   * Get gait cycle progress
   */
  getCycleProgress(): number {
    return (this.time * this.strideFrequency) % 1;
  }

  /**
   * Set gait speed multiplier
   */
  setSpeed(speed: number): void {
    this.gaitSpeed = Math.max(0, speed);
  }

  /**
   * Set stride frequency
   */
  setStrideFrequency(frequency: number): void {
    this.strideFrequency = Math.max(0.1, frequency);
  }

  /**
   * Change gait type
   */
  setGaitType(gaitType: GaitType): void {
    this.config.gaitType = gaitType;
    
    // Recalculate phase offsets
    for (let i = 0; i < this.legStates.length; i++) {
      const legState = this.legStates[i];
      legState.config.phaseOffset = this.calculatePhaseOffset(
        i,
        this.legStates.length,
        gaitType
      );
    }
  }

  /**
   * Get current gait type
   */
  getGaitType(): GaitType {
    return this.config.gaitType;
  }

  /**
   * Reset gait to initial state
   */
  reset(): void {
    this.time = 0;
    for (const legState of this.legStates) {
      legState.currentPosition.copy(legState.config.restPosition);
      legState.phase = legState.config.phaseOffset ?? 0;
      legState.liftProgress = 0;
    }
  }

  /**
   * Get all leg states
   */
  getLegStates(): LegState[] {
    return this.legStates.map(ls => ({
      ...ls,
      currentPosition: ls.currentPosition.clone(),
    }));
  }

  /**
   * Calculate body height adjustment based on leg positions
   * Useful for terrain adaptation
   */
  getBodyHeightOffset(terrainHeights: Map<string, number>): number {
    let totalOffset = 0;
    let count = 0;

    for (const legState of this.legStates) {
      if (legState.isStance) {
        const terrainHeight = terrainHeights.get(legState.config.name) ?? 0;
        const legHeight = legState.currentPosition.y;
        totalOffset += terrainHeight - legHeight;
        count++;
      }
    }

    return count > 0 ? totalOffset / count : 0;
  }

  /**
   * Get stride length for current speed
   */
  getCurrentStrideLength(): number {
    // Stride length increases with speed
    const baseLength = 1;
    return baseLength * (0.5 + this.gaitSpeed * 0.5);
  }

  /**
   * Create preset quadruped configuration
   */
  static createQuadrupedConfig(
    bodyLength: number = 1,
    bodyWidth: number = 0.5,
    legLength: number = 0.5
  ): LegConfig[] {
    return [
      {
        name: 'front_left',
        startPosition: new Vector3(bodyLength / 2, -legLength, bodyWidth / 2),
        restPosition: new Vector3(bodyLength / 2, 0, bodyWidth / 2),
      },
      {
        name: 'front_right',
        startPosition: new Vector3(bodyLength / 2, -legLength, -bodyWidth / 2),
        restPosition: new Vector3(bodyLength / 2, 0, -bodyWidth / 2),
      },
      {
        name: 'hind_left',
        startPosition: new Vector3(-bodyLength / 2, -legLength, bodyWidth / 2),
        restPosition: new Vector3(-bodyLength / 2, 0, bodyWidth / 2),
      },
      {
        name: 'hind_right',
        startPosition: new Vector3(-bodyLength / 2, -legLength, -bodyWidth / 2),
        restPosition: new Vector3(-bodyLength / 2, 0, -bodyWidth / 2),
      },
    ];
  }

  /**
   * Create preset hexapod configuration
   */
  static createHexapodConfig(
    bodyLength: number = 1,
    bodyWidth: number = 0.4,
    legLength: number = 0.4
  ): LegConfig[] {
    const legs: LegConfig[] = [];
    const segments = 3;

    for (let i = 0; i < segments; i++) {
      const z = bodyLength / 2 - (i + 0.5) * (bodyLength / segments);
      
      // Left leg
      legs.push({
        name: `left_${i}`,
        startPosition: new Vector3(z, -legLength, bodyWidth / 2),
        restPosition: new Vector3(z, 0, bodyWidth / 2),
      });

      // Right leg
      legs.push({
        name: `right_${i}`,
        startPosition: new Vector3(z, -legLength, -bodyWidth / 2),
        restPosition: new Vector3(z, 0, -bodyWidth / 2),
      });
    }

    return legs;
  }

  /**
   * Create preset biped configuration
   */
  static createBipedConfig(
    hipWidth: number = 0.3,
    legLength: number = 1
  ): LegConfig[] {
    return [
      {
        name: 'left_leg',
        startPosition: new Vector3(0, -legLength, hipWidth / 2),
        restPosition: new Vector3(0, 0, hipWidth / 2),
      },
      {
        name: 'right_leg',
        startPosition: new Vector3(0, -legLength, -hipWidth / 2),
        restPosition: new Vector3(0, 0, -hipWidth / 2),
      },
    ];
  }
}

/**
 * Create a preset gait generator for common creature types
 */
export function createPresetGait(
  creatureType: 'quadruped' | 'hexapod' | 'biped',
  gaitType: GaitType = 'walk',
  options: {
    bodyLength?: number;
    bodyWidth?: number;
    legLength?: number;
    speed?: number;
  } = {}
): GaitGenerator {
  let legs: LegConfig[];

  switch (creatureType) {
    case 'quadruped':
      legs = GaitGenerator.createQuadrupedConfig(
        options.bodyLength,
        options.bodyWidth,
        options.legLength
      );
      break;
    case 'hexapod':
      legs = GaitGenerator.createHexapodConfig(
        options.bodyLength,
        options.bodyWidth,
        options.legLength
      );
      break;
    case 'biped':
      legs = GaitGenerator.createBipedConfig(
        options.bodyWidth,
        options.legLength
      );
      break;
    default:
      legs = [];
  }

  return new GaitGenerator({
    gaitType,
    legs,
    speed: options.speed,
  });
}

export default GaitGenerator;

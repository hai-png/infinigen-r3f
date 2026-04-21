/**
 * CameraTrajectory - Automated camera path generation for dataset capture
 * 
 * Generates smooth camera trajectories with:
 * - Spiral paths around terrain features
 * - Linear fly-through paths
 * - Orbital paths around points of interest
 * - Random walk exploration paths
 * - Cinematic crane shots
 * 
 * Ported from: infinigen/data_generation/camera_trajectory.py
 */

import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';

export interface TrajectoryConfig {
  seed: number;
  minDistance: number;
  maxDistance: number;
  minHeight: number;
  maxHeight: number;
  speed: number;
  smoothness: number;
  lookAtOffset: Vector3;
}

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  timestamp: number;
}

export class CameraTrajectory {
  private config: TrajectoryConfig;
  private noise: NoiseUtils;
  
  constructor(config?: Partial<TrajectoryConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      minDistance: 50,
      maxDistance: 500,
      minHeight: 10,
      maxHeight: 200,
      speed: 1.0,
      smoothness: 0.1,
      lookAtOffset: new Vector3(0, 0, 0),
      ...config,
    };
    
    this.noise = new NoiseUtils(this.config.seed);
  }
  
  /**
   * Generate spiral trajectory around terrain center
   */
  generateSpiralTrajectory(
    numFrames: number,
    bounds: { min: Vector3; max: Vector3 }
  ): CameraPose[] {
    const poses: CameraPose[] = [];
    const center = new Vector3()
      .addVectors(bounds.min, bounds.max)
      .multiplyScalar(0.5);
    
    const avgRadius = (this.config.minDistance + this.config.maxDistance) / 2;
    
    for (let i = 0; i < numFrames; i++) {
      const t = i / numFrames;
      const angle = t * Math.PI * 4; // Two full rotations
      
      // Spiral radius variation
      const radius = this.config.minDistance + 
        (this.config.maxDistance - this.config.minDistance) * 
        (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      
      // Height variation
      const height = this.config.minHeight + 
        (this.config.maxHeight - this.config.minHeight) * 
        (0.5 + 0.5 * Math.sin(t * Math.PI * 3 + 1));
      
      const position = new Vector3(
        center.x + Math.cos(angle) * radius,
        height,
        center.z + Math.sin(angle) * radius
      );
      
      const target = center.clone().add(this.config.lookAtOffset);
      
      poses.push({
        position,
        target,
        up: new Vector3(0, 1, 0),
        timestamp: t,
      });
    }
    
    return this.smoothTrajectory(poses);
  }
  
  /**
   * Generate linear fly-through trajectory
   */
  generateLinearTrajectory(
    numFrames: number,
    startPoint: Vector3,
    endPoint: Vector3
  ): CameraPose[] {
    const poses: CameraPose[] = [];
    
    for (let i = 0; i < numFrames; i++) {
      const t = i / (numFrames - 1);
      
      // Smooth easing
      const easeT = this.easeInOutCubic(t);
      
      const position = new Vector3()
        .lerpVectors(startPoint, endPoint, easeT);
      
      // Add some height variation
      position.y += Math.sin(t * Math.PI * 4) * 20;
      
      // Look ahead along the path
      const lookAheadT = Math.min(t + 0.1, 1.0);
      const target = new Vector3()
        .lerpVectors(startPoint, endPoint, lookAheadT);
      target.y += Math.sin(lookAheadT * Math.PI * 4) * 20;
      
      poses.push({
        position,
        target,
        up: new Vector3(0, 1, 0),
        timestamp: t,
      });
    }
    
    return this.smoothTrajectory(poses);
  }
  
  /**
   * Generate orbital trajectory around point of interest
   */
  generateOrbitalTrajectory(
    numFrames: number,
    center: Vector3,
    radius: number,
    inclination: number = Math.PI / 6
  ): CameraPose[] {
    const poses: CameraPose[] = [];
    
    for (let i = 0; i < numFrames; i++) {
      const t = i / numFrames;
      const angle = t * Math.PI * 2;
      
      const position = new Vector3(
        center.x + radius * Math.cos(angle) * Math.cos(inclination),
        center.y + radius * Math.sin(angle),
        center.z + radius * Math.sin(angle) * Math.cos(inclination)
      );
      
      poses.push({
        position,
        target: center.clone(),
        up: new Vector3(0, 1, 0),
        timestamp: t,
      });
    }
    
    return poses;
  }
  
  /**
   * Generate random walk exploration trajectory
   */
  generateRandomWalkTrajectory(
    numFrames: number,
    startPos: Vector3,
    bounds: { min: Vector3; max: Vector3 }
  ): CameraPose[] {
    const poses: CameraPose[] = [];
    let currentPos = startPos.clone();
    
    for (let i = 0; i < numFrames; i++) {
      const t = i / numFrames;
      
      // Random direction with noise smoothing
      const noiseX = this.noise.perlin3D(t * 10, 0, 0);
      const noiseY = this.noise.perlin3D(0, t * 10, 0);
      const noiseZ = this.noise.perlin3D(0, 0, t * 10);
      
      const direction = new Vector3(noiseX, noiseY, noiseZ).normalize();
      
      // Move in direction
      currentPos.add(direction.multiplyScalar(this.config.speed * 5));
      
      // Clamp to bounds
      currentPos.x = THREE.MathUtils.clamp(
        currentPos.x,
        bounds.min.x + this.config.minDistance,
        bounds.max.x - this.config.minDistance
      );
      currentPos.y = THREE.MathUtils.clamp(
        currentPos.y,
        this.config.minHeight,
        this.config.maxHeight
      );
      currentPos.z = THREE.MathUtils.clamp(
        currentPos.z,
        bounds.min.z + this.config.minDistance,
        bounds.max.z - this.config.minDistance
      );
      
      // Look at next position
      const nextPos = currentPos.clone().add(direction);
      
      poses.push({
        position: currentPos.clone(),
        target: nextPos,
        up: new Vector3(0, 1, 0),
        timestamp: t,
      });
    }
    
    return this.smoothTrajectory(poses);
  }
  
  /**
   * Generate cinematic crane shot trajectory
   */
  generateCraneShotTrajectory(
    numFrames: number,
    startClose: Vector3,
    endFar: Vector3,
    target: Vector3
  ): CameraPose[] {
    const poses: CameraPose[] = [];
    
    for (let i = 0; i < numFrames; i++) {
      const t = this.easeInOutQuad(i / (numFrames - 1));
      
      const position = new Vector3()
        .lerpVectors(startClose, endFar, t);
      
      // Add subtle arc motion
      const arcHeight = Math.sin(t * Math.PI) * 30;
      position.y += arcHeight;
      
      poses.push({
        position,
        target: target.clone(),
        up: new Vector3(0, 1, 0),
        timestamp: t,
      });
    }
    
    return poses;
  }
  
  /**
   * Smooth trajectory using moving average
   */
  private smoothTrajectory(poses: CameraPose[], windowSize: number = 5): CameraPose[] {
    if (poses.length < windowSize) return poses;
    
    const smoothed: CameraPose[] = [];
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < poses.length; i++) {
      const startIdx = Math.max(0, i - halfWindow);
      const endIdx = Math.min(poses.length - 1, i + halfWindow);
      
      const avgPos = new Vector3();
      const avgTarget = new Vector3();
      let count = 0;
      
      for (let j = startIdx; j <= endIdx; j++) {
        const weight = 1 - Math.abs(j - i) / halfWindow;
        avgPos.add(poses[j].position.clone().multiplyScalar(weight));
        avgTarget.add(poses[j].target.clone().multiplyScalar(weight));
        count += weight;
      }
      
      avgPos.divideScalar(count);
      avgTarget.divideScalar(count);
      
      smoothed.push({
        position: avgPos,
        target: avgTarget,
        up: new Vector3(0, 1, 0),
        timestamp: poses[i].timestamp,
      });
    }
    
    return smoothed;
  }
  
  /**
   * Easing function: ease-in-out cubic
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * Easing function: ease-in-out quadratic
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  /**
   * Interpolate between two poses
   */
  interpolatePoses(
    pose1: CameraPose,
    pose2: CameraPose,
    t: number
  ): CameraPose {
    return {
      position: new Vector3().lerpVectors(pose1.position, pose2.position, t),
      target: new Vector3().lerpVectors(pose1.target, pose2.target, t),
      up: new Vector3().lerpVectors(pose1.up, pose2.up, t),
      timestamp: pose1.timestamp + (pose2.timestamp - pose1.timestamp) * t,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<TrajectoryConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }
}

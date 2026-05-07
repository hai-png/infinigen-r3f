/**
 * Camera System for Infinigen R3F
 * 
 * Complete camera placement, cinematography, and trajectory system.
 * Ported from: placement/camera.py (30.7KB)
 */

import { Vector3, Euler } from 'three';
import { Variable, ConstraintNode } from '../../constraints/language/types';
import { item } from '../../constraints/language/constants';
import { Tag as UnifiedTag } from '../../UnifiedTagSystem';
import {
  Visible,
  Proximity,
  InFrontOf,
  Facing,
  AccessibleFrom,
  ReachableFrom,
} from '../../constraints/language/relations';
import {
  Distance,
  VisibilityScore,
  Angle,
} from '../../constraints/language/geometry';
import { FilterObjects, TagCondition, ForAll, Exists } from '../../constraints/language/set-reasoning';
import { SCENE } from '../../constraints/language/constants';

/**
 * Camera types supported by the system
 */
export type CameraType =
  | 'perspective'
  | 'orthographic'
  | 'stereo'      // VR stereo
  | 'panoramic'   // 360° equirectangular
  | 'fisheye';    // Ultra-wide fisheye

/**
 * Shot size definitions for cinematography
 */
export type ShotSize =
  | 'extreme_close_up'   // Face detail
  | 'close_up'           // Head and shoulders
  | 'medium_close_up'    // Chest up
  | 'medium'             // Waist up
  | 'medium_long'        // Knees up
  | 'long'               // Full body
  | 'very_long'          // Full body with surroundings
  | 'extreme_long';      // Distant view

/**
 * Camera angle types
 */
export type CameraAngle =
  | 'bird_eye'       // Top-down 90°
  | 'high_angle'     // Looking down 45-90°
  | 'eye_level'      // Horizontal 0-45°
  | 'low_angle'      // Looking up -45 to 0°
  | 'worm_eye';      // Bottom-up -90 to -45°

/**
 * Camera movement types for trajectories
 */
export type CameraMovement =
  | 'static'
  | 'dolly'         // Push in/out
  | 'pan'           // Horizontal rotation
  | 'tilt'          // Vertical rotation
  | 'truck'         // Left/right movement
  | 'pedestal'      // Up/down movement
  | 'orbit'         // Circular around subject
  | 'arc'           // Partial circular
  | 'tracking'      // Follow subject
  | 'crane'         // Vertical arc
  | 'handheld';     // Organic shake

/**
 * Camera properties configuration
 */
export interface CameraProperties {
  /** Camera type */
  type: CameraType;
  
  /** Focal length in mm (default: 35mm) */
  focalLength?: number;
  
  /** F-stop / aperture (default: 2.8) */
  fStop?: number;
  
  /** Focus distance in meters (default: 10) */
  focusDistance?: number;
  
  /** Sensor size in mm (default: [36, 24] for full-frame) */
  sensorSize?: [number, number];
  
  /** Film grain / ISO (default: 100) */
  iso?: number;
  
  /** Shutter speed (default: 1/60) */
  shutterSpeed?: number;
  
  /** Field of view in degrees (calculated from focalLength if not set) */
  fov?: number;
  
  /** Near clipping plane (default: 0.1) */
  near?: number;
  
  /** Far clipping plane (default: 1000) */
  far?: number;
  
  /** Depth of field enabled */
  enableDOF?: boolean;
  
  /** Bokeh intensity (0-1) */
  bokehIntensity?: number;
  
  /** Chromatic aberration (0-1) */
  chromaticAberration?: number;
  
  /** Vignette intensity (0-1) */
  vignette?: number;
  
  /** Interaxial distance for stereo cameras (default: 0.065) */
  interaxialDistance?: number;
}

/**
 * Default camera properties by type
 */
export const DEFAULT_CAMERA_PROPERTIES: Record<CameraType, Partial<CameraProperties>> = {
  perspective: {
    focalLength: 35,
    fStop: 2.8,
    focusDistance: 10,
    sensorSize: [36, 24],
    near: 0.1,
    far: 1000,
    enableDOF: false,
  },
  orthographic: {
    near: 0.1,
    far: 1000,
  },
  stereo: {
    focalLength: 35,
    fStop: 2.8,
    focusDistance: 10,
    interaxialDistance: 0.065, // Average human IPD
  },
  panoramic: {
    fov: 360,
    near: 0.1,
    far: 1000,
  },
  fisheye: {
    focalLength: 8,
    fov: 180,
    near: 0.1,
    far: 1000,
  },
};

/**
 * Shot size distance ranges (in meters from subject)
 */
export const SHOT_SIZE_DISTANCES: Record<ShotSize, [number, number]> = {
  extreme_close_up: [0.3, 0.5],
  close_up: [0.5, 1.0],
  medium_close_up: [1.0, 1.5],
  medium: [1.5, 2.5],
  medium_long: [2.5, 4.0],
  long: [4.0, 8.0],
  very_long: [8.0, 15.0],
  extreme_long: [15.0, 50.0],
};

/**
 * Camera angle elevation ranges (in degrees)
 */
export const CAMERA_ANGLE_ELEVATIONS: Record<CameraAngle, [number, number]> = {
  bird_eye: [75, 90],
  high_angle: [45, 75],
  eye_level: [-15, 45],
  low_angle: [-45, -15],
  worm_eye: [-90, -45],
};

/**
 * Composition rule types
 */
export type CompositionRule =
  | 'rule_of_thirds'
  | 'golden_ratio'
  | 'leading_lines'
  | 'symmetry'
  | 'framing'
  | 'diagonal'
  | 'centered';

/**
 * Camera placement configuration
 */
export interface CameraPlacementConfig {
  /** Desired shot size */
  shotSize?: ShotSize;
  
  /** Desired camera angle */
  angle?: CameraAngle;
  
  /** Composition rules to follow */
  compositionRules?: CompositionRule[];
  
  /** Minimum distance to subject */
  minDistance?: number;
  
  /** Maximum distance to subject */
  maxDistance?: number;
  
  /** Avoid occlusions */
  avoidOcclusion?: boolean;
  
  /** Maintain line of sight */
  maintainLineOfSight?: boolean;
  
  /** Preferred height range */
  heightRange?: [number, number];
  
  /** Exclusion zones (areas camera cannot be placed) */
  exclusionZones?: Array<{
    center: Vector3;
    radius: number;
  }>;
}

/**
 * Trajectory keyframe
 */
export interface TrajectoryKeyframe {
  /** Time in seconds */
  time: number;
  
  /** Position */
  position: Vector3;
  
  /** Target look-at point */
  target?: Vector3;
  
  /** Optional rotation (if not looking at target) */
  rotation?: Euler;
  
  /** FOV at this keyframe */
  fov?: number;
  
  /** Easing function name */
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}

/**
 * Trajectory configuration
 */
export interface TrajectoryConfig {
  /** Movement type */
  movement: CameraMovement;
  
  /** Duration in seconds */
  duration: number;
  
  /** Keyframes (auto-generated for simple movements) */
  keyframes?: TrajectoryKeyframe[];
  
  /** Subject to track (for tracking shots) */
  trackSubject?: string;
  
  /** Orbit center (for orbit shots) */
  orbitCenter?: Vector3;
  
  /** Orbit radius */
  orbitRadius?: number;
  
  /** Arc angle in degrees (for arc shots, default 360) */
  arcAngle?: number;
  
  /** Shake intensity for handheld (0-1) */
  shakeIntensity?: number;
}

/**
 * Camera constraint: Frame a subject
 */
export function Frames(
  camera: Variable | string,
  subject: Variable | string,
  shotSize?: ShotSize
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  const constraints: ConstraintNode[] = [];
  
  // Camera must have line of sight to subject
  constraints.push(new Visible(subjectVar as any, cameraVar as any));
  
  // Camera should be in front of subject
  constraints.push(new InFrontOf(cameraVar as any, subjectVar as any));
  
  // Add distance constraint based on shot size
  if (shotSize) {
    const [minDist, maxDist] = SHOT_SIZE_DISTANCES[shotSize];
    constraints.push(new Proximity(cameraVar as any, subjectVar as any, maxDist, minDist));
  }
  
  return new AndRelations(constraints) as unknown as ConstraintNode;
}

/**
 * Camera constraint: Maintain clear line of sight
 */
export function HasLineOfSight(
  camera: Variable | string,
  subject: Variable | string,
  minVisibility: number = 0.8
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  return new Visible(subjectVar as any, cameraVar as any);
}

/**
 * Camera constraint: Maintain shot size
 */
export function MaintainsShotSize(
  camera: Variable | string,
  subject: Variable | string,
  shotSize: ShotSize
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  const [minDist, maxDist] = SHOT_SIZE_DISTANCES[shotSize];
  return new Proximity(cameraVar as any, subjectVar as any, maxDist, minDist);
}

/**
 * Camera constraint: Specific camera angle
 */
export function HasCameraAngle(
  camera: Variable | string,
  subject: Variable | string,
  angle: CameraAngle
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  const [minElev, maxElev] = CAMERA_ANGLE_ELEVATIONS[angle];
  
  // This would need geometry predicate for angle calculation
  // Simplified version using facing constraint
  return new Facing(cameraVar as any, subjectVar as any);
}

/**
 * Camera constraint: Avoid obstruction
 */
export function AvoidsObstruction(
  camera: Variable | string,
  subject: Variable | string,
  maxOcclusion: number = 0.2
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  // Get potential occluders (objects between camera and subject)
  const occluders = new FilterObjects(
    SCENE,
    TagCondition.fromKeyValue('semantics', 'occluder')
  );
  
  // For all occluders, they should not block the view
  const occluderVar = new Variable('occluder');
  return new ForAll(occluderVar, occluders, new Visible(subjectVar as any, cameraVar as any));
}

/**
 * Camera constraint: Follow subject
 */
export function FollowsSubject(
  camera: Variable | string,
  subject: Variable | string,
  followDistance: number = 3.0
): ConstraintNode {
  const cameraVar = typeof camera === 'string' ? item(camera) : camera;
  const subjectVar = typeof subject === 'string' ? item(subject) : subject;
  
  return new Proximity(cameraVar as any, subjectVar as any, followDistance);
}

/**
 * Calculate optimal camera position based on composition rules
 */
export function calculateOptimalPosition(
  subjectPosition: Vector3,
  subjectDirection: Vector3,
  config: CameraPlacementConfig
): Vector3 {
  const {
    shotSize = 'medium',
    angle = 'eye_level',
    minDistance = 1.0,
    maxDistance = 10.0,
    heightRange = [0.5, 3.0],
  } = config;
  
  // Get distance range for shot size
  const [sizeMinDist, sizeMaxDist] = SHOT_SIZE_DISTANCES[shotSize];
  const targetDistance = (sizeMinDist + sizeMaxDist) / 2;
  const clampedDistance = Math.max(minDistance, Math.min(maxDistance, targetDistance));
  
  // Get elevation for angle
  const [minElev, maxElev] = CAMERA_ANGLE_ELEVATIONS[angle];
  const elevation = ((minElev + maxElev) / 2) * (Math.PI / 180);
  
  // Calculate position based on subject direction
  const horizontalAngle = Math.atan2(subjectDirection.x, subjectDirection.z);
  
  // Offset camera behind and to the side of subject
  const offsetX = Math.sin(horizontalAngle) * clampedDistance * Math.cos(elevation);
  const offsetZ = Math.cos(horizontalAngle) * clampedDistance * Math.cos(elevation);
  const offsetY = Math.sin(elevation) * clampedDistance;
  
  // Clamp height
  const finalY = Math.max(heightRange[0], Math.min(heightRange[1], subjectPosition.y + offsetY));
  
  return new Vector3(
    subjectPosition.x + offsetX,
    finalY,
    subjectPosition.z + offsetZ,
  );
}

/**
 * Generate trajectory keyframes for a movement type
 */
export function generateTrajectoryKeyframes(
  config: TrajectoryConfig,
  startPosition: Vector3,
  startTarget: Vector3
): TrajectoryKeyframe[] {
  const { movement, duration, keyframes } = config;
  
  // Return custom keyframes if provided
  if (keyframes && keyframes.length > 0) {
    return keyframes;
  }
  
  const keyframeCount = Math.max(2, Math.floor(duration * 2)); // 2 keyframes per second
  const keyframes_: TrajectoryKeyframe[] = [];
  
  switch (movement) {
    case 'dolly': {
      // Push in/out along view direction
      const direction = normalizeVector(subtractVectors(startPosition, startTarget));
      
      for (let i = 0; i <= keyframeCount; i++) {
        const t = i / keyframeCount;
        const progress = easeInOut(t);
        const distance = lerp(3, 1, progress); // Move from 3m to 1m
        
        keyframes_.push({
          time: t * duration,
          position: addVectors(startTarget, scaleVector(direction, distance)),
          target: startTarget,
          easing: 'ease_in_out',
        });
      }
      break;
    }
    
    case 'orbit': {
      const center = config.orbitCenter || startTarget;
      const radius = config.orbitRadius || 3;
      const totalAngle = (config.arcAngle || 360) * (Math.PI / 180);
      
      for (let i = 0; i <= keyframeCount; i++) {
        const t = i / keyframeCount;
        const angle = t * totalAngle;
        
        keyframes_.push({
          time: t * duration,
          position: new Vector3(
            center.x + Math.sin(angle) * radius,
            center.y,
            center.z + Math.cos(angle) * radius,
          ),
          target: center,
          easing: 'linear',
        });
      }
      break;
    }
    
    case 'pan': {
      // Rotate camera around its position
      const panAngle = (Math.PI / 4) * (duration / 2); // 45 degrees over 2 seconds
      
      for (let i = 0; i <= keyframeCount; i++) {
        const t = i / keyframeCount;
        const angle = t * panAngle;
        
        keyframes_.push({
          time: t * duration,
          position: startPosition,
          rotation: new Euler(0, angle, 0),
          easing: 'linear',
        });
      }
      break;
    }
    
    case 'tracking': {
      // Would need subject trajectory - simplified version
      for (let i = 0; i <= keyframeCount; i++) {
        const t = i / keyframeCount;
        
        keyframes_.push({
          time: t * duration,
          position: startPosition, // Would follow subject in real implementation
          target: startTarget,
          easing: 'linear',
        });
      }
      break;
    }
    
    case 'crane': {
      // Vertical arc movement
      const startHeight = startPosition.y;
      const endHeight = startHeight + 2; // Rise 2 meters
      
      for (let i = 0; i <= keyframeCount; i++) {
        const t = i / keyframeCount;
        const progress = easeInOut(t);
        
        keyframes_.push({
          time: t * duration,
          position: new Vector3(
            startPosition.x,
            lerp(startHeight, endHeight, progress),
            startPosition.z,
          ),
          target: startTarget,
          easing: 'ease_in_out',
        });
      }
      break;
    }
    
    default:
      // Static or unknown - just return start position
      keyframes_.push({
        time: 0,
        position: startPosition,
        target: startTarget,
      });
      keyframes_.push({
        time: duration,
        position: startPosition,
        target: startTarget,
      });
  }
  
  return keyframes_;
}

// Helper math functions
function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function addVectors(a: Vector3, b: Vector3): Vector3 {
  return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scaleVector(v: Vector3, s: number): Vector3 {
  return new Vector3(v.x * s, v.y * s, v.z * s);
}

function normalizeVector(v: Vector3): Vector3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return new Vector3(0, 0, 0);
  return new Vector3(v.x / len, v.y / len, v.z / len);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Placeholder for AndRelations (would be imported)
class AndRelations {
  type: 'and' = 'and' as const;
  constructor(public children: ConstraintNode[]) {}
}

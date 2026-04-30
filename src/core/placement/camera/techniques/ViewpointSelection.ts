import * as THREE from 'three';
import { BBox } from '../../../util/math/bbox';

/**
 * Local scene object representation for viewpoint calculations
 */
interface ViewpointSceneObject {
  id?: string;
  name?: string;
  bbox?: BBox;
  position?: THREE.Vector3;
  category?: string;
}

/**
 * Viewpoint selection algorithms for optimal camera placement
 * Implements visibility, composition, and obstruction scoring
 */

export interface ViewpointScore {
  position: THREE.Vector3;
  score: number;
  visibility: number;
  composition: number;
  obstruction: number;
  details: ViewpointMetrics;
}

export interface ViewpointMetrics {
  visibleObjects: number;
  totalObjects: number;
  centerDistance: number;
  ruleOfThirds: number;
  leadingLines: number;
  occludedArea: number;
  depthVariation: number;
}

export interface ViewpointConfig {
  candidates: THREE.Vector3[];
  scene: ViewpointSceneObject[];
  target?: ViewpointSceneObject;
  weights?: {
    visibility: number;
    composition: number;
    obstruction: number;
    depth: number;
  };
  constraints?: {
    minDistance?: number;
    maxDistance?: number;
    minHeight?: number;
    maxHeight?: number;
    avoidZones?: BBox[];
  };
}

/**
 * Score a viewpoint based on multiple criteria
 */
export function scoreViewpoint(
  position: THREE.Vector3,
  scene: ViewpointSceneObject[],
  target?: ViewpointSceneObject,
  config?: Partial<ViewpointConfig>
): number {
  const metrics = evaluateViewpoint(position, scene, target, config);
  
  const weights = config?.weights || {
    visibility: 0.4,
    composition: 0.3,
    obstruction: 0.2,
    depth: 0.1
  };
  
  const visibilityScore = metrics.visibleObjects / Math.max(metrics.totalObjects, 1);
  const compositionScore = metrics.ruleOfThirds * 0.5 + metrics.leadingLines * 0.5;
  const obstructionScore = 1.0 - Math.min(metrics.occludedArea, 1.0);
  const depthScore = Math.min(metrics.depthVariation, 1.0);
  
  const totalScore = 
    weights.visibility * visibilityScore +
    weights.composition * compositionScore +
    weights.obstruction * obstructionScore +
    weights.depth * depthScore;
  
  return totalScore;
}

/**
 * Evaluate viewpoint and return detailed metrics
 */
export function evaluateViewpoint(
  position: THREE.Vector3,
  scene: ViewpointSceneObject[],
  target?: ViewpointSceneObject,
  config?: Partial<ViewpointConfig>
): ViewpointMetrics {
  const targetObj = target || findSceneCenter(scene);
  const targetBBox = getSceneBounds(scene);
  
  // Calculate direction to target
  const center = targetBBox.center();
  const direction = new THREE.Vector3().subVectors(new THREE.Vector3(center.x, center.y, center.z), position).normalize();
  
  // Visibility analysis
  const visibleObjects = countVisibleObjects(position, direction, scene, config?.constraints);
  const totalObjects = scene.length;
  
  // Composition analysis
  const centerDistance = calculateCenterDistance(position, center, direction);
  const ruleOfThirds = calculateRuleOfThirdsScore(position, targetBBox);
  const leadingLines = calculateLeadingLinesScore(position, scene);
  
  // Obstruction analysis
  const occludedArea = calculateOcclusionRatio(position, targetObj, scene);
  
  // Depth variation
  const depthVariation = calculateDepthVariation(position, scene);
  
  return {
    visibleObjects,
    totalObjects,
    centerDistance,
    ruleOfThirds,
    leadingLines,
    occludedArea,
    depthVariation
  };
}

/**
 * Select the best viewpoint from candidates
 */
export function selectBestViewpoint(
  candidates: THREE.Vector3[],
  scene: ViewpointSceneObject[],
  target?: ViewpointSceneObject,
  config?: Partial<ViewpointConfig>
): ViewpointScore | null {
  if (!candidates || candidates.length === 0) {
    return null;
  }
  
  let bestScore: ViewpointScore | null = null;
  let bestValue = -Infinity;
  
  for (const candidate of candidates) {
    // Apply constraints
    if (config?.constraints) {
      const { minDistance, maxDistance, minHeight, maxHeight, avoidZones } = config.constraints;
      
      const targetBBox = getSceneBounds(scene);
      const c = targetBBox.center();
      const centerVec = new THREE.Vector3(c.x, c.y, c.z);
      const distance = candidate.distanceTo(centerVec);
      
      if (minDistance && distance < minDistance) continue;
      if (maxDistance && distance > maxDistance) continue;
      if (minHeight && candidate.y < minHeight) continue;
      if (maxHeight && candidate.y > maxHeight) continue;
      
      if (avoidZones) {
        const inAvoidZone = avoidZones.some(zone => zone.containsPoint({ x: candidate.x, y: candidate.y, z: candidate.z }));
        if (inAvoidZone) continue;
      }
    }
    
    const score = scoreViewpoint(candidate, scene, target, config);
    
    if (score > bestValue) {
      bestValue = score;
      const metrics = evaluateViewpoint(candidate, scene, target, config);
      bestScore = {
        position: candidate.clone(),
        score,
        visibility: metrics.visibleObjects / Math.max(metrics.totalObjects, 1),
        composition: metrics.ruleOfThirds * 0.5 + metrics.leadingLines * 0.5,
        obstruction: 1.0 - Math.min(metrics.occludedArea, 1.0),
        details: metrics
      };
    }
  }
  
  return bestScore;
}

/**
 * Generate candidate viewpoints around a target
 */
export function generateViewpointCandidates(
  target: BBox,
  options: {
    radius?: number;
    horizontalSteps?: number;
    verticalSteps?: number;
    minElevation?: number;
    maxElevation?: number;
  } = {}
): THREE.Vector3[] {
  const {
    radius = target.diagonal() * 2,
    horizontalSteps = 16,
    verticalSteps = 8,
    minElevation = 0.1,
    maxElevation = 0.9
  } = options;
  
  const candidates: THREE.Vector3[] = [];
  const center = target.center();
  
  for (let i = 0; i < horizontalSteps; i++) {
    const theta = (i / horizontalSteps) * Math.PI * 2;
    
    for (let j = 0; j < verticalSteps; j++) {
      const phi = Math.acos(1 - 2 * ((j + minElevation) / (verticalSteps - 1 + maxElevation - minElevation)));
      
      const x = center.x + radius * Math.sin(phi) * Math.cos(theta);
      const y = center.y + radius * Math.cos(phi);
      const z = center.z + radius * Math.sin(phi) * Math.sin(theta);
      
      candidates.push(new THREE.Vector3(x, y, z));
    }
  }
  
  return candidates;
}

// Helper functions

function findSceneCenter(scene: ViewpointSceneObject[]): ViewpointSceneObject | null {
  if (scene.length === 0) return null;
  
  const center = new THREE.Vector3();
  let count = 0;
  for (const obj of scene) {
    if (obj.bbox) {
      const c = obj.bbox.center();
      center.add(new THREE.Vector3(c.x, c.y, c.z));
      count++;
    }
  }
  if (count > 0) center.divideScalar(count);
  
  // Find closest object to center
  let closest = scene[0];
  let minDist = Infinity;
  for (const obj of scene) {
    if (obj.bbox) {
      const c = obj.bbox.center();
      const dist = center.distanceTo(new THREE.Vector3(c.x, c.y, c.z));
      if (dist < minDist) {
        minDist = dist;
        closest = obj;
      }
    }
  }
  
  return closest;
}

function getSceneBounds(scene: ViewpointSceneObject[]): BBox {
  if (scene.length === 0) {
    return new BBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  }
  
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  
  for (const obj of scene) {
    if (obj.bbox) {
      min.x = Math.min(min.x, obj.bbox.min.x);
      min.y = Math.min(min.y, obj.bbox.min.y);
      min.z = Math.min(min.z, obj.bbox.min.z);
      max.x = Math.max(max.x, obj.bbox.max.x);
      max.y = Math.max(max.y, obj.bbox.max.y);
      max.z = Math.max(max.z, obj.bbox.max.z);
    }
  }
  
  return new BBox(min, max);
}

function countVisibleObjects(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  scene: ViewpointSceneObject[],
  constraints?: ViewpointConfig['constraints']
): number {
  // Simplified visibility counting
  // In production, this would use raycasting
  let visible = 0;
  const viewCone = Math.cos(Math.PI / 4); // 45 degree FOV
  
  for (const obj of scene) {
    if (!obj.bbox) continue;
    
    const c = obj.bbox.center();
    const toObj = new THREE.Vector3().subVectors(new THREE.Vector3(c.x, c.y, c.z), position).normalize();
    const dot = direction.dot(toObj);
    
    if (dot > viewCone) {
      visible++;
    }
  }
  
  return visible;
}

function calculateCenterDistance(
  position: THREE.Vector3,
  target: { x: number; y: number; z: number },
  direction: THREE.Vector3
): number {
  const targetVec = new THREE.Vector3(target.x, target.y, target.z);
  const toTarget = new THREE.Vector3().subVectors(targetVec, position).normalize();
  return 1.0 - direction.dot(toTarget);
}

function calculateRuleOfThirdsScore(position: THREE.Vector3, target: BBox): number {
  // Score based on rule of thirds composition
  const diag = target.diagonal();
  const idealOffset = diag * 0.33;
  
  // Check if target is positioned at rule-of-thirds intersection
  const c = target.center();
  const centerVec = new THREE.Vector3(c.x, c.y, c.z);
  const centerOffset = position.distanceTo(centerVec);
  const normalizedOffset = Math.abs(centerOffset - idealOffset) / idealOffset;
  
  return Math.max(0, 1.0 - normalizedOffset);
}

function calculateLeadingLinesScore(position: THREE.Vector3, scene: ViewpointSceneObject[]): number {
  // Detect strong linear arrangements in the scene
  if (scene.length < 3) return 0;
  
  let lineScore = 0;
  const directions: THREE.Vector3[] = [];
  
  for (let i = 0; i < scene.length - 1; i++) {
    if (scene[i].bbox && scene[i + 1].bbox) {
      const c1 = scene[i].bbox!.center();
      const c2 = scene[i + 1].bbox!.center();
      const dir = new THREE.Vector3().subVectors(
        new THREE.Vector3(c2.x, c2.y, c2.z),
        new THREE.Vector3(c1.x, c1.y, c1.z)
      ).normalize();
      directions.push(dir);
    }
  }
  
  // Check for consistent directions
  if (directions.length > 0) {
    const avgDir = new THREE.Vector3();
    for (const dir of directions) {
      avgDir.add(dir);
    }
    avgDir.normalize();
    
    let consistency = 0;
    for (const dir of directions) {
      consistency += Math.abs(avgDir.dot(dir));
    }
    lineScore = consistency / directions.length;
  }
  
  return lineScore;
}

function calculateOcclusionRatio(
  position: THREE.Vector3,
  target: ViewpointSceneObject | null,
  scene: ViewpointSceneObject[]
): number {
  if (!target || !target.bbox) return 0;
  
  // Simplified occlusion calculation
  // In production, this would use shadow mapping or raycasting
  let occluded = 0;
  const tc = target.bbox.center();
  const targetCenter = new THREE.Vector3(tc.x, tc.y, tc.z);
  const toTarget = new THREE.Vector3().subVectors(targetCenter, position);
  
  for (const obj of scene) {
    if (obj === target || !obj.bbox) continue;
    
    const oc = obj.bbox.center();
    const toObj = new THREE.Vector3().subVectors(new THREE.Vector3(oc.x, oc.y, oc.z), position);
    const distToObj = toObj.length();
    const distToTarget = toTarget.length();
    
    if (distToObj < distToTarget) {
      // Object is in front of target
      const angle = toObj.angleTo(toTarget);
      if (angle < 0.1) {
        occluded++;
      }
    }
  }
  
  return occluded / Math.max(scene.length - 1, 1);
}

function calculateDepthVariation(position: THREE.Vector3, scene: ViewpointSceneObject[]): number {
  if (scene.length < 2) return 0;
  
  const distances: number[] = [];
  for (const obj of scene) {
    if (obj.bbox) {
      const c = obj.bbox.center();
      distances.push(position.distanceTo(new THREE.Vector3(c.x, c.y, c.z)));
    }
  }
  
  distances.sort((a, b) => a - b);
  
  // Calculate variance
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / distances.length;
  
  // Normalize to 0-1 range
  const maxVariance = Math.pow(mean, 2);
  return Math.min(variance / maxVariance, 1.0);
}

export default {
  scoreViewpoint,
  selectBestViewpoint,
  evaluateViewpoint,
  generateViewpointCandidates
};

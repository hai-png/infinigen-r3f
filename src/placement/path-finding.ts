/**
 * Path Finding System - Camera Trajectory Planning
 * 
 * Ported from: infinigen/core/placement/path_finding.py
 * 
 * Provides path finding for camera movement through 3D scenes,
 * avoiding obstacles using grid-based search with ray casting.
 */

import * as THREE from 'three';
import { Raycaster } from 'three';

/**
 * Camera pose: [position, rotation]
 */
export type CameraPose = [THREE.Vector3, THREE.Quaternion];

/**
 * Configuration for path finding
 */
export interface PathFindingConfig {
  /** Grid resolution (number of cells) */
  resolution?: number;
  /** Margin around obstacles (world units) */
  margin?: number;
  /** Maximum iterations for path search */
  maxIterations?: number;
  /** Enable diagonal movement in grid */
  allowDiagonal?: boolean;
  /** Heuristic weight for A* (1 = optimal, >1 = faster) */
  heuristicWeight?: number;
}

const defaultPathConfig: Required<PathFindingConfig> = {
  resolution: 100000,
  margin: 0.1,
  maxIterations: 10000,
  allowDiagonal: true,
  heuristicWeight: 1.5,
};

/**
 * 3D grid node for path finding
 */
interface GridNode {
  x: number;
  y: number;
  z: number;
  index: number;
  isFree: boolean;
  gCost: number; // Cost from start
  hCost: number; // Heuristic cost to end
  parent: GridNode | null;
}

/**
 * Find path for camera between two poses while avoiding obstacles
 * 
 * @param scene - Three.js scene to check for obstacles
 * @param boundingBox - Scene bounding box [min, max]
 * @param startPose - Starting camera pose [position, rotation]
 * @param endPose - Target camera pose [position, rotation]
 * @param config - Path finding configuration
 * @returns Array of camera poses along the path, or null if no path found
 */
export function findCameraPath(
  scene: THREE.Scene,
  boundingBox: [THREE.Vector3, THREE.Vector3],
  startPose: CameraPose,
  endPose: CameraPose,
  config: PathFindingConfig = {}
): CameraPose[] | null {
  const cfg = { ...defaultPathConfig, ...config };
  
  const [startPos, startRot] = startPose;
  const [endPos, endRot] = endPose;
  const [bboxMin, bboxMax] = boundingBox;
  
  // Calculate grid dimensions based on volume
  const volume = (bboxMax.x - bboxMin.x) * 
                 (bboxMax.y - bboxMin.y) * 
                 (bboxMax.z - bboxMin.z);
  
  const gridSize = new THREE.Vector3(
    Math.floor((bboxMax.x - bboxMin.x) * Math.pow(cfg.resolution / volume, 1/3)),
    Math.floor((bboxMax.y - bboxMin.y) * Math.pow(cfg.resolution / volume, 1/3)),
    Math.floor((bboxMax.z - bboxMin.z) * Math.pow(cfg.resolution / volume, 1/3))
  );
  
  // Clamp grid size to reasonable limits
  gridSize.x = Math.max(10, Math.min(100, gridSize.x));
  gridSize.y = Math.max(10, Math.min(100, gridSize.y));
  gridSize.z = Math.max(10, Math.min(100, gridSize.z));
  
  const cellSize = new THREE.Vector3(
    (bboxMax.x - bboxMin.x) / gridSize.x,
    (bboxMax.y - bboxMin.y) / gridSize.y,
    (bboxMax.z - bboxMin.z) / gridSize.z
  );
  
  const marginCells = Math.ceil(cfg.margin / Math.min(cellSize.x, cellSize.y, cellSize.z));
  
  console.debug(
    `Path finding: grid=${gridSize.toArray()}, cellSize=${cellSize.toArray()}, margin=${marginCells} cells`
  );
  
  // Initialize grid
  const grid = initializeGrid(gridSize, bboxMin, cellSize, scene, marginCells);
  
  // Get start and end grid coordinates
  const startCell = worldToGrid(startPos, bboxMin, cellSize, gridSize);
  const endCell = worldToGrid(endPos, bboxMin, cellSize, gridSize);
  
  // Validate start and end positions
  if (!isCellValid(startCell, gridSize) || !grid[getCellIndex(startCell, gridSize)]?.isFree) {
    console.warn('Start position is not in free space');
    return null;
  }
  
  if (!isCellValid(endCell, gridSize) || !grid[getCellIndex(endCell, gridSize)]?.isFree) {
    console.warn('End position is not in free space');
    return null;
  }
  
  // Run A* path finding
  const pathCells = aStarSearch(
    grid,
    gridSize,
    startCell,
    endCell,
    cfg.maxIterations,
    cfg.allowDiagonal,
    cfg.heuristicWeight
  );
  
  if (!pathCells || pathCells.length === 0) {
    console.warn('No valid path found');
    return null;
  }
  
  // Convert grid path back to world coordinates with interpolated rotations
  const path: CameraPose[] = [];
  
  for (let i = 0; i < pathCells.length; i++) {
    const cell = pathCells[i];
    const worldPos = gridToWorld(cell, bboxMin, cellSize);
    
    // Interpolate rotation between start and end
    const t = i / (pathCells.length - 1);
    const rotatedQuat = new THREE.Quaternion().slerpQuaternions(startRot, endRot, t);
    
    path.push([worldPos, rotatedQuat]);
  }
  
  return path;
}

/**
 * Initialize 3D grid with obstacle detection
 */
function initializeGrid(
  gridSize: THREE.Vector3,
  bboxMin: THREE.Vector3,
  cellSize: THREE.Vector3,
  scene: THREE.Scene,
  marginCells: number
): GridNode[] {
  const totalCells = gridSize.x * gridSize.y * gridSize.z;
  const grid: GridNode[] = new Array(totalCells);
  
  const raycaster = new Raycaster();
  
  // Create geometry for collision detection
  const testGeometry = new THREE.SphereGeometry(Math.min(cellSize.x, cellSize.y, cellSize.z) * 0.5);
  const testMesh = new THREE.Mesh(testGeometry);
  
  for (let z = 0; z < gridSize.z; z++) {
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const index = getCellIndex({ x, y, z }, gridSize);
        const worldPos = gridToWorld({ x, y, z }, bboxMin, cellSize);
        
        // Check if cell is in free space using ray casting
        const isFree = checkCellFree(raycaster, scene, worldPos, cellSize, marginCells);
        
        grid[index] = {
          x, y, z,
          index,
          isFree,
          gCost: Infinity,
          hCost: Infinity,
          parent: null,
        };
      }
    }
  }
  
  return grid;
}

/**
 * Check if a grid cell is free of obstacles
 */
function checkCellFree(
  raycaster: Raycaster,
  scene: THREE.Scene,
  position: THREE.Vector3,
  cellSize: THREE.Vector3,
  marginCells: number
): boolean {
  // Cast rays in multiple directions to check for nearby obstacles
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  
  const checkDistance = Math.max(cellSize.x, cellSize.y, cellSize.z) * marginCells;
  
  for (const dir of directions) {
    raycaster.set(position, dir);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0 && intersects[0].distance < checkDistance) {
      return false;
    }
  }
  
  return true;
}

/**
 * A* path finding algorithm
 */
function aStarSearch(
  grid: GridNode[],
  gridSize: THREE.Vector3,
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  maxIterations: number,
  allowDiagonal: boolean,
  heuristicWeight: number
): Array<{ x: number; y: number; z: number }> | null {
  const openSet: GridNode[] = [];
  const closedSet = new Set<number>();
  
  const startIndex = getCellIndex(start, gridSize);
  const endIndex = getCellIndex(end, gridSize);
  
  grid[startIndex].gCost = 0;
  grid[startIndex].hCost = heuristic3D(start, end, allowDiagonal);
  openSet.push(grid[startIndex]);
  
  let iterations = 0;
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    
    // Get node with lowest fCost (g + h)
    openSet.sort((a, b) => (a.gCost + a.hCost) - (b.gCost + b.hCost));
    const current = openSet.shift()!;
    
    if (current.index === endIndex) {
      // Reconstruct path
      return reconstructPath(current);
    }
    
    closedSet.add(current.index);
    
    // Check neighbors
    const neighbors = getNeighbors(current, gridSize, allowDiagonal);
    
    for (const neighborCoord of neighbors) {
      const neighborIndex = getCellIndex(neighborCoord, gridSize);
      const neighbor = grid[neighborIndex];
      
      if (!neighbor || !neighbor.isFree || closedSet.has(neighborIndex)) {
        continue;
      }
      
      const moveCost = allowDiagonal && 
        (neighborCoord.x !== current.x || neighborCoord.y !== current.y || neighborCoord.z !== current.z)
        ? 1.414 // Diagonal movement cost (sqrt(2))
        : 1.0;
      
      const tentativeGCost = current.gCost + moveCost;
      
      if (tentativeGCost < neighbor.gCost) {
        neighbor.parent = current;
        neighbor.gCost = tentativeGCost;
        neighbor.hCost = heuristic3D(neighborCoord, end, allowDiagonal) * heuristicWeight;
        
        if (!openSet.find(n => n.index === neighborIndex)) {
          openSet.push(neighbor);
        }
      }
    }
  }
  
  return null; // No path found
}

/**
 * Get neighboring cells
 */
function getNeighbors(
  cell: { x: number; y: number; z: number },
  gridSize: THREE.Vector3,
  allowDiagonal: boolean
): Array<{ x: number; y: number; z: number }> {
  const neighbors: Array<{ x: number; y: number; z: number }> = [];
  
  const offsets = allowDiagonal
    ? [
        [-1, -1, -1], [-1, -1, 0], [-1, -1, 1],
        [-1, 0, -1], [-1, 0, 0], [-1, 0, 1],
        [-1, 1, -1], [-1, 1, 0], [-1, 1, 1],
        [0, -1, -1], [0, -1, 0], [0, -1, 1],
        [0, 0, -1], /* self */ [0, 0, 1],
        [0, 1, -1], [0, 1, 0], [0, 1, 1],
        [1, -1, -1], [1, -1, 0], [1, -1, 1],
        [1, 0, -1], [1, 0, 0], [1, 0, 1],
        [1, 1, -1], [1, 1, 0], [1, 1, 1],
      ]
    : [
        [-1, 0, 0], [1, 0, 0],
        [0, -1, 0], [0, 1, 0],
        [0, 0, -1], [0, 0, 1],
      ];
  
  for (const [dx, dy, dz] of offsets) {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    const nz = cell.z + dz;
    
    if (isCellValid({ x: nx, y: ny, z: nz }, gridSize)) {
      neighbors.push({ x: nx, y: ny, z: nz });
    }
  }
  
  return neighbors;
}

/**
 * 3D distance heuristic (Euclidean or Chebyshev)
 */
function heuristic3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  allowDiagonal: boolean
): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  
  if (allowDiagonal) {
    // Chebyshev distance (allows diagonal movement)
    return Math.max(dx, dy, dz);
  } else {
    // Manhattan distance (only orthogonal movement)
    return dx + dy + dz;
  }
}

/**
 * Reconstruct path from end node
 */
function reconstructPath(endNode: GridNode): Array<{ x: number; y: number; z: number }> {
  const path: Array<{ x: number; y: number; z: number }> = [];
  let current: GridNode | null = endNode;
  
  while (current !== null) {
    path.unshift({ x: current.x, y: current.y, z: current.z });
    current = current.parent;
  }
  
  return path;
}

/**
 * Convert world coordinates to grid cell
 */
function worldToGrid(
  worldPos: THREE.Vector3,
  bboxMin: THREE.Vector3,
  cellSize: THREE.Vector3,
  gridSize: THREE.Vector3
): { x: number; y: number; z: number } {
  return {
    x: Math.floor((worldPos.x - bboxMin.x) / cellSize.x),
    y: Math.floor((worldPos.y - bboxMin.y) / cellSize.y),
    z: Math.floor((worldPos.z - bboxMin.z) / cellSize.z),
  };
}

/**
 * Convert grid cell to world coordinates
 */
function gridToWorld(
  cell: { x: number; y: number; z: number },
  bboxMin: THREE.Vector3,
  cellSize: THREE.Vector3
): THREE.Vector3 {
  return new THREE.Vector3(
    bboxMin.x + (cell.x + 0.5) * cellSize.x,
    bboxMin.y + (cell.y + 0.5) * cellSize.y,
    bboxMin.z + (cell.z + 0.5) * cellSize.z
  );
}

/**
 * Get linear index from 3D cell coordinates
 */
function getCellIndex(
  cell: { x: number; y: number; z: number },
  gridSize: THREE.Vector3
): number {
  return cell.x * gridSize.y * gridSize.z + cell.y * gridSize.z + cell.z;
}

/**
 * Check if cell coordinates are within grid bounds
 */
function isCellValid(
  cell: { x: number; y: number; z: number },
  gridSize: THREE.Vector3
): boolean {
  return (
    cell.x >= 0 && cell.x < gridSize.x &&
    cell.y >= 0 && cell.y < gridSize.y &&
    cell.z >= 0 && cell.z < gridSize.z
  );
}

/**
 * Generate smooth camera trajectory from path points
 * 
 * @param path - Array of camera poses
 * @param smoothing - Smoothing factor (0 = no smoothing, 1 = maximum)
 * @returns Smoothed trajectory
 */
export function smoothCameraTrajectory(
  path: CameraPose[],
  smoothing: number = 0.3
): CameraPose[] {
  if (path.length < 3) {
    return path;
  }
  
  const smoothed: CameraPose[] = [];
  
  // Keep first and last points fixed
  smoothed.push(path[0]);
  
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1][0];
    const curr = path[i][0];
    const next = path[i + 1][0];
    
    // Catmull-Rom spline interpolation
    const t = 0.5; // Uniform parameterization
    
    const p0 = prev;
    const p1 = curr;
    const p2 = next;
    
    // Simple averaging for smoothing
    const smoothedPos = new THREE.Vector3()
      .addVectors(p0, p2)
      .multiplyScalar(smoothing * 0.5)
      .add(p1.clone().multiplyScalar(1 - smoothing));
    
    // Interpolate rotation
    const smoothedRot = new THREE.Quaternion().slerpQuaternions(
      path[i][1],
      new THREE.Quaternion().slerpQuaternions(path[i - 1][1], path[i + 1][1], 0.5),
      smoothing
    );
    
    smoothed.push([smoothedPos, smoothedRot]);
  }
  
  smoothed.push(path[path.length - 1]);
  
  return smoothed;
}

/**
 * Create camera animation keyframes from trajectory
 * 
 * @param trajectory - Array of camera poses
 * @param duration - Total animation duration in seconds
 * @param fps - Frames per second
 * @returns Array of keyframe objects
 */
export function createCameraKeyframes(
  trajectory: CameraPose[],
  duration: number = 10,
  fps: number = 30
): Array<{ time: number; position: THREE.Vector3; rotation: THREE.Quaternion }> {
  const totalFrames = Math.floor(duration * fps);
  const keyframes: Array<{ time: number; position: THREE.Vector3; rotation: THREE.Quaternion }> = [];
  
  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame / totalFrames;
    const index = t * (trajectory.length - 1);
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.min(lowerIndex + 1, trajectory.length - 1);
    const localT = index - lowerIndex;
    
    // Interpolate position
    const position = new THREE.Vector3().lerpVectors(
      trajectory[lowerIndex][0],
      trajectory[upperIndex][0],
      localT
    );
    
    // Interpolate rotation
    const rotation = new THREE.Quaternion().slerpQuaternions(
      trajectory[lowerIndex][1],
      trajectory[upperIndex][1],
      localT
    );
    
    keyframes.push({
      time: frame / fps,
      position,
      rotation,
    });
  }
  
  return keyframes;
}

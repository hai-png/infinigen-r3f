/**
 * LSystemEngine - Full L-System engine with turtle interpretation
 *
 * Standalone L-system engine that can generate complex tree branching
 * structures via turtle graphics. Supports stochastic rules, parametric
 * commands, and multiple presets for different tree forms.
 *
 * Turtle commands:
 *   F  — Move forward, draw branch segment
 *   f  — Move forward, no draw (skip segment)
 *   +  — Turn right by angle
 *   -  — Turn left by angle
 *   &  — Pitch down
 *   ^  — Pitch up
 *   \  — Roll clockwise
 *   /  — Roll counter-clockwise
 *   [  — Push state (position + orientation + thickness + length)
 *   ]  — Pop state
 *   !  — Reduce thickness by thicknessDecay
 *   '  — Reduce length by lengthDecay
 *   $  — Rotate to vertical (uprightness correction)
 *
 * Ported from: infinigen/terrain/objects/tree/lsystem.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// Interfaces
// ============================================================================

export interface LSystemProductionRule {
  /** Predecessor symbol (single character, e.g. 'F') */
  predecessor: string;
  /** Replacement string (e.g. 'FF+[+F-F-F]-[-F+F+F]') */
  successor: string;
  /** Probability of applying this rule (for stochastic L-systems, 0-1) */
  probability: number;
  /** Optional condition: only apply if current depth <= maxDepth */
  maxDepth?: number;
}

export interface LSystemPreset {
  name: string;
  description: string;
  axiom: string;
  rules: LSystemProductionRule[];
  iterations: number;
  angle: number;
  length: number;
  lengthDecay: number;
  thickness: number;
  thicknessDecay: number;
  /** Deterministic vs stochastic */
  deterministic: boolean;
}

export interface TurtleState {
  position: THREE.Vector3;
  heading: THREE.Vector3;
  left: THREE.Vector3;
  up: THREE.Vector3;
  thickness: number;
  length: number;
}

export interface BranchSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startThickness: number;
  endThickness: number;
  depth: number;
  isTerminal: boolean;
}

export interface LSystemOutput {
  segments: BranchSegment[];
  boundingBox: THREE.Box3;
  maxDepth: number;
}

// ============================================================================
// L-System Engine
// ============================================================================

export class LSystemEngine {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate an L-system output from a preset or custom configuration.
   */
  generate(
    preset: LSystemPreset,
    seed: number = 42,
    overrides: Partial<LSystemPreset> = {}
  ): LSystemOutput {
    this.rng = new SeededRandom(seed);
    const config = { ...preset, ...overrides };

    // Step 1: Derive the L-system string
    const lString = this.deriveString(
      config.axiom,
      config.rules,
      config.iterations
    );

    // Step 2: Interpret with turtle graphics
    const segments = this.interpretString(lString, config);

    // Step 3: Mark terminal segments
    this.markTerminalSegments(segments);

    // Step 4: Compute bounding box
    const boundingBox = this.computeBoundingBox(segments);

    return {
      segments,
      boundingBox,
      maxDepth: segments.reduce((max, s) => Math.max(max, s.depth), 0),
    };
  }

  /**
   * Build branch geometry from L-system output.
   * Returns a single merged BufferGeometry.
   */
  buildGeometry(output: LSystemOutput): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    for (const seg of output.segments) {
      const startR = Math.max(seg.startThickness, 0.005);
      const endR = Math.max(seg.endThickness, 0.003);
      const geom = this.createBranchCylinder(seg.start, seg.end, startR, endR);
      geometries.push(geom);
    }

    return this.mergeGeometries(geometries);
  }

  // ------------------------------------------------------------------
  // String derivation
  // ------------------------------------------------------------------

  private deriveString(
    axiom: string,
    rules: LSystemProductionRule[],
    iterations: number
  ): string {
    let current = axiom;

    for (let gen = 0; gen < iterations; gen++) {
      let next = '';

      for (const ch of current) {
        const matchingRules = rules.filter(r => r.predecessor === ch);

        if (matchingRules.length === 0) {
          next += ch;
        } else if (matchingRules.length === 1 && matchingRules[0].probability >= 1.0) {
          next += matchingRules[0].successor;
        } else {
          // Stochastic selection
          const roll = this.rng.next();
          let cumulative = 0;
          let applied = false;

          for (const rule of matchingRules) {
            cumulative += rule.probability;
            if (roll <= cumulative) {
              next += rule.successor;
              applied = true;
              break;
            }
          }

          if (!applied) {
            next += ch;
          }
        }
      }

      current = next;

      // Safety limit
      if (current.length > 150000) {
        break;
      }
    }

    return current;
  }

  // ------------------------------------------------------------------
  // Turtle interpretation
  // ------------------------------------------------------------------

  private interpretString(
    lString: string,
    config: Partial<LSystemPreset>
  ): BranchSegment[] {
    const segments: BranchSegment[] = [];
    const stack: { state: TurtleState; depth: number }[] = [];

    const angle = config.angle ?? 25 * (Math.PI / 180);
    const initialLength = config.length ?? 2.0;
    const lengthDecay = config.lengthDecay ?? 0.7;
    const initialThickness = config.thickness ?? 0.3;
    const thicknessDecay = config.thicknessDecay ?? 0.65;

    let state: TurtleState = {
      position: new THREE.Vector3(0, 0, 0),
      heading: new THREE.Vector3(0, 1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      up: new THREE.Vector3(0, 0, 1),
      thickness: initialThickness,
      length: initialLength,
    };

    let depth = 0;

    for (const ch of lString) {
      switch (ch) {
        case 'F': {
          const start = state.position.clone();
          const end = state.position.clone().add(
            state.heading.clone().multiplyScalar(state.length)
          );
          const endThickness = state.thickness * thicknessDecay;

          segments.push({
            start,
            end,
            startThickness: state.thickness,
            endThickness,
            depth,
            isTerminal: false,
          });

          state.position.copy(end);
          state.thickness = endThickness;
          break;
        }

        case 'f': {
          // Move forward without drawing
          state.position.add(state.heading.clone().multiplyScalar(state.length));
          break;
        }

        case '+': // Turn right
          this.rotateTurtle(state, state.up, angle);
          break;

        case '-': // Turn left
          this.rotateTurtle(state, state.up, -angle);
          break;

        case '&': // Pitch down
          this.rotateTurtle(state, state.left, -angle);
          break;

        case '^': // Pitch up
          this.rotateTurtle(state, state.left, angle);
          break;

        case '\\': // Roll clockwise
          this.rotateTurtle(state, state.heading, -angle);
          break;

        case '/': // Roll counter-clockwise
          this.rotateTurtle(state, state.heading, angle);
          break;

        case '[': // Push state
          stack.push({
            state: {
              position: state.position.clone(),
              heading: state.heading.clone(),
              left: state.left.clone(),
              up: state.up.clone(),
              thickness: state.thickness,
              length: state.length,
            },
            depth,
          });
          depth++;
          state.length *= lengthDecay;
          break;

        case ']': // Pop state
          if (stack.length > 0) {
            const popped = stack.pop()!;
            state = popped.state;
            depth = popped.depth;
          }
          break;

        case '!': // Reduce thickness
          state.thickness *= thicknessDecay;
          break;

        case "'": // Reduce length
          state.length *= lengthDecay;
          break;

        case '$': // Rotate to vertical (uprightness)
          this.alignTurtleToVertical(state);
          break;

        default:
          // Unknown characters ignored (placeholders like X, A, B)
          break;
      }
    }

    return segments;
  }

  private rotateTurtle(state: TurtleState, axis: THREE.Vector3, angle: number): void {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    state.heading = this.rotateVector(state.heading, axis, cosA, sinA);
    state.left = this.rotateVector(state.left, axis, cosA, sinA);
    state.up = this.rotateVector(state.up, axis, cosA, sinA);

    // Re-orthogonalize
    state.heading.normalize();
    state.left.crossVectors(state.up, state.heading).normalize();
    state.up.crossVectors(state.heading, state.left).normalize();
  }

  private rotateVector(v: THREE.Vector3, k: THREE.Vector3, cosA: number, sinA: number): THREE.Vector3 {
    const kCrossV = new THREE.Vector3().crossVectors(k, v);
    const kDotV = k.dot(v);
    const oneMinusCos = 1 - cosA;

    return new THREE.Vector3(
      v.x * cosA + kCrossV.x * sinA + k.x * kDotV * oneMinusCos,
      v.y * cosA + kCrossV.y * sinA + k.y * kDotV * oneMinusCos,
      v.z * cosA + kCrossV.z * sinA + k.z * kDotV * oneMinusCos
    );
  }

  private alignTurtleToVertical(state: TurtleState): void {
    // Align heading toward +Y while preserving forward direction
    const targetUp = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(state.up, targetUp);
    state.heading.applyQuaternion(quaternion);
    state.left.applyQuaternion(quaternion);
    state.up.copy(targetUp);

    state.heading.normalize();
    state.left.normalize();
  }

  // ------------------------------------------------------------------
  // Terminal marking & bounding box
  // ------------------------------------------------------------------

  private markTerminalSegments(segments: BranchSegment[]): void {
    const startPoints = new Set<string>();
    for (const seg of segments) {
      startPoints.add(this.pointKey(seg.start));
    }
    for (const seg of segments) {
      seg.isTerminal = !startPoints.has(this.pointKey(seg.end));
    }
  }

  private pointKey(p: THREE.Vector3): string {
    return `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  }

  private computeBoundingBox(segments: BranchSegment[]): THREE.Box3 {
    const box = new THREE.Box3();
    for (const seg of segments) {
      box.expandByPoint(seg.start);
      box.expandByPoint(seg.end);
    }
    return box;
  }

  // ------------------------------------------------------------------
  // Geometry construction
  // ------------------------------------------------------------------

  private createBranchCylinder(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radiusTop: number,
    radiusBottom: number
  ): THREE.BufferGeometry {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.001) {
      return new THREE.CylinderGeometry(0.01, 0.01, 0.001, 4);
    }

    const segments = Math.max(4, Math.min(8, Math.ceil(radiusBottom * 20)));
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments);

    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
    geometry.applyQuaternion(quaternion);

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    geometry.translate(midpoint.x, midpoint.y, midpoint.z);

    return geometry;
  }

  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    return GeometryPipeline.mergeGeometries(geometries);
  }
}

// ============================================================================
// Preset L-System Configurations
// ============================================================================

function deg(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export const LSystemPresets: Record<string, LSystemPreset> = {
  /** Monopodial: single dominant trunk, branches at top */
  monopodial: {
    name: 'Monopodial',
    description: 'Single dominant trunk with branches concentrated at the top, like a pine or poplar',
    axiom: 'A',
    rules: [
      { predecessor: 'A', successor: 'F[+A][-A]FA', probability: 1.0 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 5,
    angle: deg(25),
    length: 1.5,
    lengthDecay: 0.7,
    thickness: 0.25,
    thicknessDecay: 0.65,
    deterministic: true,
  },

  /** Sympodial: branching trunk, like a baobab or acacia */
  sympodial: {
    name: 'Sympodial',
    description: 'Trunk splits into co-dominant branches, like an acacia or baobab',
    axiom: 'A',
    rules: [
      { predecessor: 'A', successor: '[+FA][-FA]', probability: 1.0 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 4,
    angle: deg(35),
    length: 2.0,
    lengthDecay: 0.65,
    thickness: 0.3,
    thicknessDecay: 0.6,
    deterministic: true,
  },

  /** Weeping: drooping branches, like a willow */
  weeping: {
    name: 'Weeping',
    description: 'Drooping branches that curve downward, like a weeping willow',
    axiom: 'A',
    rules: [
      { predecessor: 'A', successor: 'FF[+A][-A]&FA', probability: 0.6 },
      { predecessor: 'A', successor: 'FF[+A]&FA', probability: 0.4 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 4,
    angle: deg(30),
    length: 1.8,
    lengthDecay: 0.68,
    thickness: 0.28,
    thicknessDecay: 0.62,
    deterministic: false,
  },

  /** Conifer: whorled branches, like a spruce or fir */
  conifer: {
    name: 'Conifer',
    description: 'Whorled branches creating a conical shape, like a spruce or fir',
    axiom: 'FFFFA',
    rules: [
      { predecessor: 'A', successor: '[+FA][-FA][&FA][^FA]', probability: 1.0 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 4,
    angle: deg(40),
    length: 1.2,
    lengthDecay: 0.72,
    thickness: 0.22,
    thicknessDecay: 0.7,
    deterministic: true,
  },

  /** Bush: dense, multi-stem growth */
  bush: {
    name: 'Bush',
    description: 'Dense multi-stem growth with many short branches, like a shrub',
    axiom: 'A',
    rules: [
      { predecessor: 'A', successor: '[+FA][-FA]FA', probability: 0.5 },
      { predecessor: 'A', successor: '[+FA][-FA][&FA]', probability: 0.3 },
      { predecessor: 'A', successor: '[+FA]FA', probability: 0.2 },
      { predecessor: 'F', successor: 'F', probability: 1.0 },
    ],
    iterations: 6,
    angle: deg(35),
    length: 0.6,
    lengthDecay: 0.75,
    thickness: 0.08,
    thicknessDecay: 0.7,
    deterministic: false,
  },

  /** Oak: broad spreading canopy with stochastic branching */
  oak: {
    name: 'Oak',
    description: 'Broad spreading canopy with thick branches, like an oak tree',
    axiom: 'FA',
    rules: [
      { predecessor: 'A', successor: 'FF+[+A-F-A]-[-F+A+A]', probability: 1.0 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 4,
    angle: deg(25),
    length: 2.0,
    lengthDecay: 0.7,
    thickness: 0.35,
    thicknessDecay: 0.65,
    deterministic: true,
  },

  /** Birch: slender with delicate branches */
  birch: {
    name: 'Birch',
    description: 'Slender trunk with delicate horizontal branches, like a silver birch',
    axiom: 'A',
    rules: [
      { predecessor: 'A', successor: 'F[+A]F[-A]+A', probability: 1.0 },
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 4,
    angle: deg(26),
    length: 1.5,
    lengthDecay: 0.65,
    thickness: 0.2,
    thicknessDecay: 0.6,
    deterministic: true,
  },
};

/**
 * Convenience: generate an L-system tree as a THREE.Group
 */
export function generateLSystemTree(
  presetName: string,
  seed: number = 42,
  overrides: Partial<LSystemPreset> = {}
): THREE.Group {
  const preset = LSystemPresets[presetName];
  if (!preset) {
    throw new Error(
      `Unknown L-system preset: ${presetName}. Available: ${Object.keys(LSystemPresets).join(', ')}`
    );
  }

  const engine = new LSystemEngine(seed);
  const output = engine.generate(preset, seed, overrides);
  const geometry = engine.buildGeometry(output);

  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3728,
    roughness: 0.9,
    metalness: 0.0,
  });

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, barkMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Add foliage at terminal branch tips
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d5a1d,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const leafGeometries: THREE.BufferGeometry[] = [];
  const terminalSegments = output.segments.filter(s => s.isTerminal);

  for (const seg of terminalSegments) {
    const clusterRadius = Math.max(seg.endThickness * 4, 0.2);
    const clusterGeo = new THREE.SphereGeometry(clusterRadius, 6, 4);
    clusterGeo.translate(seg.end.x, seg.end.y, seg.end.z);
    leafGeometries.push(clusterGeo);
  }

  if (leafGeometries.length > 0) {
    const mergedLeaves = mergeBufferGeometries(leafGeometries);
    const leafMesh = new THREE.Mesh(mergedLeaves, leafMaterial);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    group.add(leafMesh);
  }

  group.userData.tags = ['vegetation', 'tree', 'lsystem', presetName];
  return group;
}

/**
 * Merge BufferGeometries utility — delegates to canonical GeometryPipeline.
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return GeometryPipeline.mergeGeometries(geometries);
}

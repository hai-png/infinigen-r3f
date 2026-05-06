/**
 * SimReadyObjectFactory — Produces sim-ready articulated objects
 *
 * Wraps any ArticulatedObjectBase generator and produces output that is:
 *   - Directly usable by KinematicCompiler (compileKinematicTree)
 *   - Exportable to URDF, MJCF, and USD via one-call APIs
 *   - Equipped with collision geometry, mass, and inertia data
 *   - Validatable with XML structural checks
 *
 * Pipeline:
 *   Generator → ArticulatedObjectResult
 *     → compileKinematicTree() → KinematicNodeTree
 *     → RigidBodySkeleton.construct() → RigidBodyNode[]
 *     → exportURDF() / exportMJCF() / exportUSD()
 *     → validateXML()
 *
 * Top 5 sim-ready objects (most used in robotics):
 *   1. Door       — hinge joint
 *   2. Drawer     — slider (prismatic) joint
 *   3. Cabinet    — hinge + slider joints
 *   4. Faucet     — hinge joint
 *   5. Lamp       — ball joints
 */

import * as THREE from 'three';
import {
  ArticulatedObjectResult,
  ArticulatedObjectConfig,
  JointInfo,
  generateMJCF,
} from '../assets/objects/articulated/types';
import { generateURDF, URDFExportOptions, estimateInertia } from '../assets/objects/articulated/URDFExporter';
import { generateUSD } from '../assets/objects/articulated/USDExporter';
import {
  compileKinematicTree,
  KinematicNodeTree,
  RigidBodySkeleton,
  RigidBodyNode,
} from './kinematic/KinematicCompiler';
import { DoorGenerator } from '../assets/objects/articulated/DoorGenerator';
import { DrawerGenerator } from '../assets/objects/articulated/DrawerGenerator';
import { CabinetGenerator } from '../assets/objects/articulated/CabinetGenerator';
import { FaucetGenerator } from '../assets/objects/articulated/FaucetGenerator';
import { LampGenerator } from '../assets/objects/articulated/LampGenerator';

// ============================================================================
// Types
// ============================================================================

/** Collision shape specification for a single rigid body */
export interface CollisionSpec {
  type: 'box' | 'sphere' | 'cylinder' | 'convexHull' | 'trimesh';
  params: {
    dimensions?: [number, number, number];   // box
    radius?: number;                          // sphere, cylinder
    height?: number;                          // cylinder
    vertices?: Float32Array;                  // convexHull, trimesh
    indices?: Uint32Array;                    // trimesh
  };
}

/** Mass and inertia properties for a rigid body */
export interface MassProperties {
  mass: number;                    // kg
  centerOfMass: THREE.Vector3;     // local frame
  inertia: {
    ixx: number; ixy: number; ixz: number;
    iyy: number; iyz: number;
    izz: number;
  };
  density: number;                // kg/m³
}

/** Complete sim-ready description of a single rigid body link */
export interface SimReadyLink {
  name: string;
  visualMeshes: THREE.Mesh[];
  collisionSpec: CollisionSpec;
  massProperties: MassProperties;
  friction: number;
  restitution: number;
}

/** Complete sim-ready articulated object */
export interface SimReadyObject {
  /** Original articulated object result */
  original: ArticulatedObjectResult;

  /** Category name (e.g. 'Door', 'Drawer') */
  category: string;

  /** Sim-ready link descriptions */
  links: SimReadyLink[];

  /** Compiled kinematic tree (for FK/IK) */
  kinematicTree: KinematicNodeTree;

  /** Simplified rigid body skeleton (for physics) */
  skeleton: RigidBodySkeleton;

  /** Export to URDF XML */
  toURDF(options?: URDFExportOptions): string;

  /** Export to MJCF XML */
  toMJCF(): string;

  /** Export to USDA (ASCII USD) */
  toUSD(): string;

  /** Validate exported XML is structurally correct */
  validateExport(format: 'urdf' | 'mjcf'): ValidationResult;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Configuration for sim-ready object creation */
export interface SimReadyConfig {
  /** Default density in kg/m³ (default: 500 for wood-like) */
  defaultDensity?: number;
  /** Default friction (default: 0.5) */
  defaultFriction?: number;
  /** Default restitution (default: 0.3) */
  defaultRestitution?: number;
  /** Generator config override */
  generatorConfig?: Partial<ArticulatedObjectConfig>;
}

// ============================================================================
// SimReadyObjectFactory
// ============================================================================

const DEFAULT_SIM_CONFIG: Required<SimReadyConfig> = {
  defaultDensity: 500,
  defaultFriction: 0.5,
  defaultRestitution: 0.3,
  generatorConfig: {},
};

export class SimReadyObjectFactory {
  private config: Required<SimReadyConfig>;

  constructor(config: SimReadyConfig = {}) {
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Top 5 convenience methods
  // --------------------------------------------------------------------------

  /** Create a sim-ready Door (hinge joint) */
  createDoor(config?: Partial<SimReadyConfig>): SimReadyObject {
    return this.createFromGenerator('Door', DoorGenerator, config);
  }

  /** Create a sim-ready Drawer (prismatic/slider joint) */
  createDrawer(config?: Partial<SimReadyConfig>): SimReadyObject {
    return this.createFromGenerator('Drawer', DrawerGenerator, config);
  }

  /** Create a sim-ready Cabinet (hinge + optional slider joints) */
  createCabinet(config?: Partial<SimReadyConfig>): SimReadyObject {
    return this.createFromGenerator('Cabinet', CabinetGenerator, config);
  }

  /** Create a sim-ready Faucet (hinge joint) */
  createFaucet(config?: Partial<SimReadyConfig>): SimReadyObject {
    return this.createFromGenerator('Faucet', FaucetGenerator, config);
  }

  /** Create a sim-ready Lamp (ball joints) */
  createLamp(config?: Partial<SimReadyConfig>): SimReadyObject {
    return this.createFromGenerator('Lamp', LampGenerator, config);
  }

  // --------------------------------------------------------------------------
  // Generic factory method
  // --------------------------------------------------------------------------

  /**
   * Create a sim-ready object from any ArticulatedObjectBase generator.
   *
   * This is the core pipeline:
   * 1. Generate the articulated object (visual + joints)
   * 2. Compile the kinematic tree
   * 3. Build the rigid body skeleton
   * 4. Compute mass/inertia for each link
   * 5. Infer collision geometry for each link
   * 6. Return SimReadyObject with export methods
   */
  createFromGenerator(
    category: string,
    GeneratorClass: new () => { generate: (cfg?: Partial<ArticulatedObjectConfig>) => ArticulatedObjectResult },
    config?: Partial<SimReadyConfig>,
  ): SimReadyObject {
    const mergedConfig = { ...this.config, ...config };
    const generator = new GeneratorClass();
    const result = generator.generate(mergedConfig.generatorConfig);

    // Step 1: Compile kinematic tree
    const kinematicTree = compileKinematicTree(result);

    // Step 2: Build rigid body skeleton
    const skeleton = new RigidBodySkeleton();
    skeleton.construct(kinematicTree);

    // Step 3: Build sim-ready links from skeleton + mesh analysis
    const links = this.buildSimReadyLinks(result, skeleton, mergedConfig);

    // Step 4: Build geometry map for URDF/USD export
    const meshGeometries = this.buildMeshGeometryMap(result, skeleton);

    return {
      original: result,
      category,
      links,
      kinematicTree,
      skeleton,
      toURDF: (options?: URDFExportOptions) =>
        generateURDF(category.toLowerCase(), result.joints, meshGeometries, options),
      toMJCF: () =>
        generateMJCF(category.toLowerCase(), result.joints, meshGeometries),
      toUSD: () =>
        generateUSD(category.toLowerCase(), result.joints, meshGeometries),
      validateExport: (format: 'urdf' | 'mjcf') =>
        SimReadyObjectFactory.validateExport(
          format === 'urdf'
            ? generateURDF(category.toLowerCase(), result.joints, meshGeometries)
            : generateMJCF(category.toLowerCase(), result.joints, meshGeometries),
          format,
        ),
    };
  }

  // --------------------------------------------------------------------------
  // Link building
  // --------------------------------------------------------------------------

  private buildSimReadyLinks(
    result: ArticulatedObjectResult,
    skeleton: RigidBodySkeleton,
    config: Required<SimReadyConfig>,
  ): SimReadyLink[] {
    const links: SimReadyLink[] = [];
    const meshLookup = this.buildMeshLookup(result.group);

    for (const rbNode of skeleton.bodies) {
      const bodyMeshes = this.findMeshesForNode(rbNode, meshLookup);
      const bounds = this.computeCombinedBounds(bodyMeshes);
      const size = new THREE.Vector3();
      bounds.getSize(size);

      // Compute mass from bounding volume × density
      const isRoot = rbNode.parentId === null;
      const volume = size.x * size.y * size.z;
      const fillFactor = this.estimateFillFactor(rbNode.category ?? 'box');
      const mass = isRoot ? 0 : volume * config.defaultDensity * fillFactor;

      // Compute inertia from bounding box approximation
      const inertia = isRoot
        ? { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 }
        : estimateInertia(mass, size);

      // Center of mass
      const center = new THREE.Vector3();
      bounds.getCenter(center);

      // Infer collision shape
      const collisionSpec = this.inferCollisionSpec(bounds, size);

      links.push({
        name: rbNode.id,
        visualMeshes: bodyMeshes,
        collisionSpec,
        massProperties: {
          mass,
          centerOfMass: center,
          inertia,
          density: config.defaultDensity,
        },
        friction: config.defaultFriction,
        restitution: config.defaultRestitution,
      });
    }

    return links;
  }

  private buildMeshGeometryMap(
    result: ArticulatedObjectResult,
    skeleton: RigidBodySkeleton,
  ): Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }> {
    const geoMap = new Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>();
    const meshLookup = this.buildMeshLookup(result.group);

    for (const rbNode of skeleton.bodies) {
      const bodyMeshes = this.findMeshesForNode(rbNode, meshLookup);
      const bounds = this.computeCombinedBounds(bodyMeshes);
      const size = new THREE.Vector3();
      const pos = new THREE.Vector3();
      bounds.getSize(size);
      bounds.getCenter(pos);

      const volume = size.x * size.y * size.z;
      const fillFactor = this.estimateFillFactor(rbNode.category ?? 'box');
      const mass = volume * this.config.defaultDensity * fillFactor;

      geoMap.set(rbNode.id, { size, pos, mass });
    }

    return geoMap;
  }

  // --------------------------------------------------------------------------
  // Mesh analysis helpers
  // --------------------------------------------------------------------------

  private buildMeshLookup(group: THREE.Group): Map<string, THREE.Mesh> {
    const lookup = new Map<string, THREE.Mesh>();
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        lookup.set(child.name || child.uuid, child);
      }
    });
    return lookup;
  }

  private findMeshesForNode(rbNode: RigidBodyNode, meshLookup: Map<string, THREE.Mesh>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    const subsetNames = rbNode.meshSubset.split(',').map((s) => s.trim());

    for (const name of subsetNames) {
      const mesh = meshLookup.get(name);
      if (mesh) meshes.push(mesh);
    }

    return meshes;
  }

  private computeCombinedBounds(meshes: THREE.Mesh[]): THREE.Box3 {
    const bounds = new THREE.Box3();
    if (meshes.length === 0) {
      bounds.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
      return bounds;
    }

    for (const mesh of meshes) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const meshBounds = mesh.geometry.boundingBox!.clone();
      meshBounds.applyMatrix4(mesh.matrixWorld);
      bounds.union(meshBounds);
    }

    return bounds;
  }

  private inferCollisionSpec(bounds: THREE.Box3, size: THREE.Vector3): CollisionSpec {
    const maxDim = Math.max(size.x, size.y, size.z);
    const minDim = Math.min(size.x, size.y, size.z);

    if (maxDim < 1e-6) {
      return { type: 'box', params: { dimensions: [1, 1, 1] } };
    }

    const aspectRatio = maxDim / Math.max(minDim, 1e-6);

    // Nearly uniform → sphere
    if (aspectRatio < 1.3) {
      return { type: 'sphere', params: { radius: maxDim / 2 } };
    }

    // One dimension much larger → cylinder
    if (aspectRatio > 2.0) {
      const radius = minDim / 2;
      const height = maxDim;
      return { type: 'cylinder', params: { radius, height } };
    }

    // Default → box
    return { type: 'box', params: { dimensions: [size.x, size.y, size.z] } };
  }

  private estimateFillFactor(shape: string): number {
    switch (shape) {
      case 'cylinder': return 0.6;
      case 'sphere': return 0.52;
      case 'hollow_box': return 0.3;
      case 'panel': return 0.15;
      default: return 0.5;
    }
  }

  // --------------------------------------------------------------------------
  // XML Validation
  // --------------------------------------------------------------------------

  /**
   * Validate that exported XML is structurally correct.
   *
   * For URDF: checks <robot>, <link>, <joint> structure
   * For MJCF: checks <mujoco>, <worldbody>, <body>, <joint> structure
   */
  static validateExport(xml: string, format: 'urdf' | 'mjcf'): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!xml || xml.trim().length === 0) {
      return { valid: false, errors: ['Empty XML output'], warnings };
    }

    if (format === 'urdf') {
      SimReadyObjectFactory.validateURDF(xml, errors, warnings);
    } else {
      SimReadyObjectFactory.validateMJCF(xml, errors, warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private static validateURDF(xml: string, errors: string[], warnings: string[]): void {
    // Check root element
    if (!xml.includes('<robot')) {
      errors.push('Missing <robot> root element');
    }
    if (!xml.includes('</robot>')) {
      errors.push('Missing </robot> closing tag');
    }

    // Check for at least one link
    const linkMatches = xml.match(/<link\s+name=/g);
    if (!linkMatches || linkMatches.length === 0) {
      errors.push('No <link> elements found in URDF');
    } else if (linkMatches.length === 1) {
      warnings.push('Only one <link> found — articulated objects should have multiple links');
    }

    // Check for at least one joint
    const jointMatches = xml.match(/<joint\s+name=/g);
    if (!jointMatches || jointMatches.length === 0) {
      warnings.push('No <joint> elements found — object may be rigid (non-articulated)');
    }

    // Validate joint types
    const jointTypeMatches = xml.match(/type="(revolute|continuous|prismatic|fixed|floating|planar)"/g);
    if (jointTypeMatches) {
      for (const match of jointTypeMatches) {
        const type = match.match(/type="(\w+)"/)?.[1];
        if (!type) {
          errors.push(`Invalid joint type in: ${match}`);
        }
      }
    }

    // Check parent-child links exist
    const parentLinks = xml.match(/<parent\s+link="([^"]+)"/g);
    const childLinks = xml.match(/<child\s+link="([^"]+)"/g);
    if (parentLinks && childLinks) {
      // Each joint should have both parent and child
      if (parentLinks.length !== childLinks.length) {
        errors.push('Mismatched parent/child link counts in joints');
      }
    }

    // Check for limits on revolute/prismatic joints
    const revoluteJoints = xml.match(/<joint[^>]+type="revolute"[^>]*>[\s\S]*?<\/joint>/g);
    if (revoluteJoints) {
      for (const jointXml of revoluteJoints) {
        if (!jointXml.includes('<limit')) {
          warnings.push('Revolute joint missing <limit> element');
        }
      }
    }

    const prismaticJoints = xml.match(/<joint[^>]+type="prismatic"[^>]*>[\s\S]*?<\/joint>/g);
    if (prismaticJoints) {
      for (const jointXml of prismaticJoints) {
        if (!jointXml.includes('<limit')) {
          warnings.push('Prismatic joint missing <limit> element');
        }
      }
    }

    // Check XML declaration
    if (!xml.startsWith('<?xml')) {
      warnings.push('Missing XML declaration (<?xml version="1.0"?>)');
    }

    // Validate inertial data exists
    const inertialCount = (xml.match(/<inertial>/g) || []).length;
    const linkCount = (xml.match(/<link\s+name=/g) || []).length;
    if (linkCount > 0 && inertialCount < linkCount) {
      warnings.push(`${linkCount - inertialCount} links missing <inertial> data`);
    }
  }

  private static validateMJCF(xml: string, errors: string[], warnings: string[]): void {
    // Check root element
    if (!xml.includes('<mujoco')) {
      errors.push('Missing <mujoco> root element');
    }
    if (!xml.includes('</mujoco>')) {
      errors.push('Missing </mujoco> closing tag');
    }

    // Check for worldbody
    if (!xml.includes('<worldbody>')) {
      errors.push('Missing <worldbody> element');
    }

    // Check for at least one body
    const bodyMatches = xml.match(/<body\s+name=/g);
    if (!bodyMatches || bodyMatches.length === 0) {
      errors.push('No <body> elements found in MJCF');
    }

    // Check for joints
    const jointMatches = xml.match(/<joint\s+name=/g);
    if (!jointMatches || jointMatches.length === 0) {
      warnings.push('No <joint> elements found — object may be rigid');
    }

    // Validate joint types
    const jointTypeMatches = xml.match(/type="(hinge|slide|ball|fixed)"/g);
    if (jointTypeMatches) {
      for (const match of jointTypeMatches) {
        const type = match.match(/type="(\w+)"/)?.[1];
        if (!type || !['hinge', 'slide', 'ball', 'fixed'].includes(type)) {
          errors.push(`Invalid MJCF joint type in: ${match}`);
        }
      }
    }

    // Check for range on limited joints
    const hingeJoints = xml.match(/<joint[^>]+type="hinge"[^/]*\/>/g);
    if (hingeJoints) {
      for (const jointXml of hingeJoints) {
        if (!jointXml.includes('limited="false"') && !jointXml.includes('range=')) {
          warnings.push('Hinge joint without range or limited="false"');
        }
      }
    }

    // Validate actuator section
    if (xml.includes('<actuator>') && !xml.includes('</actuator>')) {
      errors.push('Unclosed <actuator> element');
    }

    // Check for compiler element
    if (!xml.includes('<compiler')) {
      warnings.push('Missing <compiler> element (angle convention may be wrong)');
    }
  }

  // --------------------------------------------------------------------------
  // Batch creation
  // --------------------------------------------------------------------------

  /**
   * Create all 5 top sim-ready objects at once.
   */
  createTop5(config?: Partial<SimReadyConfig>): SimReadyObject[] {
    return [
      this.createDoor(config),
      this.createDrawer(config),
      this.createCabinet(config),
      this.createFaucet(config),
      this.createLamp(config),
    ];
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

/** Create a sim-ready door */
export function createSimReadyDoor(config?: Partial<SimReadyConfig>): SimReadyObject {
  return new SimReadyObjectFactory(config).createDoor();
}

/** Create a sim-ready drawer */
export function createSimReadyDrawer(config?: Partial<SimReadyConfig>): SimReadyObject {
  return new SimReadyObjectFactory(config).createDrawer();
}

/** Create a sim-ready cabinet */
export function createSimReadyCabinet(config?: Partial<SimReadyConfig>): SimReadyObject {
  return new SimReadyObjectFactory(config).createCabinet();
}

/** Create a sim-ready faucet */
export function createSimReadyFaucet(config?: Partial<SimReadyConfig>): SimReadyObject {
  return new SimReadyObjectFactory(config).createFaucet();
}

/** Create a sim-ready lamp */
export function createSimReadyLamp(config?: Partial<SimReadyConfig>): SimReadyObject {
  return new SimReadyObjectFactory(config).createLamp();
}

/**
 * End-to-end pipeline test: generate → compile → export → validate
 *
 * Returns a report for each of the top 5 objects.
 */
export function runSimReadyPipelineValidation(): {
  category: string;
  linkCount: number;
  jointCount: number;
  urdfValid: boolean;
  mjcfValid: boolean;
  urdfErrors: string[];
  mjcfErrors: string[];
}[] {
  const factory = new SimReadyObjectFactory();
  const objects = factory.createTop5();

  return objects.map((obj) => {
    const urdfResult = obj.validateExport('urdf');
    const mjcfResult = obj.validateExport('mjcf');

    return {
      category: obj.category,
      linkCount: obj.links.length,
      jointCount: obj.original.joints.length,
      urdfValid: urdfResult.valid,
      mjcfValid: mjcfResult.valid,
      urdfErrors: urdfResult.errors,
      mjcfErrors: mjcfResult.errors,
    };
  });
}

export default SimReadyObjectFactory;

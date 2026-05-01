/**
 * Articulated Object Types
 * 
 * Defines joint types, configuration, and MJCF export capabilities
 * for articulated objects matching Infinigen's categories.
 */

import * as THREE from 'three';

// ============================================================================
// Joint Types
// ============================================================================

export type JointType = 'hinge' | 'prismatic' | 'ball' | 'fixed';

export interface JointInfo {
  /** Unique identifier for this joint */
  id: string;
  /** Joint type */
  type: JointType;
  /** Axis of rotation/translation in parent frame */
  axis: THREE.Vector3;
  /** Joint limits [min, max] in radians (hinge/ball) or meters (prismatic) */
  limits: { min: number; max: number };
  /** Reference to the child mesh name */
  childMesh: string;
  /** Reference to the parent mesh name (empty for root) */
  parentMesh: string;
  /** Anchor point in parent local space */
  anchor: THREE.Vector3;
  /** Damping coefficient */
  damping: number;
  /** Friction coefficient */
  friction: number;
  /** Whether this joint is actuated */
  actuated: boolean;
  /** Optional motor config */
  motor?: {
    ctrlRange: [number, number];
    gearRatio: number;
  };
}

// ============================================================================
// Articulated Object Configuration
// ============================================================================

export interface ArticulatedObjectConfig {
  seed?: number;
  style?: 'modern' | 'traditional' | 'industrial' | 'minimalist';
  scale?: number;
  materialOverrides?: Record<string, Partial<THREE.MeshStandardMaterialParameters>>;
}

export interface ArticulatedObjectResult {
  /** Root THREE.Group containing all meshes */
  group: THREE.Group;
  /** Joint metadata for physics simulation */
  joints: JointInfo[];
  /** Category name (e.g. 'Door', 'Drawer') */
  category: string;
  /** Config used for generation */
  config: ArticulatedObjectConfig;
  /** Export to MJCF XML string */
  toMJCF: () => string;
}

// ============================================================================
// MJCF Export Utilities
// ============================================================================

/** Convert a THREE.Vector3 to MJCF space (x, y, z) string */
function vec3ToMJCF(v: THREE.Vector3): string {
  return `${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`;
}

/** Convert axis to MJCF axis string */
function axisToMJCF(v: THREE.Vector3): string {
  return `${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`;
}

/** Joint type mapping to MJCF */
function jointTypeToMJCF(type: JointType): string {
  switch (type) {
    case 'hinge': return 'hinge';
    case 'prismatic': return 'slide';
    case 'ball': return 'ball';
    case 'fixed': return 'fixed';
  }
}

/**
 * Generate MJCF XML from articulated object data
 */
export function generateMJCF(
  name: string,
  joints: JointInfo[],
  meshGeometries: Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>
): string {
  const lines: string[] = [];

  lines.push('<mujoco model="' + name + '">');
  lines.push('  <worldbody>');
  lines.push('    <body name="' + name + '_base" pos="0 0 0">');

  // Add geoms for each mesh
  for (const [meshName, data] of meshGeometries) {
    lines.push(`      <geom name="${meshName}" type="box" size="${vec3ToMJCF(data.size.clone().multiplyScalar(0.5))}" pos="${vec3ToMJCF(data.pos)}" />`);
  }

  // Add joints
  for (const joint of joints) {
    if (joint.type === 'fixed') continue;

    const mjcfType = jointTypeToMJCF(joint.type);
    const axisStr = axisToMJCF(joint.axis);
    const rangeStr = `${joint.limits.min.toFixed(4)} ${joint.limits.max.toFixed(4)}`;
    const posStr = vec3ToMJCF(joint.anchor);

    let jointXml = `      <joint name="${joint.id}" type="${mjcfType}" axis="${axisStr}" range="${rangeStr}" pos="${posStr}"`;

    if (joint.damping > 0) {
      jointXml += ` damping="${joint.damping.toFixed(4)}"`;
    }
    if (joint.friction > 0) {
      jointXml += ` friction="${joint.friction.toFixed(4)}"`;
    }

    jointXml += ' />';
    lines.push(jointXml);

    // Add actuator reference if actuated
    if (joint.actuated && joint.motor) {
      // Actuator is added outside worldbody
    }
  }

  lines.push('    </body>');
  lines.push('  </worldbody>');

  // Add actuators
  const actuatedJoints = joints.filter(j => j.actuated);
  if (actuatedJoints.length > 0) {
    lines.push('  <actuator>');
    for (const joint of actuatedJoints) {
      const ctrlRange = joint.motor?.ctrlRange ?? [joint.limits.min, joint.limits.max];
      lines.push(`    <motor name="${joint.id}_motor" joint="${joint.id}" ctrlrange="${ctrlRange[0].toFixed(4)} ${ctrlRange[1].toFixed(4)}" gear="${joint.motor?.gearRatio ?? 1}" />`);
    }
    lines.push('  </actuator>');
  }

  lines.push('</mujoco>');
  return lines.join('\n');
}

// ============================================================================
// Articulated Object Base Class
// ============================================================================

export type ArticulatedStyle = 'modern' | 'traditional' | 'industrial' | 'minimalist';

export abstract class ArticulatedObjectBase {
  protected seed: number;
  protected rng: () => number;
  protected style: ArticulatedStyle;
  protected scale: number;
  protected category: string;

  constructor(config: ArticulatedObjectConfig = {}) {
    this.seed = config.seed ?? Math.floor(Math.random() * 100000);
    this.style = config.style ?? 'modern';
    this.scale = config.scale ?? 1;
    this.category = 'unknown';

    // Simple seeded RNG (LCG)
    let s = this.seed;
    this.rng = () => {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (s >>> 0) / 0xFFFFFFFF;
    };
  }

  /**
   * Generate the articulated object
   */
  abstract generate(config?: Partial<ArticulatedObjectConfig>): ArticulatedObjectResult;

  /**
   * Create a standard material for this object
   */
  protected createMaterial(params: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1,
      ...params,
    });
  }

  /**
   * Create a box mesh with proper naming
   */
  protected createBox(
    name: string,
    width: number, height: number, depth: number,
    material: THREE.Material,
    position?: THREE.Vector3
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width * this.scale, height * this.scale, depth * this.scale);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (position) mesh.position.copy(position.multiplyScalar(this.scale));
    return mesh;
  }

  /**
   * Create a cylinder mesh with proper naming
   */
  protected createCylinder(
    name: string,
    radiusTop: number, radiusBottom: number, height: number,
    material: THREE.Material,
    position?: THREE.Vector3,
    segments: number = 16
  ): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(
      radiusTop * this.scale, radiusBottom * this.scale, height * this.scale, segments
    );
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (position) mesh.position.copy(position.multiplyScalar(this.scale));
    return mesh;
  }

  /**
   * Helper: build a JointInfo object
   */
  protected createJoint(params: {
    id: string;
    type: JointType;
    axis: [number, number, number];
    limits: [number, number];
    childMesh: string;
    parentMesh?: string;
    anchor?: [number, number, number];
    damping?: number;
    friction?: number;
    actuated?: boolean;
    motor?: { ctrlRange: [number, number]; gearRatio: number };
  }): JointInfo {
    return {
      id: params.id,
      type: params.type,
      axis: new THREE.Vector3(params.axis[0], params.axis[1], params.axis[2]),
      limits: { min: params.limits[0], max: params.limits[1] },
      childMesh: params.childMesh,
      parentMesh: params.parentMesh ?? '',
      anchor: params.anchor ? new THREE.Vector3(params.anchor[0], params.anchor[1], params.anchor[2]) : new THREE.Vector3(),
      damping: params.damping ?? 0.5,
      friction: params.friction ?? 0.1,
      actuated: params.actuated ?? false,
      motor: params.motor,
    };
  }
}

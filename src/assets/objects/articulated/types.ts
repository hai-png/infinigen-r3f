/**
 * Articulated Object Types
 * 
 * Defines joint types, configuration, and MJCF export capabilities
 * for articulated objects matching Infinigen's categories.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Joint Types
// ============================================================================

export type JointType = 'hinge' | 'prismatic' | 'ball' | 'ball_socket' | 'fixed' | 'continuous';

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
  /** Export to URDF XML string (optional — provided by sim-ready generators) */
  toURDF?: (options?: import('./URDFExporter').URDFExportOptions) => string;
  /** Export to USDA (ASCII USD) string (optional — provided by sim-ready generators) */
  toUSD?: () => string;
  /** Mesh geometry map for export (optional — provided by sim-ready generators) */
  meshGeometries?: Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>;
  /** Sim-ready metadata: mass per mesh, collision shapes, etc. */
  simReady?: SimReadyMetadata;
}

/** Sim-ready metadata attached to ArticulatedObjectResult */
export interface SimReadyMetadata {
  /** Default density used for mass estimation (kg/m³) */
  density: number;
  /** Default friction coefficient */
  friction: number;
  /** Default restitution */
  restitution: number;
  /** Whether the root body should be static */
  rootBodyStatic: boolean;
  /** Per-mesh collision shape hints */
  collisionHints: Map<string, 'box' | 'sphere' | 'cylinder'>;
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
function jointTypeToMJCF(type: JointType): { mjcfType: string; limited: boolean } {
  switch (type) {
    case 'hinge': return { mjcfType: 'hinge', limited: true };
    case 'continuous': return { mjcfType: 'hinge', limited: false };
    case 'prismatic': return { mjcfType: 'slide', limited: true };
    case 'ball':
    case 'ball_socket': return { mjcfType: 'ball', limited: false };
    case 'fixed': return { mjcfType: 'fixed', limited: false };
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

  // Add geoms for each mesh - use mesh reference when available
  // Add mesh assets first
  lines.push('  <asset>');
  for (const [meshName, data] of meshGeometries) {
    lines.push(`    <mesh name="${meshName}" file="./meshes/${meshName}.obj" scale="${data.size.x.toFixed(4)} ${data.size.y.toFixed(4)} ${data.size.z.toFixed(4)}" />`);
  }
  lines.push('  </asset>');

  // Add geom references in worldbody
  for (const [meshName, data] of meshGeometries) {
    lines.push(`      <geom name="${meshName}_geom" type="mesh" mesh="${meshName}" pos="${vec3ToMJCF(data.pos)}" />`);
  }

  // Add joints
  for (const joint of joints) {
    if (joint.type === 'fixed') continue;

    const { mjcfType, limited } = jointTypeToMJCF(joint.type);
    const axisStr = axisToMJCF(joint.axis);
    const posStr = vec3ToMJCF(joint.anchor);

    let jointXml = `      <joint name="${joint.id}" type="${mjcfType}" axis="${axisStr}" pos="${posStr}"`;

    if (limited) {
      const rangeStr = `${joint.limits.min.toFixed(4)} ${joint.limits.max.toFixed(4)}`;
      jointXml += ` range="${rangeStr}"`;
    } else {
      jointXml += ` limited="false"`;
    }

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
      lines.push(`    <motor name="${joint.id}_motor" joint="${joint.id}" ctrlrange="${ctrlRange[0].toFixed(4)} ${ctrlRange[1].toFixed(4)}" ctrllimited="true" gear="${joint.motor?.gearRatio ?? 1}" />`);
    }
    lines.push('  </actuator>');
  }

  // Add sensors (joint position + velocity for all non-fixed joints)
  const movableJoints = joints.filter(j => j.type !== 'fixed');
  if (movableJoints.length > 0) {
    lines.push('  <sensor>');
    for (const joint of movableJoints) {
      lines.push(`    <jointpos joint="${joint.id}"/>`);
      lines.push(`    <jointvel joint="${joint.id}"/>`);
    }
    lines.push('  </sensor>');
  }

  lines.push('</mujoco>');
  return lines.join('\n');
}

// ============================================================================
// MJCF Validation
// ============================================================================

/** Valid MJCF joint types per the MuJoCo specification */
const VALID_MJCF_JOINT_TYPES = new Set([
  'hinge',
  'slide',
  'ball',
  'free',
  'fixed',
]);

/**
 * Validate an MJCF XML string.
 *
 * Checks:
 * 1. Root element is `<mujoco>`
 * 2. At least one `<body>` element exists in `<worldbody>`
 * 3. Each `<joint>` has a valid type attribute
 * 4. All `<geom>` elements have valid type attributes
 * 5. Mesh references in `<geom>` point to existing `<mesh>` assets
 * 6. Joint references in `<actuator>` and `<sensor>` point to existing joints
 *
 * @param mjcfXml - The MJCF XML string to validate
 * @returns ValidationResult with `valid` flag and list of error messages
 *
 * @example
 * ```ts
 * const result = validateMJCF(mjcfString);
 * if (!result.valid) {
 *   console.error('MJCF validation failed:', result.errors);
 * }
 * ```
 */
export function validateMJCF(mjcfXml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mjcfXml || mjcfXml.trim().length === 0) {
    return { valid: false, errors: ['MJCF XML is empty'] };
  }

  // Parse the XML
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(mjcfXml, 'application/xml');
  } catch (e) {
    return { valid: false, errors: [`Failed to parse XML: ${e instanceof Error ? e.message : String(e)}`] };
  }

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return { valid: false, errors: [`XML parse error: ${parseError.textContent}`] };
  }

  // 1. Root element must be <mujoco>
  const rootElement = doc.documentElement;
  if (!rootElement || rootElement.tagName !== 'mujoco') {
    errors.push(`Root element is "${rootElement?.tagName ?? 'missing'}", expected "mujoco"`);
  }

  // 2. At least one <body> element in <worldbody>
  const worldbody = doc.querySelector('worldbody');
  if (!worldbody) {
    errors.push('No <worldbody> element found — MJCF must have a worldbody');
  } else {
    const bodies = worldbody.querySelectorAll('body');
    if (bodies.length === 0) {
      errors.push('No <body> elements found in <worldbody> — MJCF must have at least one body');
    }
  }

  // Collect joint names for actuator/sensor reference checking
  const jointNames = new Set<string>();
  const joints = doc.querySelectorAll('joint');
  joints.forEach((joint) => {
    const name = joint.getAttribute('name');
    if (name) {
      jointNames.add(name);
    }
  });

  // 3. Each <joint> has a valid type
  joints.forEach((joint, index) => {
    const jointName = joint.getAttribute('name') || `joint_${index}`;
    const jointType = joint.getAttribute('type');

    if (jointType && !VALID_MJCF_JOINT_TYPES.has(jointType)) {
      errors.push(`Joint "${jointName}" has invalid type "${jointType}" — must be one of: ${[...VALID_MJCF_JOINT_TYPES].join(', ')}`);
    }

    // Hinge/slide joints should have range or limited attribute
    if (jointType === 'hinge' || jointType === 'slide') {
      const range = joint.getAttribute('range');
      const limited = joint.getAttribute('limited');
      // Not a hard error, but worth noting
      if (!range && limited !== 'false') {
        // Could be intentionally unlimited (limited="false"), otherwise range is expected
      }
    }
  });

  // 4. Validate <geom> type attributes
  const VALID_GEOM_TYPES = new Set([
    'plane', 'sphere', 'capsule', 'ellipsoid', 'cylinder', 'box',
    'mesh', 'hfield', 'none',
  ]);
  const geoms = doc.querySelectorAll('geom');
  geoms.forEach((geom, index) => {
    const geomName = geom.getAttribute('name') || `geom_${index}`;
    const geomType = geom.getAttribute('type');

    if (geomType && !VALID_GEOM_TYPES.has(geomType)) {
      errors.push(`Geom "${geomName}" has invalid type "${geomType}" — must be one of: ${[...VALID_GEOM_TYPES].join(', ')}`);
    }
  });

  // 5. Mesh references in <geom> point to existing <mesh> assets
  const meshAssetNames = new Set<string>();
  const meshAssets = doc.querySelectorAll('asset > mesh');
  meshAssets.forEach((mesh) => {
    const name = mesh.getAttribute('name');
    if (name) {
      meshAssetNames.add(name);
    }
  });

  geoms.forEach((geom, index) => {
    const geomName = geom.getAttribute('name') || `geom_${index}`;
    const meshRef = geom.getAttribute('mesh');
    if (meshRef && !meshAssetNames.has(meshRef)) {
      errors.push(`Geom "${geomName}" references mesh "${meshRef}" which does not exist in <asset>`);
    }
  });

  // 6. Actuator/sensor joint references point to existing joints
  const actuators = doc.querySelectorAll('actuator > motor, actuator > position, actuator > velocity, actuator > general');
  actuators.forEach((act, index) => {
    const actName = act.getAttribute('name') || `actuator_${index}`;
    const jointRef = act.getAttribute('joint');
    if (jointRef && !jointNames.has(jointRef)) {
      errors.push(`Actuator "${actName}" references joint "${jointRef}" which does not exist`);
    }
  });

  const sensors = doc.querySelectorAll('sensor > jointpos, sensor > jointvel, sensor > jointlimitpos, sensor > jointlimitvel');
  sensors.forEach((sensor, index) => {
    const sensorName = sensor.getAttribute('name') || `sensor_${index}`;
    const jointRef = sensor.getAttribute('joint');
    if (jointRef && !jointNames.has(jointRef)) {
      errors.push(`Sensor "${sensorName}" references joint "${jointRef}" which does not exist`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Articulated Object Base Class
// ============================================================================

export type ArticulatedStyle = 'modern' | 'traditional' | 'industrial' | 'minimalist';

export abstract class ArticulatedObjectBase {
  protected seed: number;
  protected rng: SeededRandom;
  protected style: ArticulatedStyle;
  protected scale: number;
  protected category: string;

  constructor(config: ArticulatedObjectConfig = {}) {
    this.seed = config.seed ?? 42;
    this.style = config.style ?? 'modern';
    this.scale = config.scale ?? 1;
    this.category = 'unknown';
    this.rng = new SeededRandom(this.seed);
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

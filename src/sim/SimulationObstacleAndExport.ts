/**
 * Simulation Obstacle Support + URDF/MJCF Export (P1)
 *
 * Provides:
 *   1. FluidObstacleManager — register analytical & mesh-based obstacles as SDFs for FLIP solver
 *   2. FluidObstacleConfig — per-obstacle configuration
 *   3. URDFExporter — generate URDF XML from CompositionalGenome part tree
 *   4. MJCFExporter — generate MJCF XML from CompositionalGenome part tree
 *   5. PhysicsRagdollExporter — create ragdoll rigid-body configs from genome
 *   6. ObstacleFluidCoupling — wire obstacles into FLIP solver boundary conditions
 *   7. KinematicObstacle — animated obstacles with keyframe trajectories
 *
 * @module SimulationObstacleAndExport
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { FluidObstacle } from './fluid/FLIPSurfaceExtractor';
import type { FLIPFluidSolver, FLIPGrid } from './fluid/FLIPFluidSolver';
import type {
  CompositionalGenome,
  PartNode,
  JointConfig as GenomeJointConfig,
  PartParams,
} from '@/assets/objects/creatures/genome/CompositionalGenome';
import { PartType } from '@/assets/objects/creatures/genome/CompositionalGenome';
import type { Attachment } from '@/assets/objects/creatures/genome/CompositionalGenome';

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FluidObstacleConfig Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for a single fluid obstacle.
 * Controls voxelization resolution, velocity coupling, and surface friction.
 */
export interface FluidObstacleConfig {
  /** Voxelization resolution per axis for mesh-based SDF (default 32) */
  meshResolution: number;
  /** Padding around obstacle bounds in world units (default 0.1) */
  padding: number;
  /** How much obstacle velocity affects fluid, 0–1 (default 0.5) */
  velocityInfluence: number;
  /** Friction coefficient at the obstacle surface (default 0.3) */
  friction: number;
}

/** Default obstacle configuration */
export const DEFAULT_FLUID_OBSTACLE_CONFIG: FluidObstacleConfig = {
  meshResolution: 32,
  padding: 0.1,
  velocityInfluence: 0.5,
  friction: 0.3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Internal: AnalyticalSDF type tag
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tags the kind of analytical SDF stored in a registered obstacle entry.
 * Mesh-based obstacles carry a FluidObstacle reference instead.
 */
type AnalyticalKind = 'box' | 'sphere' | 'cylinder' | 'terrain';

/**
 * Internal representation of a registered obstacle.
 * Either wraps an existing FluidObstacle (mesh-based) or stores analytical
 * SDF parameters that can be evaluated without voxelization.
 */
interface ObstacleEntry {
  /** The FluidObstacle instance (mesh-based or converted terrain) */
  obstacle: FluidObstacle;
  /** If analytical, the kind and parameters */
  analytical?: {
    kind: AnalyticalKind;
    center: THREE.Vector3;
    halfSize?: THREE.Vector3;           // box
    radius?: number;                    // sphere / cylinder
    height?: number;                    // cylinder
    axis?: THREE.Vector3;               // cylinder axis (normalized)
    rotation?: THREE.Quaternion;        // box rotation
  };
  /** Per-obstacle config */
  config: FluidObstacleConfig;
  /** Current velocity of the obstacle (for momentum transfer) */
  velocity: THREE.Vector3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FluidObstacleManager Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages all fluid obstacles in the simulation scene.
 *
 * Supports both mesh-based obstacles (voxelized to SDF via FluidObstacle)
 * and analytical primitives (box, sphere, cylinder, terrain) that are
 * evaluated without voxelization for speed.
 *
 * The composite SDF at any point is the union (min) of all obstacle SDFs,
 * where negative values indicate inside an obstacle.
 */
export class FluidObstacleManager {
  /** Registered obstacle entries */
  private entries: ObstacleEntry[] = [];

  /**
   * Add a mesh-based obstacle. The mesh is converted to a voxelized SDF
   * via FluidObstacle.voxelizeSDF at the configured resolution.
   *
   * @param mesh   - THREE.Mesh to use as obstacle geometry
   * @param config - Per-obstacle configuration
   */
  addMeshObstacle(mesh: THREE.Mesh, config: Partial<FluidObstacleConfig> = {}): void {
    const cfg = { ...DEFAULT_FLUID_OBSTACLE_CONFIG, ...config };
    const obstacle = new FluidObstacle(mesh);
    obstacle.voxelizeSDF(cfg.meshResolution);
    this.entries.push({
      obstacle,
      config: cfg,
      velocity: new THREE.Vector3(),
    });
  }

  /**
   * Add an axis-aligned or oriented box obstacle with an analytical SDF.
   * No voxelization is needed — the SDF is evaluated analytically.
   *
   * @param center   - Center of the box in world space
   * @param size     - Full extent of the box along each axis
   * @param rotation - Optional rotation (default identity)
   */
  addBoxObstacle(
    center: THREE.Vector3,
    size: THREE.Vector3,
    rotation: THREE.Quaternion = new THREE.Quaternion(),
  ): void {
    // Create a placeholder mesh for FluidObstacle compatibility
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo);
    mesh.position.copy(center);
    mesh.quaternion.copy(rotation);
    mesh.updateMatrixWorld(true);

    const obstacle = new FluidObstacle(mesh);
    this.entries.push({
      obstacle,
      analytical: {
        kind: 'box',
        center: center.clone(),
        halfSize: size.clone().multiplyScalar(0.5),
        rotation: rotation.clone(),
      },
      config: { ...DEFAULT_FLUID_OBSTACLE_CONFIG },
      velocity: new THREE.Vector3(),
    });
  }

  /**
   * Add a sphere obstacle with an analytical SDF.
   *
   * @param center - Center of the sphere in world space
   * @param radius - Radius of the sphere
   */
  addSphereObstacle(center: THREE.Vector3, radius: number): void {
    const geo = new THREE.SphereGeometry(radius, 16, 16);
    const mesh = new THREE.Mesh(geo);
    mesh.position.copy(center);
    mesh.updateMatrixWorld(true);

    const obstacle = new FluidObstacle(mesh);
    this.entries.push({
      obstacle,
      analytical: {
        kind: 'sphere',
        center: center.clone(),
        radius,
      },
      config: { ...DEFAULT_FLUID_OBSTACLE_CONFIG },
      velocity: new THREE.Vector3(),
    });
  }

  /**
   * Add a cylinder obstacle with an analytical SDF.
   * The cylinder is centered at `center` and extends along `axis`.
   *
   * @param center - Center of the cylinder in world space
   * @param radius - Radius of the cylinder
   * @param height - Full height of the cylinder
   * @param axis   - Orientation axis (default Y-up)
   */
  addCylinderObstacle(
    center: THREE.Vector3,
    radius: number,
    height: number,
    axis: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
  ): void {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
    const mesh = new THREE.Mesh(geo);
    mesh.position.copy(center);

    // Orient cylinder along the given axis
    const defaultAxis = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(defaultAxis, axis.clone().normalize());
    mesh.quaternion.copy(quat);
    mesh.updateMatrixWorld(true);

    const obstacle = new FluidObstacle(mesh);
    this.entries.push({
      obstacle,
      analytical: {
        kind: 'cylinder',
        center: center.clone(),
        radius,
        height,
        axis: axis.clone().normalize(),
      },
      config: { ...DEFAULT_FLUID_OBSTACLE_CONFIG },
      velocity: new THREE.Vector3(),
    });
  }

  /**
   * Add a terrain obstacle. Everything below the terrain surface is solid.
   * The terrain mesh is voxelized into an SDF where the interior (below surface)
   * has negative values.
   *
   * @param terrainMesh - The terrain surface mesh
   * @param resolution  - Voxelization resolution per axis
   */
  addTerrainObstacle(terrainMesh: THREE.Mesh, resolution: number = 32): void {
    const obstacle = new FluidObstacle(terrainMesh);
    obstacle.voxelizeSDF(resolution);

    this.entries.push({
      obstacle,
      analytical: {
        kind: 'terrain',
        center: new THREE.Vector3(),
      },
      config: { ...DEFAULT_FLUID_OBSTACLE_CONFIG, meshResolution: resolution },
      velocity: new THREE.Vector3(),
    });
  }

  /**
   * Return all registered FluidObstacle instances.
   * These can be passed directly to the FLIP solver's boundary handling.
   *
   * @returns Array of FluidObstacle objects
   */
  getAllObstacles(): FluidObstacle[] {
    return this.entries.map(e => e.obstacle);
  }

  /**
   * Evaluate the composite SDF at a single point.
   * The composite SDF is the union (minimum) of all individual obstacle SDFs.
   * Negative = inside obstacle, Positive = outside.
   *
   * @param point - World-space query point
   * @returns Signed distance value (negative inside)
   */
  compositeSDF(point: THREE.Vector3): number {
    let minDist = Infinity;

    for (const entry of this.entries) {
      if (entry.analytical) {
        const d = this.evaluateAnalyticalSDF(point, entry.analytical);
        if (d < minDist) minDist = d;
      } else {
        const d = entry.obstacle.getSDF(point);
        if (d < minDist) minDist = d;
      }
    }

    return minDist === Infinity ? 1.0 : minDist;
  }

  /**
   * Batch evaluation of composite SDF for an array of points.
   * Used by the FLIP solver to check many particles efficiently.
   *
   * @param points - Flat Float32Array of (x, y, z) triplets
   * @param count  - Number of points (points.length / 3)
   * @returns Float32Array of SDF values, one per point
   */
  compositeSDFBatch(points: Float32Array, count: number): Float32Array {
    const result = new Float32Array(count);
    const p = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      p.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      result[i] = this.compositeSDF(p);
    }

    return result;
  }

  /**
   * Get the number of registered obstacles.
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Remove all registered obstacles.
   */
  clear(): void {
    this.entries = [];
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Evaluate an analytical SDF for a given obstacle kind.
   */
  private evaluateAnalyticalSDF(point: THREE.Vector3, analytical: ObstacleEntry['analytical'] & {}): number {
    switch (analytical.kind) {
      case 'box':
        return this.boxSDF(point, analytical.center, analytical.halfSize!, analytical.rotation);
      case 'sphere':
        return this.sphereSDF(point, analytical.center, analytical.radius!);
      case 'cylinder':
        return this.cylinderSDF(point, analytical.center, analytical.radius!, analytical.height!, analytical.axis!);
      case 'terrain':
        // Terrain obstacles use the voxelized SDF; fall through to obstacle.getSDF
        return Infinity;
      default:
        return Infinity;
    }
  }

  /**
   * Analytical box SDF. Supports oriented boxes via inverse rotation.
   */
  private boxSDF(
    point: THREE.Vector3,
    center: THREE.Vector3,
    halfSize: THREE.Vector3,
    rotation?: THREE.Quaternion,
  ): number {
    // Transform point to box local space
    const local = point.clone().sub(center);
    if (rotation) {
      const invRot = rotation.clone().invert();
      local.applyQuaternion(invRot);
    }

    // SDF for axis-aligned box at origin
    const q = new THREE.Vector3(
      Math.abs(local.x) - halfSize.x,
      Math.abs(local.y) - halfSize.y,
      Math.abs(local.z) - halfSize.z,
    );

    const outside = new THREE.Vector3(
      Math.max(q.x, 0),
      Math.max(q.y, 0),
      Math.max(q.z, 0),
    ).length();

    const inside = Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);

    return outside + inside;
  }

  /**
   * Analytical sphere SDF.
   */
  private sphereSDF(point: THREE.Vector3, center: THREE.Vector3, radius: number): number {
    return point.distanceTo(center) - radius;
  }

  /**
   * Analytical cylinder SDF (capped cylinder).
   * Cylinder is centered at `center`, oriented along `axis`, with given radius and height.
   */
  private cylinderSDF(
    point: THREE.Vector3,
    center: THREE.Vector3,
    radius: number,
    height: number,
    axis: THREE.Vector3,
  ): number {
    const halfH = height * 0.5;
    // Transform point into cylinder local space (axis = Y-up)
    const local = point.clone().sub(center);
    const quat = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
    const invQuat = quat.clone().invert();
    local.applyQuaternion(invQuat);

    // 2D distance in XZ plane
    const dx = Math.sqrt(local.x * local.x + local.z * local.z) - radius;
    // Distance along Y axis
    const dy = Math.abs(local.y) - halfH;

    // Combine: outside distance
    const outsideX = Math.max(dx, 0);
    const outsideY = Math.max(dy, 0);
    const outsideLen = Math.sqrt(outsideX * outsideX + outsideY * outsideY);

    // Inside distance (negative)
    const inside = Math.min(Math.max(dx, dy), 0);

    return outsideLen + inside;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. URDFExporter Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Exports a creature defined by CompositionalGenome to URDF (Unified Robot Description Format).
 *
 * Each PartNode in the genome tree becomes a <link> element with visual and
 * collision geometry. Each JointConfig becomes a <joint> element connecting
 * parent and child links with type, origin, axis, and limits.
 *
 * The resulting URDF is suitable for ROS, PyBullet, MuJoCo (via URDF import),
 * and other robotics/physics simulation frameworks.
 */
export class URDFExporter {
  /**
   * Export a creature's genome to URDF XML format.
   *
   * @param creatureGroup - THREE.Group containing the creature's meshes
   * @param genome        - CompositionalGenome defining the part tree
   * @param outputPath    - Intended output path (referenced in mesh filenames)
   * @returns URDF XML string
   */
  exportURDF(creatureGroup: THREE.Group, genome: CompositionalGenome, outputPath: string = './meshes'): string {
    const robotName = `creature_${genome.speciesType}`;
    const links: string[] = [];
    const joints: string[] = [];
    const materials: string[] = [];

    // Collect unique materials
    materials.push('  <material name="creature_material">\n');
    materials.push('    <color rgba="0.55 0.45 0.35 1.0"/>\n');
    materials.push('  </material>\n');

    // Traverse the part tree recursively
    this.exportPartNode(
      genome.root,
      null,
      creatureGroup,
      outputPath,
      links,
      joints,
    );

    let xml = '<?xml version="1.0"?>\n';
    xml += `<robot name="${robotName}">\n\n`;
    xml += materials.join('') + '\n';
    xml += links.join('\n') + '\n';
    xml += joints.join('\n');
    xml += '</robot>\n';

    return xml;
  }

  /**
   * Recursively export a PartNode and its children as URDF links and joints.
   */
  private exportPartNode(
    node: PartNode,
    parentName: string | null,
    group: THREE.Group,
    outputPath: string,
    links: string[],
    joints: string[],
  ): void {
    const linkName = this.sanitizeName(node.id);

    // ── Export link ──────────────────────────────────────────────────
    let linkXml = `  <link name="${linkName}">\n`;

    // Visual geometry
    if (node.geometry) {
      linkXml += '    <visual>\n';
      linkXml += `      <origin xyz="0 0 0" rpy="0 0 0"/>\n`;
      linkXml += '      <geometry>\n';
      linkXml += this.geometryToURDF(node, outputPath);
      linkXml += '      </geometry>\n';
      linkXml += '      <material name="creature_material"/>\n';
      linkXml += '    </visual>\n';
    }

    // Collision geometry (simplified)
    linkXml += '    <collision>\n';
    linkXml += '      <origin xyz="0 0 0" rpy="0 0 0"/>\n';
    linkXml += '      <geometry>\n';
    linkXml += this.collisionGeometryToURDF(node);
    linkXml += '      </geometry>\n';
    linkXml += '    </collision>\n';

    // Inertial properties
    const mass = this.computeMass(node);
    const inertia = this.computeInertia(node, mass);
    linkXml += '    <inertial>\n';
    linkXml += '      <mass value="' + mass.toFixed(6) + '"/>\n';
    linkXml += '      <inertia ixx="' + inertia.xx.toFixed(6) + '" ixy="0" ixz="0"';
    linkXml += ' iyy="' + inertia.yy.toFixed(6) + '" iyz="0"';
    linkXml += ' izz="' + inertia.zz.toFixed(6) + '"/>\n';
    linkXml += '    </inertial>\n';

    linkXml += '  </link>\n';
    links.push(linkXml);

    // ── Export joint (connecting this node to parent) ────────────────
    if (parentName !== null) {
      const jointName = `joint_${parentName}_to_${linkName}`;
      const joint = node.joint;
      const attachment = node.attachment;

      // Map genome joint type to URDF joint type
      const urdfType = this.genomeJointToURDFType(joint.type);

      let jointXml = `  <joint name="${jointName}" type="${urdfType}">\n`;
      jointXml += `    <parent link="${parentName}"/>\n`;
      jointXml += `    <child link="${linkName}"/>\n`;

      // Origin from attachment offset
      const offset = attachment.offset;
      const euler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromRotationMatrix(node.transform),
      );
      jointXml += `    <origin xyz="${offset.x.toFixed(6)} ${offset.y.toFixed(6)} ${offset.z.toFixed(6)}"`;
      jointXml += ` rpy="${euler.x.toFixed(6)} ${euler.y.toFixed(6)} ${euler.z.toFixed(6)}"/>\n`;

      // Axis
      if (urdfType !== 'fixed') {
        const axis = joint.axis;
        jointXml += `    <axis xyz="${axis.x.toFixed(6)} ${axis.y.toFixed(6)} ${axis.z.toFixed(6)}"/>\n`;
      }

      // Limits
      if (urdfType === 'revolute' || urdfType === 'prismatic') {
        const lower = urdfType === 'revolute' ? joint.limits.minX : 0;
        const upper = urdfType === 'revolute' ? joint.limits.maxX : 0;
        jointXml += `    <limit lower="${lower.toFixed(6)}" upper="${upper.toFixed(6)}"`;
        jointXml += ` effort="100.0" velocity="10.0"/>\n`;

        // Dynamics (damping and friction from stiffness)
        const damping = (1.0 - joint.stiffness) * 10.0;
        jointXml += `    <dynamics damping="${damping.toFixed(6)}" friction="0.1"/>\n`;
      }

      jointXml += '  </joint>\n';
      joints.push(jointXml);
    }

    // ── Recurse into children ────────────────────────────────────────
    for (const child of node.children) {
      this.exportPartNode(child, linkName, group, outputPath, links, joints);
    }
  }

  /**
   * Map CompositionalGenome joint type to URDF joint type.
   */
  private genomeJointToURDFType(type: GenomeJointConfig['type']): string {
    switch (type) {
      case 'hinge':     return 'revolute';
      case 'ball':      return 'continuous';
      case 'weld':      return 'fixed';
      case 'prismatic': return 'prismatic';
      default:          return 'fixed';
    }
  }

  /**
   * Generate URDF geometry element for a part's visual mesh.
   */
  private geometryToURDF(node: PartNode, outputPath: string): string {
    const name = this.sanitizeName(node.id);
    // Reference external mesh file
    return `        <mesh filename="${outputPath}/${name}.obj"/>\n`;
  }

  /**
   * Generate URDF collision geometry (simplified primitive).
   */
  private collisionGeometryToURDF(node: PartNode): string {
    const p = node.params;
    switch (node.partType) {
      case PartType.Torso:
      case PartType.Head:
      case PartType.Eye: {
        const r = p.scale * p.width * 0.5;
        return `        <sphere radius="${r.toFixed(6)}"/>\n`;
      }
      case PartType.Limb:
      case PartType.Tail: {
        const radius = p.scale * p.width * 0.5;
        const length = p.scale * p.length;
        return `        <cylinder radius="${radius.toFixed(6)}" length="${length.toFixed(6)}"/>\n`;
      }
      case PartType.Wing:
      case PartType.Fin: {
        const sx = p.scale * p.length;
        const sy = p.scale * p.height * 0.1;
        const sz = p.scale * p.width;
        return `        <box size="${sx.toFixed(6)} ${sy.toFixed(6)} ${sz.toFixed(6)}"/>\n`;
      }
      default: {
        const sx = p.scale * p.width;
        const sy = p.scale * p.height;
        const sz = p.scale * p.length;
        return `        <box size="${sx.toFixed(6)} ${sy.toFixed(6)} ${sz.toFixed(6)}"/>\n`;
      }
    }
  }

  /**
   * Compute mass for a part from its geometry volume × density.
   */
  private computeMass(node: PartNode, density: number = 800): number {
    const p = node.params;
    switch (node.partType) {
      case PartType.Torso:
      case PartType.Head: {
        const volume = (4 / 3) * Math.PI * Math.pow(p.scale * p.width * 0.5, 3);
        return volume * density;
      }
      case PartType.Limb:
      case PartType.Tail: {
        const radius = p.scale * p.width * 0.5;
        const length = p.scale * p.length;
        const volume = Math.PI * radius * radius * length;
        return volume * density;
      }
      default: {
        const volume = p.scale * p.width * p.scale * p.height * p.scale * p.length;
        return volume * density;
      }
    }
  }

  /**
   * Compute diagonal inertia tensor for a part.
   */
  private computeInertia(
    node: PartNode,
    mass: number,
  ): { xx: number; yy: number; zz: number } {
    const p = node.params;
    const s = p.scale;
    let x: number, y: number, z: number;

    switch (node.partType) {
      case PartType.Torso:
      case PartType.Head: {
        const r = s * p.width * 0.5;
        const I = 0.4 * mass * r * r;
        return { xx: I, yy: I, zz: I };
      }
      case PartType.Limb:
      case PartType.Tail: {
        const radius = s * p.width * 0.5;
        const length = s * p.length;
        x = mass / 12 * (3 * radius * radius + length * length);
        const yy = 0.5 * mass * radius * radius;
        z = x;
        return { xx: x, yy, zz: z };
      }
      default: {
        x = s * p.width;
        y = s * p.height;
        z = s * p.length;
        return {
          xx: mass / 12 * (y * y + z * z),
          yy: mass / 12 * (x * x + z * z),
          zz: mass / 12 * (x * x + y * y),
        };
      }
    }
  }

  /**
   * Sanitize a name string for use in URDF identifiers.
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MJCFExporter Class (MuJoCo XML Format)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Exports a creature defined by CompositionalGenome to MJCF (MuJoCo XML Format).
 *
 * MJCF uses a nested <body> hierarchy rather than separate <link>/<joint>
 * pairs like URDF. Each PartNode becomes a <body> with <geom> for collision,
 * <joint> for degrees of freedom, and <site> for end-effector tracking.
 *
 * The resulting MJCF is suitable for MuJoCo, Isaac Gym, and other
 * reinforcement learning physics engines.
 */
export class MJCFExporter {
  /**
   * Export a creature's genome to MJCF XML format.
   *
   * @param creatureGroup - THREE.Group containing the creature's meshes
   * @param genome        - CompositionalGenome defining the part tree
   * @param outputPath    - Intended output path for mesh files
   * @returns MJCF XML string
   */
  exportMJCF(creatureGroup: THREE.Group, genome: CompositionalGenome, outputPath: string = './meshes'): string {
    const modelName = `creature_${genome.speciesType}`;

    let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
    xml += `<mujoco model="${modelName}">\n`;
    xml += '  <compiler angle="radian" coordinate="local"/>\n';
    xml += '  <option timestep="0.002" gravity="0 0 -9.81"/>\n\n';

    // Asset section
    xml += this.exportAssets(genome, outputPath);

    // Worldbody
    xml += '  <worldbody>\n';
    xml += this.exportBodyNode(genome.root, true);
    xml += '  </worldbody>\n\n';

    // Actuators
    xml += this.exportActuators(genome);

    // Sensors
    xml += this.exportSensors(genome);

    xml += '</mujoco>\n';
    return xml;
  }

  /**
   * Export the <asset> section with mesh references.
   */
  private exportAssets(genome: CompositionalGenome, outputPath: string): string {
    let xml = '  <asset>\n';
    const parts = genome.getAllParts();
    for (const part of parts) {
      const name = this.sanitizeName(part.id);
      xml += `    <mesh name="${name}" file="${outputPath}/${name}.obj"/>\n`;
    }
    xml += '  </asset>\n\n';
    return xml;
  }

  /**
   * Recursively export a PartNode as a nested <body> element.
   */
  private exportBodyNode(node: PartNode, isRoot: boolean = false, indent: string = '    '): string {
    const name = this.sanitizeName(node.id);
    const offset = node.attachment.offset;

    let xml = `${indent}<body name="${name}" pos="${offset.x.toFixed(6)} ${offset.y.toFixed(6)} ${offset.z.toFixed(6)}"`;

    // Add orientation from transform if non-identity
    const rot = new THREE.Quaternion().setFromRotationMatrix(node.transform);
    if (rot.angleTo(new THREE.Quaternion()) > 0.001) {
      const euler = new THREE.Euler().setFromQuaternion(rot);
      xml += ` euler="${euler.x.toFixed(6)} ${euler.y.toFixed(6)} ${euler.z.toFixed(6)}"`;
    }
    xml += '>\n';

    // Joint element (except for root body)
    if (!isRoot) {
      xml += this.exportJointElement(node, indent + '  ');
    }

    // Geom element for collision
    xml += this.exportGeomElement(node, indent + '  ');

    // Site element for end-effector tracking
    xml += this.exportSiteElement(node, indent + '  ');

    // Recurse into children
    for (const child of node.children) {
      xml += this.exportBodyNode(child, false, indent + '  ');
    }

    xml += `${indent}</body>\n`;
    return xml;
  }

  /**
   * Export a <joint> element for a PartNode.
   * Maps GenomeJointConfig to MJCF joint types with range, stiffness, damping.
   */
  private exportJointElement(node: PartNode, indent: string): string {
    const joint = node.joint;
    let mjcfType: string;
    let limited = true;

    switch (joint.type) {
      case 'hinge':
        mjcfType = 'hinge';
        break;
      case 'ball':
        mjcfType = 'ball';
        limited = false;
        break;
      case 'prismatic':
        mjcfType = 'slide';
        break;
      case 'weld':
      default:
        return `${indent}<joint type="fixed"/>\n`;
    }

    const name = `joint_${this.sanitizeName(node.id)}`;
    const axis = joint.axis;

    let xml = `${indent}<joint name="${name}" type="${mjcfType}"`;
    xml += ` axis="${axis.x.toFixed(6)} ${axis.y.toFixed(6)} ${axis.z.toFixed(6)}"`;

    // Range (limits)
    if (limited && mjcfType === 'hinge') {
      const lower = joint.limits.minX;
      const upper = joint.limits.maxX;
      xml += ` range="${lower.toFixed(6)} ${upper.toFixed(6)}"`;
    } else if (limited && mjcfType === 'slide') {
      xml += ' range="-0.5 0.5"';
    } else if (!limited) {
      xml += ' limited="false"';
    }

    // Stiffness and damping from JointConfig
    const stiffness = joint.stiffness * 100.0;
    const damping = (1.0 - joint.stiffness) * 10.0;
    xml += ` stiffness="${stiffness.toFixed(6)}"`;
    xml += ` damping="${damping.toFixed(6)}"`;

    xml += '/>\n';
    return xml;
  }

  /**
   * Export a <geom> element for collision (simplified convex hull).
   */
  private exportGeomElement(node: PartNode, indent: string): string {
    const name = this.sanitizeName(node.id);
    const p = node.params;
    const s = p.scale;

    // Use simplified convex hull primitives based on part type
    switch (node.partType) {
      case PartType.Torso:
      case PartType.Head: {
        const r = s * p.width * 0.5;
        return `${indent}<geom name="${name}" type="sphere" size="${r.toFixed(6)}" mass="1.0"/>\n`;
      }
      case PartType.Limb:
      case PartType.Tail: {
        const radius = s * p.width * 0.5;
        const halfLen = s * p.length * 0.5;
        return `${indent}<geom name="${name}" type="capsule" size="${radius.toFixed(6)} ${halfLen.toFixed(6)}" mass="1.0"/>\n`;
      }
      case PartType.Wing:
      case PartType.Fin: {
        const sx = s * p.length * 0.5;
        const sy = s * p.height * 0.05;
        const sz = s * p.width * 0.5;
        return `${indent}<geom name="${name}" type="box" size="${sx.toFixed(6)} ${sy.toFixed(6)} ${sz.toFixed(6)}" mass="0.5"/>\n`;
      }
      default: {
        const sx = s * p.width * 0.5;
        const sy = s * p.height * 0.5;
        const sz = s * p.length * 0.5;
        return `${indent}<geom name="${name}" type="box" size="${sx.toFixed(6)} ${sy.toFixed(6)} ${sz.toFixed(6)}" mass="1.0"/>\n`;
      }
    }
  }

  /**
   * Export a <site> element for end-effector tracking.
   */
  private exportSiteElement(node: PartNode, indent: string): string {
    const name = this.sanitizeName(node.id);

    // Place site at the end of the part (tip of limb, front of head, etc.)
    const p = node.params;
    const s = p.scale;
    let sitePos = '0 0 0';

    switch (node.partType) {
      case PartType.Limb:
      case PartType.Tail:
        sitePos = `0 0 ${(-s * p.length * 0.5).toFixed(6)}`;
        break;
      case PartType.Head:
        sitePos = `0 0 ${(s * p.width * 0.5).toFixed(6)}`;
        break;
      case PartType.Wing:
        sitePos = `${(s * p.length * 0.5).toFixed(6)} 0 0`;
        break;
    }

    return `${indent}<site name="${name}_site" pos="${sitePos}"/>\n`;
  }

  /**
   * Export the <actuator> section for all non-fixed joints.
   */
  private exportActuators(genome: CompositionalGenome): string {
    const parts = genome.getAllParts();
    let xml = '  <actuator>\n';

    for (const part of parts) {
      if (part.joint.type === 'weld') continue;
      const name = `joint_${this.sanitizeName(part.id)}`;
      xml += `    <motor name="${name}_motor" joint="${name}" gear="1" ctrlrange="-1 1" ctrllimited="true"/>\n`;
    }

    xml += '  </actuator>\n\n';
    return xml;
  }

  /**
   * Export the <sensor> section for all non-fixed joints.
   */
  private exportSensors(genome: CompositionalGenome): string {
    const parts = genome.getAllParts();
    let xml = '  <sensor>\n';

    for (const part of parts) {
      if (part.joint.type === 'weld') continue;
      const name = `joint_${this.sanitizeName(part.id)}`;
      xml += `    <jointpos joint="${name}"/>\n`;
      xml += `    <jointvel joint="${name}"/>\n`;
    }

    xml += '  </sensor>\n\n';
    return xml;
  }

  /**
   * Sanitize a name string for use in MJCF identifiers.
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RagdollConfig and PhysicsRagdollExporter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for a single ragdoll rigid body (bone/part).
 */
export interface RagdollBodyConfig {
  /** Unique identifier matching the PartNode id */
  id: string;
  /** Body type */
  bodyType: 'dynamic' | 'kinematic' | 'static';
  /** Position in world space */
  position: THREE.Vector3;
  /** Rotation as quaternion */
  rotation: THREE.Quaternion;
  /** Mass in kg (computed from volume × density) */
  mass: number;
  /** Collision shape type */
  shape: 'capsule' | 'box' | 'sphere';
  /** Shape parameters: for capsule [radius, height], box [hx, hy, hz], sphere [radius] */
  shapeParams: number[];
  /** Linear damping */
  linearDamping: number;
  /** Angular damping */
  angularDamping: number;
}

/**
 * Configuration for a spring hinge constraint between ragdoll bodies.
 */
export interface RagdollJointConfig {
  /** Unique joint identifier */
  id: string;
  /** Joint type derived from GenomeJointConfig */
  type: 'hinge' | 'ball' | 'weld' | 'prismatic';
  /** Parent body id */
  parentBodyId: string;
  /** Child body id */
  childBodyId: string;
  /** Anchor point on parent body (local space) */
  anchorA: THREE.Vector3;
  /** Anchor point on child body (local space) */
  anchorB: THREE.Vector3;
  /** Rotation axis for hinge joints */
  axis: THREE.Vector3;
  /** Joint limits */
  limits: { min: number; max: number };
  /** Spring stiffness */
  stiffness: number;
  /** Damping coefficient */
  damping: number;
}

/**
 * Complete ragdoll configuration containing all bodies and joints.
 */
export interface RagdollConfig {
  /** All rigid body configs */
  bodies: RagdollBodyConfig[];
  /** All joint configs */
  joints: RagdollJointConfig[];
  /** Total mass of the creature */
  totalMass: number;
  /** Genome species type */
  speciesType: string;
}

/**
 * Creates ragdoll rigid body configurations from a CompositionalGenome.
 *
 * Each bone/part in the genome becomes a rigid body with a simplified
 * collision shape (capsule for limbs, box for torso, sphere for head).
 * Joints are created as spring-hinge constraints from the genome's
 * JointConfig definitions.
 *
 * The resulting config can be used to instantiate physics bodies at runtime
 * in the project's existing physics engine (RigidBody + Joint classes).
 */
export class PhysicsRagdollExporter {
  /** Default density for mass computation (kg/m³) */
  private density: number;

  constructor(density: number = 800) {
    this.density = density;
  }

  /**
   * Create ragdoll rigid body and joint configurations from a genome.
   *
   * @param genome - CompositionalGenome defining the creature
   * @returns RagdollConfig with all bodies and joints
   */
  createRagdollBodies(genome: CompositionalGenome): RagdollConfig {
    const bodies: RagdollBodyConfig[] = [];
    const joints: RagdollJointConfig[] = [];

    this.processPartNode(genome.root, null, bodies, joints);

    const totalMass = bodies.reduce((sum, b) => sum + b.mass, 0);

    return {
      bodies,
      joints,
      totalMass,
      speciesType: genome.speciesType,
    };
  }

  /**
   * Export ragdoll configuration as JSON string.
   *
   * @param genome - CompositionalGenome defining the creature
   * @param format - Output format (currently only 'json')
   * @returns JSON string of the RagdollConfig
   */
  exportRagdollConfig(genome: CompositionalGenome, format: 'json' = 'json'): string {
    const config = this.createRagdollBodies(genome);

    // Serialize to plain JSON-compatible object
    const serializable = {
      bodies: config.bodies.map(b => ({
        id: b.id,
        bodyType: b.bodyType,
        position: { x: b.position.x, y: b.position.y, z: b.position.z },
        rotation: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z, w: b.rotation.w },
        mass: b.mass,
        shape: b.shape,
        shapeParams: b.shapeParams,
        linearDamping: b.linearDamping,
        angularDamping: b.angularDamping,
      })),
      joints: config.joints.map(j => ({
        id: j.id,
        type: j.type,
        parentBodyId: j.parentBodyId,
        childBodyId: j.childBodyId,
        anchorA: { x: j.anchorA.x, y: j.anchorA.y, z: j.anchorA.z },
        anchorB: { x: j.anchorB.x, y: j.anchorB.y, z: j.anchorB.z },
        axis: { x: j.axis.x, y: j.axis.y, z: j.axis.z },
        limits: j.limits,
        stiffness: j.stiffness,
        damping: j.damping,
      })),
      totalMass: config.totalMass,
      speciesType: config.speciesType,
    };

    return JSON.stringify(serializable, null, 2);
  }

  /**
   * Recursively process a PartNode to create ragdoll body and joint configs.
   */
  private processPartNode(
    node: PartNode,
    parentId: string | null,
    bodies: RagdollBodyConfig[],
    joints: RagdollJointConfig[],
  ): void {
    // Create body config
    const bodyConfig = this.createBodyConfig(node);
    bodies.push(bodyConfig);

    // Create joint connecting this body to parent
    if (parentId !== null) {
      const jointConfig = this.createJointConfig(node, parentId);
      joints.push(jointConfig);
    }

    // Recurse into children
    for (const child of node.children) {
      this.processPartNode(child, node.id, bodies, joints);
    }
  }

  /**
   * Create a RagdollBodyConfig for a single PartNode.
   */
  private createBodyConfig(node: PartNode): RagdollBodyConfig {
    const p = node.params;
    const s = p.scale;
    let shape: 'capsule' | 'box' | 'sphere';
    let shapeParams: number[];
    let mass: number;

    switch (node.partType) {
      case PartType.Torso: {
        shape = 'box';
        shapeParams = [s * p.width * 0.5, s * p.height * 0.5, s * p.length * 0.5];
        const volume = s * p.width * s * p.height * s * p.length;
        mass = volume * this.density;
        break;
      }
      case PartType.Head: {
        shape = 'sphere';
        const r = s * p.width * 0.5;
        shapeParams = [r];
        mass = (4 / 3) * Math.PI * r * r * r * this.density;
        break;
      }
      case PartType.Limb:
      case PartType.Tail: {
        shape = 'capsule';
        const radius = s * p.width * 0.5;
        const height = s * p.length;
        shapeParams = [radius, height];
        // Capsule volume ≈ cylinder + two hemispheres
        const cylVol = Math.PI * radius * radius * height;
        const hemiVol = (4 / 3) * Math.PI * radius * radius * radius;
        mass = (cylVol + hemiVol) * this.density;
        break;
      }
      case PartType.Wing:
      case PartType.Fin: {
        shape = 'box';
        shapeParams = [s * p.length * 0.5, s * p.height * 0.05, s * p.width * 0.5];
        const volume = s * p.length * s * p.height * 0.1 * s * p.width;
        mass = volume * this.density * 0.3; // Wings are lighter
        break;
      }
      default: {
        shape = 'box';
        shapeParams = [s * p.width * 0.5, s * p.height * 0.5, s * p.length * 0.5];
        const volume = s * p.width * s * p.height * s * p.length;
        mass = volume * this.density;
        break;
      }
    }

    // Position from attachment offset
    const position = node.attachment.offset.clone();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(node.transform);

    return {
      id: node.id,
      bodyType: 'dynamic',
      position,
      rotation,
      mass,
      shape,
      shapeParams,
      linearDamping: 0.05,
      angularDamping: 0.05,
    };
  }

  /**
   * Create a RagdollJointConfig connecting a child node to its parent.
   */
  private createJointConfig(node: PartNode, parentId: string): RagdollJointConfig {
    const joint = node.joint;
    const attachment = node.attachment;

    // Map genome joint type
    const type = joint.type;

    // Spring stiffness and damping from genome config
    const stiffness = joint.stiffness * 100.0;
    const damping = (1.0 - joint.stiffness) * 10.0;

    return {
      id: `joint_${parentId}_to_${node.id}`,
      type,
      parentBodyId: parentId,
      childBodyId: node.id,
      anchorA: attachment.offset.clone(),
      anchorB: new THREE.Vector3(),
      axis: joint.axis.clone(),
      limits: {
        min: joint.limits.minX,
        max: joint.limits.maxX,
      },
      stiffness,
      damping,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ObstacleFluidCoupling Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Couples obstacles to the FLIP fluid solver by registering them as
 * boundary conditions and setting up velocity/pressure interactions.
 *
 * This class bridges the gap between the FluidObstacleManager (which knows
 * about obstacle geometry) and the FLIPFluidSolver (which needs to know
 * which grid cells are solid and how obstacle velocity affects fluid).
 *
 * Coupling modes:
 * - No-slip: fluid velocity at obstacle surface matches obstacle velocity
 * - Free-slip: only normal velocity component is zeroed
 * - Pressure boundary: obstacle cells have Neumann pressure BC
 * - Momentum transfer: obstacle velocity adds momentum to nearby fluid
 */
export class ObstacleFluidCoupling {
  /**
   * Register obstacles with a FLIP solver's boundary conditions.
   *
   * @param obstacles - Array of FluidObstacle instances
   * @param solver    - FLIPFluidSolver to couple with
   * @param config    - Coupling configuration
   */
  coupleObstacleToSolver(
    obstacles: FluidObstacle[],
    solver: FLIPFluidSolver,
    config: ObstacleCouplingConfig = DEFAULT_COUPLING_CONFIG,
  ): void {
    const grid = solver.getGrid();
    const cellSize = solver.getConfig().cellSize;
    const nx = grid.nx;
    const ny = grid.ny;
    const nz = grid.nz;

    // Phase 1: Mark obstacle cells as solid in the grid
    this.markSolidCells(obstacles, grid, cellSize, nx, ny, nz);

    // Phase 2: Apply no-slip velocity conditions
    if (config.velocityBoundary === 'noslip') {
      this.applyNoSlipConditions(obstacles, grid, cellSize, nx, ny, nz);
    } else if (config.velocityBoundary === 'freeslip') {
      this.applyFreeSlipConditions(obstacles, grid, cellSize, nx, ny, nz);
    }

    // Phase 3: Configure pressure boundary conditions
    this.applyPressureBoundaryConditions(grid, nx, ny, nz);

    // Phase 4: Transfer obstacle velocity to nearby fluid particles
    if (config.momentumTransfer > 0) {
      this.transferMomentum(obstacles, solver, config);
    }
  }

  /**
   * Mark grid cells that are inside any obstacle as solid (cellType = 1).
   */
  private markSolidCells(
    obstacles: FluidObstacle[],
    grid: FLIPGrid,
    cellSize: number,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const idx = grid.idx(i, j, k);
          // Skip cells already marked as solid (domain boundary)
          if (grid.cellType[idx] === 1) continue;

          // World position of cell center
          const worldPos = grid.gridToWorld(i + 0.5, j + 0.5, k + 0.5);

          // Check against all obstacles
          for (const obstacle of obstacles) {
            if (obstacle.isInside(worldPos)) {
              grid.cellType[idx] = 1; // solid
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Apply no-slip velocity boundary conditions at obstacle surfaces.
   * Fluid velocity at solid cells is set to the obstacle velocity.
   */
  private applyNoSlipConditions(
    obstacles: FluidObstacle[],
    grid: FLIPGrid,
    cellSize: number,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = grid.idx(i, j, k);
          if (grid.cellType[idx] !== 1) continue;

          // Check if this solid cell is adjacent to a fluid cell
          const isNearFluid = this.isAdjacentToFluid(grid, i, j, k, nx, ny, nz);
          if (!isNearFluid) continue;

          // Find which obstacle this cell belongs to and set its velocity
          const worldPos = grid.gridToWorld(i + 0.5, j + 0.5, k + 0.5);
          for (const obstacle of obstacles) {
            const dist = obstacle.getSDF(worldPos);
            if (dist < cellSize) {
              grid.u[idx] = obstacle.velocity.x;
              grid.v[idx] = obstacle.velocity.y;
              grid.w[idx] = obstacle.velocity.z;
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Apply free-slip velocity boundary conditions at obstacle surfaces.
   * Only the normal velocity component is zeroed; tangential is preserved.
   */
  private applyFreeSlipConditions(
    obstacles: FluidObstacle[],
    grid: FLIPGrid,
    cellSize: number,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = grid.idx(i, j, k);
          if (grid.cellType[idx] !== 1) continue;

          const isNearFluid = this.isAdjacentToFluid(grid, i, j, k, nx, ny, nz);
          if (!isNearFluid) continue;

          // Approximate surface normal from SDF gradient
          const worldPos = grid.gridToWorld(i + 0.5, j + 0.5, k + 0.5);
          for (const obstacle of obstacles) {
            const dist = obstacle.getSDF(worldPos);
            if (dist < cellSize) {
              // Compute SDF gradient as surface normal approximation
              const eps = cellSize * 0.1;
              const px = new THREE.Vector3(worldPos.x + eps, worldPos.y, worldPos.z);
              const mx = new THREE.Vector3(worldPos.x - eps, worldPos.y, worldPos.z);
              const py = new THREE.Vector3(worldPos.x, worldPos.y + eps, worldPos.z);
              const my = new THREE.Vector3(worldPos.x, worldPos.y - eps, worldPos.z);
              const pz = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z + eps);
              const mz = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z - eps);

              const normal = new THREE.Vector3(
                (obstacle.getSDF(px) - obstacle.getSDF(mx)) / (2 * eps),
                (obstacle.getSDF(py) - obstacle.getSDF(my)) / (2 * eps),
                (obstacle.getSDF(pz) - obstacle.getSDF(mz)) / (2 * eps),
              ).normalize();

              // Remove normal component of velocity
              const vel = new THREE.Vector3(grid.u[idx], grid.v[idx], grid.w[idx]);
              const normalComp = normal.dot(vel);
              if (normalComp < 0) {
                vel.addScaledVector(normal, -normalComp);
              }
              grid.u[idx] = vel.x;
              grid.v[idx] = vel.y;
              grid.w[idx] = vel.z;
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Configure pressure boundary conditions at solid/fluid interfaces.
   * Sets pressure gradient to zero at solid boundaries (Neumann BC).
   */
  private applyPressureBoundaryConditions(
    grid: FLIPGrid,
    nx: number,
    ny: number,
    nz: number,
  ): void {
    // For solid cells adjacent to fluid, the pressure gradient
    // should be zero in the normal direction. This is handled
    // implicitly by the Jacobi solver skipping solid cells.
    // Here we ensure pressure in solid cells is set to the
    // average of neighboring fluid cell pressures for stability.

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = grid.idx(i, j, k);
          if (grid.cellType[idx] !== 1) continue;

          // Average pressure from neighboring fluid cells
          let sum = 0;
          let count = 0;
          const neighbors = [
            grid.idx(i + 1, j, k), grid.idx(i - 1, j, k),
            grid.idx(i, j + 1, k), grid.idx(i, j - 1, k),
            grid.idx(i, j, k + 1), grid.idx(i, j, k - 1),
          ];

          for (const nIdx of neighbors) {
            if (nIdx >= 0 && nIdx < grid.totalCells && grid.cellType[nIdx] === 0) {
              sum += grid.pressure[nIdx];
              count++;
            }
          }

          if (count > 0) {
            grid.pressure[idx] = sum / count;
          }
        }
      }
    }
  }

  /**
   * Transfer obstacle velocity momentum to nearby fluid particles.
   * Particles within the influence radius receive a velocity impulse
   * proportional to the obstacle's velocity and the coupling strength.
   */
  private transferMomentum(
    obstacles: FluidObstacle[],
    solver: FLIPFluidSolver,
    config: ObstacleCouplingConfig,
  ): void {
    const particles = solver.getParticles();
    const influenceRadius = config.influenceRadius;
    const strength = config.momentumTransfer;

    for (const obstacle of obstacles) {
      if (obstacle.velocity.lengthSq() < 1e-8) continue;

      for (const particle of particles) {
        const sdf = obstacle.getSDF(particle.position);
        // Only affect particles near the obstacle surface
        if (sdf > 0 && sdf < influenceRadius) {
          // Weight by distance: stronger influence closer to surface
          const weight = 1.0 - sdf / influenceRadius;
          const impulse = obstacle.velocity.clone().multiplyScalar(strength * weight);
          particle.velocity.add(impulse);
        }
      }
    }
  }

  /**
   * Check if a grid cell at (i, j, k) is adjacent to at least one fluid cell.
   */
  private isAdjacentToFluid(
    grid: FLIPGrid,
    i: number,
    j: number,
    k: number,
    nx: number,
    ny: number,
    nz: number,
  ): boolean {
    const offsets: [number, number, number][] = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ];

    for (const [di, dj, dk] of offsets) {
      const ni = i + di;
      const nj = j + dj;
      const nk = k + dk;
      if (ni >= 0 && ni < nx && nj >= 0 && nj < ny && nk >= 0 && nk < nz) {
        if (grid.cellType[grid.idx(ni, nj, nk)] === 0) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Configuration for obstacle-fluid coupling.
 */
export interface ObstacleCouplingConfig {
  /** Velocity boundary condition type */
  velocityBoundary: 'noslip' | 'freeslip';
  /** Momentum transfer strength (0–1, default 0.5) */
  momentumTransfer: number;
  /** Influence radius for momentum transfer in world units */
  influenceRadius: number;
  /** Whether to apply pressure boundary conditions */
  applyPressureBC: boolean;
}

/** Default coupling configuration */
const DEFAULT_COUPLING_CONFIG: ObstacleCouplingConfig = {
  velocityBoundary: 'noslip',
  momentumTransfer: 0.5,
  influenceRadius: 0.2,
  applyPressureBC: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. KinematicObstacle Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A keyframe-animated obstacle that moves through the fluid domain.
 *
 * Supports animated obstacles like moving walls, rotating paddles, or
 * oscillating surfaces. The obstacle's position and rotation are interpolated
 * from keyframes, and velocity is computed from the position delta for
 * proper momentum transfer to the fluid.
 *
 * Usage:
 *   1. Create a KinematicObstacle with a FluidObstacle
 *   2. Set a trajectory with setTrajectory()
 *   3. Call update(time) each frame before the FLIP step
 *   4. The obstacle's velocity is automatically computed for momentum transfer
 */
export class KinematicObstacle {
  /** The underlying FluidObstacle */
  obstacle: FluidObstacle;

  /** Current position */
  private currentPosition: THREE.Vector3;
  /** Previous frame position (for velocity computation) */
  private previousPosition: THREE.Vector3;
  /** Current rotation */
  private currentRotation: THREE.Quaternion;
  /** Previous frame rotation */
  private previousRotation: THREE.Quaternion;
  /** Computed linear velocity */
  private computedVelocity: THREE.Vector3;
  /** Computed angular velocity */
  private computedAngularVelocity: THREE.Vector3;
  /** Previous update time */
  private previousTime: number;

  /** Keyframe trajectory */
  private keyframes: KinematicKeyframe[];

  /** Whether trajectory is looping */
  private loop: boolean;

  constructor(obstacle: FluidObstacle) {
    this.obstacle = obstacle;
    this.currentPosition = obstacle.mesh.position.clone();
    this.previousPosition = this.currentPosition.clone();
    this.currentRotation = obstacle.mesh.quaternion.clone();
    this.previousRotation = this.currentRotation.clone();
    this.computedVelocity = new THREE.Vector3();
    this.computedAngularVelocity = new THREE.Vector3();
    this.previousTime = 0;
    this.keyframes = [];
    this.loop = true;
  }

  /**
   * Update the obstacle's position and rotation based on the current time.
   * Computes velocity from position delta for momentum transfer.
   *
   * @param time - Current simulation time in seconds
   */
  update(time: number): void {
    if (this.keyframes.length === 0) return;

    const dt = time - this.previousTime;
    if (dt <= 0) {
      this.previousTime = time;
      return;
    }

    // Save previous state
    this.previousPosition.copy(this.currentPosition);
    this.previousRotation.copy(this.currentRotation);

    // Find surrounding keyframes
    const { kf0, kf1, t } = this.findSurroundingKeyframes(time);

    // Interpolate position and rotation
    this.currentPosition.lerpVectors(kf0.position, kf1.position, t);
    this.currentRotation.slerpQuaternions(kf0.rotation, kf1.rotation, t);

    // Compute velocity from position change
    this.computedVelocity.subVectors(this.currentPosition, this.previousPosition).divideScalar(dt);

    // Compute angular velocity from rotation change
    const deltaRot = this.currentRotation.clone().multiply(this.previousRotation.clone().invert());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(deltaRot.w)));
    if (angle > 1e-6) {
      const axis = new THREE.Vector3(deltaRot.x, deltaRot.y, deltaRot.z).normalize();
      this.computedAngularVelocity.copy(axis).multiplyScalar(angle / dt);
    } else {
      this.computedAngularVelocity.set(0, 0, 0);
    }

    // Apply to obstacle mesh
    this.obstacle.mesh.position.copy(this.currentPosition);
    this.obstacle.mesh.quaternion.copy(this.currentRotation);
    this.obstacle.mesh.updateMatrixWorld(true);

    // Update obstacle velocity for momentum transfer
    this.obstacle.velocity.copy(this.computedVelocity);

    this.previousTime = time;
  }

  /**
   * Set the keyframe trajectory for this obstacle.
   *
   * @param keyframes - Array of keyframes with time, position, and rotation
   * @param loop      - Whether the trajectory should loop (default true)
   */
  setTrajectory(keyframes: KinematicKeyframe[], loop: boolean = true): void {
    // Sort by time
    this.keyframes = [...keyframes].sort((a, b) => a.time - b.time);
    this.loop = loop;

    // Initialize position to first keyframe
    if (this.keyframes.length > 0) {
      this.currentPosition.copy(this.keyframes[0].position);
      this.previousPosition.copy(this.currentPosition);
      this.currentRotation.copy(this.keyframes[0].rotation);
      this.previousRotation.copy(this.currentRotation);
      this.obstacle.mesh.position.copy(this.currentPosition);
      this.obstacle.mesh.quaternion.copy(this.currentRotation);
      this.obstacle.mesh.updateMatrixWorld(true);
    }
  }

  /**
   * Get the current linear velocity of the obstacle.
   */
  getVelocity(): THREE.Vector3 {
    return this.computedVelocity.clone();
  }

  /**
   * Get the current angular velocity of the obstacle.
   */
  getAngularVelocity(): THREE.Vector3 {
    return this.computedAngularVelocity.clone();
  }

  /**
   * Get the current position.
   */
  getPosition(): THREE.Vector3 {
    return this.currentPosition.clone();
  }

  /**
   * Get the current rotation.
   */
  getRotation(): THREE.Quaternion {
    return this.currentRotation.clone();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Find the two keyframes surrounding the given time and the interpolation parameter.
   */
  private findSurroundingKeyframes(time: number): {
    kf0: KinematicKeyframe;
    kf1: KinematicKeyframe;
    t: number;
  } {
    const kfs = this.keyframes;
    if (kfs.length === 0) {
      const zero = { time: 0, position: new THREE.Vector3(), rotation: new THREE.Quaternion() };
      return { kf0: zero, kf1: zero, t: 0 };
    }

    if (kfs.length === 1) {
      return { kf0: kfs[0], kf1: kfs[0], t: 0 };
    }

    // Handle looping: wrap time into trajectory duration
    let t = time;
    const duration = kfs[kfs.length - 1].time - kfs[0].time;
    if (this.loop && duration > 0) {
      t = kfs[0].time + ((time - kfs[0].time) % duration + duration) % duration;
    }

    // Clamp to keyframe range
    if (t <= kfs[0].time) {
      return { kf0: kfs[0], kf1: kfs[1], t: 0 };
    }
    if (t >= kfs[kfs.length - 1].time) {
      return {
        kf0: kfs[kfs.length - 2],
        kf1: kfs[kfs.length - 1],
        t: 1,
      };
    }

    // Find surrounding keyframes
    for (let i = 0; i < kfs.length - 1; i++) {
      if (t >= kfs[i].time && t <= kfs[i + 1].time) {
        const segmentDuration = kfs[i + 1].time - kfs[i].time;
        const param = segmentDuration > 0 ? (t - kfs[i].time) / segmentDuration : 0;
        return {
          kf0: kfs[i],
          kf1: kfs[i + 1],
          t: param,
        };
      }
    }

    // Fallback
    return {
      kf0: kfs[kfs.length - 2],
      kf1: kfs[kfs.length - 1],
      t: 1,
    };
  }
}

/**
 * A single keyframe in a kinematic obstacle trajectory.
 * Defines the position and rotation at a specific time.
 */
export interface KinematicKeyframe {
  /** Time in seconds */
  time: number;
  /** World-space position at this keyframe */
  position: THREE.Vector3;
  /** Rotation at this keyframe */
  rotation: THREE.Quaternion;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility: Convenience factory functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a KinematicObstacle that oscillates back and forth along an axis.
 *
 * @param mesh     - The mesh to animate
 * @param axis     - Direction of oscillation (will be normalized)
 * @param amplitude - Oscillation amplitude (half-travel distance)
 * @param period   - Oscillation period in seconds
 * @param numKeyframes - Number of keyframes to generate (default 8)
 * @returns KinematicObstacle with oscillating trajectory
 */
export function createOscillatingObstacle(
  mesh: THREE.Mesh,
  axis: THREE.Vector3,
  amplitude: number,
  period: number,
  numKeyframes: number = 8,
): KinematicObstacle {
  const obstacle = new FluidObstacle(mesh);
  const kinematic = new KinematicObstacle(obstacle);
  const normalizedAxis = axis.clone().normalize();
  const keyframes: KinematicKeyframe[] = [];

  for (let i = 0; i <= numKeyframes; i++) {
    const t = i / numKeyframes;
    const time = t * period;
    const offset = Math.sin(t * Math.PI * 2) * amplitude;
    const position = mesh.position.clone().addScaledVector(normalizedAxis, offset);

    keyframes.push({
      time,
      position,
      rotation: mesh.quaternion.clone(),
    });
  }

  kinematic.setTrajectory(keyframes, true);
  return kinematic;
}

/**
 * Create a KinematicObstacle that rotates continuously around an axis.
 *
 * @param mesh  - The mesh to animate
 * @param axis  - Rotation axis
 * @param rpm   - Rotations per minute
 * @param numKeyframes - Number of keyframes per revolution (default 12)
 * @returns KinematicObstacle with rotating trajectory
 */
export function createRotatingObstacle(
  mesh: THREE.Mesh,
  axis: THREE.Vector3,
  rpm: number,
  numKeyframes: number = 12,
): KinematicObstacle {
  const obstacle = new FluidObstacle(mesh);
  const kinematic = new KinematicObstacle(obstacle);
  const normalizedAxis = axis.clone().normalize();
  const period = 60 / rpm; // seconds per revolution
  const keyframes: KinematicKeyframe[] = [];

  for (let i = 0; i <= numKeyframes; i++) {
    const t = i / numKeyframes;
    const time = t * period;
    const angle = t * Math.PI * 2;
    const rotation = new THREE.Quaternion().setFromAxisAngle(normalizedAxis, angle);

    keyframes.push({
      time,
      position: mesh.position.clone(),
      rotation,
    });
  }

  kinematic.setTrajectory(keyframes, true);
  return kinematic;
}

/**
 * Create a complete fluid simulation setup with obstacles, coupling, and kinematic obstacles.
 * Convenience function that ties together FluidObstacleManager, ObstacleFluidCoupling,
 * and KinematicObstacle.
 *
 * @param solver  - FLIPFluidSolver instance
 * @param config  - Setup configuration
 * @returns Object with manager, coupling, and kinematic obstacles
 */
export function createObstacleFluidSetup(
  solver: FLIPFluidSolver,
  config: ObstacleFluidSetupConfig = {},
): {
  manager: FluidObstacleManager;
  coupling: ObstacleFluidCoupling;
  kinematicObstacles: KinematicObstacle[];
} {
  const manager = new FluidObstacleManager();
  const coupling = new ObstacleFluidCoupling();
  const kinematicObstacles: KinematicObstacle[] = [];

  // Add static obstacles
  if (config.staticBoxes) {
    for (const box of config.staticBoxes) {
      manager.addBoxObstacle(box.center, box.size, box.rotation);
    }
  }

  if (config.staticSpheres) {
    for (const sphere of config.staticSpheres) {
      manager.addSphereObstacle(sphere.center, sphere.radius);
    }
  }

  if (config.staticCylinders) {
    for (const cyl of config.staticCylinders) {
      manager.addCylinderObstacle(cyl.center, cyl.radius, cyl.height, cyl.axis);
    }
  }

  // Add terrain if provided
  if (config.terrainMesh) {
    manager.addTerrainObstacle(config.terrainMesh, config.terrainResolution ?? 32);
  }

  // Add kinematic obstacles
  if (config.kinematicMeshes) {
    for (const km of config.kinematicMeshes) {
      const obstacle = new FluidObstacle(km.mesh);
      obstacle.voxelizeSDF(km.resolution ?? 16);
      const kinematic = new KinematicObstacle(obstacle);
      if (km.keyframes) {
        kinematic.setTrajectory(km.keyframes, km.loop ?? true);
      }
      kinematicObstacles.push(kinematic);
    }
  }

  // Couple obstacles to solver
  coupling.coupleObstacleToSolver(
    manager.getAllObstacles(),
    solver,
    config.couplingConfig,
  );

  return { manager, coupling, kinematicObstacles };
}

/**
 * Configuration for the convenience setup function.
 */
export interface ObstacleFluidSetupConfig {
  /** Static box obstacles */
  staticBoxes?: Array<{
    center: THREE.Vector3;
    size: THREE.Vector3;
    rotation?: THREE.Quaternion;
  }>;
  /** Static sphere obstacles */
  staticSpheres?: Array<{
    center: THREE.Vector3;
    radius: number;
  }>;
  /** Static cylinder obstacles */
  staticCylinders?: Array<{
    center: THREE.Vector3;
    radius: number;
    height: number;
    axis?: THREE.Vector3;
  }>;
  /** Terrain mesh for terrain obstacle */
  terrainMesh?: THREE.Mesh;
  /** Terrain voxelization resolution */
  terrainResolution?: number;
  /** Kinematic animated obstacles */
  kinematicMeshes?: Array<{
    mesh: THREE.Mesh;
    resolution?: number;
    keyframes?: KinematicKeyframe[];
    loop?: boolean;
  }>;
  /** Coupling configuration */
  couplingConfig?: ObstacleCouplingConfig;
}
